/**
 * Phase 8 / v1.3 — format a skill's
 * `SignedAgentResult` as a chat-reply string.
 *
 * **What this is:** the bridge between the
 * envoy-harness skill `execute()` API (which
 * returns a structured `AgentResult` with typed
 * `ContentBlock[]` content) and the Tauri user-
 * prompt chat surface (which expects a string).
 *
 * **v1.3 rules (the 8 locked design questions):**
 * - Q1: success / skipped → 1-line summary
 *   (compact, end-user-first).
 * - Q2: failure → user-readable headline + cause +
 *   next-step hint + a `[debug details:]` block
 *   at the bottom (verbose for power users).
 * - Q3: skipped reason + relevant context.
 * - Q4: formatters live in
 *   `./b-class-result-formatters.ts` (host side).
 * - Q5 (narrow): tool-call blocks formatted ONLY
 *   when the result's first block is a B-class
 *   `tool-result` (i.e. we're already in the
 *   B-class formatter path). LLM-ask skills
 *   (text first block) keep v1.2 behavior
 *   (tool-call blocks silently dropped).
 * - Q6: unknown `structured` blocks silent
 *   fall-through + `console.debug` log.
 * - Q7: real bridge imports (typed result
 *   shapes in the formatters).
 * - Q8: peerIds truncated to first 16 chars + `...`
 *   (matches the bond-trace chat UX pattern).
 *
 * **Content block paths:**
 * - `text` first block → join all text blocks
 *   with `\n\n` (v1.2 unchanged).
 * - `structured` first block:
 *   - `envoymesh://tool-result/v1` + B-class
 *     skillId → parse `data.content` JSON +
 *     format via `formatBClassResult(skillId, ...)`.
 *     Prepend any preceding `tool-call` blocks
 *     in the result (Q5 narrow).
 *   - `envoymesh://tool-call/v1` only (no
 *     `tool-result` follow) → format the
 *     tool-call block alone.
 *   - Other `schemaRef` or non-B-class skillId
 *     → silent fall-through to v1.1 LLM ask +
 *     `console.debug` log.
 * - `file` / `image` first block → 1-line
 *   vault-path summary (v1.2 unchanged).
 * - Empty content array → `""`.
 *
 * **Why silent fall-through (Q6):** future
 * envoy-harness skills can return structured
 * data without code changes; the host catches +
 * falls back to the v1.1 free-form LLM ask. The
 * `console.debug` line lets owners diagnose
 * misconfigured skills in dev/staging without
 * spamming production logs.
 *
 * **Pure function:** no I/O (the `console.debug`
 * is a side effect, but it's gated on the
 * "unknown structured" path; the v1.2 B-class
 * path doesn't log). Tests pass a synthetic
 * `SignedAgentResult`.
 */

import type {
  ContentBlock,
  SignedAgentResult,
} from "@envoymesh/protocol";
import { formatBClassResult } from "./b-class-result-formatters.js";

/**
 * Thrown when the first content block is
 * `structured` AND we don't have a B-class
 * formatter for the skill (Q6 silent fall-through
 * is the v1.3 default; this error is still kept
 * for the Q7 test fixtures + any caller that
 * wants to opt into the strict v1.2 behavior).
 */
export class StructuredResultError extends Error {
  constructor(
    /** The skill ID that returned the structured result. */
    public readonly skillId: string,
    /** The structured block's schemaRef. */
    public readonly schemaRef: string,
  ) {
    super(
      `skill '${skillId}' returned a structured first block ` +
        `(schemaRef: '${schemaRef}'); v1.3 silent fall-through ` +
        `(Q6) unless a B-class formatter is registered.`,
    );
    this.name = "StructuredResultError";
  }
}

/** The wire schemaRef for `tool_call` blocks. */
const TOOL_CALL_SCHEMA_REF = "envoymesh://tool-call/v1";

/** The wire schemaRef for `tool_result` blocks. */
const TOOL_RESULT_SCHEMA_REF = "envoymesh://tool-result/v1";

