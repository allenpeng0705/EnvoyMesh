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
  detectEnvoyLocalModelRegion,
  resolveEnvoyLocalModelDownloadUrls,
} from "./envoy-local-mirrors.js";
import { detectEnvoyLocalPlatform } from "./envoy-local-platform.js";
import {
  createEnvoyLocalRuntimeState,
  ensureEnvoyLocalSharedRuntimeBinary,
  type EnvoyLocalRuntimeState,
} from "./envoy-local-runtime.js";
import { buildEnvoyLocalLlamaServerArgs } from "./envoy-local-server-args.js";
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
}

export type EnvoyLocalEmbedRuntimeState = EnvoyLocalRuntimeState;

export function createEnvoyLocalEmbedRuntimeState(): EnvoyLocalEmbedRuntimeState {
  return createEnvoyLocalRuntimeState();
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
    const region = detectEnvoyLocalModelRegion();
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

async function stopChild(state: EnvoyLocalEmbedRuntimeState): Promise<void> {
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

async function probeModels(endpoint: string): Promise<boolean> {
  try {
    const res = await fetch(`${endpoint.replace(/\/$/, "")}/models`, {
      method: "GET",
      signal: AbortSignal.timeout(3_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function armEmbedWatchdog(
  state: EnvoyLocalEmbedRuntimeState,
  deps: EnvoyLocalEmbedRuntimeDeps,
): void {
  if (state.watchdog) clearInterval(state.watchdog);
  state.consecutiveHealthFailures = 0;
  state.watchdog = setInterval(() => {
    void (async () => {
      const endpoint = envoyLocalEmbedOpenAiBaseUrl(ENVOY_LOCAL_EMBED_PORT);
      const ok = await probeModels(endpoint);
      if (ok) {
        state.consecutiveHealthFailures = 0;
        return;
      }
      state.consecutiveHealthFailures += 1;
      if (state.consecutiveHealthFailures < 5) return;
      state.consecutiveHealthFailures = 0;
      const cfg = normalizeEnvoyLocalEmbedConfig(await deps.loadEnvoyLocalEmbedConfig());
      if (!cfg.enabled) return;
      if (state.enablePromise) return;
      try {
        await stopChild(state);
        await startEmbedSidecar(state, deps);
      } catch (err) {
        setError(state, err instanceof Error ? err.message : String(err));
      }
    })();
  }, 12_000);
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
  // Orphan from a previous node process — reuse instead of failing on bind.
  if (await probeModels(endpoint)) {
    state.phase = "ready";
    state.download = null;
    state.lastError = null;
    armEmbedWatchdog(state, deps);
    return;
  }

  await stopChild(state);

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
    if (await probeModels(endpoint)) {
      state.phase = "ready";
      state.download = null;
      state.lastError = null;
      armEmbedWatchdog(state, deps);
      return;
    }
    if (!state.child) {
      throw new Error(state.lastError ?? "embed llama-server failed to start");
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  await stopChild(state);
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
  const probed = await probeModels(endpoint);
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

      await ensureEnvoyLocalSharedRuntimeBinary(
        state,
        profileDir,
        platform,
        abort.signal,
      );

      const catalog =
        getEnvoyLocalEmbedCatalogModel(params?.modelId) ?? DEFAULT_ENVOY_LOCAL_EMBED_MODEL;
      if (params?.skipModelDownload !== true) {
        await downloadEmbedModel(state, profileDir, catalog, abort.signal);
      } else {
        const index = await loadEmbedIndex(profileDir);
        const existing = index.models.find((m) => m.id === catalog.id);
        if (!existing || !(await fileExists(existing.path))) {
          await downloadEmbedModel(state, profileDir, catalog, abort.signal);
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
  await stopChild(state);
  state.phase = "idle";
  state.download = null;
  return getEnvoyLocalEmbedStatusViaRuntime(state, deps);
}

export async function disableEnvoyLocalEmbedViaRuntime(
  state: EnvoyLocalEmbedRuntimeState,
  deps: EnvoyLocalEmbedRuntimeDeps,
): Promise<EnvoyLocalEmbedStatus> {
  state.abort?.abort();
  await stopChild(state);
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

  // Already healthy — nothing to download.
  try {
    const st = await getEnvoyLocalEmbedStatusViaRuntime(state, deps);
    if (st.running) return;
  } catch {
    /* continue to provision */
  }

  await enableEnvoyLocalEmbedViaRuntime(state, deps);
}

export async function haltEnvoyLocalEmbedChildViaRuntime(
  state: EnvoyLocalEmbedRuntimeState,
): Promise<void> {
  state.abort?.abort();
  await stopChild(state);
}
