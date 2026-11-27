/**
 * Wave OV-DL — managed OpenViking install/start under {profileDir}/openviking/.
 * Docker preferred; uv/pip venv fallback. Injectable driver for tests.
 */
import { createServer } from "node:net";
import { spawn, execFile, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { access, mkdir, readFile, rename, rm, statfs, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createOvClient } from "./context-memory-ov-client.js";
import type { ContextMemoryInstallPhase } from "@envoymesh/api";

const execFileAsync = promisify(execFile);

/** Pinned OpenViking release for managed installs. */
export const OV_MANAGED_VERSION = "0.5.0";
export const OV_DOCKER_IMAGE = `ghcr.io/volcengine/openviking:${OV_MANAGED_VERSION}`;
export const OV_DOCKER_IMAGE_FALLBACK = `openviking-cn-beijing.cr.volces.com/volcengine/openviking:${OV_MANAGED_VERSION}`;
/** Rough minimum free disk before pull/install (bytes). */
export const OV_MANAGED_MIN_FREE_BYTES = 2 * 1024 * 1024 * 1024;

export type OvManagedProgress = {
  phase: ContextMemoryInstallPhase;
  progress?: number;
};

export type OvManagedEnsureResult = {
  endpoint: string;
  port: number;
  backend: "docker" | "venv";
};

export type OvManagedDriver = {
  ensureRunning(input: {
    rootDir: string;
    signal: AbortSignal;
    onProgress: (p: OvManagedProgress) => void;
  }): Promise<OvManagedEnsureResult>;
  stop(rootDir: string): Promise<void>;
};

export type OvInstallMarker = {
  version: string;
  installedAt: string;
  port: number;
  backend: "docker" | "venv";
  containerName?: string;
  image?: string;
  pid?: number;
};

function abortError(message = "OpenViking setup was cancelled"): Error {
  const err = new Error(message);
  err.name = "AbortError";
  return err;
}

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError();
}

export function ovManagedRoot(profileDir: string): string {
  return join(profileDir, "openviking");
}

export function ovInstallMarkerPath(rootDir: string): string {
  return join(rootDir, "install.json");
}

export async function readOvInstallMarker(rootDir: string): Promise<OvInstallMarker | null> {
  try {
    const raw = JSON.parse(await readFile(ovInstallMarkerPath(rootDir), "utf8")) as unknown;
    if (!raw || typeof raw !== "object") return null;
    const o = raw as Record<string, unknown>;
    if (typeof o.version !== "string" || typeof o.port !== "number") return null;
    if (o.backend !== "docker" && o.backend !== "venv") return null;
    return {
      version: o.version,
      installedAt: typeof o.installedAt === "string" ? o.installedAt : "",
      port: o.port,
      backend: o.backend,
      containerName: typeof o.containerName === "string" ? o.containerName : undefined,
      image: typeof o.image === "string" ? o.image : undefined,
      pid: typeof o.pid === "number" ? o.pid : undefined,
    };
  } catch {
    return null;
  }
}

async function writeOvInstallMarker(rootDir: string, marker: OvInstallMarker): Promise<void> {
  await mkdir(rootDir, { recursive: true });
  const dest = ovInstallMarkerPath(rootDir);
  const tmp = `${dest}.tmp`;
  await writeFile(tmp, `${JSON.stringify(marker, null, 2)}\n`, { mode: 0o600 });
  await rename(tmp, dest);
}

export async function allocateLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      server.close((err) => {
        if (err) reject(err);
        else if (addr && typeof addr === "object") resolve(addr.port);
        else reject(new Error("Could not allocate a local port"));
      });
    });
    server.on("error", reject);
  });
}

async function sleepAbortable(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw abortError();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** Spawn a command that can be killed when `signal` aborts. */
export async function execFileAbortable(
  command: string,
  args: string[],
  opts: { signal: AbortSignal; timeoutMs?: number },
): Promise<void> {
  assertNotAborted(opts.signal);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore", windowsHide: true });
    let settled = false;
    const timeoutMs = opts.timeoutMs ?? 600_000;
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish(new Error(`${command} timed out`));
    }, timeoutMs);

    const onAbort = () => {
      child.kill("SIGTERM");
      finish(abortError());
    };
    opts.signal.addEventListener("abort", onAbort, { once: true });

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      opts.signal.removeEventListener("abort", onAbort);
      if (err) reject(err);
      else resolve();
    };

    child.on("error", (err) => finish(err));
    child.on("exit", (code, signalName) => {
      if (opts.signal.aborted) {
        finish(abortError());
        return;
      }
      if (signalName) {
        finish(new Error(`${command} killed (${signalName})`));
        return;
      }
      if (code === 0) finish();
      else finish(new Error(`${command} exited with code ${code ?? "?"}`));
    });
  });
}

