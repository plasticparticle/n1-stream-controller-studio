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
  sync(payload) {
    return this.invoke("sync_deck", { payload });
  },
  storeAsset(payload) {
    return this.invoke("store_asset", { payload });
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
    return this.invoke("test_action", { key, action });
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
  keyboard: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2"></rect><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10"></path></svg>',
  terminal: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="m7 9 3 3-3 3M13 15h4"></path></svg>',
  folder: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"></path></svg>',
  web: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"></circle><path d="M3 12h18M12 3c2.4 2.5 3.6 5.5 3.6 9s-1.2 6.5-3.6 9c-2.4-2.5-3.6-5.5-3.6-9S9.6 5.5 12 3Z"></path></svg>',
  music: '<svg viewBox="0 0 24 24"><path d="M9 18V5l10-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="16" cy="16" r="3"></circle></svg>',
  sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"></path></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path></svg>',
  layers: '<svg viewBox="0 0 24 24"><path d="m4 9 8-5 8 5-8 5-8-5Z"></path><path d="m4 14 8 5 8-5"></path></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"></path></svg>'
};

const actionCatalog = [
  { id: "scene", name: "Switch Scene", subtitle: "OBS Studio", description: "Scene: Starting Soon", icon: "camera", color: "#37b7ff", category: "stream", group: "Streaming" },
  { id: "mic", name: "Mute Microphone", subtitle: "Audio control", description: "Default microphone", command: "wpctl set-mute @DEFAULT_AUDIO_SOURCE@ toggle", icon: "mic", color: "#ef476f", category: "stream", group: "Streaming" },
  { id: "volume", name: "Mute Speakers", subtitle: "Audio control", description: "Default speakers", command: "wpctl set-mute @DEFAULT_AUDIO_SINK@ toggle", icon: "volume", color: "#38d996", category: "stream", group: "Streaming" },
  { id: "record", name: "Start Recording", subtitle: "OBS Studio", description: "Toggle recording", icon: "record", color: "#ef476f", category: "stream", group: "Streaming" },
  { id: "chat", name: "Show Chat", subtitle: "Browser dock", description: "Open stream chat", icon: "message", color: "#a78bfa", category: "stream", group: "Streaming" },
  { id: "launch", name: "Launch App", subtitle: "Applications", description: "Choose an application", icon: "app", color: "#38d996", category: "system", group: "Desktop" },
  { id: "hotkey", name: "Keyboard Shortcut", subtitle: "System", description: "Ctrl + Shift + M", icon: "keyboard", color: "#e8ff58", category: "system", group: "Desktop" },
  { id: "command", name: "Run Command", subtitle: "Shell", description: "Execute shell command", icon: "terminal", color: "#ff9f1c", category: "system", group: "Desktop" },
  { id: "folder", name: "Open Folder", subtitle: "Files", description: "Open a local folder", icon: "folder", color: "#37b7ff", category: "system", group: "Desktop" },
  { id: "website", name: "Open Website", subtitle: "Browser", description: "Open URL", icon: "web", color: "#a78bfa", category: "system", group: "Navigation" },
  { id: "music", name: "Play / Pause", subtitle: "Media", description: "System media control", command: "playerctl play-pause", icon: "music", color: "#38d996", category: "system", group: "Navigation" },
  { id: "lock", name: "Lock Screen", subtitle: "Linux", description: "Lock this session", command: "loginctl lock-session", icon: "lock", color: "#e8ff58", category: "system", group: "Navigation" }
];

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
    ["website", "CALENDAR", "#a78bfa"], ["music", "MUSIC", "#38d996"], ["volume", "VOLUME", "#37b7ff"], ["hotkey", "SCREENSHOT", "#e8ff58"], ["command", "UPDATES", "#ff9f1c"],
    null, null, null, null, null
  ]
};

const profileNames = {
  streaming: "Live Stream",
  editing: "Video Edit",
  desktop: "Daily Desk"
};

let currentProfile = "streaming";
let selectedIndex = 0;
let currentCategory = "all";
let history = [];
let future = [];
let duplicateSource = null;
let toastTimer;
let dialValue = 20;
let deviceDetected = false;
let hardwareTransportReady = false;
let pendingIconSlot = null;
const runtimeVisualStates = new Map();

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

