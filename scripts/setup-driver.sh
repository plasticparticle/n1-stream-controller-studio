#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="${PROJECT_DIR}/.venv"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3.10 or newer is required." >&2
  exit 1
fi

if ! python3 -c 'import sys; raise SystemExit(sys.version_info[:2] != (3, 12))'; then
  echo "Python 3.12 is required for the pinned driver environment." >&2
  exit 1
fi

python3 -m venv "${VENV_DIR}"
"${VENV_DIR}/bin/python" -m pip install \
  --no-build-isolation \
  --require-hashes \
  -r "${PROJECT_DIR}/driver/build-requirements.txt"
"${VENV_DIR}/bin/python" -m pip install \
  --no-build-isolation \
  --require-hashes \
  -r "${PROJECT_DIR}/driver/requirements.txt"

echo
echo "Installing the udev permission rule (sudo may ask for your password)…"
bash "${PROJECT_DIR}/scripts/install-udev.sh"

echo
echo "Driver setup complete."
echo "Unplug and reconnect the N1, then restart N1 Stream Controller Studio."
