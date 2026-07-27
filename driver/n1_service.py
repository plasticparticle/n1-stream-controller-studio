#!/usr/bin/env python3
"""Linux bridge between N1 Stream Controller Studio and the StreamDock Device SDK."""

from __future__ import annotations

import fcntl
import io
import json
import math
import os
import select
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
_instance_lock_fd: int | None = None


def emit(payload: dict[str, Any]) -> None:
    with _stdout_lock:
        print(json.dumps(payload, separators=(",", ":")), flush=True)


def response(request_id: str | int | None, ok: bool, **payload: Any) -> None:
    emit({"id": request_id, "ok": ok, **payload})


def instance_lock_path() -> Path:
    runtime_dir = Path(
        os.environ.get("XDG_RUNTIME_DIR") or tempfile.gettempdir()
    )
    return runtime_dir / f"n1-stream-controller-studio-{os.getuid()}.lock"


def acquire_instance_lock(path: Path | None = None, blocking: bool = True) -> int:
    lock_path = path or instance_lock_path()
    flags = os.O_CREAT | os.O_RDWR | getattr(os, "O_CLOEXEC", 0)
    flags |= getattr(os, "O_NOFOLLOW", 0)
    descriptor = os.open(lock_path, flags, 0o600)
    try:
        os.fchmod(descriptor, 0o600)
        operation = fcntl.LOCK_EX | (0 if blocking else fcntl.LOCK_NB)
        fcntl.flock(descriptor, operation)
        os.ftruncate(descriptor, 0)
        os.write(descriptor, f"{os.getpid()}\n".encode())
        return descriptor
    except Exception:
        os.close(descriptor)
        raise


def release_instance_lock() -> None:
    global _instance_lock_fd
    descriptor = _instance_lock_fd
    _instance_lock_fd = None
    if descriptor is None:
        return
    try:
        fcntl.flock(descriptor, fcntl.LOCK_UN)
    finally:
        os.close(descriptor)


def process_parent_pid(pid: int, proc_root: Path = Path("/proc")) -> int | None:
    try:
        status = (proc_root / str(pid) / "status").read_text(encoding="utf-8")
    except OSError:
        return None
    for line in status.splitlines():
        if line.startswith("PPid:"):
            try:
                return int(line.split(":", 1)[1].strip())
            except ValueError:
                return None
    return None


def process_name(pid: int, proc_root: Path = Path("/proc")) -> str:
    try:
        return (proc_root / str(pid) / "comm").read_text(encoding="utf-8").strip()
    except OSError:
        return ""


def find_studio_owner(
    start_pid: int | None = None, proc_root: Path = Path("/proc")
) -> int | None:
    current = start_pid if start_pid is not None else os.getppid()
    for _ in range(16):
        if current <= 1:
            return None
        if process_name(current, proc_root).startswith("n1-stream-contr"):
            return current
        parent = process_parent_pid(current, proc_root)
        if parent is None or parent == current:
            return None
        current = parent
    return None


