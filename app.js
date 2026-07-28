const nativeRuntime = window.__TAURI__;
const buildInfo = window.__N1_BUILD_INFO__ || {};

const backend = {
  invoke(command, args = {}) {
    if (!nativeRuntime?.core?.invoke) {
      return Promise.reject(new Error("N1 Studio must be opened through the native desktop application"));
    }
    return nativeRuntime.core.invoke(command, args);
  },
  device() {
    return this.invoke("device_status");
  },
  loadConfig() {
    return this.invoke("load_config");
  },
  autostartStatus() {
    return this.invoke("autostart_status");
  },
  setAutostart(enabled) {
    return this.invoke("set_autostart_enabled", { enabled });
  },
  sync(payload) {
    return this.invoke("sync_deck", { payload });
  },
  syncKeyVisual(key, action) {
    return this.invoke("sync_key_visual", { key, action });
  },
  storeAsset(payload) {
    return this.invoke("store_asset", { payload });
  },
  storeSound(payload) {
    return this.invoke("store_sound", { payload });
  },
  setBrightness(brightness) {
    return this.invoke("set_brightness", { brightness });
  },
  identify(brightness) {
    return this.invoke("identify_device", { brightness });
  },
  minimizeWindow() {
    return this.invoke("minimize_window");
  },
  closeWindow() {
    return this.invoke("close_window");
  },
  startWindowDrag() {
    return this.invoke("start_window_drag");
  },
  testAction(key, action) {
    const sound = action?.sound;
    return this.invoke("test_action", {
      key,
      action: {
        id: String(action?.id || ""),
        title: String(action?.title || "").slice(0, 18),
        target: String(action?.command || action?.target || "").slice(0, 2048),
        soundId: sound?.id || null,
        soundName: sound?.name || null,
        soundDuration: Number(sound?.duration) || null,
        soundWaveform: Array.isArray(sound?.waveform) ? sound.waveform : null,
        soundPressBehavior: action?.soundPressBehavior || "stop",
        soundLoop: action?.soundLoop === true,
        screenshotClipboard: action?.screenshotClipboard === true,
        agent: action?.agent || null,
        agentWorkflow: action?.agentWorkflow || null,
        agentPrompt: action?.agentWorkflow === "prompt"
          ? String(action?.agentPrompt || "").slice(0, 1000)
          : null,
        agentSlot: Number(action?.agentSlot) || null,
        projectDirectory: action?.projectDirectory || null
      }
    });
  },
  validateProjectDirectory(directory) {
    return this.invoke("validate_project_directory", { directory });
  },
  chooseProjectDirectory(initialDirectory = null) {
    return this.invoke("choose_project_directory", { initialDirectory });
  },
  resolveAsset(assetId) {
    return this.invoke("resolve_asset", { assetId });
  },
  listen(handler) {
    if (!nativeRuntime?.event?.listen) {
      return Promise.reject(new Error("Native event bridge unavailable"));
    }
    return nativeRuntime.event.listen("hardware-event", (event) => handler(event.payload));
  }
};

const icons = {
  camera: '<svg viewBox="0 0 24 24"><path d="M14.5 6 16 8h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3l1.5-2h5Z"></path><circle cx="12" cy="13" r="3.5"></circle></svg>',
  mic: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"></rect><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"></path></svg>',
  volume: '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4V5Z"></path><path d="M15 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12"></path></svg>',
  monitor: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2"></rect><path d="M8 21h8M12 17v4"></path></svg>',
  record: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"></circle><circle cx="12" cy="12" r="3"></circle></svg>',
  message: '<svg viewBox="0 0 24 24"><path d="M20 15a3 3 0 0 1-3 3H8l-5 3V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v8Z"></path><path d="M8 9h8M8 13h5"></path></svg>',
  app: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3"></rect><path d="M9 9h6v6H9z"></path></svg>',
  codexAgent: '<svg viewBox="0 0 24 24"><path d="m12 3 3 1.7 3.4-.1.1 3.4 1.7 3-1.7 3-.1 3.4-3.4-.1-3 1.7-3-1.7-3.4.1-.1-3.4-1.7-3 1.7-3 .1-3.4 3.4.1L12 3Z"></path><circle cx="12" cy="12" r="3.2"></circle></svg>',
  claudeAgent: '<svg viewBox="0 0 24 24"><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4"></path><circle cx="12" cy="12" r="2.5"></circle></svg>',
  geminiAgent: '<svg viewBox="0 0 24 24"><path d="M12 2c.8 6.3 3.7 9.2 10 10-6.3.8-9.2 3.7-10 10-.8-6.3-3.7-9.2-10-10 6.3-.8 9.2-3.7 10-10Z"></path></svg>',
  resume: '<svg viewBox="0 0 24 24"><path d="M4 8v5h5"></path><path d="M5.5 12a7 7 0 1 0 2-5"></path><path d="M12 8v4l3 2"></path></svg>',
  plan: '<svg viewBox="0 0 24 24"><path d="M9 5h11M9 12h11M9 19h11"></path><path d="m3.5 5 1.2 1.2L7 3.8M3.5 12l1.2 1.2L7 10.8M3.5 19l1.2 1.2L7 17.8"></path></svg>',
  build: '<svg viewBox="0 0 24 24"><path d="m14 5 5 5-9 9H5v-5l9-9Z"></path><path d="m12 7 5 5M4 4h6M7 1v6"></path></svg>',
  bug: '<svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="12" rx="5"></rect><path d="M9 7V5a3 3 0 0 1 6 0v2M4 10h3M17 10h3M4 15h3M17 15h3M9 11h6M12 11v8"></path></svg>',
  test: '<svg viewBox="0 0 24 24"><path d="M9 3h6M10 3v5l-5 9a3 3 0 0 0 2.6 4h8.8a3 3 0 0 0 2.6-4l-5-9V3"></path><path d="M7.5 16h9"></path></svg>',
  review: '<svg viewBox="0 0 24 24"><path d="M4 5h11v14H4zM8 9h3M8 13h3"></path><circle cx="17" cy="16" r="4"></circle><path d="m20 19 2 2"></path></svg>',
  refactor: '<svg viewBox="0 0 24 24"><path d="M7 7h10M14 4l3 3-3 3M17 17H7M10 14l-3 3 3 3"></path></svg>',
  explain: '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4V5Z"></path><path d="M8 9h8M8 13h5"></path></svg>',
  docs: '<svg viewBox="0 0 24 24"><path d="M5 3h10l4 4v14H5V3Z"></path><path d="M14 3v5h5M8 12h8M8 16h8"></path></svg>',
  ship: '<svg viewBox="0 0 24 24"><path d="M4 14 12 3l8 11-8 7-8-7Z"></path><path d="M8 14h8M12 3v18"></path></svg>',
  keyboard: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2"></rect><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10"></path></svg>',
  terminal: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="m7 9 3 3-3 3M13 15h4"></path></svg>',
  folder: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"></path></svg>',
  web: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"></circle><path d="M3 12h18M12 3c2.4 2.5 3.6 5.5 3.6 9s-1.2 6.5-3.6 9c-2.4-2.5-3.6-5.5-3.6-9S9.6 5.5 12 3Z"></path></svg>',
  music: '<svg viewBox="0 0 24 24"><path d="M9 18V5l10-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="16" cy="16" r="3"></circle></svg>',
  sound: '<svg viewBox="0 0 24 24"><path d="M4 13v-2M8 16V8M12 19V5M16 16V8M20 13v-2"></path></svg>',
  screenshotFull: '<svg viewBox="0 0 24 24"><path d="M8 3H4a1 1 0 0 0-1 1v4M16 3h4a1 1 0 0 1 1 1v4M8 21H4a1 1 0 0 1-1-1v-4M16 21h4a1 1 0 0 0 1-1v-4"></path><rect x="7" y="7" width="10" height="10" rx="2"></rect><circle cx="12" cy="12" r="2.4"></circle></svg>',
  screenshotArea: '<svg viewBox="0 0 24 24"><path d="M8 3H4a1 1 0 0 0-1 1v4M16 3h4a1 1 0 0 1 1 1v4M8 21H4a1 1 0 0 1-1-1v-4M16 21h4a1 1 0 0 0 1-1v-4"></path><path stroke-dasharray="2 2" d="M8 8h8v8H8z"></path></svg>',
  screenshotWindow: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="15" rx="2"></rect><path d="M3 9h18M7 7h.01M10 7h.01"></path><path d="M8 12h8v5H8z"></path></svg>',
  sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"></path></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path></svg>',
  layers: '<svg viewBox="0 0 24 24"><path d="m4 9 8-5 8 5-8 5-8-5Z"></path><path d="m4 14 8 5 8-5"></path></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"></path></svg>'
};

const deviceIconSymbols = {
  screenshotFull: `
    <path d="M28 29V20H37M59 20H68V29M28 45V54H37M59 54H68V45" stroke-width="3"></path>
    <circle cx="48" cy="37" r="7" stroke-width="3"></circle>
  `,
  screenshotArea: `
    <path d="M27 29V20H36M60 20H69V29M27 45V54H36M60 54H69V45" stroke-width="3"></path>
    <path d="M36 29h3m4 0h3m4 0h3m4 0h3M36 46h3m4 0h3m4 0h3m4 0h3M36 29v3m0 3v3m0 3v3M60 29v3m0 3v3m0 3v3" stroke-width="2"></path>
  `,
  screenshotWindow: `
    <rect x="25" y="19" width="46" height="36" rx="5" stroke-width="3"></rect>
    <path d="M25 29H71" stroke-width="2"></path>
    <circle cx="32.5" cy="24.5" r="1.5" fill="currentColor" stroke="none"></circle>
    <circle cx="38.5" cy="24.5" r="1.5" fill="currentColor" stroke="none"></circle>
    <rect x="34" y="35" width="28" height="14" stroke-width="2"></rect>
  `,
  codexAgent: `
    <path d="M48 18 62 25 68 39 61 53 46 57 33 49 28 35 36 22 48 18Z" stroke-width="3"></path>
    <circle cx="48" cy="38" r="10" stroke-width="3"></circle>
    <path d="M48 18 38 28 33 49 46 57M62 25 58 48 61 53" stroke-width="2"></path>
  `,
  claudeAgent: `
    <path d="M48 37V17M48 37V57M48 37H28M48 37H68M48 37 33 22M48 37 63 52M48 37 63 22M48 37 33 52" stroke-width="3"></path>
    <circle cx="48" cy="37" r="6" fill="currentColor" stroke="none"></circle>
  `,
  geminiAgent: `
    <path d="m48 16 6 15 16 6-16 6-6 15-6-15-16-6 16-6 6-15Z"></path>
    <path d="M48 16V58M26 37H70" stroke-width="3"></path>
  `,
  resume: `
    <path d="M34 25a20 20 0 1 1-3 23" stroke-width="4"></path>
    <path d="m27 24 11-2-4 11Z" fill="currentColor" stroke="none"></path>
    <path d="M48 27V38L57 43" stroke-width="3"></path>
  `,
  plan: `
    <path d="m31 25 4 4 6-9M46 25H66m-35 12 4 4 6-9M46 37H66m-35 12 4 4 6-9M46 49H66" stroke-width="3"></path>
  `,
  build: `
    <path d="m31 48 24-24 9 9-24 24-11 1 2-10Z"></path>
    <path d="m51 28 9 9M31 20H43M37 14V26" stroke-width="3"></path>
  `,
  bug: `
    <rect x="36" y="24" width="24" height="31" rx="10" stroke-width="3"></rect>
    <path d="M40 24v-5l5-3M56 24v-5l-5-3M27 31l9 3m24 0 9-3M27 48l9-3m24 0 9 3" stroke-width="3"></path>
    <path d="M48 30V53" stroke-width="2"></path>
  `,
  test: `
    <path d="M40 17H56M43 17v12L31 52m22-35v12l12 23" stroke-width="3"></path>
    <path d="M31 52c0-4.7 8.1-8.5 18-8.5S66 47.3 66 52 58.2 60.5 48.5 60.5 31 56.7 31 52Z" stroke-width="3"></path>
    <path d="M35 44H61" stroke-width="2"></path>
  `,
  review: `
    <rect x="29" y="18" width="26" height="38" stroke-width="3"></rect>
    <path d="M35 28H49M35 36H47" stroke-width="2"></path>
    <circle cx="57" cy="45" r="9" stroke-width="3"></circle>
    <path d="m62 51 7 7" stroke-width="3"></path>
  `,
  refactor: `
    <path d="M29 27H63" stroke-width="3"></path>
    <path d="m63 21 7 6-7 6Z" fill="currentColor" stroke="none"></path>
    <path d="M67 48H33" stroke-width="3"></path>
    <path d="m33 42-7 6 7 6Z" fill="currentColor" stroke="none"></path>
  `,
  explain: `
    <rect x="27" y="19" width="42" height="31" rx="6" stroke-width="3"></rect>
    <path d="m34 49v9l12-8" fill="currentColor" stroke="none"></path>
    <path d="M35 29H61M35 38H54" stroke-width="2"></path>
  `,
  docs: `
    <path d="M32 17H56L66 27V57H32V17Z"></path>
    <path d="M56 17V28H66" stroke-width="3"></path>
    <path d="M39 37H59M39 45H59" stroke-width="2"></path>
  `,
  ship: `
    <path d="m48 15 18 28-18 16-18-16 18-28Z"></path>
    <path d="M48 15V59M30 43H66" stroke-width="3"></path>
  `,
  record: `
    <circle cx="48" cy="37" r="14" stroke-width="4"></circle>
    <circle cx="48" cy="37" r="5" fill="currentColor" stroke="none"></circle>
  `,
  camera: `
    <rect x="29" y="24" width="38" height="27" rx="5" stroke-width="4"></rect>
    <circle cx="48" cy="37" r="6" stroke-width="3"></circle>
  `,
  terminal: `
    <rect x="27" y="23" width="42" height="29" rx="5" stroke-width="3"></rect>
    <path d="m35 32 7 6-7 6M47 44H58" stroke-width="3"></path>
  `,
  folder: `
    <rect x="26" y="29" width="44" height="25" rx="4" stroke-width="4"></rect>
    <path d="m28 29 10-7h14l6 7Z" fill="currentColor" stroke="none"></path>
  `,
  music: `
    <circle cx="34.5" cy="48.5" r="5.5" fill="currentColor" stroke="none"></circle>
    <circle cx="58.5" cy="44.5" r="5.5" fill="currentColor" stroke="none"></circle>
    <path d="M39 47V24L63 20V44" stroke-width="4"></path>
  `,
  lock: `
    <rect x="31" y="34" width="34" height="23" rx="4" stroke-width="4"></rect>
    <path d="M36 34c0-8.3 5.4-15 12-15s12 6.7 12 15" stroke-width="4"></path>
  `,
  web: `
    <circle cx="48" cy="37" r="19" stroke-width="3"></circle>
    <path d="M29 37H67" stroke-width="2"></path>
    <ellipse cx="48" cy="37" rx="9" ry="19" stroke-width="2"></ellipse>
  `,
  app: `
    <rect x="31" y="20" width="34" height="35" rx="8" stroke-width="4"></rect>
    <path d="M48 29V46" stroke-width="3"></path>
  `
};

const deviceIconAliases = {
  mic: "record",
  monitor: "camera",
  hotkey: "terminal",
  keyboard: "terminal",
  sound: "music",
  volume: "music"
};

