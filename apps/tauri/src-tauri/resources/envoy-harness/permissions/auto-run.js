/**
 * Auto-run permission policy (Codex / Claude-style modes) for ACP
 * sessions, the TUI, and hosts:
 *
 * - `always-confirm` — ask for every tool.
 * - `safe-only` (default) — auto-allow read-only tools AND safe bash
 *   commands; ask for everything else.
 * - `off` — never ask (auto-allow everything).
 *
 * This is the session-level counterpart of the EnvoyMesh
 * `envoyHarnessAutoRunPolicy`; keeping the classifier here lets the TUI
 * and any ACP host offer the same three modes without importing EnvoyMesh.
 */
/** Read-only / low-risk tools that `safe-only` may auto-allow. */
export const AUTO_RUN_SAFE_TOOLS = new Set([
    "read_file",
    "git",
    "session_query",
    "list_peers",
    "relay_status",
    "peers",
]);
/** Single, read-only bash commands that `safe-only` may auto-allow. */
const SAFE_BASH_RE = /^\s*(?:ls|cat|pwd|whoami|date|which|file|stat|du|df|find|grep|rg|head|tail|wc|echo|printf|env|printenv|dirname|basename|readlink|realpath|type|command(?:\s+-[a-zA-Z]+)?\s+\S+|test|true|false|git\s+(?:status|log|diff|show|branch|remote|rev-parse|symbolic-ref|config|ls-files|ls-tree|describe|shortlog|blame|grep|submodule\s+status))\b/;
export function isAutoRunSafeBashCommand(command) {
    if (!command || typeof command !== "string")
        return false;
    const trimmed = command.trim();
    if (!trimmed)
        return false;
    // Reject anything compound or redirecting — a "safe" auto-run must be
    // a single read-only command with no shell metacharacters.
    if (/[;&|`]|\$\(|>|<|\n/.test(trimmed))
        return false;
    return SAFE_BASH_RE.test(trimmed);
}
/**
 * Whether the session should ASK for this tool call under the policy.
 * Returns `undefined` when the policy is not set (caller falls back to
 * its own shouldAsk).
 */
export function shouldAskUnderAutoRun(policy, toolName, args) {
    if (policy === "off")
        return false;
    if (policy === "always-confirm")
        return true;
    if (policy === "safe-only") {
        if (AUTO_RUN_SAFE_TOOLS.has(toolName))
            return false;
        if (toolName === "bash") {
            const command = args !== null &&
                typeof args === "object" &&
                "command" in args &&
                typeof args.command === "string"
                ? args.command
                : undefined;
            return !isAutoRunSafeBashCommand(command);
        }
        return true;
    }
    return undefined;
}
//# sourceMappingURL=auto-run.js.map