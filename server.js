const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = __dirname;
const port = Number(process.env.PORT || 4173);
const usbRoot = "/sys/bus/usb/devices";
const targetUsbIds = new Set(["5548:1002"]);
const configPath = path.join(root, ".streamctrl-config.json");
const pythonPath = process.env.STREAMCTRL_PYTHON || path.join(root, ".venv", "bin", "python");
const driverScript = path.join(root, "driver", "n1_service.py");
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

const eventClients = new Set();
let activeConfig = readJson(configPath) || null;

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8").trim();
  } catch {
    return "";
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(filePath, data) {
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporaryPath, filePath);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function readJsonBody(request, maximumBytes = 2_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > maximumBytes) {
        reject(new Error("Request body is too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(new Error("Request body must contain valid JSON"));
      }
    });
    request.on("error", reject);
  });
}

function broadcast(payload) {
  const message = `data: ${JSON.stringify(payload)}\n\n`;
  for (const client of eventClients) {
    client.write(message);
  }
}

function findN1Device() {
  try {
    for (const entry of fs.readdirSync(usbRoot)) {
      const devicePath = path.join(usbRoot, entry);
      const vendorId = readText(path.join(devicePath, "idVendor")).toLowerCase();
      const productId = readText(path.join(devicePath, "idProduct")).toLowerCase();
      if (!targetUsbIds.has(`${vendorId}:${productId}`)) continue;
      return {
        connected: true,
        vendorId,
        productId,
        manufacturer: readText(path.join(devicePath, "manufacturer")) || "HOTSPOTEKUSB",
        product: readText(path.join(devicePath, "product")) || "VSDinside N1",
        busPath: entry,
        transportReady: driver.state.status === "ready",
        driver: driver.publicState()
      };
    }
  } catch {
    // The UI still works when sysfs is unavailable (for example in a container).
  }
  return {
    connected: false,
    vendorId: "5548",
    productId: "1002",
    product: "VSDinside N1",
    transportReady: false,
    driver: driver.publicState()
  };
}

class DriverBridge {
  constructor() {
    this.process = null;
    this.nextId = 1;
    this.pending = new Map();
    this.stdoutBuffer = "";
    this.state = { status: "stopped", error: "" };
  }

  publicState() {
    return { status: this.state.status, error: this.state.error || "" };
  }

  setState(status, error = "") {
    this.state = { status, error };
    broadcast({ event: "driver", ...this.publicState() });
  }

  start() {
    if (this.process) return;
    if (!fs.existsSync(pythonPath)) {
      this.setState("not_installed", "Run npm run setup:driver");
      return;
    }

    this.setState("starting");
    this.process = spawn(pythonPath, [driverScript], {
      cwd: root,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, PYTHONUNBUFFERED: "1" }
    });

