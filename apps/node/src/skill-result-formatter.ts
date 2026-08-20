/**
 * Phase 8 / v1.2 — format a skill's
 * `SignedAgentResult` as a chat-reply string.
 *
 * **What this is:** the bridge between the
 * envoy-harness skill `execute()` API (which
 * returns a structured `AgentResult` with typed
 * `ContentBlock[]` content) and the Tauri user-
 * prompt chat surface (which expects a string).
 *
 * **v1.2 rules (Q2 of the v1.2 sub-plan):**
 * - First block is `text` → return `block.text`.
 * - Multiple text blocks → join with `\n\n`.
 * - First block is `structured` (B-class
 *   orchestration skills like `setup-sponsor-friend`
 *   / `peer-list` / `relay-status`) → throw
 *   `StructuredResultError`. The dispatch catches
 *   + falls back to v1.1 free-form LLM ask. The
 *   per-skill formatter is v1.3+.
 * - First block is `file` or `image` → return a
 *   1-line summary (the vault path). v1.2 doesn't
 *   embed the content in the chat reply.
 * - Empty content array → return `""`.
 *
 * **Why v1.2 doesn't auto-route to B-class
 * skills:** the B-class skills return structured
 * data (peer IDs, relay book snapshots) that
 * doesn't have a natural 1-line summary. A 1-line
 * summary might be wrong (e.g. "Bonded with
 * sponsor" misses the bond flow's side effects).
 * The v1.2 dispatch falls through to the
 * free-form LLM ask, which is the safe default.
 * The formatter is v1.3+, after we have real
 * prompts to calibrate against.
 *
 * **Why the `StructuredResultError` instead of
 * returning an empty string:** the dispatch needs
 * to distinguish "skill returned text" (use it)
 * from "skill returned structured" (fall through
 * to LLM). An empty string is ambiguous (could be
 * a real "no output" result); a typed error is
 * clear.
 *
 * **Pure function:** no I/O, no side effects.
 * Tests pass a synthetic `SignedAgentResult`.
 */

import type {
  ContentBlock,
  SignedAgentResult,
} from "@envoymesh/protocol";

/**
 * Thrown when the first content block is
 * `structured` (B-class). The dispatch catches
 * + falls back to v1.1 free-form LLM ask (Q2 +
 * Q7 of the v1.2 sub-plan).
 */
export class StructuredResultError extends Error {
  constructor(
    /** The skill ID that returned the structured result. */
    public readonly skillId: string,
    /** The structured block's schemaRef (e.g.
        `'envoymesh://sponsor-bond/v1'`). Useful
        for v1.3's per-skill formatter. */
    public readonly schemaRef: string,
  ) {
    super(
      `skill '${skillId}' returned a structured first block ` +
        `(schemaRef: '${schemaRef}'); v1.2 falls through to ` +
        `free-form LLM ask (per-skill formatter is v1.3+)`,
    );
    this.name = "StructuredResultError";
  }
}

/**
 * Format a skill's `SignedAgentResult.content`
 * as a chat-reply string.
 *
 * @param result The skill's signed result.
 * @returns The formatted text. For `text` first
 *   blocks: the block's text (or `\n\n`-joined
 *   multiple text blocks). For `file` / `image`:
 *   a 1-line vault-path summary. For `structured`:
 *   throws `StructuredResultError`. For empty
 *   content: `""`.
 */
export function formatSkillResult(result: SignedAgentResult): string {
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
    throw new StructuredResultError(result.skillId, first.schemaRef);
  }

  if (first.kind === "file") {
    // v1.2 — vault file summary. The full
    // content is referenced by vaultPath;
    // the chat reply points to it. v1.3+ can
    // embed the content if useful.
    return `Saved to vault: ${first.vaultPath}`;
  }

  if (first.kind === "image") {
    return `Saved image to vault: ${first.vaultPath}`;
  }

  // Exhaustiveness check — should be
  // unreachable. Return empty string as a
  // safe default; the dispatch will fall
  // through to the LLM ask on empty output.
  return "";
}
