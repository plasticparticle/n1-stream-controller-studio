#!/usr/bin/env bash
set -Eeuo pipefail

readonly REPOSITORY="plasticparticle/n1-stream-controller-studio"
readonly API_ROOT="https://api.github.com/repos/${REPOSITORY}"
readonly PACKAGE_NAME="n1-stream-controller-studio"
readonly RULE_TARGET="/etc/udev/rules.d/99-streamctrl-n1.rules"

ACCEPT_ALPHA_RISK="${N1_ACCEPT_ALPHA_RISK:-0}"
REQUESTED_VERSION="${N1_VERSION:-}"
DRY_RUN=0
SKIP_ATTESTATION=0
TEMP_DIR=""
PACKAGE_FILE=""

if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
  readonly BOLD=$'\033[1m'
  readonly BLUE=$'\033[1;34m'
  readonly GREEN=$'\033[1;32m'
  readonly YELLOW=$'\033[1;33m'
  readonly RED=$'\033[1;31m'
  readonly RESET=$'\033[0m'
else
  readonly BOLD=""
  readonly BLUE=""
  readonly GREEN=""
  readonly YELLOW=""
  readonly RED=""
  readonly RESET=""
fi

info() {
  printf '%s==>%s %s\n' "${BLUE}" "${RESET}" "$*"
}

success() {
  printf '%s✓%s %s\n' "${GREEN}" "${RESET}" "$*"
}

warn() {
  printf '%s!%s %s\n' "${YELLOW}" "${RESET}" "$*" >&2
}

fail() {
  printf '%sError:%s %s\n' "${RED}" "${RESET}" "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
N1 Stream Controller Studio installer

Usage:
  install.sh --accept-alpha-risk [options]

Options:
  --accept-alpha-risk   Acknowledge that this is unsafe EARLY ALPHA software
  --version TAG         Install a specific GitHub release tag
  --dry-run             Download and validate the package without installing it
  --skip-attestation    Skip signed provenance verification (unsafe)
  -h, --help            Show this help

Environment alternatives:
  N1_ACCEPT_ALPHA_RISK=1
  N1_VERSION=TAG
  NO_COLOR=1
EOF
}

cleanup() {
  if [[ -n "${TEMP_DIR}" && -d "${TEMP_DIR}" ]]; then
    rm -f -- \
      "${TEMP_DIR}/release.json" \
      "${TEMP_DIR}/SHA256SUMS" \
      "${TEMP_DIR}/udev.rules"
    if [[ -n "${PACKAGE_FILE}" ]]; then
      rm -f -- "${TEMP_DIR}/${PACKAGE_FILE}"
    fi
    rmdir -- "${TEMP_DIR}" 2>/dev/null || true
  fi
}

run_as_root() {
  if (( EUID == 0 )); then
    "$@"
  else
    sudo "$@"
  fi
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"
}

