#!/usr/bin/env python3
"""Linux bridge between N1 Stream Controller Studio and the StreamDock Device SDK."""

from __future__ import annotations

import io
import json
import os
import signal
import sys
import tempfile
import threading
import time
from pathlib import Path
from typing import Any

from PIL import Image, ImageColor, ImageDraw, ImageFont, ImageOps, ImageSequence
from StreamDock.Devices.StreamDock import StreamDock
from StreamDock.Devices.StreamDockN1 import StreamDockN1
from StreamDock.InputTypes import EventType
from StreamDock.Transport.LibUSBHIDAPI import LibUSBHIDAPI


VENDOR_ID = 0x5548
PRODUCT_ID = 0x1002
KEY_SIZE = (96, 96)
USB_SYSFS_ROOT = Path(os.environ.get("STREAMCTRL_USB_SYSFS", "/sys/bus/usb/devices"))
DEVICE_MONITOR_INTERVAL = 1.0
RECONNECT_TIMEOUT = 8.0

_stdout_lock = threading.Lock()
_device_lock = threading.RLock()
_device_monitor_stop = threading.Event()
_running = True
_device: StreamDockN1 | None = None


def emit(payload: dict[str, Any]) -> None:
    with _stdout_lock:
        print(json.dumps(payload, separators=(",", ":")), flush=True)


def response(request_id: str | int | None, ok: bool, **payload: Any) -> None:
    emit({"id": request_id, "ok": ok, **payload})


def find_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    names = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
        if bold
        else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf"
        if bold
        else "/usr/share/fonts/TTF/DejaVuSans.ttf",
    ]
    for name in names:
        if Path(name).exists():
            return ImageFont.truetype(name, size)
    return ImageFont.load_default()


def rgb(hex_color: str, fallback: str = "#37b7ff") -> tuple[int, int, int]:
    try:
        return ImageColor.getrgb(hex_color)
    except (ValueError, TypeError):
        return ImageColor.getrgb(fallback)


def fit_text(draw: ImageDraw.ImageDraw, text: str, max_width: int) -> tuple[str, Any]:
    normalized = " ".join(str(text or "").upper().split())
    for size in range(13, 7, -1):
        font = find_font(size, bold=True)
        candidate = normalized
        while candidate and draw.textbbox((0, 0), candidate, font=font)[2] > max_width:
            candidate = candidate[:-1]
        if candidate:
            if candidate != normalized and len(candidate) > 1:
                candidate = candidate[:-1] + "…"
            return candidate, font
    return normalized[:8], find_font(8, bold=True)


def draw_symbol(draw: ImageDraw.ImageDraw, icon: str, color: tuple[int, int, int]) -> None:
    cx, cy = 48, 37
    bright = tuple(min(255, channel + 55) for channel in color)
    if icon in {"record", "mic"}:
        draw.ellipse((34, 23, 62, 51), outline=bright, width=4)
        draw.ellipse((43, 32, 53, 42), fill=bright)
    elif icon in {"camera", "monitor"}:
        draw.rounded_rectangle((29, 24, 67, 51), radius=5, outline=bright, width=4)
        draw.ellipse((42, 31, 54, 43), outline=bright, width=3)
    elif icon in {"terminal", "hotkey", "keyboard"}:
        draw.rounded_rectangle((27, 23, 69, 52), radius=5, outline=bright, width=3)
        draw.line((35, 32, 42, 38, 35, 44), fill=bright, width=3)
        draw.line((47, 44, 58, 44), fill=bright, width=3)
    elif icon in {"folder"}:
        draw.rounded_rectangle((26, 29, 70, 54), radius=4, outline=bright, width=4)
        draw.polygon(((28, 29), (38, 22), (52, 22), (58, 29)), fill=bright)
    elif icon in {"music", "volume"}:
        draw.ellipse((29, 43, 40, 54), fill=bright)
        draw.ellipse((53, 39, 64, 50), fill=bright)
        draw.line((39, 47, 39, 24, 63, 20, 63, 44), fill=bright, width=4)
    elif icon in {"lock"}:
        draw.rounded_rectangle((31, 34, 65, 57), radius=4, outline=bright, width=4)
        draw.arc((36, 19, 60, 44), 180, 360, fill=bright, width=4)
    elif icon in {"web"}:
        draw.ellipse((29, 18, 67, 56), outline=bright, width=3)
        draw.line((29, 37, 67, 37), fill=bright, width=2)
        draw.arc((39, 18, 57, 56), 90, 270, fill=bright, width=2)
        draw.arc((39, 18, 57, 56), 270, 90, fill=bright, width=2)
    else:
        draw.rounded_rectangle((31, 20, 65, 55), radius=8, outline=bright, width=4)
        draw.line((48, 29, 48, 46), fill=bright, width=3)