/**
 * Format a skill's `SignedAgentResult.content`
 * as a chat-reply string.
 *
 * @param result The skill's signed result.
 * @returns The formatted text. For `text` first
 *   blocks: the block's text (or `\n\n`-joined
 *   multiple text blocks). For B-class
 *   `tool-result` first blocks: the per-skill
 *   formatter output (1-line / multi-line /
 *   skipped). For `tool-call` only blocks: a
 *   "called `<name>` (args)" line. For `file` /
 *   `image`: a 1-line vault-path summary. For
 *   empty content: `""`. For other `structured`
 *   shapes: silent fall-through (Q6) — returns
 *   `undefined` so the caller can fall back to
 *   the v1.1 free-form LLM ask.
 */
export function formatSkillResult(
  result: SignedAgentResult,
): string | undefined {
  if (result.content.length === 0) return "";
  const first = result.content[0];
  if (first === undefined) return "";

  if (first.kind === "text") {
    // Collect all text blocks and join with
    // `\n\n` (standard chat-reply multi-block
    // separator). The first block is the only
    // one guaranteed by v1.2's contract; any
    // additional text blocks are bonus.
    const textBlocks = result.content
      .filter(
        (b): b is Extract<ContentBlock, { kind: "text" }> => b.kind === "text",
      )
      .map((b) => b.text);
    return textBlocks.join("\n\n");
  }

  if (first.kind === "structured") {
    // v1.3 — dispatch per-skill formatters.
    // 1. Look for a `tool-result` block (B-class
    //    shape) in the result's content. The
    //    first block might be a `tool-call` (if
    //    the model called a tool but the result
    //    somehow doesn't include the tool's
    //    response — rare but possible) or a
    //    `tool-result` (B-class shape).
    // 2. Find the FIRST `tool-result` block.
    //    Format it via the per-skill formatter.
    // 3. If there are `tool-call` blocks BEFORE
    //    the `tool-result` block in the same
    //    result, format them too (Q5 narrow) +
    //    prepend to the result's summary.
    return formatStructuredContent(result);
  }

  if (first.kind === "file") {
    return `Saved to vault: ${first.vaultPath}`;
  }

  if (first.kind === "image") {
    return `Saved image to vault: ${first.vaultPath}`;
  }

  return "";
}

/**
 * Handle the `structured` first block path
 * (v1.3 dispatch). Returns `undefined` for
 * silent fall-through (Q6 — unknown schemaRef
 * or non-B-class skillId; the caller falls
 * back to the v1.1 free-form LLM ask).
 *
 * @param result The skill's signed result.
 * @returns The formatted text, or `undefined`
 *   on silent fall-through.
 */
function formatStructuredContent(
  result: SignedAgentResult,
): string | undefined {
  // Find the first `tool-result` block in the
  // result. If the first block is a `tool-call`
  // (model called the tool but no result), we
  // format the tool-call alone (rare).
  const toolResultIndex = result.content.findIndex(
    (b): b is Extract<ContentBlock, { kind: "structured" }> =>
      b.kind === "structured" && b.schemaRef === TOOL_RESULT_SCHEMA_REF,
  );

  if (toolResultIndex === -1) {
    // No `tool-result` block. Check if the first
    // block is a `tool-call` — format it alone.
    const first = result.content[0];
    if (first !== undefined && first.kind === "structured" &&
        first.schemaRef === TOOL_CALL_SCHEMA_REF) {
      return formatToolCallBlock(first.data);
    }
    // Unknown structured shape — silent fall-
    // through (Q6) with a debug log.
    return silentStructuredFallback(result.skillId, first);
  }

  const toolResultBlock = result.content[toolResultIndex];
  if (toolResultBlock === undefined || toolResultBlock.kind !== "structured") {
    return undefined;
  }

  // Parse the tool-result's `data.content` as
  // JSON (the bridge wraps the per-skill result
  // in `{ content: JSON.stringify(result) }`).
  const parsed = parseToolResultContent(toolResultBlock.data);

  // Look up the B-class formatter. If the
  // skillId isn't a B-class skill, fall
  // through (Q6 — silent + debug log).
  const formatted = parsed !== undefined
    ? formatBClassResult(result.skillId, parsed)
    : undefined;

  if (formatted === undefined) {
    return silentStructuredFallback(
      result.skillId,
      toolResultBlock,
    );
  }

  // Q5 (narrow) — look for `tool-call` blocks
  // BEFORE the `tool-result` block. Format them
  // + prepend to the result's summary.
  const toolCallSummaries: string[] = [];
  for (let i = 0; i < toolResultIndex; i++) {
    const b = result.content[i];
    if (b === undefined) continue;
    if (b.kind === "structured" && b.schemaRef === TOOL_CALL_SCHEMA_REF) {
      const summary = formatToolCallBlock(b.data);
      if (summary !== undefined) {
        toolCallSummaries.push(summary);
      }
    }
  }
  if (toolCallSummaries.length === 0) {
    return formatted;
  }
  // Join the tool-call summaries (rare; usually 1)
  // + the tool-result summary with `\n\n` (chat
  // multi-block separator).
  return [...toolCallSummaries, formatted].join("\n\n");
}

