# N1 Stream Controller Studio

## ⚠️ EARLY ALPHA — DO NOT USE ⚠️

> [!CAUTION]
> **This software is currently EARLY ALPHA and is unsafe to use.**
> Do not use it with your hardware or rely on it for production workflows.
> **Wait for the BETA release before using this software.**

A Linux-first configuration UI and hardware service for the TreasLin VSDinside N1
stream controller.

![N1 Stream Controller Studio interface](docs/images/n1-stream-controller-studio.png)

## First-time setup

Install the native Linux build dependencies:

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf \
  python3-venv git
```

Install [Rust](https://rustup.rs), then install the build-time JavaScript tooling and
the pinned vendor SDK:

```bash
npm install
npm run setup:driver
```

The driver setup creates `.venv`, installs the SDK, and installs a narrowly scoped udev
rule. It asks for your sudo password only when that rule is missing or outdated. Unplug
and reconnect the N1 afterward.

Start the native application:

```bash
npm run dev
```

The first native build packages the Python hardware bridge into a self-contained
sidecar. Node.js, Python, and `.venv` are build-time requirements only; the packaged
application does not require them at runtime.

## Native desktop and tray

Studio is a Tauri 2 desktop application. Its existing HTML, CSS, and JavaScript
interface communicates with a Rust core through in-process Tauri commands and events.
It does not start an HTTP server or listen on a localhost port.

```text
HTML/CSS/JavaScript interface
          ↕ Tauri IPC
Rust desktop core and tray
          ↕ stdin/stdout
Bundled N1 hardware sidecar
          ↕ USB/HID
      VSDinside N1
```

Closing the window hides it while the controller remains active. Left-click the N1
tray icon to reopen Studio; right-click it for **Open Studio** and **Quit**.

Build a Debian package with:

```bash
npm run build
```

Build artifacts are written below `src-tauri/target/release/bundle/`.

## Custom key icons

Select a key and use the **Icon states** section to upload a PNG, JPEG, GIF, or WebP
image. Each key can have a default/off icon and an optional pressed/on icon:

- **Press / release** shows the second icon only while the physical key is held.
- **Toggle on / off** changes icon state on every physical key press.
- When no second icon is configured, the first icon remains visible in either mode.

Static and animated images are fitted to the N1's 96×96 key display. Press **Sync to
deck** after editing to transfer the current layout and start any animations.

## What works

- Detects the legacy TreasLin USB identity `5548:1002`
- Uploads native 96×96 JPEG images to all 15 LCD keys
- Updates the three small status-strip displays
- Clears empty key slots and commits the display refresh
- Applies physical display brightness
- Maintains profiles and local drafts
- Supports static and animated custom icons with momentary or toggle states
- Listens for buttons and rotary-dial events through the vendor HID interface
- Runs explicit shell actions and built-in Linux media/session actions on key presses
- Streams hardware and action status directly into the native UI

The **Sync to deck** button performs a real hardware transfer. Failed USB access is
reported as an error and never presented as a successful sync.

The hardware service monitors the N1 connection continuously. If the USB cable is
removed, Studio releases the stale HID handle and automatically opens the controller
again after it is reconnected. Restarting Studio is not required.

## Commands

```bash
npm run dev            # Start the native Tauri application
npm run build          # Build the Debian package
npm run check          # JavaScript, Python, shell, and Rust formatting checks
npm run driver:probe   # Open the N1 and report driver status
npm run setup:driver   # Install SDK dependencies and udev permissions
npm run setup:udev     # Install only the USB permission rule
```

See [docs/HARDWARE.md](docs/HARDWARE.md) for device details, safety boundaries, and the
optional USB capture workflow.
