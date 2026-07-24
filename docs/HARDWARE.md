# N1 hardware transport

N1 Stream Controller Studio uses the vendor's MIT-licensed
[StreamDock Device SDK](https://github.com/MiraboxSpace/StreamDock-Device-SDK)
through a small Python service.

## Connected device

The TreasLin-branded unit tested here identifies as:

- USB VID/PID: `5548:1002`
- Product string: `HOTSPOTEKUSB HID DEMO`
- Vendor HID interface: `/dev/hidraw16` at test time
- Input report: 512 bytes
- Output report: 1024 bytes
- Secondary interface: HID keyboard

This VID/PID is not in the current SDK product table. The bridge explicitly treats this
legacy identity as a `StreamDockN1`; its report sizes and physical controls match that
class.

## Installation

```bash
npm run setup:driver
```

The setup creates `.venv`, installs the SDK at the pinned commit in
`driver/requirements.txt`, and installs a narrowly scoped udev rule. Unplug and reconnect
the device afterward, then restart N1 Stream Controller Studio.

To install only the permission rule:

```bash
npm run setup:udev
```

Check the connection:

```bash
npm run driver:probe
```

## USB reconnects

The driver monitors the N1's USB identity while Studio is running. Physical removal
closes the old HID transport; reconnecting the controller opens a new handle
automatically. Transfers also perform one bounded reconnect-and-retry cycle, so
**Sync to deck** can recover when it is pressed while the device is still settling.
The Node bridge restarts the Python process with backoff if the native transport exits.

## Safety boundary

The bridge does not initialize by clearing the deck. It opens the N1 in dock mode and
only writes images after an explicit **Sync to deck** request. Images are encoded to the
N1's native 96×96 JPEG format. Empty UI slots are explicitly cleared, the three small
status-strip images are updated, brightness is applied, and one final refresh commits
the frame.

## Capturing raw USB traffic

The official SDK covers the required N1 operations. Raw capture is only needed when
testing a firmware variant the SDK does not understand.

Linux USB capture requires the `usbmon` kernel module and Wireshark/tshark:

```bash
sudo modprobe usbmon
sudo setfacl -m u:"$USER":r /dev/usbmon1
scripts/capture-usb.sh captures/n1-sync.pcapng
```

While capture is running, change exactly one key in the vendor software and sync once.
Stop the capture with `Ctrl+C`. Captures can contain key labels or commands; do not
publish them without reviewing the packet contents.
