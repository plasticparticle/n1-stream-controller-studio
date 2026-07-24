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


if __name__ == "__main__":
    unittest.main()
