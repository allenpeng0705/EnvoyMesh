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
const DEFAULT_BASE_URL = "https://api.deepseek.com/v1";
const DEFAULT_MODEL = "deepseek-chat";
/**
 * `ModelAdapter` for DeepSeek's chat API. Subclasses
 * `OpenAIAdapter` to reuse the OpenAI-compatible wire
 * format implementation.
 */
export class DeepSeekAdapter extends OpenAIAdapter {
    constructor(options) {
        super({
            apiKey: options.apiKey,
            model: options.model ?? DEFAULT_MODEL,
            baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
            ...(options.httpClient ? { httpClient: options.httpClient } : {}),
            ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
        });
    }
}
//# sourceMappingURL=deepseek.js.map