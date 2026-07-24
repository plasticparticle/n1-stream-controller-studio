use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use serde::Serialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex, MutexGuard, mpsc};
use std::thread;
use std::time::Duration;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, RunEvent, State, WindowEvent};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};

const USB_ROOT: &str = "/sys/bus/usb/devices";
const USB_VENDOR_ID: &str = "5548";
const USB_PRODUCT_ID: &str = "1002";
const MAX_ASSET_BYTES: usize = 5_000_000;
const MAX_SOUND_BYTES: usize = 20_000_000;
const IMAGE_EXTENSIONS: &[&str] = &[".gif", ".jpg", ".jpeg", ".png", ".webp"];
const SOUND_EXTENSIONS: &[&str] = &[".flac", ".mp3", ".ogg", ".wav"];

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DriverPublicState {
    status: String,
    error: String,
}

struct DriverInner {
    child: Option<CommandChild>,
    next_id: u64,
    pending: HashMap<String, mpsc::Sender<Result<Value, String>>>,
    public: DriverPublicState,
    stopping: bool,
}

struct DriverBridge {
    inner: Mutex<DriverInner>,
}

struct ActiveSound {
    pid: u32,
    stop: mpsc::Sender<mpsc::Sender<()>>,
}

struct AppCore {
    app: AppHandle,
    driver: DriverBridge,
    active_config: Mutex<Option<Value>>,
    key_visual_states: Mutex<HashMap<u64, bool>>,
    active_sounds: Arc<Mutex<HashMap<i64, ActiveSound>>>,
    config_path: PathBuf,
    asset_root: PathBuf,
    project_root: PathBuf,
}

struct AppState(Arc<AppCore>);

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

fn error_text(error: impl std::fmt::Display) -> String {
    error.to_string()
}

impl DriverBridge {
    fn new() -> Self {
        Self {
            inner: Mutex::new(DriverInner {
                child: None,
                next_id: 1,
                pending: HashMap::new(),
                public: DriverPublicState {
                    status: "stopped".into(),
                    error: String::new(),
                },
                stopping: false,
            }),
        }
    }

    fn public_state(&self) -> DriverPublicState {
        lock(&self.inner).public.clone()
    }

    fn set_state(&self, core: &AppCore, status: &str, error: impl Into<String>) {
        let public = {
            let mut inner = lock(&self.inner);
            inner.public = DriverPublicState {
                status: status.into(),
                error: error.into(),
            };
            inner.public.clone()
        };
        core.emit(json!({
            "event": "driver",
            "status": public.status,
            "error": public.error
        }));
    }

    fn start(&self, core: Arc<AppCore>) -> Result<(), String> {
        {
            let mut inner = lock(&self.inner);
            if inner.child.is_some() {
                return Ok(());
            }
            inner.stopping = false;
            inner.public = DriverPublicState {
                status: "starting".into(),
                error: String::new(),
            };
        }
        core.emit(json!({"event": "driver", "status": "starting", "error": ""}));

        let command = core.app.shell().sidecar("n1-driver").map_err(error_text)?;
        let (mut events, child) = command.spawn().map_err(|error| {
            let message = format!("Unable to start the bundled N1 driver: {error}");
            self.set_state(&core, "not_installed", &message);
            message
        })?;
        lock(&self.inner).child = Some(child);

        tauri::async_runtime::spawn(async move {
            let mut stdout_buffer = Vec::new();
            while let Some(event) = events.recv().await {
                match event {
                    CommandEvent::Stdout(bytes) => {
                        stdout_buffer.extend_from_slice(&bytes);
                        while let Some(newline) =
                            stdout_buffer.iter().position(|byte| *byte == b'\n')
                        {
                            let line = stdout_buffer.drain(..=newline).collect::<Vec<_>>();
                            let line = String::from_utf8_lossy(&line);
                            core.handle_driver_line(line.trim());
                        }
                    }
                    CommandEvent::Stderr(bytes) => {
                        let message = String::from_utf8_lossy(&bytes).trim().to_string();
                        if !message.is_empty() {
                            eprintln!("[N1 driver] {message}");
                            core.emit(json!({
                                "event": "driver_log",
                                "level": "error",
                                "message": message
                            }));
                        }
                    }
                    CommandEvent::Error(message) => {
                        core.driver.set_state(
                            &core,
                            "error",
                            format!("N1 driver error: {message}"),
                        );
                    }
                    CommandEvent::Terminated(payload) => {
                        core.driver.handle_exit(
                            &core,
                            format!("N1 driver exited with code {:?}", payload.code),
                        );
                        break;
                    }
                    _ => {}
                }
            }
        });
        Ok(())
    }

    fn request(
        &self,
        core: Arc<AppCore>,
        command: &str,
        payload: Value,
        timeout: Duration,
    ) -> Result<Value, String> {
        self.start(core.clone())?;
        let (sender, receiver) = mpsc::channel();
        let id = {
            let mut inner = lock(&self.inner);
            let id = inner.next_id.to_string();
            inner.next_id += 1;
            inner.pending.insert(id.clone(), sender);
            let message = json!({
                "id": id,
                "command": command,
                "payload": payload
            });
            let encoded = format!("{message}\n");
            let write_result = inner
                .child
                .as_mut()
                .ok_or_else(|| "N1 driver is not running".to_string())?
                .write(encoded.as_bytes());
            if let Err(error) = write_result {
                inner.pending.remove(&id);
                return Err(format!("Unable to write to the N1 driver: {error}"));
            }
            id
        };

        match receiver.recv_timeout(timeout) {
            Ok(result) => result,
            Err(mpsc::RecvTimeoutError::Timeout) => {
                lock(&self.inner).pending.remove(&id);
                Err(format!("N1 driver timed out while running {command}"))
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                Err("N1 driver stopped before responding".into())
            }
        }
    }

