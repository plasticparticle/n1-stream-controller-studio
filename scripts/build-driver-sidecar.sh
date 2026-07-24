#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_PYTHON="${PROJECT_DIR}/.venv/bin/python"
BIN_DIR="${PROJECT_DIR}/src-tauri/binaries"
BUILD_DIR="${PROJECT_DIR}/src-tauri/build/pyinstaller"

if [[ ! -x "${VENV_PYTHON}" ]]; then
  echo "The N1 driver environment is missing. Run npm run setup:driver first." >&2
  exit 1
fi

if ! command -v rustc >/dev/null 2>&1; then
  echo "Rust is required. Install it from https://rustup.rs before building Studio." >&2
  exit 1
fi

TARGET_TRIPLE="${TAURI_ENV_TARGET_TRIPLE:-$(rustc -vV | sed -n 's/^host: //p')}"
if [[ -z "${TARGET_TRIPLE}" ]]; then
  echo "Unable to determine the Rust target triple." >&2
  exit 1
fi

SIDECAR="${BIN_DIR}/n1-driver-${TARGET_TRIPLE}"
HASH_FILE="${SIDECAR}.sha256"
SOURCE_HASH="$(
  sha256sum \
    "${PROJECT_DIR}/driver/n1_service.py" \
    "${PROJECT_DIR}/driver/build-requirements.txt" \
    "${PROJECT_DIR}/driver/requirements.txt" |
    sha256sum |
    cut -d ' ' -f 1
)"

if [[ -x "${SIDECAR}" && -f "${HASH_FILE}" && "$(<"${HASH_FILE}")" == "${SOURCE_HASH}" ]]; then
  exit 0
fi

if ! "${VENV_PYTHON}" -m PyInstaller --version >/dev/null 2>&1; then
  echo "The pinned PyInstaller build dependency is missing. Run npm run setup:driver." >&2
  exit 1
fi

mkdir -p "${BIN_DIR}" "${BUILD_DIR}"
"${VENV_PYTHON}" -m PyInstaller \
  --clean \
  --noconfirm \
  --onefile \
  --name "n1-driver-${TARGET_TRIPLE}" \
  --distpath "${BIN_DIR}" \
  --workpath "${BUILD_DIR}/work" \
  --specpath "${BUILD_DIR}" \
  --collect-all StreamDock \
  "${PROJECT_DIR}/driver/n1_service.py"

printf '%s\n' "${SOURCE_HASH}" >"${HASH_FILE}"
