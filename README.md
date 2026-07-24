# N1 Stream Controller Studio

## ⚠️ EARLY ALPHA — DO NOT USE ⚠️

> [!CAUTION]
> **This software is currently EARLY ALPHA and is unsafe to use.**
> Do not use it with your hardware or rely on it for production workflows.
> **Wait for the BETA release before using this software.**

A Linux-first configuration UI and hardware service for the TreasLin VSDinside N1
stream controller.

![N1 Stream Controller Studio interface](docs/images/n1-stream-controller-studio.png)

## Install the latest release

On x86_64 Debian, Ubuntu, or Linux Mint, the installer downloads the newest published
Debian package, validates it, installs its dependencies, and configures N1 USB
permissions:

```bash
curl -fsSL https://raw.githubusercontent.com/plasticparticle/n1-stream-controller-studio/main/install.sh \
  | bash -s -- --accept-alpha-risk
```

The explicit flag is required because the project is still unsafe EARLY ALPHA
software. To inspect the script before running it:

```bash
curl -fsSLO https://raw.githubusercontent.com/plasticparticle/n1-stream-controller-studio/main/install.sh
less install.sh
bash install.sh --accept-alpha-risk
```

Use `--version TAG` to install a particular release or `--dry-run` to download and
validate it without changing the system. Running the installer again upgrades an
existing installation.

## Native architecture

Studio is a Tauri 2 desktop application. Its HTML, CSS, and JavaScript interface is
bundled into the application and loaded by the system webview. It communicates with
the Rust core through in-process Tauri commands and events—there is no local web
server and no listening TCP port.

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

## Build and run from source

The current build targets x86_64 Linux and has been tested on Linux Mint 22.3
(Ubuntu 24.04 base).

Install Node.js (which includes npm), Python, and the native Linux build dependencies:

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf \
  nodejs python3 python3-venv git
```

> **Rust is required:** Install it from the
> [official Rust installer page](https://www.rust-lang.org/tools/install) before
> building, running, or checking Studio from source.

After installing Rust, open a new terminal or load Cargo into the current shell:

```bash
source "$HOME/.cargo/env"
cargo --version
```

Then install the JavaScript tooling and pinned vendor SDK:

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

The first run builds the Rust application and packages the Python hardware bridge
into a self-contained sidecar.

## Build a Debian package

```bash
npm run build
```

The package is written below `src-tauri/target/release/bundle/deb/` and includes the
native application, bundled frontend, and self-contained hardware sidecar. Node.js,
Rust, Python, and `.venv` are build-time requirements only; they are not required to
run the installed package.

The host still needs the N1 USB permission rule. When building from this repository,
install or update it with `npm run setup:udev`, then unplug and reconnect the
controller.

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
npm run check          # Run formatting, syntax, and native unit-test checks
npm run driver:probe   # Open the N1 and report driver status
npm run setup:driver   # Install SDK dependencies and udev permissions
npm run setup:udev     # Install only the USB permission rule
```

See [docs/HARDWARE.md](docs/HARDWARE.md) for device details, safety boundaries, and the
optional USB capture workflow.
