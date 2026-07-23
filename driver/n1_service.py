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
from pathlib import Path
from typing import Any

from PIL import Image, ImageColor, ImageDraw, ImageFont
from StreamDock.Devices.StreamDock import StreamDock
from StreamDock.Devices.StreamDockN1 import StreamDockN1
from StreamDock.InputTypes import EventType
from StreamDock.Transport.LibUSBHIDAPI import LibUSBHIDAPI


VENDOR_ID = 0x5548
PRODUCT_ID = 0x1002
KEY_SIZE = (96, 96)

_stdout_lock = threading.Lock()
_device_lock = threading.RLock()
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


def render_status_icon(kind: int) -> Image.Image:
    colors = ("#f2592f", "#2879ed", "#e5a900")
    labels = ("N1", "01", "☀")
    image = Image.new("RGB", (80, 80), (4, 5, 7))
    draw = ImageDraw.Draw(image)
    color = rgb(colors[kind])
    draw.rounded_rectangle((9, 9, 71, 71), radius=12, fill=color)
    font = find_font(20, bold=True)
    label = labels[kind]
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


def connect() -> StreamDockN1:
    global _device
    with _device_lock:
        if _device is not None:
            return _device

        enumerator = LibUSBHIDAPI()
        devices = enumerator.enumerate_devices(VENDOR_ID, PRODUCT_ID)
        if not devices:
            raise RuntimeError("N1 USB device 5548:1002 was not found")

        info = devices[0]
        native_info = LibUSBHIDAPI.create_device_info_from_dict(info)
        transport = LibUSBHIDAPI(native_info)
        device = StreamDockN1(transport, info)
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
        if _device is None:
            return
        try:
            _device.close(notify=False)
        finally:
            _device = None


def sync_layout(payload: dict[str, Any]) -> dict[str, Any]:
    device = connect()
    keys = list(payload.get("keys") or [])[:15]
    brightness = max(0, min(100, int(payload.get("brightness", 86))))

    with _device_lock, tempfile.TemporaryDirectory(prefix="n1-controller-studio-") as temp_dir:
        temp_path = Path(temp_dir)
        written = 0
        for index in range(1, 16):
            key = keys[index - 1] if index - 1 < len(keys) else None
            if key:
                icon_path = temp_path / f"key-{index:02d}.jpg"
                render_key(key).save(icon_path, "JPEG", quality=95, subsampling=0)
                result = device.set_key_image(index, str(icon_path))
                if result not in (None, 0):
                    raise RuntimeError(f"Image transfer failed for key {index}: {result}")
                written += 1
            else:
                device.clearIcon(index)

        for status_index in range(3):
            icon_path = temp_path / f"status-{status_index}.jpg"
            render_status_icon(status_index).save(icon_path, "JPEG", quality=95, subsampling=0)
            result = device.set_key_image(16 + status_index, str(icon_path))
            if result not in (None, 0):
                raise RuntimeError(
                    f"Status-strip transfer failed for key {16 + status_index}: {result}"
                )

        device.set_brightness(brightness)
        device.refresh()
    return {"written": written, "brightness": brightness}


def set_brightness(payload: dict[str, Any]) -> dict[str, Any]:
    value = max(0, min(100, int(payload.get("brightness", 86))))
    with _device_lock:
        connect().set_brightness(value)
    return {"brightness": value}


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
        elif command == "shutdown":
            response(request_id, True)
            shutdown()
        else:
            response(request_id, False, error=f"Unknown driver command: {command}")
    except Exception as error:
        emit({"event": "status", "status": "error", "error": str(error)})
        response(request_id, False, error=str(error), errorType=type(error).__name__)


def shutdown(*_: Any) -> None:
    global _running
    _running = False
    close_device()


def main() -> int:
    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    emit({"event": "status", "status": "starting"})

    try:
        connect()
    except Exception as error:
        emit({"event": "status", "status": "error", "error": str(error)})
        if "--probe" in sys.argv:
            return 1

    if "--probe" in sys.argv:
        close_device()
        return 0

    while _running:
        line = sys.stdin.readline()
        if not line:
            break
        try:
            handle_command(json.loads(line))
        except json.JSONDecodeError as error:
            emit({"event": "log", "level": "error", "message": f"Invalid JSON: {error}"})

    shutdown()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