const actionCatalog = [
  { id: "scene", name: "Switch Scene", subtitle: "OBS Studio", description: "Scene: Starting Soon", icon: "camera", color: "#37b7ff", category: "stream", group: "Streaming" },
  { id: "mic", name: "Mute Microphone", subtitle: "Audio control", description: "Default microphone", icon: "mic", color: "#ef476f", category: "stream", group: "Streaming" },
  { id: "volume", name: "Mute Speakers", subtitle: "Audio control", description: "Default speakers", icon: "volume", color: "#38d996", category: "stream", group: "Streaming" },
  { id: "record", name: "Start Recording", subtitle: "OBS Studio", description: "Toggle recording", icon: "record", color: "#ef476f", category: "stream", group: "Streaming" },
  { id: "chat", name: "Show Chat", subtitle: "Browser dock", description: "Open stream chat", icon: "message", color: "#a78bfa", category: "stream", group: "Streaming" },
  { id: "launch", name: "Launch App", subtitle: "Applications", description: "Choose an application", icon: "app", color: "#38d996", category: "system", group: "Desktop" },
  { id: "hotkey", name: "Keyboard Shortcut", subtitle: "System", description: "Ctrl + Shift + M", icon: "keyboard", color: "#e8ff58", category: "system", group: "Desktop" },
  { id: "command", name: "Run Command", subtitle: "Shell", description: "Execute shell command", icon: "terminal", color: "#ff9f1c", category: "system", group: "Desktop" },
  { id: "folder", name: "Open Folder", subtitle: "Files", description: "Open a local folder", icon: "folder", color: "#37b7ff", category: "system", group: "Desktop" },
  { id: "screenshot-full", name: "Full Screen", subtitle: "Screenshot", description: "Save full screen to Pictures/Screenshots", screenshotClipboard: false, icon: "screenshotFull", color: "#e8ff58", category: "system", group: "Capture" },
  { id: "screenshot-area", name: "Screen Area", subtitle: "Screenshot", description: "Save selected area to Pictures/Screenshots", screenshotClipboard: false, icon: "screenshotArea", color: "#37b7ff", category: "system", group: "Capture" },
  { id: "screenshot-window", name: "Active Window", subtitle: "Screenshot", description: "Save active window to Pictures/Screenshots", screenshotClipboard: false, icon: "screenshotWindow", color: "#a78bfa", category: "system", group: "Capture" },
  { id: "website", name: "Open Website", subtitle: "Browser", description: "Open URL", icon: "web", color: "#a78bfa", category: "system", group: "Navigation" },
  { id: "sound", name: "Play Sound", subtitle: "Local audio", description: "Choose a sound file", soundPressBehavior: "stop", soundLoop: false, icon: "sound", color: "#37b7ff", category: "system", group: "Navigation" },
  { id: "music", name: "Play / Pause", subtitle: "Media", description: "System media control", icon: "music", color: "#38d996", category: "system", group: "Navigation" },
  { id: "lock", name: "Lock Screen", subtitle: "Linux", description: "Lock this session", icon: "lock", color: "#e8ff58", category: "system", group: "Navigation" }
];

const agentProfileIds = ["codex-cli", "claude-cli", "gemini-cli"];
const agentWorkflowDefinitions = [
  ["resume", "RESUME", "resume", "#38d996", "Continue the latest session"],
  ["plan", "PLAN", "plan", "#e8ff58", "Plan the next change before editing"],
  ["build", "BUILD", "build", "#37b7ff", "Build a requested feature"],
  ["debug", "DEBUG", "bug", "#ef476f", "Diagnose and fix the current issue"],
  ["test", "TEST", "test", "#a78bfa", "Run tests and repair failures"],
  ["review", "REVIEW", "review", "#ff9f1c", "Review the current working tree"],
  ["refactor", "REFACTOR", "refactor", "#38d996", "Refactor without changing behavior"],
  ["explain", "EXPLAIN", "explain", "#37b7ff", "Explain the current codebase"],
  ["docs", "DOCS", "docs", "#a78bfa", "Improve project documentation"],
  ["ship", "SHIP CHECK", "ship", "#e8ff58", "Run final checks and prepare a handoff"]
];
const agentPromptDefinition = [
  "prompt",
  "AI PROMPT",
  "explain",
  "#ff9f1c",
  "Send a saved prompt to the selected AI model"
];

const agentDefinitions = {
  codex: { label: "Codex", icon: "codexAgent", color: "#37b7ff" },
  claude: { label: "Claude", icon: "claudeAgent", color: "#ff9f1c" },
  gemini: { label: "Gemini", icon: "geminiAgent", color: "#a78bfa" }
};

function agentDefinition(agent) {
  return agentDefinitions[agent] || agentDefinitions.codex;
}

function agentWorkflowDefinition(workflow) {
  return workflow === agentPromptDefinition[0]
    ? agentPromptDefinition
    : agentWorkflowDefinitions.find(([id]) => id === workflow) || null;
}

function defaultAgentTitle(action, agent = action?.agent || "codex") {
  const label = agentDefinition(agent).label.toUpperCase();
  if (action?.agentWorkflow === "new") return `${label} 1`;
  return agentWorkflowDefinition(action?.agentWorkflow)?.[1] || label;
}

function agentActionPresentation(action, agent, updateTitle = false) {
  const definition = agentDefinition(agent);
  const workflow = action?.agentWorkflow || "new";
  const isSession = workflow === "new";
  const workflowDefinition = agentWorkflowDefinition(workflow);
  const workflowTitle = workflowDefinition?.[1] || "SESSION";
  const description = isSession
    ? `Focus this named ${definition.label} session, or open it in the system terminal`
    : workflowDefinition?.[4] || action.description;
  return {
    agent,
    agentMonitor: isSession ? agent : null,
    activeColor: isSession ? definition.color : action.activeColor,
    icon: isSession ? definition.icon : workflowDefinition?.[2] || definition.icon,
    name: isSession ? `${definition.label} Session` : `${definition.label} ${workflowTitle}`,
    subtitle: `${definition.label} CLI · ${isSession ? "Named session" : workflow}`,
    description,
    ...(updateTitle ? { title: defaultAgentTitle(action, agent) } : {})
  };
}

actionCatalog.push({
  id: "ai-agent",
  catalogId: "ai-session",
  name: "AI Session",
  subtitle: "Choose a model · Auto-numbered",
  description: "Open or focus a uniquely named AI session",
  agent: "codex",
  agentWorkflow: "new",
  agentMonitor: "codex",
  activeColor: agentDefinitions.codex.color,
  idleColor: "#343c40",
  icon: agentDefinitions.codex.icon,
  color: "#343c40",
  category: "ai",
  group: "AI Sessions"
});
actionCatalog.push({
  id: "ai-agent",
  catalogId: "ai-prompt",
  name: "AI Prompt",
  subtitle: "Choose a model · Write your prompt",
  description: agentPromptDefinition[4],
  agent: "codex",
  agentWorkflow: "prompt",
  agentPrompt: "",
  icon: agentPromptDefinition[2],
  color: agentPromptDefinition[3],
  category: "ai",
  group: "AI Prompts"
});
agentWorkflowDefinitions.forEach(([workflow, title, icon, color, description]) => {
  actionCatalog.push({
    id: "ai-agent",
    catalogId: `ai-${workflow}`,
    name: title,
    subtitle: `AI workflow · ${workflow}`,
    description,
    agent: "codex",
    agentWorkflow: workflow,
    icon,
    color,
    category: "ai",
    group: "AI Workflows"
  });
});

function agentProfileLayout(agent) {
  const definition = agentDefinition(agent);
  const label = definition.label.toUpperCase();
  const idleColor = "#343c40";
  const slots = Array.from({ length: 5 }, (_, index) => [
    "ai-agent",
    `${label} ${index + 1}`,
    idleColor,
    {
      name: `${definition.label} Session`,
      subtitle: `${definition.label} CLI · Named session`,
      description: `Focus this named ${definition.label} session, or open it in the system terminal`,
      agent,
      agentWorkflow: "new",
      agentMonitor: agent,
      activeColor: definition.color,
      idleColor,
      icon: definition.icon
    }
  ]);
  const workflows = agentWorkflowDefinitions.map(
    ([workflow, title, icon, color, description]) => [
      "ai-agent",
      title,
      color,
      {
        name: `${label} ${title}`,
        subtitle: `${label} CLI · ${workflow}`,
        description,
        agent,
        agentWorkflow: workflow,
        icon
      }
    ]
  );
  return [...slots, ...workflows];
}

const layouts = {
  streaming: [
    ["scene", "STARTING", "#37b7ff"], ["scene", "MAIN CAM", "#37b7ff"], ["scene", "GAME", "#a78bfa"], ["scene", "BRB", "#ff9f1c"], ["record", "RECORD", "#ef476f"],
    ["mic", "MIC", "#ef476f"], ["volume", "SOUND", "#38d996"], ["chat", "CHAT", "#a78bfa"], ["music", "MUSIC", "#38d996"], ["website", "DASHBOARD", "#37b7ff"],
    ["launch", "OBS", "#38d996"], ["launch", "BROWSER", "#ff9f1c"], ["hotkey", "CLIP", "#e8ff58"], ["folder", "ASSETS", "#37b7ff"], null
  ],
  editing: [
    ["hotkey", "CUT", "#ef476f"], ["hotkey", "RIPPLE", "#ff9f1c"], ["hotkey", "UNDO", "#e8ff58"], ["hotkey", "REDO", "#e8ff58"], ["record", "EXPORT", "#38d996"],
    ["hotkey", "MARK IN", "#37b7ff"], ["hotkey", "MARK OUT", "#37b7ff"], ["hotkey", "PLAY", "#38d996"], ["hotkey", "PREV", "#a78bfa"], ["hotkey", "NEXT", "#a78bfa"],
    ["folder", "FOOTAGE", "#37b7ff"], ["music", "AUDIO", "#38d996"], ["launch", "EDITOR", "#ff9f1c"], null, null
  ],
  desktop: [
    ["launch", "TERMINAL", "#38d996"], ["launch", "FILES", "#37b7ff"], ["launch", "MAIL", "#ef476f"], ["launch", "BROWSER", "#ff9f1c"], ["lock", "LOCK", "#e8ff58"],
    ["website", "CALENDAR", "#a78bfa"], ["music", "MUSIC", "#38d996"], ["volume", "VOLUME", "#37b7ff"], ["screenshot-full", "SCREENSHOT", "#e8ff58"], ["command", "UPDATES", "#ff9f1c"],
    null, null, null, null, null
  ],
  "codex-cli": agentProfileLayout("codex"),
  "claude-cli": agentProfileLayout("claude"),
  "gemini-cli": agentProfileLayout("gemini")
};

const profileNames = {
  streaming: "Live Stream",
  editing: "Video Edit",
  desktop: "Daily Desk",
  "codex-cli": "Codex CLI",
  "claude-cli": "Claude CLI",
  "gemini-cli": "Gemini CLI"
};

const defaultProfilesVersion = 1;
const maxProfiles = 24;
const maxProfileNameLength = 40;
const maxAutoSyncRetries = 6;
let currentProfile = "streaming";
let profileOrder = [];
let selectedIndex = 0;
let catalogPreviewAction = null;
let currentCategory = "all";
let history = [];
let future = [];
let duplicateSource = null;
let toastTimer;
let dialValue = 20;
let deviceDetected = false;
let hardwareTransportReady = false;
let shellActionsEnabled = false;
let hardwarePageSwitching = false;
let deckSyncInProgress = false;
let autoSyncTimer = null;
let autoSyncQueued = false;
let autoSyncRevision = 0;
let autoSyncAnnounce = false;
let autoSyncRetryCount = 0;
let pendingIconSlot = null;
let pendingSoundTarget = null;
let profileDialogMode = "create";
let profileDialogSource = null;
let profileDialogTrigger = null;
let agentVisualSyncTimer = null;
let agentVisualSyncQueued = false;
let agentVisualSyncForce = false;
let agentVisualSyncInProgress = false;
const runtimeVisualStates = new Map();
const soundPlaybackStates = new Map();
const soundPlaybackByKey = new Map();
const agentHardwareStates = new Map();
const agentStatuses = new Map([
  ["codex", { count: 0, slots: new Set(), sessions: new Set() }],
  ["claude", { count: 0, slots: new Set(), sessions: new Set() }],
  ["gemini", { count: 0, slots: new Set(), sessions: new Set() }]
]);

const keyGrid = document.querySelector("#keyGrid");
const actionGroups = document.querySelector("#actionGroups");
const keyTitle = document.querySelector("#keyTitle");
const selectedKeyNumber = document.querySelector("#selectedKeyNumber");
const miniKey = document.querySelector("#miniKey");
const brightness = document.querySelector("#brightness");
const brightnessValue = document.querySelector("#brightnessValue");
const toast = document.querySelector("#toast");
const undoButton = document.querySelector("#undoButton");
const redoButton = document.querySelector("#redoButton");
const iconUpload = document.querySelector("#iconUpload");

function renderBuildInfo() {
  const versionElement = document.querySelector("#appVersion");
  const dateElement = document.querySelector("#buildDate");
  const version = String(buildInfo.version || "").trim();
  const date = String(buildInfo.date || "").trim();

  versionElement.textContent = version ? `v${version}` : "DEV";
  dateElement.textContent = date || "LOCAL";
  if (date) dateElement.dateTime = date;
}

function iconMarkup(name) {
  return icons[name] || icons.plus;
}

function deviceIconMarkup(name) {
  const icon = deviceIconAliases[name] || name;
  const symbol = deviceIconSymbols[icon] || deviceIconSymbols.app;
  return `<svg class="device-symbol" viewBox="0 0 96 96" aria-hidden="true">${symbol}</svg>`;
}

function createKeyData(tuple) {
  if (!tuple) return null;
  const overrides = tuple[3] && typeof tuple[3] === "object" ? tuple[3] : {};
  const matchedAction = tuple[0] === "ai-agent"
    ? actionCatalog.find((item) =>
      item.id === "ai-agent"
      && item.agentWorkflow === overrides.agentWorkflow
    )
    : actionCatalog.find((item) => item.id === tuple[0]);
  const { catalogId: _catalogId, ...action } = matchedAction || actionCatalog[0];
  const sceneTargets = {
    STARTING: "Starting Soon",
    "MAIN CAM": "Main Camera",
    GAME: "Game Capture",
    BRB: "Be Right Back"
  };
  return {
    ...action,
    title: tuple[1],
    color: tuple[2],
    target: action.id === "scene" ? (sceneTargets[tuple[1]] || "Starting Soon") : action.description,
    ...overrides
  };
}

Object.keys(layouts).forEach((profile) => {
  layouts[profile] = layouts[profile].map(createKeyData);
});
const factoryLayouts = structuredClone(layouts);

const layoutStorageKey = "n1-stream-controller-studio-layouts";
const legacyLayoutStorageKey = "n1-studio-layouts";
const pageStorageKey = "n1-stream-controller-studio-pages";
const pageLayouts = Object.create(null);
const currentPageByProfile = Object.create(null);
let restoredSavedLayouts = false;
let restoredDefaultProfilesVersion = 0;

function isValidProfileId(value) {
  const profileId = String(value || "");
  return /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(profileId)
    && !["__proto__", "constructor", "prototype"].includes(profileId);
}