    fn resolve_response(&self, message: &Value) -> bool {
        let Some(id) = message.get("id").and_then(Value::as_str) else {
            return false;
        };
        let Some(sender) = lock(&self.inner).pending.remove(id) else {
            return false;
        };
        let result = if message.get("ok").and_then(Value::as_bool) == Some(true) {
            Ok(message.clone())
        } else {
            Err(message
                .get("error")
                .and_then(Value::as_str)
                .unwrap_or("N1 driver command failed")
                .to_string())
        };
        let _ = sender.send(result);
        true
    }

    fn handle_exit(&self, core: &Arc<AppCore>, error: String) {
        let (pending, restart) = {
            let mut inner = lock(&self.inner);
            inner.child = None;
            let pending = inner
                .pending
                .drain()
                .map(|(_, sender)| sender)
                .collect::<Vec<_>>();
            let restart = !inner.stopping;
            (pending, restart)
        };
        for sender in pending {
            let _ = sender.send(Err(error.clone()));
        }
        if restart {
            self.set_state(core, "reconnecting", &error);
            let core = core.clone();
            thread::spawn(move || {
                thread::sleep(Duration::from_secs(1));
                let _ = core.driver.start(core.clone());
            });
        } else {
            self.set_state(core, "stopped", "");
        }
    }

    fn stop(&self) {
        let (child, pending) = {
            let mut inner = lock(&self.inner);
            inner.stopping = true;
            let child = inner.child.take();
            let pending = inner
                .pending
                .drain()
                .map(|(_, sender)| sender)
                .collect::<Vec<_>>();
            (child, pending)
        };
        for sender in pending {
            let _ = sender.send(Err("N1 Studio is shutting down".into()));
        }
        if let Some(child) = child {
            let _ = child.kill();
        }
    }
}

impl AppCore {
    fn new(app: AppHandle) -> Result<Arc<Self>, String> {
        let app_data = app.path().app_data_dir().map_err(error_text)?;
        let asset_root = app_data.join("assets");
        fs::create_dir_all(&asset_root).map_err(error_text)?;

        let project_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .ok_or_else(|| "Unable to resolve the project root".to_string())?
            .to_path_buf();
        let config_path = app_data.join("config.json");
        migrate_legacy_data(&project_root, &config_path, &asset_root)?;
        let active_config = read_json(&config_path);

        Ok(Arc::new(Self {
            app,
            driver: DriverBridge::new(),
            active_config: Mutex::new(active_config),
            key_visual_states: Mutex::new(HashMap::new()),
            active_sounds: Arc::new(Mutex::new(HashMap::new())),
            config_path,
            asset_root,
            project_root,
        }))
    }

    fn emit(&self, payload: Value) {
        let _ = self.app.emit("hardware-event", payload);
    }

    fn handle_driver_line(self: &Arc<Self>, line: &str) {
        if line.is_empty() {
            return;
        }
        let Ok(mut message) = serde_json::from_str::<Value>(line) else {
            eprintln!("[N1 driver] {line}");
            return;
        };
        if self.driver.resolve_response(&message) {
            return;
        }

        match message.get("event").and_then(Value::as_str) {
            Some("status") => {
                let status = message
                    .get("status")
                    .and_then(Value::as_str)
                    .unwrap_or("error");
                let error = message.get("error").and_then(Value::as_str).unwrap_or("");
                self.driver.set_state(self, status, error);
            }
            Some("input") => {
                self.emit(message.clone());
                let core = self.clone();
                thread::spawn(move || core.handle_hardware_input(message));
            }
            _ => {
                if let Some(object) = message.as_object_mut() {
                    object.remove("id");
                }
                self.emit(message);
            }
        }
    }

    fn device_status(&self) -> Value {
        let driver = self.driver.public_state();
        for entry in fs::read_dir(USB_ROOT).into_iter().flatten().flatten() {
            let path = entry.path();
            let vendor_id = read_text(path.join("idVendor")).to_lowercase();
            let product_id = read_text(path.join("idProduct")).to_lowercase();
            if vendor_id == USB_VENDOR_ID && product_id == USB_PRODUCT_ID {
                return json!({
                    "connected": true,
                    "vendorId": vendor_id,
                    "productId": product_id,
                    "manufacturer": fallback(read_text(path.join("manufacturer")), "HOTSPOTEKUSB"),
                    "product": fallback(read_text(path.join("product")), "VSDinside N1"),
                    "busPath": entry.file_name().to_string_lossy(),
                    "transportReady": driver.status == "ready",
                    "driver": driver
                });
            }
        }
        json!({
            "connected": false,
            "vendorId": USB_VENDOR_ID,
            "productId": USB_PRODUCT_ID,
            "product": "VSDinside N1",
            "transportReady": false,
            "driver": driver
        })
    }

