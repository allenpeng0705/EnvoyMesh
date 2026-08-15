/**
 * Envoy Local **embedding** sidecar — second llama-server on :18791.
 * Shares the chat runtime binary under `{profile}/envoy-local/runtime/{tag}/`.
 * Loads a dedicated embedding GGUF from `{profile}/envoy-local/embed-models/`.
 *
 * Chat stays on :18790 (optional). Knowledge RAG defaults to this embed process.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  DEFAULT_ENVOY_LOCAL_EMBED_MODEL_ID,
  DEFAULT_ENVOY_LOCAL_SERVER_PARAMS,
  ENVOY_LOCAL_EMBED_CTX_SIZE,
  normalizeEnvoyLocalEmbedConfig,
  resolveEnvoyLocalEmbedModelId,
  type EnableEnvoyLocalEmbedParams,
  type EnvoyLocalCatalogModel,
  type EnvoyLocalEmbedConfig,
  type EnvoyLocalEmbedStatus,
  type EnvoyLocalPhase,
  type EnvoyLocalServerParams,
} from "@envoymesh/api";
import {
  DEFAULT_ENVOY_LOCAL_EMBED_MODEL,
  embedPoolingForModel,
  getEnvoyLocalEmbedCatalogModel,
} from "./envoy-local-embed-catalog.js";
import {
  downloadFile,
  ensureMinFreeBytes,
  fileExists,
  findExecutable,
  verifyGgufFile,
} from "./envoy-local-download.js";
import {
  ENVOY_LOCAL_LLAMA_CPP_TAG,
  ENVOY_LOCAL_MIN_FREE_BYTES,
  ENVOY_LOCAL_MIN_MODEL_BYTES,
  resolveStartupTimeoutMs,
} from "./envoy-local-manifest.js";
import {
  resolveEnvoyLocalDownloadRegion,
  resolveEnvoyLocalModelDownloadUrls,
} from "./envoy-local-mirrors.js";
import { detectEnvoyLocalPlatform } from "./envoy-local-platform.js";
import {
  createEnvoyLocalRuntimeState,
  ensureEnvoyLocalSharedRuntimeBinary,
  type EnvoyLocalRuntimeState,
} from "./envoy-local-runtime.js";
import { buildEnvoyLocalLlamaServerArgs } from "./envoy-local-server-args.js";
import { listListeningPidsOnPort } from "./openclaw-gateway-port.js";
import {
  ENVOY_LOCAL_EMBED_PORT,
  envoyLocalEmbedOpenAiBaseUrl,
} from "./service-ports.js";

export interface EnvoyLocalEmbedRuntimeDeps {
  getProfileDir: () => string;
  loadEnvoyLocalEmbedConfig: () => Promise<EnvoyLocalEmbedConfig | undefined>;
  saveEnvoyLocalEmbedConfig: (patch: EnvoyLocalEmbedConfig) => Promise<void>;
  /** Reuse chat Local download-region preference when present. */
  loadDownloadRegionPreference?: () => Promise<"auto" | "cn" | "global" | undefined>;
  /**
   * When true (default), boot may download llama.cpp + embed GGUF if missing.
   * False when Knowledge embedding provider is cloud/Ollama/mock.
   */
  shouldAutoProvisionEmbed?: () => Promise<boolean>;
  /**
   * Knowledge Setup embedding.modelName when set — preferred over a stale
   * envoyLocalEmbed.activeModelId on boot/enable without explicit modelId.
   */
  preferredEmbedModelId?: () => Promise<string | undefined>;
  /**
   * Fired once when the embed sidecar first becomes ready in this process
   * (fresh start or orphan reuse). Used to run RAG reindex after first-run
   * download — boot refresh often races ahead of :18791.
   */
  onEmbedReady?: () => void | Promise<void>;
  /**
   * When true, idle-stop is deferred (e.g. vault reindex / connector sync in
   * progress). Checked when the idle timer fires.
   */
  isEmbedBusy?: () => boolean;
}

export type EnvoyLocalEmbedRuntimeState = EnvoyLocalRuntimeState & {
  /** Prevents duplicate onEmbedReady → reindex storms in one process. */
  embedReadyNotified?: boolean;
  /** Last embed HTTP use / ensure (ms since epoch). */
  lastEmbedActivityAt?: number;
  /** Stops the owned sidecar after quiet period — frees CPU/RAM. */
  idleStopTimer?: ReturnType<typeof setTimeout> | null;
  /**
   * Consecutive failed /v1/embeddings health probes (models OK but inference
   * hung — the wedge we saw when slots stuck). Separate from
   * consecutiveHealthFailures (/models).
   */
  consecutiveEmbedProbeFailures?: number;
  /** Serialize watchdog restart so overlapping ticks don't double-spawn. */
  watchdogRestartPromise?: Promise<void> | null;
  /** Skip a tick while the previous /models+/embeddings probe is still running. */
  watchdogTickInFlight?: boolean;
};

