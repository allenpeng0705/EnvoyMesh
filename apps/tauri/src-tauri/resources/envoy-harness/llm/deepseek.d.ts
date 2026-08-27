/**
 * DeepSeekAdapter — `ModelAdapter` for DeepSeek's chat API.
 *
 * **Design:** DeepSeek's API is OpenAI-compatible. The only
 * differences are:
 * - Base URL: `https://api.deepseek.com/v1` (vs OpenAI's
 *   `https://api.openai.com/v1`).
 * - Default model: `deepseek-chat` (vs OpenAI's `gpt-4o`).
 * - API key env var: `DEEPSEEK_API_KEY` (vs `OPENAI_API_KEY`).
 *
 * **Why subclass `OpenAIAdapter`?** the wire format is
 * identical (POST `/chat/completions`, same `messages` /
 * `tools` / `usage` shapes, same `choices[0].message` /
 * `tool_calls` / `finish_reason` response). Subclassing
 * gives us the entire `OpenAIAdapter` implementation
 * (request shape, response parsing, error handling,
 * stop-reason mapping, malformed-args tolerance) for free.
 * The constructor just sets the DeepSeek defaults.
 *
 * **Other DeepSeek models:** `deepseek-reasoner` is the
 * reasoning model; callers can pass `model: "deepseek-reasoner"`
 * to use it. The adapter doesn't branch on the model
 * name — the wire format is the same.
 *
 * **Streaming:** not supported in v0; same as the other
 * adapters.
 *
 * **Stability:** the public surface is `DeepSeekAdapter`
 * (class) and `DeepSeekAdapterOptions`. Additive; new
 * options don't break existing callers.
 */
import { OpenAIAdapter } from "./openai.js";
import type { HttpClient } from "./http.js";
/** Options for `DeepSeekAdapter`. */
export interface DeepSeekAdapterOptions {
    /** The API key. Required. */
    apiKey: string;
    /** The model identifier. Default: `deepseek-chat`. */
    model?: string;
    /** Custom base URL. Default: `https://api.deepseek.com/v1`. */
    baseUrl?: string;
    /** The HTTP client. Default: `new FetchHttpClient()` (via OpenAIAdapter). */
    httpClient?: HttpClient;
    /** Optional HTTP timeout in ms. No timeout by default. */
    timeoutMs?: number;
}
/**
 * `ModelAdapter` for DeepSeek's chat API. Subclasses
 * `OpenAIAdapter` to reuse the OpenAI-compatible wire
 * format implementation.
 */
export declare class DeepSeekAdapter extends OpenAIAdapter {
    constructor(options: DeepSeekAdapterOptions);
}
//# sourceMappingURL=deepseek.d.ts.map