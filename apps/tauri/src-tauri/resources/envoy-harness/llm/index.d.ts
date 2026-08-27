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
import type { HttpClient } from "./http.js";
import type { ModelAdapter } from "../model.js";
export { AnthropicAdapter, type AnthropicAdapterOptions, type AnthropicToolDefinition, is2xx as isAnthropic2xx, messagesToAnthropic, parseError as parseAnthropicError, parseMessagesResponse, splitSystemAndMessages, toolsToAnthropic, } from "./anthropic.js";
export { DeepSeekAdapter, type DeepSeekAdapterOptions, } from "./deepseek.js";
export { FakeHttpClient, FetchHttpClient, messagesToOpenAI, toolsToOpenAI, zodToJsonSchema, type HttpClient, type HttpRequest, type HttpResponse, type OpenAIMessage, type OpenAIToolCall, type OpenAIToolDefinition, } from "./http.js";
export { is2xx as isOpenAI2xx, OpenAIAdapter, type OpenAIAdapterOptions, parseChatResponse, parseError as parseOpenAIError, } from "./openai.js";
export type { CompleteInput, ModelAdapter, ModelResponse } from "../model.js";
/** Config for `createProviderAdapter`. */
export interface ProviderConfig {
    /**
     * The provider name. One of: `"openai"`, `"anthropic"`,
     * `"deepseek"`, `"ollama"`. Case-insensitive.
     */
    provider: string;
    /**
     * Optional model identifier. When omitted, the provider's
     * default model is used (`gpt-4o`, `claude-sonnet-4-6`,
     * `deepseek-chat`, `llama3.1`).
     */
    model?: string;
    /**
     * The environment to read API keys from. Default: `process.env`.
     * Override for tests.
     */
    env?: NodeJS.ProcessEnv;
    /** HTTP client override (tests / hosts). Default: `FetchHttpClient`. */
    httpClient?: HttpClient;
}
/** Default models per provider. Public so callers can show them in help text. */
export declare const DEFAULT_PROVIDER_MODELS: Readonly<Record<string, string>>;
/** The list of supported provider names. Public so the CLI can validate. */
export declare const SUPPORTED_PROVIDERS: readonly ["openai", "anthropic", "deepseek", "minimax", "glm", "zhipu", "qwen", "dashscope", "ollama"];
export type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];
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
export declare function createProviderAdapter(config: ProviderConfig): ModelAdapter;
//# sourceMappingURL=index.d.ts.map