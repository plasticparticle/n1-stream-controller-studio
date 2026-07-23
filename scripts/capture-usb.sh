#!/usr/bin/env bash
set -euo pipefail

OUTPUT_FILE="${1:-captures/n1-sync.pcapng}"
OUTPUT_DIR="$(dirname -- "${OUTPUT_FILE}")"
USB_ID="5548:1002"

if ! command -v dumpcap >/dev/null 2>&1; then
  echo "dumpcap is required (it is included with Wireshark)." >&2
  exit 1
fi

USB_LINE="$(lsusb -d "${USB_ID}" | head -n 1)"
if [[ -z "${USB_LINE}" ]]; then
  echo "N1 device ${USB_ID} was not found." >&2
  exit 1
fi

USB_BUS="$(awk '{ print $2 }' <<<"${USB_LINE}")"
USB_DEVICE="$(awk '{ gsub(\":\", \"\", $4); print $4 }' <<<"${USB_LINE}")"
USB_INTERFACE="usbmon$((10#${USB_BUS}))"
USB_DEVICE_NUMBER="$((10#${USB_DEVICE}))"

mkdir -p "${OUTPUT_DIR}"

echo "Capturing ${USB_ID} on ${USB_INTERFACE}, device ${USB_DEVICE_NUMBER}."
echo "Make one controlled change in the vendor software, sync it, then press Ctrl+C."
exec dumpcap -i "${USB_INTERFACE}" -f "usb device ${USB_DEVICE_NUMBER}" -w "${OUTPUT_FILE}"
