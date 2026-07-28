/**
 * Curated Pi-native providers for EnvoyMesh Settings → Pi model picker.
 *
 * Mirrors Pi's built-in provider ids (`--provider`) so Ext Agent / TUI spawn
 * the same catalogs Pi's interactive `/model` picker uses. Not every Pi
 * provider is listed — only ones that work with a simple API-key + optional
 * endpoint spawn from EnvoyMesh.
 */

export interface PiNativeProviderInfo {
  /** Pi CLI `--provider` id. */
  id: string
  /** Short UI label. */
  label: string
  /** Env var Pi reads for the API key. */
  apiKeyEnv: string
  /** Known model ids from Pi's built-in catalog (custom ids still allowed). */
  models: string[]
  /** Show optional endpoint field (OpenAI-compatible base URL, Ollama, …). */
  supportsEndpoint?: boolean
  /** Placeholder for endpoint when supportsEndpoint. */
  endpointPlaceholder?: string
}

/**
 * Ordered for CN-first defaults (MiniMax CN), then common cloud providers.
 * Model lists are a snapshot of Pi's built-in catalogs — free-text still works.
 */
export const PI_NATIVE_PROVIDERS: readonly PiNativeProviderInfo[] = [
  {
    id: "minimax-cn",
    label: "MiniMax CN",
    apiKeyEnv: "MINIMAX_CN_API_KEY",
    models: ["MiniMax-M3", "MiniMax-M2.7", "MiniMax-M2.7-highspeed"],
  },
  {
    id: "minimax",
    label: "MiniMax",
    apiKeyEnv: "MINIMAX_API_KEY",
    models: ["MiniMax-M3", "MiniMax-M2.7", "MiniMax-M2.7-highspeed"],
  },
  {
    id: "anthropic",
    label: "Anthropic",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    models: [
      "claude-sonnet-4-6",
      "claude-sonnet-4-5",
      "claude-opus-4-6",
      "claude-haiku-4-5",
    ],
  },
  {
    id: "openai",
    label: "OpenAI",
    apiKeyEnv: "OPENAI_API_KEY",
    models: ["gpt-5", "gpt-5-mini", "gpt-4o", "gpt-4o-mini", "gpt-4.1"],
    supportsEndpoint: true,
    endpointPlaceholder: "https://api.openai.com/v1",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    models: ["deepseek-v4-pro", "deepseek-v4-flash"],
  },
  {
    id: "google",
    label: "Google",
    apiKeyEnv: "GEMINI_API_KEY",
    models: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"],
  },
  {
    id: "groq",
    label: "Groq",
    apiKeyEnv: "GROQ_API_KEY",
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
  },
  {
    id: "mistral",
    label: "Mistral",
    apiKeyEnv: "MISTRAL_API_KEY",
    models: ["mistral-large-latest", "mistral-small-latest"],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    apiKeyEnv: "OPENROUTER_API_KEY",
    models: [],
    supportsEndpoint: true,
    endpointPlaceholder: "https://openrouter.ai/api/v1",
  },
  {
    id: "moonshotai-cn",
    label: "Moonshot CN (Kimi)",
    apiKeyEnv: "MOONSHOT_API_KEY",
    models: ["kimi-k2.5", "kimi-k2-thinking"],
  },
  {
    id: "moonshotai",
    label: "Moonshot (Kimi)",
    apiKeyEnv: "MOONSHOT_API_KEY",
    models: ["kimi-k2.5", "kimi-k2-thinking"],
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    apiKeyEnv: "XAI_API_KEY",
    models: ["grok-3", "grok-3-mini", "grok-2"],
  },
  {
    id: "zai-coding-cn",
    label: "Z.AI / GLM Coding CN",
    apiKeyEnv: "ZAI_API_KEY",
    models: ["glm-4.5", "glm-4.5-air"],
  },
] as const

export function getPiNativeProvider(id: string): PiNativeProviderInfo | undefined {
  return PI_NATIVE_PROVIDERS.find((p) => p.id === id)
}

/** Map legacy EnvoyMesh modes → a Pi-native provider for UI migration. */
export function piProviderFromEnvoyMode(
  mode: string | undefined,
  endpoint?: string,
): string {
  const host = (() => {
    try {
      return endpoint?.trim() ? new URL(endpoint.trim()).hostname.toLowerCase() : ""
    } catch {
      return ""
    }
  })()
  if (mode === "openai-compatible") {
    if (host.includes("minimaxi.com")) return "minimax-cn"
    if (host.includes("minimax.io")) return "minimax"
    if (host.includes("deepseek")) return "deepseek"
    if (host.includes("moonshot.cn")) return "moonshotai-cn"
    if (host.includes("moonshot.ai")) return "moonshotai"
    if (host.includes("bigmodel.cn") || host === "api.z.ai" || host.endsWith(".z.ai")) {
      return "zai-coding-cn"
    }
    if (host === "api.x.ai" || host.endsWith(".x.ai")) return "xai"
    if (host.includes("openrouter.ai")) return "openrouter"
    // Qwen / DashScope / custom OpenAI-compatible → openai + endpoint override
    return "openai"
  }
  if (mode === "anthropic-compatible") return "anthropic"
  if (mode === "ollama") return "openai" // no dedicated ollama builtin; keep openai+endpoint
  if (mode === "litellm") return "openai"
  return "minimax-cn"
}
