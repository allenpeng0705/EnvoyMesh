/**
 * Curated Settings → AI model provider presets.
 *
 * Still persists as {@link ModelProviderConfig} (mode + endpoint + modelName +
 * apiKey). `presetId` is optional UI/OpenClaw metadata so MiniMax CN / Anthropic
 * / etc. round-trip cleanly without inventing new transport modes.
 */

import type { ModelProviderConfig, ModelProviderMode } from "./ws-protocol.js"

export type OpenClawModelApi = "openai-completions" | "anthropic-messages"

export interface ModelProviderPreset {
  /** Stable id stored in modelProviders.presetId. */
  id: string
  /** Short UI label. */
  label: string
  /** EnvoyMesh transport mode (unchanged native LLM routing). */
  mode: ModelProviderMode
  /** Default endpoint when the user picks this preset. */
  defaultEndpoint?: string
  /** Known model ids (custom free-text still allowed). */
  models: string[]
  /** Cleaner OpenClaw `models.providers.<id>` key (not the mode string). */
  openclawProviderId: string
  /** OpenClaw transport API for this preset. */
  openclawApi: OpenClawModelApi
  /** Show / edit endpoint field. Default true when defaultEndpoint set or mode needs one. */
  endpointEditable?: boolean
  endpointPlaceholder?: string
  /** Hide on cloud-only / mobile scopes (Ollama, LiteLLM). */
  localOnly?: boolean
  /** Hide when a real provider is required (mock / disabled stay available). */
  utility?: boolean
}

/**
 * Ordered CN-first, then common cloud, then local + escape hatches.
 */
