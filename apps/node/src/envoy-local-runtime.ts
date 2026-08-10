/**
 * Envoy Local sidecar — download llama-server + default GGUF, spawn, watchdog (Phase 54).
 * Binaries/models are never packaged; everything lives under `{profileDir}/envoy-local/`.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { chmod, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import {
  DEFAULT_ENVOY_LOCAL_SERVER_PARAMS,
  hasUsableNonEnvoyLocalModelProvider,
  resolveEnvoyLocalServerParams,
  type DownloadEnvoyLocalModelParams,
  type EnableEnvoyLocalParams,
  type EnvoyLocalCatalogModel,
  type EnvoyLocalConfig,
  type EnvoyLocalDownloadProgress,
  type EnvoyLocalEngineUpdateInfo,
  type EnvoyLocalInstalledModel,
  type EnvoyLocalPhase,
  type EnvoyLocalServerParams,
  type EnvoyLocalStatus,
  type ModelProviderConfig,
  type SearchEnvoyLocalModelsResult,
  type SetEnvoyLocalDownloadRegionParams,
  normalizeEnvoyLocalConfig,
} from "@envoymesh/api";
import {
  findCuratedSuccessor,
  getEnvoyLocalCatalogModelByFileName,
  getEnvoyLocalCatalogModelRaw,
  searchEnvoyLocalCatalog,
} from "./envoy-local-catalog.js";
import {
  resolveEnvoyLocalDownloadModel,
  searchHuggingFaceGgufs,
} from "./envoy-local-hf.js";
import {
  detectEnvoyLocalHardware,
  recommendEnvoyLocalModel,
} from "./envoy-local-hw.js";
import {
  detectEnvoyLocalModelRegion,
  normalizeEnvoyLocalDownloadRegionPreference,
  resolveEnvoyLocalDownloadRegion,
  resolveEnvoyLocalModelDownloadUrls,
  resolveEnvoyLocalRuntimeDownloadUrls,
  type EnvoyLocalModelRegion,
} from "./envoy-local-mirrors.js";
import {
  downloadFile,
  ensureMinFreeBytes,
  extractArchive,
  fileExists,
  findExecutable,
  sha256File,
  verifyGgufFile,
} from "./envoy-local-download.js";
import {
  assertEnvoyLocalSha256,
  ENVOY_LOCAL_MIN_FREE_BYTES,
  ENVOY_LOCAL_MIN_MODEL_BYTES,
  ENVOY_LOCAL_MIN_RUNTIME_ARCHIVE_BYTES,
  ENVOY_LOCAL_LLAMA_CPP_TAG,
  resolveEnvoyLocalRuntimeAssets,
  resolveStartupTimeoutMs,
} from "./envoy-local-manifest.js";
import {
  buildEnvoyLocalLlamaServerArgs,
} from "./envoy-local-server-args.js";
import {
  DEFAULT_ENVOY_LOCAL_MODEL,
  detectEnvoyLocalPlatform,
  type EnvoyLocalPlatform,
} from "./envoy-local-platform.js";
import { ENVOY_LOCAL_PORT, envoyLocalOpenAiBaseUrl } from "./service-ports.js";

export interface EnvoyLocalRuntimeDeps {
  getProfileDir: () => string;
  loadEnvoyLocalConfig: () => Promise<EnvoyLocalConfig | undefined>;
  saveEnvoyLocalConfig: (patch: EnvoyLocalConfig) => Promise<void>;
  /**
   * Formerly wired Settings → AI to the envoy-local preset. Now a no-op:
   * cloud/Ollama stay in modelProviders; inference prefers Local when running.
   * Kept so call sites can still await a hook (e.g. future analytics).
   */
  wireModelProviders: (endpoint: string, modelName: string) => Promise<void>;
  /** Best-effort OpenClaw reload after provider / Local start-stop change. */
  reloadOpenClaw?: () => Promise<void>;
  /** Current Settings → AI modelProviders (cloud/Ollama; not overwritten by Local). */
  loadModelProviders?: () => Promise<ModelProviderConfig | undefined>;
  /**
   * One-time migration: clear a leftover `presetId: envoy-local` from older
   * builds that overwrote cloud settings. Prefer restoring
   * `fallbackModelProviders` when present.
   */
  clearEnvoyLocalModelProviders?: () => Promise<void>;
  /**
   * Restore `envoyLocal.fallbackModelProviders` into Settings → AI
   * (migration helper for older installs).
   */
  restoreFallbackModelProviders?: () => Promise<void>;
}

export interface EnvoyLocalRuntimeState {
  phase: EnvoyLocalPhase;
  platform?: EnvoyLocalPlatform;
  child: ChildProcess | null;
  childPid?: number;
  lastError: string | null;
  lastErrorAt: string | null;
  download: EnvoyLocalDownloadProgress | null;
  enablePromise: Promise<EnvoyLocalStatus> | null;
  abort: AbortController | null;
  watchdog: ReturnType<typeof setInterval> | null;
  consecutiveHealthFailures: number;
  /** Soft note after automatic CUDA→CPU (or GPU→CPU) fallback. */
  accelFallbackNote: string | null;
}

export function createEnvoyLocalRuntimeState(): EnvoyLocalRuntimeState {
  return {
    phase: "idle",
    child: null,
    lastError: null,
    lastErrorAt: null,
    download: null,
    enablePromise: null,
    abort: null,
    watchdog: null,
    consecutiveHealthFailures: 0,
    accelFallbackNote: null,
  };
}

function rootDir(profileDir: string): string {
  // Always absolute so llama-server (spawned with runtime cwd) can open models.
  return resolve(profileDir, "envoy-local");
}

async function loadDownloadRegion(
  deps: EnvoyLocalRuntimeDeps,
): Promise<EnvoyLocalModelRegion> {
  const cfg = normalizeEnvoyLocalConfig(await deps.loadEnvoyLocalConfig());
  return resolveEnvoyLocalDownloadRegion({ preference: cfg.downloadRegion });
}

function runtimeDir(profileDir: string): string {
  return join(rootDir(profileDir), "runtime", ENVOY_LOCAL_LLAMA_CPP_TAG);
}

function modelsDir(profileDir: string): string {
  return join(rootDir(profileDir), "models");
}

function modelsIndexPath(profileDir: string): string {
  return join(rootDir(profileDir), "models.json");
}

type IndexedModel = {
  id: string;
  fileName: string;
  path: string;
  sizeBytes?: number;
  sha256?: string;
  /** llama-server `--chat-template` when required (e.g. Gemma 4). */
  chatTemplate?: string;
};

interface ModelsIndex {
  activeModelId?: string;
  models: IndexedModel[];
}

async function loadModelsIndex(profileDir: string): Promise<ModelsIndex> {
  try {
    const raw = await readFile(modelsIndexPath(profileDir), "utf8");
    const parsed = JSON.parse(raw) as ModelsIndex;
    if (!parsed || !Array.isArray(parsed.models)) return { models: [] };
    return parsed;
  } catch {
    return { models: [] };
  }
}