    fn sync(self: &Arc<Self>, payload: Value) -> Result<Value, String> {
        let keys = payload
            .get("keys")
            .and_then(Value::as_array)
            .ok_or_else(|| "Sync payload must contain a keys array".to_string())?;
        if keys.len() > 18 {
            return Err("Sync payload must contain at most 18 keys".into());
        }
        let brightness = clamped_number(payload.get("brightness"), 86);
        let page = payload
            .get("page")
            .and_then(Value::as_u64)
            .unwrap_or(1)
            .clamp(1, 99);
        let active_config = json!({
            "profile": payload.get("profile").and_then(Value::as_str).unwrap_or("streaming"),
            "page": page,
            "brightness": brightness,
            "keys": keys
        });
        write_json(&self.config_path, &active_config)?;
        *lock(&self.active_config) = Some(active_config.clone());
        lock(&self.key_visual_states).clear();

        let mut driver_config = active_config;
        let materialized = driver_config["keys"]
            .as_array()
            .expect("keys validated above")
            .iter()
            .map(|key| self.materialize_key(key))
            .collect::<Result<Vec<_>, _>>()?;
        driver_config["keys"] = Value::Array(materialized);
        let result =
            self.driver
                .request(self.clone(), "sync", driver_config, Duration::from_secs(90))?;
        Ok(json!({
            "ok": true,
            "written": result.get("written").and_then(Value::as_u64).unwrap_or(0),
            "animated": result.get("animated").and_then(Value::as_u64).unwrap_or(0),
            "page": result.get("page").and_then(Value::as_u64).unwrap_or(page),
            "brightness": result.get("brightness").and_then(Value::as_u64).unwrap_or(brightness)
        }))
    }

    fn set_brightness(self: &Arc<Self>, brightness: i64) -> Result<Value, String> {
        let brightness = brightness.clamp(0, 100);
        self.driver.request(
            self.clone(),
            "brightness",
            json!({"brightness": brightness}),
            Duration::from_secs(10),
        )?;
        Ok(json!({"ok": true, "brightness": brightness}))
    }

    fn identify(self: &Arc<Self>, brightness: i64) -> Result<Value, String> {
        let brightness = brightness.clamp(0, 100);
        let result = self.driver.request(
            self.clone(),
            "identify",
            json!({"brightness": brightness}),
            Duration::from_secs(10),
        )?;
        Ok(json!({
            "ok": true,
            "brightness": brightness,
            "flashes": result.get("flashes").and_then(Value::as_u64).unwrap_or(2)
        }))
    }

    fn store_asset(&self, payload: Value) -> Result<Value, String> {
        let data_url = payload
            .get("dataUrl")
            .and_then(Value::as_str)
            .ok_or_else(|| "Choose a PNG, JPEG, GIF, or WebP image".to_string())?;
        let (header, encoded) = data_url
            .split_once(',')
            .ok_or_else(|| "Choose a PNG, JPEG, GIF, or WebP image".to_string())?;
        let mime = header
            .strip_prefix("data:")
            .and_then(|value| value.strip_suffix(";base64"))
            .ok_or_else(|| "Choose a PNG, JPEG, GIF, or WebP image".to_string())?;
        let extension = match mime {
            "image/gif" => ".gif",
            "image/jpeg" => ".jpg",
            "image/png" => ".png",
            "image/webp" => ".webp",
            _ => return Err("Choose a PNG, JPEG, GIF, or WebP image".into()),
        };
        let encoded = encoded
            .chars()
            .filter(|character| !character.is_whitespace())
            .collect::<String>();
        let data = BASE64
            .decode(encoded)
            .map_err(|_| "The uploaded image contains invalid base64 data".to_string())?;
        if data.is_empty() || data.len() > MAX_ASSET_BYTES {
            return Err("Icon files must be between 1 byte and 5 MB".into());
        }
        if !valid_image_signature(mime, &data) {
            return Err("The uploaded file is not a valid image".into());
        }

        let digest = hex::encode(Sha256::digest(&data));
        let id = format!("{digest}{extension}");
        let path = self.safe_asset_path(&id)?;
        if !path.exists() {
            write_private_file(&path, &data)?;
        }
        let raw_name = payload
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or("icon");
        let name = Path::new(raw_name)
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("icon")
            .chars()
            .take(120)
            .collect::<String>();
        let animated = detect_animation(mime, &data);
        Ok(json!({
            "ok": true,
            "asset": {
                "id": id,
                "path": path.to_string_lossy(),
                "name": name,
                "mime": mime,
                "animated": animated,
                "size": data.len()
            }
        }))
    }

    fn store_sound(&self, payload: Value) -> Result<Value, String> {
        let name = safe_asset_name(payload.get("name"), "sound");
        let data_url = payload
            .get("dataUrl")
            .and_then(Value::as_str)
            .ok_or_else(|| "Choose a WAV, MP3, OGG, or FLAC sound file".to_string())?;
        let (header, encoded) = data_url
            .split_once(',')
            .ok_or_else(|| "Choose a WAV, MP3, OGG, or FLAC sound file".to_string())?;
        let mime = header
            .strip_prefix("data:")
            .and_then(|value| value.strip_suffix(";base64"))
            .ok_or_else(|| "Choose a WAV, MP3, OGG, or FLAC sound file".to_string())?;
        let extension = match mime {
            "audio/flac" | "audio/x-flac" => ".flac",
            "audio/mpeg" | "audio/mp3" => ".mp3",
            "audio/ogg" => ".ogg",
            "audio/wav" | "audio/wave" | "audio/x-wav" | "audio/vnd.wave" => ".wav",
            _ => match Path::new(&name)
                .extension()
                .and_then(|extension| extension.to_str())
                .map(str::to_ascii_lowercase)
                .as_deref()
            {
                Some("flac") => ".flac",
                Some("mp3") => ".mp3",
                Some("ogg") => ".ogg",
                Some("wav") => ".wav",
                _ => return Err("Choose a WAV, MP3, OGG, or FLAC sound file".into()),
            },
        };
        let stored_mime = match extension {
            ".flac" => "audio/flac",
            ".mp3" => "audio/mpeg",
            ".ogg" => "audio/ogg",
            ".wav" => "audio/wav",
            _ => unreachable!("supported sound extensions are matched above"),
        };
        if encoded.len() > MAX_SOUND_BYTES.saturating_mul(4).div_ceil(3) + 1024 {
            return Err("Sound files must be no larger than 20 MB".into());
        }
        let encoded = encoded
            .chars()
            .filter(|character| !character.is_whitespace())
            .collect::<String>();
        let data = BASE64
            .decode(encoded)
            .map_err(|_| "The uploaded sound contains invalid base64 data".to_string())?;
        if data.is_empty() || data.len() > MAX_SOUND_BYTES {
            return Err("Sound files must be between 1 byte and 20 MB".into());
        }
        if !valid_sound_signature(extension, &data) {
            return Err("The uploaded file is not a valid supported sound".into());
        }

        let digest = hex::encode(Sha256::digest(&data));
        let id = format!("{digest}{extension}");
        let path = self.safe_asset_path(&id)?;
        if !path.exists() {
            write_private_file(&path, &data)?;
        }
        Ok(json!({
            "ok": true,
            "sound": {
                "id": id,
                "path": path.to_string_lossy(),
                "name": name,
                "mime": stored_mime,
                "size": data.len()
            }
        }))
    }

