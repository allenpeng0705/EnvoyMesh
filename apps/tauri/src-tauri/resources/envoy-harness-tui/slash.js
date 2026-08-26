/**
 * Slash palette — local + protocol-backed commands (Claude Code / Codex parity).
 */
/** Distributed mesh slash commands (cluster collaboration). */
export const MESH_SLASH_COMMANDS = [
    { name: "mesh", description: "mesh guide; /mesh connect <id@host:port>" },
    { name: "cluster", description: "cluster health + routing previews" },
    { name: "peers", description: "list connected peers" },
    { name: "route", description: "routing preview: /route <capability tag>" },
    { name: "team", description: "running/finished team jobs" },
    { name: "scoreboard", description: "peer reputation per skill" },
    { name: "trace", description: "recent discovery / peer events" },
];
/** The slash-command palette (for help + tab completion). */
export const SLASH_COMMANDS = [
    ...MESH_SLASH_COMMANDS,
    { name: "help", description: "list slash commands" },
    { name: "status", description: "session id, busy state, last turn cost" },
    { name: "session", description: "show active session id" },
    { name: "config", description: "show harness config (model, version)" },
    { name: "tools", description: "list tools available to the agent" },
    { name: "cost", description: "last turn token cost (when available)" },
    { name: "context", description: "transcript size + last turn cost" },
    { name: "compact", description: "compact session (keep, --budget, --summarize)" },
    { name: "hooks", description: "list registered hooks" },
    { name: "mcp", description: "list MCP servers" },
    { name: "agents", description: "list spawned sub-agents" },
    { name: "memory", description: "memory: list | read <name> | add <name> <body>" },
    { name: "plan", description: "plan mode: enter | show | edit | propose | approve | reject | exit" },
    { name: "review", description: "model code review of git diff (optional staged)" },
    { name: "init", description: "generate AGENTS.md via the model" },
    { name: "resume", description: "resume session: /resume or /resume <id>" },
    { name: "search", description: "search transcript: /search <term>" },
    { name: "provider", description: "swap provider: /provider <name> [model]" },
    { name: "model", description: "show model swap usage" },
    { name: "sandbox", description: "permission mode: read-only | workspace-write | …" },
    { name: "approval", description: "approval policy: on-request | never | …" },
    { name: "permissions", description: "auto-run policy: show | default | ask | approve" },
    { name: "diff", description: "git diff (optional --staged --stat)" },
    { name: "git-status", description: "git status --porcelain" },
    { name: "clear", description: "clear the transcript display" },
    { name: "new", description: "new ACP session (fresh agent context)" },
    { name: "cancel", description: "abort the in-flight prompt" },
    { name: "quit", description: "exit the TUI" },
];
const REPL_ONLY = `
Additional REPL-only commands (envoy-harness --repl):
  /export /rules /lsp /profile /rename /copy
`;
const HELP = `Slash commands (envoy-harness TUI):

Mesh / collaboration:
${MESH_SLASH_COMMANDS.map((c) => `  /${c.name.padEnd(11)} ${c.description}`).join("\n")}

Session / agent:
${SLASH_COMMANDS.filter((c) => !MESH_SLASH_COMMANDS.some((m) => m.name === c.name))
    .map((c) => `  /${c.name.padEnd(11)} ${c.description}`)
    .join("\n")}
${REPL_ONLY.trim()}
`;
function parseCompactArgs(rest) {
    const tokens = rest.trim().split(/\s+/).filter((t) => t.length > 0);
    let budget;
    let keep;
    let summarize = false;
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t === "--summarize") {
            summarize = true;
            continue;
        }
        if (t === "--budget" && tokens[i + 1] !== undefined) {
            const n = Number(tokens[i + 1]);
            if (!Number.isFinite(n)) {
                return { kind: "unknown", command: "compact --budget <number>" };
            }
            budget = n;
            i++;
            continue;
        }
        if (t === "--keep" && tokens[i + 1] !== undefined) {
            const n = Number(tokens[i + 1]);
            if (!Number.isFinite(n)) {
                return { kind: "unknown", command: "compact --keep <number>" };
            }
            keep = n;
            i++;
            continue;
        }
        const n = Number(t);
        if (Number.isFinite(n)) {
            keep = n;
        }
    }
    return {
        kind: "compact",
        ...(keep !== undefined ? { keep } : {}),
        ...(budget !== undefined ? { budget } : {}),
        ...(summarize ? { summarize: true } : {}),
    };
}
function parseDiffFlags(rest) {
    const tokens = rest.trim().split(/\s+/);
    const staged = tokens.includes("--staged");
    const stat = tokens.includes("--stat");
    return {
        kind: "diff",
        ...(staged ? { staged: true } : {}),
        ...(stat ? { stat: true } : {}),
    };
}
/** Parse a line that starts with `/`. Non-slash input returns null. */
export function parseSlash(line) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("/"))
        return null;
    const parts = trimmed.slice(1).split(/\s+/);
    const cmd = parts[0]?.toLowerCase();
    const rest = trimmed.slice(cmd !== undefined ? cmd.length + 1 : 1);
    switch (cmd) {
        case "help":
        case "?":
            return { kind: "help", text: HELP };
        case "cancel":
            return { kind: "cancel" };
        case "mesh": {
            const sub = parts[1]?.toLowerCase();
            if (sub === "connect") {
                const raw = parts.slice(2).join(" ").trim() || rest.trim();
                if (raw.length === 0) {
                    return {
                        kind: "unknown",
                        command: "mesh connect <id@host:port>",
                    };
                }
                return { kind: "mesh", action: "connect", endpoint: raw };
            }
            return { kind: "mesh", action: "show" };
        }
        case "peers":
            return { kind: "peers" };
        case "cluster":
            return { kind: "cluster" };
        case "team":
            return { kind: "team" };
        case "scoreboard":
            return { kind: "scoreboard" };
        case "route": {
            const tag = rest.trim();
            if (tag.length === 0) {
                return { kind: "unknown", command: "route (usage: /route <tag>)" };
            }
            return { kind: "route", tag };
        }
        case "search": {
            const term = rest.trim();
            if (term.length === 0) {
                return { kind: "unknown", command: "search (usage: /search <term>)" };
            }
            return { kind: "search", term };
        }
        case "trace":
            return { kind: "trace" };
        case "tools":
            return { kind: "tools" };
        case "config":
            return { kind: "config" };
        case "session":
            return { kind: "session" };
        case "status":
            return { kind: "status" };
        case "cost":
            return { kind: "cost" };
        case "clear":
            return { kind: "clear" };
        case "new":
            return { kind: "new" };
        case "context":
            return { kind: "context" };
        case "compact":
            return parseCompactArgs(rest);
        case "provider": {
            const name = parts[1];
            if (name === undefined || name.length === 0) {
                return { kind: "unknown", command: "provider (usage: /provider <name> [model])" };
            }
            const model = parts[2];
            return {
                kind: "provider",
                name,
                ...(model !== undefined && model.length > 0 ? { model } : {}),
            };
        }
        case "model":
            return { kind: "model" };
        case "sandbox": {
            const mode = parts[1];
            if (mode === undefined || mode.length === 0) {
                return {
                    kind: "unknown",
                    command: "sandbox (usage: /sandbox read-only|workspace-write|danger-full-access)",
                };
            }
            return { kind: "sandbox", mode };
        }
        case "approval": {
            const mode = parts[1];
            if (mode === undefined || mode.length === 0) {
                return {
                    kind: "unknown",
                    command: "approval (usage: /approval on-request|never|…)",
                };
            }
            return { kind: "approval", mode };
        }
        case "permissions": {
            if (parts[1] === undefined || parts[1].length === 0) {
                return { kind: "permissions", mode: undefined };
            }
            const raw = parts[1]?.toLowerCase();
            if (raw === "default")
                return { kind: "permissions", mode: "safe-only" };
            if (raw === "ask")
                return { kind: "permissions", mode: "always-confirm" };
            if (raw === "approve")
                return { kind: "permissions", mode: "off" };
            return {
                kind: "unknown",
                command: "permissions (usage: /permissions default|ask|approve)",
            };
        }
        case "diff":
            return parseDiffFlags(rest);
        case "git-status":
            return { kind: "git-status" };
        case "hooks":
            return { kind: "hooks" };
        case "mcp":
            return { kind: "mcp" };
        case "agents":
            return { kind: "agents" };
        case "memory": {
            const sub = parts[1]?.toLowerCase() ?? "list";
            if (sub === "list")
                return { kind: "memory", op: "list" };
            if (sub === "read") {
                const name = parts[2];
                if (name === undefined || name.length === 0) {
                    return { kind: "unknown", command: "memory read <name>" };
                }
                return { kind: "memory", op: "read", name };
            }
            if (sub === "add") {
                const name = parts[2];
                const body = parts.slice(3).join(" ");
                if (name === undefined || body.length === 0) {
                    return { kind: "unknown", command: "memory add <name> <body>" };
                }
                return { kind: "memory", op: "add", name, body };
            }
            return { kind: "unknown", command: `memory ${sub}` };
        }
        case "plan": {
            const action = parts[1]?.toLowerCase() ?? "show";
            const text = parts.slice(2).join(" ");
            if (action === "edit" && text.length === 0) {
                return { kind: "unknown", command: "plan edit <text>" };
            }
            if (action === "reject" && text.length > 0) {
                return { kind: "plan", action, reason: text };
            }
            return {
                kind: "plan",
                action,
                ...(action === "edit" ? { text } : {}),
            };
        }
        case "review": {
            const staged = parts.includes("staged");
            return { kind: "review", ...(staged ? { staged: true } : {}) };
        }
        case "init":
            return { kind: "init" };
        case "resume": {
            const id = rest.trim();
            if (id.length === 0) {
                return { kind: "resume" };
            }
            return { kind: "resume", id };
        }
        case "quit":
        case "exit":
        case "q":
            return { kind: "quit" };
        default:
            return { kind: "unknown", command: cmd ?? "" };
    }
}
/**
 * Slash-palette items for the current buffer: commands matching an
 * in-progress `/prefix` token (no space yet). Empty for non-slash input.
 */
export function matchingSlashCommands(buffer) {
    const trimmed = buffer.trimStart();
    if (!trimmed.startsWith("/"))
        return [];
    const token = trimmed.slice(1);
    if (/\s/.test(token))
        return [];
    const prefix = token.toLowerCase();
    return SLASH_COMMANDS.map((c) => c.name)
        .filter((name) => name.startsWith(prefix))
        .map((name) => `/${name}`);
}
//# sourceMappingURL=slash.js.map