function fallbackProfileName(profileId) {
  const words = String(profileId || "Profile")
    .replace(/[-_]+/g, " ")
    .trim();
  return (words || "Profile")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .slice(0, maxProfileNameLength);
}

function savedProfileName(names, profileId) {
  const value = names && typeof names[profileId] === "string"
    ? names[profileId].trim()
    : "";
  return (value || profileNames[profileId] || fallbackProfileName(profileId))
    .slice(0, maxProfileNameLength);
}

try {
  const savedPageJson = localStorage.getItem(pageStorageKey) || "null";
  const savedPageState = savedPageJson.length <= 1_000_000
    ? JSON.parse(savedPageJson)
    : null;
  if (savedPageState?.profiles && typeof savedPageState.profiles === "object") {
    restoredDefaultProfilesVersion = Number(savedPageState.defaultProfilesVersion) || 0;
    const savedIds = [
      ...(Array.isArray(savedPageState.order) ? savedPageState.order : []),
      ...Object.keys(savedPageState.profiles)
    ].map((profile) => String(profile));
    [...new Set(savedIds)]
      .filter((profile) =>
        isValidProfileId(profile) && Object.hasOwn(savedPageState.profiles, profile)
      )
      .slice(0, maxProfiles)
      .forEach((profile) => {
        const savedPages = savedPageState.profiles[profile];
        if (
          Array.isArray(savedPages) &&
          savedPages.length > 0 &&
          savedPages.length <= 99 &&
          savedPages.every((page) => Array.isArray(page) && page.length === 15)
        ) {
          pageLayouts[profile] = savedPages;
          profileNames[profile] = savedProfileName(savedPageState.names, profile);
          profileOrder.push(profile);
          const savedIndex = Number(savedPageState.current?.[profile]);
          currentPageByProfile[profile] = Number.isInteger(savedIndex)
            ? Math.max(0, Math.min(savedIndex, savedPages.length - 1))
            : 0;
          restoredSavedLayouts = true;
        }
      });
    if (savedPageState.profile && pageLayouts[savedPageState.profile]) {
      currentProfile = savedPageState.profile;
    }
  } else {
    const savedLayoutJson =
      localStorage.getItem(layoutStorageKey) || localStorage.getItem(legacyLayoutStorageKey);
    const savedLayouts = (savedLayoutJson || "").length <= 1_000_000
      ? JSON.parse(savedLayoutJson || "null")
      : null;
    if (savedLayouts && typeof savedLayouts === "object") {
      Object.keys(layouts).forEach((profile) => {
        if (Array.isArray(savedLayouts[profile]) && savedLayouts[profile].length === 15) {
          layouts[profile] = savedLayouts[profile];
          restoredSavedLayouts = true;
        }
      });
    }
  }
} catch {
  // A malformed local draft should never prevent the editor from loading.
}

if (profileOrder.length && restoredDefaultProfilesVersion < defaultProfilesVersion) {
  agentProfileIds.forEach((profile) => {
    if (pageLayouts[profile] || profileOrder.length >= maxProfiles) return;
    pageLayouts[profile] = [structuredClone(layouts[profile])];
    currentPageByProfile[profile] = 0;
    profileOrder.push(profile);
  });
}

if (!profileOrder.length) {
  Object.keys(layouts).forEach((profile) => {
    pageLayouts[profile] = agentProfileIds.includes(profile)
      ? [layouts[profile]]
      : [layouts[profile], Array(15).fill(null)];
    currentPageByProfile[profile] = 0;
    profileOrder.push(profile);
  });
}

if (!pageLayouts[currentProfile]) currentProfile = profileOrder[0];
normalizeStoredAgentActions();

function activePageIndex(profile = currentProfile) {
  return currentPageByProfile[profile] || 0;
}

function activeLayout(profile = currentProfile) {
  return pageLayouts[profile][activePageIndex(profile)];
}

function replaceActiveLayout(layout) {
  pageLayouts[currentProfile][activePageIndex()] = layout;
}

function persistPages() {
  try {
    localStorage.setItem(pageStorageKey, JSON.stringify({
      version: 3,
      defaultProfilesVersion,
      profile: currentProfile,
      current: currentPageByProfile,
      names: profileNames,
      order: profileOrder,
      profiles: pageLayouts
    }));
  } catch {
    // Local drafts are a convenience; storage failures must not block editing.
  }
}

function renderProfileOptions() {
  const select = document.querySelector("#profileSelect");
  const options = profileOrder.map((profileId) => {
    const option = document.createElement("option");
    option.value = profileId;
    option.textContent = profileNames[profileId];
    return option;
  });
  select.replaceChildren(...options);
  select.value = currentProfile;
  document.querySelector("#layoutTitle").textContent = profileNames[currentProfile];
  const profileStatus = document.querySelector("#deviceProfileStatus");
  if (profileStatus) {
    profileStatus.textContent = profileNames[currentProfile].toUpperCase();
    profileStatus.parentElement.setAttribute(
      "aria-label",
      `Current profile: ${profileNames[currentProfile]}`
    );
  }

  const atProfileLimit = profileOrder.length >= maxProfiles;
  const addButton = document.querySelector("#addProfileButton");
  const duplicateButton = document.querySelector("#duplicateProfileButton");
  const resetButton = document.querySelector("#resetProfileButton");
  const deleteButton = document.querySelector("#deleteProfileButton");
  addButton.disabled = atProfileLimit;
  duplicateButton.disabled = atProfileLimit;
  deleteButton.disabled = profileOrder.length <= 1;
  addButton.title = atProfileLimit ? `Up to ${maxProfiles} profiles are supported` : "Add profile";
  duplicateButton.title = atProfileLimit
    ? `Up to ${maxProfiles} profiles are supported`
    : "Duplicate current profile";
  resetButton.title = Object.hasOwn(factoryLayouts, currentProfile)
    ? "Reset profile to factory defaults"
    : "Clear profile to one empty page";
  deleteButton.title = profileOrder.length <= 1
    ? "The only profile cannot be deleted"
    : "Delete current profile";
}

function activateProfile(profileId, { sync = true } = {}) {
  if (!pageLayouts[profileId]) return;
  currentProfile = profileId;
  selectedIndex = 0;
  catalogPreviewAction = null;
  duplicateSource = null;
  history = [];
  future = [];
  updateHistoryButtons();
  renderProfileOptions();
  renderPageTabs();
  renderKeys();
  if (sync) requestDeviceSync({ immediate: true });
  else persistPages();
}

function uniqueProfileName(baseName) {
  const usedNames = new Set(
    profileOrder.map((profileId) => profileNames[profileId].trim().toLocaleLowerCase())
  );
  const base = (String(baseName || "").trim() || "New Profile").slice(0, maxProfileNameLength);
  if (!usedNames.has(base.toLocaleLowerCase())) return base;
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const ending = ` ${suffix}`;
    const candidate = `${base.slice(0, maxProfileNameLength - ending.length).trimEnd()}${ending}`;
    if (!usedNames.has(candidate.toLocaleLowerCase())) return candidate;
  }
  return `Profile ${Date.now().toString(36)}`.slice(0, maxProfileNameLength);
}

function createProfileId() {
  const base = `profile-${Date.now().toString(36)}`;
  let profileId = base;
  let suffix = 2;
  while (pageLayouts[profileId]) {
    profileId = `${base}-${suffix}`;
    suffix += 1;
  }
  return profileId;
}

function createProfile(name, duplicateProfileId = null) {
  if (profileOrder.length >= maxProfiles) {
    showToast("Profile limit reached", `Studio supports up to ${maxProfiles} profiles.`);
    return false;
  }
  const profileId = createProfileId();
  const sourcePages = duplicateProfileId ? pageLayouts[duplicateProfileId] : null;
  pageLayouts[profileId] = sourcePages
    ? uniquelyNumberAgentSessions(structuredClone(sourcePages))
    : [Array(15).fill(null)];
  currentPageByProfile[profileId] = sourcePages
    ? activePageIndex(duplicateProfileId)
    : 0;
  profileNames[profileId] = name;
  profileOrder.push(profileId);
  activateProfile(profileId);
  showToast(
    sourcePages ? "Profile duplicated" : "Profile created",
    sourcePages
      ? `${name} includes all ${sourcePages.length} ${sourcePages.length === 1 ? "page" : "pages"}.`
      : `${name} is ready for actions.`
  );
  return true;
}

function clearProfileRuntimeState(profileId) {
  const prefix = `${profileId}:`;
  for (const stateKey of runtimeVisualStates.keys()) {
    if (stateKey.startsWith(prefix)) runtimeVisualStates.delete(stateKey);
  }
  for (const stateKey of agentHardwareStates.keys()) {
    if (stateKey.startsWith(prefix)) agentHardwareStates.delete(stateKey);
  }
  for (const stateKey of soundPlaybackStates.keys()) {
    if (stateKey.startsWith(prefix)) soundPlaybackStates.delete(stateKey);
  }
  for (const [keyIndex, stateKey] of soundPlaybackByKey) {
    if (stateKey.startsWith(prefix)) soundPlaybackByKey.delete(keyIndex);
  }
}

function factoryPagesForProfile(profileId) {
  if (!Object.hasOwn(factoryLayouts, profileId)) {
    return [Array(15).fill(null)];
  }
  const firstPage = structuredClone(factoryLayouts[profileId]);
  return agentProfileIds.includes(profileId)
    ? [firstPage]
    : [firstPage, Array(15).fill(null)];
}

function resetCurrentProfile() {
  const profileId = currentProfile;
  const profileName = profileNames[profileId];
  const isBuiltIn = Object.hasOwn(factoryLayouts, profileId);
  const resetDescription = isBuiltIn
    ? "Every page and action will be restored to the original factory layout."
    : "Every page and action will be removed, leaving one empty page.";
  if (!window.confirm(`Reset “${profileName}”? ${resetDescription} This cannot be undone.`)) {
    return;
  }

  pageLayouts[profileId] = factoryPagesForProfile(profileId);
  currentPageByProfile[profileId] = 0;
  clearProfileRuntimeState(profileId);
  selectedIndex = 0;
  catalogPreviewAction = null;
  duplicateSource = null;
  history = [];
  future = [];
  updateHistoryButtons();
  renderProfileOptions();
  renderPageTabs();
  renderKeys();
  void requestDeviceSync({ immediate: true, announce: true });
  showToast(
    "Profile reset",
    isBuiltIn
      ? `${profileName} is back to its factory layout.`
      : `${profileName} now contains one empty page.`
  );
}

function deleteCurrentProfile() {
  if (profileOrder.length <= 1) {
    showToast("Profile required", "Studio needs at least one profile.");
    return;
  }
  const deletedProfile = currentProfile;
  const deletedName = profileNames[deletedProfile];
  const pages = pageLayouts[deletedProfile];
  const assignedActions = pages.reduce(
    (count, page) => count + page.filter(Boolean).length,
    0
  );
  const detail = assignedActions
    ? ` It contains ${assignedActions} assigned ${assignedActions === 1 ? "action" : "actions"} across ${pages.length} ${pages.length === 1 ? "page" : "pages"}.`
    : "";
  if (!window.confirm(`Delete “${deletedName}”?${detail} This cannot be undone.`)) return;

  const deletedIndex = profileOrder.indexOf(deletedProfile);
  profileOrder.splice(deletedIndex, 1);
  delete pageLayouts[deletedProfile];
  delete currentPageByProfile[deletedProfile];
  delete profileNames[deletedProfile];
  clearProfileRuntimeState(deletedProfile);

  const nextProfile = profileOrder[Math.min(deletedIndex, profileOrder.length - 1)];
  activateProfile(nextProfile);
  showToast("Profile deleted", `${deletedName} was removed from Studio.`);
}

function setAutoSyncStatus(message, state) {
  const status = document.querySelector("#lastSaved");
  status.textContent = message;
  status.dataset.state = state;
}

function requestDeviceSync({ immediate = false, announce = false } = {}) {
  persistPages();
  autoSyncRevision += 1;
  autoSyncQueued = true;
  autoSyncAnnounce ||= announce;
  autoSyncRetryCount = 0;
  window.clearTimeout(autoSyncTimer);
  autoSyncTimer = null;

  if (!hardwareTransportReady) {
    setAutoSyncStatus(
      deviceDetected ? "Saved locally · waiting for driver" : "Saved locally · device offline",
      "offline"
    );
    return Promise.resolve();
  }

  setAutoSyncStatus("Change queued for device", "pending");
  if (immediate) return flushDeviceSync();
  autoSyncTimer = window.setTimeout(() => {
    autoSyncTimer = null;
    void flushDeviceSync();
  }, 450);
  return Promise.resolve();
}

function autoSyncOnTransportReady(transportWasReady) {
  if (transportWasReady || !hardwareTransportReady) return;
  autoSyncRetryCount = 0;
  if (autoSyncQueued) {
    void flushDeviceSync();
    return;
  }
  void requestDeviceSync({ immediate: true });
}

function scheduleAutoSyncRetry() {
  if (!autoSyncQueued || autoSyncRetryCount >= maxAutoSyncRetries) return;
  const delay = Math.min(500 * (2 ** autoSyncRetryCount), 4000);
  autoSyncRetryCount += 1;
  window.clearTimeout(autoSyncTimer);
  autoSyncTimer = window.setTimeout(() => {
    autoSyncTimer = null;
    if (autoSyncQueued && hardwareTransportReady) void flushDeviceSync();
  }, delay);
}

function visualStateKey(profile, page, index) {
  return `${profile}:${page}:${index}`;
}

function setRuntimeVisualState(index, secondary) {
  runtimeVisualStates.set(
    visualStateKey(currentProfile, activePageIndex(), index),
    Boolean(secondary)
  );
}

function getRuntimeVisualState(index) {
  return runtimeVisualStates.get(
    visualStateKey(currentProfile, activePageIndex(), index)
  ) || false;
}

function selectedVisual(key, secondary = false) {
  if (!key) return null;
  const primary = key.visuals?.primary || (key.image ? { url: key.image, name: "Legacy icon" } : null);
  return secondary ? (key.visuals?.secondary || primary) : primary;
}

function assetPreviewUrl(visual) {
  if (visual?.path && nativeRuntime?.core?.convertFileSrc) {
    return nativeRuntime.core.convertFileSrc(visual.path);
  }
  return visual?.url || "";
}

const fallbackWaveform = [
  .18, .34, .48, .3, .7, .42, .86, .56, .38, .72, .94, .48,
  .28, .62, .82, .4, .68, .9, .52, .32, .74, .58, .88, .46,
  .26, .54, .78, .44, .64, .36, .58, .24
];