export const MODEL_PROVIDER_PRESETS: readonly ModelProviderPreset[] = [
  {
    id: "minimax-cn",
    label: "MiniMax CN",
    mode: "openai-compatible",
    defaultEndpoint: "https://api.minimaxi.com/v1",
    models: ["MiniMax-M3", "MiniMax-M2.7", "MiniMax-M2.7-highspeed"],
    openclawProviderId: "minimax-cn",
    openclawApi: "openai-completions",
    endpointEditable: true,
    endpointPlaceholder: "https://api.minimaxi.com/v1",
  },
  {
    id: "minimax",
    label: "MiniMax",
    mode: "openai-compatible",
    defaultEndpoint: "https://api.minimax.io/v1",
    models: ["MiniMax-M3", "MiniMax-M2.7", "MiniMax-M2.7-highspeed"],
    openclawProviderId: "minimax",
    openclawApi: "openai-completions",
    endpointEditable: true,
    endpointPlaceholder: "https://api.minimax.io/v1",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    mode: "anthropic-compatible",
    defaultEndpoint: "https://api.anthropic.com",
    models: [
      "claude-sonnet-4-6",
      "claude-sonnet-4-5",
      "claude-opus-4-6",
      "claude-haiku-4-5",
    ],
    openclawProviderId: "anthropic",
    openclawApi: "anthropic-messages",
    endpointEditable: true,
    endpointPlaceholder: "https://api.anthropic.com",
  },
  {
    id: "openai",
    label: "OpenAI",
    mode: "openai-compatible",
    defaultEndpoint: "https://api.openai.com/v1",
    models: ["gpt-5", "gpt-5-mini", "gpt-4o", "gpt-4o-mini", "gpt-4.1"],
    openclawProviderId: "openai",
    openclawApi: "openai-completions",
    endpointEditable: true,
    endpointPlaceholder: "https://api.openai.com/v1",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    mode: "openai-compatible",
    defaultEndpoint: "https://api.deepseek.com/v1",
    models: ["deepseek-chat", "deepseek-reasoner"],
    openclawProviderId: "deepseek",
    openclawApi: "openai-completions",
    endpointEditable: true,
    endpointPlaceholder: "https://api.deepseek.com/v1",
  },
  {
    id: "glm",
    label: "GLM (Zhipu)",
    mode: "openai-compatible",
    defaultEndpoint: "https://open.bigmodel.cn/api/paas/v4",
    models: ["glm-4.5", "glm-4.5-air", "glm-4-plus", "glm-4-flash"],
    openclawProviderId: "glm",
    openclawApi: "openai-completions",
    endpointEditable: true,
    endpointPlaceholder: "https://open.bigmodel.cn/api/paas/v4",
  },
  {
    id: "qwen",
    label: "Qwen (DashScope)",
    mode: "openai-compatible",
    defaultEndpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: ["qwen-max", "qwen-plus", "qwen-turbo", "qwen-long"],
    openclawProviderId: "qwen",
    openclawApi: "openai-completions",
    endpointEditable: true,
    endpointPlaceholder: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  },
  {
    id: "qwen-intl",
    label: "Qwen (DashScope Intl)",
    mode: "openai-compatible",
    defaultEndpoint: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    models: ["qwen-max", "qwen-plus", "qwen-turbo"],
    openclawProviderId: "qwen-intl",
    openclawApi: "openai-completions",
    endpointEditable: true,
    endpointPlaceholder: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  },
  {
    id: "moonshot-cn",
    label: "Moonshot CN (Kimi)",
    mode: "openai-compatible",
    defaultEndpoint: "https://api.moonshot.cn/v1",
    models: ["kimi-k2.5", "moonshot-v1-auto", "moonshot-v1-128k"],
    openclawProviderId: "moonshot-cn",
    openclawApi: "openai-completions",
    endpointEditable: true,
    endpointPlaceholder: "https://api.moonshot.cn/v1",
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    mode: "openai-compatible",
    defaultEndpoint: "https://api.x.ai/v1",
    models: ["grok-3", "grok-3-mini", "grok-2"],
    openclawProviderId: "xai",
    openclawApi: "openai-completions",
    endpointEditable: true,
    endpointPlaceholder: "https://api.x.ai/v1",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    mode: "openai-compatible",
    defaultEndpoint: "https://openrouter.ai/api/v1",
    models: [],
    openclawProviderId: "openrouter",
    openclawApi: "openai-completions",
    endpointEditable: true,
    endpointPlaceholder: "https://openrouter.ai/api/v1",
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    mode: "ollama",
    defaultEndpoint: "http://127.0.0.1:11434/v1",
    models: ["llama3.1", "llama3.2", "qwen2.5", "mistral"],
    openclawProviderId: "ollama",
    openclawApi: "openai-completions",
    endpointEditable: true,
    endpointPlaceholder: "http://127.0.0.1:11434/v1",
    localOnly: true,
  },
  {
    // Phase 54 — post-install download of llama-server (never packaged in the app).
    // Default port matches apps/node service-ports ENVOY_LOCAL_PORT_BASE (18790).
    id: "envoy-local",
    label: "Envoy Local (llama.cpp)",
    mode: "openai-compatible",
    defaultEndpoint: "http://127.0.0.1:18790/v1",
    models: [],
    openclawProviderId: "openai-compatible",
    openclawApi: "openai-completions",
    endpointEditable: true,
    endpointPlaceholder: "http://127.0.0.1:18790/v1",
    localOnly: true,
  },
  {
    id: "litellm",
    label: "LiteLLM",
    mode: "litellm",
    defaultEndpoint: "http://127.0.0.1:4000/v1",
    models: [],
    openclawProviderId: "litellm",
    openclawApi: "openai-completions",
    endpointEditable: true,
    endpointPlaceholder: "http://127.0.0.1:4000/v1",
    localOnly: true,
  },
  {
    id: "openai-compatible",
    label: "Custom OpenAI-compatible",
    mode: "openai-compatible",
    models: [],
    openclawProviderId: "openai-compatible",
    openclawApi: "openai-completions",
    endpointEditable: true,
    endpointPlaceholder: "https://api.example.com/v1",
  },
  {
    id: "anthropic-compatible",
    label: "Custom Anthropic-compatible",
    mode: "anthropic-compatible",
    models: [],
    openclawProviderId: "anthropic-compatible",
    openclawApi: "anthropic-messages",
    endpointEditable: true,
    endpointPlaceholder: "https://api.anthropic.com",
  },
  {
    id: "mock",
    label: "Mock (no external calls)",
    mode: "mock",
    models: [],
    openclawProviderId: "mock",
    openclawApi: "openai-completions",
    endpointEditable: false,
    utility: true,
  },
  {
    id: "disabled",
    label: "Disabled",
    mode: "disabled",
    models: [],
    openclawProviderId: "disabled",
    openclawApi: "openai-completions",
    endpointEditable: false,
    utility: true,
  },
] as const

