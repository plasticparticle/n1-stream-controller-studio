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

try {
  const savedLayoutJson =
    localStorage.getItem(layoutStorageKey) || localStorage.getItem(legacyLayoutStorageKey);
  const savedLayouts = JSON.parse(savedLayoutJson || "null");
  if (savedLayouts && typeof savedLayouts === "object") {
    Object.keys(layouts).forEach((profile) => {
      if (Array.isArray(savedLayouts[profile]) && savedLayouts[profile].length === 15) {
        layouts[profile] = savedLayouts[profile];
      }
    });
  }
} catch {
  // A malformed local draft should never prevent the editor from loading.
}

function keyScreenMarkup(key) {
  if (!key) return '<div class="key-screen empty"><span class="empty-plus">+</span></div>';
  if (key.image) {
    return `<div class="key-screen" style="--key-color:${key.color};background-image:url('${key.image}');background-size:cover;background-position:center"><span class="key-label">${escapeHtml(key.title)}</span></div>`;
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
    button.innerHTML = keyScreenMarkup(key);
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
  miniKey.innerHTML = keyScreenMarkup(key);

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
      ? { ...layouts[currentProfile][duplicateSource] }
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
    target: action.description
  };
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
    const response = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profile: currentProfile,
        brightness: Number(brightness.value),
        keys: layouts[currentProfile]
      })
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "Hardware sync failed");
    hardwareTransportReady = true;
    document.querySelector("#lastSaved").textContent = "Synced just now";
    showToast("Synced to N1", `${result.written} key images are live on the device.`);
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
    const response = await fetch("/api/device", { cache: "no-store" });
    if (!response.ok) throw new Error("Device API unavailable");
    const device = await response.json();
    deviceDetected = Boolean(device.connected);
    hardwareTransportReady = Boolean(device.transportReady);
    const deviceButton = document.querySelector("#deviceButton");
    deviceButton.classList.toggle("disconnected", !deviceDetected);
    deviceButton.classList.toggle("transport-error", deviceDetected && !hardwareTransportReady);
    document.querySelector("#deviceName").textContent = "VSDinside N1";
    const driverStatus = device.driver?.status;
    document.querySelector("#deviceStatus").textContent = !deviceDetected
      ? "Not detected"
      : hardwareTransportReady
        ? `Driver ready · ${device.vendorId}:${device.productId}`
        : driverStatus === "not_installed"
          ? "Driver setup required"
          : driverStatus === "error"
            ? "USB permission required"
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

document.querySelector("#clearKeyButton").addEventListener("click", () => {
  if (!layouts[currentProfile][selectedIndex]) return;
  snapshot();
  layouts[currentProfile][selectedIndex] = null;
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
    const response = await fetch("/api/brightness", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brightness: Number(brightness.value) })
    });
    if (!response.ok) throw new Error("Brightness update failed");
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

document.querySelector("#identifyButton").addEventListener("click", () => {
  const device = document.querySelector("#device");
  device.classList.remove("identifying");
  void device.offsetWidth;
  device.classList.add("identifying");
  showToast("Device identified", "The N1 keys flashed twice.");
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
  try {
    const response = await fetch("/api/action/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: selectedIndex + 1, action })
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "Action test failed");
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

document.querySelectorAll(".page-dots button").forEach((button, index) => {
  button.addEventListener("click", () => {
    if (index === 2) {
      showToast("New page created", "Page 3 is ready for actions.");
      return;
    }
    document.querySelectorAll(".page-dots button").forEach((dot, dotIndex) => dot.classList.toggle("active", dotIndex === index));
    showToast(`Page ${index + 1}`, "Switched the device preview.");
  });
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
      : "Run npm run setup:driver, reconnect the deck, and restart N1 Stream Controller Studio."
  );
});

const hardwareEvents = new EventSource("/api/events");
hardwareEvents.addEventListener("message", (event) => {
  let message;
  try {
    message = JSON.parse(event.data);
  } catch {
    return;
  }
  if (message.event === "driver") {
    hardwareTransportReady = message.status === "ready";
    detectDevice();
    return;
  }
  if (message.event === "input" && message.type === "button" && message.state === 1) {
    const keyIndex = Number(message.key) - 1;
    keyGrid.children[keyIndex]?.animate(
      [{ filter: "brightness(1)" }, { filter: "brightness(1.8)" }, { filter: "brightness(1)" }],
      { duration: 280 }
    );
    return;
  }
  if (message.event === "action") {
    showToast(
      message.ok ? "Hardware action triggered" : "Action could not run",
      message.ok ? message.name : `${message.name || "Action"}: ${message.error}`
    );
  }
});

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

renderActions();
renderKeys();
detectDevice();