def monitor_studio_owner(owner_pid: int) -> None:
    while _running and not _device_monitor_stop.wait(0.5):
        if not process_name(owner_pid).startswith("n1-stream-contr"):
            emit(
                {
                    "event": "log",
                    "level": "warning",
                    "message": "Studio owner exited; stopping orphaned N1 driver",
                }
            )
            shutdown()
            return


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
    if icon == "screenshotFull":
        draw.line((28, 29, 28, 20, 37, 20), fill=bright, width=3)
        draw.line((59, 20, 68, 20, 68, 29), fill=bright, width=3)
        draw.line((28, 45, 28, 54, 37, 54), fill=bright, width=3)
        draw.line((59, 54, 68, 54, 68, 45), fill=bright, width=3)
        draw.ellipse((41, 30, 55, 44), outline=bright, width=3)
    elif icon == "screenshotArea":
        draw.line((27, 29, 27, 20, 36, 20), fill=bright, width=3)
        draw.line((60, 20, 69, 20, 69, 29), fill=bright, width=3)
        draw.line((27, 45, 27, 54, 36, 54), fill=bright, width=3)
        draw.line((60, 54, 69, 54, 69, 45), fill=bright, width=3)
        for x in range(36, 61, 7):
            draw.line((x, 29, min(x + 3, 60), 29), fill=bright, width=2)
            draw.line((x, 46, min(x + 3, 60), 46), fill=bright, width=2)
        for y in range(29, 47, 6):
            draw.line((36, y, 36, min(y + 3, 46)), fill=bright, width=2)
            draw.line((60, y, 60, min(y + 3, 46)), fill=bright, width=2)
    elif icon == "screenshotWindow":
        draw.rounded_rectangle((25, 19, 71, 55), radius=5, outline=bright, width=3)
        draw.line((25, 29, 71, 29), fill=bright, width=2)
        draw.ellipse((31, 23, 34, 26), fill=bright)
        draw.ellipse((37, 23, 40, 26), fill=bright)
        draw.rectangle((34, 35, 62, 49), outline=bright, width=2)
    elif icon == "codexAgent":
        points = ((48, 18), (62, 25), (68, 39), (61, 53), (46, 57), (33, 49), (28, 35), (36, 22))
        draw.line((*points, points[0]), fill=bright, width=3, joint="curve")
        draw.ellipse((38, 28, 58, 48), outline=bright, width=3)
        draw.line((48, 18, 38, 28, 33, 49, 46, 57), fill=bright, width=2)
        draw.line((62, 25, 58, 48, 61, 53), fill=bright, width=2)
    elif icon == "claudeAgent":
        for endpoint in ((48, 17), (48, 57), (28, 37), (68, 37), (33, 22), (63, 52), (63, 22), (33, 52)):
            draw.line((48, 37, *endpoint), fill=bright, width=3)
        draw.ellipse((42, 31, 54, 43), fill=bright)
    elif icon == "geminiAgent":
        draw.polygon(((48, 16), (54, 31), (70, 37), (54, 43), (48, 58), (42, 43), (26, 37), (42, 31)), outline=bright)
        draw.line((48, 16, 48, 58), fill=bright, width=3)
        draw.line((26, 37, 70, 37), fill=bright, width=3)
    elif icon == "resume":
        draw.arc((28, 18, 68, 58), 35, 315, fill=bright, width=4)
        draw.polygon(((27, 24), (38, 22), (34, 33)), fill=bright)
        draw.line((48, 27, 48, 38, 57, 43), fill=bright, width=3)
    elif icon == "plan":
        for y in (25, 37, 49):
            draw.line((31, y, 35, y + 4, 41, y - 5), fill=bright, width=3)
            draw.line((46, y, 66, y), fill=bright, width=3)
    elif icon == "build":
        draw.polygon(((31, 48), (55, 24), (64, 33), (40, 57), (29, 58)), outline=bright)
        draw.line((51, 28, 60, 37), fill=bright, width=3)
        draw.line((31, 20, 43, 20), fill=bright, width=3)
        draw.line((37, 14, 37, 26), fill=bright, width=3)
    elif icon == "bug":
        draw.rounded_rectangle((36, 24, 60, 55), radius=10, outline=bright, width=3)
        draw.line((40, 24, 40, 19, 45, 16), fill=bright, width=2)
        draw.line((56, 24, 56, 19, 51, 16), fill=bright, width=2)
        draw.line((27, 31, 36, 34), fill=bright, width=3)
        draw.line((60, 34, 69, 31), fill=bright, width=3)
        draw.line((27, 48, 36, 45), fill=bright, width=3)
        draw.line((60, 45, 69, 48), fill=bright, width=3)
        draw.line((48, 30, 48, 53), fill=bright, width=2)
    elif icon == "test":
        draw.line((40, 17, 56, 17), fill=bright, width=3)
        draw.line((43, 17, 43, 29, 31, 52), fill=bright, width=3)
        draw.line((53, 17, 53, 29, 65, 52), fill=bright, width=3)
        draw.arc((30, 43, 66, 60), 0, 180, fill=bright, width=3)
        draw.line((35, 44, 61, 44), fill=bright, width=2)
    elif icon == "review":
        draw.rectangle((29, 18, 55, 56), outline=bright, width=3)
        draw.line((35, 28, 49, 28), fill=bright, width=2)
        draw.line((35, 36, 47, 36), fill=bright, width=2)
        draw.ellipse((48, 36, 66, 54), outline=bright, width=3)
        draw.line((62, 51, 69, 58), fill=bright, width=3)
    elif icon == "refactor":
        draw.line((29, 27, 63, 27), fill=bright, width=3)
        draw.polygon(((63, 21), (70, 27), (63, 33)), fill=bright)
        draw.line((67, 48, 33, 48), fill=bright, width=3)
        draw.polygon(((33, 42), (26, 48), (33, 54)), fill=bright)
    elif icon == "explain":
        draw.rounded_rectangle((27, 19, 69, 50), radius=6, outline=bright, width=3)
        draw.polygon(((34, 49), (34, 58), (46, 50)), fill=bright)
        draw.line((35, 29, 61, 29), fill=bright, width=2)
        draw.line((35, 38, 54, 38), fill=bright, width=2)
    elif icon == "docs":
        draw.polygon(((32, 17), (56, 17), (66, 27), (66, 57), (32, 57)), outline=bright)
        draw.line((56, 17, 56, 28, 66, 28), fill=bright, width=3)
        draw.line((39, 37, 59, 37), fill=bright, width=2)
        draw.line((39, 45, 59, 45), fill=bright, width=2)
    elif icon == "ship":
        draw.polygon(((48, 15), (66, 43), (48, 59), (30, 43)), outline=bright)
        draw.line((48, 15, 48, 59), fill=bright, width=3)
        draw.line((30, 43, 66, 43), fill=bright, width=3)
    elif icon in {"record", "mic"}:
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
    elif icon in {"music", "sound", "volume"}:
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