async function saveModelsIndex(profileDir: string, index: ModelsIndex): Promise<void> {
  await mkdir(rootDir(profileDir), { recursive: true });
  await writeFile(modelsIndexPath(profileDir), JSON.stringify(index, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
}

function localModelIdFromFileName(fileName: string): string {
  const curated = getEnvoyLocalCatalogModelByFileName(fileName);
  if (curated) return curated.id;
  const base = basename(fileName).replace(/\.gguf$/i, "");
  const slug = base
    .replace(/[^a-zA-Z0-9._+-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `local:${slug || "model"}`;
}

async function usableModelsFromIndex(index: ModelsIndex): Promise<IndexedModel[]> {
  const out: IndexedModel[] = [];
  for (const m of index.models) {
    if (m.path && (await fileExists(m.path))) out.push(m);
  }
  return out;
}

/**
 * Pick the active model: preferred id if present on disk, else the only model,
 * else index.activeModelId. Never falls back to a hardcoded catalog default.
 */
function resolveActiveModel(
  usable: IndexedModel[],
  preferredIds: Array<string | undefined | null>,
): IndexedModel | null {
  if (usable.length === 0) return null;
  for (const id of preferredIds) {
    const want = typeof id === "string" ? id.trim() : "";
    if (!want) continue;
    const hit = usable.find((m) => m.id === want);
    if (hit) return hit;
  }
  if (usable.length === 1) return usable[0]!;
  return null;
}

/**
 * Discover `*.gguf` files under `{profile}/envoy-local/models/`, merge into
 * models.json, drop missing entries, and auto-select when exactly one model.
 */
async function scanAndReconcileModelsIndex(profileDir: string): Promise<ModelsIndex> {
  const dir = modelsDir(profileDir);
  await mkdir(dir, { recursive: true });
  const previous = await loadModelsIndex(profileDir);
  const byPath = new Map(previous.models.map((m) => [m.path, m]));
  const byName = new Map(
    previous.models.map((m) => [m.fileName.toLowerCase(), m]),
  );

  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    names = [];
  }

  const nextModels: IndexedModel[] = [];
  for (const name of names) {
    const lower = name.toLowerCase();
    if (!lower.endsWith(".gguf")) continue;
    if (name.startsWith(".")) continue;
    if (lower.endsWith(".part")) continue;
    const path = join(dir, name);
    let sizeBytes: number | undefined;
    try {
      const st = await stat(path);
      if (!st.isFile()) continue;
      sizeBytes = st.size;
    } catch {
      continue;
    }

    const existing = byPath.get(path) ?? byName.get(lower);
    if (existing) {
      nextModels.push({
        ...existing,
        fileName: name,
        path,
        ...(sizeBytes != null ? { sizeBytes } : {}),
      });
      continue;
    }

    try {
      await verifyGgufFile(path);
    } catch {
      // Skip corrupt / non-GGUF drops; user can fix or remove.
      continue;
    }

    const curated = getEnvoyLocalCatalogModelByFileName(name);
    nextModels.push({
      id: curated?.id ?? localModelIdFromFileName(name),
      fileName: name,
      path,
      ...(sizeBytes != null ? { sizeBytes } : {}),
      ...(curated?.chatTemplate ? { chatTemplate: curated.chatTemplate } : {}),
    });
  }

  let activeModelId = previous.activeModelId;
  if (activeModelId && !nextModels.some((m) => m.id === activeModelId)) {
    activeModelId = undefined;
  }
  if (!activeModelId && nextModels.length === 1) {
    activeModelId = nextModels[0]!.id;
  }

  const next: ModelsIndex = {
    ...(activeModelId ? { activeModelId } : {}),
    models: nextModels,
  };

  if (JSON.stringify(previous) !== JSON.stringify(next)) {
    await saveModelsIndex(profileDir, next);
  }
  return next;
}

async function ensureActiveModelPersisted(
  deps: EnvoyLocalRuntimeDeps,
  profileDir: string,
  index: ModelsIndex,
  model: IndexedModel,
): Promise<void> {
  const cfg = normalizeEnvoyLocalConfig(await deps.loadEnvoyLocalConfig());
  const needsIndex = index.activeModelId !== model.id;
  const needsCfg = cfg.activeModelId !== model.id;
  if (needsIndex) {
    await saveModelsIndex(profileDir, { ...index, activeModelId: model.id });
  }
  if (needsCfg) {
    await deps.saveEnvoyLocalConfig({ activeModelId: model.id });
  }
}

async function probeOpenAiModels(endpoint: string): Promise<boolean> {
  try {
    const res = await fetch(`${endpoint.replace(/\/$/, "")}/models`, {
      signal: AbortSignal.timeout(2_500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function setError(state: EnvoyLocalRuntimeState, message: string): void {
  state.phase = "error";
  state.lastError = message;
  state.lastErrorAt = new Date().toISOString();
  state.download = {
    phase: "error",
    label: message,
  };
}

function setProgress(
  state: EnvoyLocalRuntimeState,
  progress: EnvoyLocalDownloadProgress,
): void {
  state.phase = progress.phase;
  state.download = progress;
}

export async function getEnvoyLocalStatusViaRuntime(
  state: EnvoyLocalRuntimeState,
  deps: EnvoyLocalRuntimeDeps,
): Promise<EnvoyLocalStatus> {
  const cfg = normalizeEnvoyLocalConfig(await deps.loadEnvoyLocalConfig());
  const profileDir = deps.getProfileDir();
  const platform = state.platform ?? detectEnvoyLocalPlatform();
  const endpoint = envoyLocalOpenAiBaseUrl(ENVOY_LOCAL_PORT);
  const exeName = process.platform === "win32" ? "llama-server.exe" : "llama-server";
  const exePath = await findExecutable(runtimeDir(profileDir), [exeName]);
  const index = await scanAndReconcileModelsIndex(profileDir);
  const usable = await usableModelsFromIndex(index);
  const active =
    resolveActiveModel(usable, [cfg.activeModelId, index.activeModelId]) ??
    null;
  const running =
    Boolean(state.child?.pid) &&
    !state.child?.killed &&
    (await probeOpenAiModels(endpoint));

  const inFlightPhases = new Set<EnvoyLocalPhase>([
    "detecting",
    "downloading-runtime",
    "extracting-runtime",
    "downloading-model",
    "starting",
  ]);
  const operationInProgress =
    Boolean(state.enablePromise) ||
    (state.abort != null && inFlightPhases.has(state.phase));

  let phase = state.phase;
  // Recover sticky in-flight phases after cancel/crash left no active operation
  // (otherwise Settings disables "Download & enable" forever).
  if (!operationInProgress && !running && inFlightPhases.has(phase)) {
    if (state.lastError) {
      phase = "error";
      state.phase = "error";
    } else if (cfg.enabled) {
      phase = "idle";
      state.phase = "idle";
      state.download = null;
    } else {
      phase = "disabled";
      state.phase = "disabled";
      state.download = null;
    }
  }
  // Never mask an in-flight download/start behind "ready" just because the
  // current sidecar is still serving — Settings needs the real phase + progress.
  if (operationInProgress) {
    phase = state.phase;
  } else if (cfg.enabled && running) {
    phase = "ready";
  } else if (!cfg.enabled && phase === "idle") {
    phase = "disabled";
  }

  const recommendation = recommendEnvoyLocalModel(detectEnvoyLocalHardware(platform));
  const recommendedCatalog =
    getEnvoyLocalCatalogModelRaw(recommendation.modelId) ??
    getEnvoyLocalCatalogModelRaw(DEFAULT_ENVOY_LOCAL_MODEL.id);
  const hasInstalledModel = usable.length > 0;
  const modelProviders = deps.loadModelProviders
    ? await deps.loadModelProviders()
    : undefined;
  const externalProvider = hasUsableNonEnvoyLocalModelProvider(modelProviders);
  const needsDownload = !exePath || !hasInstalledModel;
  const suggestAutoProvision =
    !externalProvider &&
    needsDownload &&
    cfg.autoProvisionDeclined !== true &&
    !operationInProgress;
  const downloadRegionPreference = normalizeEnvoyLocalDownloadRegionPreference(
    cfg.downloadRegion,
  );
  const modelDownloadRegion = resolveEnvoyLocalDownloadRegion({
    preference: downloadRegionPreference,
  });

  return {
    enabled: cfg.enabled,
    running,
    phase,
    port: ENVOY_LOCAL_PORT,
    endpoint,
    accel: platform.accel,
    runtimeVersion: cfg.runtimeVersion ?? (exePath ? ENVOY_LOCAL_LLAMA_CPP_TAG : undefined),
    runtimeInstalled: Boolean(exePath),
    activeModelId: active?.id,
    activeModelPath: active?.path,
    modelsDir: modelsDir(profileDir),
    childPid: state.child?.pid ?? state.childPid,
    lastError: state.lastError,
    lastErrorAt: state.lastErrorAt,
    download: state.download,
    serverParams: resolveEnvoyLocalServerParams(cfg.serverParams),
    modelDownloadRegion,
    downloadRegionPreference,
    pinnedRuntimeVersion: ENVOY_LOCAL_LLAMA_CPP_TAG,
    accelFallbackNote: state.accelFallbackNote,
    operationInProgress,
    hardwareSummary: recommendation.hardware.summary,
    recommendedModelId: recommendation.modelId,
    recommendedModelLabel: recommendedCatalog?.label,
    recommendedModelApproxBytes: recommendedCatalog?.approxBytes,
    recommendedModelReason: recommendation.reason,
    suggestAutoProvision,
    canStop: running,
  };
}

function hostLabelForUrl(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

async function downloadFileWithFailover(params: {
  candidates: string[];
  destPath: string;
  signal: AbortSignal;
  label: string;
  onAttempt: (url: string) => void;
  onProgress: (p: { bytesReceived: number; bytesTotal?: number }, url: string) => void;
}): Promise<void> {
  if (params.candidates.length === 0) {
    throw new Error(`No download candidates for ${params.label}`);
  }
  let lastErr: unknown;
  for (const url of params.candidates) {
    params.onAttempt(url);
    try {
      // Wipe `dest` (rename at the end will overwrite it anyway; this is
      // belt-and-suspenders for the corrupt-dest-from-previous-attempt
      // case). Do NOT wipe `.part` — downloadFile stats it to decide
      // whether to send a Range header for HTTP resume, and wiping here
      // would defeat that on every mirror failover.
      await rm(params.destPath, { force: true });
      await downloadFile({
        url,
        destPath: params.destPath,
        signal: params.signal,
        onProgress: (p) => params.onProgress(p, url),
      });
      return;
    } catch (err) {
      lastErr = err;
      // Keep `.part` so the next mirror (or the user's retry) can resume
      // from the partial bytes we already have on disk. All our mirror
      // chains (ModelScope → hf-mirror → direct; GitHub → ghproxy →
      // ghfast → direct) serve the same canonical bytes, so cross-mirror
      // resume is safe here. The size sanity / sha256 / GGUF magic
      // checks downstream catch any real corruption.
      await rm(params.destPath, { force: true });
      if (params.signal.aborted) throw err;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`Failed to download ${params.label} from any mirror`);
}

async function ensureRuntimeInstalled(
  state: EnvoyLocalRuntimeState,
  profileDir: string,
  platform: EnvoyLocalPlatform,
  signal: AbortSignal,
  opts?: { force?: boolean; region?: EnvoyLocalModelRegion },
): Promise<string> {
  const exeName = process.platform === "win32" ? "llama-server.exe" : "llama-server";
  const destRoot = runtimeDir(profileDir);
  if (opts?.force) {
    await rm(destRoot, { recursive: true, force: true });
  } else {
    const existing = await findExecutable(destRoot, [exeName]);
    if (existing) return existing;
  }

  await mkdir(rootDir(profileDir), { recursive: true });
  await ensureMinFreeBytes(rootDir(profileDir), ENVOY_LOCAL_MIN_FREE_BYTES);

  const assets = resolveEnvoyLocalRuntimeAssets(platform);
  const region = opts?.region ?? detectEnvoyLocalModelRegion();
  const archivesDir = join(rootDir(profileDir), "archives");
  await mkdir(archivesDir, { recursive: true });
  const archivePath = join(archivesDir, assets.runtimeName);

  setProgress(state, {
    phase: "downloading-runtime",
    label: `Downloading ${assets.runtimeName}`,
    fraction: 0,
  });

  if (!(await fileExists(archivePath))) {
    const candidates = resolveEnvoyLocalRuntimeDownloadUrls(assets.runtimeUrl, {
      region,
      assetKind: "runtime",
    });
    await downloadFileWithFailover({
      candidates,
      destPath: archivePath,
      signal,
      label: assets.runtimeName,
      onAttempt: (url) => {
        setProgress(state, {
          phase: "downloading-runtime",
          label: `Downloading ${assets.runtimeName} (${hostLabelForUrl(url)})`,
          fraction: 0,
        });
      },
      onProgress: (p, url) => {
        setProgress(state, {
          phase: "downloading-runtime",
          label: `Downloading ${assets.runtimeName} (${hostLabelForUrl(url)})`,
          bytesReceived: p.bytesReceived,
          bytesTotal: p.bytesTotal,
          fraction:
            p.bytesTotal && p.bytesTotal > 0
              ? Math.min(0.99, p.bytesReceived / p.bytesTotal)
              : undefined,
        });
      },
    });
  }

  const st = await stat(archivePath);
  if (st.size < ENVOY_LOCAL_MIN_RUNTIME_ARCHIVE_BYTES) {
    throw new Error(`Runtime archive too small (${st.size} bytes)`);
  }
  if (assets.runtimeSha256) {
    const digest = await sha256File(archivePath);
    assertEnvoyLocalSha256(digest, assets.runtimeSha256, assets.runtimeName);
  }

  setProgress(state, {
    phase: "extracting-runtime",
    label: "Extracting llama-server",
    fraction: 0.5,
  });
  await mkdir(destRoot, { recursive: true });
  await extractArchive({ archivePath, destDir: destRoot });

  if (assets.cudartUrl && assets.cudartName) {
    const cudartPath = join(archivesDir, assets.cudartName);
    setProgress(state, {
      phase: "downloading-runtime",
      label: `Downloading ${assets.cudartName}`,
    });
    if (!(await fileExists(cudartPath))) {
      const candidates = resolveEnvoyLocalRuntimeDownloadUrls(assets.cudartUrl, {
        region,
        assetKind: "cudart",
      });
      await downloadFileWithFailover({
        candidates,
        destPath: cudartPath,
        signal,
        label: assets.cudartName,
        onAttempt: (url) => {
          setProgress(state, {
            phase: "downloading-runtime",
            label: `Downloading ${assets.cudartName} (${hostLabelForUrl(url)})`,
          });
        },
        onProgress: (p, url) => {
          setProgress(state, {
            phase: "downloading-runtime",
            label: `Downloading ${assets.cudartName} (${hostLabelForUrl(url)})`,
            bytesReceived: p.bytesReceived,
            bytesTotal: p.bytesTotal,
            fraction:
              p.bytesTotal && p.bytesTotal > 0
                ? Math.min(0.99, p.bytesReceived / p.bytesTotal)
                : undefined,
          });
        },
      });
    }
    if (assets.cudartSha256) {
      const digest = await sha256File(cudartPath);
      assertEnvoyLocalSha256(digest, assets.cudartSha256, assets.cudartName);
    }
    await extractArchive({ archivePath: cudartPath, destDir: destRoot });
  }

  const exe = await findExecutable(destRoot, [exeName]);
  if (!exe) {
    throw new Error(`llama-server not found after extracting ${assets.runtimeName}`);
  }
  if (process.platform !== "win32") {
    await chmod(exe, 0o755);
  }
  return exe;
}

async function downloadCatalogModel(
  state: EnvoyLocalRuntimeState,
  profileDir: string,
  catalog: EnvoyLocalCatalogModel,
  signal: AbortSignal,
  opts?: { setActive?: boolean; region?: EnvoyLocalModelRegion },
): Promise<{ id: string; path: string }> {
  const index = await loadModelsIndex(profileDir);
  const existing = index.models.find((m) => m.id === catalog.id);
  if (existing && (await fileExists(existing.path))) {
    const needsTemplate =
      Boolean(catalog.chatTemplate) && !existing.chatTemplate;
    if (opts?.setActive || needsTemplate) {
      const nextModels = needsTemplate
        ? index.models.map((m) =>
            m.id === catalog.id
              ? { ...m, chatTemplate: catalog.chatTemplate }
              : m,
          )
        : index.models;
      await saveModelsIndex(profileDir, {
        ...index,
        models: nextModels,
        ...(opts?.setActive ? { activeModelId: catalog.id } : {}),
      });
    }
    return { id: existing.id, path: existing.path };
  }

  const dest = join(modelsDir(profileDir), catalog.fileName);
  if (!(await fileExists(dest))) {
    await mkdir(modelsDir(profileDir), { recursive: true });
    await ensureMinFreeBytes(
      rootDir(profileDir),
      Math.max(ENVOY_LOCAL_MIN_FREE_BYTES, catalog.approxBytes + 100_000_000),
    );

    const region = opts?.region ?? detectEnvoyLocalModelRegion();
    const candidates = resolveEnvoyLocalModelDownloadUrls(catalog, region);
    let lastErr: unknown;
    for (let i = 0; i < candidates.length; i++) {
      const url = candidates[i]!;
      const hostLabel = (() => {
        try {
          return new URL(url).host;
        } catch {
          return url;
        }
      })();
      setProgress(state, {
        phase: "downloading-model",
        label: `Downloading ${catalog.fileName} (${hostLabel})`,
        fraction: 0,
      });
      try {
        // Wipe `dest` only — the rename at the end of downloadFile will
        // overwrite it. Do NOT wipe `.part`; downloadFile reads its size
        // to send a Range header for resume, and wiping here would
        // discard the user's previous progress.
        await rm(dest, { force: true });
        await downloadFile({
          url,
          destPath: dest,
          signal,
          onProgress: (p) => {
            setProgress(state, {
              phase: "downloading-model",
              label: `Downloading ${catalog.fileName} (${hostLabel})`,
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
        // Keep `.part` for resume on the next mirror or user retry.
        // See downloadFileWithFailover for the rationale on cross-mirror
        // safety (all candidates serve the same canonical bytes).
        await rm(dest, { force: true });
        if (signal.aborted) throw err;
        // Try next mirror (China: ModelScope → hf-mirror).
      }
    }
    if (lastErr) {
      const base = lastErr instanceof Error ? lastErr.message : String(lastErr);
      if (region === "global" && /fetch failed/i.test(base)) {
        throw new Error(
          `${base}. Hugging Face may be unreachable from this network — ` +
            "switch Model download region to China (ModelScope → hf-mirror) in Settings → AI → Envoy Local, then retry.",
        );
      }
      throw lastErr instanceof Error ? lastErr : new Error(base);
    }
    if (!(await fileExists(dest))) {
      throw new Error(`Failed to download ${catalog.fileName} from any mirror`);
    }
  }

  const st = await stat(dest);
  if (st.size < ENVOY_LOCAL_MIN_MODEL_BYTES) {
    throw new Error(`Model file too small (${st.size} bytes)`);
  }
  // Defense-in-depth: GGUF magic + size sanity (catalog has no sha256 for
  // most curated entries today). Catches HTML error pages, truncated mirrors,
  // and zip-bomb style padding before sha256 runs on a multi-GB file.
  try {
    await verifyGgufFile(dest, { expectedApproxBytes: catalog.approxBytes });
  } catch (err) {
    await rm(dest, { force: true });
    throw err;
  }
  let digest: string | undefined;
  if (catalog.sha256) {
    digest = await sha256File(dest);
    try {
      assertEnvoyLocalSha256(digest, catalog.sha256, catalog.fileName);
    } catch (err) {
      await rm(dest, { force: true });
      throw err;
    }
  }

  const entry = {
    id: catalog.id,
    fileName: catalog.fileName,
    path: dest,
    sizeBytes: st.size,
    ...(digest ? { sha256: digest } : {}),
    ...(catalog.chatTemplate ? { chatTemplate: catalog.chatTemplate } : {}),
  };
  const next: ModelsIndex = {
    activeModelId: opts?.setActive === false ? index.activeModelId : catalog.id,
    models: [...index.models.filter((m) => m.id !== catalog.id), entry],
  };
  await saveModelsIndex(profileDir, next);
  return { id: catalog.id, path: dest };
}

async function ensureDefaultModel(
  state: EnvoyLocalRuntimeState,
  profileDir: string,
  signal: AbortSignal,
  skipDownload: boolean,
  region?: EnvoyLocalModelRegion,
  deps?: EnvoyLocalRuntimeDeps,
): Promise<{ id: string; path: string }> {
  const platform = state.platform ?? detectEnvoyLocalPlatform();
  state.platform = platform;
  const recommendation = recommendEnvoyLocalModel(detectEnvoyLocalHardware(platform));
  const preferredId = recommendation.modelId;
  const catalog =
    getEnvoyLocalCatalogModelRaw(preferredId) ??
    getEnvoyLocalCatalogModelRaw(DEFAULT_ENVOY_LOCAL_MODEL.id);
  if (!catalog) throw new Error("Default Envoy Local catalog entry missing");

  const index = await scanAndReconcileModelsIndex(profileDir);
  const usable = await usableModelsFromIndex(index);
  if (usable.length > 0) {
    const cfgActive = deps
      ? normalizeEnvoyLocalConfig(await deps.loadEnvoyLocalConfig()).activeModelId
      : undefined;
    const preferredOrder = [
      cfgActive,
      index.activeModelId,
      preferredId,
      ...recommendation.alsoRecommendedModelIds,
      DEFAULT_ENVOY_LOCAL_MODEL.id,
    ];
    const picked =
      resolveActiveModel(usable, preferredOrder) ??
      // Multiple models, no preference: keep first usable (user can Set active).
      usable[0]!;
    if (deps) {
      await ensureActiveModelPersisted(deps, profileDir, index, picked);
    } else if (index.activeModelId !== picked.id) {
      await saveModelsIndex(profileDir, { ...index, activeModelId: picked.id });
    }
    return { id: picked.id, path: picked.path };
  }

  if (skipDownload) {
    throw new Error(
      `No local model in ${modelsDir(profileDir)} and skipModelDownload was set`,
    );
  }
  setProgress(state, {
    phase: "downloading-model",
    label: `Recommended: ${catalog.label} (${recommendation.hardware.summary})`,
    fraction: 0,
  });
  return downloadCatalogModel(state, profileDir, catalog, signal, {
    setActive: true,
    region,
  });
}

async function stopChild(state: EnvoyLocalRuntimeState): Promise<void> {
  if (state.watchdog) {
    clearInterval(state.watchdog);
    state.watchdog = null;
  }
  const child = state.child;
  state.child = null;
  state.childPid = undefined;
  if (!child?.pid) return;

  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    child.once("exit", finish);
    try {
      child.kill("SIGTERM");
    } catch {
      finish();
      return;
    }
    setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      finish();
    }, 4_000).unref?.();
  });
}

function armWatchdog(
  state: EnvoyLocalRuntimeState,
  deps: EnvoyLocalRuntimeDeps,
): void {
  if (state.watchdog) clearInterval(state.watchdog);
  state.watchdog = setInterval(() => {
    void (async () => {
      const endpoint = envoyLocalOpenAiBaseUrl(ENVOY_LOCAL_PORT);
      const ok = await probeOpenAiModels(endpoint);
      if (ok) {
        state.consecutiveHealthFailures = 0;
        return;
      }
      state.consecutiveHealthFailures += 1;
      if (state.consecutiveHealthFailures < 5) return;
      state.consecutiveHealthFailures = 0;
      const cfg = normalizeEnvoyLocalConfig(await deps.loadEnvoyLocalConfig());
      if (!cfg.enabled) return;
      try {
        await stopChild(state);
        await startSidecar(state, deps);
      } catch (err) {
        setError(state, err instanceof Error ? err.message : String(err));
      }
    })();
  }, 12_000);
  state.watchdog.unref?.();
}

async function startSidecarOnce(
  state: EnvoyLocalRuntimeState,
  deps: EnvoyLocalRuntimeDeps,
  opts: { forceCpu: boolean },
): Promise<void> {
  const profileDir = deps.getProfileDir();
  const cfg = normalizeEnvoyLocalConfig(await deps.loadEnvoyLocalConfig());
  const platform = state.platform ?? detectEnvoyLocalPlatform();
  state.platform = platform;
  const serverParams = {
    ...DEFAULT_ENVOY_LOCAL_SERVER_PARAMS,
    ...(cfg.serverParams ?? {}),
  };

  const exeName = process.platform === "win32" ? "llama-server.exe" : "llama-server";
  const exe = await findExecutable(runtimeDir(profileDir), [exeName]);
  if (!exe) throw new Error("llama-server binary missing — enable Envoy Local again");

  const index = await scanAndReconcileModelsIndex(profileDir);
  const usable = await usableModelsFromIndex(index);
  const model = resolveActiveModel(usable, [
    cfg.activeModelId,
    index.activeModelId,
  ]);
  if (!model) {
    throw new Error(
      `No usable local model in ${modelsDir(profileDir)} — download one from the catalog or copy a .gguf file there`,
    );
  }
  await ensureActiveModelPersisted(deps, profileDir, index, model);

  const chatTemplate =
    model.chatTemplate ?? getEnvoyLocalCatalogModelRaw(model.id)?.chatTemplate;
  setProgress(state, {
    phase: "starting",
    label: opts.forceCpu
      ? "Starting llama-server (CPU fallback)"
      : "Starting llama-server",
    fraction: 0.9,
  });

  const args = buildEnvoyLocalLlamaServerArgs({
    modelPath: resolve(model.path),
    modelId: model.id,
    port: ENVOY_LOCAL_PORT,
    platform,
    serverParams,
    profileDir,
    chatTemplate,
    forceCpu: opts.forceCpu,
  });

  await stopChild(state);

  const stderrChunks: Buffer[] = [];
  let stderrBytes = 0;
  const child = spawn(exe, args, {
    cwd: join(exe, ".."),
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
    env: { ...process.env },
  });
  state.child = child;
  state.childPid = child.pid;
  child.stderr?.on("data", (chunk: Buffer | string) => {
    const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    if (stderrBytes > 48_000) return;
    stderrChunks.push(buf);
    stderrBytes += buf.length;
  });

  const stderrTail = (): string => {
    const text = Buffer.concat(stderrChunks).toString("utf8").trim();
    if (!text) return "";
    return text.length > 1200 ? text.slice(-1200) : text;
  };

  child.on("exit", (code, signal) => {
    if (state.child === child) {
      state.child = null;
      state.childPid = undefined;
      if (state.phase === "ready" || state.phase === "starting") {
        const detail = stderrTail();
        setError(
          state,
          `llama-server exited (code=${code ?? "null"} signal=${signal ?? "null"})` +
            (detail ? `: ${detail}` : ""),
        );
      }
    }
  });

  const endpoint = envoyLocalOpenAiBaseUrl(ENVOY_LOCAL_PORT);
  // Timeout scales with the model file size on disk — 0.8B loads in 5-10 s
  // on any accel, but CPU loading of 9B can take several minutes. The user can
  // override via serverParams.startupTimeoutMs (e.g. for slow disks).
  const modelSizeBytes = (await stat(resolve(model.path))).size;
  const startupTimeoutMs = resolveStartupTimeoutMs(serverParams, modelSizeBytes);
  const deadline = Date.now() + startupTimeoutMs;
  while (Date.now() < deadline) {
    if (await probeOpenAiModels(endpoint)) {
      state.phase = "ready";
      state.download = { phase: "ready", label: "Ready", fraction: 1 };
      state.lastError = null;
      state.lastErrorAt = null;
      armWatchdog(state, deps);
      return;
    }
    if (!state.child) {
      throw new Error(state.lastError ?? "llama-server failed to start");
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  const detail = stderrTail();
  throw new Error(
    `llama-server did not become ready within ${Math.round(startupTimeoutMs / 1000)}s ` +
      `(model ${(modelSizeBytes / 1e9).toFixed(1)} GB; increase Startup timeout in Settings → AI → Envoy Local → Advanced, or set serverParams.startupTimeoutMs)` +
      (detail ? `\n${detail}` : ""),
  );
}

async function startSidecar(
  state: EnvoyLocalRuntimeState,
  deps: EnvoyLocalRuntimeDeps,
): Promise<void> {
  const platform = state.platform ?? detectEnvoyLocalPlatform();
  state.platform = platform;
  try {
    await startSidecarOnce(state, deps, { forceCpu: false });
    return;
  } catch (err) {
    // Phase 54E — one automatic CUDA→CPU fallback (+ Settings note).
    if (platform.accel !== "cuda") throw err;
    const reason = err instanceof Error ? err.message : String(err);
    state.accelFallbackNote = `CUDA start failed (${reason}); running on CPU (-ngl 0).`;
    await startSidecarOnce(state, deps, { forceCpu: true });
  }
}

/**
 * Await the in-flight enable / model-download / engine-update job, if any.
 * Long installs run detached from the JSON-RPC response (see enable/download).
 */
export async function awaitEnvoyLocalOperation(
  state: EnvoyLocalRuntimeState,
): Promise<EnvoyLocalStatus | null> {
  if (!state.enablePromise) return null;
  return state.enablePromise;
}

export async function enableEnvoyLocalViaRuntime(
  state: EnvoyLocalRuntimeState,
  deps: EnvoyLocalRuntimeDeps,
  params?: EnableEnvoyLocalParams,
): Promise<EnvoyLocalStatus> {
  // Already running — return a snapshot (do not hold the RPC on the download).
  if (state.enablePromise) {
    return getEnvoyLocalStatusViaRuntime(state, deps);
  }

  const abort = new AbortController();
  state.abort = abort;
  state.lastError = null;
  state.lastErrorAt = null;
  setProgress(state, { phase: "detecting", label: "Detecting platform", fraction: 0 });

  state.enablePromise = (async () => {
    try {
      const platform = detectEnvoyLocalPlatform();
      state.platform = platform;
      const profileDir = deps.getProfileDir();

      await deps.saveEnvoyLocalConfig({
        enabled: true,
        autoProvisionDeclined: false,
      });

      const region = await loadDownloadRegion(deps);
      const exe = await ensureRuntimeInstalled(
        state,
        profileDir,
        platform,
        abort.signal,
        { region },
      );
      void exe;

      const model = await ensureDefaultModel(
        state,
        profileDir,
        abort.signal,
        params?.skipModelDownload === true,
        region,
        deps,
      );

      // Disable may have aborted / cleared enabled while we downloaded.
      await assertEnvoyLocalEnableStillActive(deps, abort.signal);

      await deps.saveEnvoyLocalConfig({
        enabled: true,
        activeModelId: model.id,
        runtimeVersion: ENVOY_LOCAL_LLAMA_CPP_TAG,
      });

      await assertEnvoyLocalEnableStillActive(deps, abort.signal);
      await startSidecar(state, deps);

      await assertEnvoyLocalEnableStillActive(deps, abort.signal);
      const endpoint = envoyLocalOpenAiBaseUrl(ENVOY_LOCAL_PORT);
      await deps.wireModelProviders(endpoint, model.id);
      if (deps.reloadOpenClaw) {
        await deps.reloadOpenClaw().catch(() => undefined);
      }

      return getEnvoyLocalStatusViaRuntime(state, deps);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (abort.signal.aborted) {
        setError(state, "Download cancelled");
      } else {
        setError(state, msg);
      }
      return getEnvoyLocalStatusViaRuntime(state, deps);
    } finally {
      state.enablePromise = null;
      state.abort = null;
    }
  })();

  // Detach: Social polls getEnvoyLocalStatus while operationInProgress is true.
  // Holding the RPC for a multi-GB GitHub/HF download hits client timeouts (10m).
  return getEnvoyLocalStatusViaRuntime(state, deps);
}

export async function disableEnvoyLocalViaRuntime(
  state: EnvoyLocalRuntimeState,
  deps: EnvoyLocalRuntimeDeps,
): Promise<EnvoyLocalStatus> {
  if (state.abort) state.abort.abort();
  await stopChild(state);
  state.phase = "disabled";
  state.download = null;
  await deps.saveEnvoyLocalConfig({ enabled: false });
  // Do not mutate cloud/Ollama modelProviders — Local preference is runtime-only.
  if (deps.reloadOpenClaw) {
    await deps.reloadOpenClaw().catch(() => undefined);
  }
  return getEnvoyLocalStatusViaRuntime(state, deps);
}

/**
 * Start llama-server when runtime + model are already on disk (no download).
 * Does not mutate cloud/Ollama Settings — inference prefers Local while running.
 */
export async function startEnvoyLocalViaRuntime(
  state: EnvoyLocalRuntimeState,
  deps: EnvoyLocalRuntimeDeps,
): Promise<EnvoyLocalStatus> {
  if (state.enablePromise) {
    return getEnvoyLocalStatusViaRuntime(state, deps);
  }

  const profileDir = deps.getProfileDir();
  const platform = detectEnvoyLocalPlatform();
  state.platform = platform;
  const exeName = process.platform === "win32" ? "llama-server.exe" : "llama-server";
  const exePath = await findExecutable(runtimeDir(profileDir), [exeName]);
  const index = await scanAndReconcileModelsIndex(profileDir);
  const usable = await usableModelsFromIndex(index);
  if (!exePath || usable.length === 0) {
    setError(
      state,
      "Envoy Local engine or model is not installed. Use Download & enable first.",
    );
    return getEnvoyLocalStatusViaRuntime(state, deps);
  }

  const abort = new AbortController();
  state.abort = abort;
  state.lastError = null;
  state.lastErrorAt = null;
  setProgress(state, { phase: "starting", label: "Starting llama-server", fraction: 0 });

  state.enablePromise = (async () => {
    try {
      await deps.saveEnvoyLocalConfig({
        enabled: true,
        autoProvisionDeclined: false,
      });

      const cfg = normalizeEnvoyLocalConfig(await deps.loadEnvoyLocalConfig());
      const active = resolveActiveModel(usable, [
        cfg.activeModelId,
        index.activeModelId,
      ]);
      if (!active) {
        throw new Error("No usable local model found");
      }
      await ensureActiveModelPersisted(deps, profileDir, index, active);

      await assertEnvoyLocalEnableStillActive(deps, abort.signal);
      await startSidecar(state, deps);

      await assertEnvoyLocalEnableStillActive(deps, abort.signal);
      const endpoint = envoyLocalOpenAiBaseUrl(ENVOY_LOCAL_PORT);
      await deps.wireModelProviders(endpoint, active.id);
      if (deps.reloadOpenClaw) {
        await deps.reloadOpenClaw().catch(() => undefined);
      }
      return getEnvoyLocalStatusViaRuntime(state, deps);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (abort.signal.aborted) {
        setError(state, "Start cancelled");
      } else {
        setError(state, msg);
      }
      return getEnvoyLocalStatusViaRuntime(state, deps);
    } finally {
      state.enablePromise = null;
      state.abort = null;
    }
  })();

  return getEnvoyLocalStatusViaRuntime(state, deps);
}

/**
 * Stop llama-server. Cloud/Ollama Settings are untouched — inference falls
 * back to them automatically when Local is no longer running.
 */
export async function stopEnvoyLocalViaRuntime(
  state: EnvoyLocalRuntimeState,
  deps: EnvoyLocalRuntimeDeps,
): Promise<EnvoyLocalStatus> {
  if (state.abort) state.abort.abort();
  await stopChild(state);
  state.phase = "disabled";
  state.download = null;
  state.lastError = null;
  state.lastErrorAt = null;
  await deps.saveEnvoyLocalConfig({ enabled: false });
  if (deps.reloadOpenClaw) {
    await deps.reloadOpenClaw().catch(() => undefined);
  }
  return getEnvoyLocalStatusViaRuntime(state, deps);
}

/**
 * After a `modelProviders` patch: no longer disables Envoy Local.
 * Cloud/Ollama and Local are independent; Local wins at inference only
 * while the sidecar is running.
 * @returns always false
 */
export async function maybeDisableEnvoyLocalForExternalProvider(
  _state: EnvoyLocalRuntimeState,
  _deps: EnvoyLocalRuntimeDeps,
  _modelProviders: ModelProviderConfig | null | undefined,
): Promise<boolean> {
  return false;
}

async function assertEnvoyLocalEnableStillActive(
  deps: EnvoyLocalRuntimeDeps,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) {
    const err = new Error("Download cancelled");
    err.name = "AbortError";
    throw err;
  }
  const cfg = normalizeEnvoyLocalConfig(await deps.loadEnvoyLocalConfig());
  if (!cfg.enabled) {
    const err = new Error("Download cancelled");
    err.name = "AbortError";
    throw err;
  }
}

export async function restartEnvoyLocalViaRuntime(
  state: EnvoyLocalRuntimeState,
  deps: EnvoyLocalRuntimeDeps,
): Promise<EnvoyLocalStatus> {
  const cfg = normalizeEnvoyLocalConfig(await deps.loadEnvoyLocalConfig());
  if (!cfg.enabled) {
    return getEnvoyLocalStatusViaRuntime(state, deps);
  }
  await stopChild(state);
  try {
    await startSidecar(state, deps);
    if (deps.reloadOpenClaw) {
      await deps.reloadOpenClaw().catch(() => undefined);
    }
  } catch (err) {
    setError(state, err instanceof Error ? err.message : String(err));
  }
  return getEnvoyLocalStatusViaRuntime(state, deps);
}

export async function cancelEnvoyLocalDownloadViaRuntime(
  state: EnvoyLocalRuntimeState,
  deps: EnvoyLocalRuntimeDeps,
): Promise<EnvoyLocalStatus> {
  if (state.abort) state.abort.abort();
  return getEnvoyLocalStatusViaRuntime(state, deps);
}

/** Force-stop the child process (shutdown / test teardown). Does not touch providers. */
export async function haltEnvoyLocalChildViaRuntime(
  state: EnvoyLocalRuntimeState,
): Promise<void> {
  if (state.abort) state.abort.abort();
  await stopChild(state);
}

/**
 * Boot hook: start sidecar only when already opted in (`enabled`) and assets
 * exist. Never downloads. Cloud/Ollama may coexist — Local is preferred at
 * inference time while running.
 */
export async function maybeStartEnvoyLocalOnBootViaRuntime(
  state: EnvoyLocalRuntimeState,
  deps: EnvoyLocalRuntimeDeps,
): Promise<void> {
  // Older builds stored envoy-local inside modelProviders; migrate back to cloud.
  if (deps.clearEnvoyLocalModelProviders) {
    await deps.clearEnvoyLocalModelProviders().catch(() => undefined);
  }

  const cfg = normalizeEnvoyLocalConfig(await deps.loadEnvoyLocalConfig());
  state.platform = detectEnvoyLocalPlatform();

  if (!cfg.enabled) {
    state.phase = "disabled";
    return;
  }

  const profileDir = deps.getProfileDir();
  const exeName = process.platform === "win32" ? "llama-server.exe" : "llama-server";
  const exePath = await findExecutable(runtimeDir(profileDir), [exeName]);
  const index = await scanAndReconcileModelsIndex(profileDir);
  const usable = await usableModelsFromIndex(index);
  const hasModel = usable.length > 0;

  if (!exePath || !hasModel) {
    // Missing assets: wait for UI consent / Settings enable (no silent download).
    return;
  }

  try {
    const active = resolveActiveModel(usable, [
      cfg.activeModelId,
      index.activeModelId,
    ]);
    if (active) {
      await ensureActiveModelPersisted(deps, profileDir, index, active);
    }
    await startSidecar(state, deps);
    if (deps.reloadOpenClaw) {
      await deps.reloadOpenClaw().catch(() => undefined);
    }
  } catch (err) {
    setError(state, err instanceof Error ? err.message : String(err));
  }
}

/** Persist “Not now” on the auto-provision consent dialog. */
export async function declineEnvoyLocalAutoProvisionViaRuntime(
  state: EnvoyLocalRuntimeState,
  deps: EnvoyLocalRuntimeDeps,
): Promise<EnvoyLocalStatus> {
  await deps.saveEnvoyLocalConfig({ autoProvisionDeclined: true });
  return getEnvoyLocalStatusViaRuntime(state, deps);
}

// --- Phase 54D: catalog + server params ---

export async function listEnvoyLocalInstalledModelsViaRuntime(
  deps: EnvoyLocalRuntimeDeps,
): Promise<EnvoyLocalInstalledModel[]> {
  const profileDir = deps.getProfileDir();
  const cfg = normalizeEnvoyLocalConfig(await deps.loadEnvoyLocalConfig());
  const index = await scanAndReconcileModelsIndex(profileDir);
  const usable = await usableModelsFromIndex(index);
  const active =
    resolveActiveModel(usable, [cfg.activeModelId, index.activeModelId]) ??
    null;
  if (active) {
    await ensureActiveModelPersisted(deps, profileDir, index, active);
  }
  const activeId = active?.id;
  const out: EnvoyLocalInstalledModel[] = [];
  for (const m of usable) {
    let sizeBytes = m.sizeBytes;
    if (sizeBytes == null) {
      try {
        sizeBytes = (await stat(m.path)).size;
      } catch {
        /* ignore */
      }
    }
    const successor = findCuratedSuccessor(m.id);
    out.push({
      id: m.id,
      fileName: m.fileName,
      path: m.path,
      ...(sizeBytes != null ? { sizeBytes } : {}),
      active: m.id === activeId,
      ...(successor
        ? {
            newerCuratedModelId: successor.id,
            newerCuratedModelLabel: successor.label,
          }
        : {}),
    });
  }
  return out;
}

export async function searchEnvoyLocalModelsViaRuntime(
  query?: string,
  deps?: EnvoyLocalRuntimeDeps,
): Promise<SearchEnvoyLocalModelsResult> {
  const platform = detectEnvoyLocalPlatform();
  const recommendation = recommendEnvoyLocalModel(detectEnvoyLocalHardware(platform));
  const recommendedIds = new Set([
    recommendation.modelId,
    ...recommendation.alsoRecommendedModelIds,
  ]);
  const markRecommended = (models: EnvoyLocalCatalogModel[]): EnvoyLocalCatalogModel[] => {
    const marked = models.map((m) =>
      recommendedIds.has(m.id) ? { ...m, recommended: true } : { ...m, recommended: false },
    );
    marked.sort((a, b) => {
      const ar = a.id === recommendation.modelId ? 0 : a.recommended ? 1 : 2;
      const br = b.id === recommendation.modelId ? 0 : b.recommended ? 1 : 2;
      return ar - br;
    });
    return marked;
  };

  const curated = markRecommended(searchEnvoyLocalCatalog(query));
  const q = (query ?? "").trim();
  if (!q) {
    return { models: curated };
  }
  try {
    const region = deps
      ? await loadDownloadRegion(deps)
      : detectEnvoyLocalModelRegion();
    const hf = await searchHuggingFaceGgufs(q, {
      region,
      signal: AbortSignal.timeout(20_000),
    });
    const seen = new Set(curated.map((m) => m.id));
    const merged = [...curated];
    for (const m of hf) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      merged.push(withPreferredDownloadUrlForSearch(m, region));
    }
    return { models: markRecommended(merged) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { models: curated, huggingfaceError: msg };
  }
}

function withPreferredDownloadUrlForSearch(
  model: EnvoyLocalCatalogModel,
  region: ReturnType<typeof detectEnvoyLocalModelRegion>,
): EnvoyLocalCatalogModel {
  const urls = resolveEnvoyLocalModelDownloadUrls(model, region);
  return { ...model, url: urls[0] ?? model.url };
}

export async function downloadEnvoyLocalModelViaRuntime(
  state: EnvoyLocalRuntimeState,
  deps: EnvoyLocalRuntimeDeps,
  params: DownloadEnvoyLocalModelParams,
): Promise<EnvoyLocalInstalledModel[]> {
  if (state.enablePromise) {
    throw new Error("Envoy Local enable/download already in progress");
  }
  const catalog = resolveEnvoyLocalDownloadModel(
    params.modelId,
    getEnvoyLocalCatalogModelRaw,
  );
  if (!catalog) throw new Error(`Unknown catalog model: ${params.modelId}`);

  const abort = new AbortController();
  state.abort = abort;
  state.lastError = null;
  state.lastErrorAt = null;
  setProgress(state, {
    phase: "downloading-model",
    label: `Downloading ${catalog.label ?? catalog.id}`,
    fraction: 0,
  });

  state.enablePromise = (async () => {
    try {
      const region = await loadDownloadRegion(deps);
      await downloadCatalogModel(state, deps.getProfileDir(), catalog, abort.signal, {
        setActive: false,
        region,
      });
      if (state.phase === "downloading-model") {
        const cfg = normalizeEnvoyLocalConfig(await deps.loadEnvoyLocalConfig());
        state.phase = cfg.enabled ? (state.child ? "ready" : "idle") : "disabled";
        state.download = null;
      }
      return getEnvoyLocalStatusViaRuntime(state, deps);
    } catch (err) {
      if (abort.signal.aborted) setError(state, "Download cancelled");
      else setError(state, err instanceof Error ? err.message : String(err));
      return getEnvoyLocalStatusViaRuntime(state, deps);
    } finally {
      state.enablePromise = null;
      state.abort = null;
    }
  })();

  return listEnvoyLocalInstalledModelsViaRuntime(deps);
}

export async function setEnvoyLocalDownloadRegionViaRuntime(
  state: EnvoyLocalRuntimeState,
  deps: EnvoyLocalRuntimeDeps,
  params: SetEnvoyLocalDownloadRegionParams,
): Promise<EnvoyLocalStatus> {
  const region = normalizeEnvoyLocalDownloadRegionPreference(params.region);
  await deps.saveEnvoyLocalConfig({ downloadRegion: region });
  return getEnvoyLocalStatusViaRuntime(state, deps);
}

export async function setEnvoyLocalActiveModelViaRuntime(
  state: EnvoyLocalRuntimeState,
  deps: EnvoyLocalRuntimeDeps,
  modelId: string,
): Promise<EnvoyLocalStatus> {
  const id = modelId.trim();
  if (!id) throw new Error("modelId required");
  const profileDir = deps.getProfileDir();
  const index = await loadModelsIndex(profileDir);
  const model = index.models.find((m) => m.id === id);
  if (!model || !(await fileExists(model.path))) {
    throw new Error(`Installed model not found: ${id}`);
  }
  await saveModelsIndex(profileDir, { ...index, activeModelId: id });
  await deps.saveEnvoyLocalConfig({ activeModelId: id });

  const cfg = normalizeEnvoyLocalConfig(await deps.loadEnvoyLocalConfig());
  if (cfg.enabled) {
    await stopChild(state);
    try {
      await startSidecar(state, deps);
      const endpoint = envoyLocalOpenAiBaseUrl(ENVOY_LOCAL_PORT);
      await deps.wireModelProviders(endpoint, id);
      if (deps.reloadOpenClaw) await deps.reloadOpenClaw().catch(() => undefined);
    } catch (err) {
      setError(state, err instanceof Error ? err.message : String(err));
    }
  }
  return getEnvoyLocalStatusViaRuntime(state, deps);
}

export async function deleteEnvoyLocalModelViaRuntime(
  state: EnvoyLocalRuntimeState,
  deps: EnvoyLocalRuntimeDeps,
  modelId: string,
): Promise<EnvoyLocalInstalledModel[]> {
  const id = modelId.trim();
  const profileDir = deps.getProfileDir();
  const cfg = normalizeEnvoyLocalConfig(await deps.loadEnvoyLocalConfig());
  const index = await loadModelsIndex(profileDir);
  const activeId = cfg.activeModelId ?? index.activeModelId;
  if (id === activeId) {
    throw new Error("Cannot delete the active model — switch active first");
  }
  const model = index.models.find((m) => m.id === id);
  if (!model) throw new Error(`Installed model not found: ${id}`);
  await rm(model.path, { force: true });
  await saveModelsIndex(profileDir, {
    ...index,
    models: index.models.filter((m) => m.id !== id),
  });
  return listEnvoyLocalInstalledModelsViaRuntime(deps);
}

export async function updateEnvoyLocalServerParamsViaRuntime(
  state: EnvoyLocalRuntimeState,
  deps: EnvoyLocalRuntimeDeps,
  serverParams: EnvoyLocalServerParams,
): Promise<EnvoyLocalStatus> {
  const merged = resolveEnvoyLocalServerParams(serverParams);
  await deps.saveEnvoyLocalConfig({ serverParams: merged });
  const cfg = normalizeEnvoyLocalConfig(await deps.loadEnvoyLocalConfig());
  if (cfg.enabled && (state.child || state.phase === "ready")) {
    await stopChild(state);
    try {
      await startSidecar(state, deps);
    } catch (err) {
      setError(state, err instanceof Error ? err.message : String(err));
    }
  }
  // Rebuild OpenClaw gateway so model contextWindow tracks llama -c.
  if (deps.reloadOpenClaw) {
    await deps.reloadOpenClaw().catch(() => undefined);
  }
  return getEnvoyLocalStatusViaRuntime(state, deps);
}

export async function resetEnvoyLocalServerParamsViaRuntime(
  state: EnvoyLocalRuntimeState,
  deps: EnvoyLocalRuntimeDeps,
): Promise<EnvoyLocalStatus> {
  return updateEnvoyLocalServerParamsViaRuntime(
    state,
    deps,
    { ...DEFAULT_ENVOY_LOCAL_SERVER_PARAMS },
  );
}

export async function checkEnvoyLocalEngineUpdateViaRuntime(
  deps: EnvoyLocalRuntimeDeps,
): Promise<EnvoyLocalEngineUpdateInfo> {
  const cfg = normalizeEnvoyLocalConfig(await deps.loadEnvoyLocalConfig());
  const profileDir = deps.getProfileDir();
  const exeName = process.platform === "win32" ? "llama-server.exe" : "llama-server";
  const exe = await findExecutable(runtimeDir(profileDir), [exeName]);
  const installedVersion = exe
    ? (cfg.runtimeVersion ?? ENVOY_LOCAL_LLAMA_CPP_TAG)
    : undefined;
  return {
    pinnedVersion: ENVOY_LOCAL_LLAMA_CPP_TAG,
    ...(installedVersion ? { installedVersion } : {}),
    updateAvailable: !exe || installedVersion !== ENVOY_LOCAL_LLAMA_CPP_TAG,
  };
}

/** Re-download pinned llama.cpp runtime (checksummed) and restart if enabled. */
export async function updateEnvoyLocalEngineViaRuntime(
  state: EnvoyLocalRuntimeState,
  deps: EnvoyLocalRuntimeDeps,
): Promise<EnvoyLocalStatus> {
  if (state.enablePromise) {
    throw new Error("Envoy Local operation already in progress");
  }
  const abort = new AbortController();
  state.abort = abort;
  state.lastError = null;
  state.lastErrorAt = null;
  setProgress(state, {
    phase: "downloading-runtime",
    label: "Updating llama.cpp engine",
    fraction: 0,
  });

  state.enablePromise = (async () => {
    try {
      const platform = detectEnvoyLocalPlatform();
      state.platform = platform;
      const region = await loadDownloadRegion(deps);
      await ensureRuntimeInstalled(
        state,
        deps.getProfileDir(),
        platform,
        abort.signal,
        { force: true, region },
      );
      await deps.saveEnvoyLocalConfig({ runtimeVersion: ENVOY_LOCAL_LLAMA_CPP_TAG });
      const cfg = normalizeEnvoyLocalConfig(await deps.loadEnvoyLocalConfig());
      if (cfg.enabled) {
        await stopChild(state);
        await startSidecar(state, deps);
      } else {
        state.phase = "disabled";
        state.download = null;
      }
      return getEnvoyLocalStatusViaRuntime(state, deps);
    } catch (err) {
      if (abort.signal.aborted) setError(state, "Engine update cancelled");
      else setError(state, err instanceof Error ? err.message : String(err));
      return getEnvoyLocalStatusViaRuntime(state, deps);
    } finally {
      state.enablePromise = null;
      state.abort = null;
    }
  })();

  return getEnvoyLocalStatusViaRuntime(state, deps);
}
