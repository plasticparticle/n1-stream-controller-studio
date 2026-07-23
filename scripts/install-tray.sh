#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
APP_ID="n1-stream-controller-studio"
APPLICATION_DIR="${XDG_DATA_HOME:-${HOME}/.local/share}/applications"
ICON_DIR="${XDG_DATA_HOME:-${HOME}/.local/share}/icons/hicolor/scalable/apps"
AUTOSTART_DIR="${XDG_CONFIG_HOME:-${HOME}/.config}/autostart"

mkdir -p "${APPLICATION_DIR}" "${ICON_DIR}" "${AUTOSTART_DIR}"

install -m 0644 \
  "${PROJECT_DIR}/assets/${APP_ID}.svg" \
  "${ICON_DIR}/${APP_ID}.svg"

sed "s|@PROJECT_DIR@|${PROJECT_DIR}|g" \
  "${PROJECT_DIR}/desktop/${APP_ID}.desktop.in" \
  > "${APPLICATION_DIR}/${APP_ID}.desktop"

sed "s|@PROJECT_DIR@|${PROJECT_DIR}|g" \
  "${PROJECT_DIR}/desktop/${APP_ID}-autostart.desktop.in" \
  > "${AUTOSTART_DIR}/${APP_ID}.desktop"

chmod 0644 \
  "${APPLICATION_DIR}/${APP_ID}.desktop" \
  "${AUTOSTART_DIR}/${APP_ID}.desktop"

if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -f -t "${XDG_DATA_HOME:-${HOME}/.local/share}/icons/hicolor" >/dev/null 2>&1 || true
fi

echo "N1 Stream Controller Studio was added to the Mint application menu and startup tray."
echo "Run npm run tray to open it now."
