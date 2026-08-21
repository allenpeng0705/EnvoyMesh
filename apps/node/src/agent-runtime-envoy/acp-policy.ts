/**
 * Phase G / 12b — map Pi `autoRunPolicy` onto per-tool ACP asks.
 *
 * - `off` → never ask (auto-allow)
 * - `safe-only` → ask only for non-safe tools
 * - `always-confirm` (default) → ask for every tool
 */

/** Read-only / low-risk tools that `safe-only` may auto-allow. */
export const ACP_SAFE_TOOLS: ReadonlySet<string> = new Set([
  "read_file",
  "git",
  "session_query",
  "list_peers",
  "relay_status",
]);

export type PiAutoRunPolicy = "off" | "safe-only" | "always-confirm" | string;

export function isAcpSafeTool(toolName: string): boolean {
  return ACP_SAFE_TOOLS.has(toolName);
}

/** Whether the host should prompt for this tool under the given policy. */
export function shouldAskAcpTool(
  toolName: string,
  policy: PiAutoRunPolicy,
): boolean {
  if (policy === "off") return false;
  if (policy === "safe-only") return !isAcpSafeTool(toolName);
  return true;
}