    fn resolve_asset(&self, id: &str) -> Result<String, String> {
        let path = self.safe_asset_path(id)?;
        if !path.is_file() {
            return Err(format!("Icon asset is missing: {id}"));
        }
        Ok(path.to_string_lossy().into_owned())
    }

    fn safe_asset_path(&self, id: &str) -> Result<PathBuf, String> {
        let (digest, extension) = id.split_at_checked(64).ok_or("Invalid icon asset ID")?;
        if !digest
            .chars()
            .all(|character| character.is_ascii_hexdigit())
            || (!IMAGE_EXTENSIONS.contains(&extension) && !SOUND_EXTENSIONS.contains(&extension))
        {
            return Err("Invalid stored asset ID".into());
        }
        Ok(self.asset_root.join(id))
    }

    fn materialize_key(&self, key: &Value) -> Result<Value, String> {
        if key.is_null() {
            return Ok(Value::Null);
        }
        let mut key = key.clone();
        let visuals = key
            .get("visuals")
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();
        let primary = self.materialize_visual(visuals.get("primary"))?;
        let secondary = self.materialize_visual(visuals.get("secondary"))?;
        key["visuals"] = json!({"primary": primary, "secondary": secondary});
        key["sound"] = self.materialize_sound(key.get("sound"))?;
        Ok(key)
    }

    fn materialize_visual(&self, visual: Option<&Value>) -> Result<Value, String> {
        let Some(visual) = visual.filter(|visual| visual.is_object()) else {
            return Ok(Value::Null);
        };
        let id = visual
            .get("id")
            .and_then(Value::as_str)
            .ok_or_else(|| "Icon asset has no ID".to_string())?;
        if !has_asset_extension(id, IMAGE_EXTENSIONS) {
            return Err("Invalid icon asset ID".into());
        }
        let path = self.safe_asset_path(id)?;
        if !path.is_file() {
            let name = visual.get("name").and_then(Value::as_str).unwrap_or(id);
            return Err(format!("Icon asset is missing: {name}"));
        }
        let mut materialized = visual.clone();
        materialized["path"] = Value::String(path.to_string_lossy().into_owned());
        Ok(materialized)
    }

    fn materialize_sound(&self, sound: Option<&Value>) -> Result<Value, String> {
        let Some(sound) = sound.filter(|sound| sound.is_object()) else {
            return Ok(Value::Null);
        };
        let id = sound
            .get("id")
            .and_then(Value::as_str)
            .ok_or_else(|| "Sound file has no ID".to_string())?;
        if !has_asset_extension(id, SOUND_EXTENSIONS) {
            return Err("Invalid sound asset ID".into());
        }
        let path = self.safe_asset_path(id)?;
        if !path.is_file() {
            let name = sound.get("name").and_then(Value::as_str).unwrap_or(id);
            return Err(format!("Sound file is missing: {name}"));
        }
        let mut materialized = sound.clone();
        materialized["path"] = Value::String(path.to_string_lossy().into_owned());
        Ok(materialized)
    }

    fn test_action(&self, key: i64, action: Value) -> Result<Value, String> {
        self.execute_action(&action, key)?;
        Ok(json!({"ok": true}))
    }

