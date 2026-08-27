/**
 * AnthropicAdapter — `ModelAdapter` for Anthropic's Messages API.
 *
 * **Design:** translates the harness's `ModelAdapter.complete()`
 * to Anthropic's POST `/v1/messages` wire format. The HTTP layer
 * goes through `HttpClient` (so tests use `FakeHttpClient`).
 *
 * **Wire format differences from OpenAI** (see implementation-plan
 * §6.2, F7.3 plan for the full table):
 * - Auth: `x-api-key` + `anthropic-version: 2023-06-01` headers
 *   (not `Authorization: Bearer`).
 * - System prompt is a top-level `system` field, NOT a message
 *   with `role: "system"`. `splitSystemAndMessages` extracts.
 * - Tool shape is flat `{ name, description, input_schema }`
 *   (no `function` wrapper, `input_schema` instead of
 *   `parameters`).
 * - Tool call in response is `content: [{ type: "tool_use",
 *   id, name, input }]` — mixed with text in one array.
 * - Tool results in the request are `role: "user"` with
 *   `content: [{ type: "tool_result", tool_use_id, content }]`.
 * - `max_tokens` is **required** by Anthropic. We default to
 *   `1024` (Anthropic's recommended default) when the caller
 *   doesn't pass one.
 * - `usage` field names are `input_tokens` / `output_tokens`
 *   (already matches our `ModelResponse.usage`).
 *
 * **Role alternation:** Anthropic's API requires strict
 * user ↔ assistant alternation. The harness's normal flow
 * (`user / assistant / tool / assistant / ...`) translates
 * directly: `user` stays `user`, `tool` becomes `user` with
 * `tool_result` blocks, `assistant` stays `assistant`.
 * v0 trusts the caller; we don't merge consecutive same-role
 * messages (a future chunk can add that if a real caller
 * produces them).
 *
 * **Empty assistant content:** Anthropic rejects empty
 * assistant content. If the harness emits an assistant
 * message with no text and no tool calls, we emit a single
 * placeholder text block `""` to keep the request valid.
 *
 * **Streaming:** v0 uses non-streaming `complete()`. The
 * Anthropic API supports `stream: true`; a future chunk
 * can add a streaming variant of `ModelAdapter`.
 *
 * **Stability:** the public surface is `AnthropicAdapter`
 * (class), `AnthropicAdapterOptions`, and the exported
 * helper functions (used by tests). Additive; new options
 * don't break existing callers.
 */
import { type HttpClient, type HttpResponse } from "./http.js";
import type { Message, Tool } from "../tools/types.js";
import type { CompleteInput, ModelAdapter, ModelResponse } from "../model.js";
/** Options for `AnthropicAdapter`. */
export interface AnthropicAdapterOptions {
    /** The API key. Required. */
    apiKey: string;
    /** The model identifier (e.g. "claude-sonnet-4-6", "claude-haiku-4"). */
    model: string;
    /** Custom base URL. Default: `https://api.anthropic.com`. */
    baseUrl?: string;
    /** The HTTP client. Default: `new FetchHttpClient()`. */
    httpClient?: HttpClient;
    /** Anthropic API version. Default: `2023-06-01`. */
    anthropicVersion?: string;
    /** Default `max_tokens` when the caller doesn't pass one. Default: `1024`. */
    defaultMaxTokens?: number;
    /** Optional HTTP timeout in ms. No timeout by default. */
    timeoutMs?: number;
}
/** A text block in an assistant content array. */
interface AnthropicTextBlock {
    type: "text";
    text: string;
}
/** A tool-use block in an assistant content array. */
interface AnthropicToolUseBlock {
    type: "tool_use";
    id: string;
    name: string;
    input: Record<string, unknown>;
}
/** A tool-result block in a user content array. */
interface AnthropicToolResultBlock {
    type: "tool_result";
    tool_use_id: string;
    content: string;
}
/** A user content block (text or tool result) — used when a
 *  user message carries both kinds (after role-merge). */
type AnthropicUserBlock = AnthropicTextBlock | AnthropicToolResultBlock;
/** A message in Anthropic's wire format. */
type AnthropicWireMessage = {
    role: "user";
    content: string;
} | {
    role: "user";
    content: AnthropicToolResultBlock[];
} | {
    role: "user";
    content: AnthropicUserBlock[];
} | {
    role: "assistant";
    content: Array<AnthropicTextBlock | AnthropicToolUseBlock>;
};
/** A tool definition in Anthropic's wire format. */
export interface AnthropicToolDefinition {
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
}
/** A response from Anthropic's `/v1/messages` (the parts we read). */
interface AnthropicMessagesResponse {
    id?: string;
    model: string;
    stop_reason: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use" | null;
    content: Array<AnthropicTextBlock | AnthropicToolUseBlock>;
    usage?: {
        input_tokens: number;
        output_tokens: number;
    };
}
export declare class AnthropicAdapter implements ModelAdapter {
    private apiKey;
    private model;
    private baseUrl;
    private http;
    private version;
    private defaultMaxTokens;
    constructor(options: AnthropicAdapterOptions);
    complete(input: CompleteInput): Promise<ModelResponse>;
}
/** True for 2xx HTTP status codes. */
export declare function is2xx(status: number): boolean;
/** Convert an Anthropic error response into a one-line message. */
export declare function parseError(response: HttpResponse): string;
/**
 * Pull the system prompt out of the message list. Anthropic's
 * wire format has a top-level `system` field; the harness's
 * `Message[]` has a `role: "system"` message. We extract all
 * system text blocks and concatenate with a blank line between
 * them. Returns the system string (empty if no system messages)
 * and the remaining non-system messages.
 */
export declare function splitSystemAndMessages(messages: ReadonlyArray<Message>): {
    system: string;
    messages: ReadonlyArray<Message>;
};
/** Convert our `Tool[]` to Anthropic's wire format. */
export declare function toolsToAnthropic(tools: ReadonlyArray<Tool>): AnthropicToolDefinition[];
/**
 * Convert our internal `Message[]` to Anthropic's wire format.
 * Tool results become `role: "user"` with `content: [{ type:
 * "tool_result", tool_use_id, content }]`. Assistant text and
 * tool calls are merged into one `content` array.
 *
 * **Empty assistant content** is replaced with a single
 * placeholder text block (Anthropic rejects empty content).
 */
export declare function messagesToAnthropic(messages: ReadonlyArray<Message>): AnthropicWireMessage[];
/** Convert Anthropic's response into our `ModelResponse`. */
export declare function parseMessagesResponse(parsed: AnthropicMessagesResponse): ModelResponse;
export {};
//# sourceMappingURL=anthropic.d.ts.map