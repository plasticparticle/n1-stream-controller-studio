#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
RULE_SOURCE="${PROJECT_DIR}/driver/99-streamctrl-n1.rules"
RULE_TARGET="/etc/udev/rules.d/99-streamctrl-n1.rules"

sudo install -m 0644 "${RULE_SOURCE}" "${RULE_TARGET}"
sudo udevadm control --reload-rules
sudo udevadm trigger --subsystem-match=usb

echo "N1 udev rule installed. Unplug and reconnect the controller."