    fn execute_action(&self, action: &Value, key: i64) -> Result<(), String> {
        let name = action_name(action, key);
        let is_sound = action.get("id").and_then(Value::as_str) == Some("sound");
        if is_sound {
            let active = lock(&self.active_sounds).remove(&key);
            if let Some(active) = active {
                let restart = !loop_sound_until_pressed(action) && restart_sound_on_press(action);
                let (complete, stopped) = mpsc::channel();
                let stop_sent = active.stop.send(complete).is_ok();
                if stop_sent && restart {
                    let _ = stopped.recv_timeout(Duration::from_secs(1));
                }
                if stop_sent && !restart {
                    self.emit(json!({
                        "event": "action",
                        "ok": true,
                        "key": key,
                        "name": name,
                        "stopped": true
                    }));
                    return Ok(());
                }
            }
        }
        let resolved = if is_sound {
            self.resolve_sound_commands(action)
        } else {
            resolve_action_command(action)
                .map(|command| vec![command])
                .ok_or_else(|| "This action needs a command or integration target".to_string())
        };
        let commands = match resolved {
            Ok(commands) => commands,
            Err(error) => {
                self.emit(json!({
                    "event": "action",
                    "ok": false,
                    "key": key,
                    "name": &name,
                    "error": &error
                }));
                return Err(error);
            }
        };
        let mut last_error = None;
        for resolved in commands {
            match spawn_resolved_action(&resolved, &self.project_root) {
                Ok(child) => {
                    if is_sound {
                        let replay = loop_sound_until_pressed(action).then_some(resolved);
                        self.track_sound(key, child, replay);
                    } else {
                        thread::spawn(move || {
                            let mut child = child;
                            let _ = child.wait();
                        });
                    }
                    self.emit(json!({
                        "event": "action",
                        "ok": true,
                        "key": key,
                        "name": name,
                        "playing": is_sound,
                        "looping": is_sound && loop_sound_until_pressed(action)
                    }));
                    return Ok(());
                }
                Err(error) => last_error = Some(error),
            }
        }
        let error = if is_sound {
            "No supported audio player is installed (tried PipeWire, PulseAudio, GStreamer, ffplay, mpv, VLC, and mpg123)".to_string()
        } else {
            last_error
                .map(|error| error.to_string())
                .unwrap_or_else(|| "Action could not be started".into())
        };
        self.emit(json!({
            "event": "action",
            "ok": false,
            "key": key,
            "name": name,
            "error": error
        }));
        Err(error)
    }

    fn track_sound(&self, key: i64, mut child: Child, replay: Option<ResolvedAction>) {
        let pid = child.id();
        let (stop, stop_requested) = mpsc::channel();
        lock(&self.active_sounds).insert(key, ActiveSound { pid, stop });
        let active_sounds = self.active_sounds.clone();
        let project_root = self.project_root.clone();
        thread::spawn(move || {
            let mut completion = None;
            'playback: loop {
                loop {
                    match child.try_wait() {
                        Ok(Some(_)) => break,
                        Err(_) => break 'playback,
                        Ok(None) => {}
                    }
                    match stop_requested.recv_timeout(Duration::from_millis(40)) {
                        Ok(complete) => {
                            let _ = child.kill();
                            let _ = child.wait();
                            completion = Some(complete);
                            break 'playback;
                        }
                        Err(mpsc::RecvTimeoutError::Disconnected) => {
                            let _ = child.kill();
                            let _ = child.wait();
                            break 'playback;
                        }
                        Err(mpsc::RecvTimeoutError::Timeout) => {}
                    }
                }

                let Some(replay) = replay.as_ref() else {
                    break;
                };
                match stop_requested.recv_timeout(Duration::from_millis(15)) {
                    Ok(complete) => {
                        completion = Some(complete);
                        break 'playback;
                    }
                    Err(mpsc::RecvTimeoutError::Disconnected) => break 'playback,
                    Err(mpsc::RecvTimeoutError::Timeout) => {}
                }
                match spawn_resolved_action(replay, &project_root) {
                    Ok(next_child) => child = next_child,
                    Err(_) => {
                        break 'playback;
                    }
                }
            }
            let mut active = lock(&active_sounds);
            if active.get(&key).is_some_and(|sound| sound.pid == pid) {
                active.remove(&key);
            }
            drop(active);
            if let Some(complete) = completion {
                let _ = complete.send(());
            }
        });
    }

    fn stop_all_sounds(&self) {
        let sounds = lock(&self.active_sounds)
            .drain()
            .map(|(_, sound)| sound.stop)
            .collect::<Vec<_>>();
        for stop in sounds {
            let (complete, _) = mpsc::channel();
            let _ = stop.send(complete);
        }
    }

    fn resolve_sound_commands(&self, action: &Value) -> Result<Vec<ResolvedAction>, String> {
        let sound = action
            .get("sound")
            .and_then(Value::as_object)
            .ok_or_else(|| "Choose a sound file for this action".to_string())?;
        let id = sound
            .get("id")
            .and_then(Value::as_str)
            .ok_or_else(|| "Choose a sound file for this action".to_string())?;
        if !has_asset_extension(id, SOUND_EXTENSIONS) {
            return Err("Invalid sound asset ID".into());
        }
        let path = self.safe_asset_path(id)?;
        if !path.is_file() {
            return Err(format!(
                "Sound file is missing: {}",
                sound.get("name").and_then(Value::as_str).unwrap_or(id)
            ));
        }
        Ok(sound_player_commands(&path))
    }

    fn handle_hardware_input(self: Arc<Self>, event: Value) {
        match event.get("type").and_then(Value::as_str) {
            Some("knob_rotate") => {
                let step = if event.get("direction").and_then(Value::as_str) == Some("right") {
                    "5%+"
                } else {
                    "5%-"
                };
                self.run_fixed_action(
                    "wpctl",
                    &["set-volume", "@DEFAULT_AUDIO_SINK@", step],
                    "Volume",
                );
                return;
            }
            Some("knob_press") if event.get("state").and_then(Value::as_i64) == Some(1) => {
                self.run_fixed_action(
                    "wpctl",
                    &["set-mute", "@DEFAULT_AUDIO_SINK@", "toggle"],
                    "Mute",
                );
                return;
            }
            Some("button") => {}
            _ => return,
        }

        let key_number = event.get("key").and_then(Value::as_u64).unwrap_or(0);
        let state = event.get("state").and_then(Value::as_i64).unwrap_or(0);
        let action = lock(&self.active_config)
            .as_ref()
            .and_then(|config| config.get("keys"))
            .and_then(Value::as_array)
            .and_then(|keys| {
                key_number
                    .checked_sub(1)
                    .and_then(|index| keys.get(index as usize))
            })
            .cloned();
        let Some(action) = action.filter(|action| !action.is_null()) else {
            return;
        };

        let secondary = action
            .pointer("/visuals/secondary")
            .is_some_and(|visual| !visual.is_null());
        let behavior = action
            .get("visualBehavior")
            .and_then(Value::as_str)
            .unwrap_or("momentary");
        if secondary && state == 1 {
            let next_state = if behavior == "toggle" {
                let mut states = lock(&self.key_visual_states);
                let next = !states.get(&key_number).copied().unwrap_or(false);
                states.insert(key_number, next);
                next
            } else {
                lock(&self.key_visual_states).insert(key_number, true);
                true
            };
            self.apply_key_visual_state(key_number, &action, next_state, behavior);
        } else if secondary && state == 0 && behavior != "toggle" {
            lock(&self.key_visual_states).insert(key_number, false);
            self.apply_key_visual_state(key_number, &action, false, behavior);
        }

        if state == 1 {
            let _ = self.execute_action(&action, key_number as i64);
        }
    }

    fn apply_key_visual_state(
        self: &Arc<Self>,
        key: u64,
        action: &Value,
        secondary: bool,
        behavior: &str,
    ) {
        let result = self.materialize_key(action).and_then(|config| {
            self.driver.request(
                self.clone(),
                "key_state",
                json!({"key": key, "secondary": secondary, "config": config}),
                Duration::from_secs(30),
            )
        });
        match result {
            Ok(_) => self.emit(json!({
                "event": "key_visual",
                "ok": true,
                "key": key,
                "state": if secondary { "secondary" } else { "primary" },
                "behavior": behavior
            })),
            Err(error) => self.emit(json!({
                "event": "key_visual",
                "ok": false,
                "key": key,
                "error": error
            })),
        }
    }

    fn run_fixed_action(&self, program: &str, args: &[&str], name: &str) {
        if let Err(error) = Command::new(program)
            .args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
        {
            self.emit(json!({
                "event": "action",
                "ok": false,
                "name": name,
                "error": error.to_string()
            }));
        }
    }
}

