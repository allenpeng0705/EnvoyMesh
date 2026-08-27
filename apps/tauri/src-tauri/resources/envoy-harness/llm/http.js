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
// ---------------------------------------------------------------------------
// FetchHttpClient — production
// ---------------------------------------------------------------------------
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
export class FetchHttpClient {
    timeoutMs;
    constructor(options = {}) {
        this.timeoutMs = options.timeoutMs;
    }
    async request(req) {
        const signals = [];
        if (req.signal)
            signals.push(req.signal);
        let timeoutId;
        if (this.timeoutMs !== undefined && this.timeoutMs > 0) {
            const controller = new AbortController();
            timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
            signals.push(controller.signal);
        }
        const signal = signals.length > 0 ? AbortSignal.any(signals) : undefined;
        try {
            const response = await fetch(req.url, {
                method: req.method,
                headers: req.headers,
                body: req.body,
                ...(signal ? { signal } : {}),
            });
            const body = await response.text();
            const headers = {};
            response.headers.forEach((value, key) => {
                headers[key] = value;
            });
            return { status: response.status, headers, body };
        }
        finally {
            if (timeoutId !== undefined)
                clearTimeout(timeoutId);
        }
    }
}
// ---------------------------------------------------------------------------
// FakeHttpClient — tests
// ---------------------------------------------------------------------------
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
export class FakeHttpClient {
    requests = [];
    queue = [];
    defaultResponse;
    /** Set a default response (returned when no queued response matches). */
    setDefault(response) {
        this.defaultResponse = response;
    }
    /**
     * Enqueue a response. The optional `match` predicate is
     * called for each incoming request; the first matching
     * queued response is returned (and removed from the queue).
     * If `match` is omitted, the response matches the next
     * request in order.
     */
    enqueue(matchOrResponse, response) {
        if (typeof matchOrResponse === "function") {
            if (!response) {
                throw new Error("enqueue: response is required when match is a function");
            }
            this.queue.push({ match: matchOrResponse, response });
        }
        else {
            this.queue.push({ response: matchOrResponse });
        }
    }
    async request(req) {
        this.requests.push(req);
        // Try the queue first (FIFO).
        for (let i = 0; i < this.queue.length; i++) {
            const item = this.queue[i];
            if (!item)
                continue;
            if (!item.match || item.match(req)) {
                this.queue.splice(i, 1);
                return item.response;
            }
        }
        if (this.defaultResponse) {
            return this.defaultResponse;
        }
        throw new Error(`FakeHttpClient: no response queued for ${req.method} ${req.url} (have ${this.requests.length} requests so far)`);
    }
}
// ---------------------------------------------------------------------------
// Tool definition conversion (zod → JSON Schema for OpenAI/Anthropic tools)
// ---------------------------------------------------------------------------
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
export function zodToJsonSchema(schema) {
    return convertSchema(schema);
}
function convertSchema(schema) {
    if (!isZodType(schema)) {
        throw new Error("zodToJsonSchema: not a zod schema");
    }
    // Unwrap optional/nullable/default.
    let inner = schema;
    let optional = false;
    while (isZodType(inner)) {
        const def = inner._def;
        if (!def)
            break;
        if (def.typeName === "ZodOptional" || def.typeName === "ZodDefault") {
            optional = true;
            inner = def.innerType;
            continue;
        }
        if (def.typeName === "ZodNullable") {
            // Treat as optional for JSON Schema purposes.
            optional = true;
            inner = def.innerType;
            continue;
        }
        break;
    }
    const def = inner._def;
    if (!def) {
        throw new Error("zodToJsonSchema: schema has no _def");
    }
    const typeName = def.typeName;
    if (typeName === "ZodString") {
        return { type: "string", ...(optional ? { nullable: true } : {}) };
    }
    if (typeName === "ZodNumber") {
        return { type: "number", ...(optional ? { nullable: true } : {}) };
    }
    if (typeName === "ZodBoolean") {
        return { type: "boolean", ...(optional ? { nullable: true } : {}) };
    }
    if (typeName === "ZodObject") {
        const shape = def.shape();
        const properties = {};
        const required = [];
        for (const [key, value] of Object.entries(shape)) {
            properties[key] = convertSchema(value);
            if (!isOptionalZod(value)) {
                required.push(key);
            }
        }
        return {
            type: "object",
            properties,
            ...(required.length > 0 ? { required } : {}),
        };
    }
    if (typeName === "ZodArray") {
        // zod v3 stores the element type in `_def.type`.
        return {
            type: "array",
            items: convertSchema(def.type),
            ...(optional ? { nullable: true } : {}),
        };
    }
    if (typeName === "ZodEnum") {
        // zod v3 stores enum values in `_def.values` (array).
        return {
            type: "string",
            enum: def.values,
            ...(optional ? { nullable: true } : {}),
        };
    }
    // Fallback: emit `{}` so OpenAI doesn't reject the request.
    // A future chunk can extend this with more shapes.
    return {};
}
function isZodType(x) {
    return (typeof x === "object" &&
        x !== null &&
        "_def" in x &&
        typeof x._def?.typeName === "string");
}
function isOptionalZod(x) {
    if (!isZodType(x))
        return false;
    const def = x._def;
    return (def?.typeName === "ZodOptional" ||
        def?.typeName === "ZodDefault" ||
        def?.typeName === "ZodNullable");
}
/** Convert a `Tool[]` to OpenAI's wire format. */
export function toolsToOpenAI(tools) {
    return tools.map((t) => ({
        type: "function",
        function: {
            name: t.name,
            description: t.description ?? "",
            parameters: zodToJsonSchema(t.parameters),
        },
    }));
}
/**
 * Convert our internal `Message[]` to OpenAI's wire format.
 * The translation is lossy: tool results become `role: "tool"`
 * with the result content; assistant text + tool calls are
 * merged into a single message.
 */
