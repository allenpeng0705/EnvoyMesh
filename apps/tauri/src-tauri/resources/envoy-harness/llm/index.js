/**
 * Provider dispatch + LLM-related re-exports (F7.5).
 *
 * **What this module does:**
 * - Re-exports the three adapters (`OpenAIAdapter`,
 *   `AnthropicAdapter`, `DeepSeekAdapter`) and the
 *   `HttpClient` / `FetchHttpClient` / `FakeHttpClient`
 *   primitives.
 * - Exports `createProviderAdapter`, the helper that
 *   resolves a `--provider <name>` + env vars to a
 *   concrete adapter. The CLI uses this when no model
 *   is injected via `RunOptions.model`.
 *
 * **Why one file for the dispatch helper?** the
 * alternative is putting it in each adapter file, which
 * creates a circular import (openai.ts → deepseek.ts →
 * openai.ts for the `ollama` case). A single dispatcher
 * imports all three and is the only place that knows the
 * provider-name → adapter-class mapping.
 *
 * **Adding a new provider:** add a `case` to the switch,
 * document the env var, add tests. The CLI flag is
 * already accepted as any string.
 *
 * **Stability:** `createProviderAdapter` and
 * `ProviderConfig` are the public surface. Additive; new
 * providers don't break existing callers.
 */
import { AnthropicAdapter } from "./anthropic.js";
import { DeepSeekAdapter } from "./deepseek.js";
import { OpenAIAdapter } from "./openai.js";
export { AnthropicAdapter, is2xx as isAnthropic2xx, messagesToAnthropic, parseError as parseAnthropicError, parseMessagesResponse, splitSystemAndMessages, toolsToAnthropic, } from "./anthropic.js";
export { DeepSeekAdapter, } from "./deepseek.js";
export { FakeHttpClient, FetchHttpClient, messagesToOpenAI, toolsToOpenAI, zodToJsonSchema, } from "./http.js";
export { is2xx as isOpenAI2xx, OpenAIAdapter, parseChatResponse, parseError as parseOpenAIError, } from "./openai.js";
/** Default models per provider. Public so callers can show them in help text. */
export const DEFAULT_PROVIDER_MODELS = {
    openai: "gpt-4o",
    anthropic: "claude-sonnet-4-6",
    deepseek: "deepseek-chat",
    minimax: "MiniMax-M3",
    glm: "glm-4-flash",
    qwen: "qwen-plus",
    ollama: "llama3.1",
};
/** The list of supported provider names. Public so the CLI can validate. */
export const SUPPORTED_PROVIDERS = [
    "openai",
    "anthropic",
    "deepseek",
    "minimax",
    "glm",
    "zhipu",
    "qwen",
    "dashscope",
    "ollama",
];
/**
 * Build a `ModelAdapter` for the given provider, reading
 * the API key from the environment.
 *
 * **Errors:** throws `Error` (caught and wrapped as
 * `CliError(EXIT_USAGE)` by the runner) when:
 * - the provider name is unknown,
 * - the provider requires an API key env var (`OPENAI_API_KEY`,
 *   `ANTHROPIC_API_KEY`, `DEEPSEEK_API_KEY`) and it is not set.
 *
 * **`ollama` is keyless:** it uses the OpenAI-compatible
 * endpoint at `http://localhost:11434/v1` (override via
 * `OLLAMA_BASE_URL`). A placeholder API key (`"ollama"`)
 * is passed because `OpenAIAdapter` requires a non-empty
 * key, but the request is unauthenticated.
 */
export function createProviderAdapter(config) {
    const env = config.env ?? process.env;
    const provider = config.provider.toLowerCase();
    switch (provider) {
        case "openai": {
            const apiKey = requireEnv(env, "OPENAI_API_KEY");
            const baseUrl = env["OPENAI_BASE_URL"];
            return new OpenAIAdapter({
                apiKey,
                model: config.model ?? DEFAULT_PROVIDER_MODELS["openai"],
                ...(baseUrl && baseUrl.length > 0 ? { baseUrl } : {}),
                ...(config.httpClient ? { httpClient: config.httpClient } : {}),
            });
        }
        case "anthropic": {
            const apiKey = requireEnv(env, "ANTHROPIC_API_KEY");
            const baseUrl = env["ANTHROPIC_BASE_URL"];
            return new AnthropicAdapter({
                apiKey,
                model: config.model ?? DEFAULT_PROVIDER_MODELS["anthropic"],
                ...(baseUrl && baseUrl.length > 0 ? { baseUrl } : {}),
                ...(config.httpClient ? { httpClient: config.httpClient } : {}),
            });
        }
        case "deepseek": {
            const apiKey = requireEnv(env, "DEEPSEEK_API_KEY");
            const baseUrl = env["DEEPSEEK_BASE_URL"];
            return new DeepSeekAdapter({
                apiKey,
                ...(config.model !== undefined ? { model: config.model } : {}),
                ...(baseUrl && baseUrl.length > 0 ? { baseUrl } : {}),
                ...(config.httpClient ? { httpClient: config.httpClient } : {}),
            });
        }
        case "minimax": {
            const apiKey = requireEnv(env, "MINIMAX_API_KEY");
            const baseUrl = env["MINIMAX_BASE_URL"] ?? "https://api.minimax.io/v1";
            return new OpenAIAdapter({
                apiKey,
                model: config.model ?? DEFAULT_PROVIDER_MODELS["minimax"],
                baseUrl,
                ...(config.httpClient ? { httpClient: config.httpClient } : {}),
            });
        }
        case "glm":
        case "zhipu": {
            const apiKey = requireEnv(env, "ZHIPU_API_KEY");
            const baseUrl = env["GLM_BASE_URL"] ??
                env["ZHIPU_BASE_URL"] ??
                "https://open.bigmodel.cn/api/paas/v4";
            return new OpenAIAdapter({
                apiKey,
                model: config.model ?? DEFAULT_PROVIDER_MODELS["glm"],
                baseUrl,
                ...(config.httpClient ? { httpClient: config.httpClient } : {}),
            });
        }
        case "qwen":
        case "dashscope": {
            const apiKey = requireEnv(env, "DASHSCOPE_API_KEY");
            const baseUrl = env["QWEN_BASE_URL"] ??
                env["DASHSCOPE_BASE_URL"] ??
                "https://dashscope.aliyuncs.com/compatible-mode/v1";
            return new OpenAIAdapter({
                apiKey,
                model: config.model ?? DEFAULT_PROVIDER_MODELS["qwen"],
                baseUrl,
                ...(config.httpClient ? { httpClient: config.httpClient } : {}),
            });
        }
        case "ollama": {
            // Ollama exposes an OpenAI-compatible endpoint at /v1.
            // No auth required. The OpenAIAdapter requires a non-empty
            // key, so we pass a placeholder.
            return new OpenAIAdapter({
                apiKey: "ollama",
                model: config.model ?? DEFAULT_PROVIDER_MODELS["ollama"],
                baseUrl: env["OLLAMA_BASE_URL"] ?? "http://localhost:11434/v1",
                ...(config.httpClient ? { httpClient: config.httpClient } : {}),
            });
        }
        default: {
            const known = SUPPORTED_PROVIDERS.join(", ");
            throw new Error(`unknown provider: ${config.provider} (expected one of: ${known})`);
        }
    }
}
/** Read a required env var; throw a clear error if missing. */
function requireEnv(env, name) {
    const value = env[name];
    if (typeof value !== "string" || value.length === 0) {
        throw new Error(`--provider requires ${name} env var to be set`);
    }
    return value;
}
//# sourceMappingURL=index.js.map