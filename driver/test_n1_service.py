import unittest
from unittest.mock import patch

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
        self.assertEqual(n1_service.status_label(0, 7), "N1")
        self.assertEqual(n1_service.status_label(1, 7), "07")
        self.assertEqual(n1_service.status_label(2, 7), "☀")


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


if __name__ == "__main__":
    unittest.main()
