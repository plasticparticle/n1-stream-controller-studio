#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
RULE_SOURCE="${PROJECT_DIR}/driver/70-streamctrl-n1.rules"
# uaccess tags only take effect before systemd's 73-seat-late.rules runs.
RULE_TARGET="/etc/udev/rules.d/70-streamctrl-n1.rules"
LEGACY_RULE_TARGET="/etc/udev/rules.d/99-streamctrl-n1.rules"

if [[ -r "${RULE_TARGET}" ]] && cmp -s "${RULE_SOURCE}" "${RULE_TARGET}" && [[ ! -e "${LEGACY_RULE_TARGET}" ]]; then
  echo "N1 udev rule is already current."
  exit 0
fi

sudo install -m 0644 "${RULE_SOURCE}" "${RULE_TARGET}"
sudo rm -f "${LEGACY_RULE_TARGET}"
sudo udevadm control --reload-rules
sudo udevadm trigger --subsystem-match=usb
sudo udevadm trigger --subsystem-match=hidraw

echo "N1 udev rule installed. Unplug and reconnect the controller."
