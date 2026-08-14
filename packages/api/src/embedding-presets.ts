/**
 * Independent embedding provider presets (Knowledge → Setup).
 * Not tied to chat `modelProviders` — changing chat must not retarget embeddings.
 */

import type { AiEmbeddingSettings, EmbeddingResponseShape } from "./ai-knowledge-base.js";
import { ENVOY_LOCAL_EMBED_CTX_SIZE } from "./ai-embedding-limits.js";

/** Default Envoy Local embed model id (GGUF catalog entry; swappable). */
export const DEFAULT_ENVOY_LOCAL_EMBED_MODEL_ID = "qwen3-embedding-0.6b-q4_k_m";

/** Optional larger Envoy Local embedder (curated catalog). */
export const QWEN3_EMBEDDING_4B_MODEL_ID = "qwen3-embedding-4b-q4_k_m";

/** Lightweight UI / preference entries for curated embed GGUFs. */
export interface EnvoyLocalEmbedModelOption {
  id: string;
  label: string;
  description: string;
  approxBytes: number;
  /** Shown as the recommended / default choice. */
  recommended?: boolean;
}

/**
 * Curated Envoy Local embed models (0.6B default first; 4B optional upgrade).
 * Download URLs live in `apps/node` catalog — ids must stay in sync.
 */
export const ENVOY_LOCAL_EMBED_MODEL_OPTIONS: readonly EnvoyLocalEmbedModelOption[] = [
  {
    id: DEFAULT_ENVOY_LOCAL_EMBED_MODEL_ID,
    label: "Qwen3 Embedding 0.6B (Q4_K_M)",
    description: "Default — small, keep-warm friendly (~0.5 GB).",
    approxBytes: 500_000_000,
    recommended: true,
  },
  {
    id: QWEN3_EMBEDDING_4B_MODEL_ID,
    label: "Qwen3 Embedding 4B (Q4_K_M)",
    description: "Higher quality (~2.5 GB). Downloads when you select and install.",
    approxBytes: 2_500_000_000,
  },
];

export function isEnvoyLocalEmbedCatalogModelId(id: string | undefined | null): boolean {
  const trimmed = id?.trim();
  if (!trimmed) return false;
  return ENVOY_LOCAL_EMBED_MODEL_OPTIONS.some((m) => m.id === trimmed);
}

/** Prefer a curated id; otherwise fall back to the 0.6B default. */
export function resolveEnvoyLocalEmbedModelId(
  preferred?: string | null,
): string {
  const trimmed = preferred?.trim();
  if (trimmed && isEnvoyLocalEmbedCatalogModelId(trimmed)) return trimmed;
  return DEFAULT_ENVOY_LOCAL_EMBED_MODEL_ID;
}

/** Canonical bases — match `apps/node/src/service-ports.ts` (before offset). */
export const ENVOY_LOCAL_CHAT_PORT_BASE = 18790;
export const ENVOY_LOCAL_EMBED_PORT_BASE = 18791;