#[derive(Clone)]
struct ResolvedAction {
    program: String,
    args: Vec<String>,
}

fn spawn_resolved_action(resolved: &ResolvedAction, project_root: &Path) -> std::io::Result<Child> {
    let mut command = Command::new(&resolved.program);
    command
        .args(&resolved.args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    if project_root.is_dir() {
        command.current_dir(project_root);
    }
    command.spawn()
}

fn sound_player_commands(path: &Path) -> Vec<ResolvedAction> {
    let path = path.to_string_lossy().into_owned();
    let direct = |program: &str, args: &[&str]| ResolvedAction {
        program: program.into(),
        args: args.iter().map(|value| (*value).into()).collect(),
    };
    let mut commands = Vec::new();
    let compressed = path.ends_with(".mp3");
    if !compressed {
        commands.push(direct("pw-play", &[&path]));
        commands.push(direct("paplay", &[&path]));
    }
    commands.push(direct("gst-play-1.0", &[&path]));
    commands.push(direct(
        "ffplay",
        &["-nodisp", "-autoexit", "-loglevel", "quiet", &path],
    ));
    commands.push(direct("mpv", &["--no-video", "--really-quiet", &path]));
    commands.push(direct(
        "cvlc",
        &["--play-and-exit", "--intf", "dummy", &path],
    ));
    if compressed {
        commands.push(direct("mpg123", &["-q", &path]));
        commands.push(direct("pw-play", &[&path]));
        commands.push(direct("paplay", &[&path]));
    }
    commands
}

fn resolve_action_command(action: &Value) -> Option<ResolvedAction> {
    let explicit = action
        .get("command")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    if !explicit.is_empty() {
        return Some(shell_action(explicit));
    }
    let target = action
        .get("target")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    let fixed = |program: &str, args: &[&str]| ResolvedAction {
        program: program.into(),
        args: args.iter().map(|value| (*value).into()).collect(),
    };
    match action.get("id").and_then(Value::as_str)? {
        "mic" => Some(fixed(
            "wpctl",
            &["set-mute", "@DEFAULT_AUDIO_SOURCE@", "toggle"],
        )),
        "volume" => Some(fixed(
            "wpctl",
            &["set-mute", "@DEFAULT_AUDIO_SINK@", "toggle"],
        )),
        "music" => Some(fixed("playerctl", &["play-pause"])),
        "lock" => Some(fixed("loginctl", &["lock-session"])),
        "website" if target.starts_with("http://") || target.starts_with("https://") => {
            Some(fixed("xdg-open", &[target]))
        }
        "folder" if target.starts_with('/') || target.starts_with("file:") => {
            Some(fixed("xdg-open", &[target]))
        }
        "launch" | "command" | "hotkey" if valid_shell_target(target) => Some(shell_action(target)),
        id if id.starts_with("custom-") && valid_shell_target(target) => Some(shell_action(target)),
        _ => None,
    }
}

fn shell_action(command: &str) -> ResolvedAction {
    ResolvedAction {
        program: "/bin/sh".into(),
        args: vec!["-lc".into(), command.into()],
    }
}

fn valid_shell_target(target: &str) -> bool {
    !target.is_empty()
        && !["choose", "execute", "ctrl +"]
            .iter()
            .any(|marker| target.to_lowercase().contains(marker))
}

fn action_name(action: &Value, key: i64) -> String {
    action
        .get("name")
        .or_else(|| action.get("title"))
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| format!("Key {key}"))
}