/**
 * Parse a `tool-result` block's `data.content`
 * as JSON. The bridge wraps the per-skill result
 * in `{ content: JSON.stringify(result) }`.
 *
 * @returns The parsed JSON, or `undefined` when
 *   the data shape is wrong or the JSON is
 *   malformed (graceful degradation).
 */
function parseToolResultContent(data: unknown): unknown {
  if (data === null || typeof data !== "object") return undefined;
  const d = data as { content?: unknown };
  if (typeof d.content !== "string") return undefined;
  try {
    return JSON.parse(d.content);
  } catch {
    return undefined;
  }
}

/**
 * Format a `tool-call` block's `data` as a
 * short chat line. The `tool-call` block has
 * shape `{ id, name, args }`.
 *
 * **Output example:** "Sponsor: called `sponsor_friend` (force=true)".
 *
 * @returns The summary, or `undefined` when the
 *   data shape is wrong.
 */
function formatToolCallBlock(data: unknown): string | undefined {
  if (data === null || typeof data !== "object") return undefined;
  const d = data as { name?: unknown; args?: unknown };
  if (typeof d.name !== "string") return undefined;
  // Format the args as a short key=value list
  // (skip if empty).
  let argsStr = "";
  if (d.args !== undefined && d.args !== null && typeof d.args === "object") {
    const entries = Object.entries(d.args as Record<string, unknown>);
    if (entries.length > 0) {
      argsStr = ` (${entries
        .map(([k, v]) => `${k}=${stringifyArgValue(v)}`)
        .join(", ")})`;
    }
  }
  // Use a friendly display name. The bridge's
  // tool name is `sponsor_friend` (snake_case);
  // we turn it into "Sponsor" (the friendly
  // version). For unknown tool names, use
  // the snake_case name as-is.
  const displayName = friendlyToolName(d.name);
  return `${displayName}: called \`${d.name}\`${argsStr}`;
}

/**
 * Map the bridge's BUILTIN tool name to a
 * user-friendly display name. The bridge's
 * tool names are snake_case (BUILTIN
 * convention); the chat surface prefers
 * Title Case.
 */
function friendlyToolName(toolName: string): string {
  switch (toolName) {
    case "sponsor_friend":
      return "Sponsor";
    case "list_peers":
      return "Peers";
    case "relay_status":
      return "Relay";
    case "read_file":
      return "File";
    case "bash":
      return "Bash";
    default:
      return toolName;
  }
}

/**
 * Stringify a tool-call arg value for the
 * chat summary. Defensive against nested
 * objects (truncated to a short form).
 */
function stringifyArgValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") {
    return value.length > 32 ? `"${value.slice(0, 32)}..."` : `"${value}"`;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.length} items]`;
  }
  return "{...}";
}

/**
 * Q6 — silent fall-through for unknown
 * `structured` blocks. Logs a `console.debug`
 * line so owners can diagnose misconfigured
 * skills in dev/staging. Returns `undefined`
 * so the caller falls back to the v1.1
 * free-form LLM ask.
 */
function silentStructuredFallback(
  skillId: string,
  block: ContentBlock | undefined,
): undefined {
  const schemaRef = block?.kind === "structured" ? block.schemaRef : "(unknown)";
  console.debug(
    `[skill-result-formatter] no B-class formatter for skillId '${skillId}' ` +
      `(schemaRef: '${schemaRef}'); falling through to v1.1 LLM ask ` +
      `(Q6 silent fall-through)`,
  );
  return undefined;
}
