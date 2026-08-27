/**
 * Map agent trace events to protocol activity records for TUI / hosts.
 *
 * Keep summaries short: hosts show these inline during a turn, so dumping
 * tool stdout or model thinking here is pure noise.
 */
import { stripThinking } from "../util/strip-thinking.js";
function truncate(s, max) {
    if (s.length <= max)
        return s;
    return `${s.slice(0, max - 1)}…`;
}
function summarizeToolCall(call) {
    const args = call.args;
    if (call.name === "task") {
        const objective = typeof args.objective === "string" ? args.objective : "";
        const runtime = typeof args.preferred_runtime === "string"
            ? args.preferred_runtime
            : typeof args.preferredRuntime === "string"
                ? args.preferredRuntime
                : "envoy-harness";
        const peerId = typeof args.preferred_peer_id === "string"
            ? args.preferred_peer_id
            : typeof args.preferredPeerId === "string"
                ? args.preferredPeerId
                : undefined;
        const peer = peerId !== undefined ? ` → peer ${peerId}` : "";
        const tag = typeof args.capability_tag === "string" && args.capability_tag.length > 0
            ? ` [${args.capability_tag}]`
            : "";
        return `spawn sub-agent (${runtime}${peer}${tag}) — ${truncate(objective, 72)}`;
    }
    if (call.name === "write" || call.name === "edit") {
        const path = typeof args.path === "string" ? args.path : "?";
        return `${call.name} ${path}`;
    }
    if (call.name === "bash") {
        const cmd = typeof args.command === "string" ? args.command : "";
        return `bash — ${truncate(cmd.replace(/\s+/g, " ").trim(), 64)}`;
    }
    if (call.name === "read_file" || call.name === "read") {
        const path = typeof args.path === "string" ? args.path : "?";
        return `read ${path}`;
    }
    try {
        return `${call.name}(${truncate(JSON.stringify(call.args), 56)})`;
    }
    catch {
        return call.name;
    }
}
/**
 * Prefer status over content dumps. Directory listings and file bodies
 * used to be pasted into the timeline and drowned out the real answer.
 */
function summarizeToolResult(toolName, content, isError) {
    const trimmed = content.trim();
    if (trimmed.length === 0)
        return isError ? "(error, empty)" : "(ok)";
    if (isError) {
        return `error — ${truncate(trimmed.replace(/\s+/g, " "), 80)}`;
    }
    const lines = trimmed.split(/\r?\n/).filter((line) => line.length > 0);
    const name = toolName ?? "";
    if (name === "write" || name === "edit")
        return "updated";
    if (name === "read_file" || name === "read") {
        return lines.length <= 1 ? "read" : `read ${lines.length} lines`;
    }
    if (name === "bash" || name === "shell") {
        // Typical `ls` / `find` dumps: many short lines → don't paste them.
        if (lines.length >= 6 &&
            lines.every((line) => line.length < 100) &&
            !trimmed.includes("\n\n")) {
            return `listed ${lines.length} entries`;
        }
        if (lines.length === 1 && lines[0].length < 80)
            return lines[0];
        return lines.length > 1 ? `ok (${lines.length} lines)` : "ok";
    }
    if (lines.length >= 8 &&
        lines.every((line) => line.length < 100) &&
        !trimmed.includes("\n\n")) {
        return `listed ${lines.length} entries`;
    }
    return truncate(trimmed.replace(/\s+/g, " "), 72);
}
/** Convert one trace event to a wire-safe activity record. */
export function traceEventToActivity(event) {
    const base = {
        ts: event.ts,
        ...(event.subagentOf !== undefined ? { subagentOf: event.subagentOf } : {}),
    };
    switch (event.kind) {
        case "agent_start":
            return {
                ...base,
                kind: "agent_start",
                summary: event.subagentOf
                    ? `sub-agent started (tools: ${event.tools.slice(0, 6).join(", ")}${event.tools.length > 6 ? "…" : ""})`
                    : `agent started (${event.model})`,
                tools: [...event.tools],
            };
        case "model_response": {
            const textBlocks = event.content
                .filter((b) => b.type === "text")
                .map((b) => b.text)
                .join("");
            const visible = stripThinking(textBlocks).replace(/\s+/g, " ").trim();
            const hasTools = event.content.some((b) => b.type === "tool_call");
            // Never paste thinking into the timeline — hosts already stream the
            // real answer separately when there is one.
            const summary = visible.length > 0
                ? `${truncate(visible, 72)} (${event.stopReason})`
                : hasTools
                    ? `model responded (tool_use)`
                    : `model responded (${event.stopReason})`;
            return {
                ...base,
                kind: "model_response",
                summary,
                stopReason: event.stopReason,
            };
        }
        case "tool_call":
            return {
                ...base,
                kind: "tool_call",
                toolName: event.call.name,
                toolArgs: event.call.args,
                summary: summarizeToolCall(event.call),
            };
        case "tool_result": {
            const isError = event.result.isError === true;
            const text = typeof event.result.content === "string"
                ? event.result.content
                : String(event.result.content);
            return {
                ...base,
                kind: "tool_result",
                toolName: event.toolName,
                toolCallId: event.callId,
                isError,
                durationMs: event.durationMs,
                // Keep preview short on the wire — hosts that want full output
                // should read the session transcript, not the activity feed.
                resultPreview: truncate(text, 240),
                summary: summarizeToolResult(event.toolName, text, isError),
            };
        }
        case "agent_end":
            return {
                ...base,
                kind: "agent_end",
                summary: `done — ${event.iterations} model turns, ${event.toolCalls} tool calls, $${event.metrics.costUsd.toFixed(4)}`,
                iterations: event.iterations,
                toolCalls: event.toolCalls,
                costUsd: event.metrics.costUsd,
                stopReason: event.stopReason,
            };
        case "error":
            return {
                ...base,
                kind: "error",
                summary: `error — ${event.message}`,
                message: event.message,
            };
    }
}
//# sourceMappingURL=activity-format.js.map