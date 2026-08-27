/**
 * HTTP client abstraction for LLM adapters (F7.2).
 *
 * **Why abstract HTTP?** every LLM provider (OpenAI,
 * Anthropic, DeepSeek) is an HTTP POST. The adapter's
 * job is to translate our `ModelAdapter.complete()` to the
 * provider's wire format; the actual HTTP call is the same.
 * v0's `FetchHttpClient` uses global `fetch`; tests use
 * `FakeHttpClient` (no network).
 *
 * **Why a small interface?** the alternative — letting
 * adapters call `fetch` directly — couples them to Node's
 * built-in (which is what we want in production) and
 * makes them hard to test (no way to inject responses
 * without a real network). The interface is small enough
 * to mock by hand.
 *
 * **Stability:** `HttpRequest`, `HttpResponse`, `HttpClient`
 * are the public types. New methods require a major
 * version bump; new fields are additive.
 */
import type { Message, Tool } from "../tools/index.js";
/** A single HTTP request. Body is always a string (JSON-encoded). */
export interface HttpRequest {
    method: string;
    url: string;
    headers: Record<string, string>;
    body: string;
    /**
     * Optional abort signal. When provided, the fetch is canceled
     * if the signal fires (e.g. the agent was aborted mid-call).
     */
    signal?: AbortSignal;
}
/** A single HTTP response. Body is always a string (caller parses). */
export interface HttpResponse {
    status: number;
    headers: Record<string, string>;
    body: string;
}
/** The seam where adapters make HTTP calls. */
export interface HttpClient {
    request(req: HttpRequest): Promise<HttpResponse>;
}
/**
 * The default `HttpClient`: uses global `fetch`. Node 22+
 * has `fetch` built-in (via undici); this works without
 * any external dependency.
 *
 * **Timeout:** optional `timeoutMs` (default: none — callers
 * that want a bound pass one). The agent's abort signal is
 * also honored via `HttpRequest.signal`, so a user cancel
 * aborts an in-flight model call instead of hanging.
 */
export declare class FetchHttpClient implements HttpClient {
    private readonly timeoutMs;
    constructor(options?: {
        timeoutMs?: number;
    });
    request(req: HttpRequest): Promise<HttpResponse>;
}
/**
 * A `HttpClient` that records requests and returns queued
 * responses. Tests use this to assert request shape and
 * stub the provider's response.
 *
 * **Pattern:** `enqueue(matcher, response)` adds a queued
 * response (matched by the optional predicate). If no
 * match, `defaultResponse` is returned (if set). If
 * neither, the client throws — failing loudly is the
 * right default for a test fixture.
 */
export declare class FakeHttpClient implements HttpClient {
    readonly requests: HttpRequest[];
    private queue;
    private defaultResponse?;
    /** Set a default response (returned when no queued response matches). */
    setDefault(response: HttpResponse): void;
    /**
     * Enqueue a response. The optional `match` predicate is
     * called for each incoming request; the first matching
     * queued response is returned (and removed from the queue).
     * If `match` is omitted, the response matches the next
     * request in order.
     */
    enqueue(matchOrResponse: ((req: HttpRequest) => boolean) | HttpResponse, response?: HttpResponse): void;
    request(req: HttpRequest): Promise<HttpResponse>;
}
/**
 * Convert a zod schema (the `parameters` of a `Tool`) to a
 * JSON Schema object suitable for OpenAI's `tools[].function.parameters`
 * and Anthropic's `tools[].input_schema`.
 *
 * **Why a hand-rolled converter?** v0 doesn't pull in
 * `zod-to-json-schema` (50KB+ for full zod support). Our
 * 2 built-in tools use only the simple shapes
 * (`z.string`, `z.number`, `z.optional`, `z.object`).
 * v0 supports those. New shapes are additive; when a
 * tool needs a `z.union` or `z.literal`, extend this.
 *
 * **The output is intentionally minimal:** OpenAI accepts
 * a `parameters` object with `type: "object"` and
 * `properties`; required fields are optional (OpenAI
 * infers them when `required` is missing).
 */
export declare function zodToJsonSchema(schema: unknown): Record<string, unknown>;
/**
 * A tool definition in OpenAI's wire format.
 * v0: only `function` type is emitted. Anthropic's format
 * is different (F7.3); this shape is OpenAI-specific.
 */
export interface OpenAIToolDefinition {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
}
/** Convert a `Tool[]` to OpenAI's wire format. */
export declare function toolsToOpenAI(tools: ReadonlyArray<Tool>): OpenAIToolDefinition[];
/** Multimodal user content (OpenAI vision). */
export type OpenAIUserContentPart = {
    type: "text";
    text: string;
} | {
    type: "image_url";
    image_url: {
        url: string;
    };
};
/** A message in OpenAI's wire format. */
export type OpenAIMessage = {
    role: "system";
    content: string;
} | {
    role: "user";
    content: string | OpenAIUserContentPart[];
} | {
    role: "assistant";
    content: string | null;
    tool_calls?: OpenAIToolCall[];
} | {
    role: "tool";
    tool_call_id: string;
    content: string;
};
/** A tool call in an assistant message. */
export interface OpenAIToolCall {
    id: string;
    type?: "function";
    function?: {
        name: string;
        arguments: string;
    };
    /** Flat-shape providers (MiniMax, local llama-server) omit the
     *  `function` wrapper and send `name`/`arguments` at the top level. */
    name?: string;
    arguments?: string;
}
/**
 * Convert our internal `Message[]` to OpenAI's wire format.
 * The translation is lossy: tool results become `role: "tool"`
 * with the result content; assistant text + tool calls are
 * merged into a single message.
 */
export declare function messagesToOpenAI(messages: ReadonlyArray<Message>): OpenAIMessage[];
//# sourceMappingURL=http.d.ts.map