/** Default quiet time before stopping the embed llama-server (ms).
 * 0 = keep warm (preferred for the small default 0.6B embedder). */
export const ENVOY_LOCAL_EMBED_IDLE_STOP_MS_DEFAULT = 0;

/**
 * Idle unload delay. `ENVOYMESH_ENVOY_LOCAL_EMBED_IDLE_MS`:
 * - unset → 0 (keep running)
 * - `0` → never auto-stop
 * - positive → that many ms
 */
export function resolveEnvoyLocalEmbedIdleStopMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.ENVOYMESH_ENVOY_LOCAL_EMBED_IDLE_MS?.trim();
  if (raw == null || raw === "") return ENVOY_LOCAL_EMBED_IDLE_STOP_MS_DEFAULT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return ENVOY_LOCAL_EMBED_IDLE_STOP_MS_DEFAULT;
  return Math.floor(n);
}

export function createEnvoyLocalEmbedRuntimeState(): EnvoyLocalEmbedRuntimeState {
  return {
    ...createEnvoyLocalRuntimeState(),
    idleStopTimer: null,
    consecutiveEmbedProbeFailures: 0,
    watchdogRestartPromise: null,
    watchdogTickInFlight: false,
  };
}

async function notifyEmbedReady(
  state: EnvoyLocalEmbedRuntimeState,
  deps: EnvoyLocalEmbedRuntimeDeps,
): Promise<void> {
  if (state.embedReadyNotified) return;
  state.embedReadyNotified = true;
  if (!deps.onEmbedReady) return;
  try {
    await deps.onEmbedReady();
  } catch (err) {
    // Allow a later retry (e.g. reindex after vault finishes building).
    state.embedReadyNotified = false;
    console.warn(
      "[envoy-local-embed] onEmbedReady failed:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

function rootDir(profileDir: string): string {
  return resolve(profileDir, "envoy-local");
}

function runtimeDir(profileDir: string): string {
  return join(rootDir(profileDir), "runtime", ENVOY_LOCAL_LLAMA_CPP_TAG);
}

function embedModelsDir(profileDir: string): string {
  return join(rootDir(profileDir), "embed-models");
}

function embedModelsIndexPath(profileDir: string): string {
  return join(rootDir(profileDir), "embed-models.json");
}

type IndexedEmbedModel = {
  id: string;
  path: string;
  fileName: string;
};

type EmbedModelsIndex = {
  activeModelId?: string;
  models: IndexedEmbedModel[];
};

function setProgress(
  state: EnvoyLocalEmbedRuntimeState,
  progress: NonNullable<EnvoyLocalEmbedRuntimeState["download"]>,
): void {
  state.download = progress;
  state.phase = progress.phase;
}

function setError(state: EnvoyLocalEmbedRuntimeState, message: string): void {
  state.phase = "error";
  state.lastError = message;
  state.lastErrorAt = new Date().toISOString();
  state.download = null;
}

async function loadEmbedIndex(profileDir: string): Promise<EmbedModelsIndex> {
  try {
    const raw = await readFile(embedModelsIndexPath(profileDir), "utf8");
    const parsed = JSON.parse(raw) as EmbedModelsIndex;
    return {
      activeModelId: parsed.activeModelId,
      models: Array.isArray(parsed.models) ? parsed.models : [],
    };
  } catch {
    return { models: [] };
  }
}

async function saveEmbedIndex(profileDir: string, index: EmbedModelsIndex): Promise<void> {
  await mkdir(rootDir(profileDir), { recursive: true });
  await writeFile(embedModelsIndexPath(profileDir), JSON.stringify(index, null, 2), "utf8");
}

async function downloadEmbedModel(
  state: EnvoyLocalEmbedRuntimeState,
  deps: EnvoyLocalEmbedRuntimeDeps,
  profileDir: string,
  catalog: EnvoyLocalCatalogModel,
  signal: AbortSignal,
): Promise<{ id: string; path: string }> {
  const index = await loadEmbedIndex(profileDir);
  const existing = index.models.find((m) => m.id === catalog.id);
  if (existing && (await fileExists(existing.path))) {
    await saveEmbedIndex(profileDir, { ...index, activeModelId: catalog.id });
    return { id: existing.id, path: existing.path };
  }

  const dest = join(embedModelsDir(profileDir), catalog.fileName);
  if (!(await fileExists(dest))) {
    await mkdir(embedModelsDir(profileDir), { recursive: true });
    await ensureMinFreeBytes(
      rootDir(profileDir),
      Math.max(ENVOY_LOCAL_MIN_FREE_BYTES, catalog.approxBytes + 50_000_000),
    );
    const preference = deps.loadDownloadRegionPreference
      ? await deps.loadDownloadRegionPreference()
      : undefined;
    const region = resolveEnvoyLocalDownloadRegion({ preference });
    const candidates = resolveEnvoyLocalModelDownloadUrls(catalog, region);
    let lastErr: unknown;
    for (const url of candidates) {
      setProgress(state, {
        phase: "downloading-model",
        label: `Downloading ${catalog.fileName}`,
        fraction: 0,
      });
      try {
        await rm(dest, { force: true });
        await downloadFile({
          url,
          destPath: dest,
          signal,
          onProgress: (p) => {
            setProgress(state, {
              phase: "downloading-model",
              label: `Downloading ${catalog.fileName}`,
              bytesReceived: p.bytesReceived,
              bytesTotal: p.bytesTotal,
              fraction:
                p.bytesTotal && p.bytesTotal > 0
                  ? Math.min(0.99, p.bytesReceived / p.bytesTotal)
                  : undefined,
            });
          },
        });
        lastErr = undefined;
        break;
      } catch (err) {
        lastErr = err;
        await rm(dest, { force: true });
        if (signal.aborted) throw err;
      }
    }
    if (lastErr) {
      throw lastErr instanceof Error
        ? lastErr
        : new Error(`Failed to download embed model ${catalog.id}`);
    }
  }

  const st = await stat(dest);
  if (st.size < ENVOY_LOCAL_MIN_MODEL_BYTES) {
    throw new Error(`Embed model too small (${st.size} bytes)`);
  }
  await verifyGgufFile(dest);

  const entry: IndexedEmbedModel = {
    id: catalog.id,
    path: dest,
    fileName: catalog.fileName,
  };
  const nextModels = [...index.models.filter((m) => m.id !== catalog.id), entry];
  await saveEmbedIndex(profileDir, { models: nextModels, activeModelId: catalog.id });
  return { id: catalog.id, path: dest };
}

function clearIdleStopTimer(state: EnvoyLocalEmbedRuntimeState): void {
  if (state.idleStopTimer) {
    clearTimeout(state.idleStopTimer);
    state.idleStopTimer = null;
  }
}

/**
 * Mark embed use and (re)arm idle unload. Call around every embed HTTP burst
 * and after reindex finishes so the sidecar does not stay at multi-core forever.
 */
export function noteEnvoyLocalEmbedActivity(
  state: EnvoyLocalEmbedRuntimeState,
  deps: EnvoyLocalEmbedRuntimeDeps,
  options?: { idleMs?: number },
): void {
  state.lastEmbedActivityAt = Date.now();
  armEnvoyLocalEmbedIdleStop(state, deps, options);
}

/**
 * After quiet period, stop the **owned** embed child (SIGTERM). Orphan servers
 * from another node process are not killed — only local ready/watchdog state
 * is cleared. Idle unload is skipped while `deps.isEmbedBusy()` is true.
 */
export function armEnvoyLocalEmbedIdleStop(
  state: EnvoyLocalEmbedRuntimeState,
  deps: EnvoyLocalEmbedRuntimeDeps,
  options?: { idleMs?: number },
): void {
  const idleMs = options?.idleMs ?? resolveEnvoyLocalEmbedIdleStopMs();
  clearIdleStopTimer(state);
  if (idleMs <= 0) return;

  const startedAt = state.lastEmbedActivityAt ?? Date.now();
  state.idleStopTimer = setTimeout(() => {
    void (async () => {
      try {
        if ((state.lastEmbedActivityAt ?? 0) > startedAt) return;
        if (deps.isEmbedBusy?.()) {
          noteEnvoyLocalEmbedActivity(state, deps, options);
          return;
        }
        const idleMsNow = options?.idleMs ?? resolveEnvoyLocalEmbedIdleStopMs();
        if (idleMsNow <= 0) return;
        if (Date.now() - (state.lastEmbedActivityAt ?? 0) < idleMsNow - 25) {
          armEnvoyLocalEmbedIdleStop(state, deps, options);
          return;
        }

        if (!state.child) {
          // Orphan reuse: do not SIGKILL another profile's llama-server.
          if (state.watchdog) {
            clearInterval(state.watchdog);
            state.watchdog = null;
          }
          if (state.phase === "ready") state.phase = "idle";
          console.info(
            "[envoy-local-embed] idle: released orphan handle (left foreign process running)",
          );
          return;
        }

        console.info(
          `[envoy-local-embed] idle: stopping sidecar after ${idleMsNow}ms quiet`,
        );
        await stopChild(state);
        state.phase = "idle";
        state.embedReadyNotified = false;
      } catch (err) {
        console.warn(
          "[envoy-local-embed] idle stop failed:",
          err instanceof Error ? err.message : String(err),
        );
      }
    })();
  }, idleMs);
  state.idleStopTimer.unref?.();
}

async function stopChild(state: EnvoyLocalEmbedRuntimeState): Promise<void> {
  clearIdleStopTimer(state);
  if (state.watchdog) {
    clearInterval(state.watchdog);
    state.watchdog = null;
  }
  const child = state.child;
  if (!child || child.killed) {
    state.child = null;
    state.childPid = undefined;
    return;
  }
  await new Promise<void>((resolveDone) => {
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      resolveDone();
    }, 4_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolveDone();
    });
    try {
      child.kill("SIGTERM");
    } catch {
      clearTimeout(timer);
      resolveDone();
    }
  });
  state.child = null;
  state.childPid = undefined;
}