function createKeyData(tuple) {
  if (!tuple) return null;
  const action = actionCatalog.find((item) => item.id === tuple[0]) || actionCatalog[0];
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
    target: action.id === "scene" ? (sceneTargets[tuple[1]] || "Starting Soon") : action.description
  };
}

Object.keys(layouts).forEach((profile) => {
  layouts[profile] = layouts[profile].map(createKeyData);
});

const layoutStorageKey = "n1-stream-controller-studio-layouts";
const legacyLayoutStorageKey = "n1-studio-layouts";
let restoredSavedLayouts = false;

try {
  const savedLayoutJson =
    localStorage.getItem(layoutStorageKey) || localStorage.getItem(legacyLayoutStorageKey);
  const savedLayouts = JSON.parse(savedLayoutJson || "null");
  if (savedLayouts && typeof savedLayouts === "object") {
    Object.keys(layouts).forEach((profile) => {
      if (Array.isArray(savedLayouts[profile]) && savedLayouts[profile].length === 15) {
        layouts[profile] = savedLayouts[profile];
        restoredSavedLayouts = true;
      }
    });
  }
} catch {
  // A malformed local draft should never prevent the editor from loading.
}

function visualStateKey(profile, index) {
  return `${profile}:${index}`;
}

function setRuntimeVisualState(index, secondary) {
  runtimeVisualStates.set(visualStateKey(currentProfile, index), Boolean(secondary));
}

function getRuntimeVisualState(index) {
  return runtimeVisualStates.get(visualStateKey(currentProfile, index)) || false;
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

function keyScreenMarkup(key, secondary = false) {
  if (!key) return '<div class="key-screen empty"><span class="empty-plus">+</span></div>';
  const visual = selectedVisual(key, secondary);
  const previewUrl = assetPreviewUrl(visual);
  if (previewUrl) {
    return `<div class="key-screen has-custom-icon" style="--key-color:${escapeHtml(key.color)}"><img src="${escapeHtml(previewUrl)}" alt="" draggable="false"><span class="key-label">${escapeHtml(key.title)}</span></div>`;
  }
  return `<div class="key-screen" style="--key-color:${key.color}">${iconMarkup(key.icon)}<span class="key-label">${escapeHtml(key.title)}</span></div>`;
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[char]);
}