def render_key(key: dict[str, Any]) -> Image.Image:
    base = rgb(key.get("color", "#37b7ff"))
    image = Image.new("RGB", KEY_SIZE, tuple(max(3, int(channel * 0.08)) for channel in base))
    draw = ImageDraw.Draw(image)

    for radius in range(48, 5, -1):
        factor = (48 - radius) / 48
        shade = tuple(
            max(0, min(255, int(channel * (0.12 + factor * 0.34)))) for channel in base
        )
        draw.ellipse((48 - radius, 31 - radius, 48 + radius, 31 + radius), fill=shade)

    draw.rounded_rectangle((2, 2, 93, 93), radius=10, outline=(48, 53, 57), width=2)
    draw_symbol(draw, str(key.get("icon", "app")), base)
    title, font = fit_text(draw, str(key.get("title", "")), 82)
    text_box = draw.textbbox((0, 0), title, font=font)
    text_width = text_box[2] - text_box[0]
    draw.text(((96 - text_width) / 2, 69), title, font=font, fill=(242, 244, 239))
    return image


def custom_icon_frame(frame: Image.Image, key: dict[str, Any]) -> Image.Image:
    fitted = ImageOps.fit(
        frame.convert("RGBA"),
        KEY_SIZE,
        method=Image.Resampling.LANCZOS,
        centering=(0.5, 0.5),
    )
    background = Image.new("RGBA", KEY_SIZE, (3, 5, 6, 255))
    image = Image.alpha_composite(background, fitted).convert("RGB")
    title = str(key.get("title") or "").strip()
    if not title:
        return image

    draw = ImageDraw.Draw(image, "RGBA")
    draw.rectangle((0, 66, 96, 96), fill=(2, 4, 5, 184))
    label, font = fit_text(draw, title, 82)
    box = draw.textbbox((0, 0), label, font=font)
    draw.text(
        ((96 - (box[2] - box[0])) / 2, 74),
        label,
        font=font,
        fill=(248, 250, 247, 255),
    )
    return image


def visual_for_key(key: dict[str, Any], secondary: bool = False) -> dict[str, Any] | None:
    visuals = key.get("visuals") if isinstance(key.get("visuals"), dict) else {}
    primary = visuals.get("primary") if isinstance(visuals.get("primary"), dict) else None
    alternate = (
        visuals.get("secondary") if isinstance(visuals.get("secondary"), dict) else None
    )
    return (alternate or primary) if secondary else primary


def load_visual_frames(
    visual: dict[str, Any], key: dict[str, Any], maximum_frames: int = 120
) -> tuple[list[bytes], list[int]]:
    image_path = Path(str(visual.get("path") or ""))
    if not image_path.is_file():
        raise RuntimeError(f"Icon file does not exist: {visual.get('name') or image_path.name}")

    encoded_frames: list[bytes] = []
    delays: list[int] = []
    with Image.open(image_path) as source:
        for frame_number, frame in enumerate(ImageSequence.Iterator(source)):
            if frame_number >= maximum_frames:
                break
            native_frame = custom_icon_frame(frame, key)
            stream = io.BytesIO()
            native_frame.save(stream, "JPEG", quality=95, subsampling=0)
            encoded_frames.append(stream.getvalue())
            delays.append(max(60, min(2_000, int(frame.info.get("duration") or 100))))

    if not encoded_frames:
        raise RuntimeError(f"Icon has no readable frames: {visual.get('name') or image_path.name}")
    return encoded_frames, delays