/**
 * Stop the process we spawned, then SIGTERM/SIGKILL any leftover listener on
 * the embed port (orphans from a previous node / wedged llama-server).
 */
async function stopEmbedListenerHard(state: EnvoyLocalEmbedRuntimeState): Promise<void> {
  await stopChild(state);
  const pids = listListeningPidsOnPort(ENVOY_LOCAL_EMBED_PORT).filter(
    (pid) => pid !== process.pid,
  );
  if (pids.length === 0) return;
  console.warn(
    `[envoy-local-embed] reclaiming port ${ENVOY_LOCAL_EMBED_PORT} — stopping PID(s): ${pids.join(", ")}`,
  );
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      /* ignore */
    }
  }
  await new Promise((r) => setTimeout(r, 1_200));
  for (const pid of listListeningPidsOnPort(ENVOY_LOCAL_EMBED_PORT)) {
    if (pid === process.pid) continue;
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* ignore */
    }
  }
  await new Promise((r) => setTimeout(r, 200));
}

/** GET /v1/models — process is listening. Does NOT detect a stuck slot. */
export async function probeEnvoyLocalEmbedModels(
  endpoint: string,
  timeoutMs = 3_000,
): Promise<boolean> {
  try {
    const res = await fetch(`${endpoint.replace(/\/$/, "")}/models`, {
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * POST /v1/embeddings with a tiny payload. Detects the "models OK but slots
 * wedged" failure mode that only probing /models misses.
 */
export async function probeEnvoyLocalEmbedInference(
  endpoint: string,
  modelName: string,
  timeoutMs = 12_000,
): Promise<boolean> {
  try {
    const res = await fetch(`${endpoint.replace(/\/$/, "")}/embeddings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: modelName || DEFAULT_ENVOY_LOCAL_EMBED_MODEL_ID,
        input: "ping",
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return false;
    const payload = (await res.json()) as {
      data?: Array<{ embedding?: unknown }>;
      embedding?: unknown;
    };
    const vec = payload.data?.[0]?.embedding ?? payload.embedding;
    return Array.isArray(vec) && vec.length > 0;
  } catch {
    return false;
  }
}

async function resolveProbeModelId(
  state: EnvoyLocalEmbedRuntimeState,
  deps: EnvoyLocalEmbedRuntimeDeps,
): Promise<string> {
  try {
    const cfg = normalizeEnvoyLocalEmbedConfig(await deps.loadEnvoyLocalEmbedConfig());
    if (cfg.activeModelId?.trim()) return cfg.activeModelId.trim();
  } catch {
    /* fall through */
  }
  try {
    const preferred = await deps.preferredEmbedModelId?.();
    if (preferred?.trim()) return preferred.trim();
  } catch {
    /* fall through */
  }
  void state;
  return DEFAULT_ENVOY_LOCAL_EMBED_MODEL_ID;
}

/** True when /v1/models and a tiny /v1/embeddings both succeed. */
export async function confirmEnvoyLocalEmbedInferenceReady(
  state: EnvoyLocalEmbedRuntimeState,
  deps: EnvoyLocalEmbedRuntimeDeps,
): Promise<boolean> {
  const endpoint = envoyLocalEmbedOpenAiBaseUrl(ENVOY_LOCAL_EMBED_PORT);
  if (!(await probeEnvoyLocalEmbedModels(endpoint))) return false;
  const modelId = await resolveProbeModelId(state, deps);
  return probeEnvoyLocalEmbedInference(endpoint, modelId);
}

async function restartEmbedSidecarFromWatchdog(
  state: EnvoyLocalEmbedRuntimeState,
  deps: EnvoyLocalEmbedRuntimeDeps,
  reason: string,
): Promise<void> {
  if (state.watchdogRestartPromise) {
    await state.watchdogRestartPromise;
    return;
  }
  state.watchdogRestartPromise = (async () => {
    console.warn(`[envoy-local-embed] watchdog restart: ${reason}`);
    const cfg = normalizeEnvoyLocalEmbedConfig(await deps.loadEnvoyLocalEmbedConfig());
    if (!cfg.enabled) return;
    if (state.enablePromise) {
      await state.enablePromise;
      return;
    }
    try {
      await stopEmbedListenerHard(state);
      await startEmbedSidecar(state, deps);
      state.consecutiveHealthFailures = 0;
      state.consecutiveEmbedProbeFailures = 0;
    } catch (err) {
      setError(state, err instanceof Error ? err.message : String(err));
    }
  })();
  try {
    await state.watchdogRestartPromise;
  } finally {
    state.watchdogRestartPromise = null;
  }
}

function armEmbedWatchdog(
  state: EnvoyLocalEmbedRuntimeState,
  deps: EnvoyLocalEmbedRuntimeDeps,
): void {
  if (state.watchdog) clearInterval(state.watchdog);
  state.consecutiveHealthFailures = 0;
  state.consecutiveEmbedProbeFailures = 0;
  state.watchdogTickInFlight = false;
  // Tick every 15s: /models always; /embeddings when not busy (reindex holds the sole slot).
  state.watchdog = setInterval(() => {
    void (async () => {
      if (
        state.watchdogTickInFlight ||
        state.watchdogRestartPromise ||
        state.enablePromise
      ) {
        return;
      }
      state.watchdogTickInFlight = true;
      try {
        const endpoint = envoyLocalEmbedOpenAiBaseUrl(ENVOY_LOCAL_EMBED_PORT);
        const modelsOk = await probeEnvoyLocalEmbedModels(endpoint);
        if (!modelsOk) {
          state.consecutiveHealthFailures = (state.consecutiveHealthFailures ?? 0) + 1;
          if (state.consecutiveHealthFailures < 3) return;
          state.consecutiveHealthFailures = 0;
          await restartEmbedSidecarFromWatchdog(
            state,
            deps,
            "/v1/models unreachable (3 consecutive)",
          );
          return;
        }
        state.consecutiveHealthFailures = 0;

        // Skip inference probe while RAG is embedding — parallel=1 would queue
        // behind real work and false-positive as a wedge.
        if (deps.isEmbedBusy?.()) return;

        const modelId = await resolveProbeModelId(state, deps);
        const inferOk = await probeEnvoyLocalEmbedInference(endpoint, modelId);
        if (inferOk) {
          state.consecutiveEmbedProbeFailures = 0;
          return;
        }
        state.consecutiveEmbedProbeFailures = (state.consecutiveEmbedProbeFailures ?? 0) + 1;
        console.warn(
          `[envoy-local-embed] embeddings probe failed (${state.consecutiveEmbedProbeFailures}/2) — models still OK`,
        );
        if ((state.consecutiveEmbedProbeFailures ?? 0) < 2) return;
        state.consecutiveEmbedProbeFailures = 0;
        await restartEmbedSidecarFromWatchdog(
          state,
          deps,
          "/v1/embeddings hung or empty while /v1/models OK (wedged slot)",
        );
      } finally {
        state.watchdogTickInFlight = false;
      }
    })();
  }, 15_000);
  state.watchdog.unref?.();
}

async function startEmbedSidecar(
  state: EnvoyLocalEmbedRuntimeState,
  deps: EnvoyLocalEmbedRuntimeDeps,
): Promise<void> {
  const profileDir = deps.getProfileDir();
  const cfg = normalizeEnvoyLocalEmbedConfig(await deps.loadEnvoyLocalEmbedConfig());
  const platform = state.platform ?? detectEnvoyLocalPlatform();
  state.platform = platform;

  const serverParams: EnvoyLocalServerParams = {
    ...DEFAULT_ENVOY_LOCAL_SERVER_PARAMS,
    ctxSize: ENVOY_LOCAL_EMBED_CTX_SIZE,
    parallel: 1,
    nGpuLayers: 0, // prefer CPU for embed so chat GPU stays free
    ...(cfg.serverParams ?? {}),
  };

  const exeName = process.platform === "win32" ? "llama-server.exe" : "llama-server";
  const exe = await findExecutable(runtimeDir(profileDir), [exeName]);
  if (!exe) throw new Error("llama-server binary missing — enable Envoy Local embed again");

  const index = await loadEmbedIndex(profileDir);
  const modelId = cfg.activeModelId ?? index.activeModelId ?? DEFAULT_ENVOY_LOCAL_EMBED_MODEL_ID;
  const model = index.models.find((m) => m.id === modelId);
  if (!model || !(await fileExists(model.path))) {
    throw new Error(`Embed model missing (${modelId}) — run enable to download`);
  }

  setProgress(state, { phase: "starting", label: "Starting embed llama-server", fraction: 0.9 });

  const args = buildEnvoyLocalLlamaServerArgs({
    modelPath: resolve(model.path),
    modelId: model.id,
    port: ENVOY_LOCAL_EMBED_PORT,
    platform,
    serverParams,
    profileDir,
    forceCpu: true,
    embedding: true,
    pooling: embedPoolingForModel(model.id),
  });

  const endpoint = envoyLocalEmbedOpenAiBaseUrl(ENVOY_LOCAL_EMBED_PORT);
  // Orphan from a previous node process — reuse only if embeddings work too.
  // /v1/models alone can look healthy while the slot is wedged.
  if (await probeEnvoyLocalEmbedModels(endpoint)) {
    if (await probeEnvoyLocalEmbedInference(endpoint, model.id)) {
      state.phase = "ready";
      state.download = null;
      state.lastError = null;
      armEmbedWatchdog(state, deps);
      noteEnvoyLocalEmbedActivity(state, deps);
      await notifyEmbedReady(state, deps);
      return;
    }
    console.warn(
      "[envoy-local-embed] orphan on port answers /models but not /embeddings — reclaiming",
    );
  }

  await stopEmbedListenerHard(state);

  const child: ChildProcess = spawn(exe, args, {
    cwd: join(exe, ".."),
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
    env: { ...process.env },
  });
  state.child = child;
  state.childPid = child.pid;

  child.on("exit", (code, signal) => {
    if (state.child === child) {
      state.child = null;
      state.childPid = undefined;
      if (state.phase === "ready" || state.phase === "starting") {
        setError(
          state,
          `embed llama-server exited (code=${code ?? "null"} signal=${signal ?? "null"})`,
        );
      }
    }
  });

  const modelStat = await stat(model.path);
  const timeoutMs = resolveStartupTimeoutMs(serverParams, modelStat.size);
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await probeEnvoyLocalEmbedModels(endpoint)) {
      state.phase = "ready";
      state.download = null;
      state.lastError = null;
      armEmbedWatchdog(state, deps);
      noteEnvoyLocalEmbedActivity(state, deps);
      await notifyEmbedReady(state, deps);
      return;
    }
    if (!state.child) {
      throw new Error(state.lastError ?? "embed llama-server failed to start");
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  await stopEmbedListenerHard(state);
  throw new Error(`embed llama-server did not become ready within ${timeoutMs}ms`);
}

export async function getEnvoyLocalEmbedStatusViaRuntime(
  state: EnvoyLocalEmbedRuntimeState,
  deps: EnvoyLocalEmbedRuntimeDeps,
): Promise<EnvoyLocalEmbedStatus> {
  const profileDir = deps.getProfileDir();
  const cfg = normalizeEnvoyLocalEmbedConfig(await deps.loadEnvoyLocalEmbedConfig());
  const exeName = process.platform === "win32" ? "llama-server.exe" : "llama-server";
  const runtimeInstalled = Boolean(await findExecutable(runtimeDir(profileDir), [exeName]));
  const index = await loadEmbedIndex(profileDir);
  const activeId = cfg.activeModelId ?? index.activeModelId;
  const active = index.models.find((m) => m.id === activeId);
  const endpoint = envoyLocalEmbedOpenAiBaseUrl(ENVOY_LOCAL_EMBED_PORT);
  const probed = await probeEnvoyLocalEmbedModels(endpoint);
  // Probe success counts as running (covers orphans after node restart).
  if (probed && state.phase !== "error" && !downloadingPhaseHint(state)) {
    if (state.phase !== "ready") {
      state.phase = "ready";
      state.lastError = null;
      state.download = null;
    }
  }
  const running = probed && state.phase === "ready";

  const downloadingPhase = downloadingPhaseHint(state);

  return {
    enabled: cfg.enabled,
    running,
    phase: cfg.enabled || downloadingPhase || Boolean(state.enablePromise) ? state.phase : "disabled",
    port: ENVOY_LOCAL_EMBED_PORT,
    endpoint,
    runtimeInstalled,
    activeModelId: activeId,
    activeModelPath: active?.path,
    modelsDir: embedModelsDir(profileDir),
    childPid: state.childPid,
    lastError: state.lastError,
    lastErrorAt: state.lastErrorAt,
    download: state.download,
    operationInProgress: Boolean(state.enablePromise) || downloadingPhase,
    serverParams: {
      ...DEFAULT_ENVOY_LOCAL_SERVER_PARAMS,
      ctxSize: ENVOY_LOCAL_EMBED_CTX_SIZE,
      parallel: 1,
      nGpuLayers: 0,
      ...(cfg.serverParams ? { ...cfg.serverParams, nGpuLayers: 0 } : {}),
    },
  };
}

function downloadingPhaseHint(state: EnvoyLocalEmbedRuntimeState): boolean {
  return (
    state.phase === "detecting" ||
    state.phase === "downloading-runtime" ||
    state.phase === "extracting-runtime" ||
    state.phase === "downloading-model" ||
    state.phase === "starting"
  );
}

export async function enableEnvoyLocalEmbedViaRuntime(
  state: EnvoyLocalEmbedRuntimeState,
  deps: EnvoyLocalEmbedRuntimeDeps,
  params?: EnableEnvoyLocalEmbedParams,
): Promise<EnvoyLocalEmbedStatus> {
  if (state.enablePromise) {
    return getEnvoyLocalEmbedStatusViaRuntime(state, deps);
  }

  const abort = new AbortController();
  state.abort = abort;
  state.lastError = null;
  state.lastErrorAt = null;
  setProgress(state, { phase: "detecting", label: "Detecting platform", fraction: 0 });

  // Reserve the slot synchronously so concurrent enable RPCs coalesce before
  // the async body hits its first await.
  let resolveJob!: (status: EnvoyLocalEmbedStatus) => void;
  const job = new Promise<EnvoyLocalEmbedStatus>((resolve) => {
    resolveJob = resolve;
  });
  state.enablePromise = job;

  void (async () => {
    try {
      const platform = detectEnvoyLocalPlatform();
      state.platform = platform;
      const profileDir = deps.getProfileDir();

      await deps.saveEnvoyLocalEmbedConfig({ enabled: true });

      const preference = deps.loadDownloadRegionPreference
        ? await deps.loadDownloadRegionPreference()
        : undefined;
      const region = resolveEnvoyLocalDownloadRegion({ preference });

      await ensureEnvoyLocalSharedRuntimeBinary(
        state,
        profileDir,
        platform,
        abort.signal,
        { region },
      );

      // Prefer: explicit RPC modelId → Knowledge Setup model → last active → 0.6B.
      const cfg = normalizeEnvoyLocalEmbedConfig(await deps.loadEnvoyLocalEmbedConfig());
      const preferredKb = deps.preferredEmbedModelId
        ? await deps.preferredEmbedModelId()
        : undefined;
      const modelId = resolveEnvoyLocalEmbedModelId(
        params?.modelId ?? preferredKb ?? cfg.activeModelId,
      );
      const catalog =
        getEnvoyLocalEmbedCatalogModel(modelId) ?? DEFAULT_ENVOY_LOCAL_EMBED_MODEL;
      if (params?.skipModelDownload !== true) {
        await downloadEmbedModel(state, deps, profileDir, catalog, abort.signal);
      } else {
        const index = await loadEmbedIndex(profileDir);
        const existing = index.models.find((m) => m.id === catalog.id);
        if (!existing || !(await fileExists(existing.path))) {
          await downloadEmbedModel(state, deps, profileDir, catalog, abort.signal);
        }
      }

      if (abort.signal.aborted) {
        throw new Error("Embed enable aborted");
      }

      await deps.saveEnvoyLocalEmbedConfig({
        enabled: true,
        activeModelId: catalog.id,
        runtimeVersion: ENVOY_LOCAL_LLAMA_CPP_TAG,
      });

      await startEmbedSidecar(state, deps);
      resolveJob(await getEnvoyLocalEmbedStatusViaRuntime(state, deps));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(state, message);
      // Keep enabled for next-boot retry unless the user stopped/disabled (abort).
      if (!abort.signal.aborted) {
        await deps.saveEnvoyLocalEmbedConfig({ enabled: true }).catch(() => undefined);
      }
      resolveJob(await getEnvoyLocalEmbedStatusViaRuntime(state, deps));
    } finally {
      if (state.enablePromise === job) {
        state.enablePromise = null;
        state.abort = null;
      }
    }
  })();

  // Detach: UI polls getEnvoyLocalEmbedStatus (operationInProgress / download).
  // Holding the RPC for a multi-GB GGUF hits client timeouts.
  return getEnvoyLocalEmbedStatusViaRuntime(state, deps);
}

export async function stopEnvoyLocalEmbedViaRuntime(
  state: EnvoyLocalEmbedRuntimeState,
  deps: EnvoyLocalEmbedRuntimeDeps,
): Promise<EnvoyLocalEmbedStatus> {
  state.abort?.abort();
  await stopEmbedListenerHard(state);
  state.phase = "idle";
  state.embedReadyNotified = false;
  state.download = null;
  return getEnvoyLocalEmbedStatusViaRuntime(state, deps);
}

/**
 * Lazy-start: make sure :18791 answers before RAG embeds. No-op when Knowledge
 * embedding mode is not Envoy Local, or embed is explicitly disabled.
 * Re-arms idle unload after success.
 */
export async function ensureEnvoyLocalEmbedRunningViaRuntime(
  state: EnvoyLocalEmbedRuntimeState,
  deps: EnvoyLocalEmbedRuntimeDeps,
): Promise<void> {
  const should =
    deps.shouldAutoProvisionEmbed == null
      ? true
      : await deps.shouldAutoProvisionEmbed();
  if (!should) return;

  const cfg = normalizeEnvoyLocalEmbedConfig(await deps.loadEnvoyLocalEmbedConfig());
  if (!cfg.enabled) return;

  const endpoint = envoyLocalEmbedOpenAiBaseUrl(ENVOY_LOCAL_EMBED_PORT);
  if (await probeEnvoyLocalEmbedModels(endpoint)) {
    const modelId = await resolveProbeModelId(state, deps);
    // Heal wedged orphans before RAG starts embedding (models OK ≠ slots OK).
    if (!(await probeEnvoyLocalEmbedInference(endpoint, modelId))) {
      console.warn(
        "[envoy-local-embed] ensure: /v1/models OK but /v1/embeddings failed — restarting",
      );
      await restartEmbedSidecarFromWatchdog(
        state,
        deps,
        "ensureEnvoyLocalEmbed: embeddings probe failed",
      );
      if (!(await confirmEnvoyLocalEmbedInferenceReady(state, deps))) {
        noteEnvoyLocalEmbedActivity(state, deps);
        throw new Error(
          state.lastError ??
            "Envoy Local embed still unhealthy after restart (/v1/embeddings)",
        );
      }
    }
    if (state.phase !== "ready" && state.phase !== "error") {
      state.phase = "ready";
      state.lastError = null;
    }
    // Arm even for orphans (no state.child) — otherwise wedged reused
    // processes are never watched.
    if (!state.watchdog) {
      armEmbedWatchdog(state, deps);
    }
    noteEnvoyLocalEmbedActivity(state, deps);
    return;
  }

  if (state.enablePromise) {
    await state.enablePromise;
    if (!(await confirmEnvoyLocalEmbedInferenceReady(state, deps))) {
      noteEnvoyLocalEmbedActivity(state, deps);
      throw new Error(
        state.lastError ??
          "Envoy Local embed still unhealthy after enable (/v1/embeddings)",
      );
    }
    noteEnvoyLocalEmbedActivity(state, deps);
    return;
  }

  await enableEnvoyLocalEmbedViaRuntime(state, deps);
  if (!(await confirmEnvoyLocalEmbedInferenceReady(state, deps))) {
    noteEnvoyLocalEmbedActivity(state, deps);
    throw new Error(
      state.lastError ??
        "Envoy Local embed still unhealthy after enable (/v1/embeddings)",
    );
  }
  noteEnvoyLocalEmbedActivity(state, deps);
}

export async function disableEnvoyLocalEmbedViaRuntime(
  state: EnvoyLocalEmbedRuntimeState,
  deps: EnvoyLocalEmbedRuntimeDeps,
): Promise<EnvoyLocalEmbedStatus> {
  state.abort?.abort();
  await stopEmbedListenerHard(state);
  await deps.saveEnvoyLocalEmbedConfig({ enabled: false });
  state.phase = "disabled";
  state.download = null;
  return getEnvoyLocalEmbedStatusViaRuntime(state, deps);
}

/**
 * On every node/Tauri launch: if Knowledge uses Envoy Local embed and llama.cpp
 * and/or the embed GGUF are missing, download them and start the **embed**
 * sidecar on :18791. Independent of the chat Local process on :18790.
 * No-op when the user picked cloud/Ollama/mock embeddings, or disabled embed.
 */
export async function maybeStartEnvoyLocalEmbedOnBootViaRuntime(
  state: EnvoyLocalEmbedRuntimeState,
  deps: EnvoyLocalEmbedRuntimeDeps,
): Promise<void> {
  const should =
    deps.shouldAutoProvisionEmbed == null
      ? true
      : await deps.shouldAutoProvisionEmbed();
  if (!should) return;

  const cfg = normalizeEnvoyLocalEmbedConfig(await deps.loadEnvoyLocalEmbedConfig());
  // Honor explicit disable (Setup → stop embed / disable). Default enabled is true.
  if (!cfg.enabled) return;

  // Already listening — confirm embeddings work, arm watchdog for orphans,
  // then notify once so boot RAG reindex (often raced ahead of :18791) runs.
  try {
    const st = await getEnvoyLocalEmbedStatusViaRuntime(state, deps);
    if (st.running) {
      let healthy = await confirmEnvoyLocalEmbedInferenceReady(state, deps);
      if (!healthy) {
        console.warn(
          "[envoy-local-embed] boot: /v1/models OK but /v1/embeddings failed — restarting",
        );
        await restartEmbedSidecarFromWatchdog(
          state,
          deps,
          "maybeStartEnvoyLocalEmbedOnBoot: embeddings probe failed",
        );
        healthy = await confirmEnvoyLocalEmbedInferenceReady(state, deps);
      }
      if (!state.watchdog) {
        armEmbedWatchdog(state, deps);
      }
      noteEnvoyLocalEmbedActivity(state, deps);
      if (!healthy) {
        console.warn(
          "[envoy-local-embed] boot: embed still unhealthy after restart — skipping onEmbedReady",
        );
        return;
      }
      await notifyEmbedReady(state, deps);
      return;
    }
  } catch {
    /* continue to provision */
  }

  await enableEnvoyLocalEmbedViaRuntime(state, deps);
}

export async function haltEnvoyLocalEmbedChildViaRuntime(
  state: EnvoyLocalEmbedRuntimeState,
): Promise<void> {
  state.abort?.abort();
  await stopEmbedListenerHard(state);
  state.phase = "idle";
  state.embedReadyNotified = false;
}
