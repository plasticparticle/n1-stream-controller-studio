#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_PYTHON="${PROJECT_DIR}/.venv/bin/python"
SDK_DIR="${PROJECT_DIR}/src-tauri/build/streamdock-sdk"

if [[ ! -x "${VENV_PYTHON}" ]]; then
  echo "The N1 driver environment is missing. Run npm run setup:driver first." >&2
  exit 1
fi

# The StreamDock SDK wheel omits its native transport libraries, so install them
# from the same hash-pinned archive that driver/requirements.txt references.
SDK_PIN="$(sed -n 's/^streamdock @ \([^ ]*\).*/\1/p' "${PROJECT_DIR}/driver/requirements.txt")"
SDK_URL="${SDK_PIN%%#*}"
SDK_SHA256="$(printf '%s\n' "${SDK_PIN}" | sed -n 's/.*[#&]sha256=\([0-9a-f]\{64\}\).*/\1/p')"
if [[ -z "${SDK_URL}" || -z "${SDK_SHA256}" ]]; then
  echo "Unable to read the pinned StreamDock SDK archive from driver/requirements.txt." >&2
  exit 1
fi

PACKAGE_DIR="$(
  "${VENV_PYTHON}" -c 'import importlib.util, os; print(os.path.dirname(importlib.util.find_spec("StreamDock").origin))'
)"
TRANSPORT_DIR="${PACKAGE_DIR}/Transport/TransportDLL"

SDK_ARCHIVE="${SDK_DIR}/${SDK_SHA256}.tar.gz"
mkdir -p "${SDK_DIR}"
if [[ ! -f "${SDK_ARCHIVE}" ]] || ! printf '%s  %s\n' "${SDK_SHA256}" "${SDK_ARCHIVE}" | sha256sum --check --status; then
  curl --fail --location --silent --show-error --output "${SDK_ARCHIVE}.part" "${SDK_URL}"
  if ! printf '%s  %s\n' "${SDK_SHA256}" "${SDK_ARCHIVE}.part" | sha256sum --check --status; then
    rm -f "${SDK_ARCHIVE}.part"
    echo "The downloaded StreamDock SDK archive does not match its pinned hash." >&2
    exit 1
  fi
  mv "${SDK_ARCHIVE}.part" "${SDK_ARCHIVE}"
fi

mkdir -p "${TRANSPORT_DIR}"
tar -xzf "${SDK_ARCHIVE}" \
  -C "${TRANSPORT_DIR}" \
  --strip-components=6 \
  --wildcards '*/Python-SDK/src/StreamDock/Transport/TransportDLL/libtransport*.so'

if [[ ! -f "${TRANSPORT_DIR}/libtransport.so" ]]; then
  echo "The pinned StreamDock SDK archive contains no Linux transport library." >&2
  exit 1
fi