function soundWaveformMarkup(sound, playback) {
  const source = Array.isArray(sound?.waveform) && sound.waveform.length >= 8
    ? sound.waveform
    : fallbackWaveform;
  const peaks = source.slice(0, 64).map((peak) =>
    Math.max(.08, Math.min(1, Number(peak) || 0))
  );
  const step = 100 / peaks.length;
  const path = peaks.map((peak, index) => {
    const x = (step * index + step / 2).toFixed(2);
    const height = (peak * 13).toFixed(2);
    return `M${x} ${16 - height}V${16 + height}`;
  }).join("");
  const duration = Math.max(.1, Number(playback?.duration || sound?.duration) || 1);
  const elapsed = playback ? Math.max(0, (performance.now() - playback.startedAt) / 1000) : 0;
  const cycleElapsed = playback?.looping ? elapsed % duration : Math.min(elapsed, duration);
  const style = playback
    ? ` style="--sound-duration:${duration.toFixed(3)}s;--sound-delay:-${cycleElapsed.toFixed(3)}s"`
    : "";
  return `
    <span class="sound-visual${playback ? ` playing${playback.looping ? " looping" : ""}` : ""}"${style} aria-hidden="true">
      <svg class="sound-waveform" viewBox="0 0 100 32" preserveAspectRatio="none"><path d="${path}"></path></svg>
      ${playback ? `<svg class="sound-waveform sound-waveform-played" viewBox="0 0 100 32" preserveAspectRatio="none"><path d="${path}"></path></svg>` : ""}
      <span class="sound-timeline"></span>
      ${playback ? '<span class="sound-playhead"></span>' : ""}
    </span>
  `;
}

function agentModelIndicatorMarkup(key) {
  if (key?.id !== "ai-agent" || isAgentSession(key)) return "";
  const definition = agentDefinition(key.agent);
  return `
    <span
      class="agent-model-indicator"
      style="--model-color:${definition.color}"
      title="${definition.label}"
      aria-label="${definition.label} model"
    >${iconMarkup(definition.icon)}</span>
  `;
}

function agentStatusFor(agent) {
  return agentStatuses.get(agent) || {
    count: 0,
    slots: new Set(),
    sessions: new Set()
  };
}

function agentSessionKey(label, projectDirectory = "") {
  return `${String(label || "").trim().toLocaleLowerCase()}\u0000${String(projectDirectory || "")}`;
}

function agentKeyIsActive(key) {
  if (!key?.agentMonitor) return false;
  const status = agentStatusFor(key.agentMonitor);
  if (!isAgentSession(key)) return status.count > 0;
  if (status.sessions.size) {
    return status.sessions.has(agentSessionKey(key.title, key.projectDirectory));
  }
  const legacySlot = Number(key.agentSlot);
  return Number.isInteger(legacySlot) && status.slots.has(legacySlot);
}

function agentVisualKey(key) {
  if (!key?.agentMonitor) return key;
  const active = agentKeyIsActive(key);
  return {
    ...key,
    color: active
      ? safeColor(key.activeColor, key.color)
      : safeColor(key.idleColor, "#343c40"),
    agentActive: active
  };
}

function updateAgentStatuses(statuses) {
  if (!statuses || typeof statuses !== "object") return;
  let changed = false;
  for (const agent of ["codex", "claude", "gemini"]) {
    const next = statuses[agent] || {};
    const count = Math.max(0, Number(next.count) || 0);
    const slots = new Set(
      (Array.isArray(next.slots) ? next.slots : [])
        .map(Number)
        .filter((slot) => Number.isInteger(slot) && slot >= 1 && slot <= 5)
    );
    const sessions = new Set(
      (Array.isArray(next.sessions) ? next.sessions : [])
        .map((session) => {
          const label = String(session?.label || "").trim();
          return label ? agentSessionKey(label, session?.projectDirectory) : null;
        })
        .filter(Boolean)
    );
    const previous = agentStatusFor(agent);
    const slotsChanged = slots.size !== previous.slots.size
      || [...slots].some((slot) => !previous.slots.has(slot));
    const sessionsChanged = sessions.size !== previous.sessions.size
      || [...sessions].some((session) => !previous.sessions.has(session));
    if (count !== previous.count || slotsChanged || sessionsChanged) changed = true;
    agentStatuses.set(agent, { count, slots, sessions });
  }
  if (!changed) return;
  renderKeys();
  requestAgentVisualSync();
}

function requestAgentVisualSync({ force = false } = {}) {
  agentVisualSyncQueued = true;
  agentVisualSyncForce ||= force;
  window.clearTimeout(agentVisualSyncTimer);
  agentVisualSyncTimer = window.setTimeout(() => {
    agentVisualSyncTimer = null;
    void flushAgentVisualSync();
  }, 160);
}

async function flushAgentVisualSync() {
  if (
    !agentVisualSyncQueued
    || !hardwareTransportReady
    || deckSyncInProgress
    || agentVisualSyncInProgress
  ) return;
  const force = agentVisualSyncForce;
  const syncProfile = currentProfile;
  const syncPage = activePageIndex();
  const monitoredKeys = activeLayout()
    .map((key, index) => ({ key, index }))
    .filter(({ key }) => Boolean(key?.agentMonitor));
  agentVisualSyncQueued = false;
  agentVisualSyncForce = false;
  agentVisualSyncInProgress = true;
  try {
    for (const { key, index } of monitoredKeys) {
      if (currentProfile !== syncProfile || activePageIndex() !== syncPage) break;
      const visualKey = agentVisualKey(key);
      const stateKey = visualStateKey(syncProfile, syncPage, index);
      const state = `${visualKey.agentActive ? "on" : "off"}:${visualKey.color}`;
      if (!force && agentHardwareStates.get(stateKey) === state) continue;
      await backend.syncKeyVisual(index + 1, structuredClone(visualKey));
      agentHardwareStates.set(stateKey, state);
    }
  } catch {
    // A reconnect or the next full sync will restore the latest agent colors.
  } finally {
    agentVisualSyncInProgress = false;
    if (agentVisualSyncQueued) requestAgentVisualSync({ force: agentVisualSyncForce });
  }
}

function keyScreenMarkup(key, secondary = false, playback = null) {
  if (!key) return '<div class="key-screen empty"><span class="empty-plus">+</span></div>';
  const visualKey = agentVisualKey(key);
  const isSound = key.id === "sound" && Boolean(key.sound);
  const visual = isSound ? null : selectedVisual(key, secondary);
  const previewUrl = assetPreviewUrl(visual);
  const color = safeColor(visualKey.color);
  const isAgentMonitored = Boolean(key.agentMonitor);
  const isAgentActive = isAgentMonitored && visualKey.agentActive;
  const screenClass = [
    "key-screen",
    previewUrl ? "has-custom-icon" : "",
    isSound ? "has-sound" : "",
    !previewUrl && !isSound ? "has-device-symbol" : "",
    playback ? "sound-playing" : "",
    isAgentMonitored ? "agent-monitored" : "",
    isAgentMonitored ? (isAgentActive ? "agent-active" : "agent-idle") : ""
  ].filter(Boolean).join(" ");
  const soundMarkup = isSound ? soundWaveformMarkup(key.sound, playback) : "";
  const modelMarkup = agentModelIndicatorMarkup(key);
  const agentMarkup = isAgentMonitored
    ? `<span class="agent-state-dot" title="${isAgentActive ? "Agent running" : "Agent idle"}"></span>`
    : "";
  if (previewUrl) {
    return `<div class="${screenClass}" style="--key-color:${color}"><img src="${escapeHtml(previewUrl)}" alt="" draggable="false">${soundMarkup}${modelMarkup}${agentMarkup}<span class="key-label">${escapeHtml(key.title)}</span></div>`;
  }
  return `<div class="${screenClass}" style="--key-color:${color}">${isSound ? "" : deviceIconMarkup(key.icon)}${soundMarkup}${modelMarkup}${agentMarkup}<span class="key-label">${escapeHtml(key.title)}</span></div>`;
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[char]);
}

function safeColor(value, fallback = "#37b7ff") {
  return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value) : fallback;
}

function formatFileSize(bytes) {
  const size = Number(bytes) || 0;
  if (size < 1_000_000) return `${Math.max(1, Math.round(size / 1_000))} KB`;
  return `${(size / 1_000_000).toFixed(1)} MB`;
}

const screenshotActionIds = new Set([
  "screenshot-full",
  "screenshot-area",
  "screenshot-window"
]);

function screenshotDescription(actionId, clipboard) {
  const subject = {
    "screenshot-full": "full screen",
    "screenshot-area": "selected area",
    "screenshot-window": "active window"
  }[actionId] || "screenshot";
  return clipboard
    ? `Copy ${subject} to clipboard`
    : `Save ${subject} to Pictures/Screenshots`;
}

function soundLabelFromFilename(filename) {
  const name = String(filename || "")
    .trim()
    .replace(/\.(wav|mp3|ogg|flac)$/i, "");
  return (name || "SOUND").toUpperCase().slice(0, 18);
}

function hasDefaultSoundLabel(title) {
  const label = String(title || "").trim();
  return !label || label.toLowerCase() === "play sound";
}

async function analyzeSoundBuffer(buffer) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  const context = new AudioContextClass();
  try {
    const audio = await context.decodeAudioData(buffer.slice(0));
    const peakCount = 40;
    const waveform = [];
    for (let peakIndex = 0; peakIndex < peakCount; peakIndex += 1) {
      const start = Math.floor(audio.length * peakIndex / peakCount);
      const end = Math.max(start + 1, Math.floor(audio.length * (peakIndex + 1) / peakCount));
      const stride = Math.max(1, Math.floor((end - start) / 160));
      let peak = 0;
      for (let channelIndex = 0; channelIndex < audio.numberOfChannels; channelIndex += 1) {
        const channel = audio.getChannelData(channelIndex);
        for (let sample = start; sample < end; sample += stride) {
          peak = Math.max(peak, Math.abs(channel[sample] || 0));
        }
      }
      waveform.push(peak);
    }
    const maximum = Math.max(...waveform, .01);
    return {
      duration: Number(audio.duration.toFixed(3)),
      waveform: waveform.map((peak) => Number(Math.max(.08, peak / maximum).toFixed(3)))
    };
  } finally {
    await context.close().catch(() => {});
  }
}

async function analyzeSoundFile(file) {
  return analyzeSoundBuffer(await file.arrayBuffer());
}

async function analyzeStoredSound(sound) {
  const source = assetPreviewUrl(sound);
  if (!source) return null;
  const response = await fetch(source);
  if (!response.ok) throw new Error(`Unable to read ${sound.name || "sound"}`);
  return analyzeSoundBuffer(await response.arrayBuffer());
}

async function syncKeyVisualImmediately(target, key) {
  const isCurrentPage =
    target.profile === currentProfile && target.page === activePageIndex();
  if (!isCurrentPage || !hardwareTransportReady) return;
  try {
    await backend.syncKeyVisual(target.index + 1, structuredClone(key));
  } catch {
    // The queued full sync below remains the source of truth and retries failures.
  }
}