fn restart_sound_on_press(action: &Value) -> bool {
    action.get("soundPressBehavior").and_then(Value::as_str) == Some("restart")
}

fn loop_sound_until_pressed(action: &Value) -> bool {
    action.get("soundLoop").and_then(Value::as_bool) == Some(true)
}

fn has_asset_extension(id: &str, allowed: &[&str]) -> bool {
    id.get(64..)
        .is_some_and(|extension| allowed.contains(&extension))
}

fn safe_asset_name(value: Option<&Value>, fallback: &str) -> String {
    let raw_name = value.and_then(Value::as_str).unwrap_or(fallback);
    Path::new(raw_name)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(fallback)
        .chars()
        .take(120)
        .collect()
}

fn clamped_number(value: Option<&Value>, default: u64) -> u64 {
    value
        .and_then(Value::as_u64)
        .unwrap_or(default)
        .clamp(0, 100)
}

fn read_text(path: PathBuf) -> String {
    fs::read_to_string(path)
        .map(|text| text.trim().to_string())
        .unwrap_or_default()
}

fn fallback(value: String, fallback: &str) -> String {
    if value.is_empty() {
        fallback.into()
    } else {
        value
    }
}

fn read_json(path: &Path) -> Option<Value> {
    fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
}

fn write_json(path: &Path, value: &Value) -> Result<(), String> {
    let temporary = path.with_extension("json.tmp");
    let mut encoded = serde_json::to_vec_pretty(value).map_err(error_text)?;
    encoded.push(b'\n');
    write_private_file(&temporary, &encoded)?;
    fs::rename(temporary, path).map_err(error_text)
}

fn write_private_file(path: &Path, data: &[u8]) -> Result<(), String> {
    let mut options = OpenOptions::new();
    options.create(true).truncate(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(path).map_err(error_text)?;
    file.write_all(data).map_err(error_text)
}

fn migrate_legacy_data(
    project_root: &Path,
    config_path: &Path,
    asset_root: &Path,
) -> Result<(), String> {
    let legacy_config = project_root.join(".streamctrl-config.json");
    if !config_path.exists() && legacy_config.is_file() {
        fs::copy(legacy_config, config_path).map_err(error_text)?;
    }
    let legacy_assets = project_root.join(".streamctrl-assets");
    if legacy_assets.is_dir() {
        for entry in fs::read_dir(legacy_assets).map_err(error_text)? {
            let entry = entry.map_err(error_text)?;
            if entry.path().is_file() {
                let destination = asset_root.join(entry.file_name());
                if !destination.exists() {
                    fs::copy(entry.path(), destination).map_err(error_text)?;
                }
            }
        }
    }
    Ok(())
}

fn valid_image_signature(mime: &str, data: &[u8]) -> bool {
    match mime {
        "image/gif" => data.starts_with(b"GIF87a") || data.starts_with(b"GIF89a"),
        "image/jpeg" => data.starts_with(&[0xff, 0xd8, 0xff]),
        "image/png" => data.starts_with(&[137, 80, 78, 71, 13, 10, 26, 10]),
        "image/webp" => {
            data.starts_with(b"RIFF") && data.get(8..12).is_some_and(|value| value == b"WEBP")
        }
        _ => false,
    }
}

fn valid_sound_signature(extension: &str, data: &[u8]) -> bool {
    match extension {
        ".flac" => data.starts_with(b"fLaC"),
        ".mp3" => {
            data.starts_with(b"ID3")
                || data
                    .get(0..2)
                    .is_some_and(|header| header[0] == 0xff && header[1] & 0xe0 == 0xe0)
        }
        ".ogg" => data.starts_with(b"OggS"),
        ".wav" => {
            data.starts_with(b"RIFF") && data.get(8..12).is_some_and(|value| value == b"WAVE")
        }
        _ => false,
    }
}

fn detect_animation(mime: &str, data: &[u8]) -> bool {
    match mime {
        "image/gif" => true,
        "image/png" => data.windows(4).any(|window| window == b"acTL"),
        "image/webp" => data.windows(4).any(|window| window == b"ANIM"),
        _ => false,
    }
}

#[tauri::command]
fn device_status(state: State<'_, AppState>) -> Value {
    state.0.device_status()
}

#[tauri::command]
fn load_config(state: State<'_, AppState>) -> Value {
    lock(&state.0.active_config).clone().unwrap_or(Value::Null)
}

#[tauri::command]
fn minimize_window(app: AppHandle) -> Result<(), String> {
    app.get_webview_window("main")
        .ok_or_else(|| "Main window is unavailable".to_string())?
        .minimize()
        .map_err(error_text)
}

#[tauri::command]
fn close_window(app: AppHandle) -> Result<(), String> {
    app.get_webview_window("main")
        .ok_or_else(|| "Main window is unavailable".to_string())?
        .hide()
        .map_err(error_text)
}

#[tauri::command]
fn start_window_drag(app: AppHandle) -> Result<(), String> {
    app.get_webview_window("main")
        .ok_or_else(|| "Main window is unavailable".to_string())?
        .start_dragging()
        .map_err(error_text)
}

#[tauri::command]
async fn sync_deck(state: State<'_, AppState>, payload: Value) -> Result<Value, String> {
    let core = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || core.sync(payload))
        .await
        .map_err(error_text)?
}

#[tauri::command]
fn store_asset(state: State<'_, AppState>, payload: Value) -> Result<Value, String> {
    state.0.store_asset(payload)
}

