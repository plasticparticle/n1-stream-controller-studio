# N1 hardware: the tiny control room

Welcome to the engineering annex, where the buttons are real, the packets are large,
and the product string is somehow still `HOTSPOTEKUSB HID DEMO`.

N1 Stream Controller Studio talks to the TreasLin VSDinside N1 through the vendor’s
MIT-licensed [StreamDock Device SDK](https://github.com/MiraboxSpace/StreamDock-Device-SDK).
A bundled Python sidecar handles USB/HID details while the Rust desktop core validates
configuration, stores assets, serializes transfers, and dispatches actions.

## The hardware calling card

The tested controller identifies as:

| Detail | Value |
| --- | --- |
| USB VID/PID | `5548:1002` |
| Product string | `HOTSPOTEKUSB HID DEMO` |
| Main interface | Vendor HID |
| Input report | 512 bytes |
| Output report | 1024 bytes |
| Secondary interface | HID keyboard |
| Key artwork | Native 96×96 pixels |

The `/dev/hidraw*` number can change after a reboot or reconnect, so Studio discovers
the interface instead of hard-coding a path. This VID/PID is absent from the current
SDK product table; the bridge deliberately maps the legacy identity to `StreamDockN1`,
whose report geometry and controls match the device.

## Every physical control gets a job

| Control | Studio behavior |
| --- | --- |
| Fifteen LCD keys | Run the configured action on the active profile page |
| Top-left status button, input 16 | Cycle to the next profile |
| Middle status button, input 17 | Cycle to the next page |
| Rotary dial | Change the default PipeWire output volume in 5% steps |
| Rotary dial press | Toggle mute on the default PipeWire output |
| Left status display | Show the active profile name in a fitted two-line treatment |
| Center status display | Show the current page number |
| Right status display | Show the brightness symbol |

Profile and page changes are saved, rendered, and sent back to the controller. In
other words, the hardware does not merely press buttons—it knows which tiny universe
of buttons it currently inhabits.

## The automatic curtain-raiser

When Studio starts, the sidecar:

1. Finds `5548:1002`, opens the writable vendor HID interface, selects N1 report
   geometry, enters dock mode, and runs the SDK’s complete display initialization.
2. Announces that the transport is ready.
3. Gives the freshly loaded editor a brief chance to send its newest local draft.
4. Otherwise restores the last validated native configuration automatically.

Full deck transfers are serialized, so rapid edits cannot interleave USB writes.
The active profile, page, brightness, and key configuration are persisted in the
application data directory. Uploaded icons and sounds are stored as private app
assets and materialized only after their IDs, signatures, sizes, and paths pass
validation.

The result: start Studio or reconnect the cable and the deck should repopulate without
the traditional ceremonial ritual of editing one random button.

## From editor to illuminated button

```text
Local profile draft
        ↓
Validated Tauri command
        ↓
Private active configuration + materialized assets
        ↓
Bundled Python N1 sidecar
        ↓
96×96 JPEG frames, animated frames, status strip, brightness
        ↓
One final N1 refresh
```

A complete sync stops the current animation loop, updates all 15 primary keys, clears
empty slots intentionally, redraws the three status displays, applies brightness,
refreshes once, and restarts animation playback.

Live changes do not always need the full parade. Pressed icon states, sound waveforms
and playheads, loop colors, and agent status colors use focused key-state updates after
the base layout is synchronized.

## USB reconnects: the comeback special

The driver watches for the N1 while Studio is running. Removing the cable closes the
old HID handle; reconnecting opens a fresh one automatically. A failed transfer gets
one bounded reconnect-and-retry cycle while USB settles. If the bundled sidecar exits
unexpectedly, the Rust core starts it again.

Each transition back to `ready` schedules another active-configuration restore. That
is why reconnecting should bring back the active page instead of presenting fifteen
small black rectangles of mystery.

## Installation and permissions

Prepare the pinned SDK environment and install the narrowly scoped udev rule:

```bash
npm run setup:driver
```

Then unplug and reconnect the N1. To install only the USB permission rule:

```bash
npm run setup:udev
```

Check whether the controller can be found and opened:

```bash
npm run driver:probe
```

If the deck stays black, check Studio’s connection status, run the probe, and confirm
that the udev rule was installed before reconnecting the hardware. A healthy startup
now restores the deck automatically; no manual **Sync to deck** click should be
required.

## Safety boundary

Studio does not guess at arbitrary USB devices or spray reports across every HID
interface. The bridge targets only the known `5548:1002` identity and uses the SDK’s
N1 operations.

Opening Studio *does* write the last saved active configuration once the known N1 is
ready. That automatic restore is intentional. Key images are encoded for the native
display, missing slots are cleared, the status strip is regenerated, and one refresh
commits the frame.

Fixed built-in actions run through constrained program-and-argument definitions.
Arbitrary shell-style actions remain disabled unless the user explicitly launches
Studio with `N1_STUDIO_ALLOW_SHELL_ACTIONS=1`.

## Capturing raw USB traffic

The SDK covers normal N1 operations. Raw capture is mainly useful for investigating a
firmware variant that speaks with a different accent.

Linux capture requires the `usbmon` kernel module plus Wireshark or tshark:

```bash
sudo modprobe usbmon
sudo setfacl -m u:"$USER":r /dev/usbmon1
scripts/capture-usb.sh captures/n1-sync.pcapng
```

While capture is running, change exactly one key in the vendor software and sync once.
Stop with `Ctrl+C`. Captures can contain key labels, commands, and other workflow
details, so review the packets before publishing them. Even tiny control rooms deserve
operational security.
