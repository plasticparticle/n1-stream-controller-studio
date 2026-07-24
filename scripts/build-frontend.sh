#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${PROJECT_DIR}/dist"

mkdir -p "${DIST_DIR}"
install -m 0644 "${PROJECT_DIR}/index.html" "${DIST_DIR}/index.html"
install -m 0644 "${PROJECT_DIR}/styles.css" "${DIST_DIR}/styles.css"
install -m 0644 "${PROJECT_DIR}/app.js" "${DIST_DIR}/app.js"
