import tempfile
import unittest
from pathlib import Path
from unittest.mock import call, patch

from driver import n1_service


class FakeTransport:
    def can_write(self):
        return True


class FakeDevice:
    def __init__(self):
        self.transport = FakeTransport()
        self.calls = []

    def set_brightness(self, value):
        self.calls.append(("brightness", value))

    def refresh(self):
        self.calls.append(("refresh",))

    def clear_key_gif(self, key):
        self.calls.append(("clear_key_gif", key))

    def set_key_image(self, key, path):
        self.calls.append(("set_key_image", key, path))
        return 0


class DriverLifecycleTests(unittest.TestCase):
    def test_driver_lock_allows_only_one_usb_owner(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            lock_path = Path(temp_dir) / "driver.lock"
            descriptor = n1_service.acquire_instance_lock(lock_path, blocking=False)
            try:
                with self.assertRaises(BlockingIOError):
                    n1_service.acquire_instance_lock(lock_path, blocking=False)
            finally:
                n1_service.fcntl.flock(descriptor, n1_service.fcntl.LOCK_UN)
                n1_service.os.close(descriptor)

    def test_finds_live_studio_process_in_driver_ancestry(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            proc_root = Path(temp_dir)
            for pid, name, parent in (
                (300, "n1-driver", 200),
                (200, "n1-stream-contr", 100),
                (100, "systemd", 1),
            ):
                process = proc_root / str(pid)
                process.mkdir()
                (process / "comm").write_text(f"{name}\n", encoding="utf-8")
                (process / "status").write_text(
                    f"Name:\t{name}\nPPid:\t{parent}\n", encoding="utf-8"
                )

            self.assertEqual(
                n1_service.find_studio_owner(300, proc_root),
                200,
            )
            self.assertIsNone(n1_service.find_studio_owner(100, proc_root))

    def test_identifies_only_driver_locks_without_a_live_studio_owner_as_orphaned(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            proc_root = Path(temp_dir) / "proc"
            proc_root.mkdir()
            lock_path = Path(temp_dir) / "driver.lock"
            lock_path.write_text("300\n", encoding="utf-8")

            for pid, name, parent in (
                (300, "n1-driver", 200),
                (200, "n1-stream-contr", 1),
            ):
                process = proc_root / str(pid)
                process.mkdir()
                (process / "comm").write_text(f"{name}\n", encoding="utf-8")
                (process / "status").write_text(
                    f"Name:\t{name}\nPPid:\t{parent}\n", encoding="utf-8"
                )

            self.assertIsNone(
                n1_service.orphaned_driver_owner(lock_path, proc_root)
            )
            (proc_root / "200" / "comm").write_text("dead-studio\n", encoding="utf-8")
            self.assertEqual(
                n1_service.orphaned_driver_owner(lock_path, proc_root),
                300,
            )

    def test_reclaims_an_orphaned_driver_lock_without_blocking_startup(self):
        lock_path = Path("/tmp/test-n1-driver.lock")
        with (
            patch.object(
                n1_service,
                "acquire_instance_lock",
                side_effect=BlockingIOError(),
            ),
            patch.object(n1_service, "orphaned_driver_owner", return_value=300),
            patch.object(n1_service, "wait_for_instance_lock", return_value=42),
            patch.object(n1_service, "emit"),
            patch.object(n1_service.os, "kill") as kill,
        ):
            descriptor = n1_service.acquire_studio_instance_lock(lock_path)

        self.assertEqual(descriptor, 42)
        kill.assert_called_once_with(300, n1_service.signal.SIGTERM)

    def test_force_stops_only_the_same_confirmed_orphan_after_graceful_timeout(self):
        lock_path = Path("/tmp/test-n1-driver.lock")
        with (
            patch.object(
                n1_service,
                "acquire_instance_lock",
                side_effect=BlockingIOError(),
            ),
            patch.object(
                n1_service,
                "orphaned_driver_owner",
                side_effect=[300, 300],
            ),
            patch.object(
                n1_service,
                "wait_for_instance_lock",
                side_effect=[None, 42],
            ),
            patch.object(n1_service, "emit"),
            patch.object(n1_service.os, "kill") as kill,
        ):
            descriptor = n1_service.acquire_studio_instance_lock(lock_path)

        self.assertEqual(descriptor, 42)
        self.assertEqual(
            kill.call_args_list,
            [
                call(300, n1_service.signal.SIGTERM),
                call(300, n1_service.signal.SIGKILL),
            ],
        )


class DeviceInitializationTests(unittest.TestCase):
    def test_startup_uses_full_sdk_initialization_after_selecting_dock_mode(self):
        calls = []

        class Transport:
            def switchMode(self, mode):
                calls.append(("mode", mode))

        class Device:
            transport = Transport()

            def set_device(self):
                calls.append(("geometry",))

            def init(self):
                calls.append(("init",))

        n1_service.initialize_n1_device(Device())

        self.assertEqual(calls, [("geometry",), ("mode", 2), ("init",)])


class DisplayCommitTests(unittest.TestCase):
    def tearDown(self):
        n1_service._needs_confirmed_refresh = False

    def test_first_sync_after_connect_gets_a_settled_confirming_refresh(self):
        device = FakeDevice()
        n1_service._needs_confirmed_refresh = True

        with patch.object(n1_service._device_monitor_stop, "wait") as wait:
            n1_service.commit_layout_refresh(device)

        self.assertEqual(device.calls, [("refresh",), ("refresh",)])
        wait.assert_called_once_with(n1_service.FIRST_SYNC_CONFIRM_DELAY)
        self.assertFalse(n1_service._needs_confirmed_refresh)

        n1_service.commit_layout_refresh(device)
        self.assertEqual(
            device.calls,
            [("refresh",), ("refresh",), ("refresh",)],
        )


class BrightnessTests(unittest.TestCase):
    def test_brightness_is_committed_with_a_refresh(self):
        device = FakeDevice()
        with patch.object(n1_service, "connect", return_value=device):
            result = n1_service._set_brightness_once({"brightness": 42})

        self.assertEqual(result, {"brightness": 42})
        self.assertEqual(device.calls, [("brightness", 42), ("refresh",)])

    def test_identify_flashes_twice_and_restores_brightness(self):
        device = FakeDevice()
        with (
            patch.object(n1_service, "connect", return_value=device),
            patch.object(n1_service.time, "sleep"),
        ):
            result = n1_service._identify_once({"brightness": 73})

        self.assertEqual(result, {"brightness": 73, "flashes": 2})
        self.assertEqual(
            device.calls,
            [
                ("brightness", 0),
                ("refresh",),
                ("brightness", 73),
                ("refresh",),
                ("brightness", 0),
                ("refresh",),
                ("brightness", 73),
                ("refresh",),
            ],
        )


class StatusDisplayTests(unittest.TestCase):
    def test_middle_status_display_uses_current_page_number(self):
        self.assertEqual(n1_service.status_label(0, 7, "Claude CLI"), "Claude CLI")
        self.assertEqual(n1_service.status_label(1, 7), "07")
        self.assertEqual(n1_service.status_label(2, 7), "☀")

    def test_profile_display_balances_long_names_across_two_lines(self):
        self.assertEqual(
            n1_service.profile_status_lines("Claude CLI"),
            ["CLAUDE CLI"],
        )
        self.assertEqual(
            n1_service.profile_status_lines("My Extra Long Coding Profile"),
            ["MY EXTRA LONG", "CODING PROFILE"],
        )

    def test_profile_status_display_renders_the_name(self):
        codex = n1_service.render_status_icon(0, 1, "Codex CLI")
        claude = n1_service.render_status_icon(0, 1, "Claude CLI")

        self.assertEqual(codex.size, (80, 80))
        self.assertNotEqual(codex.tobytes(), claude.tobytes())

    def test_page_status_display_renders_the_current_page(self):
        first_page = n1_service.render_status_icon(1, 1)
        second_page = n1_service.render_status_icon(1, 2)

        self.assertEqual(first_page.size, (80, 80))
        self.assertNotEqual(first_page.tobytes(), second_page.tobytes())

    def test_dial_status_uses_a_yellow_accent_on_the_dark_card(self):
        dial = n1_service.render_status_icon(2)

        self.assertEqual(dial.size, (80, 80))
        self.assertEqual(dial.getpixel((11, 15)), n1_service.rgb("#e5a900"))
        self.assertEqual(dial.getpixel((20, 60)), (9, 14, 19))


class SoundDisplayTests(unittest.TestCase):
    def setUp(self):
        self.key = {
            "id": "sound",
            "title": "AIR HORN",
            "color": "#37b7ff",
            "soundLoop": True,
            "sound": {
                "duration": 1.2,
                "waveform": [0.2, 0.5, 1.0, 0.4, 0.7, 0.3, 0.8, 0.25],
            },
        }

    def test_sound_key_renders_waveform_in_both_states(self):
        inactive = n1_service.render_key(self.key)
        active = n1_service.render_sound_key(self.key, playing=True, progress=0.5)

        self.assertEqual(inactive.size, n1_service.KEY_SIZE)
        self.assertEqual(active.size, n1_service.KEY_SIZE)
        self.assertNotEqual(inactive.getpixel((48, 43)), active.getpixel((48, 43)))

    def test_sound_animation_tracks_clip_duration(self):
        frames, delays = n1_service.load_sound_frames(self.key)

        self.assertEqual(len(frames), 12)
        self.assertEqual(len(delays), 12)
        self.assertTrue(all(delay == 100 for delay in delays))
        self.assertTrue(all(frame.startswith(b"\xff\xd8") for frame in frames))

    def test_invalid_waveform_uses_bounded_fallback(self):
        self.key["sound"]["waveform"] = [float("nan")]
        self.assertEqual(
            n1_service.sound_peaks(self.key),
            list(n1_service.FALLBACK_WAVEFORM),
        )

    def test_configured_sound_waveform_overrides_custom_icon(self):
        self.key["visuals"] = {
            "primary": {"path": "/missing/custom-icon.png", "name": "Custom"}
        }
        device = FakeDevice()
        with tempfile.TemporaryDirectory() as temp_dir:
            animated = n1_service.apply_key_visual(
                device, 3, self.key, Path(temp_dir)
            )

        self.assertFalse(animated)
        self.assertEqual(device.calls[0], ("clear_key_gif", 3))
        self.assertEqual(device.calls[1][0:2], ("set_key_image", 3))


class ScreenshotDisplayTests(unittest.TestCase):
    def test_screenshot_actions_render_distinct_generated_icons(self):
        rendered = []
        for icon in ("screenshotFull", "screenshotArea", "screenshotWindow"):
            rendered.append(
                n1_service.render_key(
                    {
                        "id": f"test-{icon}",
                        "title": "CAPTURE",
                        "color": "#37b7ff",
                        "icon": icon,
                    }
                )
            )

        self.assertTrue(all(image.size == n1_service.KEY_SIZE for image in rendered))
        self.assertNotEqual(rendered[0].tobytes(), rendered[1].tobytes())
        self.assertNotEqual(rendered[1].tobytes(), rendered[2].tobytes())


class AgentDisplayTests(unittest.TestCase):
    def test_agent_and_workflow_icons_render_distinct_key_art(self):
        rendered = []
        for icon in (
            "codexAgent",
            "claudeAgent",
            "geminiAgent",
            "resume",
            "plan",
            "build",
            "bug",
            "test",
            "review",
            "refactor",
            "explain",
            "docs",
            "ship",
        ):
            rendered.append(
                n1_service.render_key(
                    {
                        "id": "ai-agent",
                        "title": icon,
                        "color": "#37b7ff",
                        "icon": icon,
                    }
                )
            )

        self.assertTrue(all(image.size == n1_service.KEY_SIZE for image in rendered))
        self.assertEqual(len({image.tobytes() for image in rendered}), len(rendered))

    def test_running_agent_slot_has_an_illuminated_status_dot(self):
        key = {
            "id": "ai-agent",
            "title": "CODEX 1",
            "color": "#343c40",
            "icon": "codexAgent",
            "agentMonitor": "codex",
        }
        idle = n1_service.render_key(key)
        active = n1_service.render_key(
            {
                **key,
                "color": "#37b7ff",
                "agentActive": True,
            }
        )

        self.assertNotEqual(idle.getpixel((82, 13)), active.getpixel((82, 13)))

    def test_workflow_model_badge_uses_the_selected_agent_color(self):
        base = {
            "id": "ai-agent",
            "title": "PLAN",
            "color": "#e8ff58",
            "icon": "plan",
            "agentWorkflow": "plan",
        }
        badges = {
            agent: n1_service.render_key({**base, "agent": agent}).getpixel((82, 7))
            for agent in ("codex", "claude", "gemini")
        }

        self.assertEqual(badges["codex"], n1_service.rgb("#37b7ff"))
        self.assertEqual(badges["claude"], n1_service.rgb("#ff9f1c"))
        self.assertEqual(badges["gemini"], n1_service.rgb("#a78bfa"))


if __name__ == "__main__":
    unittest.main()