function renderKeys() {
  keyGrid.innerHTML = "";
  layouts[currentProfile].forEach((key, index) => {
    const button = document.createElement("button");
    button.className = `deck-key${index === selectedIndex ? " selected" : ""}`;
    button.dataset.index = index;
    button.setAttribute("aria-label", key ? `Key ${index + 1}: ${key.title}` : `Key ${index + 1}: empty`);
    button.innerHTML = keyScreenMarkup(key, getRuntimeVisualState(index));
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

  actionGroups.innerHTML = groups.length
    ? groups.map((group) => `
      <section class="action-group">
        <p class="group-label">${group.toUpperCase()} <span></span></p>
        ${filtered.filter((action) => action.group === group).map((action) => `
          <button class="action-item" draggable="true" data-action="${action.id}">
            <span class="action-icon" style="--icon-color:${action.color}">${iconMarkup(action.icon)}</span>
            <span><strong>${action.name}</strong><small>${action.subtitle}</small></span>
            <span class="drag-grip">${icons.layers}</span>
          </button>
        `).join("")}
      </section>
    `).join("")
    : '<p class="drag-hint">No matching actions found.</p>';

  document.querySelectorAll(".action-item").forEach((item) => {
    item.addEventListener("click", () => assignAction(selectedIndex, item.dataset.action));
    item.addEventListener("dragstart", (event) => {
      item.classList.add("dragging");
      event.dataTransfer.setData("text/plain", item.dataset.action);
      event.dataTransfer.effectAllowed = "copy";
    });
    item.addEventListener("dragend", () => item.classList.remove("dragging"));
  });
}

function updateInspector() {
  const key = layouts[currentProfile][selectedIndex];
  selectedKeyNumber.textContent = String(selectedIndex + 1).padStart(2, "0");
  keyTitle.value = key?.title || "";
  document.querySelector("#titleCount").textContent = `${keyTitle.value.length}/18`;
  miniKey.innerHTML = keyScreenMarkup(key, getRuntimeVisualState(selectedIndex));

  const name = key?.name || "Empty key";
  const subtitle = key?.subtitle || "Choose an action";
  const description = key?.description || "Click an action to assign it";
  document.querySelector("#previewActionName").textContent = name;
  document.querySelector("#previewActionType").textContent = subtitle;
  document.querySelector("#assignedActionName").textContent = name;
  document.querySelector("#assignedActionDescription").textContent = description;
  document.querySelector("#assignedActionIcon").innerHTML = iconMarkup(key?.icon || "plus");
  document.querySelector("#assignedActionIcon").style.setProperty("--icon-color", key?.color || "#667176");
  const targetSelect = document.querySelector("#actionTarget");
  const actionValue = document.querySelector("#actionValue");
  const targetLabel = document.querySelector("#targetLabel");
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
  actionValue.hidden = !useTextInput;
  document.querySelector(".select-field > svg").hidden = useTextInput;
  if (useTextInput) {
    actionValue.placeholder = placeholder;
    actionValue.value = key?.command || key?.target || "";
  } else {
    targetSelect.value = key?.target || "Starting Soon";
  }
  document.querySelector(".action-config").style.opacity = key ? "1" : ".4";
  document.querySelectorAll("#colorRow button").forEach((button) => {
    button.classList.toggle("active", button.dataset.color === key?.color);
  });
  updateIconStateEditor(key);
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

function updateIconStateEditor(key) {
  const behavior = key?.visualBehavior === "toggle" ? "toggle" : "momentary";
  updateIconCard("primary", key?.visuals?.primary || null, Boolean(key));
  updateIconCard("secondary", key?.visuals?.secondary || null, Boolean(key));
  document.querySelector("#secondaryStateLabel").textContent =
    behavior === "toggle" ? "ON" : "PRESSED";
  document.querySelectorAll("[data-visual-behavior]").forEach((button) => {
    button.classList.toggle("active", button.dataset.visualBehavior === behavior);
    button.disabled = !key;
  });
  document.querySelector("#iconStateNote").textContent = !key?.visuals?.secondary
    ? "Without a second icon, the first icon stays visible."
    : behavior === "toggle"
      ? "Every press switches between Off and On."
      : "The second icon is visible only while the key is held.";
}

function snapshot() {
  history.push(JSON.stringify(layouts[currentProfile]));
  if (history.length > 30) history.shift();
  future = [];
  updateHistoryButtons();
}

function updateHistoryButtons() {
  undoButton.disabled = history.length === 0;
  redoButton.disabled = future.length === 0;
}

function handleKeyClick(index) {
  if (duplicateSource !== null && duplicateSource !== index) {
    snapshot();
    layouts[currentProfile][index] = layouts[currentProfile][duplicateSource]
      ? structuredClone(layouts[currentProfile][duplicateSource])
      : null;
    duplicateSource = null;
    showToast("Key duplicated", `Copied the action to key ${String(index + 1).padStart(2, "0")}.`);
  }
  selectedIndex = index;
  renderKeys();
}

function assignAction(index, actionId) {
  const action = actionCatalog.find((item) => item.id === actionId);
  if (!action) return;
  snapshot();
  layouts[currentProfile][index] = {
    ...action,
    title: action.name.toUpperCase().slice(0, 18),
    target: action.description,
    visualBehavior: "momentary",
    visuals: { primary: null, secondary: null }
  };
  setRuntimeVisualState(index, false);
  selectedIndex = index;
  renderKeys();
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
  if (!layouts[currentProfile][selectedIndex]) return;
  snapshot();
  layouts[currentProfile][selectedIndex] = { ...layouts[currentProfile][selectedIndex], ...patch };
  renderKeys();
  document.querySelector("#lastSaved").textContent = "Unsynced changes";
}

async function syncDeck() {
  const button = document.querySelector("#syncButton");
  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = '<svg viewBox="0 0 24 24" style="animation:spin .8s linear infinite"><path d="M20 12a8 8 0 1 1-2.3-5.7"></path></svg><span>Syncing…</span>';
  localStorage.setItem(layoutStorageKey, JSON.stringify(layouts));
  try {
    const result = await backend.sync({
      profile: currentProfile,
      brightness: Number(brightness.value),
      keys: layouts[currentProfile]
    });
    if (!result.ok) throw new Error(result.error || "Hardware sync failed");
    hardwareTransportReady = true;
    for (let index = 0; index < layouts[currentProfile].length; index += 1) {
      setRuntimeVisualState(index, false);
    }
    renderKeys();
    document.querySelector("#lastSaved").textContent = "Synced just now";
    const animationLabel = result.animated ? ` · ${result.animated} animated` : "";
    showToast("Synced to N1", `${result.written} key images are live${animationLabel}.`);
  } catch (error) {
    document.querySelector("#lastSaved").textContent = "Saved locally · device sync failed";
    showToast(
      deviceDetected ? "Hardware sync failed" : "N1 is offline",
      error.message || "The N1 driver could not complete the transfer."
    );
    detectDevice();
  } finally {
    button.disabled = false;
    button.innerHTML = original;
  }
}

async function detectDevice() {
  try {
    const device = await backend.device();
    deviceDetected = Boolean(device.connected);
    hardwareTransportReady = Boolean(device.transportReady);
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
  const key = layouts[currentProfile][selectedIndex];
  if (!key) return;
  key.title = keyTitle.value;
  const screenLabel = keyGrid.children[selectedIndex]?.querySelector(".key-label");
  if (screenLabel) screenLabel.textContent = keyTitle.value;
});
keyTitle.addEventListener("change", () => {
  document.querySelector("#lastSaved").textContent = "Unsynced changes";
});

document.querySelectorAll("#colorRow button").forEach((button) => {
  button.addEventListener("click", () => updateKey({ color: button.dataset.color }));
});
document.querySelector("#customColor").addEventListener("input", (event) => updateKey({ color: event.target.value }));
document.querySelector("#autoColorButton").addEventListener("click", () => {
  const key = layouts[currentProfile][selectedIndex];
  if (key) updateKey({ color: actionCatalog.find((item) => item.id === key.id)?.color || "#37b7ff" });
});

document.querySelectorAll("[data-icon-slot]").forEach((button) => {
  button.addEventListener("click", () => {
    if (!layouts[currentProfile][selectedIndex]) {
      showToast("Assign an action first", "Icons belong to a configured deck key.");
      return;
    }
    pendingIconSlot = {
      slot: button.dataset.iconSlot,
      profile: currentProfile,
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
    reader.addEventListener("error", () => reject(new Error("The icon file could not be read")));
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

    const key = layouts[target.profile]?.[target.index];
    if (!key) throw new Error("The destination key no longer exists");
    if (target.profile === currentProfile) snapshot();
    key.visuals = { ...(key.visuals || {}), [target.slot]: result.asset };
    if (target.profile === currentProfile) renderKeys();
    document.querySelector("#lastSaved").textContent = "Unsynced changes";
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
  const key = layouts[currentProfile][selectedIndex];
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
  if (!layouts[currentProfile][selectedIndex]) return;
  snapshot();
  layouts[currentProfile][selectedIndex] = null;
  setRuntimeVisualState(selectedIndex, false);
  renderKeys();
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
  const key = layouts[currentProfile][selectedIndex];
  if (!key) return;
  const value = event.target.value.trim();
  const usesShellCommand = ["launch", "command", "hotkey"].includes(key.id) || key.id?.startsWith("custom-");
  updateKey(usesShellCommand ? { target: value, command: value, description: value } : { target: value, description: value });
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
  const selected = keyGrid.children[selectedIndex];
  const action = layouts[currentProfile][selectedIndex];
  if (!action) {
    showToast("Nothing to test", "Assign an action to this key first.");
    return;
  }
  selected.animate(
    [{ transform: "scale(1)" }, { transform: "scale(.91)", filter: "brightness(1.7)" }, { transform: "scale(1)" }],
    { duration: 350, easing: "ease-out" }
  );
  if (action.visuals?.secondary) {
    if (action.visualBehavior === "toggle") {
      setRuntimeVisualState(selectedIndex, !getRuntimeVisualState(selectedIndex));
      renderKeys();
    } else {
      const testedIndex = selectedIndex;
      const testedProfile = currentProfile;
      setRuntimeVisualState(testedIndex, true);
      renderKeys();
      window.setTimeout(() => {
        runtimeVisualStates.set(visualStateKey(testedProfile, testedIndex), false);
        if (currentProfile === testedProfile) renderKeys();
      }, 450);
    }
  }
  try {
    const result = await backend.testAction(selectedIndex + 1, action);
    if (!result.ok) throw new Error(result.error || "Action test failed");
  } catch (error) {
    showToast("Action could not run", error.message);
  }
});

document.querySelector("#profileSelect").addEventListener("change", (event) => {
  currentProfile = event.target.value;
  selectedIndex = 0;
  history = [];
  future = [];
  document.querySelector("#layoutTitle").textContent = profileNames[currentProfile];
  updateHistoryButtons();
  renderKeys();
});

undoButton.addEventListener("click", () => {
  if (!history.length) return;
  future.push(JSON.stringify(layouts[currentProfile]));
  layouts[currentProfile] = JSON.parse(history.pop());
  renderKeys();
  updateHistoryButtons();
});

redoButton.addEventListener("click", () => {
  if (!future.length) return;
  history.push(JSON.stringify(layouts[currentProfile]));
  layouts[currentProfile] = JSON.parse(future.pop());
  renderKeys();
  updateHistoryButtons();
});

document.querySelector("#syncButton").addEventListener("click", syncDeck);
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
    showToast("New page created", "Page 3 is ready for actions.");
    return;
  }
  const pageIndex = Number(button.dataset.pageIndex);
  if (!Number.isInteger(pageIndex)) return;
  document.querySelectorAll(".page-tab").forEach((tab) => {
    const isActive = Number(tab.dataset.pageIndex) === pageIndex;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });
  showToast(`Page ${pageIndex + 1}`, "Switched the device preview.");
});

document.querySelectorAll(".side-key").forEach((button) => {
  button.addEventListener("click", () => {
    const isCancel = button.dataset.control === "cancel";
    showToast(isCancel ? "Cancel / back" : "Mode switch", "Hardware button mapping tested.");
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

function closeDialog() {
  document.querySelector("#customActionDialog").classList.remove("open");
  document.querySelector("#customActionDialog").setAttribute("aria-hidden", "true");
}

document.querySelector(".dialog-close").addEventListener("click", closeDialog);
document.querySelector("#customActionDialog").addEventListener("click", (event) => {
  if (event.target.id === "customActionDialog") closeDialog();
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
  closeDialog();
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
  if (message.event === "driver") {
    hardwareTransportReady = message.status === "ready";
    detectDevice();
    return;
  }
  if (message.event === "input" && message.type === "button") {
    const keyIndex = Number(message.key) - 1;
    const key = layouts[currentProfile]?.[keyIndex];
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
    showToast(
      message.ok ? "Hardware action triggered" : "Action could not run",
      message.ok ? message.name : `${message.name || "Action"}: ${message.error}`
    );
  }
}

async function restoreAssetPaths() {
  const visuals = [];
  Object.values(layouts).forEach((layout) => {
    layout.forEach((key) => {
      ["primary", "secondary"].forEach((slot) => {
        const visual = key?.visuals?.[slot];
        if (visual?.id && !visual.path) visuals.push(visual);
      });
    });
  });
  await Promise.all(visuals.map(async (visual) => {
    try {
      visual.path = await backend.resolveAsset(visual.id);
    } catch {
      // Missing legacy assets fall back to generated key artwork.
    }
  }));
  renderKeys();
}

async function initializeNativeState() {
  if (!restoredSavedLayouts) {
    try {
      const config = await backend.loadConfig();
      const profile = config?.profile;
      if (profile && layouts[profile] && Array.isArray(config.keys) && config.keys.length === 15) {
        layouts[profile] = config.keys;
        currentProfile = profile;
        document.querySelector("#profileSelect").value = profile;
        document.querySelector("#layoutTitle").textContent = profileNames[profile];
        localStorage.setItem(layoutStorageKey, JSON.stringify(layouts));
      }
    } catch {
      // A first run has no native configuration to restore.
    }
  }
  await restoreAssetPaths();
  await detectDevice();
  backend.listen(handleHardwareEvent).catch((error) => {
    console.error("Native hardware event bridge unavailable", error);
  });
}

document.addEventListener("keydown", (event) => {
  const modifier = event.ctrlKey || event.metaKey;
  if (event.key === "/" && document.activeElement.tagName !== "INPUT") {
    event.preventDefault();
    document.querySelector("#actionSearch").focus();
  }
  if (modifier && event.key.toLowerCase() === "s") {
    event.preventDefault();
    syncDeck();
  }
  if (modifier && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) redoButton.click();
    else undoButton.click();
  }
  if (event.key === "Escape") closeDialog();
});

const style = document.createElement("style");
style.textContent = "@keyframes spin { to { transform: rotate(360deg); } }";
document.head.appendChild(style);

renderBuildInfo();
renderActions();
renderKeys();
initializeNativeState();