def apply_key_visual(
    device: StreamDockN1,
    index: int,
    key: dict[str, Any],
    temp_path: Path,
    secondary: bool = False,
) -> bool:
    visual = visual_for_key(key, secondary)
    device.clear_key_gif(index)

    if visual:
        frames, delays = load_visual_frames(visual, key)
        first_frame_path = temp_path / f"key-{index:02d}-state.jpg"
        first_frame_path.write_bytes(frames[0])
        result = device.set_key_image(index, str(first_frame_path))
        if result != 0:
            raise RuntimeError(f"Image transfer failed for key {index}: {result}")
        if len(frames) > 1:
            result = device.set_key_gif_stream(frames, delays, index)
            if result != 0:
                raise RuntimeError(f"Animation setup failed for key {index}: {result}")
            return True
        return False

    icon_path = temp_path / f"key-{index:02d}-generated.jpg"
    render_key(key).save(icon_path, "JPEG", quality=95, subsampling=0)
    result = device.set_key_image(index, str(icon_path))
    if result != 0:
        raise RuntimeError(f"Image transfer failed for key {index}: {result}")
    return False


def status_label(kind: int, page_number: int = 1) -> str:
    return ("N1", f"{page_number:02d}", "☀")[kind]


def render_status_icon(kind: int, page_number: int = 1) -> Image.Image:
    colors = ("#f2592f", "#2879ed", "#e5a900")
    image = Image.new("RGB", (80, 80), (4, 5, 7))
    draw = ImageDraw.Draw(image)
    color = rgb(colors[kind])
    draw.rounded_rectangle((9, 9, 71, 71), radius=12, fill=color)
    font = find_font(20, bold=True)
    label = status_label(kind, page_number)
    box = draw.textbbox((0, 0), label, font=font)
    draw.text(((80 - (box[2] - box[0])) / 2, 26), label, font=font, fill="white")
    return image


def on_input(device: StreamDockN1, event: Any) -> None:
    payload: dict[str, Any] = {"event": "input"}
    if event.event_type == EventType.BUTTON:
        payload.update(type="button", key=event.key.value, state=event.state)
    elif event.event_type == EventType.KNOB_ROTATE:
        payload.update(type="knob_rotate", knob=event.knob_id.value, direction=event.direction.value)
    elif event.event_type == EventType.KNOB_PRESS:
        payload.update(type="knob_press", knob=event.knob_id.value, state=event.state)
    else:
        return
    emit(payload)


def enumerate_n1_devices() -> list[dict[str, Any]]:
    return LibUSBHIDAPI().enumerate_devices(VENDOR_ID, PRODUCT_ID)


def device_is_present() -> bool:
    if USB_SYSFS_ROOT.is_dir():
        try:
            for device_path in USB_SYSFS_ROOT.iterdir():
                vendor_path = device_path / "idVendor"
                product_path = device_path / "idProduct"
                if not vendor_path.is_file() or not product_path.is_file():
                    continue
                vendor_id = vendor_path.read_text(encoding="utf-8").strip().lower()
                product_id = product_path.read_text(encoding="utf-8").strip().lower()
                if vendor_id == f"{VENDOR_ID:04x}" and product_id == f"{PRODUCT_ID:04x}":
                    return True
            return False
        except OSError:
            pass
    return bool(enumerate_n1_devices())


def connect() -> StreamDockN1:
    global _device
    with _device_lock:
        if _device is not None:
            return _device

        devices = enumerate_n1_devices()
        if not devices:
            raise RuntimeError("N1 USB device 5548:1002 was not found")

        info = devices[0]
        native_info = LibUSBHIDAPI.create_device_info_from_dict(info)
        transport = LibUSBHIDAPI(native_info)
        device = StreamDockN1(transport, info)
        try:
            # Open the HID handle through the base implementation first. The N1 override
            # switches modes immediately, before this legacy USB identity has the N1
            # report geometry configured.
            opened = StreamDock.open(device)
            if not opened or not device.transport.can_write():
                raise PermissionError(
                    f"Unable to open {info.get('path', 'N1 HID interface')}; install the udev rule"
                )

            # The native transport requires an open handle before set_report_size().
            # Select the N1 geometry, then enter Dock mode in that order.
            device.set_device()
            device.transport.switchMode(2)
            device.wakeScreen()
            device.set_key_callback(on_input)
        except Exception:
            try:
                device.close(notify=False)
            except Exception:
                pass
            raise

        _device = device
        emit(
            {
                "event": "status",
                "status": "ready",
                "path": info.get("path"),
                "vendorId": f"{VENDOR_ID:04x}",
                "productId": f"{PRODUCT_ID:04x}",
            }
        )
        return device


