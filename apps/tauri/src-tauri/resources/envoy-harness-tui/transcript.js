/**
 * Transcript line shown in the TUI (committed messages only).
 */
import { color, SGR } from "./theme.js";
import { displayWidth } from "./screen.js";
/** Default cyan accent for status bar + active tab (U6a.2). */
export const DEFAULT_ACCENT = SGR.cyan;
const MAX_PERMISSION_PREVIEW_LINES = 10;
/** Role label shown in the transcript margin. */
export function transcriptTag(role) {
    switch (role) {
        case "user":
            return "you";
        case "assistant":
            return "agent";
        case "tool":
            return "tool";
        case "system":
            return "sys";
        case "status":
            return "···";
    }
}
function formatRoleTag(role, options) {
    const raw = transcriptTag(role);
    if (!options?.useColor)
        return raw;
    switch (role) {
        case "user":
            return color(raw, SGR.cyan);
        case "assistant":
            return color(raw, `${SGR.bold}${SGR.magenta}`);
        case "tool":
            return color(raw, SGR.dim);
        case "system":
            return color(raw, SGR.dim);
        case "status":
            return color(raw, SGR.yellow);
    }
}
/**
 * Format one transcript line for display (plain ANSI — no markdown engine).
 * Multi-line messages use a continued margin so code blocks and tool
 * output read like Claude Code / Codex transcripts.
 */
export function formatTranscriptLine(line, options) {
    const tag = formatRoleTag(line.role, options);
    const body = formatMessageBody(line.role, line.text, options);
    const lines = body.split("\n");
    if (lines.length === 0)
        return `[${tag}]`;
    const headPrefix = line.role === "tool" ? toolTranscriptHeadPrefix(line.text, options) : "";
    const head = `[${tag}]${headPrefix ? ` ${headPrefix}` : ""} ${lines[0]}`;
    if (lines.length === 1)
        return head;
    const indent = line.role === "tool"
        ? "    ⎿ "
        : line.role === "assistant"
            ? "      "
            : "    ";
    return [head, ...lines.slice(1).map((l) => `${indent}${l}`)].join("\n");
}
/** U6a.3 — icon + tool name prefix for committed tool transcript lines. */
function toolTranscriptHeadPrefix(text, options) {
    const icon = toolTranscriptIcon(text);
    const name = toolTranscriptName(text);
    const label = `${icon} ${name}`;
    return options?.useColor ? color(label, SGR.dim) : label;
}
function toolTranscriptIcon(text) {
    const trimmed = text.trimStart();
    if (trimmed.startsWith("denied") ||
        trimmed.startsWith("error") ||
        trimmed.includes("✗")) {
        return "✗";
    }
    const name = toolTranscriptName(text).toLowerCase();
    if (name === "bash" || name === "shell" || name === "run_terminal_cmd") {
        return "⚙";
    }
    return "✓";
}
function toolTranscriptName(text) {
    const trimmed = text.trimStart();
    const head = trimmed.match(/^([a-zA-Z0-9_.-]+)/);
    if (head !== null)
        return head[1];
    return "tool";
}
/** Render message body: light structure for tools + fenced code blocks. */
export function formatMessageBody(role, text, options) {
    if (role === "tool") {
        return formatToolBody(text, options);
    }
    if (role === "assistant") {
        return formatAssistantBody(text, options);
    }
    return text;
}
function formatToolBody(text, options) {
    const trimmed = text.trim();
    if (trimmed.length === 0)
        return "(empty tool result)";
    if (trimmed.includes("\n- ") && trimmed.includes("\n+ ")) {
        return trimmed
            .split("\n")
            .map((line) => line.startsWith("-") || line.startsWith("+") || line.startsWith("@@")
            ? line
            : line)
            .join("\n");
    }
    if (trimmed.startsWith("denied by user:")) {
        const body = `denied — ${trimmed.slice("denied by user:".length).trim()}`;
        return options?.useColor ? color(body, SGR.red) : body;
    }
    if (trimmed.startsWith("denied:")) {
        return options?.useColor ? color(trimmed, SGR.red) : trimmed;
    }
    return trimmed;
}
function formatAssistantBody(text, options) {
    const lines = text.split("\n");
    const out = [];
    let inFence = false;
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("![") && trimmed.includes("](data:image/")) {
            const mime = trimmed.match(/data:([^;]+)/)?.[1] ?? "image";
            out.push(`[image: ${mime}]`);
            continue;
        }
        const fence = line.trimStart().startsWith("```");
        if (fence) {
            inFence = !inFence;
            const fenceLabel = inFence ? "┌─ code ─" : "└─";
            out.push(options?.useColor ? color(fenceLabel, SGR.dim) : fenceLabel);
            continue;
        }
        if (inFence) {
            const fenced = `│ ${line}`;
            out.push(options?.useColor ? color(fenced, SGR.dim) : fenced);
        }
        else {
            out.push(line);
        }
    }
    return out.join("\n");
}
export function formatPermissionBlock(req, preview, options) {
    const inner = [
        `Allow tool ${req.toolName}?`,
        req.description,
    ];
    const argsText = formatPermissionArgs(req.args);
    if (argsText.length > 0) {
        inner.push(argsText);
    }
    if (preview !== undefined && preview.trim().length > 0) {
        const previewLines = preview.split("\n");
        if (previewLines.length > MAX_PERMISSION_PREVIEW_LINES) {
            inner.push("--- preview ---", ...previewLines.slice(0, MAX_PERMISSION_PREVIEW_LINES), `… ${previewLines.length - MAX_PERMISSION_PREVIEW_LINES} more line(s) — scroll transcript`);
        }
        else {
            inner.push("--- preview ---", preview);
        }
    }
    inner.push("Type allow or deny (a/y / d/n)");
    return boxLines(inner, options);
}
function boxLines(innerLines, options) {
    const width = Math.min(76, Math.max(20, ...innerLines.map(displayWidth)));
    const top = `┌${"─".repeat(width + 2)}┐`;
    const bottom = `└${"─".repeat(width + 2)}┘`;
    const body = innerLines.map((l) => `│ ${l}${" ".repeat(Math.max(0, width - displayWidth(l)))} │`);
    const boxed = [top, ...body, bottom].join("\n");
    if (options?.useColor) {
        return color(boxed, SGR.yellow);
    }
    return boxed;
}
function formatPermissionArgs(args) {
    if (args === undefined || args === null)
        return "";
    if (typeof args === "string") {
        return args.trim().length > 0 ? args : "";
    }
    try {
        const json = JSON.stringify(args, null, 2);
        return json === "{}" ? "" : json;
    }
    catch {
        return String(args);
    }
}
//# sourceMappingURL=transcript.js.map