function renderPageTabs() {
  const pages = pageLayouts[currentProfile];
  const currentPage = activePageIndex();
  const tabs = document.querySelector(".page-tabs");
  tabs.innerHTML = pages.map((_, index) => {
    const isActive = index === currentPage;
    const pageNumber = String(index + 1).padStart(2, "0");
    return `
      <button
        class="page-tab${isActive ? " active" : ""}"
        type="button"
        role="tab"
        aria-selected="${isActive}"
        aria-controls="keyGrid"
        tabindex="${isActive ? "0" : "-1"}"
        data-page-index="${index}"
      >
        <span>${pageNumber}</span>
        <small>${index === 0 ? "LIVE" : "PAGE"}</small>
      </button>
    `;
  }).join("");
  document.querySelector("#layoutNumber").textContent =
    `LAYOUT ${String(currentPage + 1).padStart(2, "0")}`;
  const pageStatus = document.querySelector("#devicePageStatus");
  if (pageStatus) {
    pageStatus.textContent = String(currentPage + 1);
    pageStatus.parentElement.setAttribute(
      "aria-label",
      `Current page: ${currentPage + 1}`
    );
  }
  const deleteButton = document.querySelector('[data-page-action="delete"]');
  deleteButton.disabled = pages.length <= 1;
  deleteButton.setAttribute(
    "aria-label",
    pages.length <= 1
      ? "The only page cannot be deleted"
      : `Delete page ${currentPage + 1}`
  );
  deleteButton.title =
    pages.length <= 1 ? "A profile needs at least one page" : `Delete page ${currentPage + 1}`;
  tabs.querySelector(".active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function switchPage(pageIndex, announce = true, sync = true) {
  const pages = pageLayouts[currentProfile];
  if (!Number.isInteger(pageIndex) || !pages[pageIndex]) return Promise.resolve();
  currentPageByProfile[currentProfile] = pageIndex;
  selectedIndex = 0;
  catalogPreviewAction = null;
  duplicateSource = null;
  history = [];
  future = [];
  updateHistoryButtons();
  renderPageTabs();
  renderKeys();
  const syncPromise = sync
    ? requestDeviceSync({ immediate: true })
    : Promise.resolve();
  if (announce) {
    showToast(
      `Page ${pageIndex + 1}`,
      "The page layout is open and queued for the physical N1."
    );
  }
  return syncPromise;
}

function deleteCurrentPage() {
  const pages = pageLayouts[currentProfile];
  if (pages.length <= 1) {
    showToast("Page required", "A profile needs at least one page.");
    return;
  }

  const pageIndex = activePageIndex();
  const pageNumber = pageIndex + 1;
  const assignedActions = pages[pageIndex].filter(Boolean).length;
  const detail = assignedActions
    ? ` It contains ${assignedActions} assigned ${assignedActions === 1 ? "action" : "actions"}.`
    : "";
  if (!window.confirm(`Delete Page ${pageNumber}?${detail} This cannot be undone.`)) return;

  pages.splice(pageIndex, 1);
  for (const stateKey of runtimeVisualStates.keys()) {
    if (stateKey.startsWith(`${currentProfile}:`)) runtimeVisualStates.delete(stateKey);
  }
  for (const stateKey of agentHardwareStates.keys()) {
    if (stateKey.startsWith(`${currentProfile}:`)) agentHardwareStates.delete(stateKey);
  }

  const nextPage = Math.min(pageIndex, pages.length - 1);
  switchPage(nextPage, false);
  document.querySelector(`.page-tab[data-page-index="${nextPage}"]`)?.focus();
  showToast(
    `Page ${pageNumber} deleted`,
    `The remaining ${pages.length === 1 ? "page has" : `${pages.length} pages have`} been renumbered.`
  );
}

function renderKeys() {
  keyGrid.innerHTML = "";
  activeLayout().forEach((key, index) => {
    const stateKey = visualStateKey(currentProfile, activePageIndex(), index);
    const playback = soundPlaybackStates.get(stateKey) || null;
    const button = document.createElement("button");
    button.className = `deck-key${index === selectedIndex ? " selected" : ""}${playback ? " sound-playing" : ""}`;
    button.dataset.index = index;
    button.setAttribute(
      "aria-label",
      key
        ? `Key ${index + 1}: ${key.title}${playback ? ", sound playing" : ""}${key.agentMonitor ? `, agent ${agentKeyIsActive(key) ? "running" : "idle"}` : ""}`
        : `Key ${index + 1}: empty`
    );
    button.innerHTML = keyScreenMarkup(key, getRuntimeVisualState(index), playback);
    button.addEventListener("click", () => handleKeyClick(index));
    button.addEventListener("dragover", (event) => {
      event.preventDefault();
      button.classList.add("drag-over");
    });
    button.addEventListener("dragleave", () => button.classList.remove("drag-over"));
    button.addEventListener("drop", (event) => {
      event.preventDefault();
      button.classList.remove("drag-over");
      const actionId = event.dataTransfer.getData("text/plain");
      assignAction(index, actionId);
    });
    keyGrid.appendChild(button);
  });
  updateInspector();
}

function renderActions() {
  const query = document.querySelector("#actionSearch").value.trim().toLowerCase();
  const filtered = actionCatalog.filter((action) => {
    const matchesCategory = currentCategory === "all" || action.category === currentCategory;
    const matchesQuery = `${action.name} ${action.subtitle}`.toLowerCase().includes(query);
    return matchesCategory && matchesQuery;
  });
  const groups = [...new Set(filtered.map((action) => action.group))];
  actionGroups.replaceChildren();
  if (!groups.length) {
    const empty = document.createElement("p");
    empty.className = "drag-hint";
    empty.textContent = "No matching actions found.";
    actionGroups.append(empty);
    return;
  }

  groups.forEach((group) => {
    const section = document.createElement("section");
    section.className = "action-group";
    const label = document.createElement("p");
    label.className = "group-label";
    label.append(document.createTextNode(`${String(group).toUpperCase()} `), document.createElement("span"));
    section.append(label);

    filtered.filter((action) => action.group === group).forEach((action) => {
      const item = document.createElement("button");
      const catalogId = action.catalogId || action.id;
      item.className = `action-item${catalogPreviewAction?.catalogId === catalogId ? " previewing" : ""}`;
      item.draggable = true;
      item.dataset.action = catalogId;

      const icon = document.createElement("span");
      icon.className = "action-icon";
      icon.style.setProperty("--icon-color", safeColor(action.color));
      icon.innerHTML = iconMarkup(action.icon);

      const copy = document.createElement("span");
      const name = document.createElement("strong");
      const subtitle = document.createElement("small");
      name.textContent = action.name;
      subtitle.textContent = action.subtitle;
      copy.append(name, subtitle);

      const grip = document.createElement("span");
      grip.className = "drag-grip";
      grip.innerHTML = icons.layers;
      item.append(icon, copy, grip);
      item.addEventListener("click", () => assignAction(selectedIndex, item.dataset.action));
      item.addEventListener("dragstart", (event) => {
        item.classList.add("dragging");
        event.dataTransfer.setData("text/plain", item.dataset.action);
        event.dataTransfer.effectAllowed = "copy";
      });
      item.addEventListener("dragend", () => item.classList.remove("dragging"));
      section.append(item);
    });
    actionGroups.append(section);
  });
}

function updateInspector() {
  const hasSelection = Number.isInteger(selectedIndex);
  const assignedKey = hasSelection ? activeLayout()[selectedIndex] : null;
  const isCatalogPreview = !hasSelection && Boolean(catalogPreviewAction);
  const key = assignedKey || (isCatalogPreview ? catalogPreviewAction : null);
  const playback = hasSelection
    ? soundPlaybackStates.get(
      visualStateKey(currentProfile, activePageIndex(), selectedIndex)
    ) || null
    : null;
  const inspector = document.querySelector(".inspector-panel");
  inspector.classList.toggle("catalog-preview", isCatalogPreview);
  inspector.classList.toggle("no-selection", !hasSelection);
  selectedKeyNumber.textContent = hasSelection
    ? String(selectedIndex + 1).padStart(2, "0")
    : isCatalogPreview ? "AI" : "—";
  document.querySelector("#inspectorSelectionLabel").textContent = isCatalogPreview
    ? "ACTION PREVIEW"
    : hasSelection ? "SELECTED KEY" : "NO KEY SELECTED";
  keyTitle.value = key?.title || "";
  keyTitle.disabled = !assignedKey;
  keyTitle.setCustomValidity("");
  document.querySelector("#titleCount").textContent = `${keyTitle.value.length}/18`;
  miniKey.innerHTML = keyScreenMarkup(
    key,
    hasSelection ? getRuntimeVisualState(selectedIndex) : false,
    playback
  );
  const canPreviewSound =
    hasSelection && key?.id === "sound" && Boolean(key.sound?.id);
  miniKey.classList.toggle("sound-previewable", canPreviewSound);
  miniKey.tabIndex = canPreviewSound ? 0 : -1;
  miniKey.setAttribute("role", canPreviewSound ? "button" : "img");
  miniKey.setAttribute(
    "aria-label",
    canPreviewSound
      ? `${playback ? "Stop" : "Preview"} ${key.sound.name || key.title}`
      : "Selected key preview"
  );

  const name = key?.name || (hasSelection ? "Empty key" : "No key selected");
  const subtitle = key?.subtitle || (
    hasSelection ? "Choose an action" : "Select an action to preview"
  );
  const description = key?.description || (
    hasSelection
      ? "Click an action to assign it"
      : "Palette clicks preview safely while no deck key is selected"
  );
  document.querySelector("#previewActionName").textContent = name;
  document.querySelector("#previewActionType").textContent = subtitle;
  document.querySelector("#assignedActionName").textContent = name;
  document.querySelector("#assignedActionDescription").textContent = description;
  document.querySelector("#assignedActionIcon").innerHTML = iconMarkup(key?.icon || "plus");
  document.querySelector("#assignedActionIcon").style.setProperty("--icon-color", safeColor(key?.color, "#667176"));
  const assignedActionState = document.querySelector("#assignedActionState");
  assignedActionState.textContent = isCatalogPreview ? "PREVIEW" : assignedKey ? "ACTIVE" : "EMPTY";
  assignedActionState.dataset.state = isCatalogPreview
    ? "preview"
    : assignedKey ? "active" : "empty";
  document.querySelector("#clearKeyButton").disabled = !assignedKey;
  document.querySelector("#duplicateButton").disabled = !assignedKey;
  const missingAgentPrompt = (
    key?.id === "ai-agent"
    && key.agentWorkflow === "prompt"
    && !String(key.agentPrompt || "").trim()
  );
  document.querySelector("#testActionButton").disabled =
    !key || (key.id === "sound" && !key.sound?.id) || missingAgentPrompt;
  const targetSelect = document.querySelector("#actionTarget");
  const actionValue = document.querySelector("#actionValue");
  const targetLabel = document.querySelector("#targetLabel");
  const isSoundAction = key?.id === "sound";
  const isScreenshotAction = screenshotActionIds.has(key?.id);
  const isAgentAction = key?.id === "ai-agent";
  document.querySelector("#standardActionTarget").hidden =
    isSoundAction || isScreenshotAction || isAgentAction;
  document.querySelector("#soundPicker").hidden = !isSoundAction;
  document.querySelector("#screenshotSettings").hidden = !isScreenshotAction;
  const agentSettings = document.querySelector("#agentSettings");
  agentSettings.hidden = !isAgentAction;
  if (isAgentAction) {
    const agent = key.agent || "codex";
    const status = agentStatusFor(agent);
    const agentLabel = { codex: "Codex", claude: "Claude", gemini: "Gemini" }[agent] || "AI";
    const workflowLabel = {
      new: "Named AI session",
      resume: "Continue latest session",
      plan: "Plan before editing",
      build: "Build a feature",
      debug: "Debug current issue",
      test: "Run and repair tests",
      review: "Review working tree",
      refactor: "Behavior-safe refactor",
      explain: "Explain the codebase",
      docs: "Improve documentation",
      ship: "Final ship check",
      prompt: "Run saved prompt"
    }[key.agentWorkflow] || "Agent workflow";
    const definition = agentDefinition(agent);
    const agentColor = definition.color;
    agentSettings.style.setProperty("--agent-color", agentColor);
    document.querySelector("#agentRuntimeIcon").innerHTML = iconMarkup(definition.icon);
    document.querySelector("#agentRuntimeName").textContent = `${agentLabel} CLI`;
    document.querySelector("#agentWorkflowName").textContent = workflowLabel;
    const statusElement = document.querySelector("#agentRuntimeStatus");
    statusElement.textContent = status.count ? `RUNNING ${status.count}` : "IDLE";
    statusElement.dataset.state = status.count ? "running" : "idle";
    document.querySelector("#agentRuntimeNote").textContent = isAgentSession(key)
      ? `“${key.title}” is this session’s unique ID; press it again to focus its terminal.`
      : key.agentWorkflow === "prompt"
        ? "Sends this button’s saved prompt as a literal CLI argument in a new terminal."
        : "Opens safely in the system-configured Linux terminal.";
    document.querySelectorAll("[data-agent-model]").forEach((button) => {
      const buttonAgent = button.dataset.agentModel;
      const buttonDefinition = agentDefinition(buttonAgent);
      button.style.setProperty("--model-color", buttonDefinition.color);
      button.querySelector(".agent-model-glyph").innerHTML = iconMarkup(buttonDefinition.icon);
      button.classList.toggle("active", buttonAgent === agent);
      button.setAttribute("aria-checked", String(buttonAgent === agent));
      button.disabled = !assignedKey;
    });
    const promptSetting = document.querySelector("#agentPromptSetting");
    const isPromptAction = key.agentWorkflow === "prompt";
    promptSetting.hidden = !isPromptAction;
    if (isPromptAction) {
      const prompt = String(key.agentPrompt || "");
      const promptInput = document.querySelector("#agentPrompt");
      promptInput.value = prompt;
      promptInput.disabled = !assignedKey;
      document.querySelector("#agentPromptCount").textContent = `${prompt.length}/1000`;
      promptSetting.classList.toggle("empty", !prompt.trim());
      document.querySelector("#agentPromptNote").textContent = prompt.trim()
        ? "Sent exactly as written—shell characters are not evaluated."
        : "Add a prompt before testing or pressing this key.";
    }
    const projectDirectory = String(key.projectDirectory || "");
    const projectInput = document.querySelector("#agentProjectDirectory");
    const projectField = document.querySelector("#agentProjectField");
    projectInput.value = projectDirectory;
    projectInput.disabled = !assignedKey;
    document.querySelector("#chooseAgentProject").disabled = !assignedKey;
    document.querySelector("#clearAgentProject").disabled =
      !assignedKey || !projectDirectory;
    projectField.classList.remove("invalid", "picking");
    const projectNote = document.querySelector("#agentProjectNote");
    projectNote.classList.remove("error");
    projectNote.textContent = projectDirectory
      ? "This button opens the agent with this folder as its working project."
      : "Empty uses the Studio project directory.";
  }
  const screenshotClipboardToggle = document.querySelector("#screenshotClipboardToggle");
  screenshotClipboardToggle.checked = key?.screenshotClipboard === true;
  document.querySelector("#screenshotDestinationDescription").textContent =
    screenshotClipboardToggle.checked
      ? "Place the captured image directly on the clipboard"
      : "Save a timestamped PNG in Pictures/Screenshots";
  const targetSettings = {
    scene: ["Target scene", "", false],
    website: ["Website URL", "https://example.com", true],
    folder: ["Folder path", "/home/user/Documents", true],
    launch: ["Application command", "obs", true],
    command: ["Shell command", "notify-send 'Hello'", true],
    hotkey: ["Shortcut command", "ydotool key 29:1 46:1 46:0 29:0", true]
  };
  const [label, placeholder, useTextInput] = targetSettings[key?.id] || ["Command override", "Optional shell command", true];
  targetLabel.textContent = label;
  targetSelect.hidden = useTextInput;
  targetSelect.disabled = !assignedKey;
  actionValue.hidden = !useTextInput;
  actionValue.disabled = !assignedKey;
  document.querySelector(".select-field > svg").hidden = useTextInput;
  if (useTextInput) {
    actionValue.placeholder = placeholder;
    actionValue.value = key?.command || key?.target || "";
  } else {
    targetSelect.value = key?.target || "Starting Soon";
  }
  const sound = isSoundAction ? key?.sound : null;
  const soundCard = document.querySelector("#soundFileCard");
  soundCard.classList.toggle("loaded", Boolean(sound));
  document.querySelector("#soundFileName").textContent = sound?.name || "Choose a sound";
  document.querySelector("#soundFileMeta").textContent = sound
    ? `${String(sound.mime || "audio").replace("audio/", "").toUpperCase()} · ${formatFileSize(sound.size)}`
    : "Up to 20 MB";
  document.querySelector("#removeSoundFile").hidden = !sound;
  const soundLoopToggle = document.querySelector("#soundLoopToggle");
  const soundRestartToggle = document.querySelector("#soundRestartToggle");
  soundLoopToggle.checked = key?.soundLoop === true;
  soundRestartToggle.checked = key?.soundPressBehavior === "restart";
  soundLoopToggle.disabled = !assignedKey;
  soundRestartToggle.disabled = !assignedKey || soundLoopToggle.checked;
  document.querySelector(".sound-restart-toggle").classList.toggle(
    "disabled",
    soundLoopToggle.checked
  );
  let soundRestartDescription = "Stop the current sound";
  if (soundLoopToggle.checked) {
    soundRestartDescription = "Loop mode always stops on the next press";
  } else if (soundRestartToggle.checked) {
    soundRestartDescription = "Stop the current sound and play it from the beginning";
  }
  document.querySelector("#soundRestartDescription").textContent = soundRestartDescription;
  screenshotClipboardToggle.disabled = !assignedKey;
  document.querySelector(".action-config").style.opacity =
    assignedKey ? "1" : key ? ".7" : ".4";
  document.querySelectorAll("#colorRow button").forEach((button) => {
    button.classList.toggle("active", button.dataset.color === key?.color);
    button.disabled = !assignedKey;
  });
  document.querySelector("#customColor").disabled = !assignedKey;
  document.querySelector("#autoColorButton").disabled = !assignedKey;
  updateIconStateEditor(key, Boolean(assignedKey));
}

function updateIconCard(slot, visual, enabled) {
  const prefix = slot === "primary" ? "primary" : "secondary";
  const card = document.querySelector(`#${prefix}IconCard`);
  const art = document.querySelector(`#${prefix}IconArt`);
  const name = document.querySelector(`#${prefix}IconName`);
  const target = card.querySelector(".icon-upload-target");
  card.classList.toggle("has-asset", Boolean(visual));
  card.classList.toggle("animated", Boolean(visual?.animated));
  target.disabled = !enabled;
  const previewUrl = assetPreviewUrl(visual);
  art.innerHTML = previewUrl
    ? `<img src="${escapeHtml(previewUrl)}" alt="" draggable="false">`
    : '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"></path></svg>';
  name.textContent = visual?.name || (slot === "primary" ? "Add first icon" : "Optional second icon");
}

function updateIconStateEditor(key, editable = Boolean(key)) {
  const behavior = key?.visualBehavior === "toggle" ? "toggle" : "momentary";
  updateIconCard("primary", key?.visuals?.primary || null, editable);
  updateIconCard("secondary", key?.visuals?.secondary || null, editable);
  document.querySelector("#secondaryStateLabel").textContent =
    behavior === "toggle" ? "ON" : "PRESSED";
  document.querySelectorAll("[data-visual-behavior]").forEach((button) => {
    button.classList.toggle("active", button.dataset.visualBehavior === behavior);
    button.disabled = !editable;
  });
  document.querySelector("#iconStateNote").textContent = !key?.visuals?.secondary
    ? "Without a second icon, the first icon stays visible."
    : behavior === "toggle"
      ? "Every press switches between Off and On."
      : "The second icon is visible only while the key is held.";
}

function snapshot() {
  history.push(JSON.stringify(activeLayout()));
  if (history.length > 30) history.shift();
  future = [];
  updateHistoryButtons();
}

function updateHistoryButtons() {
  undoButton.disabled = history.length === 0;
  redoButton.disabled = future.length === 0;
}

async function previewSoundKey(index) {
  const action = activeLayout()?.[index];
  if (action?.id !== "sound" || !action.sound?.id) return;
  keyGrid.children[index]?.animate(
    [
      { transform: "scale(1)" },
      { transform: "scale(.93)", filter: "brightness(1.45)" },
      { transform: "scale(1)" }
    ],
    { duration: 260, easing: "ease-out" }
  );
  try {
    const result = await backend.testAction(index + 1, action);
    if (!result.ok) throw new Error(result.error || "Sound preview failed");
  } catch (error) {
    showToast("Sound could not play", error.message);
  }
}

function handleKeyClick(index) {
  let duplicated = false;
  if (duplicateSource !== null && duplicateSource !== index) {
    snapshot();
    const duplicate = activeLayout()[duplicateSource]
      ? structuredClone(activeLayout()[duplicateSource])
      : null;
    if (isAgentSession(duplicate)) {
      duplicate.title = nextAgentSessionTitle(duplicate.agent, activeLayout()[index]);
      delete duplicate.agentSlot;
    }
    activeLayout()[index] = duplicate;
    duplicateSource = null;
    duplicated = true;
    requestDeviceSync();
    showToast("Key duplicated", `Copied the action to key ${String(index + 1).padStart(2, "0")}.`);
  }
  selectedIndex = index;
  catalogPreviewAction = null;
  renderKeys();
  renderActions();
  if (!duplicated) void previewSoundKey(index);
}

function isAgentSession(action) {
  return action?.id === "ai-agent" && action.agentWorkflow === "new";
}

function agentForProfile(profile = currentProfile) {
  return {
    "codex-cli": "codex",
    "claude-cli": "claude",
    "gemini-cli": "gemini"
  }[profile] || "codex";
}

function agentSessionTitleExists(title, ignoredKey = null, reservedTitles = null) {
  const normalized = String(title || "").trim().toLocaleLowerCase();
  if (!normalized) return false;
  if (reservedTitles?.has(normalized)) return true;
  return Object.values(pageLayouts).some((pages) =>
    pages.some((page) =>
      page.some((key) =>
        key !== ignoredKey
        && isAgentSession(key)
        && String(key.title || "").trim().toLocaleLowerCase() === normalized
      )
    )
  );
}

function nextAgentSessionTitle(agent, ignoredKey = null, reservedTitles = null) {
  const label = agentDefinition(agent).label.toUpperCase();
  let number = 1;
  while (agentSessionTitleExists(`${label} ${number}`, ignoredKey, reservedTitles)) number += 1;
  return `${label} ${number}`;
}

function normalizeStoredAgentActions() {
  const usedSessionTitles = new Set();
  profileOrder.forEach((profile) => {
    pageLayouts[profile]?.forEach((page) => {
      page.forEach((key) => {
        if (key?.id !== "ai-agent") return;
        const agent = agentDefinitions[key.agent] ? key.agent : agentForProfile(profile);
        Object.assign(key, agentActionPresentation(key, agent));
        if (!isAgentSession(key)) return;
        const title = String(key.title || "").trim();
        const normalizedTitle = title.toLocaleLowerCase();
        const invalidTitle = (
          !title
          || title.length > 18
          || /[\u0000-\u001f\u007f]/.test(title)
          || usedSessionTitles.has(normalizedTitle)
        );
        if (invalidTitle) {
          key.title = nextAgentSessionTitle(agent, key, usedSessionTitles);
        }
        usedSessionTitles.add(key.title.trim().toLocaleLowerCase());
      });
    });
  });
}

function uniquelyNumberAgentSessions(pages) {
  const reservedTitles = new Set();
  pages.forEach((page) => {
    page.forEach((key) => {
      if (!isAgentSession(key)) return;
      key.title = nextAgentSessionTitle(key.agent, null, reservedTitles);
      reservedTitles.add(key.title.toLocaleLowerCase());
      delete key.agentSlot;
    });
  });
  return pages;
}

function hasAutomaticAgentSessionTitle(action) {
  return /^(CODEX|CLAUDE|GEMINI) [1-9]\d*$/i.test(String(action?.title || "").trim());
}

function configuredCatalogAction(action, includeCatalogId = false, ignoredKey = null) {
  const { catalogId, ...assignedAction } = action;
  let configured = {
    ...assignedAction,
    ...(includeCatalogId && catalogId ? { catalogId } : {}),
    title: action.name.toUpperCase().slice(0, 18),
    target: action.description,
    visualBehavior: "momentary",
    visuals: { primary: null, secondary: null }
  };
  if (configured.id === "ai-agent") {
    const agent = agentForProfile();
    configured = {
      ...configured,
      ...agentActionPresentation(configured, agent),
      title: isAgentSession(configured)
        ? nextAgentSessionTitle(agent, ignoredKey)
        : defaultAgentTitle(configured, agent)
    };
  }
  return configured;
}

function previewCatalogAction(actionId) {
  const action = actionCatalog.find((item) => (item.catalogId || item.id) === actionId);
  if (!action) return;
  selectedIndex = null;
  duplicateSource = null;
  catalogPreviewAction = configuredCatalogAction(action, true);
  renderKeys();
  renderActions();
}

function deselectKey() {
  if (selectedIndex === null && !catalogPreviewAction) return;
  selectedIndex = null;
  catalogPreviewAction = null;
  duplicateSource = null;
  renderKeys();
  renderActions();
}

function assignAction(index, actionId) {
  const action = actionCatalog.find((item) => (item.catalogId || item.id) === actionId);
  if (!action) return;
  if (!Number.isInteger(index) || index < 0 || index >= activeLayout().length) {
    previewCatalogAction(actionId);
    return;
  }
  snapshot();
  activeLayout()[index] = configuredCatalogAction(action, false, activeLayout()[index]);
  setRuntimeVisualState(index, false);
  selectedIndex = index;
  catalogPreviewAction = null;
  renderKeys();
  renderActions();
  requestDeviceSync();
  showToast("Action assigned", `${action.name} is ready on key ${String(index + 1).padStart(2, "0")}.`);
}

function showToast(title, message) {
  document.querySelector("#toastTitle").textContent = title;
  document.querySelector("#toastMessage").textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 2800);
}

