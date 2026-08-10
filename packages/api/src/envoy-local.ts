/**
 * Phase 54 — Envoy Local (downloadable llama-server) wire types.
 * Binaries and GGUFs are never packaged; they live under app data after install.
 */

export type EnvoyLocalAccel = "metal" | "cuda" | "cpu";

export type EnvoyLocalPhase =
  | "idle"
  | "detecting"
  | "downloading-runtime"
  | "extracting-runtime"
  | "downloading-model"
  | "starting"
  | "ready"
  | "error"
  | "disabled";

export type EnvoyLocalFlashAttn = "auto" | "on" | "off";

export type EnvoyLocalKvCacheType =
  | "f16"
  | "bf16"
  | "q8_0"
  | "q5_0"
  | "q4_0"
  | "q4_1";

export type EnvoyLocalFitMode = "on" | "off";

export interface EnvoyLocalServerParams {
  /**
   * Context size (`-c` / `--ctx-size`).
   * Default 32768 (32K) — lean for Local + OpenClaw latency; raise to 128K+
   * when you have memory and need longer sessions, or 256K–1M+ on large
   * unified/VRAM (often with quantized KV). llama.cpp `0` means “from model”;
   * we always set an explicit value for predictable memory use.
   */
  ctxSize?: number;
  /**
   * GPU layers (`-ngl`).
   * - undefined / "auto" → -1 (all) when Metal/CUDA, else 0
   * - 0 → CPU only
   * - positive → that many layers
   */
  nGpuLayers?: number | "auto";
  /** CPU threads (`-t`); omit for llama.cpp default. */
  threads?: number;
  /**
   * Server slots (`-np` / `--parallel`). Default 1 for a single home user
   * (each slot multiplies KV memory).
   */
  parallel?: number;
  /**
   * Flash Attention (`-fa`). Default `auto` (best on Metal/CUDA when supported).
   */
  flashAttn?: EnvoyLocalFlashAttn;
  /** Logical batch size (`-b`). Omit for llama.cpp default (2048). */
  batchSize?: number;
  /** Physical micro-batch (`-ub`). Omit for llama.cpp default (512). */
  ubatchSize?: number;
  /** KV cache dtype for K (`-ctk`). Omit for llama.cpp default. */
  cacheTypeK?: EnvoyLocalKvCacheType;
  /** KV cache dtype for V (`-ctv`). Omit for llama.cpp default. */
  cacheTypeV?: EnvoyLocalKvCacheType;
  /**
   * Absolute or profile-relative path to a LoRA adapter (`.gguf`), passed as
   * `--lora`. Multiple adapters: comma-separated paths.
   */
  loraPath?: string;
  /**
   * Whether llama-server may shrink unset sizes to fit device memory (`--fit`).
   * Default `on` for safer first runs on Metal/CUDA; set `off` for fixed knobs.
   */
  fit?: EnvoyLocalFitMode;
  /**
   * Override llama-server startup timeout (ms). Default scales with model
   * file size: 30 s for 0.8B, 60 s for 2–3B, 120 s for 4B, 480 s for 9B,
   * 600 s for larger. Cold CPU loads of 9B can take several minutes.
   */
  startupTimeoutMs?: number;
}

export interface EnvoyLocalDownloadProgress {
  phase: EnvoyLocalPhase;
  /** 0–1 when known. */
  fraction?: number;
  bytesReceived?: number;
  bytesTotal?: number;
  label?: string;
}

