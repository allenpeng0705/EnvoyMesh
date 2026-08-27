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
import { FetchHttpClient, zodToJsonSchema, } from "./http.js";
const DEFAULT_BASE_URL = "https://api.anthropic.com";
const DEFAULT_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 1024;
// ---------------------------------------------------------------------------
// AnthropicAdapter
// ---------------------------------------------------------------------------
export class AnthropicAdapter {
    apiKey;
    model;
    baseUrl;
    http;
    version;
    defaultMaxTokens;
    constructor(options) {
        this.apiKey = options.apiKey;
        this.model = options.model;
        this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
        this.http =
            options.httpClient ??
                new FetchHttpClient(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {});
        this.version = options.anthropicVersion ?? DEFAULT_VERSION;
        this.defaultMaxTokens = options.defaultMaxTokens ?? DEFAULT_MAX_TOKENS;
    }
    async complete(input) {
        const { system, messages } = splitSystemAndMessages(input.messages);
        const body = {
            model: this.model,
            max_tokens: input.maxTokens ?? this.defaultMaxTokens,
        };
        if (system.length > 0) {
            body.system = system;
        }
        body.messages = messagesToAnthropic(messages);
        if (input.tools.length > 0) {
            body.tools = toolsToAnthropic(input.tools);
        }
        if (input.temperature !== undefined) {
            body.temperature = input.temperature;
        }
        const response = await this.http.request({
            method: "POST",
            url: `${this.baseUrl}/v1/messages`,
            headers: {
                "Content-Type": "application/json",
                "x-api-key": this.apiKey,
                "anthropic-version": this.version,
            },
            body: JSON.stringify(body),
            ...(input.signal ? { signal: input.signal } : {}),
        });
        if (!is2xx(response.status)) {
            throw new Error(parseError(response));
        }
        const parsed = JSON.parse(response.body);
        return parseMessagesResponse(parsed);
    }
}
// ---------------------------------------------------------------------------
// Helpers (exported for tests)
// ---------------------------------------------------------------------------
/** True for 2xx HTTP status codes. */
export function is2xx(status) {
    return status >= 200 && status < 300;
}
/** Convert an Anthropic error response into a one-line message. */
export function parseError(response) {
    try {
        const parsed = JSON.parse(response.body);
        if (parsed.error?.message) {
            return `Anthropic API error (${response.status}): ${parsed.error.message}`;
        }
    }
    catch {
        // fall through
    }
    return `Anthropic API error (${response.status}): ${response.body.slice(0, 200)}`;
}
/**
 * Pull the system prompt out of the message list. Anthropic's
 * wire format has a top-level `system` field; the harness's
 * `Message[]` has a `role: "system"` message. We extract all
 * system text blocks and concatenate with a blank line between
 * them. Returns the system string (empty if no system messages)
 * and the remaining non-system messages.
 */
export function splitSystemAndMessages(messages) {
    const sysBlocks = [];
    const rest = [];
    for (const m of messages) {
        if (m.role === "system") {
            for (const b of m.content) {
                if (b.type === "text" && typeof b.text === "string") {
                    sysBlocks.push(b.text);
                }
            }
        }
        else {
            rest.push(m);
        }
    }
    return { system: sysBlocks.join("\n\n"), messages: rest };
}
/** Convert our `Tool[]` to Anthropic's wire format. */
export function toolsToAnthropic(tools) {
    return tools.map((t) => ({
        name: t.name,
        description: t.description ?? "",
        input_schema: zodToJsonSchema(t.parameters),
    }));
}
/**
 * Convert our internal `Message[]` to Anthropic's wire format.
 * Tool results become `role: "user"` with `content: [{ type:
 * "tool_result", tool_use_id, content }]`. Assistant text and
 * tool calls are merged into one `content` array.
 *
 * **Empty assistant content** is replaced with a single
 * placeholder text block (Anthropic rejects empty content).
 */