FALLBACK_WAVEFORM = (
    0.18, 0.34, 0.48, 0.30, 0.70, 0.42, 0.86, 0.56,
    0.38, 0.72, 0.94, 0.48, 0.28, 0.62, 0.82, 0.40,
    0.68, 0.90, 0.52, 0.32, 0.74, 0.58, 0.88, 0.46,
    0.26, 0.54, 0.78, 0.44, 0.64, 0.36, 0.58, 0.24,
)


def sound_peaks(key: dict[str, Any]) -> list[float]:
    sound = key.get("sound") if isinstance(key.get("sound"), dict) else {}
    waveform = sound.get("waveform")
    if not isinstance(waveform, list) or not 8 <= len(waveform) <= 64:
        return list(FALLBACK_WAVEFORM)
    peaks: list[float] = []
    for value in waveform:
        try:
            peak = float(value)
        except (TypeError, ValueError):
            return list(FALLBACK_WAVEFORM)
        if not math.isfinite(peak):
            return list(FALLBACK_WAVEFORM)
        peaks.append(max(0.08, min(1.0, peak)))
    return peaks


def render_sound_key(
    key: dict[str, Any], playing: bool = False, progress: float = 0.0
) -> Image.Image:
    base = rgb(key.get("color", "#37b7ff"))
    progress = max(0.0, min(1.0, float(progress)))
    image = Image.new("RGB", KEY_SIZE)
    pixels = image.load()
    for y in range(KEY_SIZE[1]):
        vertical = y / (KEY_SIZE[1] - 1)
        factor = (0.42 - vertical * 0.16) if playing else (0.15 - vertical * 0.06)
        for x in range(KEY_SIZE[0]):
            glow = max(0.0, 1.0 - abs(x - 48) / 58) * (0.12 if playing else 0.025)
            pixels[x, y] = tuple(
                max(3, min(255, int(channel * (factor + glow)))) for channel in base
            )

    draw = ImageDraw.Draw(image)
    bright = tuple(min(255, int(channel * 0.7) + 92) for channel in base)
    dim = tuple(max(46, int(channel * 0.38)) for channel in base)
    peaks = sound_peaks(key)
    left, right = 9, 87
    center_y = 43
    played_x = left + int((right - left) * progress)
    for index, peak in enumerate(peaks):
        x = left + int((right - left) * (index + 0.5) / len(peaks))
        height = max(2, int(peak * 18))
        color = bright if playing and x <= played_x else dim
        draw.line((x, center_y - height, x, center_y + height), fill=color, width=2)

    timeline_y = 65
    draw.line((left, timeline_y, right, timeline_y), fill=(92, 104, 108), width=1)
    if playing:
        draw.line((left, timeline_y, played_x, timeline_y), fill=(244, 255, 230), width=2)
        draw.line((played_x, 20, played_x, 68), fill=(250, 255, 240), width=2)
        draw.ellipse((7, 8, 13, 14), fill=(217, 250, 68))
        status_font = find_font(8, bold=True)
        status = "LOOP" if key.get("soundLoop") is True else "PLAY"
        draw.text((17, 6), status, font=status_font, fill=(238, 246, 229))

    draw.rounded_rectangle(
        (2, 2, 93, 93),
        radius=10,
        outline=bright if playing else (48, 53, 57),
        width=2,
    )
    title, font = fit_text(draw, str(key.get("title", "")), 82)
    text_box = draw.textbbox((0, 0), title, font=font)
    text_width = text_box[2] - text_box[0]
    draw.text(((96 - text_width) / 2, 74), title, font=font, fill=(247, 250, 242))
    return image


def render_key(key: dict[str, Any]) -> Image.Image:
    if key.get("id") == "sound" and isinstance(key.get("sound"), dict):
        return render_sound_key(key)
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
    if key.get("agentMonitor"):
        active = key.get("agentActive") is True
        dot = tuple(min(255, channel + 85) for channel in base) if active else (57, 66, 70)
        draw.ellipse((77, 8, 87, 18), fill=dot, outline=(205, 214, 208), width=1)
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


