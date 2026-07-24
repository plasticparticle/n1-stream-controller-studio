#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${PROJECT_DIR}/dist"
APP_VERSION="$(node -p "require(process.argv[1]).version" "${PROJECT_DIR}/package.json")"

if [[ -n "${SOURCE_DATE_EPOCH:-}" ]]; then
  BUILD_DATE="$(date --utc --date="@${SOURCE_DATE_EPOCH}" +%Y-%m-%d)"
else
  BUILD_DATE="$(date --utc +%Y-%m-%d)"
fi

mkdir -p "${DIST_DIR}"
install -m 0644 "${PROJECT_DIR}/index.html" "${DIST_DIR}/index.html"
install -m 0644 "${PROJECT_DIR}/styles.css" "${DIST_DIR}/styles.css"
install -m 0644 "${PROJECT_DIR}/app.js" "${DIST_DIR}/app.js"
printf 'window.__N1_BUILD_INFO__ = Object.freeze({ version: "%s", date: "%s" });\n' \
  "${APP_VERSION}" "${BUILD_DATE}" >"${DIST_DIR}/build-info.js"
