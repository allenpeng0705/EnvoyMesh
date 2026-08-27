/**
 * OpenAIAdapter — `ModelAdapter` for OpenAI's chat completions API.
 *
 * **Design:** translates the harness's `ModelAdapter.complete()`
 * to OpenAI's POST `/v1/chat/completions`. The HTTP layer
 * goes through `HttpClient` (so tests use `FakeHttpClient`).
 *
 * **Wire format mapping:**
 * - `messages` (assistant, user, system, tool) → OpenAI's
 *   `messages` array (see `messagesToOpenAI` in `http.ts`).
 * - `tools` → OpenAI's `tools` array (see `toolsToOpenAI`).
 * - Response's `choices[0].message` → our `ModelResponse.content`.
 * - Response's `choices[0].finish_reason` → our `stopReason`.
 * - Response's `usage` → our `ModelResponse.usage` (F7.1).
 *
 * **Auth:** `Authorization: Bearer ${apiKey}`. The key
 * comes from `OPENAI_API_KEY` env var (F7.5 wires this
 * in the bin) or the constructor argument.
 *
 * **Custom base URL:** `baseUrl` lets you point at a
 * OpenAI-compatible endpoint (Azure, vLLM, llama.cpp, etc.).
 * The default is `https://api.openai.com/v1`.
 *
 * **Streaming:** v0 uses non-streaming `complete()`. The
 * OpenAI API supports `stream: true`; a future chunk can
 * add a streaming variant of `ModelAdapter`.
 *
 * **Stability:** the public surface is `OpenAIAdapter`
 * (class) and its constructor options. Additive; new
 * options don't break existing callers.
 */
import { type HttpClient, type HttpResponse, type OpenAIToolCall } from "./http.js";
import type { CompleteInput, ModelAdapter, ModelResponse } from "../model.js";
/** Options for `OpenAIAdapter`. */
export interface OpenAIAdapterOptions {
    /** The API key. Required. */
    apiKey: string;
    /** The model identifier (e.g. "gpt-4o", "gpt-4o-mini"). */
    model: string;
    /** Custom base URL. Default: `https://api.openai.com/v1`. */
    baseUrl?: string;
    /** The HTTP client. Default: `new FetchHttpClient()`. */
    httpClient?: HttpClient;
    /** Optional organization ID (sent as `OpenAI-Organization`). */
    organization?: string;
    /** Optional HTTP timeout in ms. No timeout by default. */
    timeoutMs?: number;
}
/** A response from OpenAI's `/v1/chat/completions` (the parts we read). */
interface OpenAIChatResponse {
    id?: string;
    model: string;
    choices: Array<{
        index: number;
        finish_reason: "stop" | "tool_calls" | "length" | "content_filter" | "function_call";
        message: {
            role: "assistant";
            content: string | null;
            tool_calls?: OpenAIToolCall[];
        };
    }>;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    } | null;
}
export declare class OpenAIAdapter implements ModelAdapter {
    private apiKey;
    private model;
    private baseUrl;
    private httpClient;
    private organization;
    constructor(options: OpenAIAdapterOptions);
    complete(input: CompleteInput): Promise<ModelResponse>;
    /** Stream assistant text (and tool calls) via SSE when `onTextDelta` is set. */
    private completeStreaming;
}
/** True for 2xx HTTP status codes. */
export declare function is2xx(status: number): boolean;
/** Convert an OpenAI error response into a one-line message. */
export declare function parseError(response: HttpResponse): string;
/** Convert OpenAI's response into our `ModelResponse`. */
export declare function parseChatResponse(parsed: OpenAIChatResponse): ModelResponse;
export {};
//# sourceMappingURL=openai.d.ts.map