while (( $# > 0 )); do
  case "$1" in
    --accept-alpha-risk)
      ACCEPT_ALPHA_RISK=1
      shift
      ;;
    --version)
      (( $# >= 2 )) || fail "--version requires a release tag."
      REQUESTED_VERSION="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --skip-attestation)
      SKIP_ATTESTATION=1
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown option: $1 (use --help for usage)"
      ;;
  esac
done

printf '\n%sN1 Stream Controller Studio%s\n' "${BOLD}" "${RESET}"
printf 'Native Linux installer\n\n'

if [[ "${ACCEPT_ALPHA_RISK}" != "1" ]]; then
  warn "EARLY ALPHA: this software is currently unsafe to use."
  warn "Do not connect production hardware or rely on it for real workflows."
  fail "Re-run with --accept-alpha-risk only if you understand the warning."
fi

warn "EARLY ALPHA risk acknowledged."

require_command curl
require_command dpkg
require_command dpkg-deb
require_command apt-get
require_command awk
require_command install
require_command mktemp
require_command sed
require_command sha256sum

if (( EUID != 0 )); then
  require_command sudo
fi

ARCHITECTURE="$(dpkg --print-architecture)"
[[ "${ARCHITECTURE}" == "amd64" ]] ||
  fail "No release package is available for ${ARCHITECTURE}; only amd64 is supported."

if [[ -n "${REQUESTED_VERSION}" ]]; then
  [[ "${REQUESTED_VERSION}" =~ ^v[0-9]+(\.[0-9]+){2}([.+~-][A-Za-z0-9.+~-]+)?$ ]] ||
    fail "Invalid release tag: ${REQUESTED_VERSION}"
  RELEASE_ENDPOINT="${API_ROOT}/releases/tags/${REQUESTED_VERSION}"
  info "Looking up release ${REQUESTED_VERSION}…"
else
  RELEASE_ENDPOINT="${API_ROOT}/releases/latest"
  info "Looking up the newest published release…"
fi

TEMP_DIR="$(mktemp -d -t n1-studio-installer.XXXXXXXX)"
trap cleanup EXIT

if ! curl \
  --proto '=https' \
  --tlsv1.2 \
  --fail \
  --silent \
  --show-error \
  --location \
  --retry 3 \
  --connect-timeout 15 \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "${RELEASE_ENDPOINT}" \
  -o "${TEMP_DIR}/release.json"; then
  fail "Could not retrieve release information from GitHub."
fi

RELEASE_TAG="$(
  sed -nE \
    's/^[[:space:]]*"tag_name":[[:space:]]*"([^"]+)".*/\1/p' \
    "${TEMP_DIR}/release.json" |
    sed -n '1p'
)"
[[ "${RELEASE_TAG}" =~ ^v[0-9]+(\.[0-9]+){2}([.+~-][A-Za-z0-9.+~-]+)?$ ]] ||
  fail "GitHub returned an invalid release tag; refusing to continue."
if [[ -n "${REQUESTED_VERSION}" && "${RELEASE_TAG}" != "${REQUESTED_VERSION}" ]]; then
  fail "GitHub returned ${RELEASE_TAG}, not the requested ${REQUESTED_VERSION}."
fi

DOWNLOAD_URL="$(
  sed -nE \
    's/^[[:space:]]*"browser_download_url":[[:space:]]*"([^"]+_amd64\.deb)".*/\1/p' \
    "${TEMP_DIR}/release.json" |
    sed -n '1p'
)"

[[ -n "${DOWNLOAD_URL}" ]] ||
  fail "No amd64 Debian package was found in the published GitHub releases."

case "${DOWNLOAD_URL}" in
  "https://github.com/${REPOSITORY}/releases/download/"*) ;;
  *) fail "GitHub returned an unexpected download URL; refusing to continue." ;;
esac

PACKAGE_FILE="${DOWNLOAD_URL##*/}"
[[ "${PACKAGE_FILE}" =~ ^n1-stream-controller-studio_[A-Za-z0-9.+:~-]+_amd64\.deb$ ]] ||
  fail "GitHub returned an unexpected package filename; refusing to continue."

CHECKSUM_URL="$(
  sed -nE \
    's/^[[:space:]]*"browser_download_url":[[:space:]]*"([^"]+/SHA256SUMS)".*/\1/p' \
    "${TEMP_DIR}/release.json" |
    sed -n '1p'
)"
[[ -n "${CHECKSUM_URL}" ]] ||
  fail "The release has no SHA256SUMS file; refusing to install an unverified package."
case "${CHECKSUM_URL}" in
  "https://github.com/${REPOSITORY}/releases/download/"*/SHA256SUMS) ;;
  *) fail "GitHub returned an unexpected checksum URL; refusing to continue." ;;
esac

info "Downloading the Debian package…"
curl \
  --proto '=https' \
  --tlsv1.2 \
  --fail \
  --show-error \
  --location \
  --retry 3 \
  --connect-timeout 15 \
  --progress-bar \
  "${DOWNLOAD_URL}" \
  -o "${TEMP_DIR}/${PACKAGE_FILE}"

curl \
  --proto '=https' \
  --tlsv1.2 \
  --fail \
  --silent \
  --show-error \
  --location \
  --retry 3 \
  --connect-timeout 15 \
  "${CHECKSUM_URL}" \
  -o "${TEMP_DIR}/SHA256SUMS"

info "Verifying the package checksum…"
EXPECTED_SHA256="$(
  awk -v package="${PACKAGE_FILE}" \
    '$2 == package || $2 == "*" package { print $1; exit }' \
    "${TEMP_DIR}/SHA256SUMS"
)"
[[ "${EXPECTED_SHA256}" =~ ^[a-fA-F0-9]{64}$ ]] ||
  fail "The checksum manifest has no valid entry for ${PACKAGE_FILE}."