def load_sound_frames(
    key: dict[str, Any], maximum_frames: int = 60
) -> tuple[list[bytes], list[int]]:
    sound = key.get("sound") if isinstance(key.get("sound"), dict) else {}
    try:
        duration = float(sound.get("duration") or 2.4)
    except (TypeError, ValueError):
        duration = 2.4
    if not math.isfinite(duration):
        duration = 2.4
    duration = max(0.1, min(86_400.0, duration))
    frame_count = max(6, min(maximum_frames, math.ceil(duration * 10)))
    # The SDK schedules these delays in-process and accepts long intervals, so the
    # full animation cycle stays aligned even for long ambience loops.
    delay = max(60, round(duration * 1_000 / frame_count))
    frames: list[bytes] = []
    for frame_number in range(frame_count):
        progress = frame_number / frame_count
        stream = io.BytesIO()
        render_sound_key(key, playing=True, progress=progress).save(
            stream, "JPEG", quality=90, subsampling=0
        )
        frames.append(stream.getvalue())
    return frames, [delay] * frame_count


def apply_key_visual(
    device: StreamDockN1,
    index: int,
    key: dict[str, Any],
    temp_path: Path,
    secondary: bool = False,
) -> bool:
    is_configured_sound = (
        key.get("id") == "sound" and isinstance(key.get("sound"), dict)
    )
    visual = None if is_configured_sound else visual_for_key(key, secondary)
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


def apply_sound_visual(
    device: StreamDockN1,
    index: int,
    key: dict[str, Any],
    temp_path: Path,
    playing: bool,
    secondary: bool = False,
) -> bool:
    if not playing:
        return apply_key_visual(device, index, key, temp_path, secondary)

    device.clear_key_gif(index)
    frames, delays = load_sound_frames(key)
    first_frame_path = temp_path / f"key-{index:02d}-sound.jpg"
    first_frame_path.write_bytes(frames[0])
    result = device.set_key_image(index, str(first_frame_path))
    if result != 0:
        raise RuntimeError(f"Image transfer failed for key {index}: {result}")
    result = device.set_key_gif_stream(frames, delays, index)
    if result != 0:
        raise RuntimeError(f"Sound animation setup failed for key {index}: {result}")
    return True


def status_label(kind: int, page_number: int = 1, profile_name: str = "N1") -> str:
    return (profile_name, f"{page_number:02d}", "☀")[kind]


def profile_status_lines(profile_name: str) -> list[str]:
    normalized = " ".join(str(profile_name or "PROFILE").upper().split())
    words = normalized.split()
    if len(normalized) <= 10:
        return [normalized]
    if len(words) > 1:
        best_split = min(
            range(1, len(words)),
            key=lambda index: abs(
                len(" ".join(words[:index])) - len(" ".join(words[index:]))
            ),
        )
        return [
            " ".join(words[:best_split])[:14],
            " ".join(words[best_split:])[:14],
        ]
    return [normalized[:11] + ("…" if len(normalized) > 11 else "")]


def render_profile_status(profile_name: str) -> Image.Image:
    image = Image.new("RGB", (80, 80), (4, 7, 10))
    draw = ImageDraw.Draw(image)
    accent = rgb("#f2592f")
    draw.rounded_rectangle(
        (5, 5, 74, 74),
        radius=12,
        fill=(9, 14, 19),
        outline=(83, 43, 32),
        width=2,
    )
    draw.rounded_rectangle((10, 11, 13, 26), radius=2, fill=accent)
    draw.text((18, 10), "PROFILE", font=find_font(8, bold=True), fill=(239, 118, 80))

    lines = profile_status_lines(profile_name)
    font_size = 17 if len(lines) == 1 else 14
    while font_size > 9:
        font = find_font(font_size, bold=True)
        if all(
            draw.textbbox((0, 0), line, font=font)[2]
            - draw.textbbox((0, 0), line, font=font)[0]
            <= 62
            for line in lines
        ):
            break
        font_size -= 1
    font = find_font(font_size, bold=True)
    line_height = font_size + 3
    top = 39 - (line_height * len(lines)) / 2
    for index, line in enumerate(lines):
        box = draw.textbbox((0, 0), line, font=font)
        width = box[2] - box[0]
        draw.text(
            ((80 - width) / 2, top + index * line_height),
            line,
            font=font,
            fill=(244, 248, 241),
        )
    draw.line((17, 68, 63, 68), fill=(52, 61, 66), width=1)
    draw.ellipse((37, 66, 42, 71), fill=accent)
    return image