export function messagesToOpenAI(messages) {
    const out = [];
    // Providers require UNIQUE tool_call ids across the whole conversation.
    // Some models (MiniMax, weaker local models) reuse an id across turns,
    // which the API rejects with `400 duplicate tool_call id`. Remap repeats
    // to fresh ids and rewrite the matching tool_result references.
    const usedWireIds = new Set();
    const lastWireIdByOriginal = new Map();
    let generated = 0;
    const nextWireId = (original) => {
        const source = original.trim();
        if (source.length > 0 && !usedWireIds.has(source)) {
            usedWireIds.add(source);
            lastWireIdByOriginal.set(original, source);
            return source;
        }
        generated += 1;
        let candidate = `call_${generated}`;
        while (usedWireIds.has(candidate)) {
            generated += 1;
            candidate = `call_${generated}`;
        }
        usedWireIds.add(candidate);
        lastWireIdByOriginal.set(original, candidate);
        return candidate;
    };
    for (const m of messages) {
        if (m.role === "system") {
            const text = blocksToText(m.content);
            if (text.length > 0)
                out.push({ role: "system", content: text });
            continue;
        }
        if (m.role === "user") {
            const images = m.content.filter((b) => b.type === "image");
            if (images.length > 0) {
                const parts = [];
                for (const b of m.content) {
                    if (b.type === "text" && b.text.length > 0) {
                        parts.push({ type: "text", text: b.text });
                    }
                    if (b.type === "image") {
                        parts.push({
                            type: "image_url",
                            image_url: {
                                url: `data:${b.mimeType};base64,${b.data}`,
                            },
                        });
                    }
                }
                if (parts.length > 0) {
                    out.push({ role: "user", content: parts });
                }
                continue;
            }
            const text = blocksToText(m.content);
            if (text.length > 0)
                out.push({ role: "user", content: text });
            continue;
        }
        if (m.role === "assistant") {
            const text = blocksToText(m.content.filter((b) => b.type === "text"));
            const toolCalls = [];
            for (const b of m.content) {
                if (b.type === "tool_call") {
                    const wireId = nextWireId(b.id);
                    toolCalls.push({
                        id: wireId,
                        type: "function",
                        function: {
                            name: b.name,
                            // OpenAI expects JSON-encoded arguments.
                            arguments: JSON.stringify(b.args ?? {}),
                        },
                    });
                }
            }
            const assistant = {
                role: "assistant",
                content: text.length > 0 ? text : null,
                ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
            };
            out.push(assistant);
            continue;
        }
        if (m.role === "tool") {
            // One tool message per tool result. We emit one OpenAI
            // tool message per block.
            for (const b of m.content) {
                if (b.type === "tool_result") {
                    const content = typeof b.content === "string"
                        ? b.content
                        : JSON.stringify(b.content);
                    out.push({
                        role: "tool",
                        tool_call_id: lastWireIdByOriginal.get(b.toolCallId) ?? b.toolCallId,
                        content,
                    });
                }
            }
        }
    }
    return out;
}
/**
 * Concatenate the text blocks of a message into a single
 * string. Used for content that has no other blocks (e.g.
 * system / user messages).
 */
function blocksToText(blocks) {
    return blocks
        .filter((b) => b.type === "text" && typeof b.text === "string")
        .map((b) => b.text)
        .join("\n");
}
//# sourceMappingURL=http.js.map