export interface EnvoyLocalStatus {
  /** User/opt-in: Envoy Local should be used when ready. */
  enabled: boolean;
  /** llama-server child is up and `/v1/models` answers. */
  running: boolean;
  phase: EnvoyLocalPhase;
  port: number;
  /** OpenAI-compatible base URL, e.g. http://127.0.0.1:18790/v1 */
  endpoint: string;
  accel?: EnvoyLocalAccel;
  runtimeVersion?: string;
  runtimeInstalled: boolean;
  activeModelId?: string;
  activeModelPath?: string;
  /** Absolute path where users may drop `.gguf` files (scanned into the install list). */
  modelsDir?: string;
  childPid?: number;
  lastError?: string | null;
  lastErrorAt?: string | null;
  download?: EnvoyLocalDownloadProgress | null;
  serverParams: EnvoyLocalServerParams;
  /**
   * Effective download region for GGUFs and llama.cpp runtime archives:
   * - `cn`: models → ModelScope + hf-mirror; runtime → GitHub proxies (+ optional CDN)
   * - `global`: Hugging Face / GitHub direct
   * Override: Settings preference, or ENVOYMESH_ENVOY_LOCAL_DOWNLOAD_REGION.
   */
  modelDownloadRegion?: "cn" | "global";
  /**
   * Settings preference (`auto` = locale / system timezone heuristics).
   * Env `ENVOYMESH_ENVOY_LOCAL_DOWNLOAD_REGION` still wins when set.
   */
  downloadRegionPreference?: "auto" | "cn" | "global";
  /** Pinned llama.cpp release channel (EnvoyMesh manifest). */
  pinnedRuntimeVersion?: string;
  /**
   * Set when CUDA/Metal GPU start failed and we automatically fell back to CPU
   * (`-ngl 0`) for this process lifetime.
   */
  accelFallbackNote?: string | null;
  /**
   * True while enable / model download / engine update holds an in-process
   * operation (AbortController or enablePromise). UI should poll + disable
   * duplicate starts; stale phases without this flag are not "busy".
   */
  operationInProgress?: boolean;
  /** Detected machine summary for model sizing (e.g. "Metal · 36 GB unified"). */
  hardwareSummary?: string;
  /** Curated model id recommended for this machine (first-enable default). */
  recommendedModelId?: string;
  /** Human label for {@link recommendedModelId}. */
  recommendedModelLabel?: string;
  /** Approximate GGUF size for the recommended model (catalog). */
  recommendedModelApproxBytes?: number;
  /** Why that model was recommended. */
  recommendedModelReason?: string;
  /**
   * True when Social should offer a consent dialog before downloading
   * llama.cpp + one recommended GGUF (no usable cloud/Ollama, assets missing,
   * user has not declined).
   */
  suggestAutoProvision?: boolean;
  /**
   * True when Stop is available (sidecar running). Cloud/Ollama Settings are
   * independent and are not cleared by Start/Stop.
   */
  canStop?: boolean;
}

export interface EnvoyLocalEngineUpdateInfo {
  pinnedVersion: string;
  installedVersion?: string;
  /** True when runtime missing or installed tag ≠ pinned. */
  updateAvailable: boolean;
}

/**
 * `enableEnvoyLocal` returns as soon as the job is queued (download runs in
 * the node process). Poll `getEnvoyLocalStatus` until `operationInProgress`
 * is false. Same pattern for `downloadEnvoyLocalModel` / `updateEnvoyLocalEngine`.
 */
export interface EnableEnvoyLocalParams {
  /** Skip default GGUF download if a model is already installed. */
  skipModelDownload?: boolean;
}

export interface SetEnvoyLocalActiveModelParams {
  modelId: string;
}

export interface UpdateEnvoyLocalServerParamsParams {
  serverParams: EnvoyLocalServerParams;
}

export interface EnvoyLocalInstalledModel {
  id: string;
  fileName: string;
  path: string;
  /** Bytes on disk when known. */
  sizeBytes?: number;
  active: boolean;
  /**
   * When set, a newer curated catalog entry supersedes this install
   * (Settings can offer Download).
   */
  newerCuratedModelId?: string;
  newerCuratedModelLabel?: string;
}

/** Model family slug for curated succession / recommendation (not Hub free-text). */
export type EnvoyLocalModelFamily = "qwen3.5" | "gemma4" | "llama3.2" | string;

/** Size tier within a family (edge allowlist). */
export type EnvoyLocalModelSizeClass =
  | "0.8b"
  | "2b"
  | "3b"
  | "4b"
  | "9b"
  | "e2b"
  | "e4b"
  | string;

export interface EnvoyLocalCatalogModel {
  id: string;
  label: string;
  /** Short description for Settings. */
  description: string;
  fileName: string;
  /**
   * Canonical Hugging Face resolve URL (global default).
   * China downloads prefer {@link modelScopeUrl} then hf-mirror.com — never package binaries.
   */
  url: string;
  /**
   * Optional ModelScope resolve URL for China-first downloads
   * (e.g. https://www.modelscope.cn/models/…/resolve/…).
   */
  modelScopeUrl?: string;
  /** Approximate size for disk UI (bytes). */
  approxBytes: number;
  /** Optional sha256 — fail closed when set. */
  sha256?: string;
  /**
   * llama-server `--chat-template` when GGUF metadata is insufficient
   * (required for Gemma 4).
   */
  chatTemplate?: string;
  /** Tags for search (family, quant, size). */
  tags: string[];
  /** Origin for Settings badges — curated allowlist vs live Hub search. */
  source?: "curated" | "huggingface";
  /** True when this entry is the hardware-recommended default (or also-fits). */
  recommended?: boolean;
  /** Curated family (required on curated allowlist entries). */
  family?: EnvoyLocalModelFamily;
  /** Size class within the family (required on curated allowlist). */
  sizeClass?: EnvoyLocalModelSizeClass;
  /** Quantization tag, e.g. q4_k_m. */
  quant?: string;
  /** Curated model ids this entry replaces (explicit succession). */
  supersedes?: string[];
}

