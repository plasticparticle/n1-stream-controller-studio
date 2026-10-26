//! Live integration with the herdr terminal workspace manager.
//!
//! Studio talks to the herdr server over its newline-delimited JSON socket. The
//! deck layout itself is owned by herdr: the `n1-studio` plugin keeps it in
//! herdr's plugin configuration directory, and Studio only renders and executes it.

use serde_json::{Value, json};
use std::collections::{BTreeSet, HashMap};
use std::ffi::OsStr;
use std::io::{BufRead, BufReader, Read, Write};
use std::os::unix::net::UnixStream;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc::Sender;
use std::thread;
use std::time::{Duration, Instant, SystemTime};

pub const PLUGIN_ID: &str = "n1-studio";
pub const REQUEST_TIMEOUT: Duration = Duration::from_secs(5);
const AGENT_START_TIMEOUT_MS: u64 = 30_000;
const MAX_RESPONSE_BYTES: u64 = 8_000_000;
const MAX_DECK_CONFIG_BYTES: u64 = 64_000;
const MAX_HISTORY: usize = 16;
const PICKER_TIMEOUT: Duration = Duration::from_secs(15);
const DICTATION_TIMEOUT: Duration = Duration::from_secs(180);
/// Agents whose CLI dictates on a tap of the push-to-talk key.
const DICTATION_AGENTS: &[&str] = &["claude"];
pub const KEY_COUNT: usize = 15;
pub const ACTIONS: &[&str] = &[
    "workspace",
    "attention",
    "approve",
    "back",
    "new-agent",
    "interrupt",
    "dictate",
    "next-workspace",
    "previous-workspace",
];
const STATUSES: &[&str] = &["blocked", "done", "working", "idle", "unknown"];
const SESSION_EVENTS: &[&str] = &[
    "workspace.created",
    "workspace.updated",
    "workspace.renamed",
    "workspace.moved",
    "workspace.reordered",
    "workspace.closed",
    "workspace.focused",
    "tab.focused",
    "pane.created",
    "pane.closed",
    "pane.focused",
    "pane.moved",
    "pane.exited",
    "pane.agent_detected",
];

pub fn valid_action(action: &str) -> bool {
    ACTIONS.contains(&action)
}

fn herdr_config_dir() -> Option<PathBuf> {
    super::user_config_home(
        std::env::var_os("XDG_CONFIG_HOME").as_deref(),
        std::env::var_os("HOME").as_deref(),
    )
    .ok()
    .map(|path| path.join("herdr"))
}

pub fn socket_path() -> Option<PathBuf> {
    socket_path_from(
        std::env::var_os("HERDR_SOCKET_PATH").as_deref(),
        herdr_config_dir(),
    )
}

fn socket_path_from(override_path: Option<&OsStr>, config_dir: Option<PathBuf>) -> Option<PathBuf> {
    if let Some(path) = override_path
        .map(PathBuf::from)
        .filter(|path| path.is_absolute())
    {
        return Some(path);
    }
    config_dir.map(|directory| directory.join("herdr.sock"))
}

pub fn deck_config_path() -> Option<PathBuf> {
    herdr_config_dir().map(|directory| {
        directory
            .join("plugins")
            .join("config")
            .join(PLUGIN_ID)
            .join("deck.json")
    })
}

/// Identifies a deck configuration revision so edits are picked up without polling content.
pub fn deck_config_stamp(path: &Path) -> Option<(SystemTime, u64)> {
    let metadata = std::fs::metadata(path).ok()?;
    Some((metadata.modified().ok()?, metadata.len()))
}

pub fn load_deck_config(path: &Path) -> Result<DeckConfig, String> {
    let mut text = String::new();
    std::fs::File::open(path)
        .map_err(|error| format!("Unable to open {}: {error}", path.display()))?
        .take(MAX_DECK_CONFIG_BYTES + 1)
        .read_to_string(&mut text)
        .map_err(|error| format!("Unable to read {}: {error}", path.display()))?;
    if text.len() as u64 > MAX_DECK_CONFIG_BYTES {
        return Err("The herdr deck configuration is too large".into());
    }
    let value: Value = serde_json::from_str(&text)
        .map_err(|error| format!("Invalid herdr deck configuration: {error}"))?;
    let mut deck = parse_deck_config(&value)?;
    deck.source = "plugin";
    Ok(deck)
}

pub fn request(
    socket: &Path,
    method: &str,
    params: Value,
    timeout: Duration,
) -> Result<Value, String> {
    let mut stream =
        UnixStream::connect(socket).map_err(|error| format!("herdr is not reachable: {error}"))?;
    stream
        .set_read_timeout(Some(timeout))
        .and_then(|_| stream.set_write_timeout(Some(timeout)))
        .map_err(|error| error.to_string())?;
    let message = json!({"id": "n1-studio", "method": method, "params": params});
    stream
        .write_all(format!("{message}\n").as_bytes())
        .map_err(|error| format!("Unable to send {method} to herdr: {error}"))?;
    let mut line = String::new();
    BufReader::new(stream.take(MAX_RESPONSE_BYTES))
        .read_line(&mut line)
        .map_err(|error| format!("herdr did not answer {method}: {error}"))?;
    let response: Value = serde_json::from_str(&line)
        .map_err(|error| format!("Invalid herdr response to {method}: {error}"))?;
    if let Some(error) = response.get("error") {
        let message = error
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("request failed");
        return Err(format!("herdr {method}: {message}"));
    }
    response
        .get("result")
        .cloned()
        .ok_or_else(|| format!("herdr returned no result for {method}"))
}

pub enum Wake {
    Event,
    SubscriptionEnded(usize),
}

fn subscription_request(agent_panes: &BTreeSet<String>) -> Value {
    let mut subscriptions = SESSION_EVENTS
        .iter()
        .map(|kind| json!({"type": kind}))
        .collect::<Vec<_>>();
    subscriptions.extend(
        agent_panes
            .iter()
            .map(|pane| json!({"type": "pane.agent_status_changed", "pane_id": pane})),
    );
    json!({
        "id": "n1-studio-events",
        "method": "events.subscribe",
        "params": {"subscriptions": subscriptions}
    })
}

