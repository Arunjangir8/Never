import { spawn, spawnSync } from "child_process";
import { mkdirSync, openSync, rmSync, rmdirSync } from "fs";
import { join, resolve } from "path";
import { config } from "../config.js";
import { printError, printSuccess } from "../cli/display.js";
import { askUserPermission } from "../cli/prompt.js";

const LOG_DIR = resolve(".optimus-logs");
const DIM = "\x1b[2m";
const Y = "\x1b[33m";
const RESET = "\x1b[0m";

// Any HTTP reply means the server is alive. Chroma answers 410 on /api/v1
// when it only speaks v2, which still tells us it's up.
async function ping(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

async function waitUntilUp(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await ping(url)) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

function onPath(cmd: string): boolean {
  return spawnSync("which", [cmd], { stdio: "ignore" }).status === 0;
}

// Only autostart something we can actually reach as a local process.
function isLocal(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

// Only servers Optimus started itself. One found already running belongs to
// someone else and must never be killed.
const started: Array<{ name: string; pid: number; logPath: string }> = [];
let cleanupRegistered = false;

function logPathFor(name: string): string {
  return join(LOG_DIR, `${name}.log`);
}

// detached puts the child in its own process group, so a negative-pid signal
// reaches its children too (chroma spawns uvicorn workers).
// Output goes to .optimus-logs/ instead of our terminal.
function launch(name: string, cmd: string, args: string[]): number | undefined {
  mkdirSync(LOG_DIR, { recursive: true });
  // "w" not "a": each run starts from an empty log so it can't grow forever.
  const log = openSync(logPathFor(name), "w");
  const child = spawn(cmd, args, {
    detached: true,
    stdio: ["ignore", log, log],
  });
  child.unref();
  return child.pid;
}

// Must stay synchronous: it runs from process.on("exit"), where async work
// never gets a chance to finish.
function stopStarted(): void {
  while (started.length > 0) {
    const { name, pid, logPath } = started.pop()!;
    try {
      process.kill(-pid, "SIGTERM");
      console.log(`${DIM}Stopped ${name} (pid ${pid})${RESET}`);
    } catch {
      // Already exited.
    }
    // The server shut down cleanly, so its log has nothing left to explain.
    // Logs from a server that failed to start are kept, not registered here.
    rmSync(logPath, { force: true });
  }

  // Only succeeds while empty, which is exactly when we want it gone.
  try {
    rmdirSync(LOG_DIR);
  } catch {
    // Still holds a log we deliberately kept.
  }
}

function registerCleanup(): void {
  if (cleanupRegistered) return;
  cleanupRegistered = true;

  process.on("exit", stopStarted);

  // Signals don't run "exit" handlers on their own, so shut down explicitly.
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.on(sig, () => {
      stopStarted();
      process.exit(0);
    });
  }
}

interface ServiceSpec {
  name: string;
  healthUrl: string;
  baseUrl: string;
  cmd: string;
  args: string[];
  installHint: string;
  timeoutMs: number;
}

async function ensure(svc: ServiceSpec): Promise<boolean> {
  if (await ping(svc.healthUrl)) {
    printSuccess(`${svc.name} already running (${svc.baseUrl})`);
    return true;
  }

  if (!config.autoStart) {
    printError(`${svc.name} is not running at ${svc.baseUrl}`);
    console.log(`  Start it with:  ${Y}${svc.cmd} ${svc.args.join(" ")}${RESET}`);
    return false;
  }

  if (!isLocal(svc.baseUrl)) {
    printError(`${svc.name} is not reachable at ${svc.baseUrl}`);
    console.log(`  ${DIM}Remote host, cannot be started from here.${RESET}`);
    return false;
  }

  if (!onPath(svc.cmd)) {
    printError(`${svc.name} is not installed (\`${svc.cmd}\` not on PATH)`);
    console.log(`  Install it with:  ${Y}${svc.installHint}${RESET}`);
    return false;
  }

  const logName = svc.name.toLowerCase();

  process.stdout.write(`${DIM}Starting ${svc.name}...${RESET}`);
  const pid = launch(logName, svc.cmd, svc.args);
  const up = await waitUntilUp(svc.healthUrl, svc.timeoutMs);
  process.stdout.write("\r\x1b[2K");

  if (!up) {
    // We spawned it, so don't leave it behind just because the health check
    // never passed. Its log stays on disk as the only clue why.
    if (pid !== undefined) {
      try {
        process.kill(-pid, "SIGTERM");
      } catch {
        // Never came up at all.
      }
    }
    printError(`${svc.name} did not come up within ${svc.timeoutMs / 1000}s`);
    console.log(`  ${DIM}Log: ${logPathFor(logName)}${RESET}`);
    return false;
  }

  if (pid !== undefined && config.autoStop) {
    started.push({ name: svc.name, pid, logPath: logPathFor(logName) });
    registerCleanup();
  }

  printSuccess(
    `${svc.name} started (pid ${pid}, log .optimus-logs/)` +
      (config.autoStop ? "" : `${DIM} (stays running on exit)${RESET}`)
  );
  return true;
}

// Models Optimus will actually hit. Embeddings are always local.
function requiredModels(): string[] {
  const wanted = [config.models.local.embedding];
  if (config.provider === "local") {
    wanted.push(config.models.local.general, config.models.local.coding);
  }
  return [...new Set(wanted)];
}

async function installedModels(): Promise<string[]> {
  try {
    const res = await fetch(`${config.ollamaBaseUrl}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    const body = (await res.json()) as { models?: Array<{ name?: string }> };
    return (body.models ?? []).map((m) => m.name ?? "").filter(Boolean);
  } catch {
    return [];
  }
}

// "gemma" in .env should match "gemma:latest" from ollama.
function hasModel(installed: string[], wanted: string): boolean {
  if (installed.includes(wanted)) return true;
  if (!wanted.includes(":")) return installed.some((m) => m.startsWith(`${wanted}:`));
  return false;
}

async function ensureModels(): Promise<boolean> {
  const installed = await installedModels();
  const missing = requiredModels().filter((m) => !hasModel(installed, m));

  if (missing.length === 0) {
    printSuccess(`Models ready (${requiredModels().join(", ")})`);
    return true;
  }

  console.log(`\n${Y}Missing models:${RESET} ${missing.join(", ")}`);

  // These are multi-GB downloads, so confirm rather than pull silently.
  const approved =
    config.autoPullModels ||
    (await askUserPermission(`${Y}Pull them now? (y/n): ${RESET}`));

  if (!approved) {
    console.log(`  Pull manually:  ${Y}${missing.map((m) => `ollama pull ${m}`).join(" && ")}${RESET}\n`);
    return false;
  }

  for (const model of missing) {
    console.log(`\n${DIM}ollama pull ${model}${RESET}`);
    // Inherit stdio so the download progress bar is visible.
    const res = spawnSync("ollama", ["pull", model], { stdio: "inherit" });
    if (res.status !== 0) {
      printError(`Failed to pull ${model}`);
      return false;
    }
  }

  printSuccess("Models pulled.");
  return true;
}

export async function ensureServices(): Promise<boolean> {
  const ollamaOk = await ensure({
    name: "Ollama",
    healthUrl: config.ollamaBaseUrl,
    baseUrl: config.ollamaBaseUrl,
    cmd: "ollama",
    args: ["serve"],
    installHint: "brew install ollama",
    timeoutMs: 20000,
  });

  const chromaOk = await ensure({
    name: "ChromaDB",
    healthUrl: `${config.chromaUrl}/api/v1/heartbeat`,
    baseUrl: config.chromaUrl,
    cmd: "chroma",
    // Bind where config says, not chroma's default 8000, or the health check
    // polls a port nothing is listening on and we kill a server that came up fine.
    args: ["run", "--path", config.chromaPath, "--port", new URL(config.chromaUrl).port || "8000"],
    installHint: "pip install chromadb",
    timeoutMs: 30000,
  });

  // Model check needs a live Ollama.
  if (!ollamaOk) return false;

  const modelsOk = await ensureModels();
  return chromaOk && modelsOk;
}