ACTUAL_SHA256="$(sha256sum "${TEMP_DIR}/${PACKAGE_FILE}" | awk '{print $1}')"
[[ "${ACTUAL_SHA256,,}" == "${EXPECTED_SHA256,,}" ]] ||
  fail "The downloaded package checksum does not match the release manifest."

if (( SKIP_ATTESTATION == 0 )); then
  require_command gh
  gh attestation verify --help >/dev/null 2>&1 ||
    fail "GitHub CLI with 'gh attestation verify' support is required. Upgrade gh or explicitly use --skip-attestation."
  info "Verifying signed GitHub Actions build provenance…"
  GH_PROMPT_DISABLED=1 gh attestation verify \
    "${TEMP_DIR}/${PACKAGE_FILE}" \
    --repo "${REPOSITORY}" \
    --signer-workflow "${REPOSITORY}/.github/workflows/release.yml" \
    --source-ref "refs/tags/${RELEASE_TAG}" >/dev/null ||
    fail "The package has no valid signed build provenance; refusing to install it."
else
  warn "Signed build provenance verification was explicitly skipped."
fi

DOWNLOADED_NAME="$(dpkg-deb --field "${TEMP_DIR}/${PACKAGE_FILE}" Package)"
DOWNLOADED_VERSION="$(dpkg-deb --field "${TEMP_DIR}/${PACKAGE_FILE}" Version)"
DOWNLOADED_ARCH="$(dpkg-deb --field "${TEMP_DIR}/${PACKAGE_FILE}" Architecture)"

[[ "${DOWNLOADED_NAME}" == "${PACKAGE_NAME}" ]] ||
  fail "Downloaded package has an unexpected identity: ${DOWNLOADED_NAME}"
[[ "${DOWNLOADED_ARCH}" == "${ARCHITECTURE}" ]] ||
  fail "Downloaded package is for ${DOWNLOADED_ARCH}, not ${ARCHITECTURE}."
[[ "${RELEASE_TAG}" == "v${DOWNLOADED_VERSION}" ]] ||
  fail "Downloaded package version ${DOWNLOADED_VERSION} does not match ${RELEASE_TAG}."

success "Validated ${PACKAGE_NAME} ${DOWNLOADED_VERSION} (${DOWNLOADED_ARCH})."

if (( DRY_RUN == 1 )); then
  success "Dry run complete; no system changes were made."
  exit 0
fi

if INSTALLED_VERSION="$(dpkg-query -W -f='${Version}' "${PACKAGE_NAME}" 2>/dev/null)"; then
  info "Updating ${INSTALLED_VERSION} to ${DOWNLOADED_VERSION}…"
else
  info "Installing ${PACKAGE_NAME} ${DOWNLOADED_VERSION}…"
fi

if ! run_as_root apt-get install -y "${TEMP_DIR}/${PACKAGE_FILE}"; then
  warn "The package index may be stale; refreshing it and trying once more."
  run_as_root apt-get update
  run_as_root apt-get install -y "${TEMP_DIR}/${PACKAGE_FILE}"
fi

cat >"${TEMP_DIR}/udev.rules" <<'EOF'
# TreasLin / VSDinside N1 legacy USB identity.
SUBSYSTEM=="usb", ATTR{idVendor}=="5548", ATTR{idProduct}=="1002", MODE="0660", GROUP="plugdev", TAG+="uaccess"
KERNEL=="hidraw*", ATTRS{idVendor}=="5548", ATTRS{idProduct}=="1002", MODE="0660", GROUP="plugdev", TAG+="uaccess"
EOF

info "Installing the N1 USB permission rule…"
run_as_root install -D -m 0644 "${TEMP_DIR}/udev.rules" "${RULE_TARGET}"

if command -v udevadm >/dev/null 2>&1; then
  run_as_root udevadm control --reload-rules
  run_as_root udevadm trigger --subsystem-match=usb
fi

printf '\n'
success "N1 Stream Controller Studio ${DOWNLOADED_VERSION} is installed."
printf 'Open it from your application menu.\n'
printf 'Unplug and reconnect the N1 before starting Studio.\n'