/// Streams herdr events into `wake` until a newer subscription generation replaces it.
///
/// Agent status subscriptions must name their pane, so the monitor replaces this
/// subscription whenever the set of agent panes changes.
pub fn spawn_subscription(
    socket: PathBuf,
    agent_panes: BTreeSet<String>,
    generation: Arc<AtomicUsize>,
    own_generation: usize,
    wake: Sender<Wake>,
) {
    thread::spawn(move || {
        let run = || -> Result<(), String> {
            let mut stream = UnixStream::connect(&socket).map_err(|error| error.to_string())?;
            stream
                .set_read_timeout(Some(Duration::from_secs(1)))
                .map_err(|error| error.to_string())?;
            stream
                .write_all(format!("{}\n", subscription_request(&agent_panes)).as_bytes())
                .map_err(|error| error.to_string())?;
            let mut reader = BufReader::new(stream);
            let mut line = String::new();
            loop {
                if generation.load(Ordering::Acquire) != own_generation {
                    return Ok(());
                }
                line.clear();
                match reader.read_line(&mut line) {
                    Ok(0) => return Err("herdr closed the event subscription".into()),
                    Ok(_) if line.len() > MAX_RESPONSE_BYTES as usize => {
                        return Err("herdr event is too large".into());
                    }
                    Ok(_) => {
                        let message: Value =
                            serde_json::from_str(&line).map_err(|error| error.to_string())?;
                        if message.get("error").is_some() {
                            return Err("herdr rejected the event subscription".into());
                        }
                        let _ = wake.send(Wake::Event);
                    }
                    Err(error)
                        if matches!(
                            error.kind(),
                            std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
                        ) => {}
                    Err(error) => return Err(error.to_string()),
                }
            }
        };
        let _ = run();
        let _ = wake.send(Wake::SubscriptionEnded(own_generation));
    });
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DeckSlot {
    pub action: Option<String>,
    pub optional: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DeckConfig {
    pub keys: Vec<DeckSlot>,
    pub new_agent_kind: String,
    pub auto_switch: bool,
    pub source: &'static str,
}

impl Default for DeckConfig {
    fn default() -> Self {
        let mut keys = vec![
            DeckSlot {
                action: Some("workspace".into()),
                optional: false,
            };
            10
        ];
        for action in ["attention", "approve", "back", "new-agent"] {
            keys.push(DeckSlot {
                action: Some(action.into()),
                optional: false,
            });
        }
        keys.push(DeckSlot {
            action: Some("dictate".into()),
            optional: true,
        });
        Self {
            keys,
            new_agent_kind: "claude".into(),
            auto_switch: true,
            source: "default",
        }
    }
}

impl DeckConfig {
    pub fn to_json(&self) -> Value {
        json!({
            "source": self.source,
            "newAgentKind": self.new_agent_kind,
            "autoSwitch": self.auto_switch,
            "keys": self.keys.iter().map(|slot| json!({
                "action": slot.action,
                "optional": slot.optional
            })).collect::<Vec<_>>()
        })
    }
}

fn valid_agent_kind(kind: &str) -> bool {
    let mut characters = kind.chars();
    characters
        .next()
        .is_some_and(|first| first.is_ascii_lowercase())
        && kind.len() <= 32
        && characters.all(|character| {
            character.is_ascii_lowercase()
                || character.is_ascii_digit()
                || character == '-'
                || character == '_'
        })
}

pub fn parse_deck_config(value: &Value) -> Result<DeckConfig, String> {
    if value.get("version").and_then(Value::as_u64) != Some(1) {
        return Err("The herdr deck configuration must declare version 1".into());
    }
    let mut deck = DeckConfig::default();
    if let Some(keys) = value.get("keys") {
        let keys = keys
            .as_array()
            .filter(|keys| keys.len() == KEY_COUNT)
            .ok_or("The herdr deck configuration must list exactly 15 keys")?;
        deck.keys = keys
            .iter()
            .map(|entry| {
                let (action, optional) = match entry {
                    Value::Null => (None, true),
                    Value::String(action) => (Some(action.clone()), false),
                    Value::Object(object) => (
                        match object.get("action") {
                            None | Some(Value::Null) => None,
                            Some(Value::String(action)) => Some(action.clone()),
                            Some(_) => return Err("Deck key actions must be text".to_string()),
                        },
                        object
                            .get("optional")
                            .and_then(Value::as_bool)
                            .unwrap_or(false),
                    ),
                    _ => return Err("Deck keys must be an action, an object or null".to_string()),
                };
                if let Some(action) = &action
                    && !valid_action(action)
                {
                    return Err(format!("Unsupported herdr deck action: {action}"));
                }
                Ok(DeckSlot {
                    optional: optional || action.is_none(),
                    action,
                })
            })
            .collect::<Result<_, _>>()?;
    }
    if let Some(kind) = value.get("newAgentKind") {
        let kind = kind
            .as_str()
            .filter(|kind| valid_agent_kind(kind))
            .ok_or("newAgentKind must be a herdr agent kind such as claude or codex")?;
        deck.new_agent_kind = kind.into();
    }
    if let Some(auto_switch) = value.get("autoSwitch") {
        deck.auto_switch = auto_switch
            .as_bool()
            .ok_or("autoSwitch must be true or false")?;
    }
    Ok(deck)
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Agent {
    pub pane_id: String,
    pub workspace_id: String,
    pub kind: String,
    pub status: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Workspace {
    pub id: String,
    pub number: u64,
    pub label: String,
}

/// A terminal pane; `status` is the agent state, or `shell` for panes without an agent.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Pane {
    pub pane_id: String,
    pub workspace_id: String,
    pub tab: u64,
    pub title: String,
    pub agent: Option<String>,
    pub status: String,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Snapshot {
    pub workspaces: Vec<Workspace>,
    pub agents: Vec<Agent>,
    pub panes: Vec<Pane>,
    pub focused_workspace_id: Option<String>,
    pub focused_pane_id: Option<String>,
    pub pane_cwds: HashMap<String, String>,
}

fn text(value: &Value, field: &str) -> Option<String> {
    value
        .get(field)
        .and_then(Value::as_str)
        .map(|text| text.chars().take(120).collect())
}

pub fn parse_snapshot(result: &Value) -> Result<Snapshot, String> {
    let snapshot = result.get("snapshot").unwrap_or(result);
    let list = |field: &str| {
        snapshot
            .get(field)
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default()
    };
    let mut workspaces = list("workspaces")
        .iter()
        .filter_map(|workspace| {
            Some(Workspace {
                id: text(workspace, "workspace_id")?,
                number: workspace.get("number").and_then(Value::as_u64).unwrap_or(0),
                label: text(workspace, "label").unwrap_or_default(),
            })
        })
        .collect::<Vec<_>>();
    if snapshot.get("workspaces").is_none() {
        return Err("herdr snapshot did not include workspaces".into());
    }
    workspaces.sort_by_key(|workspace| workspace.number);
    let agents = list("agents")
        .iter()
        .filter_map(|agent| {
            let status = text(agent, "agent_status").unwrap_or_default();
            Some(Agent {
                pane_id: text(agent, "pane_id")?,
                workspace_id: text(agent, "workspace_id")?,
                kind: text(agent, "agent").unwrap_or_default(),
                status: if STATUSES.contains(&status.as_str()) {
                    status
                } else {
                    "unknown".into()
                },
            })
        })
        .collect::<Vec<Agent>>();
    let tabs = list("tabs")
        .iter()
        .filter_map(|tab| Some((text(tab, "tab_id")?, tab.get("number")?.as_u64()?)))
        .collect::<HashMap<_, _>>();
    let mut panes = list("panes")
        .iter()
        .filter_map(|pane| {
            let pane_id = text(pane, "pane_id")?;
            let agent = agents.iter().find(|agent| agent.pane_id == pane_id);
            Some(Pane {
                workspace_id: text(pane, "workspace_id")?,
                tab: text(pane, "tab_id")
                    .and_then(|tab| tabs.get(&tab).copied())
                    .unwrap_or(0),
                title: text(pane, "terminal_title_stripped").unwrap_or_default(),
                agent: agent.map(|agent| agent.kind.clone()),
                status: agent
                    .map(|agent| agent.status.clone())
                    .unwrap_or_else(|| "shell".into()),
                pane_id,
            })
        })
        .collect::<Vec<_>>();
    panes.sort_by_key(|pane| pane.tab);
    let pane_cwds = list("panes")
        .iter()
        .filter_map(|pane| {
            let cwd = text(pane, "foreground_cwd").or_else(|| text(pane, "cwd"))?;
            Some((text(pane, "pane_id")?, cwd))
        })
        .collect();
    Ok(Snapshot {
        workspaces,
        agents,
        panes,
        focused_workspace_id: text(snapshot, "focused_workspace_id"),
        focused_pane_id: text(snapshot, "focused_pane_id"),
        pane_cwds,
    })
}

fn status_rank(status: &str) -> u8 {
    match status {
        "blocked" => 4,
        "done" => 3,
        "working" => 2,
        "idle" => 1,
        _ => 0,
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Rollup {
    pub status: &'static str,
    pub agents: usize,
    pub blocked: usize,
    pub done: usize,
    pub working: usize,
}

fn rollup<'a>(agents: impl Iterator<Item = &'a Agent>) -> Rollup {
    let mut rollup = Rollup {
        status: "none",
        ..Rollup::default()
    };
    for agent in agents {
        rollup.agents += 1;
        match agent.status.as_str() {
            "blocked" => rollup.blocked += 1,
            "done" => rollup.done += 1,
            "working" => rollup.working += 1,
            _ => {}
        }
        if rollup.agents == 1 || status_rank(&agent.status) > status_rank(rollup.status) {
            rollup.status = STATUSES
                .iter()
                .find(|status| **status == agent.status)
                .copied()
                .unwrap_or("unknown");
        }
    }
    rollup
}

/// The choice dialog on the screen of a blocked agent.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Prompt {
    pub pane_id: String,
    pub options: Vec<String>,
    pub selected: Option<usize>,
}

/// Actions that temporarily replace the managed action keys while the focused agent waits.
pub const PROMPT_ACTIONS: [&str; 4] =
    ["prompt-up", "prompt-down", "prompt-select", "prompt-cancel"];
const MAX_PROMPT_OPTIONS: usize = 9;

/// Parses one line of a numbered choice list such as `❯ 1. Yes`.
fn choice_line(line: &str) -> Option<(usize, bool, String)> {
    let line = line.trim_matches(|c: char| c.is_whitespace() || matches!(c, '│' | '┃' | '|'));
    let first = line.chars().next()?;
    let cursor = matches!(first, '❯' | '›' | '>' | '▶' | '→' | '➜');
    let rest = if cursor {
        line[first.len_utf8()..].trim_start()
    } else {
        line
    };
    let digits = rest.chars().take_while(char::is_ascii_digit).count();
    if !(1..=2).contains(&digits) {
        return None;
    }
    let number = rest[..digits].parse().ok()?;
    let after = &rest[digits..];
    let text = after
        .strip_prefix('.')
        .or_else(|| after.strip_prefix(')'))?;
    if !text.starts_with(' ') {
        return None;
    }
    let text = text.trim();
    (!text.is_empty()).then(|| (number, cursor, text.to_string()))
}

/// Finds the last numbered choice list on an agent screen and its highlighted entry.
/// Lines between entries, such as option descriptions, are skipped.
pub fn parse_choices(screen: &str) -> (Vec<String>, Option<usize>) {
    let mut last: Vec<(bool, String)> = Vec::new();
    let mut current: Vec<(bool, String)> = Vec::new();
    for (number, cursor, text) in screen.lines().filter_map(choice_line) {
        if number == 1 {
            if current.len() >= 2 {
                last = std::mem::take(&mut current);
            }
            current = vec![(cursor, text)];
        } else if !current.is_empty() && number == current.len() + 1 {
            current.push((cursor, text));
        } else {
            current.clear();
        }
    }
    if current.len() >= 2 {
        last = current;
    }
    last.truncate(MAX_PROMPT_OPTIONS);
    let selected = last.iter().position(|(cursor, _)| *cursor);
    (last.into_iter().map(|(_, text)| text).collect(), selected)
}

/// Reads the dialog of the focused agent when it waits for an answer.
pub fn read_prompt(socket: &Path, snapshot: &Snapshot) -> Option<Prompt> {
    let pane_id = snapshot.focused_pane_id.as_deref()?;
    snapshot
        .agents
        .iter()
        .find(|agent| agent.pane_id == pane_id && agent.status == "blocked")?;
    let screen = request(
        socket,
        "agent.read",
        json!({"target": pane_id, "source": "visible", "format": "text"}),
        REQUEST_TIMEOUT,
    )
    .ok();
    let (options, selected) = screen
        .as_ref()
        .and_then(|screen| screen.pointer("/read/text"))
        .and_then(Value::as_str)
        .map(parse_choices)
        .unwrap_or_default();
    Some(Prompt {
        pane_id: pane_id.to_string(),
        options,
        selected,
    })
}

/// What a herdr key press should do, resolved against the latest snapshot.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Plan {
    FocusWorkspace(String),
    FocusAgent(String),
    FocusPane(String),
    ClosePicker,
    Approve(String),
    Answer(String, &'static str),
    Interrupt(String),
    Dictate {
        pane: String,
        start: bool,
    },
    NewAgent {
        pane: String,
        cwd: Option<String>,
        kind: String,
    },
}

impl Plan {
    pub fn changes_focus(&self) -> bool {
        matches!(
            self,
            Self::FocusWorkspace(_)
                | Self::FocusAgent(_)
                | Self::FocusPane(_)
                | Self::NewAgent { .. }
        )
    }
}

/// Sends `key` to a dialog only while herdr still reports the agent as blocked.
fn answer_dialog(socket: &Path, pane: &str, key: &str) -> Result<(), String> {
    // The snapshot can be up to a second old; never answer a dialog that
    // has already closed or changed into something else.
    let current = request(
        socket,
        "agent.get",
        json!({"target": pane}),
        REQUEST_TIMEOUT,
    )?;
    if current
        .pointer("/agent/agent_status")
        .and_then(Value::as_str)
        != Some("blocked")
    {
        return Err("The agent is no longer waiting for an answer".into());
    }
    request(
        socket,
        "agent.send_keys",
        json!({"target": pane, "keys": [key]}),
        REQUEST_TIMEOUT,
    )?;
    Ok(())
}

pub fn execute_plan(socket: &Path, plan: &Plan, agent_name: &str) -> Result<String, String> {
    match plan {
        Plan::FocusWorkspace(workspace) => {
            request(
                socket,
                "workspace.focus",
                json!({"workspace_id": workspace}),
                REQUEST_TIMEOUT,
            )?;
            Ok("Workspace focused".into())
        }
        Plan::FocusAgent(pane) => {
            request(
                socket,
                "agent.focus",
                json!({"target": pane}),
                REQUEST_TIMEOUT,
            )?;
            Ok("Agent focused".into())
        }
        Plan::FocusPane(pane) => {
            request(
                socket,
                "pane.focus",
                json!({"pane_id": pane}),
                REQUEST_TIMEOUT,
            )?;
            Ok("Pane focused".into())
        }
        Plan::ClosePicker => Ok("Pane list closed".into()),
        Plan::Approve(pane) => {
            answer_dialog(socket, pane, "enter")?;
            Ok("Approval sent".into())
        }
        Plan::Answer(pane, key) => {
            answer_dialog(socket, pane, key)?;
            Ok(format!("Sent {key}"))
        }
        Plan::Dictate { pane, start } => {
            // Claude Code's voice mode in tap mode: Space starts, Space stops and submits.
            request(
                socket,
                "agent.send_keys",
                json!({"target": pane, "keys": ["space"]}),
                REQUEST_TIMEOUT,
            )?;
            Ok(if *start {
                "Dictation started".into()
            } else {
                "Dictation sent".into()
            })
        }
        Plan::Interrupt(pane) => {
            request(
                socket,
                "agent.send_keys",
                json!({"target": pane, "keys": ["esc"]}),
                REQUEST_TIMEOUT,
            )?;
            Ok("Interrupt sent".into())
        }
        Plan::NewAgent { pane, cwd, kind } => {
            let split = request(
                socket,
                "pane.split",
                json!({
                    "target_pane_id": pane,
                    "direction": "right",
                    "cwd": cwd,
                    "focus": true
                }),
                REQUEST_TIMEOUT,
            )?;
            let new_pane = split
                .pointer("/pane/pane_id")
                .and_then(Value::as_str)
                .ok_or("herdr did not return the new pane")?;
            request(
                socket,
                "agent.start",
                json!({
                    "name": agent_name,
                    "kind": kind,
                    "pane_id": new_pane,
                    "timeout_ms": AGENT_START_TIMEOUT_MS
                }),
                Duration::from_millis(AGENT_START_TIMEOUT_MS + 5_000),
            )?;
            Ok(format!("{kind} agent started"))
        }
    }
}

/// Zero-based workspace slot of the key at `index`, counting workspace keys in order.
pub fn workspace_slot(keys: &[Value], index: usize) -> Option<usize> {
    let is_workspace = |key: &Value| {
        key.get("id").and_then(Value::as_str) == Some("herdr")
            && key.get("herdrAction").and_then(Value::as_str) == Some("workspace")
    };
    is_workspace(keys.get(index)?)
        .then(|| keys[..index].iter().filter(|key| is_workspace(key)).count())
}

pub fn is_herdr_key(key: &Value) -> bool {
    key.get("id").and_then(Value::as_str) == Some("herdr")
}

pub fn has_workspace_keys(keys: &[Value]) -> bool {
    (0..keys.len()).any(|index| workspace_slot(keys, index).is_some())
}

#[derive(Default)]
pub struct Runtime {
    pub connected: bool,
    pub snapshot: Snapshot,
    pub deck: DeckConfig,
    pub deck_error: Option<String>,
    pub page: usize,
    pub slot_count: usize,
    history: Vec<String>,
    status_since: HashMap<String, (String, u64)>,
    tick: u64,
    rendered_keys: HashMap<usize, Value>,
    rendered_strip: [Option<Value>; 3],
    prompt: Option<Prompt>,
    picker: Option<(String, Instant)>,
    dictation: Option<Dictation>,
}

/// A recording started from the deck, tied to the agent state it started in.
#[derive(Clone, Debug)]
struct Dictation {
    pane_id: String,
    status: String,
    started: Instant,
}

impl Runtime {
    pub fn new() -> Self {
        Self {
            slot_count: 10,
            ..Self::default()
        }
    }

    /// Applies a new snapshot (or a lost connection) and reports whether anything visible changed.
    pub fn update(&mut self, snapshot: Option<Snapshot>) -> bool {
        let Some(snapshot) = snapshot else {
            let changed = self.connected;
            self.connected = false;
            self.snapshot = Snapshot::default();
            self.status_since.clear();
            return changed;
        };
        if self.connected
            && let (Some(previous), Some(next)) = (
                self.snapshot.focused_workspace_id.as_ref(),
                snapshot.focused_workspace_id.as_ref(),
            )
            && previous != next
        {
            self.history.retain(|workspace| workspace != previous);
            self.history.push(previous.clone());
            if self.history.len() > MAX_HISTORY {
                self.history.remove(0);
            }
        }
        self.tick += 1;
        for agent in &snapshot.agents {
            let entry = self
                .status_since
                .entry(agent.pane_id.clone())
                .or_insert_with(|| (agent.status.clone(), self.tick));
            if entry.0 != agent.status {
                *entry = (agent.status.clone(), self.tick);
            }
        }
        self.status_since
            .retain(|pane, _| snapshot.agents.iter().any(|agent| &agent.pane_id == pane));
        let mut changed = !self.connected || snapshot != self.snapshot;
        // Submitting the recording changes the agent state; a recording stopped at the
        // keyboard is forgotten after a while.
        if let Some(dictation) = &self.dictation {
            let agent = snapshot
                .agents
                .iter()
                .find(|agent| agent.pane_id == dictation.pane_id);
            if agent.is_none_or(|agent| agent.status != dictation.status)
                || dictation.started.elapsed() >= DICTATION_TIMEOUT
            {
                self.dictation = None;
                changed = true;
            }
        }
        self.connected = true;
        self.snapshot = snapshot;
        self.page = self.page.min(self.pages() - 1);
        changed
    }

    /// Stores the dialog read from the focused agent and reports whether it changed.
    pub fn set_prompt(&mut self, prompt: Option<Prompt>) -> bool {
        let changed = self.prompt != prompt;
        self.prompt = prompt;
        changed
    }

    /// The focused agent while it waits for an answer; its dialog takes over the action keys.
    fn prompt_agent(&self) -> Option<&Agent> {
        self.focused_agent()
            .filter(|agent| agent.status == "blocked")
    }

    fn prompt(&self) -> Option<&Prompt> {
        let agent = self.prompt_agent()?;
        self.prompt
            .as_ref()
            .filter(|prompt| prompt.pane_id == agent.pane_id)
    }

    /// Keys that turn into dialog controls: the managed action keys, in deck order.
    fn prompt_slots(&self) -> Vec<usize> {
        self.deck
            .keys
            .iter()
            .enumerate()
            .filter(|(_, slot)| {
                !slot.optional
                    && slot
                        .action
                        .as_deref()
                        .is_some_and(|action| action != "workspace")
            })
            .map(|(index, _)| index)
            .take(PROMPT_ACTIONS.len())
            .collect()
    }

    /// The dialog control on key `index` of a herdr deck while the focused agent waits.
    pub fn prompt_action(&self, keys: &[Value], index: usize) -> Option<&'static str> {
        self.prompt_agent()?;
        if !has_workspace_keys(keys) || !keys.get(index).is_some_and(is_herdr_key) {
            return None;
        }
        let position = self.prompt_slots().iter().position(|slot| *slot == index)?;
        Some(PROMPT_ACTIONS[position])
    }

    pub fn prompt_active(&self) -> bool {
        self.prompt_agent().is_some()
    }

    fn prompt_key_state(&self, action: &str) -> Value {
        let prompt = self.prompt();
        let options = prompt
            .map(|prompt| prompt.options.as_slice())
            .unwrap_or_default();
        let selected = prompt.and_then(|prompt| prompt.selected);
        let option = |offset: isize| {
            selected
                .and_then(|index| index.checked_add_signed(offset))
                .and_then(|index| options.get(index))
                .cloned()
                .unwrap_or_default()
        };
        let (label, detail) = match action {
            "prompt-up" => ("UP".to_string(), option(-1)),
            "prompt-down" => ("DOWN".to_string(), option(1)),
            "prompt-select" => match selected {
                Some(index) if index < options.len() => (
                    options[index].clone(),
                    format!("SELECT {}/{}", index + 1, options.len()),
                ),
                _ => ("SELECT".to_string(), "ENTER".to_string()),
            },
            _ => ("CANCEL".to_string(), "ESC".to_string()),
        };
        json!({
            "status": "blocked",
            "glyph": action,
            "label": label,
            "detail": detail,
            "animate": action == "prompt-select"
        })
    }

    /// Shows the panes of the workspace on `slot` on the workspace keys.
    pub fn open_picker(&mut self, slot: usize) -> Result<(), String> {
        let workspace = self
            .workspace_for_slot(slot)
            .ok_or("No herdr workspace on this key")?;
        self.picker = Some((workspace.id.clone(), Instant::now()));
        Ok(())
    }

    pub fn close_picker(&mut self) -> bool {
        self.picker.take().is_some()
    }

    pub fn picker_open(&self) -> bool {
        self.picker_workspace().is_some()
    }

    /// Closes a pane list nobody used for a while; reports whether it closed.
    pub fn expire_picker(&mut self) -> bool {
        let expired = self.picker.as_ref().is_some_and(|(id, opened)| {
            opened.elapsed() >= PICKER_TIMEOUT || self.workspace(id).is_none()
        });
        expired && self.close_picker()
    }

    fn picker_workspace(&self) -> Option<&Workspace> {
        self.workspace(&self.picker.as_ref()?.0)
    }

    fn workspace_panes(&self, id: &str) -> Vec<&Pane> {
        self.snapshot
            .panes
            .iter()
            .filter(|pane| pane.workspace_id == id)
            .collect()
    }

    /// Workspace key `slot` while the pane list is open: a pane, the close key, or nothing.
    fn picker_entry(&self, slot: usize) -> Option<Result<&Pane, &Workspace>> {
        let workspace = self.picker_workspace()?;
        let close_slot = self.slot_count.max(2) - 1;
        if slot == close_slot {
            return Some(Err(workspace));
        }
        self.workspace_panes(&workspace.id)
            .get(slot)
            .copied()
            .filter(|_| slot < close_slot)
            .map(Ok)
    }

    fn picker_key_state(&self, slot: usize) -> Value {
        match self.picker_entry(slot) {
            Some(Ok(pane)) => json!({
                "status": pane.status,
                "glyph": if pane.agent.is_some() { pane.status.as_str() } else { "shell" },
                "label": pane.agent.as_deref().unwrap_or("shell").to_uppercase(),
                "detail": match pane.status.as_str() {
                    "blocked" => "WAITING".to_string(),
                    "working" => "WORKING".to_string(),
                    "done" => "DONE".to_string(),
                    "idle" => "IDLE".to_string(),
                    _ => pane.title.clone(),
                },
                "number": format!("T{}", pane.tab),
                "panes": [pane.status],
                "focused": self.snapshot.focused_pane_id.as_deref() == Some(pane.pane_id.as_str())
            }),
            // The close key keeps showing the workspace the list belongs to.
            Some(Err(workspace)) => json!({
                "status": self.workspace_rollup(&workspace.id).status,
                "glyph": "prompt-cancel",
                "label": workspace.label,
                "detail": "CLOSE",
                "panes": self
                    .workspace_panes(&workspace.id)
                    .iter()
                    .map(|pane| pane.status.as_str())
                    .collect::<Vec<_>>()
            }),
            None => json!({"status": "empty", "label": ""}),
        }
    }

    pub fn set_slot_count(&mut self, slot_count: usize) {
        self.slot_count = slot_count.max(1);
        self.page = self.page.min(self.pages() - 1);
    }

    pub fn pages(&self) -> usize {
        self.snapshot
            .workspaces
            .len()
            .div_ceil(self.slot_count.max(1))
            .max(1)
    }

    pub fn next_page(&mut self) -> usize {
        self.page = (self.page + 1) % self.pages();
        self.page
    }

    fn workspace(&self, id: &str) -> Option<&Workspace> {
        self.snapshot
            .workspaces
            .iter()
            .find(|workspace| workspace.id == id)
    }

    fn workspace_label(&self, id: &str) -> String {
        self.workspace(id)
            .map(|workspace| workspace.label.clone())
            .unwrap_or_default()
    }

    pub fn workspace_for_slot(&self, slot: usize) -> Option<&Workspace> {
        self.snapshot
            .workspaces
            .get(self.page * self.slot_count.max(1) + slot)
    }

    fn workspace_rollup(&self, id: &str) -> Rollup {
        rollup(
            self.snapshot
                .agents
                .iter()
                .filter(|agent| agent.workspace_id == id),
        )
    }

    fn since(&self, agent: &Agent) -> u64 {
        self.status_since
            .get(&agent.pane_id)
            .map(|(_, tick)| *tick)
            .unwrap_or(0)
    }

    /// Agents that need the developer: oldest blocked first, then oldest unseen completions.
    pub fn attention_queue(&self) -> Vec<&Agent> {
        let mut queue = self
            .snapshot
            .agents
            .iter()
            .filter(|agent| matches!(agent.status.as_str(), "blocked" | "done"))
            .collect::<Vec<_>>();
        queue.sort_by_key(|agent| (agent.status != "blocked", self.since(agent)));
        queue
    }

    fn focused_agent(&self) -> Option<&Agent> {
        let focused = self.snapshot.focused_pane_id.as_deref()?;
        self.snapshot
            .agents
            .iter()
            .find(|agent| agent.pane_id == focused)
    }

    fn approve_target(&self) -> Option<&Agent> {
        self.focused_agent()
            .filter(|agent| agent.status == "blocked")
            .or_else(|| {
                self.attention_queue()
                    .into_iter()
                    .find(|agent| agent.status == "blocked")
            })
    }

    fn dictation_target(&self) -> Option<&Agent> {
        self.focused_agent().filter(|agent| {
            DICTATION_AGENTS.contains(&agent.kind.as_str()) && agent.status != "blocked"
        })
    }

    pub fn dictating(&self) -> bool {
        self.dictation.is_some()
    }

    pub fn begin_dictation(&mut self, pane_id: &str) {
        let status = self
            .snapshot
            .agents
            .iter()
            .find(|agent| agent.pane_id == pane_id)
            .map(|agent| agent.status.clone())
            .unwrap_or_default();
        self.dictation = Some(Dictation {
            pane_id: pane_id.to_string(),
            status,
            started: Instant::now(),
        });
    }

    pub fn end_dictation(&mut self) {
        self.dictation = None;
    }

    fn interrupt_target(&self) -> Option<&Agent> {
        self.focused_agent()
            .filter(|agent| matches!(agent.status.as_str(), "working" | "blocked"))
    }

    fn back_target(&self) -> Option<&Workspace> {
        let focused = self.snapshot.focused_workspace_id.as_deref();
        self.history
            .iter()
            .rev()
            .filter(|id| Some(id.as_str()) != focused)
            .find_map(|id| self.workspace(id))
    }

    fn adjacent_workspace(&self, offset: isize) -> Option<&Workspace> {
        let workspaces = &self.snapshot.workspaces;
        if workspaces.is_empty() {
            return None;
        }
        let current = self
            .snapshot
            .focused_workspace_id
            .as_deref()
            .and_then(|id| workspaces.iter().position(|workspace| workspace.id == id))
            .unwrap_or(0) as isize;
        let count = workspaces.len() as isize;
        workspaces.get((current + offset).rem_euclid(count) as usize)
    }

    pub fn plan(&self, action: &str, slot: Option<usize>) -> Result<Plan, String> {
        if !self.connected {
            return Err("herdr is not running".into());
        }
        match action {
            "workspace" if self.picker_open() => {
                match slot.and_then(|slot| self.picker_entry(slot)) {
                    Some(Ok(pane)) => Ok(Plan::FocusPane(pane.pane_id.clone())),
                    _ => Ok(Plan::ClosePicker),
                }
            }
            "workspace" => {
                let workspace = slot
                    .and_then(|slot| self.workspace_for_slot(slot))
                    .ok_or("No herdr workspace on this key")?;
                // Jump straight to the agent that needs attention inside the workspace.
                let urgent = self
                    .attention_queue()
                    .into_iter()
                    .find(|agent| agent.workspace_id == workspace.id);
                Ok(match urgent {
                    Some(agent) => Plan::FocusAgent(agent.pane_id.clone()),
                    None => Plan::FocusWorkspace(workspace.id.clone()),
                })
            }
            "attention" => self
                .attention_queue()
                .first()
                .map(|agent| Plan::FocusAgent(agent.pane_id.clone()))
                .ok_or_else(|| "No agent needs attention".into()),
            "prompt-up" | "prompt-down" | "prompt-select" | "prompt-cancel" => {
                let agent = self
                    .prompt_agent()
                    .ok_or("The focused agent is not waiting for an answer")?;
                let key = match action {
                    "prompt-up" => "up",
                    "prompt-down" => "down",
                    "prompt-select" => "enter",
                    _ => "esc",
                };
                Ok(Plan::Answer(agent.pane_id.clone(), key))
            }
            "approve" => self
                .approve_target()
                .map(|agent| Plan::Approve(agent.pane_id.clone()))
                .ok_or_else(|| "No agent is waiting for approval".into()),
            "dictate" => match &self.dictation {
                Some(dictation) => Ok(Plan::Dictate {
                    pane: dictation.pane_id.clone(),
                    start: false,
                }),
                None => self
                    .dictation_target()
                    .map(|agent| Plan::Dictate {
                        pane: agent.pane_id.clone(),
                        start: true,
                    })
                    .ok_or_else(|| "Dictation needs a focused Claude Code agent".into()),
            },
            "interrupt" => self
                .interrupt_target()
                .map(|agent| Plan::Interrupt(agent.pane_id.clone()))
                .ok_or_else(|| "The focused pane has no running agent".into()),
            "back" => self
                .back_target()
                .map(|workspace| Plan::FocusWorkspace(workspace.id.clone()))
                .ok_or_else(|| "No previous workspace yet".into()),
            "next-workspace" | "previous-workspace" => self
                .adjacent_workspace(if action == "next-workspace" { 1 } else { -1 })
                .map(|workspace| Plan::FocusWorkspace(workspace.id.clone()))
                .ok_or_else(|| "No herdr workspaces".into()),
            "new-agent" => {
                let pane = self
                    .snapshot
                    .focused_pane_id
                    .clone()
                    .ok_or("herdr has no focused pane")?;
                Ok(Plan::NewAgent {
                    cwd: self.snapshot.pane_cwds.get(&pane).cloned(),
                    pane,
                    kind: self.deck.new_agent_kind.clone(),
                })
            }
            _ => Err(format!("Unsupported herdr action: {action}")),
        }
    }

    /// Display state for one herdr key, merged into the configured key for the driver.
    pub fn key_state(&self, action: &str, slot: Option<usize>) -> Value {
        if !self.connected {
            return json!({
                "status": "offline",
                "label": if slot == Some(0) || action != "workspace" { "HERDR OFF" } else { "" },
                "enabled": false
            });
        }
        let label_for = |agent: Option<&Agent>| {
            agent
                .map(|agent| self.workspace_label(&agent.workspace_id))
                .unwrap_or_default()
        };
        match action {
            "workspace" if self.picker_open() => slot
                .map(|slot| self.picker_key_state(slot))
                .unwrap_or_else(|| json!({"status": "empty", "label": ""})),
            "workspace" => {
                let Some(workspace) = slot.and_then(|slot| self.workspace_for_slot(slot)) else {
                    return json!({"status": "empty", "label": ""});
                };
                let rollup = self.workspace_rollup(&workspace.id);
                let detail = if rollup.blocked > 0 {
                    format!("{} WAITING", rollup.blocked)
                } else if rollup.done > 0 {
                    format!("{} DONE", rollup.done)
                } else {
                    String::new()
                };
                json!({
                    "status": rollup.status,
                    "label": workspace.label,
                    "focused": self.snapshot.focused_workspace_id.as_deref() == Some(workspace.id.as_str()),
                    "detail": detail,
                    "panes": self
                        .workspace_panes(&workspace.id)
                        .iter()
                        .map(|pane| pane.status.as_str())
                        .collect::<Vec<_>>()
                })
            }
            "attention" => {
                let queue = self.attention_queue();
                let first = queue.first().copied();
                json!({
                    "status": first.map(|agent| agent.status.as_str()).unwrap_or("idle"),
                    "label": "NEXT",
                    "badge": if queue.is_empty() { String::new() } else { queue.len().to_string() },
                    "detail": label_for(first),
                    "enabled": first.is_some()
                })
            }
            "approve" => {
                let target = self.approve_target();
                json!({
                    "status": if target.is_some() { "blocked" } else { "idle" },
                    "label": "APPROVE",
                    "detail": label_for(target),
                    "enabled": target.is_some(),
                    "animate": false
                })
            }
            "dictate" => match &self.dictation {
                Some(dictation) => json!({
                    "status": "blocked",
                    "label": "REC",
                    "detail": self
                        .snapshot
                        .agents
                        .iter()
                        .find(|agent| agent.pane_id == dictation.pane_id)
                        .map(|agent| self.workspace_label(&agent.workspace_id))
                        .unwrap_or_default(),
                    "recording": true
                }),
                None => {
                    let target = self.dictation_target();
                    json!({
                        "status": "idle",
                        "label": "DICTATE",
                        "detail": match (target, self.focused_agent()) {
                            (Some(agent), _) => self.workspace_label(&agent.workspace_id),
                            (None, Some(agent)) if !DICTATION_AGENTS.contains(&agent.kind.as_str()) => "CLAUDE ONLY".into(),
                            _ => String::new(),
                        },
                        "enabled": target.is_some()
                    })
                }
            },
            "interrupt" => {
                let target = self.interrupt_target();
                json!({
                    "status": "idle",
                    "label": "INTERRUPT",
                    "detail": label_for(target),
                    "enabled": target.is_some()
                })
            }
            "back" => {
                let target = self.back_target();
                json!({
                    "status": "idle",
                    "label": "BACK",
                    "detail": target.map(|workspace| workspace.label.clone()).unwrap_or_default(),
                    "enabled": target.is_some()
                })
            }
            "next-workspace" | "previous-workspace" => {
                let next = action == "next-workspace";
                let target = self.adjacent_workspace(if next { 1 } else { -1 });
                json!({
                    "status": "idle",
                    "label": if next { "NEXT SPACE" } else { "PREV SPACE" },
                    "detail": target.map(|workspace| workspace.label.clone()).unwrap_or_default(),
                    "enabled": target.is_some()
                })
            }
            "new-agent" => json!({
                "status": "idle",
                "label": "NEW",
                "detail": self.deck.new_agent_kind.to_uppercase(),
                "enabled": self.snapshot.focused_pane_id.is_some()
            }),
            _ => json!({"status": "offline", "label": "", "enabled": false}),
        }
    }

    /// Status displays 2 and 3 for a herdr deck; the profile display keeps its default art.
    pub fn strip(&self) -> [Option<Value>; 3] {
        if !self.connected {
            return [
                None,
                Some(
                    json!({"label": "SPACES", "lines": ["HERDR", "OFFLINE"], "accent": "#56616a"}),
                ),
                Some(json!({"label": "AGENTS", "lines": ["—"], "accent": "#56616a"})),
            ];
        }
        let spaces = if let Some(workspace) = self.picker_workspace() {
            json!({
                "label": "PANES",
                "lines": [
                    workspace.label.clone(),
                    format!("{} PANES", self.workspace_panes(&workspace.id).len())
                ],
                "accent": "#37b7ff"
            })
        } else if let Some(agent) = self.prompt_agent() {
            let prompt = self.prompt();
            let options = prompt.map(|prompt| prompt.options.len()).unwrap_or(0);
            match prompt.and_then(|prompt| Some((prompt.selected?, prompt))) {
                Some((index, prompt)) if index < options => json!({
                    "label": "CHOICE",
                    "lines": [format!("{} / {options}", index + 1), prompt.options[index].clone()],
                    "accent": "#ef476f"
                }),
                _ => json!({
                    "label": "WAITING",
                    "lines": [self.workspace_label(&agent.workspace_id), "ANSWER"],
                    "accent": "#ef476f"
                }),
            }
        } else {
            self.spaces_card()
        };
        let all = rollup(self.snapshot.agents.iter());
        let mut lines = Vec::new();
        for (count, label) in [
            (all.working, "WORK"),
            (all.blocked, "WAIT"),
            (all.done, "DONE"),
        ] {
            if count > 0 {
                lines.push(format!("{count} {label}"));
            }
        }
        if lines.is_empty() {
            lines.push(
                if all.agents > 0 {
                    "ALL IDLE"
                } else {
                    "NO AGENTS"
                }
                .into(),
            );
        }
        let accent = if all.blocked > 0 {
            "#ef476f"
        } else if all.done > 0 {
            "#38d996"
        } else if all.working > 0 {
            "#ff9f1c"
        } else {
            "#4f8fb8"
        };
        [
            None,
            Some(spaces),
            Some(json!({"label": "AGENTS", "lines": lines, "accent": accent})),
        ]
    }

    fn spaces_card(&self) -> Value {
        let total = self.snapshot.workspaces.len();
        let first = (self.page * self.slot_count + 1).min(total);
        let last = ((self.page + 1) * self.slot_count).min(total);
        json!({
            "label": "SPACES",
            "lines": [format!("{first}–{last}"), format!("OF {total}")],
            "accent": "#37b7ff"
        })
    }

    /// Driver key configurations for every herdr key in `keys`.
    pub fn render_keys(&self, keys: &[Value]) -> Vec<(usize, Value)> {
        keys.iter()
            .enumerate()
            .filter(|(_, key)| is_herdr_key(key))
            .map(|(index, key)| {
                let action = key
                    .get("herdrAction")
                    .and_then(Value::as_str)
                    .unwrap_or("workspace");
                let state = match self.prompt_action(keys, index) {
                    Some(prompt_action) => self.prompt_key_state(prompt_action),
                    None => self.key_state(action, workspace_slot(keys, index)),
                };
                let mut rendered = key.clone();
                rendered["herdr"] = state;
                (index, rendered)
            })
            .collect()
    }

    /// Records what a full sync transferred so later live updates only send differences.
    pub fn mark_rendered(&mut self, keys: &[(usize, Value)], strip: &[Option<Value>; 3]) {
        self.rendered_keys = keys.iter().cloned().collect();
        self.rendered_strip = strip.clone();
    }

    pub fn forget_rendered(&mut self) {
        self.rendered_keys.clear();
        self.rendered_strip = Default::default();
    }

    /// Keys and status displays that changed since the last transfer.
    pub fn render_changes(&mut self, keys: &[Value]) -> (Vec<Value>, Vec<Value>) {
        let mut key_updates = Vec::new();
        for (index, rendered) in self.render_keys(keys) {
            if self.rendered_keys.get(&index) != Some(&rendered) {
                key_updates.push(json!({"key": index + 1, "config": rendered.clone()}));
                self.rendered_keys.insert(index, rendered);
            }
        }
        let mut strip_updates = Vec::new();
        if has_workspace_keys(keys) {
            let strip = self.strip();
            for (index, spec) in strip.iter().enumerate() {
                if let Some(spec) = spec
                    && self.rendered_strip[index].as_ref() != Some(spec)
                {
                    strip_updates.push(json!({"index": index, "spec": spec}));
                }
            }
            self.rendered_strip = strip;
        }
        (key_updates, strip_updates)
    }

    pub fn public_state(&self) -> Value {
        let workspaces = self
            .snapshot
            .workspaces
            .iter()
            .map(|workspace| {
                let rollup = self.workspace_rollup(&workspace.id);
                json!({
                    "id": workspace.id,
                    "number": workspace.number,
                    "label": workspace.label,
                    "status": rollup.status,
                    "agents": rollup.agents,
                    "focused": self.snapshot.focused_workspace_id.as_deref() == Some(workspace.id.as_str())
                })
            })
            .collect::<Vec<_>>();
        let slots = (0..self.slot_count)
            .map(|slot| self.key_state("workspace", Some(slot)))
            .collect::<Vec<_>>();
        let actions = ACTIONS
            .iter()
            .filter(|action| **action != "workspace")
            .map(|action| (action.to_string(), self.key_state(action, None)))
            .collect::<serde_json::Map<_, _>>();
        let all = rollup(self.snapshot.agents.iter());
        let prompt = self.prompt_agent().map(|agent| {
            let overlay = self
                .prompt_slots()
                .into_iter()
                .zip(PROMPT_ACTIONS)
                .map(|(index, action)| (index.to_string(), self.prompt_key_state(action)))
                .collect::<serde_json::Map<_, _>>();
            let prompt = self.prompt();
            json!({
                "paneId": agent.pane_id,
                "workspace": self.workspace_label(&agent.workspace_id),
                "options": prompt.map(|prompt| prompt.options.clone()).unwrap_or_default(),
                "selected": prompt.and_then(|prompt| prompt.selected),
                "keys": overlay
            })
        });
        json!({
            "connected": self.connected,
            "prompt": prompt,
            "picker": self.picker_workspace().map(|workspace| workspace.label.clone()),
            "deck": self.deck.to_json(),
            "deckError": self.deck_error,
            "page": self.page,
            "pages": self.pages(),
            "workspaces": workspaces,
            "slots": slots,
            "actions": actions,
            "counts": {
                "agents": all.agents,
                "working": all.working,
                "blocked": all.blocked,
                "done": all.done
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snapshot(agents: &[(&str, &str, &str)], focused: Option<(&str, &str)>) -> Snapshot {
        let mut workspaces = (1..=12)
            .map(|number| Workspace {
                id: format!("w{number}"),
                number,
                label: format!("space-{number}"),
            })
            .collect::<Vec<_>>();
        workspaces.reverse();
        parse_snapshot(&json!({
            "snapshot": {
                "workspaces": workspaces.iter().map(|workspace| json!({
                    "workspace_id": workspace.id,
                    "number": workspace.number,
                    "label": workspace.label
                })).collect::<Vec<_>>(),
                "agents": agents.iter().map(|(pane, workspace, status)| json!({
                    "pane_id": pane,
                    "workspace_id": workspace,
                    "agent": "claude",
                    "agent_status": status
                })).collect::<Vec<_>>(),
                "tabs": [
                    {"tab_id": "w1:t1", "number": 1},
                    {"tab_id": "w1:t2", "number": 2}
                ],
                "panes": agents.iter().map(|(pane, workspace, _)| json!({
                    "pane_id": pane,
                    "workspace_id": workspace,
                    "tab_id": format!("{workspace}:t1"),
                    "terminal_title_stripped": format!("task {pane}"),
                    "cwd": "/srv/project"
                })).chain([json!({
                    "pane_id": "w1:sh",
                    "workspace_id": "w1",
                    "tab_id": "w1:t2",
                    "terminal_title_stripped": "zsh"
                })]).collect::<Vec<_>>(),
                "focused_workspace_id": focused.map(|(workspace, _)| workspace),
                "focused_pane_id": focused.map(|(_, pane)| pane)
            }
        }))
        .unwrap()
    }

    fn runtime(snapshot: Snapshot) -> Runtime {
        let mut runtime = Runtime::new();
        runtime.update(Some(snapshot));
        runtime
    }

    fn workspace_key() -> Value {
        json!({"id": "herdr", "herdrAction": "workspace", "title": "SPACE"})
    }

    #[test]
    fn resolves_the_socket_from_override_or_config_directory() {
        assert_eq!(
            socket_path_from(
                Some(OsStr::new("/run/herdr.sock")),
                Some("/cfg/herdr".into())
            ),
            Some(PathBuf::from("/run/herdr.sock"))
        );
        assert_eq!(
            socket_path_from(Some(OsStr::new("relative.sock")), Some("/cfg/herdr".into())),
            Some(PathBuf::from("/cfg/herdr/herdr.sock"))
        );
        assert_eq!(socket_path_from(None, None), None);
    }

    #[test]
    fn parses_snapshots_into_sorted_workspaces_and_known_statuses() {
        let snapshot = snapshot(&[("w1:p1", "w1", "thinking")], Some(("w1", "w1:p1")));
        assert_eq!(snapshot.workspaces[0].number, 1);
        assert_eq!(snapshot.workspaces.len(), 12);
        assert_eq!(snapshot.agents[0].status, "unknown");
        assert_eq!(snapshot.pane_cwds["w1:p1"], "/srv/project");
        assert!(parse_snapshot(&json!({"snapshot": {}})).is_err());
    }

    #[test]
    fn default_deck_has_ten_workspaces_four_managed_actions_and_one_optional_slot() {
        let deck = DeckConfig::default();
        assert_eq!(deck.keys.len(), KEY_COUNT);
        assert_eq!(
            deck.keys
                .iter()
                .filter(|slot| slot.action.as_deref() == Some("workspace"))
                .count(),
            10
        );
        assert!(deck.keys[14].optional);
        assert!(deck.keys[..14].iter().all(|slot| !slot.optional));
    }

    #[test]
    fn shipped_plugin_deck_matches_the_built_in_default() {
        let shipped: Value =
            serde_json::from_str(include_str!("../../integrations/herdr/deck.default.json"))
                .unwrap();
        let mut deck = parse_deck_config(&shipped).unwrap();
        deck.source = "default";
        assert_eq!(deck, DeckConfig::default());
    }

    #[test]
    fn validates_plugin_deck_configurations() {
        let mut keys = vec![json!("workspace"); 12];
        keys.extend([
            json!("attention"),
            json!(null),
            json!({"action": "back", "optional": true}),
        ]);
        let deck = parse_deck_config(&json!({
            "version": 1,
            "keys": keys,
            "newAgentKind": "codex",
            "autoSwitch": false
        }))
        .unwrap();
        assert_eq!(deck.new_agent_kind, "codex");
        assert!(!deck.auto_switch);
        assert_eq!(
            deck.keys[13],
            DeckSlot {
                action: None,
                optional: true
            }
        );
        assert!(deck.keys[14].optional);

        assert!(parse_deck_config(&json!({"version": 2})).is_err());
        assert!(parse_deck_config(&json!({"version": 1, "keys": ["workspace"]})).is_err());
        assert!(
            parse_deck_config(&json!({"version": 1, "keys": vec![json!("rm -rf"); 15]})).is_err()
        );
        assert!(parse_deck_config(&json!({"version": 1, "newAgentKind": "../sh"})).is_err());
    }

    #[test]
    fn workspace_slots_count_only_workspace_keys_in_order() {
        let keys = vec![
            json!({"id": "herdr", "herdrAction": "attention"}),
            workspace_key(),
            Value::Null,
            workspace_key(),
        ];
        assert_eq!(workspace_slot(&keys, 0), None);
        assert_eq!(workspace_slot(&keys, 1), Some(0));
        assert_eq!(workspace_slot(&keys, 3), Some(1));
        assert!(has_workspace_keys(&keys));
    }

    #[test]
    fn workspace_rollup_prefers_the_most_urgent_agent() {
        let runtime = runtime(snapshot(
            &[
                ("w1:p1", "w1", "idle"),
                ("w1:p2", "w1", "working"),
                ("w1:p3", "w1", "blocked"),
                ("w2:p1", "w2", "done"),
            ],
            Some(("w2", "w2:p1")),
        ));
        let first = runtime.key_state("workspace", Some(0));
        assert_eq!(first["status"], "blocked");
        assert_eq!(
            first["panes"],
            json!(["idle", "working", "blocked", "shell"])
        );
        assert_eq!(first["detail"], "1 WAITING");
        assert_eq!(first["focused"], false);
        let second = runtime.key_state("workspace", Some(1));
        assert_eq!(second["status"], "done");
        assert_eq!(second["focused"], true);
        assert_eq!(runtime.key_state("workspace", Some(2))["status"], "none");
    }

    #[test]
    fn attention_queue_orders_blocked_before_done_and_oldest_first() {
        let mut runtime = runtime(snapshot(
            &[("w1:p1", "w1", "done"), ("w2:p1", "w2", "working")],
            None,
        ));
        runtime.update(Some(snapshot(
            &[
                ("w1:p1", "w1", "done"),
                ("w2:p1", "w2", "blocked"),
                ("w3:p1", "w3", "blocked"),
            ],
            None,
        )));
        let queue = runtime
            .attention_queue()
            .iter()
            .map(|agent| agent.pane_id.clone())
            .collect::<Vec<_>>();
        assert_eq!(queue, ["w2:p1", "w3:p1", "w1:p1"]);
        assert_eq!(
            runtime.plan("attention", None),
            Ok(Plan::FocusAgent("w2:p1".into()))
        );
    }

    #[test]
    fn workspace_keys_jump_to_the_agent_that_needs_attention() {
        let runtime = runtime(snapshot(
            &[("w1:p1", "w1", "idle"), ("w1:p2", "w1", "blocked")],
            None,
        ));
        assert_eq!(
            runtime.plan("workspace", Some(0)),
            Ok(Plan::FocusAgent("w1:p2".into()))
        );
        assert_eq!(
            runtime.plan("workspace", Some(1)),
            Ok(Plan::FocusWorkspace("w2".into()))
        );
        assert!(runtime.plan("workspace", Some(40)).is_err());
    }

    #[test]
    fn approve_prefers_a_focused_blocked_agent_then_the_oldest_waiting_one() {
        let mut runtime = runtime(snapshot(&[("w1:p1", "w1", "blocked")], None));
        runtime.update(Some(snapshot(
            &[("w1:p1", "w1", "blocked"), ("w2:p1", "w2", "blocked")],
            Some(("w2", "w2:p1")),
        )));
        assert_eq!(
            runtime.plan("approve", None),
            Ok(Plan::Approve("w2:p1".into()))
        );

        runtime.update(Some(snapshot(
            &[("w1:p1", "w1", "blocked"), ("w2:p1", "w2", "blocked")],
            Some(("w3", "w3:p9")),
        )));
        assert_eq!(
            runtime.plan("approve", None),
            Ok(Plan::Approve("w1:p1".into()))
        );
        assert_eq!(runtime.key_state("approve", None)["detail"], "space-1");

        let idle = Runtime::new();
        assert!(idle.plan("approve", None).is_err());
    }

    #[test]
    fn back_returns_to_the_previous_focused_workspace() {
        let mut runtime = runtime(snapshot(&[], Some(("w1", "w1:p1"))));
        assert!(runtime.plan("back", None).is_err());
        runtime.update(Some(snapshot(&[], Some(("w4", "w4:p1")))));
        assert_eq!(
            runtime.plan("back", None),
            Ok(Plan::FocusWorkspace("w1".into()))
        );
        runtime.update(Some(snapshot(&[], Some(("w1", "w1:p1")))));
        assert_eq!(
            runtime.plan("back", None),
            Ok(Plan::FocusWorkspace("w4".into()))
        );
    }

    #[test]
    fn interrupt_and_new_agent_target_the_focused_pane() {
        let runtime = runtime(snapshot(
            &[("w1:p1", "w1", "working")],
            Some(("w1", "w1:p1")),
        ));
        assert_eq!(
            runtime.plan("interrupt", None),
            Ok(Plan::Interrupt("w1:p1".into()))
        );
        assert_eq!(
            runtime.plan("new-agent", None),
            Ok(Plan::NewAgent {
                pane: "w1:p1".into(),
                cwd: Some("/srv/project".into()),
                kind: "claude".into()
            })
        );
        let idle = self::runtime(snapshot(&[("w1:p1", "w1", "idle")], Some(("w1", "w1:p1"))));
        assert!(idle.plan("interrupt", None).is_err());
    }

    #[test]
    fn pages_through_workspaces_beyond_the_visible_slots() {
        let mut runtime = runtime(snapshot(&[], Some(("w1", "w1:p1"))));
        assert_eq!(runtime.pages(), 2);
        assert_eq!(runtime.key_state("workspace", Some(0))["label"], "space-1");
        assert_eq!(runtime.next_page(), 1);
        assert_eq!(runtime.key_state("workspace", Some(0))["label"], "space-11");
        assert_eq!(runtime.key_state("workspace", Some(2))["status"], "empty");
        assert_eq!(runtime.strip()[1].as_ref().unwrap()["lines"][0], "11–12");
        assert_eq!(runtime.next_page(), 0);
    }

    #[test]
    fn live_updates_only_send_changed_keys_and_status_displays() {
        let keys = vec![workspace_key(), workspace_key(), Value::Null];
        let mut runtime = runtime(snapshot(&[("w1:p1", "w1", "working")], None));
        let (first_keys, first_strip) = runtime.render_changes(&keys);
        assert_eq!(first_keys.len(), 2);
        assert_eq!(first_strip.len(), 2);
        assert_eq!(runtime.render_changes(&keys), (vec![], vec![]));

        runtime.update(Some(snapshot(&[("w1:p1", "w1", "blocked")], None)));
        let (changed_keys, changed_strip) = runtime.render_changes(&keys);
        assert_eq!(changed_keys.len(), 1);
        assert_eq!(changed_keys[0]["key"], 1);
        assert_eq!(changed_keys[0]["config"]["herdr"]["status"], "blocked");
        assert_eq!(changed_strip.len(), 1);
        assert_eq!(changed_strip[0]["index"], 2);
    }

    #[test]
    fn disconnecting_marks_every_key_offline() {
        let mut runtime = runtime(snapshot(&[("w1:p1", "w1", "working")], None));
        assert!(runtime.update(None));
        assert!(!runtime.connected);
        assert_eq!(runtime.key_state("workspace", Some(0))["status"], "offline");
        assert!(runtime.plan("attention", None).is_err());
        assert!(!runtime.update(None));
    }

    #[test]
    fn subscribes_to_session_events_and_each_agent_pane() {
        let request = subscription_request(&BTreeSet::from(["w1:p1".to_string()]));
        let subscriptions = request["params"]["subscriptions"].as_array().unwrap();
        assert_eq!(subscriptions.len(), SESSION_EVENTS.len() + 1);
        assert_eq!(
            subscriptions.last().unwrap(),
            &json!({"type": "pane.agent_status_changed", "pane_id": "w1:p1"})
        );
    }

    const CLAUDE_DIALOG: &str = "\
 1. Read the config first
 2. Then edit it

╭──────────────────────────────────────────────╮
│ Bash command                                 │
│   rm -rf target                              │
│ Do you want to proceed?                      │
│ ❯ 1. Yes                                     │
│   2. Yes, and don't ask again for rm         │
│   3. No, and tell Claude what to do (esc)    │
╰──────────────────────────────────────────────╯
";

    fn deck_keys() -> Vec<Value> {
        DeckConfig::default()
            .keys
            .iter()
            .map(|slot| json!({"id": "herdr", "herdrAction": slot.action}))
            .collect()
    }

    #[test]
    fn parses_the_last_numbered_choice_list_and_its_cursor() {
        let (options, selected) = parse_choices(CLAUDE_DIALOG);
        assert_eq!(
            options,
            [
                "Yes",
                "Yes, and don't ask again for rm",
                "No, and tell Claude what to do (esc)"
            ]
        );
        assert_eq!(selected, Some(0));

        let codex = "  1. Yes, proceed (y)\n› 2. No, and tell Codex what to do (esc)\n";
        assert_eq!(parse_choices(codex).1, Some(1));
        let questions = "❯ 1. Postgres\n     Relational storage\n  2. SQLite\n     Embedded\n";
        assert_eq!(parse_choices(questions).0, ["Postgres", "SQLite"]);
        assert_eq!(parse_choices("Proceed? (y/n)\n1.5 seconds"), (vec![], None));
    }

    #[test]
    fn a_waiting_focused_agent_turns_action_keys_into_dialog_controls() {
        let keys = deck_keys();
        let mut runtime = runtime(snapshot(
            &[("w1:p1", "w1", "blocked"), ("w2:p1", "w2", "blocked")],
            Some(("w1", "w1:p1")),
        ));
        runtime.set_prompt(Some(Prompt {
            pane_id: "w1:p1".into(),
            options: vec!["Yes".into(), "Always".into(), "No".into()],
            selected: Some(1),
        }));
        let actions = (0..KEY_COUNT)
            .map(|index| runtime.prompt_action(&keys, index))
            .collect::<Vec<_>>();
        assert_eq!(actions[..10], [None; 10]);
        assert_eq!(
            actions[10..14],
            [
                Some("prompt-up"),
                Some("prompt-down"),
                Some("prompt-select"),
                Some("prompt-cancel")
            ]
        );
        assert_eq!(actions[14], None, "the optional slot keeps its action");

        let rendered = runtime.render_keys(&keys);
        let select = &rendered[12].1["herdr"];
        assert_eq!(select["label"], "Always");
        assert_eq!(select["detail"], "SELECT 2/3");
        assert_eq!(rendered[10].1["herdr"]["detail"], "Yes");
        assert_eq!(rendered[11].1["herdr"]["detail"], "No");
        assert_eq!(runtime.strip()[1].as_ref().unwrap()["label"], "CHOICE");

        assert_eq!(
            runtime.plan("prompt-down", None),
            Ok(Plan::Answer("w1:p1".into(), "down"))
        );
        assert_eq!(
            runtime.plan("prompt-cancel", None),
            Ok(Plan::Answer("w1:p1".into(), "esc"))
        );
    }

    #[test]
    fn dialog_controls_disappear_when_the_focused_agent_stops_waiting() {
        let keys = deck_keys();
        let mut runtime = runtime(snapshot(
            &[("w1:p1", "w1", "working"), ("w2:p1", "w2", "blocked")],
            Some(("w1", "w1:p1")),
        ));
        runtime.set_prompt(Some(Prompt {
            pane_id: "w2:p1".into(),
            options: vec!["Yes".into(), "No".into()],
            selected: Some(0),
        }));
        assert!(!runtime.prompt_active());
        assert_eq!(runtime.prompt_action(&keys, 10), None);
        assert_eq!(runtime.render_keys(&keys)[10].1["herdr"]["label"], "NEXT");
        assert_eq!(runtime.strip()[1].as_ref().unwrap()["label"], "SPACES");
        assert!(runtime.plan("prompt-select", None).is_err());
        assert!(runtime.public_state()["prompt"].is_null());
    }

    #[test]
    fn a_dialog_without_a_choice_list_still_offers_navigation() {
        let keys = deck_keys();
        let mut runtime = runtime(snapshot(
            &[("w1:p1", "w1", "blocked")],
            Some(("w1", "w1:p1")),
        ));
        runtime.set_prompt(Some(Prompt {
            pane_id: "w1:p1".into(),
            ..Prompt::default()
        }));
        let rendered = runtime.render_keys(&keys);
        assert_eq!(rendered[12].1["herdr"]["label"], "SELECT");
        assert_eq!(rendered[12].1["herdr"]["detail"], "ENTER");
        assert_eq!(runtime.strip()[1].as_ref().unwrap()["label"], "WAITING");
        assert_eq!(
            runtime.public_state()["prompt"]["keys"]["13"]["label"],
            "CANCEL"
        );
    }

    #[test]
    fn long_press_lists_the_panes_of_a_workspace_until_one_is_chosen() {
        let mut runtime = runtime(snapshot(
            &[("w1:p1", "w1", "working"), ("w1:p2", "w1", "blocked")],
            Some(("w1", "w1:p2")),
        ));
        runtime.open_picker(0).unwrap();
        assert!(runtime.picker_open());

        let first = runtime.key_state("workspace", Some(0));
        assert_eq!(first["label"], "CLAUDE");
        assert_eq!(first["number"], "T1");
        assert_eq!(first["status"], "working");
        assert_eq!(runtime.key_state("workspace", Some(1))["focused"], true);
        let shell = runtime.key_state("workspace", Some(2));
        assert_eq!(shell["label"], "SHELL");
        assert_eq!(shell["glyph"], "shell");
        assert_eq!(runtime.key_state("workspace", Some(3))["status"], "empty");
        assert_eq!(first["detail"], "WORKING");
        let close = runtime.key_state("workspace", Some(9));
        assert_eq!(close["detail"], "CLOSE");
        assert_eq!(close["status"], "blocked");
        assert_eq!(close["panes"], json!(["working", "blocked", "shell"]));
        assert_eq!(runtime.strip()[1].as_ref().unwrap()["label"], "PANES");

        assert_eq!(
            runtime.plan("workspace", Some(2)),
            Ok(Plan::FocusPane("w1:sh".into()))
        );
        assert_eq!(runtime.plan("workspace", Some(9)), Ok(Plan::ClosePicker));
        assert!(runtime.close_picker());
        assert_eq!(
            runtime.plan("workspace", Some(0)),
            Ok(Plan::FocusAgent("w1:p2".into()))
        );
        assert!(runtime.open_picker(20).is_err());
    }

    #[test]
    fn dictation_toggles_on_the_focused_claude_agent_until_it_submits() {
        let mut runtime = runtime(snapshot(&[("w1:p1", "w1", "idle")], Some(("w1", "w1:p1"))));
        assert_eq!(runtime.key_state("dictate", None)["label"], "DICTATE");
        assert_eq!(
            runtime.plan("dictate", None),
            Ok(Plan::Dictate {
                pane: "w1:p1".into(),
                start: true
            })
        );
        runtime.begin_dictation("w1:p1");
        let recording = runtime.key_state("dictate", None);
        assert_eq!(recording["label"], "REC");
        assert_eq!(recording["status"], "blocked");

        // Stopping targets the recording pane even after the focus moved on.
        runtime.update(Some(snapshot(
            &[("w1:p1", "w1", "idle"), ("w2:p1", "w2", "idle")],
            Some(("w2", "w2:p1")),
        )));
        assert_eq!(
            runtime.plan("dictate", None),
            Ok(Plan::Dictate {
                pane: "w1:p1".into(),
                start: false
            })
        );
        assert!(runtime.update(Some(snapshot(
            &[("w1:p1", "w1", "working"), ("w2:p1", "w2", "idle")],
            Some(("w2", "w2:p1")),
        ))));
        assert!(!runtime.dictating());

        let waiting = self::runtime(snapshot(
            &[("w1:p1", "w1", "blocked")],
            Some(("w1", "w1:p1")),
        ));
        assert!(waiting.plan("dictate", None).is_err());
        assert_eq!(waiting.key_state("dictate", None)["enabled"], false);
    }
}
