/**
 * Map trace events and content blocks to protocol committed messages.
 */
function truncate(s, max) {
    if (s.length <= max)
        return s;
    return `${s.slice(0, max - 1)}…`;
}
/** Extract display text from message content blocks. */
export function messageTextFromContent(content) {
    const parts = [];
    for (const block of content) {
        if (block.type === "text" && block.text.length > 0) {
            parts.push(block.text);
        }
    }
    return parts.join("\n");
}
function toolResultContentToText(content) {
    if (typeof content === "string")
        return content;
    if (content === undefined || content === null)
        return "";
    try {
        return JSON.stringify(content);
    }
    catch {
        return String(content);
    }
}
/**
 * Convert a live trace event to a committed message for `session/update`.
 * Returns undefined when the event should not appear in the transcript.
 */
export function traceEventToCommittedMessage(event) {
    switch (event.kind) {
        case "model_response": {
            const text = messageTextFromContent(event.content);
            if (text.length === 0)
                return undefined;
            return { role: "assistant", text };
        }
        case "tool_result": {
            const text = truncate(toolResultContentToText(event.result.content).trim(), 8000);
            if (text.length === 0) {
                return event.result.isError
                    ? { role: "tool", text: "(error, empty)" }
                    : { role: "tool", text: "(ok)" };
            }
            return { role: "tool", text };
        }
        default:
            return undefined;
    }
}
//# sourceMappingURL=message-format.js.map