    this.process.stdout.setEncoding("utf8");
    this.process.stdout.on("data", (chunk) => this.handleStdout(chunk));
    this.process.stderr.setEncoding("utf8");
    this.process.stderr.on("data", (chunk) => {
      const message = chunk.trim();
      if (message) {
        console.error(`[N1 driver] ${message}`);
        broadcast({ event: "driver_log", level: "error", message });
      }
    });
    this.process.on("error", (error) => this.setState("error", error.message));
    this.process.on("exit", (code, signal) => {
      const error = signal ? `Driver stopped by ${signal}` : `Driver exited with code ${code}`;
      this.process = null;
      this.rejectPending(new Error(error));
      if (this.state.status !== "stopping") this.setState("stopped", error);
    });
  }

  stop() {
    if (!this.process) return;
    this.setState("stopping");
    this.process.kill("SIGTERM");
  }

  rejectPending(error) {
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
  }

  handleStdout(chunk) {
    this.stdoutBuffer += chunk;
    const lines = this.stdoutBuffer.split("\n");
    this.stdoutBuffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        console.log(`[N1 driver] ${line}`);
        continue;
      }

      if (message.id !== undefined && this.pending.has(String(message.id))) {
        const request = this.pending.get(String(message.id));
        this.pending.delete(String(message.id));
        clearTimeout(request.timer);
        if (message.ok) request.resolve(message);
        else request.reject(new Error(message.error || "N1 driver command failed"));
        continue;
      }

      if (message.event === "status") {
        this.setState(message.status, message.error || "");
      } else if (message.event === "input") {
        handleHardwareInput(message);
      } else {
        broadcast(message);
      }
    }
  }

  request(command, payload = {}, timeoutMs = 45_000) {
    if (!this.process || !this.process.stdin.writable) {
      return Promise.reject(new Error(this.state.error || "N1 driver is not running"));
    }
    const id = String(this.nextId++);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`N1 driver timed out while running ${command}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.process.stdin.write(`${JSON.stringify({ id, command, payload })}\n`);
    });
  }
}

const driver = new DriverBridge();

function fixedCommand(executable, args) {
  return { executable, args, shell: false };
}

function shellCommand(command) {
  return { executable: "/bin/sh", args: ["-lc", command], shell: true };
}

function resolveActionCommand(action) {
  const explicit = String(action.command || "").trim();
  if (explicit) return shellCommand(explicit);

  const target = String(action.target || "").trim();
  switch (action.id) {
    case "mic":
      return fixedCommand("wpctl", ["set-mute", "@DEFAULT_AUDIO_SOURCE@", "toggle"]);
    case "volume":
      return fixedCommand("wpctl", ["set-mute", "@DEFAULT_AUDIO_SINK@", "toggle"]);
    case "music":
      return fixedCommand("playerctl", ["play-pause"]);
    case "lock":
      return fixedCommand("loginctl", ["lock-session"]);
    case "website":
      if (/^https?:\/\//i.test(target)) return fixedCommand("xdg-open", [target]);
      return null;
    case "folder":
      if (target.startsWith("/") || target.startsWith("file:")) return fixedCommand("xdg-open", [target]);
      return null;
    case "launch":
    case "command":
    case "hotkey":
      if (target && !/choose|execute|ctrl \+/i.test(target)) return shellCommand(target);
      return null;
    default:
      return null;
  }
}

function executeAction(action, key) {
  const command = resolveActionCommand(action);
  if (!command) {
    broadcast({
      event: "action",
      ok: false,
      key,
      name: action.name || action.title || `Key ${key}`,
      error: "This action needs a command or integration target"
    });
    return;
  }

  const child = spawn(command.executable, command.args, {
    cwd: root,
    detached: false,
    stdio: "ignore",
    env: process.env
  });
  child.once("error", (error) => {
    broadcast({ event: "action", ok: false, key, name: action.name, error: error.message });
  });
  child.once("spawn", () => {
    broadcast({ event: "action", ok: true, key, name: action.name || action.title });
  });
}

function handleHardwareInput(event) {
  broadcast(event);

  if (event.type === "knob_rotate") {
    const step = event.direction === "right" ? "5%+" : "5%-";
    const child = spawn("wpctl", ["set-volume", "@DEFAULT_AUDIO_SINK@", step], {
      stdio: "ignore",
      env: process.env
    });
    child.on("error", (error) => broadcast({ event: "action", ok: false, name: "Volume", error: error.message }));
    return;
  }

  if (event.type === "knob_press" && event.state === 1) {
    const child = spawn("wpctl", ["set-mute", "@DEFAULT_AUDIO_SINK@", "toggle"], {
      stdio: "ignore",
      env: process.env
    });
    child.on("error", (error) => broadcast({ event: "action", ok: false, name: "Mute", error: error.message }));
    return;
  }

  if (event.type !== "button" || event.state !== 1 || !activeConfig?.keys) return;
  const action = activeConfig.keys[Number(event.key) - 1];
  if (action) executeAction(action, event.key);
}

async function handleApi(request, response, pathname) {
  if (pathname === "/api/device" && request.method === "GET") {
    sendJson(response, 200, findN1Device());
    return true;
  }

  if (pathname === "/api/events" && request.method === "GET") {
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no"
    });
    response.write(`data: ${JSON.stringify({ event: "driver", ...driver.publicState() })}\n\n`);
    eventClients.add(response);
    request.on("close", () => eventClients.delete(response));
    return true;
  }

  if (pathname === "/api/sync" && request.method === "POST") {
    try {
      const payload = await readJsonBody(request);
      if (!Array.isArray(payload.keys) || payload.keys.length > 18) {
        throw new Error("Sync payload must contain at most 18 keys");
      }
      activeConfig = {
        profile: String(payload.profile || "streaming"),
        brightness: Math.max(0, Math.min(100, Number(payload.brightness) || 86)),
        keys: payload.keys
      };
      writeJson(configPath, activeConfig);
      const result = await driver.request("sync", activeConfig, 90_000);
      sendJson(response, 200, { ok: true, written: result.written, brightness: result.brightness });
    } catch (error) {
      sendJson(response, 503, { ok: false, error: error.message, driver: driver.publicState() });
    }
    return true;
  }

  if (pathname === "/api/brightness" && request.method === "POST") {
    try {
      const payload = await readJsonBody(request, 10_000);
      const brightness = Math.max(0, Math.min(100, Number(payload.brightness) || 0));
      await driver.request("brightness", { brightness }, 10_000);
      sendJson(response, 200, { ok: true, brightness });
    } catch (error) {
      sendJson(response, 503, { ok: false, error: error.message });
    }
    return true;
  }

  if (pathname === "/api/action/test" && request.method === "POST") {
    try {
      const payload = await readJsonBody(request, 100_000);
      if (!payload.action || typeof payload.action !== "object") {
        throw new Error("An action is required");
      }
      if (!resolveActionCommand(payload.action)) {
        throw new Error("This action needs a command or integration target");
      }
      executeAction(payload.action, Number(payload.key) || 0);
      sendJson(response, 202, { ok: true });
    } catch (error) {
      sendJson(response, 400, { ok: false, error: error.message });
    }
    return true;
  }

  return false;
}

const server = http.createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);

  if (pathname.startsWith("/api/")) {
    if (!(await handleApi(request, response, pathname))) {
      sendJson(response, 404, { ok: false, error: "API endpoint not found" });
    }
    return;
  }

  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.resolve(root, relativePath);
  const insideRoot = filePath === root || filePath.startsWith(`${root}${path.sep}`);

  if (!insideRoot || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream",
    "Cache-Control": "no-store"
  });
  fs.createReadStream(filePath).pipe(response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`N1 Stream Controller Studio is running at http://127.0.0.1:${port}`);
  driver.start();
});

function shutdown() {
  driver.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