export function getModelProviderPreset(id: string | undefined): ModelProviderPreset | undefined {
  if (!id?.trim()) return undefined
  return MODEL_PROVIDER_PRESETS.find((p) => p.id === id.trim())
}

function endpointHost(endpoint: string | undefined): string {
  const raw = endpoint?.trim()
  if (!raw) return ""
  try {
    return new URL(raw).hostname.toLowerCase()
  } catch {
    return ""
  }
}

/**
 * Resolve which preset the UI / OpenClaw should use for a saved config.
 *
 * Priority (stability):
 * 1. Endpoint host → named preset (what the node will actually dial)
 * 2. Explicit presetId (when endpoint is empty or unrecognized)
 * 3. Mode → generic / utility preset
 *
 * Host wins over a stale presetId so editing the URL (or migrating old
 * configs) cannot leave OpenClaw on `openai` while dialing MiniMax/GLM/etc.
 */
export function inferModelProviderPreset(
  config: Pick<ModelProviderConfig, "mode" | "endpoint" | "presetId"> | null | undefined,
): ModelProviderPreset {
  const mode = config?.mode ?? "mock"
  const host = endpointHost(config?.endpoint)
  const fromHost = inferPresetFromHost(mode, host)
  if (fromHost) return fromHost

  const byId = getModelProviderPreset(config?.presetId)
  if (byId) return byId

  if (mode === "openai-compatible") return getModelProviderPreset("openai-compatible")!
  if (mode === "anthropic-compatible") {
    return getModelProviderPreset(host ? "anthropic-compatible" : "anthropic")!
  }
  const byMode = MODEL_PROVIDER_PRESETS.find((p) => p.id === mode)
  return byMode ?? getModelProviderPreset("mock")!
}

/** Named cloud presets detectable from hostname (not generic custom/*). */
function inferPresetFromHost(
  mode: ModelProviderMode | string,
  host: string,
): ModelProviderPreset | undefined {
  if (!host) return undefined
  if (mode === "openai-compatible") {
    if (host.includes("minimaxi.com")) return getModelProviderPreset("minimax-cn")
    if (host.includes("minimax.io")) return getModelProviderPreset("minimax")
    if (host.includes("deepseek.com")) return getModelProviderPreset("deepseek")
    if (host.includes("bigmodel.cn")) return getModelProviderPreset("glm")
    // Z.AI hosts (api.z.ai) — not bare substring "z.ai" (too loose).
    if (host === "api.z.ai" || host.endsWith(".z.ai")) return getModelProviderPreset("glm")
    if (host.includes("dashscope-intl.aliyuncs.com")) return getModelProviderPreset("qwen-intl")
    if (host.includes("dashscope.aliyuncs.com")) return getModelProviderPreset("qwen")
    if (host.includes("moonshot.cn") || host.includes("moonshot.ai")) {
      return getModelProviderPreset("moonshot-cn")
    }
    if (host === "api.x.ai" || host.endsWith(".x.ai")) return getModelProviderPreset("xai")
    if (host.includes("openrouter.ai")) return getModelProviderPreset("openrouter")
    if (host === "api.openai.com" || host.endsWith(".openai.com")) {
      return getModelProviderPreset("openai")
    }
    // Envoy Local default endpoint is loopback; prefer presetId when set.
    // Host-only cannot distinguish Ollama vs Envoy Local (both often 127.0.0.1).
    return undefined
  }
  if (mode === "anthropic-compatible") {
    if (host === "api.anthropic.com" || host.endsWith(".anthropic.com")) {
      return getModelProviderPreset("anthropic")
    }
    return undefined
  }
  return undefined
}