async function commandExists(cmd: string): Promise<boolean> {
  try {
    await execFileAsync(cmd, ["--version"], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

async function dockerAvailable(): Promise<boolean> {
  try {
    await execFileAsync("docker", ["info"], { timeout: 8000 });
    return true;
  } catch {
    return false;
  }
}

async function dockerImagePresent(image: string): Promise<boolean> {
  try {
    await execFileAsync("docker", ["image", "inspect", image], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

async function dockerContainerRunning(name: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(
      "docker",
      ["inspect", "-f", "{{.State.Running}}", name],
      { timeout: 10_000 },
    );
    return String(stdout).trim() === "true";
  } catch {
    return false;
  }
}

function containerNameFor(rootDir: string): string {
  let h = 0;
  for (let i = 0; i < rootDir.length; i++) h = (h * 31 + rootDir.charCodeAt(i)) >>> 0;
  return `envoymesh-ov-${h.toString(16).slice(0, 8)}`;
}

async function dockerStopRemove(name: string): Promise<void> {
  try {
    await execFileAsync("docker", ["rm", "-f", name], { timeout: 20_000 });
  } catch {
    /* not running */
  }
}

export async function assertEnoughDiskSpace(dir: string): Promise<void> {
  try {
    await mkdir(dir, { recursive: true });
    const st = await statfs(dir);
    const free = Number(st.bavail) * Number(st.bsize);
    if (Number.isFinite(free) && free < OV_MANAGED_MIN_FREE_BYTES) {
      throw new Error(
        "Not enough free disk space to install OpenViking (need about 2 GB). Free some space and try again.",
      );
    }
  } catch (err) {
    if (err instanceof Error && /Not enough free disk/.test(err.message)) throw err;
    // statfs unsupported — skip rather than block install
  }
}

async function waitForOvHealth(input: {
  endpoint: string;
  signal: AbortSignal;
  onProgress: (p: OvManagedProgress) => void;
  timeoutMs?: number;
}): Promise<{ ok: boolean; needsModels?: boolean; error?: string }> {
  const deadline = Date.now() + (input.timeoutMs ?? 90_000);
  const client = createOvClient({ endpoint: input.endpoint });
  let attempt = 0;
  while (Date.now() < deadline) {
    assertNotAborted(input.signal);
    input.onProgress({
      phase: "health",
      progress: Math.min(0.95, 0.5 + attempt * 0.05),
    });
    const health = await client.probeReady();
    if (health.ok || health.needsModels) return health;
    attempt++;
    await sleepAbortable(1000, input.signal);
  }
  return { ok: false, error: "OpenViking did not become ready in time" };
}

async function ensureMinimalOvConf(homeDir: string): Promise<void> {
  await mkdir(homeDir, { recursive: true });
  const confPath = join(homeDir, "ov.conf");
  try {
    await access(confPath);
    return;
  } catch {
    /* write stub */
  }
  // Workspace only — missing models → needs_models (no fake API keys).
  const conf = {
    storage: { workspace: "./data" },
    server: { host: "127.0.0.1" },
  };
  await writeFile(confPath, `${JSON.stringify(conf, null, 2)}\n`, { mode: 0o600 });
}

async function pullDockerImage(
  image: string,
  signal: AbortSignal,
  onProgress: (p: OvManagedProgress) => void,
): Promise<void> {
  if (await dockerImagePresent(image)) {
    onProgress({ phase: "download", progress: 0.45 });
    return;
  }
  onProgress({ phase: "download", progress: 0.1 });
  await execFileAbortable("docker", ["pull", image], { signal, timeoutMs: 600_000 });
  onProgress({ phase: "download", progress: 0.5 });
}

async function ensureRunningDocker(input: {
  rootDir: string;
  signal: AbortSignal;
  onProgress: (p: OvManagedProgress) => void;
}): Promise<OvManagedEnsureResult> {
  const { rootDir, signal, onProgress } = input;
  assertNotAborted(signal);
  if (!(await dockerAvailable())) {
    throw new Error("Docker is not available");
  }
  await assertEnoughDiskSpace(rootDir);

  const homeDir = join(rootDir, "home");
  await ensureMinimalOvConf(homeDir);
  const name = containerNameFor(rootDir);
  const existing = await readOvInstallMarker(rootDir);
  const sameVersion = existing?.version === OV_MANAGED_VERSION && existing.backend === "docker";

  // Fast path: pinned container already running and healthy.
  if (sameVersion && existing.containerName === name && (await dockerContainerRunning(name))) {
    const endpoint = `http://127.0.0.1:${existing.port}`;
    onProgress({ phase: "health", progress: 0.7 });
    const health = await waitForOvHealth({
      endpoint,
      signal,
      onProgress,
      timeoutMs: 20_000,
    });
    if (health.ok || health.needsModels) {
      onProgress({ phase: "health", progress: 1 });
      return { endpoint, port: existing.port, backend: "docker" };
    }
  }

  let port =
    sameVersion && existing.port ? existing.port : await allocateLoopbackPort();

  assertNotAborted(signal);
  let imageUsed = OV_DOCKER_IMAGE;
  try {
    await pullDockerImage(OV_DOCKER_IMAGE, signal, onProgress);
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") throw err;
    assertNotAborted(signal);
    onProgress({ phase: "download", progress: 0.2 });
    await pullDockerImage(OV_DOCKER_IMAGE_FALLBACK, signal, onProgress);
    imageUsed = OV_DOCKER_IMAGE_FALLBACK;
  }

  onProgress({ phase: "unpack", progress: 0.55 });
  assertNotAborted(signal);

  await dockerStopRemove(name);
  onProgress({ phase: "start", progress: 0.65 });

  const volumeSpec =
    process.platform === "win32"
      ? `${homeDir.replace(/\\/g, "/")}:/app/.openviking`
      : `${homeDir}:/app/.openviking`;

  await execFileAbortable(
    "docker",
    [
      "run",
      "-d",
      "--name",
      name,
      "-p",
      `127.0.0.1:${port}:1933`,
      "-v",
      volumeSpec,
      imageUsed,
    ],
    { signal, timeoutMs: 60_000 },
  );

  const endpoint = `http://127.0.0.1:${port}`;
  const health = await waitForOvHealth({ endpoint, signal, onProgress });
  if (!health.ok && !health.needsModels) {
    await dockerStopRemove(name);
    throw new Error(health.error || "OpenViking container started but is not reachable");
  }

  await writeOvInstallMarker(rootDir, {
    version: OV_MANAGED_VERSION,
    installedAt: new Date().toISOString(),
    port,
    backend: "docker",
    containerName: name,
    image: imageUsed,
  });
  onProgress({ phase: "health", progress: 1 });
  return { endpoint, port, backend: "docker" };
}

async function findPython(): Promise<string | null> {
  for (const cmd of ["python3", "python"]) {
    try {
      await execFileAsync(cmd, ["--version"], { timeout: 5000 });
      return cmd;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function ensureRunningVenv(input: {
  rootDir: string;
  signal: AbortSignal;
  onProgress: (p: OvManagedProgress) => void;
}): Promise<OvManagedEnsureResult> {
  const { rootDir, signal, onProgress } = input;
  assertNotAborted(signal);
  const python = await findPython();
  if (!python) {
    throw new Error("Python 3 was not found");
  }
  await assertEnoughDiskSpace(rootDir);

  const venvDir = join(rootDir, "venv");
  const homeDir = join(rootDir, "home");
  await ensureMinimalOvConf(homeDir);
  const binDir = process.platform === "win32" ? join(venvDir, "Scripts") : join(venvDir, "bin");
  const venvPython = process.platform === "win32" ? join(binDir, "python.exe") : join(binDir, "python");
  const ovServer =
    process.platform === "win32"
      ? join(binDir, "openviking-server.exe")
      : join(binDir, "openviking-server");

  onProgress({ phase: "download", progress: 0.05 });
  let hasVenv = false;
  try {
    await access(venvPython);
    hasVenv = true;
  } catch {
    hasVenv = false;
  }
  if (!hasVenv) {
    assertNotAborted(signal);
    await execFileAbortable(python, ["-m", "venv", venvDir], {
      signal,
      timeoutMs: 120_000,
    });
  }

  onProgress({ phase: "download", progress: 0.25 });
  assertNotAborted(signal);
  const useUv = await commandExists("uv");
  if (useUv) {
    await execFileAbortable(
      "uv",
      ["pip", "install", "--python", venvPython, `openviking==${OV_MANAGED_VERSION}`],
      { signal, timeoutMs: 600_000 },
    );
  } else {
    await execFileAbortable(
      venvPython,
      ["-m", "pip", "install", "--upgrade", `openviking==${OV_MANAGED_VERSION}`],
      { signal, timeoutMs: 600_000 },
    );
  }
  onProgress({ phase: "unpack", progress: 0.55 });
  assertNotAborted(signal);

  try {
    await access(ovServer);
  } catch {
    throw new Error("OpenViking installed but openviking-server was not found");
  }

  const existing = await readOvInstallMarker(rootDir);
  if (
    existing?.backend === "venv" &&
    existing.version === OV_MANAGED_VERSION &&
    existing.pid
  ) {
    try {
      process.kill(existing.pid, 0);
      const endpoint = `http://127.0.0.1:${existing.port}`;
      const health = await waitForOvHealth({
        endpoint,
        signal,
        onProgress,
        timeoutMs: 15_000,
      });
      if (health.ok || health.needsModels) {
        return { endpoint, port: existing.port, backend: "venv" };
      }
    } catch {
      /* dead or unreachable — start fresh */
    }
    try {
      process.kill(existing.pid, "SIGTERM");
    } catch {
      /* ignore */
    }
  }

  const port = await allocateLoopbackPort();
  onProgress({ phase: "start", progress: 0.7 });
  assertNotAborted(signal);

  const child: ChildProcess = spawn(ovServer, [], {
    cwd: homeDir,
    env: {
      ...process.env,
      OPENVIKING_CONFIG_FILE: join(homeDir, "ov.conf"),
      OPENVIKING_SERVER_HOST: "127.0.0.1",
      OPENVIKING_SERVER_PORT: String(port),
    },
    stdio: "ignore",
    detached: process.platform !== "win32",
    windowsHide: true,
  });

  const spawnFailed = await new Promise<Error | null>((resolve) => {
    const onError = (err: Error) => {
      cleanup();
      resolve(err);
    };
    const onSpawn = () => {
      cleanup();
      resolve(null);
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve(null);
    }, 500);
    const cleanup = () => {
      clearTimeout(timer);
      child.off("error", onError);
      child.off("spawn", onSpawn);
    };
    child.once("error", onError);
    child.once("spawn", onSpawn);
  });
  if (spawnFailed) throw spawnFailed;

  if (child.pid) {
    try {
      child.unref();
    } catch {
      /* ignore */
    }
  } else {
    throw new Error("OpenViking process failed to start");
  }

  const endpoint = `http://127.0.0.1:${port}`;
  const health = await waitForOvHealth({ endpoint, signal, onProgress });
  if (!health.ok && !health.needsModels) {
    try {
      process.kill(child.pid, "SIGTERM");
    } catch {
      /* ignore */
    }
    throw new Error(health.error || "OpenViking started but is not reachable");
  }

  await writeOvInstallMarker(rootDir, {
    version: OV_MANAGED_VERSION,
    installedAt: new Date().toISOString(),
    port,
    backend: "venv",
    pid: child.pid,
  });
  onProgress({ phase: "health", progress: 1 });
  return { endpoint, port, backend: "venv" };
}

async function stopManaged(rootDir: string): Promise<void> {
  const marker = await readOvInstallMarker(rootDir);
  if (!marker) {
    // Best-effort: stop known docker name even without marker (interrupted install).
    await dockerStopRemove(containerNameFor(rootDir));
    return;
  }
  if (marker.backend === "docker") {
    await dockerStopRemove(marker.containerName || containerNameFor(rootDir));
    return;
  }
  if (marker.backend === "venv" && marker.pid) {
    try {
      process.kill(marker.pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  }
}

/**
 * Default managed driver: Docker if usable, else Python venv + pinned wheel.
 * End-user errors stay plain language (no stack dumps).
 */
export function createDefaultOvManagedDriver(): OvManagedDriver {
  return {
    async ensureRunning(input) {
      assertNotAborted(input.signal);
      await mkdir(input.rootDir, { recursive: true });
      let dockerErr: string | undefined;
      if (await dockerAvailable()) {
        try {
          return await ensureRunningDocker(input);
        } catch (err) {
          if ((err as { name?: string }).name === "AbortError") throw err;
          dockerErr = err instanceof Error ? err.message : String(err);
        }
      }
      try {
        return await ensureRunningVenv(input);
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") throw err;
        const msg = err instanceof Error ? err.message : String(err);
        const detail = dockerErr ? `${dockerErr}; then ${msg}` : msg;
        throw new Error(
          `Could not set up OpenViking on this computer (${detail}). ` +
            "Install Docker, or start OpenViking yourself and paste its URL in Settings.",
        );
      }
    },
    stop: stopManaged,
  };
}

export async function clearOvManagedInstall(rootDir: string): Promise<void> {
  await stopManaged(rootDir);
  try {
    await rm(join(rootDir, "venv"), { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  try {
    await rm(ovInstallMarkerPath(rootDir), { force: true });
  } catch {
    /* ignore */
  }
}
