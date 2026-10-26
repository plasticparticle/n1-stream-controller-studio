#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="${PROJECT_DIR}/.venv"

is_python_312() {
  "$1" -c 'import sys; raise SystemExit(sys.version_info[:2] != (3, 12))' >/dev/null 2>&1
}

# The pinned driver environment targets Python 3.12, which is often not the
# distribution's default python3, so also accept python3.12 or a uv-managed one.
PYTHON=""
for candidate in python3.12 python3; do
  if command -v "${candidate}" >/dev/null 2>&1 && is_python_312 "${candidate}"; then
    PYTHON="$(command -v "${candidate}")"
    break
  fi
done
if [[ -z "${PYTHON}" ]] && command -v uv >/dev/null 2>&1; then
  if candidate="$(uv python find 3.12 2>/dev/null)" && is_python_312 "${candidate}"; then
    PYTHON="${candidate}"
  fi
fi
if [[ -z "${PYTHON}" ]]; then
  echo "Python 3.12 is required for the pinned driver environment." >&2
  echo "Install your distribution's python3.12 package, or run: uv python install 3.12" >&2
  exit 1
fi

if [[ -x "${VENV_DIR}/bin/python" ]] && ! is_python_312 "${VENV_DIR}/bin/python"; then
  echo "Recreating ${VENV_DIR} with Python 3.12…"
  rm -rf -- "${VENV_DIR}"
fi

"${PYTHON}" -m venv "${VENV_DIR}"
"${VENV_DIR}/bin/python" -m pip install \
  --no-build-isolation \
  --require-hashes \
  -r "${PROJECT_DIR}/driver/build-requirements.txt"
"${VENV_DIR}/bin/python" -m pip install \
  --no-build-isolation \
  --require-hashes \
  -r "${PROJECT_DIR}/driver/requirements.txt"
bash "${PROJECT_DIR}/scripts/install-streamdock-transport.sh"

echo
echo "Installing the udev permission rule (sudo may ask for your password)…"
bash "${PROJECT_DIR}/scripts/install-udev.sh"

echo
echo "Driver setup complete."
echo "Unplug and reconnect the N1, then restart N1 Stream Controller Studio."