def close_device() -> None:
    global _device
    with _device_lock:
        device = _device
        if device is None:
            return
        _device = None
        try:
            device.close(notify=False)
        except Exception as error:
            emit(
                {
                    "event": "log",
                    "level": "warning",
                    "message": f"Error while closing disconnected N1: {error}",
                }
            )


def is_transport_failure(error: Exception) -> bool:
    if isinstance(error, (OSError, PermissionError)):
        return True
    message = str(error).lower()
    return any(
        marker in message
        for marker in (
            "usb device",
            "hid interface",
            "transport",
            "transfer failed",
            "animation setup failed",
            "device was not found",
        )
    )


def status_for_error(error: Exception) -> str:
    if isinstance(error, PermissionError):
        return "error"
    return "disconnected" if is_transport_failure(error) else "error"


def wait_for_connection(timeout: float = RECONNECT_TIMEOUT) -> StreamDockN1:
    deadline = time.monotonic() + timeout
    last_error: Exception | None = None
    while _running and time.monotonic() < deadline:
        try:
            return connect()
        except Exception as error:
            last_error = error
            _device_monitor_stop.wait(0.25)
    if last_error is not None:
        raise last_error
    raise RuntimeError("N1 reconnection was cancelled")


def run_with_reconnect(operation: Any) -> Any:
    try:
        return operation()
    except Exception as error:
        if not is_transport_failure(error):
            raise
        emit({"event": "status", "status": "reconnecting", "error": str(error)})
        close_device()
        try:
            wait_for_connection()
            return operation()
        except Exception as reconnect_error:
            close_device()
            if isinstance(reconnect_error, PermissionError):
                raise
            raise RuntimeError(
                f"N1 disconnected; automatic reconnection is waiting for USB: {reconnect_error}"
            ) from reconnect_error


def require_writable(device: StreamDockN1) -> None:
    if not device.transport.can_write():
        raise RuntimeError("N1 HID transport is not writable")


def monitor_device() -> None:
    last_present: bool | None = None
    last_error = ""
    while _running and not _device_monitor_stop.is_set():
        try:
            present = device_is_present()
            if not present:
                if last_present is not False or _device is not None:
                    emit(
                        {
                            "event": "status",
                            "status": "disconnected",
                            "error": "N1 USB device 5548:1002 is disconnected",
                        }
                    )
                    close_device()
                last_error = ""
            elif _device is None:
                try:
                    connect()
                    last_error = ""
                except Exception as error:
                    message = str(error)
                    if message != last_error:
                        status = "error" if isinstance(error, PermissionError) else "reconnecting"
                        emit({"event": "status", "status": status, "error": message})
                        last_error = message
            last_present = present
        except Exception as error:
            message = str(error)
            if message != last_error:
                emit({"event": "status", "status": "reconnecting", "error": message})
                last_error = message
        _device_monitor_stop.wait(DEVICE_MONITOR_INTERVAL)


def _sync_layout_once(payload: dict[str, Any]) -> dict[str, Any]:
    device = connect()
    require_writable(device)
    keys = list(payload.get("keys") or [])[:15]
    brightness = max(0, min(100, int(payload.get("brightness", 86))))
    page_number = max(1, min(99, int(payload.get("page", 1))))

    with _device_lock, tempfile.TemporaryDirectory(prefix="n1-controller-studio-") as temp_dir:
        temp_path = Path(temp_dir)
        written = 0
        animated = 0
        device.stop_gif_loop()
        for index in range(1, 16):
            key = keys[index - 1] if index - 1 < len(keys) else None
            if key:
                if apply_key_visual(device, index, key, temp_path):
                    animated += 1
                written += 1
            else:
                device.clear_key_gif(index)
                device.clearIcon(index)

        for status_index in range(3):
            icon_path = temp_path / f"status-{status_index}.jpg"
            render_status_icon(status_index, page_number).save(
                icon_path, "JPEG", quality=95, subsampling=0
            )
            result = device.set_key_image(16 + status_index, str(icon_path))
            if result != 0:
                raise RuntimeError(
                    f"Status-strip transfer failed for key {16 + status_index}: {result}"
                )

        device.set_brightness(brightness)
        device.refresh()
        device.start_gif_loop()
    return {
        "written": written,
        "animated": animated,
        "brightness": brightness,
        "page": page_number,
    }