export interface ResolvedOpenClawModelConfig {
  providerId: string
  model: string
  api: OpenClawModelApi
  baseUrl?: string
  apiKey?: string
}

/**
 * Map Settings → AI config into OpenClaw's models.providers + agents.defaults.model.
 * Returns null for mock/disabled/incomplete configs (OpenClaw keeps no model block).
 */
export function resolveOpenClawModelConfig(
  config: ModelProviderConfig | null | undefined,
): ResolvedOpenClawModelConfig | null {
  if (!config) return null
  if (config.mode === "disabled" || config.mode === "mock") return null
  const model = config.modelName?.trim()
  if (!model) return null

  const preset = inferModelProviderPreset(config)
  const baseUrl = config.endpoint?.trim() || preset.defaultEndpoint
  return {
    providerId: preset.openclawProviderId,
    model,
    api: preset.openclawApi,
    ...(baseUrl ? { baseUrl } : {}),
    ...(config.apiKey?.trim() ? { apiKey: config.apiKey.trim() } : {}),
  }
}

/**
 * True when Settings → AI has a real provider EnvoyAI / Pi-inherit can use.
 * Stricter than {@link isModelProviderConfigured} (`mock` is not usable).
 * Equivalent to {@link resolveOpenClawModelConfig} succeeding.
 */
export function hasUsableModelProvider(
  config: ModelProviderConfig | null | undefined,
): boolean {
  return resolveOpenClawModelConfig(config) != null
}

/**
 * True when a usable cloud or BYO Ollama (non–Envoy Local) provider is configured.
 * Used to skip Envoy Local auto-download / consent prompts.
 */
export function hasUsableNonEnvoyLocalModelProvider(
  config: ModelProviderConfig | null | undefined,
): boolean {
  if (!hasUsableModelProvider(config)) return false
  return inferModelProviderPreset(config).id !== "envoy-local"
}

/**
 * Inference-time provider for EnvoyAI / OpenClaw / Pi-inherit.
 *
 * **Priority (cloud first):**
 * 1. Usable cloud / BYO Ollama from Settings → AI (`modelProviders`)
 * 2. Else Envoy Local when the sidecar is opted-in and ready
 * 3. Else whatever is persisted (may be disabled / mock / leftover)
 *
 * Persisted `modelProviders` are never overwritten here — Local is only
 * selected at inference time as an offline fallback when no cloud provider
 * is configured.
 */
export function resolveEffectiveModelProviders(
  modelProviders: ModelProviderConfig | null | undefined,
  envoyLocal?: {
    preferLocal?: boolean
    endpoint?: string
    modelName?: string
  } | null,
): ModelProviderConfig | undefined {
  // Cloud / Ollama always win when usable — Local is fallback only.
  if (hasUsableNonEnvoyLocalModelProvider(modelProviders)) {
    return modelProviders ?? undefined
  }
  const endpoint = envoyLocal?.endpoint?.trim()
  const modelName = envoyLocal?.modelName?.trim()
  if (envoyLocal?.preferLocal && endpoint && modelName) {
    return {
      mode: "openai-compatible",
      presetId: "envoy-local",
      endpoint,
      modelName,
      requireApprovalForCloud: false,
    }
  }
  return modelProviders ?? undefined
}

/** Presets visible for a given UI scope. */
export function listModelProviderPresets(opts?: {
  includeLocal?: boolean
}): ModelProviderPreset[] {
  const includeLocal = opts?.includeLocal !== false
  return MODEL_PROVIDER_PRESETS.filter((p) => {
    // Envoy Local is managed in Settings → AI → Envoy Local, not this picker.
    if (p.id === "envoy-local") return false
    return includeLocal || !p.localOnly
  })
}