function updateKey(patch) {
  if (!activeLayout()[selectedIndex]) return;
  snapshot();
  activeLayout()[selectedIndex] = { ...activeLayout()[selectedIndex], ...patch };
  renderKeys();
  requestDeviceSync();
}

async function flushDeviceSync() {
  window.clearTimeout(autoSyncTimer);
  autoSyncTimer = null;
  if (!autoSyncQueued || !hardwareTransportReady || deckSyncInProgress) return;

  const revision = autoSyncRevision;
  const syncProfile = currentProfile;
  const syncPage = activePageIndex();
  const announce = autoSyncAnnounce;
  const payload = {
    profile: syncProfile,
    profileName: profileNames[syncProfile] || fallbackProfileName(syncProfile),
    page: syncPage + 1,
    brightness: Number(brightness.value),
    keys: structuredClone(activeLayout())
  };
  autoSyncQueued = false;
  autoSyncAnnounce = false;
  deckSyncInProgress = true;
  setAutoSyncStatus("Syncing automatically…", "syncing");
  let syncSucceeded = false;

  try {
    const result = await backend.sync(payload);
    if (!result.ok) throw new Error(result.error || "Hardware sync failed");
    syncSucceeded = true;
    autoSyncRetryCount = 0;
    hardwareTransportReady = true;
    if (currentProfile === syncProfile && activePageIndex() === syncPage) {
      for (let index = 0; index < activeLayout().length; index += 1) {
        setRuntimeVisualState(index, false);
      }
      renderKeys();
      requestAgentVisualSync({ force: true });
    }
    if (revision === autoSyncRevision && !autoSyncQueued) {
      setAutoSyncStatus("Auto-synced just now", "ready");
    }
    if (announce) {
      const animationLabel = result.animated ? ` · ${result.animated} animated` : "";
      showToast(
        `Page ${syncPage + 1} is live`,
        `${result.written} key images transferred${animationLabel}.`
      );
    }
  } catch (error) {
    const firstFailure = autoSyncRetryCount === 0;
    autoSyncQueued = true;
    setAutoSyncStatus("Saved locally · automatic sync failed", "error");
    if (firstFailure) {
      showToast(
        deviceDetected ? "Hardware sync failed" : "N1 is offline",
        error.message || "The N1 driver could not complete the transfer."
      );
    }
    scheduleAutoSyncRetry();
    void detectDevice();
  } finally {
    deckSyncInProgress = false;
    if (syncSucceeded && autoSyncQueued && hardwareTransportReady) {
      window.setTimeout(() => void flushDeviceSync(), 50);
    }
  }
}

async function cycleHardwarePage() {
  if (hardwarePageSwitching || deckSyncInProgress) {
    showToast("Page switch in progress", "Wait for the current page transfer to finish.");
    return;
  }
  const pages = pageLayouts[currentProfile];
  if (pages.length < 2) {
    showToast("Only one page", "Create another page before using the page button.");
    return;
  }

  hardwarePageSwitching = true;
  const nextPage = (activePageIndex() + 1) % pages.length;
  switchPage(nextPage, false, false);
  showToast(
    `Loading Page ${nextPage + 1}`,
    "The middle device button is updating all 15 physical keys."
  );
  try {
    await requestDeviceSync({ immediate: true, announce: true });
  } finally {
    hardwarePageSwitching = false;
  }
}

async function cycleHardwareProfile() {
  if (hardwarePageSwitching || deckSyncInProgress) {
    showToast("Profile switch in progress", "Wait for the current deck transfer to finish.");
    return;
  }
  if (profileOrder.length < 2) {
    showToast("Only one profile", "Create another profile before using the profile button.");
    return;
  }

  hardwarePageSwitching = true;
  const currentIndex = Math.max(0, profileOrder.indexOf(currentProfile));
  const nextProfile = profileOrder[(currentIndex + 1) % profileOrder.length];
  activateProfile(nextProfile, { sync: false });
  showToast(
    profileNames[nextProfile],
    "Loading this profile onto the physical N1."
  );
  try {
    await requestDeviceSync({ immediate: true, announce: true });
  } finally {
    hardwarePageSwitching = false;
  }
}

async function detectDevice() {
  try {
    const transportWasReady = hardwareTransportReady;
    const device = await backend.device();
    deviceDetected = Boolean(device.connected);
    hardwareTransportReady = Boolean(device.transportReady);
    shellActionsEnabled = device.shellActionsEnabled === true;
    updateAgentStatuses(device.agents);
    const deviceButton = document.querySelector("#deviceButton");
    deviceButton.classList.toggle("disconnected", !deviceDetected);
    deviceButton.classList.toggle("transport-error", deviceDetected && !hardwareTransportReady);
    document.querySelector("#deviceName").textContent = "VSDinside N1";
    const driverStatus = device.driver?.status;
    document.querySelector("#deviceStatus").textContent = !deviceDetected
      ? driverStatus === "reconnecting" || driverStatus === "disconnected"
        ? "Waiting for USB reconnect…"
        : "Not detected"
      : hardwareTransportReady
        ? `Driver ready · ${device.vendorId}:${device.productId}`
        : driverStatus === "not_installed"
          ? "Driver setup required"
          : driverStatus === "error"
            ? "USB permission required"
            : driverStatus === "reconnecting" || driverStatus === "disconnected"
              ? "Reconnecting automatically…"
              : "Driver starting…";
    document.querySelector("#usbIdentity").textContent = `USB ${device.vendorId}:${device.productId}`;
    document.querySelector(".statusbar > span:first-child").innerHTML = deviceDetected
      ? hardwareTransportReady
        ? '<i class="green"></i> Hardware transport ready'
        : '<i style="background:#ff9f1c"></i> Device detected · driver unavailable'
      : '<i style="background:var(--danger)"></i> Device offline';
    if (!hardwareTransportReady && !autoSyncQueued && !deckSyncInProgress) {
      setAutoSyncStatus("Auto-sync waiting for device", "offline");
    } else if (hardwareTransportReady && !autoSyncQueued && !deckSyncInProgress) {
      setAutoSyncStatus("Auto-sync ready", "ready");
    }
    autoSyncOnTransportReady(transportWasReady);
  } catch {
    document.querySelector("#deviceStatus").textContent = "Detection unavailable";
  }
}

document.querySelector("#actionSearch").addEventListener("input", renderActions);
document.querySelectorAll(".category-tabs button").forEach((button) => {
  button.addEventListener("click", () => {
    currentCategory = button.dataset.category;
    document.querySelectorAll(".category-tabs button").forEach((tab) => tab.classList.toggle("active", tab === button));
    renderActions();
  });
});

keyTitle.addEventListener("input", () => {
  document.querySelector("#titleCount").textContent = `${keyTitle.value.length}/18`;
  const key = activeLayout()[selectedIndex];
  if (!key) return;
  if (isAgentSession(key)) {
    const title = keyTitle.value.trim();
    if (!title) {
      keyTitle.setCustomValidity("AI sessions need a unique label.");
      return;
    }
    if (agentSessionTitleExists(title, key)) {
      keyTitle.setCustomValidity("AI session labels must be unique.");
      return;
    }
  }
  keyTitle.setCustomValidity("");
  key.title = keyTitle.value;
  const screenLabel = keyGrid.children[selectedIndex]?.querySelector(".key-label");
  if (screenLabel) screenLabel.textContent = keyTitle.value;
  requestDeviceSync();
});
keyTitle.addEventListener("change", () => {
  if (keyTitle.checkValidity()) return;
  keyTitle.reportValidity();
  showToast("Unique session label required", keyTitle.validationMessage);
});

document.querySelectorAll("#colorRow button").forEach((button) => {
  button.addEventListener("click", () => updateKey({ color: button.dataset.color }));
});
document.querySelector("#customColor").addEventListener("input", (event) => updateKey({ color: event.target.value }));
document.querySelector("#autoColorButton").addEventListener("click", () => {
  const key = activeLayout()[selectedIndex];
  if (!key) return;
  const catalogAction = actionCatalog.find((item) =>
    item.id === key.id
    && (key.id === "ai-agent" || !key.agent || item.agent === key.agent)
    && (!key.agentWorkflow || item.agentWorkflow === key.agentWorkflow)
  );
  updateKey({ color: catalogAction?.color || "#37b7ff" });
});

document.querySelectorAll("[data-icon-slot]").forEach((button) => {
  button.addEventListener("click", () => {
    if (!activeLayout()[selectedIndex]) {
      showToast("Assign an action first", "Icons belong to a configured deck key.");
      return;
    }
    pendingIconSlot = {
      slot: button.dataset.iconSlot,
      profile: currentProfile,
      page: activePageIndex(),
      index: selectedIndex
    };
    iconUpload.value = "";
    iconUpload.click();
  });
});

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(new Error("The selected file could not be read")));
    reader.readAsDataURL(file);
  });
}

