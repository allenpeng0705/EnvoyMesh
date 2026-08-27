/**
 * Phase G / 12b — map Pi `autoRunPolicy` onto per-tool ACP asks.
 *
 * - `off` / `never` → never ask (auto-allow)
 * - `safe-only` → ask only for non-safe tools (read-only tools AND
 *   read-only bash commands auto-run, like Codex / Claude Code)
 * - `always-confirm` (default) → ask for every tool
 */

/** Read-only / low-risk tools that `safe-only` may auto-allow. */
export const ACP_SAFE_TOOLS: ReadonlySet<string> = new Set([
  "read_file",
  "git",
  "session_query",
  "list_peers",
  "relay_status",
  "peers",
]);

export type PiAutoRunPolicy =
  | "off"
  | "never"
  | "safe-only"
  | "always-confirm"
  | string;

/**
 * Single, read-only bash commands that `safe-only` may auto-allow.
 * Anything compound (pipes, `&&`, `;`, redirects, `$(…)`, newlines) is
 * NOT auto-allowed — the safe fallback is to ask.
 */
const SAFE_BASH_RE =
  /^\s*(?:ls|cat|pwd|whoami|date|which|file|stat|du|df|find|grep|rg|head|tail|wc|echo|printf|env|printenv|dirname|basename|readlink|realpath|type|command(?:\s+-[a-zA-Z]+)?\s+\S+|test|true|false|git\s+(?:status|log|diff|show|branch|remote|rev-parse|symbolic-ref|config|ls-files|ls-tree|describe|shortlog|blame|grep|submodule\s+status))\b/;

export function isAcpSafeTool(toolName: string): boolean {
  return ACP_SAFE_TOOLS.has(toolName);
}

export function isAcpSafeBashCommand(command: string | undefined): boolean {
  if (!command || typeof command !== "string") return false;
  const trimmed = command.trim();
  if (!trimmed) return false;
  // Reject anything compound or redirecting — a "safe" auto-run must be
  // a single read-only command with no shell metacharacters.
  if (/[;&|`]|\$\(|>|<|\n/.test(trimmed)) return false;
  return SAFE_BASH_RE.test(trimmed);
}

/** Whether the host should prompt for this tool under the given policy. */
export function shouldAskAcpTool(
  toolName: string,
  policy: PiAutoRunPolicy,
  args?: unknown,
): boolean {
  if (policy === "off" || policy === "never") return false;
  if (policy === "safe-only") {
    if (isAcpSafeTool(toolName)) return false;
    if (toolName === "bash") {
      const command =
        args !== null &&
        typeof args === "object" &&
        "command" in args &&
        typeof (args as { command?: unknown }).command === "string"
          ? (args as { command: string }).command
          : undefined;
      return !isAcpSafeBashCommand(command);
    }
    return true;
  }
  return true;
}