#[tauri::command]
async fn store_sound(state: State<'_, AppState>, payload: Value) -> Result<Value, String> {
    let core = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || core.store_sound(payload))
        .await
        .map_err(error_text)?
}

#[tauri::command]
async fn set_brightness(state: State<'_, AppState>, brightness: i64) -> Result<Value, String> {
    let core = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || core.set_brightness(brightness))
        .await
        .map_err(error_text)?
}

#[tauri::command]
async fn identify_device(state: State<'_, AppState>, brightness: i64) -> Result<Value, String> {
    let core = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || core.identify(brightness))
        .await
        .map_err(error_text)?
}

#[tauri::command]
fn test_action(state: State<'_, AppState>, key: i64, action: Value) -> Result<Value, String> {
    state.0.test_action(key, action)
}

#[tauri::command(rename_all = "camelCase")]
fn resolve_asset(state: State<'_, AppState>, asset_id: String) -> Result<String, String> {
    state.0.resolve_asset(&asset_id)
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_always_on_top(true);

        // On Linux, show and unminimize are queued by the window runtime. A focus
        // request sent immediately afterwards can be ignored while the native
        // window is still marked hidden, so focus it on the next settled frame.
        let app = app.clone();
        thread::spawn(move || {
            thread::sleep(Duration::from_millis(50));
            let focus_app = app.clone();
            let _ = app.run_on_main_thread(move || {
                if let Some(window) = focus_app.get_webview_window("main") {
                    let _ = window.set_focus();
                    let _ = window.set_always_on_top(false);
                }
            });
        });
    }
}

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Studio", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;
    let icon = app.default_window_icon().cloned();
    let mut tray = TrayIconBuilder::with_id("n1-studio")
        .tooltip("N1 Stream Controller Studio")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                show_main_window(tray.app_handle());
            }
        });
    if let Some(icon) = icon {
        tray = tray.icon(icon);
    }
    tray.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            device_status,
            load_config,
            minimize_window,
            close_window,
            start_window_drag,
            sync_deck,
            store_asset,
            store_sound,
            set_brightness,
            identify_device,
            test_action,
            resolve_asset
        ])
        .setup(|app| {
            let core = AppCore::new(app.handle().clone())
                .map_err(|error| std::io::Error::other(format!("Startup failed: {error}")))?;
            app.manage(AppState(core.clone()));
            build_tray(app)?;
            if let Err(error) = core.driver.start(core.clone()) {
                core.driver.set_state(&core, "not_installed", error);
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building N1 Stream Controller Studio");

    app.run(|app, event| {
        if let RunEvent::Exit = event
            && let Some(state) = app.try_state::<AppState>()
        {
            state.0.stop_all_sounds();
            state.0.driver.stop();
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_supported_image_signatures() {
        assert!(valid_image_signature(
            "image/png",
            &[137, 80, 78, 71, 13, 10, 26, 10]
        ));
        assert!(valid_image_signature("image/gif", b"GIF89a"));
        assert!(valid_image_signature("image/webp", b"RIFF0000WEBP"));
        assert!(!valid_image_signature("image/jpeg", b"not-a-jpeg"));
    }

    #[test]
    fn detects_animated_formats() {
        assert!(detect_animation("image/gif", b"GIF89a"));
        assert!(detect_animation("image/png", b"prefixacTLsuffix"));
        assert!(detect_animation("image/webp", b"prefixANIMsuffix"));
        assert!(!detect_animation("image/jpeg", b"jpeg"));
    }

    #[test]
    fn validates_supported_sound_signatures() {
        assert!(valid_sound_signature(".flac", b"fLaC"));
        assert!(valid_sound_signature(".mp3", b"ID3\x04\x00"));
        assert!(valid_sound_signature(".mp3", &[0xff, 0xfb]));
        assert!(valid_sound_signature(".ogg", b"OggS"));
        assert!(valid_sound_signature(".wav", b"RIFF0000WAVE"));
        assert!(!valid_sound_signature(".wav", b"RIFF0000WEBP"));
        assert!(!valid_sound_signature(".exe", b"RIFF0000WAVE"));
    }

    #[test]
    fn passes_sound_paths_as_literal_process_arguments() {
        let path = Path::new("/tmp/alert; touch should-not-run.wav");
        let commands = sound_player_commands(path);
        assert!(!commands.is_empty());
        assert!(commands.iter().all(|command| command.program != "sh"));
        assert!(
            commands
                .iter()
                .all(|command| { command.args.last().map(String::as_str) == path.to_str() })
        );
    }

    #[test]
    fn configures_sound_repress_and_loop_modes() {
        assert!(!restart_sound_on_press(&json!({"id": "sound"})));
        assert!(!restart_sound_on_press(
            &json!({"id": "sound", "soundPressBehavior": "stop"})
        ));
        assert!(restart_sound_on_press(
            &json!({"id": "sound", "soundPressBehavior": "restart"})
        ));
        assert!(!loop_sound_until_pressed(&json!({"id": "sound"})));
        assert!(loop_sound_until_pressed(
            &json!({"id": "sound", "soundLoop": true})
        ));
    }

    #[test]
    fn resolves_only_explicit_or_safe_builtin_actions() {
        assert!(
            resolve_action_command(&json!({
                "id": "website",
                "target": "https://example.com"
            }))
            .is_some()
        );
        assert!(
            resolve_action_command(&json!({
                "id": "website",
                "target": "javascript:alert(1)"
            }))
            .is_none()
        );
        assert!(
            resolve_action_command(&json!({
                "id": "command",
                "target": "Choose a command"
            }))
            .is_none()
        );
    }
}
