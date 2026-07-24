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

Install the pinned vendor SDK and the narrowly scoped udev permission rule:

```bash
npm run setup:driver
```

The setup command creates `.venv`, installs pip/setuptools/wheel, and builds the pinned
vendor SDK. It asks for your sudo password only when the udev rule is missing or
outdated. Unplug and reconnect the N1 after a new rule is installed.

If `.venv` is already present and only USB permission is missing, run:

```bash
npm run setup:udev
```

Start the application on any free port:

```bash
PORT=4197 npm run dev
```

Open `http://127.0.0.1:4197` in Chromium.

## Linux Mint tray app

Install the GTK, XApp, notification, and WebKit bindings used by the native tray shell:

```bash
sudo apt install python3-gi gir1.2-gtk-3.0 gir1.2-xapp-1.0 \
  gir1.2-notify-0.7 gir1.2-webkit2-4.1
```

Install the N1 icon in the Mint application menu and start it automatically in the
notification area:

```bash
npm run setup:tray
npm run tray
```

Click the N1 tray icon to open a chromeless Studio window. Closing the window keeps the
controller service in the tray. Right-click the icon for Open, Reload, Restart, startup,
and Quit controls. On Linux Mint, the tray uses the native XApp status-icon API. The
tray uses port `4180` by default; override it with `N1_STUDIO_PORT` when needed.

### Updating an existing tray installation

After pulling a newer version, quit the running Studio from its tray menu and refresh
the installed launcher, icon, and autostart entry:

```bash
git pull
npm run setup:tray
npm run check
npm run tray
```

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
- Streams hardware and action status back into the browser UI

The **Sync to deck** button performs a real hardware transfer. Failed USB access is
reported as an error and never presented as a successful sync.

## Commands

```bash
npm run check          # JavaScript, Python, and shell syntax checks
npm run driver:probe   # Open the N1 and report driver status
npm run setup:driver   # Install SDK dependencies and udev permissions
npm run setup:tray     # Install or refresh the Mint launcher and tray app
npm run setup:udev     # Install only the USB permission rule
npm run tray           # Start the native Mint tray and Studio window
```

See [docs/HARDWARE.md](docs/HARDWARE.md) for device details, safety boundaries, and the
optional USB capture workflow.
