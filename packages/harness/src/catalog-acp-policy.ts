/**
 * Catalog ACP permission policy — mirrors EH `shouldAskAcpTool` without
 * depending on apps/node.
 *
 * Callers with a Mesh Coding dock pass `onPermissionRequest` so uncovered tools
 * wait for Allow/Deny. Callers without a dock leave that callback out; the
 * session then cancels rather than allowing silently.
 */

export type CatalogPermissionPolicy =
  | "safe-only"
  | "always-confirm"
  | "off"
  | "never"
  | string;

/** Read-only / low-risk tools that `safe-only` may auto-allow. */
export const CATALOG_ACP_SAFE_TOOLS: ReadonlySet<string> = new Set([
  "read_file",
  "read",
  "Read",
  "git",
  "session_query",
  "list_peers",
  "relay_status",
  "peers",
  "Glob",
  "grep",
  "Grep",
  "LS",
]);

const SAFE_BASH_RE =
  /^\s*(?:ls|cat|pwd|whoami|date|which|file|stat|du|df|find|grep|rg|head|tail|wc|echo|printf|env|printenv|dirname|basename|readlink|realpath|type|command(?:\s+-[a-zA-Z]+)?\s+\S+|test|true|false|git\s+(?:status|log|diff|show|branch|remote|rev-parse|symbolic-ref|config|ls-files|ls-tree|describe|shortlog|blame|grep|submodule\s+status))\b/;

export function isCatalogAcpSafeBashCommand(
  command: string | undefined,
): boolean {
  if (!command || typeof command !== "string") return false;
  const trimmed = command.trim();
  if (!trimmed) return false;
  if (/[;&|`]|\$\(|>|<|\n/.test(trimmed)) return false;
  return SAFE_BASH_RE.test(trimmed);
}

export function shouldAskCatalogAcpTool(
  toolName: string,
  policy: CatalogPermissionPolicy,
  args?: unknown,
): boolean {
  if (policy === "off" || policy === "never") return false;
  if (policy === "safe-only") {
    if (CATALOG_ACP_SAFE_TOOLS.has(toolName)) return false;
    const lower = toolName.toLowerCase();
    if (lower === "bash" || lower === "shell" || lower === "execute") {
      const command =
        args !== null &&
        typeof args === "object" &&
        "command" in args &&
        typeof (args as { command?: unknown }).command === "string"
          ? (args as { command: string }).command
          : undefined;
      return !isCatalogAcpSafeBashCommand(command);
    }
    if (
      lower.includes("read") ||
      lower.includes("list") ||
      lower.includes("glob") ||
      lower.includes("grep") ||
      lower.includes("search")
    ) {
      return false;
    }
    return true;
  }
  // always-confirm (default) and unknown → ask
  return true;
}

/** One `session/request_permission` request, in the agent-neutral shape a human prompt needs. */
export interface CatalogToolRequest {
  /** `""` when the agent sent a shape we do not recognise — callers must cope. */
  toolName: string;
  args: unknown;
  /** The raw params, for the undecidable cases (blob heuristics, previews). */
  raw: Record<string, unknown>;
}

/**
 * Read a `session/request_permission`'s params the one way every caller must agree on.
 *
 * Extracted rather than repeated: the *decision* (`shouldAutoAllowCatalogPermission`)
 * and the *prompt* a human reads (the coding permission dock) both need the tool name
 * and its arguments, and two extractions drift into two different answers to
 * "what is this agent asking for".
 */
export function extractCatalogAcpToolRequest(
  params: Record<string, unknown>,
): CatalogToolRequest {
  const toolCall = (params.toolCall ?? params.tool ?? params) as Record<
    string,
    unknown
  >;
  const toolName = String(
    toolCall?.toolName ??
      toolCall?.name ??
      params.toolName ??
      params.name ??
      "",
  );
  const args = toolCall?.input ?? toolCall?.arguments ?? params.args ?? params.input;
  return { toolName, args, raw: params };
}

/**
 * Decide whether to auto-allow a `session/request_permission`.
 *
 * **`false` means "a human has to decide", not "deny".** A caller with no dock
 * cancels, which is what `catalog-acp-session.ts` does; a caller with one asks,
 * and this function is what tells it there is something worth asking about.
 */
export function shouldAutoAllowCatalogPermission(
  policy: CatalogPermissionPolicy | undefined,
  params: Record<string, unknown>,
): boolean {
  const p = policy ?? "safe-only";
  if (p === "off" || p === "never") return true;
  if (p === "always-confirm") return false;

  const { toolName, args, raw } = extractCatalogAcpToolRequest(params);
  if (!toolName) {
    // Unknown tool shape under safe-only → do not silently allow writes.
    const blob = JSON.stringify(raw).toLowerCase();
    if (
      /\b(write|edit|create|delete|bash|shell|execute|run_terminal)\b/.test(
        blob,
      )
    ) {
      return false;
    }
    // Prefer allow for ambiguous read-ish requests under safe-only.
    return true;
  }
  return !shouldAskCatalogAcpTool(toolName, p, args);
}

export function denyOptionId(options: unknown): string | undefined {
  if (!Array.isArray(options) || options.length === 0) return undefined;
  const ids = options
    .map((o) =>
      o && typeof o === "object" && "optionId" in o
        ? String((o as { optionId: unknown }).optionId)
        : "",
    )
    .filter(Boolean);
  return ids.find((id) => /reject|deny|cancel|refuse|no/i.test(id));
}