export interface SearchEnvoyLocalModelsParams {
  query?: string;
}

/** Result of curated ± Hugging Face GGUF search. */
export interface SearchEnvoyLocalModelsResult {
  models: EnvoyLocalCatalogModel[];
  /** Set when Hub search failed; curated matches may still be present. */
  huggingfaceError?: string;
}

export interface DownloadEnvoyLocalModelParams {
  /** Catalog model id. */
  modelId: string;
}

export interface DeleteEnvoyLocalModelParams {
  modelId: string;
}

export const DEFAULT_ENVOY_LOCAL_SERVER_PARAMS: Required<
  Pick<
    EnvoyLocalServerParams,
    "ctxSize" | "nGpuLayers" | "parallel" | "flashAttn" | "fit"
  >
> = {
  ctxSize: 32768,
  nGpuLayers: "auto",
  parallel: 1,
  flashAttn: "auto",
  fit: "on",
};

/** Merge partial server params over defaults (for UI + spawn). */
export function resolveEnvoyLocalServerParams(
  value: EnvoyLocalServerParams | undefined,
): Required<
  Pick<
    EnvoyLocalServerParams,
    "ctxSize" | "nGpuLayers" | "parallel" | "flashAttn" | "fit"
  >
> &
  EnvoyLocalServerParams {
  return {
    ...DEFAULT_ENVOY_LOCAL_SERVER_PARAMS,
    ...(value ?? {}),
  };
}

/** Persisted under node-config.json (`envoyLocal`). */
export interface EnvoyLocalConfig {
  /** Opt-in: download/start llama-server when enable RPC runs or node boots. */
  enabled?: boolean;
  activeModelId?: string;
  serverParams?: EnvoyLocalServerParams;
  /** Pinned llama.cpp release tag last successfully installed (informational). */
  runtimeVersion?: string;
  /**
   * User dismissed the “download llama.cpp + one model” consent dialog.
   * Cleared when they enable Envoy Local from Settings.
   */
  autoProvisionDeclined?: boolean;
  /**
   * Model + llama.cpp download mirrors: `auto` (default), `cn`, or `global`.
   * Env `ENVOYMESH_ENVOY_LOCAL_DOWNLOAD_REGION` overrides when set.
   */
  downloadRegion?: "auto" | "cn" | "global";
  /**
   * Cloud / Ollama provider snapshot saved when switching to Envoy Local.
   * Restored by Stop when present; Stop is a no-op without a usable fallback.
   */
  fallbackModelProviders?: import("./ws-protocol.js").ModelProviderConfig;
}

export function normalizeEnvoyLocalConfig(
  value: EnvoyLocalConfig | undefined,
): Required<Pick<EnvoyLocalConfig, "enabled">> & EnvoyLocalConfig {
  const downloadRegion =
    value?.downloadRegion === "cn" || value?.downloadRegion === "global"
      ? value.downloadRegion
      : value?.downloadRegion === "auto"
        ? "auto"
        : undefined;
  return {
    enabled: value?.enabled === true,
    ...(value?.activeModelId ? { activeModelId: value.activeModelId } : {}),
    ...(value?.serverParams ? { serverParams: value.serverParams } : {}),
    ...(value?.runtimeVersion ? { runtimeVersion: value.runtimeVersion } : {}),
    ...(value?.autoProvisionDeclined === true
      ? { autoProvisionDeclined: true }
      : {}),
    ...(downloadRegion ? { downloadRegion } : {}),
    ...(value?.fallbackModelProviders
      ? { fallbackModelProviders: value.fallbackModelProviders }
      : {}),
  };
}

export interface SetEnvoyLocalDownloadRegionParams {
  /** `auto` | `cn` | `global` */
  region: "auto" | "cn" | "global";
}