iconUpload.addEventListener("change", async () => {
  const file = iconUpload.files?.[0];
  const target = pendingIconSlot;
  pendingIconSlot = null;
  if (!file || !target) return;
  if (file.size > 5_000_000) {
    showToast("Icon is too large", "Choose an image smaller than 5 MB.");
    return;
  }

  const card = document.querySelector(
    target.slot === "primary" ? "#primaryIconCard" : "#secondaryIconCard"
  );
  card.classList.add("uploading");
  try {
    const dataUrl = await readFileAsDataUrl(file);
    const result = await backend.storeAsset({ name: file.name, dataUrl });
    if (!result.ok) throw new Error(result.error || "Icon upload failed");

    const key = pageLayouts[target.profile]?.[target.page]?.[target.index];
    if (!key) throw new Error("The destination key no longer exists");
    const isCurrentPage =
      target.profile === currentProfile && target.page === activePageIndex();
    if (isCurrentPage) snapshot();
    key.visuals = { ...(key.visuals || {}), [target.slot]: result.asset };
    if (isCurrentPage) renderKeys();
    requestDeviceSync();
    showToast(
      result.asset.animated ? "Animated icon added" : "Static icon added",
      `${file.name} is assigned to the ${target.slot === "primary" ? "first" : "second"} state.`
    );
  } catch (error) {
    showToast("Icon upload failed", error.message);
  } finally {
    card.classList.remove("uploading");
    iconUpload.value = "";
  }
});

function removeIcon(slot) {
  const key = activeLayout()[selectedIndex];
  if (!key?.visuals?.[slot]) return;
  const visuals = { ...key.visuals, [slot]: null };
  updateKey({ visuals });
  setRuntimeVisualState(selectedIndex, false);
  showToast("Icon removed", slot === "primary" ? "The generated first icon will be used." : "The first icon will remain visible in both states.");
}

document.querySelector("#removePrimaryIcon").addEventListener("click", () => removeIcon("primary"));
document.querySelector("#removeSecondaryIcon").addEventListener("click", () => removeIcon("secondary"));

document.querySelectorAll("[data-visual-behavior]").forEach((button) => {
  button.addEventListener("click", () => {
    const behavior = button.dataset.visualBehavior;
    setRuntimeVisualState(selectedIndex, false);
    updateKey({ visualBehavior: behavior });
  });
});

document.querySelector("#clearKeyButton").addEventListener("click", () => {
  if (!activeLayout()[selectedIndex]) return;
  snapshot();
  activeLayout()[selectedIndex] = null;
  setRuntimeVisualState(selectedIndex, false);
  renderKeys();
  requestDeviceSync();
  showToast("Key cleared", "The selected slot is now empty.");
});

document.querySelector("#duplicateButton").addEventListener("click", () => {
  duplicateSource = selectedIndex;
  showToast("Choose a destination", "Click another key to duplicate this action.");
});

brightness.addEventListener("input", () => {
  brightnessValue.textContent = `${brightness.value}%`;
  document.documentElement.style.setProperty("--key-brightness", brightness.value / 100);
});
brightness.addEventListener("change", async () => {
  if (!hardwareTransportReady) return;
  try {
    const result = await backend.setBrightness(Number(brightness.value));
    if (!result.ok) throw new Error(result.error || "Brightness update failed");
  } catch (error) {
    showToast("Brightness update failed", error.message);
  }
});

document.querySelector("#actionTarget").addEventListener("change", (event) => {
  updateKey({ target: event.target.value, description: `Scene: ${event.target.value}` });
});
document.querySelector("#actionValue").addEventListener("change", (event) => {
  const key = activeLayout()[selectedIndex];
  if (!key) return;
  const value = event.target.value.trim();
  const usesShellCommand = ["launch", "command", "hotkey"].includes(key.id) || key.id?.startsWith("custom-");
  updateKey(usesShellCommand ? { target: value, command: value, description: value } : { target: value, description: value });
});

function selectedAgentKey() {
  const key = activeLayout()?.[selectedIndex];
  return key?.id === "ai-agent" ? key : null;
}

const agentPromptInput = document.querySelector("#agentPrompt");
agentPromptInput.addEventListener("input", (event) => {
  const key = selectedAgentKey();
  if (key?.agentWorkflow !== "prompt") return;
  const prompt = event.target.value;
  key.agentPrompt = prompt;
  document.querySelector("#agentPromptCount").textContent = `${prompt.length}/1000`;
  document.querySelector("#agentPromptSetting").classList.toggle("empty", !prompt.trim());
  document.querySelector("#agentPromptNote").textContent = prompt.trim()
    ? "Sent exactly as written—shell characters are not evaluated."
    : "Add a prompt before testing or pressing this key.";
  document.querySelector("#testActionButton").disabled = !prompt.trim();
  requestDeviceSync();
});

document.querySelectorAll("[data-agent-model]").forEach((button) => {
  button.addEventListener("click", () => {
    const key = selectedAgentKey();
    const agent = button.dataset.agentModel;
    if (!key || !agentDefinitions[agent] || key.agent === agent) return;
    const shouldRenumber = isAgentSession(key) && hasAutomaticAgentSessionTitle(key);
    const nextTitle = shouldRenumber ? nextAgentSessionTitle(agent, key) : null;
    updateKey({
      ...agentActionPresentation(key, agent),
      ...(nextTitle ? { title: nextTitle } : {})
    });
    showToast(
      `${agentDefinition(agent).label} selected`,
      nextTitle
        ? `This session is now ${nextTitle}.`
        : "The AI model and default icon have been updated."
    );
  });
});

function showAgentProjectError(message) {
  document.querySelector("#agentProjectField").classList.add("invalid");
  const note = document.querySelector("#agentProjectNote");
  note.textContent = message;
  note.classList.add("error");
}

async function saveAgentProjectDirectory(directory) {
  const key = selectedAgentKey();
  if (!key) return;
  const value = String(directory || "").trim();
  if (!value) {
    updateKey({ projectDirectory: null });
    showToast("Studio project selected", "This AI button now uses Studio’s default project directory.");
    return;
  }
  try {
    const normalized = await backend.validateProjectDirectory(value);
    if (selectedAgentKey() !== key) return;
    updateKey({ projectDirectory: normalized });
    showToast("AI project selected", normalized);
  } catch (error) {
    showAgentProjectError(
      error?.message || String(error || "Choose an existing project directory.")
    );
  }
}

const agentProjectInput = document.querySelector("#agentProjectDirectory");
agentProjectInput.addEventListener("input", () => {
  document.querySelector("#agentProjectField").classList.remove("invalid");
  const note = document.querySelector("#agentProjectNote");
  note.classList.remove("error");
  note.textContent = "Press Enter to validate this path, or choose a folder.";
});
agentProjectInput.addEventListener("change", (event) => {
  void saveAgentProjectDirectory(event.target.value);
});
agentProjectInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    event.currentTarget.blur();
  }
});

document.querySelector("#chooseAgentProject").addEventListener("click", async () => {
  const key = selectedAgentKey();
  if (!key) return;
  const field = document.querySelector("#agentProjectField");
  const button = document.querySelector("#chooseAgentProject");
  field.classList.remove("invalid");
  field.classList.add("picking");
  button.disabled = true;
  try {
    const directory = await backend.chooseProjectDirectory(key.projectDirectory || null);
    if (!directory || selectedAgentKey() !== key) return;
    updateKey({ projectDirectory: directory });
    showToast("AI project selected", directory);
  } catch (error) {
    showAgentProjectError(
      error?.message || String(error || "The project folder picker could not be opened.")
    );
  } finally {
    field.classList.remove("picking");
    if (selectedAgentKey() === key) button.disabled = false;
  }
});

document.querySelector("#clearAgentProject").addEventListener("click", () => {
  if (!selectedAgentKey()) return;
  void saveAgentProjectDirectory("");
});

document.querySelector("#chooseSoundFile").addEventListener("click", () => {
  const key = activeLayout()[selectedIndex];
  if (key?.id !== "sound") return;
  pendingSoundTarget = {
    profile: currentProfile,
    page: activePageIndex(),
    index: selectedIndex
  };
  const soundUpload = document.querySelector("#soundUpload");
  soundUpload.value = "";
  soundUpload.click();
});

document.querySelector("#soundUpload").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  const target = pendingSoundTarget;
  pendingSoundTarget = null;
  if (!file || !target) return;
  if (file.size > 20_000_000) {
    showToast("Sound is too large", "Choose a sound file smaller than 20 MB.");
    return;
  }

  const card = document.querySelector("#soundFileCard");
  card.classList.add("uploading");
  try {
    let analysis = null;
    let analysisSettled = false;
    const analysisPromise = analyzeSoundFile(file)
      .catch(() => null)
      .then((result) => {
        analysis = result;
        analysisSettled = true;
        return result;
      });
    const dataUrl = await readFileAsDataUrl(file);
    const result = await backend.storeSound({ name: file.name, dataUrl });
    if (!result.ok) throw new Error(result.error || "Sound upload failed");

    const key = pageLayouts[target.profile]?.[target.page]?.[target.index];
    if (key?.id !== "sound") throw new Error("The destination action is no longer available");
    const isCurrentPage =
      target.profile === currentProfile && target.page === activePageIndex();
    if (isCurrentPage) snapshot();
    const analysisApplied = Boolean(analysis);
    key.sound = { ...result.sound, ...(analysis || {}) };
    if (hasDefaultSoundLabel(key.title)) {
      key.title = soundLabelFromFilename(result.sound.name);
    }
    key.target = result.sound.name;
    key.description = result.sound.name;
    if (isCurrentPage) renderKeys();
    await syncKeyVisualImmediately(target, key);
    requestDeviceSync();
    showToast("Sound ready", `${result.sound.name} will play when the key is pressed.`);

    if (!analysisSettled) analysis = await analysisPromise;
    if (!analysisApplied && analysis && key.sound?.id === result.sound.id) {
      Object.assign(key.sound, analysis);
      if (isCurrentPage) renderKeys();
      await syncKeyVisualImmediately(target, key);
      requestDeviceSync();
    }
  } catch (error) {
    showToast("Sound upload failed", error.message);
  } finally {
    card.classList.remove("uploading");
    event.target.value = "";
  }
});

document.querySelector("#removeSoundFile").addEventListener("click", () => {
  const key = activeLayout()[selectedIndex];
  if (key?.id !== "sound" || !key.sound) return;
  updateKey({
    sound: null,
    target: "",
    description: "Choose a sound file"
  });
  showToast("Sound removed", "Choose another file before testing this action.");
});

document.querySelector("#soundRestartToggle").addEventListener("change", (event) => {
  const behavior = event.target.checked ? "restart" : "stop";
  updateKey({ soundPressBehavior: behavior });
});

document.querySelector("#soundLoopToggle").addEventListener("change", (event) => {
  updateKey({ soundLoop: event.target.checked });
});

document.querySelector("#screenshotClipboardToggle").addEventListener("change", (event) => {
  const key = activeLayout()[selectedIndex];
  if (!screenshotActionIds.has(key?.id)) return;
  const screenshotClipboard = event.target.checked;
  updateKey({
    screenshotClipboard,
    description: screenshotDescription(key.id, screenshotClipboard)
  });
});

document.querySelector("#identifyButton").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  const device = document.querySelector("#device");
  device.classList.remove("identifying");
  void device.offsetWidth;
  device.classList.add("identifying");
  button.disabled = true;
  try {
    const result = await backend.identify(Number(brightness.value));
    if (!result.ok) throw new Error(result.error || "Device identification failed");
    showToast("Device identified", "The physical N1 keys flashed twice.");
  } catch (error) {
    showToast(
      hardwareTransportReady ? "Device identification failed" : "N1 is offline",
      error.message || "The N1 driver could not identify the device."
    );
    detectDevice();
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#testActionButton").addEventListener("click", async () => {
  const hasSelection = Number.isInteger(selectedIndex);
  const selected = hasSelection ? keyGrid.children[selectedIndex] : miniKey;
  const action = hasSelection ? activeLayout()[selectedIndex] : catalogPreviewAction;
  if (!action) {
    showToast("Nothing to test", "Select a key or preview an action from the palette.");
    return;
  }
  if (
    !shellActionsEnabled &&
    (["launch", "command", "hotkey"].includes(action.id) || action.id?.startsWith("custom-"))
  ) {
    showToast(
      "Shell actions are disabled",
      "Restart Studio with N1_STUDIO_ALLOW_SHELL_ACTIONS=1 after reviewing the command."
    );
    return;
  }
  selected.animate(
    [{ transform: "scale(1)" }, { transform: "scale(.91)", filter: "brightness(1.7)" }, { transform: "scale(1)" }],
    { duration: 350, easing: "ease-out" }
  );
  if (hasSelection && action.visuals?.secondary) {
    if (action.visualBehavior === "toggle") {
      setRuntimeVisualState(selectedIndex, !getRuntimeVisualState(selectedIndex));
      renderKeys();
    } else {
      const testedIndex = selectedIndex;
      const testedProfile = currentProfile;
      const testedPage = activePageIndex();
      setRuntimeVisualState(testedIndex, true);
      renderKeys();
      window.setTimeout(() => {
        runtimeVisualStates.set(
          visualStateKey(testedProfile, testedPage, testedIndex),
          false
        );
        if (currentProfile === testedProfile && activePageIndex() === testedPage) {
          renderKeys();
        }
      }, 450);
    }
  }
  try {
    const result = await backend.testAction((hasSelection ? selectedIndex : 0) + 1, action);
    if (!result.ok) throw new Error(result.error || "Action test failed");
  } catch (error) {
    showToast("Action could not run", error.message);
  }
});

miniKey.addEventListener("click", () => {
  if (Number.isInteger(selectedIndex)) void previewSoundKey(selectedIndex);
});
miniKey.addEventListener("keydown", (event) => {
  if (!["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  if (Number.isInteger(selectedIndex)) void previewSoundKey(selectedIndex);
});

document.querySelector("#profileSelect").addEventListener("change", (event) => {
  activateProfile(event.target.value);
});

undoButton.addEventListener("click", () => {
  if (!history.length) return;
  future.push(JSON.stringify(activeLayout()));
  replaceActiveLayout(JSON.parse(history.pop()));
  renderKeys();
  updateHistoryButtons();
  requestDeviceSync();
});

redoButton.addEventListener("click", () => {
  if (!future.length) return;
  history.push(JSON.stringify(activeLayout()));
  replaceActiveLayout(JSON.parse(future.pop()));
  renderKeys();
  updateHistoryButtons();
  requestDeviceSync();
});

document.querySelector(".topbar").addEventListener("mousedown", (event) => {
  if (event.button !== 0 || event.target.closest("button, input, select, a")) return;
  backend.startWindowDrag().catch((error) => {
    showToast("Could not move window", error.message);
  });
});
document.querySelector("#windowMinimize").addEventListener("click", async () => {
  try {
    await backend.minimizeWindow();
  } catch (error) {
    showToast("Could not minimize", error.message);
  }
});
document.querySelector("#windowClose").addEventListener("click", async () => {
  try {
    await backend.closeWindow();
  } catch (error) {
    showToast("Could not close", error.message);
  }
});

const settingsDialog = document.querySelector("#settingsDialog");
const settingsButton = document.querySelector("#settingsButton");
const autostartToggle = document.querySelector("#autostartToggle");

function renderAutostartState(state) {
  const enabled = state?.enabled === true;
  const current = state?.current === true;
  autostartToggle.checked = enabled;
  autostartToggle.disabled = false;
  document.querySelector("#startupCard").dataset.state =
    enabled && current ? "enabled" : enabled ? "checking" : "disabled";
  document.querySelector("#autostartStatus").textContent =
    enabled && current ? "ARMED" : enabled ? "UPDATING…" : "OFF";
}

async function refreshAutostartState() {
  autostartToggle.disabled = true;
  document.querySelector("#startupCard").dataset.state = "checking";
  document.querySelector("#autostartStatus").textContent = "CHECKING…";
  try {
    renderAutostartState(await backend.autostartStatus());
  } catch (error) {
    document.querySelector("#startupCard").dataset.state = "error";
    document.querySelector("#autostartStatus").textContent = "UNAVAILABLE";
    showToast("Startup setting unavailable", error.message);
  }
}

function openSettingsDialog() {
  settingsDialog.classList.add("open");
  settingsDialog.setAttribute("aria-hidden", "false");
  settingsButton.classList.add("active");
  void refreshAutostartState();
}

function closeSettingsDialog() {
  if (!settingsDialog.classList.contains("open")) return;
  settingsDialog.classList.remove("open");
  settingsDialog.setAttribute("aria-hidden", "true");
  settingsButton.classList.remove("active");
  settingsButton.focus();
}

settingsButton.addEventListener("click", openSettingsDialog);
document.querySelector("#settingsDialogClose").addEventListener("click", closeSettingsDialog);
settingsDialog.addEventListener("click", (event) => {
  if (event.target === settingsDialog) closeSettingsDialog();
});
autostartToggle.addEventListener("change", async () => {
  const enabled = autostartToggle.checked;
  autostartToggle.disabled = true;
  document.querySelector("#startupCard").dataset.state = "checking";
  document.querySelector("#autostartStatus").textContent =
    enabled ? "ENABLING…" : "DISABLING…";
  try {
    const state = await backend.setAutostart(enabled);
    renderAutostartState(state);
    showToast(
      enabled ? "Start on login enabled" : "Start on login disabled",
      enabled
        ? "Studio and the N1 driver will start hidden in the tray after sign-in."
        : "Studio will only start when you open it."
    );
  } catch (error) {
    autostartToggle.checked = !enabled;
    autostartToggle.disabled = false;
    document.querySelector("#startupCard").dataset.state = "error";
    document.querySelector("#autostartStatus").textContent = "FAILED";
    showToast("Could not update startup", error.message);
  }
});

document.querySelector("#themeToggle").addEventListener("click", () => {
  document.body.classList.toggle("ambient-off");
});

document.querySelectorAll(".rail-button[data-page]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".rail-button[data-page]").forEach((item) => item.classList.toggle("active", item === button));
    if (button.dataset.page !== "deck") {
      showToast(`${button.getAttribute("aria-label")} selected`, "This prototype keeps the deck editor in view.");
    }
  });
});

