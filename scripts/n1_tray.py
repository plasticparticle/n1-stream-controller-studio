#!/usr/bin/env python3
"""Linux Mint tray and chromeless WebKit shell for N1 Stream Controller Studio."""

from __future__ import annotations

import argparse
import json
import os
import signal
import socket
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

import gi

gi.require_version("Gtk", "3.0")
gi.require_version("Gdk", "3.0")
gi.require_version("Notify", "0.7")
gi.require_version("WebKit2", "4.1")
gi.require_version("XApp", "1.0")

from gi.repository import Gdk, Gio, GLib, Gtk, Notify, WebKit2, XApp


APP_NAME = "N1 Stream Controller Studio"
APP_ID = "n1-stream-controller-studio"
PROJECT_DIR = Path(__file__).resolve().parent.parent
ICON_PATH = PROJECT_DIR / "assets" / f"{APP_ID}.svg"
PORT = int(os.environ.get("N1_STUDIO_PORT", "4180"))
STUDIO_URL = os.environ.get("N1_STUDIO_URL", f"http://127.0.0.1:{PORT}/")
API_URL = STUDIO_URL.rstrip("/") + "/api/device"


class StudioTray:
    def __init__(self, show_window: bool = False) -> None:
        self.server_process: subprocess.Popen[bytes] | None = None
        self.server_log = None
        self.server_owned = False
        self.ready_attempts = 0
        self.page_loaded = False

        Notify.init(APP_NAME)
        self.window = self._build_window()
        self.webview = self._build_webview()
        self.window.add(self.webview)
        self.menu = self._build_menu()
        self.tray = self._build_tray()

        self.ensure_server()
        if show_window:
            GLib.idle_add(self.open_window)

    def _build_window(self) -> Gtk.Window:
        window = Gtk.Window(title=APP_NAME)
        window.set_default_size(1420, 900)
        window.set_size_request(900, 620)
        window.set_position(Gtk.WindowPosition.CENTER)
        window.set_icon_from_file(str(ICON_PATH))
        window.connect("delete-event", self.hide_window)
        window.connect("destroy", lambda *_args: Gtk.main_quit())
        return window

    def _build_webview(self) -> WebKit2.WebView:
        view = WebKit2.WebView()
        settings = view.get_settings()
        settings.set_enable_developer_extras(False)
        settings.set_enable_write_console_messages_to_stdout(False)
        view.set_background_color(Gdk.RGBA(0.035, 0.047, 0.055, 1.0))
        view.connect("decide-policy", self.handle_navigation)
        view.load_html(
            """
            <html>
              <body style="margin:0;background:#090c0e;color:#dce7e3;
                           font:500 15px system-ui;display:grid;place-items:center">
                <div style="text-align:center">
                  <div style="font-size:32px;margin-bottom:12px;color:#37b7ff">N1</div>
                  Starting N1 Stream Controller Studio…
                </div>
              </body>
            </html>
            """,
            STUDIO_URL,
        )
        return view

    def _build_tray(self) -> XApp.StatusIcon:
        tray = XApp.StatusIcon.new_with_name(APP_ID)
        tray.set_icon_name(str(ICON_PATH))
        tray.set_tooltip_text(f"{APP_NAME}\nClick to open")
        tray.set_visible(True)
        tray.connect("activate", self.activate_tray)
        tray.set_secondary_menu(self.menu)
        return tray

    def _build_menu(self) -> Gtk.Menu:
        menu = Gtk.Menu()

        open_item = Gtk.MenuItem(label="Open Studio")
        open_item.connect("activate", lambda *_args: self.open_window())
        menu.append(open_item)

        reload_item = Gtk.MenuItem(label="Reload View")
        reload_item.connect("activate", lambda *_args: self.reload_view())
        menu.append(reload_item)

        restart_item = Gtk.MenuItem(label="Restart Studio Service")
        restart_item.connect("activate", lambda *_args: self.restart_server())
        menu.append(restart_item)

        menu.append(Gtk.SeparatorMenuItem())

        self.autostart_item = Gtk.CheckMenuItem(label="Start automatically on login")
        self.autostart_item.set_active(self.autostart_path().exists())
        self.autostart_item.connect("toggled", self.toggle_autostart)
        menu.append(self.autostart_item)

        menu.append(Gtk.SeparatorMenuItem())

        quit_item = Gtk.MenuItem(label="Quit")
        quit_item.connect("activate", lambda *_args: self.quit())
        menu.append(quit_item)

        menu.show_all()
        return menu

    def activate_tray(
        self, _icon: XApp.StatusIcon, _button: int, _event_time: int
    ) -> None:
        self.open_window()

    def handle_navigation(
        self,
        _view: WebKit2.WebView,
        decision: WebKit2.PolicyDecision,
        decision_type: WebKit2.PolicyDecisionType,
    ) -> bool:
        if decision_type != WebKit2.PolicyDecisionType.NAVIGATION_ACTION:
            return False
        navigation = decision.get_navigation_action()
        request = navigation.get_request()
        uri = request.get_uri()
        if uri.startswith(STUDIO_URL) or uri == "about:blank":
            return False
        Gio.AppInfo.launch_default_for_uri(uri, None)
        decision.ignore()
        return True

    def server_is_ready(self) -> bool:
        try:
            request = urllib.request.Request(API_URL, headers={"Accept": "application/json"})
            with urllib.request.urlopen(request, timeout=0.5) as response:
                payload = json.loads(response.read().decode("utf-8"))
            return isinstance(payload, dict) and "driver" in payload and "connected" in payload
        except (OSError, ValueError, urllib.error.URLError):
            return False

    def port_is_open(self) -> bool:
        try:
            with socket.create_connection(("127.0.0.1", PORT), timeout=0.25):
                return True
        except OSError:
            return False

    def ensure_server(self) -> bool:
        if self.server_is_ready():
            self.load_studio()
            return True

        if self.server_process and self.server_process.poll() is None:
            return False

        if self.port_is_open():
            self.notify(
                "Port conflict",
                f"Port {PORT} is in use by another application. "
                "Set N1_STUDIO_PORT to a free port before starting the tray.",
            )
            return False

        state_home = Path(
            os.environ.get("XDG_STATE_HOME", Path.home() / ".local" / "state")
        )
        log_dir = state_home / APP_ID
        log_dir.mkdir(parents=True, exist_ok=True)
        self.server_log = (log_dir / "service.log").open("ab", buffering=0)

        environment = os.environ.copy()
        environment["PORT"] = str(PORT)
        try:
            self.server_process = subprocess.Popen(
                ["node", str(PROJECT_DIR / "server.js")],
                cwd=PROJECT_DIR,
                env=environment,
                stdin=subprocess.DEVNULL,
                stdout=self.server_log,
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )
        except OSError as error:
            self.notify("Could not start Studio", str(error))
            return False

        self.server_owned = True
        self.ready_attempts = 0
        GLib.timeout_add(250, self.wait_for_server)
        return False

    def wait_for_server(self) -> bool:
        if self.server_is_ready():
            self.load_studio()
            return False

        self.ready_attempts += 1
        if self.server_process and self.server_process.poll() is not None:
            self.notify(
                "Studio service stopped",
                "Open ~/.local/state/n1-stream-controller-studio/service.log for details.",
            )
            return False
        if self.ready_attempts >= 40:
            self.notify("Studio did not start", f"The service did not become ready on port {PORT}.")
            return False
        return True

    def load_studio(self) -> None:
        if not self.page_loaded or self.webview.get_uri() != STUDIO_URL:
            self.webview.load_uri(STUDIO_URL)
            self.page_loaded = True

    def open_window(self) -> bool:
        self.ensure_server()
        self.window.show_all()
        if self.window.get_window():
            self.window.present_with_time(Gtk.get_current_event_time())
        return False

    def hide_window(self, *_args: object) -> bool:
        self.window.hide()
        return True

    def reload_view(self) -> None:
        if self.server_is_ready():
            self.webview.load_uri(STUDIO_URL)
            self.page_loaded = True
        else:
            self.page_loaded = False
            self.ensure_server()

    def stop_owned_server(self) -> None:
        process = self.server_process
        if not self.server_owned or process is None or process.poll() is not None:
            return
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        self.server_process = None
        self.server_owned = False

    def restart_server(self) -> None:
        if not self.server_owned and self.server_is_ready():
            self.notify(
                "Service managed elsewhere",
                "The running Studio service was not started by this tray process.",
            )
            self.reload_view()
            return
        self.stop_owned_server()
        self.page_loaded = False
        GLib.timeout_add(500, self._restart_after_stop)

    def _restart_after_stop(self) -> bool:
        self.ensure_server()
        return False

    @staticmethod
    def autostart_path() -> Path:
        config_home = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config"))
        return config_home / "autostart" / f"{APP_ID}.desktop"

    def toggle_autostart(self, item: Gtk.CheckMenuItem) -> None:
        target = self.autostart_path()
        if item.get_active():
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(
                "\n".join(
                    [
                        "[Desktop Entry]",
                        "Type=Application",
                        f"Name={APP_NAME}",
                        f'Exec="{Path(__file__).resolve()}" --hidden',
                        f"Icon={APP_ID}",
                        "Terminal=false",
                        "X-GNOME-Autostart-enabled=true",
                        "StartupNotify=false",
                        "",
                    ]
                ),
                encoding="utf-8",
            )
        else:
            target.unlink(missing_ok=True)

    @staticmethod
    def notify(title: str, message: str) -> None:
        notification = Notify.Notification.new(title, message, str(ICON_PATH))
        notification.show()

    def quit(self) -> None:
        self.stop_owned_server()
        if self.server_log:
            self.server_log.close()
        self.tray.set_visible(False)
        Gtk.main_quit()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--show",
        action="store_true",
        help="open the Studio window immediately instead of starting in the tray",
    )
    parser.add_argument("--hidden", action="store_true", help=argparse.SUPPRESS)
    arguments = parser.parse_args()

    if not ICON_PATH.exists():
        print(f"Tray icon is missing: {ICON_PATH}", file=sys.stderr)
        return 1

    studio = StudioTray(show_window=arguments.show and not arguments.hidden)

    def stop_from_signal() -> bool:
        studio.quit()
        return GLib.SOURCE_REMOVE

    GLib.unix_signal_add(GLib.PRIORITY_DEFAULT, signal.SIGTERM, stop_from_signal)
    GLib.unix_signal_add(GLib.PRIORITY_DEFAULT, signal.SIGINT, stop_from_signal)
    Gtk.main()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