/** Read `ENVOYMESH_PORT_OFFSET` when available (Node / Vite-defined). Browser defaults to 0. */
export function envoyLocalPortOffset(): number {
  try {
    const raw =
      typeof process !== "undefined" ? process.env?.ENVOYMESH_PORT_OFFSET : undefined;
    if (!raw?.trim()) return 0;
    const n = Number.parseInt(raw.trim(), 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

function envOverridePort(name: string): number | undefined {
  try {
    const raw = typeof process !== "undefined" ? process.env?.[name] : undefined;
    if (!raw?.trim()) return undefined;
    const n = Number.parseInt(raw.trim(), 10);
    return Number.isFinite(n) && n >= 1024 && n <= 65535 ? n : undefined;
  } catch {
    return undefined;
  }
}

/** Effective chat llama-server port (offset / env aware). */
export function envoyLocalChatPort(): number {
  return (
    envOverridePort("ENVOYMESH_ENVOY_LOCAL_PORT") ??
    ENVOY_LOCAL_CHAT_PORT_BASE + envoyLocalPortOffset()
  );
}

/** Effective embed llama-server port (offset / env aware). */
export function envoyLocalEmbedPort(): number {
  return (
    envOverridePort("ENVOYMESH_ENVOY_LOCAL_EMBED_PORT") ??
    ENVOY_LOCAL_EMBED_PORT_BASE + envoyLocalPortOffset()
  );
}

export function defaultEnvoyLocalChatEndpoint(): string {
  return `http://127.0.0.1:${envoyLocalChatPort()}/v1`;
}

export function defaultEnvoyLocalEmbedEndpoint(): string {
  return `http://127.0.0.1:${envoyLocalEmbedPort()}/v1`;
}

/** @deprecated Prefer `defaultEnvoyLocalEmbedEndpoint()` when offset may apply. */
export const DEFAULT_ENVOY_LOCAL_EMBED_ENDPOINT = defaultEnvoyLocalEmbedEndpoint();

export function parseLoopbackServicePort(endpoint: string | undefined): number | null {
  const raw = endpoint?.trim() ?? "";
  if (!raw) return null;
  try {
    const url = new URL(raw.includes("://") ? raw : `http://${raw}`);
    const host = url.hostname.toLowerCase();
    if (host !== "127.0.0.1" && host !== "localhost") return null;
    if (url.port) {
      const n = Number.parseInt(url.port, 10);
      return Number.isFinite(n) ? n : null;
    }
    return 80;
  } catch {
    return null;
  }
}

export type EmbeddingProviderPresetId =
  | "envoy-local"
  | "ollama"
  | "openai"
  | "minimax"
  | "zhipu"
  | "qwen"
  | "custom"
  | "mock";

export interface EmbeddingProviderPreset {
  id: EmbeddingProviderPresetId;
  label: string;
  /** Stored `embedding.mode`. */
  mode: NonNullable<AiEmbeddingSettings["mode"]>;
  defaultEndpoint?: string;
  defaultModelName?: string;
  defaultResponseShape?: EmbeddingResponseShape;
  /** True when endpoint/model/key fields should be shown. */
  showEndpoint?: boolean;
  showModel?: boolean;
  showApiKey?: boolean;
  showResponseShape?: boolean;
  localOnly?: boolean;
}

export const EMBEDDING_PROVIDER_PRESETS: readonly EmbeddingProviderPreset[] = [
  {
    id: "envoy-local",
    label: "Envoy Local (llama.cpp embed)",
    mode: "envoy-local",
    get defaultEndpoint() {
      return defaultEnvoyLocalEmbedEndpoint();
    },
    defaultModelName: DEFAULT_ENVOY_LOCAL_EMBED_MODEL_ID,
    defaultResponseShape: "openai",
    localOnly: true,
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    mode: "ollama",
    defaultEndpoint: "http://127.0.0.1:11434",
    defaultModelName: "nomic-embed-text",
    showEndpoint: true,
    showModel: true,
  },
  {
    id: "openai",
    label: "OpenAI",
    mode: "openai-compatible",
    defaultEndpoint: "https://api.openai.com/v1",
    defaultModelName: "text-embedding-3-small",
    defaultResponseShape: "openai",
    showEndpoint: true,
    showModel: true,
    showApiKey: true,
    showResponseShape: true,
  },
  {
    id: "minimax",
    label: "MiniMax",
    mode: "openai-compatible",
    defaultEndpoint: "https://api.minimaxi.com/v1",
    defaultModelName: "embo-01",
    defaultResponseShape: "auto",
    showEndpoint: true,
    showModel: true,
    showApiKey: true,
    showResponseShape: true,
  },
  {
    id: "zhipu",
    label: "Zhipu (智谱)",
    mode: "openai-compatible",
    defaultEndpoint: "https://open.bigmodel.cn/api/paas/v4",
    defaultModelName: "embedding-2",
    defaultResponseShape: "openai",
    showEndpoint: true,
    showModel: true,
    showApiKey: true,
    showResponseShape: true,
  },
  {
    id: "qwen",
    label: "Qwen (DashScope)",
    mode: "openai-compatible",
    defaultEndpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModelName: "text-embedding-v3",
    defaultResponseShape: "openai",
    showEndpoint: true,
    showModel: true,
    showApiKey: true,
    showResponseShape: true,
  },
  {
    id: "custom",
    label: "Custom OpenAI-compatible",
    mode: "openai-compatible",
    defaultResponseShape: "auto",
    showEndpoint: true,
    showModel: true,
    showApiKey: true,
    showResponseShape: true,
  },
  {
    id: "mock",
    label: "Mock (testing)",
    mode: "mock",
    defaultModelName: "mock-embed",
    localOnly: true,
  },
];

export function getEmbeddingProviderPreset(
  id: string | undefined | null,
): EmbeddingProviderPreset | undefined {
  if (!id) return undefined;
  return EMBEDDING_PROVIDER_PRESETS.find((p) => p.id === id);
}

/**
 * Infer which preset best matches saved embedding settings (for UI select).
 */
export function inferEmbeddingProviderPresetId(
  embedding: AiEmbeddingSettings | null | undefined,
): EmbeddingProviderPresetId {
  const mode = embedding?.mode ?? "envoy-local";
  if (mode === "envoy-local") return "envoy-local";
  if (mode === "mock") return "mock";
  if (mode === "ollama") return "ollama";
  if (mode === "inherit") {
    // Legacy; treat as envoy-local until migration materializes fields.
    return "envoy-local";
  }
  const endpoint = (embedding?.endpoint ?? "").toLowerCase();
  if (endpoint.includes("minimaxi.com")) return "minimax";
  if (endpoint.includes("openai.com")) return "openai";
  if (endpoint.includes("bigmodel.cn")) return "zhipu";
  if (endpoint.includes("dashscope.aliyuncs.com")) return "qwen";
  if (endpoint.includes("11434") || endpoint.includes("ollama")) return "ollama";
  const port = parseLoopbackServicePort(embedding?.endpoint);
  if (port != null && port === envoyLocalEmbedPort()) return "envoy-local";
  if (port != null && port === ENVOY_LOCAL_EMBED_PORT_BASE) return "envoy-local";
  return "custom";
}

/** Apply a preset into embedding settings (explicit fields — no chat inherit). */
export function embeddingSettingsFromPreset(
  presetId: EmbeddingProviderPresetId,
  prev?: AiEmbeddingSettings | null,
): AiEmbeddingSettings {
  const preset = getEmbeddingProviderPreset(presetId);
  if (!preset) {
    return {
      mode: "envoy-local",
      modelName: DEFAULT_ENVOY_LOCAL_EMBED_MODEL_ID,
      endpoint: defaultEnvoyLocalEmbedEndpoint(),
      responseShape: "openai",
      maxInputTokens: ENVOY_LOCAL_EMBED_CTX_SIZE,
    };
  }
  const next: AiEmbeddingSettings = {
    mode: preset.mode,
    modelName: preset.defaultModelName,
    endpoint: preset.defaultEndpoint,
    responseShape: preset.defaultResponseShape,
  };
  if (preset.showApiKey && prev?.apiKey?.trim()) {
    next.apiKey = prev.apiKey;
  }
  if (preset.id === "envoy-local") {
    // Always match sidecar ctx — do not carry over a higher cloud/Ollama budget.
    next.maxInputTokens = ENVOY_LOCAL_EMBED_CTX_SIZE;
  } else if (typeof prev?.maxInputTokens === "number") {
    next.maxInputTokens = prev.maxInputTokens;
  }
  return next;
}

export const DEFAULT_AI_EMBEDDING: AiEmbeddingSettings = {
  mode: "envoy-local",
  modelName: DEFAULT_ENVOY_LOCAL_EMBED_MODEL_ID,
  get endpoint() {
    return defaultEnvoyLocalEmbedEndpoint();
  },
  responseShape: "openai",
  maxInputTokens: ENVOY_LOCAL_EMBED_CTX_SIZE,
};