document.querySelector(".page-control").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.pageAction === "add") {
    if (pageLayouts[currentProfile].length >= 8) {
      showToast("Page limit reached", "A profile can contain up to eight pages.");
      return;
    }
    pageLayouts[currentProfile].push(Array(15).fill(null));
    switchPage(pageLayouts[currentProfile].length - 1, false);
    showToast(
      `Page ${pageLayouts[currentProfile].length} created`,
      "The new page is queued for the physical N1."
    );
    return;
  }
  if (button.dataset.pageAction === "delete") {
    deleteCurrentPage();
    return;
  }
  const pageIndex = Number(button.dataset.pageIndex);
  switchPage(pageIndex);
});

document.querySelector(".page-control").addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
  event.preventDefault();
  const direction = event.key === "ArrowRight" ? 1 : -1;
  const nextPage = Math.max(
    0,
    Math.min(activePageIndex() + direction, pageLayouts[currentProfile].length - 1)
  );
  switchPage(nextPage);
  document.querySelector(`.page-tab[data-page-index="${nextPage}"]`)?.focus();
});

document.querySelector(".stage").addEventListener("click", (event) => {
  if (event.target.closest("button, input, select, label, a")) return;
  deselectKey();
});

document.querySelectorAll(".side-key").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.control === "profile") {
      cycleHardwareProfile();
      return;
    }
    if (button.dataset.control === "mode") {
      cycleHardwarePage();
      return;
    }
    showToast("Cancel / back", "This hardware button is not assigned yet.");
  });
});

document.querySelector("#dial").addEventListener("click", () => {
  dialValue = (dialValue + 35) % 360;
  document.querySelector("#dial").style.setProperty("--dial-rotation", `${dialValue}deg`);
  showToast("Dial action", "System volume: 72%");
});

document.querySelector("#newActionButton").addEventListener("click", () => {
  document.querySelector("#customActionDialog").classList.add("open");
  document.querySelector("#customActionDialog").setAttribute("aria-hidden", "false");
  document.querySelector("#customActionName").focus();
});

function closeCustomActionDialog() {
  document.querySelector("#customActionDialog").classList.remove("open");
  document.querySelector("#customActionDialog").setAttribute("aria-hidden", "true");
}

function openProfileDialog(mode, trigger) {
  if (profileOrder.length >= maxProfiles) {
    showToast("Profile limit reached", `Studio supports up to ${maxProfiles} profiles.`);
    return;
  }
  profileDialogMode = mode;
  profileDialogSource = currentProfile;
  profileDialogTrigger = trigger;
  const isDuplicate = mode === "duplicate";
  document.querySelector("#profileDialogKicker").textContent =
    isDuplicate ? "DUPLICATE PROFILE" : "NEW PROFILE";
  document.querySelector("#profileDialogTitle").textContent =
    isDuplicate ? "Duplicate this profile" : "Create a profile";
  document.querySelector("#profileDialogDescription").textContent = isDuplicate
    ? "Every page, action, icon, and sound setting will be copied."
    : "Start with one empty page. You can add actions after creating it.";
  document.querySelector("#profileDialogSubmit").textContent =
    isDuplicate ? "Duplicate profile" : "Create profile";
  const nameInput = document.querySelector("#profileName");
  nameInput.value = uniqueProfileName(
    isDuplicate ? `${profileNames[currentProfile]} Copy` : "New Profile"
  );
  nameInput.setCustomValidity("");
  const dialog = document.querySelector("#profileDialog");
  dialog.classList.add("open");
  dialog.setAttribute("aria-hidden", "false");
  window.setTimeout(() => {
    nameInput.focus();
    nameInput.select();
  }, 0);
}

function closeProfileDialog() {
  const dialog = document.querySelector("#profileDialog");
  if (!dialog.classList.contains("open")) return;
  dialog.classList.remove("open");
  dialog.setAttribute("aria-hidden", "true");
  profileDialogTrigger?.focus();
  profileDialogTrigger = null;
}

document.querySelector("#addProfileButton").addEventListener("click", (event) => {
  openProfileDialog("create", event.currentTarget);
});
document.querySelector("#duplicateProfileButton").addEventListener("click", (event) => {
  openProfileDialog("duplicate", event.currentTarget);
});
document.querySelector("#resetProfileButton").addEventListener("click", resetCurrentProfile);
document.querySelector("#deleteProfileButton").addEventListener("click", deleteCurrentProfile);
document.querySelector("#profileDialogClose").addEventListener("click", closeProfileDialog);
document.querySelector("#profileDialog").addEventListener("click", (event) => {
  if (event.target.id === "profileDialog") closeProfileDialog();
});
document.querySelector("#profileName").addEventListener("input", (event) => {
  event.target.setCustomValidity("");
});
document.querySelector("#profileForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const nameInput = document.querySelector("#profileName");
  const name = nameInput.value.trim();
  const duplicateName = profileOrder.some(
    (profileId) => profileNames[profileId].toLocaleLowerCase() === name.toLocaleLowerCase()
  );
  if (duplicateName) {
    nameInput.setCustomValidity("Choose a unique profile name.");
    nameInput.reportValidity();
    return;
  }
  if (!name) return;
  if (createProfile(
    name.slice(0, maxProfileNameLength),
    profileDialogMode === "duplicate" ? profileDialogSource : null
  )) {
    event.target.reset();
    closeProfileDialog();
  }
});

document.querySelector("#customActionDialogClose").addEventListener("click", closeCustomActionDialog);
document.querySelector("#customActionDialog").addEventListener("click", (event) => {
  if (event.target.id === "customActionDialog") closeCustomActionDialog();
});
document.querySelector("#customActionForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = document.querySelector("#customActionName").value.trim();
  const command = document.querySelector("#customActionCommand").value.trim();
  if (!name || !command) return;
  const id = `custom-${Date.now()}`;
  actionCatalog.push({
    id, name, subtitle: "Custom shell action", description: command, icon: "terminal",
    command, color: "#ff9f1c", category: "system", group: "Custom"
  });
  assignAction(selectedIndex, id);
  renderActions();
  event.target.reset();
  closeCustomActionDialog();
});

document.querySelector("#deviceButton").addEventListener("click", async () => {
  await detectDevice();
  showToast(
    hardwareTransportReady ? "N1 driver ready" : deviceDetected ? "N1 driver unavailable" : "N1 not detected",
    hardwareTransportReady
      ? "Linux HID transport is connected."
      : "Reconnect the USB cable; Studio will reopen the deck automatically."
  );
});

function handleHardwareEvent(message) {
  if (!message || typeof message !== "object") return;
  if (message.event === "agent_status") {
    updateAgentStatuses(message.agents);
    return;
  }
  if (message.event === "driver") {
    const transportWasReady = hardwareTransportReady;
    hardwareTransportReady = message.status === "ready";
    autoSyncOnTransportReady(transportWasReady);
    void detectDevice();
    return;
  }
  if (message.event === "input" && message.type === "button") {
    const physicalKey = Number(message.key);
    if (physicalKey === 16) {
      if (Number(message.state) === 1) cycleHardwareProfile();
      return;
    }
    if (physicalKey === 17) {
      if (Number(message.state) === 1) cycleHardwarePage();
      return;
    }
    if (physicalKey < 1 || physicalKey > 15) return;
    const keyIndex = physicalKey - 1;
    const key = activeLayout()?.[keyIndex];
    if (key?.visuals?.secondary) {
      if (key.visualBehavior === "toggle" && message.state === 1) {
        setRuntimeVisualState(keyIndex, !getRuntimeVisualState(keyIndex));
      } else if (key.visualBehavior !== "toggle") {
        setRuntimeVisualState(keyIndex, message.state === 1);
      }
      renderKeys();
    } else if (message.state === 1) {
      keyGrid.children[keyIndex]?.animate(
        [{ filter: "brightness(1)" }, { filter: "brightness(1.8)" }, { filter: "brightness(1)" }],
        { duration: 280 }
      );
    }
    return;
  }
  if (message.event === "key_visual") {
    if (message.ok === false) {
      showToast("Icon state update failed", message.error || "The device rejected the icon.");
      return;
    }
    const keyIndex = Number(message.key) - 1;
    setRuntimeVisualState(keyIndex, message.state === "secondary");
    renderKeys();
    return;
  }
  if (message.event === "action") {
    const keyIndex = Number(message.key) - 1;
    if (keyIndex >= 0 && keyIndex < 15) {
      if (message.playing) {
        const previousStateKey = soundPlaybackByKey.get(keyIndex);
        if (previousStateKey) soundPlaybackStates.delete(previousStateKey);
        const stateKey = visualStateKey(currentProfile, activePageIndex(), keyIndex);
        const key = activeLayout()?.[keyIndex];
        soundPlaybackStates.set(stateKey, {
          startedAt: performance.now(),
          duration: Math.max(.1, Number(key?.sound?.duration) || 1),
          looping: message.looping === true,
          playbackId: Number(message.playbackId) || null
        });
        soundPlaybackByKey.set(keyIndex, stateKey);
        renderKeys();
      } else if (message.stopped || message.finished || (message.ok === false && message.sound)) {
        const stateKey = soundPlaybackByKey.get(keyIndex);
        const playback = stateKey ? soundPlaybackStates.get(stateKey) : null;
        const playbackMatches = !message.playbackId
          || !playback?.playbackId
          || Number(message.playbackId) === playback.playbackId;
        if (stateKey && playbackMatches) {
          soundPlaybackStates.delete(stateKey);
          soundPlaybackByKey.delete(keyIndex);
          renderKeys();
        }
      }
    }
    if (message.finished) return;
    let title = message.ok ? "Hardware action triggered" : "Action could not run";
    if (message.focused) title = "Agent window focused";
    else if (message.stopped) title = "Sound stopped";
    else if (message.looping) title = "Sound looping";
    else if (message.playing) title = "Sound playing";
    showToast(
      title,
      message.stopped
        ? `${message.name || "Sound"} playback stopped.`
        : message.ok
          ? message.name
          : `${message.name || "Action"}: ${message.error}`
    );
  }
}

async function restoreAssetPaths() {
  const assets = [];
  const soundsToAnalyze = new Map();
  Object.values(pageLayouts).forEach((pages) => {
    pages.forEach((layout) => {
      layout.forEach((key) => {
        ["primary", "secondary"].forEach((slot) => {
          const visual = key?.visuals?.[slot];
          if (visual?.id && !visual.path) assets.push(visual);
        });
        if (key?.sound?.id && !key.sound.path) assets.push(key.sound);
        if (
          key?.sound?.id
          && (!Array.isArray(key.sound.waveform) || !Number(key.sound.duration))
        ) {
          const sounds = soundsToAnalyze.get(key.sound.id) || [];
          sounds.push(key.sound);
          soundsToAnalyze.set(key.sound.id, sounds);
        }
      });
    });
  });
  await Promise.all(assets.map(async (asset) => {
    try {
      asset.path = await backend.resolveAsset(asset.id);
    } catch {
      // Missing assets remain unavailable until the user replaces them.
    }
  }));
  await Promise.all([...soundsToAnalyze.values()].map(async (sounds) => {
    try {
      const analysis = await analyzeStoredSound(sounds[0]);
      if (analysis) sounds.forEach((sound) => Object.assign(sound, analysis));
    } catch {
      // Unsupported codecs retain the compact fallback waveform.
    }
  }));
  persistPages();
  renderKeys();
}

async function initializeNativeState() {
  if (!restoredSavedLayouts) {
    try {
      const config = await backend.loadConfig();
      const profile = config?.profile;
      if (
        profile &&
        pageLayouts[profile] &&
        Array.isArray(config.keys) &&
        config.keys.length === 15
      ) {
        const savedPage = Number(config.page);
        const pageIndex = Number.isInteger(savedPage)
          ? Math.max(0, Math.min(savedPage - 1, 7))
          : 0;
        while (pageLayouts[profile].length <= pageIndex) {
          pageLayouts[profile].push(Array(15).fill(null));
        }
        pageLayouts[profile][pageIndex] = config.keys;
        currentPageByProfile[profile] = pageIndex;
        currentProfile = profile;
        renderProfileOptions();
        persistPages();
      }
    } catch {
      // A first run has no native configuration to restore.
    }
  }
  renderPageTabs();
  await restoreAssetPaths();
  try {
    await backend.listen(handleHardwareEvent);
  } catch (error) {
    console.error("Native hardware event bridge unavailable", error);
  }
  await requestDeviceSync({ immediate: true });
  await detectDevice();
}

document.addEventListener("keydown", (event) => {
  const modifier = event.ctrlKey || event.metaKey;
  if (event.key === "/" && document.activeElement.tagName !== "INPUT") {
    event.preventDefault();
    document.querySelector("#actionSearch").focus();
  }
  if (modifier && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) redoButton.click();
    else undoButton.click();
  }
  if (event.key === "Escape") {
    closeCustomActionDialog();
    closeProfileDialog();
    closeSettingsDialog();
    deselectKey();
  }
});

renderBuildInfo();
renderActions();
renderProfileOptions();
renderPageTabs();
renderKeys();
initializeNativeState();

window.addEventListener("beforeunload", persistPages);