def sync_layout(payload: dict[str, Any]) -> dict[str, Any]:
    return run_with_reconnect(lambda: _sync_layout_once(payload))


def _set_key_state_once(payload: dict[str, Any]) -> dict[str, Any]:
    index = int(payload.get("key") or 0)
    if index not in range(1, 16):
        raise ValueError("Key state index must be between 1 and 15")
    key = payload.get("config")
    if not isinstance(key, dict):
        raise ValueError("Key state requires a key configuration")
    secondary = bool(payload.get("secondary"))

    with _device_lock, tempfile.TemporaryDirectory(prefix="n1-key-state-") as temp_dir:
        device = connect()
        require_writable(device)
        animated = apply_key_visual(device, index, key, Path(temp_dir), secondary)
        device.refresh()
        device.start_gif_loop()
    return {"key": index, "secondary": secondary, "animated": animated}


def set_key_state(payload: dict[str, Any]) -> dict[str, Any]:
    return run_with_reconnect(lambda: _set_key_state_once(payload))


def _set_brightness_once(payload: dict[str, Any]) -> dict[str, Any]:
    value = max(0, min(100, int(payload.get("brightness", 86))))
    with _device_lock:
        device = connect()
        require_writable(device)
        device.set_brightness(value)
        device.refresh()
    return {"brightness": value}


def set_brightness(payload: dict[str, Any]) -> dict[str, Any]:
    return run_with_reconnect(lambda: _set_brightness_once(payload))


def _identify_once(payload: dict[str, Any]) -> dict[str, Any]:
    value = max(0, min(100, int(payload.get("brightness", 86))))
    with _device_lock:
        device = connect()
        require_writable(device)
        for _ in range(2):
            device.set_brightness(0)
            device.refresh()
            time.sleep(0.18)
            device.set_brightness(value)
            device.refresh()
            time.sleep(0.18)
    return {"brightness": value, "flashes": 2}


def identify(payload: dict[str, Any]) -> dict[str, Any]:
    return run_with_reconnect(lambda: _identify_once(payload))


def handle_command(message: dict[str, Any]) -> None:
    request_id = message.get("id")
    command = message.get("command")
    try:
        if command == "probe":
            device = connect()
            response(
                request_id,
                True,
                status="ready",
                firmware=device.firmware_version or "",
                serial=device.get_serial_number() or "",
            )
        elif command == "sync":
            response(request_id, True, **sync_layout(message.get("payload") or {}))
        elif command == "brightness":
            response(request_id, True, **set_brightness(message.get("payload") or {}))
        elif command == "identify":
            response(request_id, True, **identify(message.get("payload") or {}))
        elif command == "key_state":
            response(request_id, True, **set_key_state(message.get("payload") or {}))
        elif command == "shutdown":
            response(request_id, True)
            shutdown()
        else:
            response(request_id, False, error=f"Unknown driver command: {command}")
    except Exception as error:
        emit({"event": "status", "status": status_for_error(error), "error": str(error)})
        response(request_id, False, error=str(error), errorType=type(error).__name__)


def shutdown(*_: Any) -> None:
    global _running
    _running = False
    _device_monitor_stop.set()
    close_device()


def main() -> int:
    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    emit({"event": "status", "status": "starting"})

    try:
        connect()
    except Exception as error:
        emit({"event": "status", "status": status_for_error(error), "error": str(error)})
        if "--probe" in sys.argv:
            return 1

    if "--probe" in sys.argv:
        close_device()
        return 0

    monitor = threading.Thread(target=monitor_device, name="n1-device-monitor", daemon=True)
    monitor.start()

    while _running:
        line = sys.stdin.readline()
        if not line:
            break
        try:
            handle_command(json.loads(line))
        except json.JSONDecodeError as error:
            emit({"event": "log", "level": "error", "message": f"Invalid JSON: {error}"})

    shutdown()
    monitor.join(timeout=2.0)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