export function messagesToAnthropic(messages) {
    const out = [];
    // Anthropic also requires unique tool_use ids per conversation. Some
    // models reuse an id across turns — remap repeats + their results.
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
        if (m.role === "assistant") {
            const content = [];
            for (const b of m.content) {
                if (b.type === "text") {
                    content.push({ type: "text", text: b.text });
                }
                else if (b.type === "tool_call") {
                    content.push({
                        type: "tool_use",
                        id: nextWireId(b.id),
                        name: b.name,
                        input: isRecord(b.args) ? b.args : {},
                    });
                }
            }
            // Anthropic rejects empty content; emit a placeholder.
            if (content.length === 0) {
                content.push({ type: "text", text: "" });
            }
            out.push({ role: "assistant", content });
            continue;
        }
        if (m.role === "user") {
            const images = m.content.filter((b) => b.type === "image");
            const text = blocksToText(m.content.filter((b) => b.type === "text"));
            if (images.length > 0) {
                const blocks = [];
                if (text.length > 0) {
                    blocks.push({ type: "text", text });
                }
                for (const img of images) {
                    blocks.push({
                        type: "image",
                        source: {
                            type: "base64",
                            media_type: img.mimeType,
                            data: img.data,
                        },
                    });
                }
                if (blocks.length > 0) {
                    out.push({ role: "user", content: blocks });
                }
            }
            else if (text.length > 0) {
                out.push({ role: "user", content: text });
            }
            const toolResults = collectToolResults(m.content, lastWireIdByOriginal);
            if (toolResults.length > 0) {
                out.push({ role: "user", content: toolResults });
            }
            continue;
        }
        if (m.role === "tool") {
            const toolResults = collectToolResults(m.content, lastWireIdByOriginal);
            if (toolResults.length > 0) {
                out.push({ role: "user", content: toolResults });
            }
        }
    }
    // Role-merge: Anthropic requires strict user ↔ assistant
    // alternation, but compaction / repeated appends can produce
    // consecutive same-role messages (e.g. two user prompts after
    // `/compact`, or a user message carrying both text and tool
    // results — which this converter emits as two wire messages).
    // Merge adjacent same-role messages so the request is valid.
    return mergeConsecutiveAnthropicMessages(out);
}
/** Merge adjacent same-role wire messages (Anthropic alternation). */
function mergeConsecutiveAnthropicMessages(messages) {
    const merged = [];
    for (const msg of messages) {
        const last = merged[merged.length - 1];
        if (last && last.role === msg.role) {
            merged[merged.length - 1] = mergeAnthropicPair(last, msg);
        }
        else {
            merged.push(msg);
        }
    }
    return merged;
}
function mergeAnthropicPair(a, b) {
    if (a.role === "assistant" && b.role === "assistant") {
        return { role: "assistant", content: [...a.content, ...b.content] };
    }
    if (a.role === "user" && b.role === "user") {
        return {
            role: "user",
            content: [...userBlocks(a.content), ...userBlocks(b.content)],
        };
    }
    return b; // roles differ — guarded by the caller
}
/** Normalize user content to an array of blocks (for merging). */
function userBlocks(content) {
    return typeof content === "string"
        ? [{ type: "text", text: content }]
        : content;
}
/** Extract tool_result blocks from a message's content array. */
function collectToolResults(blocks, idMap) {
    const out = [];
    for (const b of blocks) {
        if (b.type === "tool_result") {
            out.push({
                type: "tool_result",
                tool_use_id: idMap?.get(b.toolCallId) ?? b.toolCallId,
                content: typeof b.content === "string" ? b.content : JSON.stringify(b.content),
            });
        }
    }
    return out;
}
/** Concatenate text blocks into a single string. */
function blocksToText(blocks) {
    return blocks
        .filter((b) => b.type === "text" && typeof b.text === "string")
        .map((b) => b.text)
        .join("\n");
}
/** True if `x` is a non-null object (used for tool-call args). */
function isRecord(x) {
    return typeof x === "object" && x !== null && !Array.isArray(x);
}
/** Convert Anthropic's response into our `ModelResponse`. */
export function parseMessagesResponse(parsed) {
    const content = [];
    for (const block of parsed.content ?? []) {
        if (block.type === "text") {
            content.push({ type: "text", text: block.text });
        }
        else if (block.type === "tool_use") {
            content.push({
                type: "tool_call",
                id: block.id,
                name: block.name,
                args: block.input ?? {},
            });
        }
    }
    const stopReason = mapStopReason(parsed.stop_reason);
    return {
        content,
        stopReason,
        model: parsed.model,
        ...(parsed.usage
            ? {
                usage: {
                    inputTokens: parsed.usage.input_tokens,
                    outputTokens: parsed.usage.output_tokens,
                },
            }
            : {}),
    };
}
function mapStopReason(reason) {
    switch (reason) {
        case "end_turn":
        case null:
        case undefined:
            return "end_turn";
        case "max_tokens":
            return "max_tokens";
        case "stop_sequence":
            return "stop_sequence";
        case "tool_use":
            return "tool_use";
    }
}
//# sourceMappingURL=anthropic.js.map