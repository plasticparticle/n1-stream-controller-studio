#!/usr/bin/env bash
set -euo pipefail

# Seeds the deck configuration that N1 Stream Controller Studio reads. An existing
# deck.json is never overwritten, so local edits survive plugin updates.
CONFIG_DIR="${HERDR_PLUGIN_CONFIG_DIR:?HERDR_PLUGIN_CONFIG_DIR is not set}"
PLUGIN_ROOT="${HERDR_PLUGIN_ROOT:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)}"
TARGET="${CONFIG_DIR}/deck.json"

if [[ -e "${TARGET}" ]]; then
  exit 0
fi

mkdir -p -- "${CONFIG_DIR}"
install -m 0644 -- "${PLUGIN_ROOT}/deck.default.json" "${TARGET}"