def render_status_icon(
    kind: int, page_number: int = 1, profile_name: str = "N1"
) -> Image.Image:
    if kind == 0:
        return render_profile_status(profile_name)
    colors = ("#f2592f", "#2879ed", "#e5a900")
    image = Image.new("RGB", (80, 80), (4, 5, 7))
    draw = ImageDraw.Draw(image)
    color = rgb(colors[kind])
    draw.rounded_rectangle((9, 9, 71, 71), radius=12, fill=color)
    font = find_font(20, bold=True)
    label = status_label(kind, page_number, profile_name)
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


def initialize_n1_device(device: StreamDockN1) -> None:
    # This legacy USB identity must receive N1 report geometry before Dock mode.
    # The full SDK initialization that follows is also required: wakeScreen alone
    # accepts image transfers but leaves the LCD framebuffer inactive until a
    # later refresh, which makes a first startup sync appear successful and black.
    device.set_device()
    device.transport.switchMode(2)
    device.init()


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

            initialize_n1_device(device)
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
    profile_name = str(payload.get("profileName") or payload.get("profile") or "Profile")

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
            render_status_icon(status_index, page_number, profile_name).save(
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


def _set_sound_state_once(payload: dict[str, Any]) -> dict[str, Any]:
    index = int(payload.get("key") or 0)
    if index not in range(1, 16):
        raise ValueError("Sound state index must be between 1 and 15")
    key = payload.get("config")
    if not isinstance(key, dict) or key.get("id") != "sound":
        raise ValueError("Sound state requires a Play Sound key configuration")
    playing = bool(payload.get("playing"))
    secondary = bool(payload.get("secondary"))

    with _device_lock, tempfile.TemporaryDirectory(prefix="n1-sound-state-") as temp_dir:
        device = connect()
        require_writable(device)
        animated = apply_sound_visual(
            device, index, key, Path(temp_dir), playing, secondary
        )
        device.refresh()
        device.start_gif_loop()
    return {"key": index, "playing": playing, "animated": animated}


def set_sound_state(payload: dict[str, Any]) -> dict[str, Any]:
    return run_with_reconnect(lambda: _set_sound_state_once(payload))


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
        elif command == "sound_state":
            response(request_id, True, **set_sound_state(message.get("payload") or {}))
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


def handle_termination(*_: Any) -> None:
    shutdown()
    raise SystemExit(0)


def main() -> int:
    global _instance_lock_fd, _running
    _running = True
    _device_monitor_stop.clear()
    signal.signal(signal.SIGTERM, handle_termination)
    signal.signal(signal.SIGINT, handle_termination)
    emit({"event": "status", "status": "starting"})

    owner_pid = None
    if getattr(sys, "frozen", False) and "--probe" not in sys.argv:
        owner_pid = find_studio_owner()
        if owner_pid is None:
            emit(
                {
                    "event": "status",
                    "status": "error",
                    "error": "Bundled N1 driver has no live Studio owner",
                }
            )
            return 1

    is_probe = "--probe" in sys.argv
    try:
        _instance_lock_fd = acquire_instance_lock(blocking=not is_probe)
    except BlockingIOError:
        emit(
            {
                "event": "status",
                "status": "ready",
                "message": "N1 transport is owned by the running Controller Studio",
            }
        )
        return 0
    except Exception as error:
        emit({"event": "status", "status": "error", "error": str(error)})
        return 1

    try:
        connect()
    except Exception as error:
        emit({"event": "status", "status": status_for_error(error), "error": str(error)})
        if is_probe:
            release_instance_lock()
            return 1

    if is_probe:
        close_device()
        release_instance_lock()
        return 0

    owner_monitor = None
    if owner_pid is not None:
        owner_monitor = threading.Thread(
            target=monitor_studio_owner,
            args=(owner_pid,),
            name="n1-studio-owner-monitor",
            daemon=True,
        )
        owner_monitor.start()
    monitor = threading.Thread(target=monitor_device, name="n1-device-monitor", daemon=True)
    monitor.start()

    try:
        while _running:
            readable, _, _ = select.select([sys.stdin], [], [], 0.5)
            if not readable:
                continue
            line = sys.stdin.readline()
            if not line:
                break
            try:
                handle_command(json.loads(line))
            except json.JSONDecodeError as error:
                emit({"event": "log", "level": "error", "message": f"Invalid JSON: {error}"})
    finally:
        shutdown()
        monitor.join(timeout=2.0)
        if owner_monitor is not None:
            owner_monitor.join(timeout=1.0)
        release_instance_lock()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
