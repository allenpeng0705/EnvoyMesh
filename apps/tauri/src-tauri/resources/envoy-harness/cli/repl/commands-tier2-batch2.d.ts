/**
 * F17.6 — Tier 2 batch 2 commands.
 *
 * Two real-feature commands that complete the F17
 * REPL surface:
 * - `/agents` — list sub-agents spawned by this
 *   session's `task` tool calls. Reads from
 *   `ctx.subagentRegistry.list()`.
 * - `/diff` — `git diff` vs HEAD. Thin wrapper
 *   around the `git` CLI.
 *
 * **Why a separate file from F17.5's
 * `commands-tier2.ts`:** consistent with the
 * existing F17.2 / F17.2.5 split (one file per
 * tier). The two batches are distinct
 * (commit-wise) but live in the same directory.
 *
 * **`/undo`** reverts the last `write` / `edit` tool change (action journal).
 *
 * **v0 limitations:**
 * - `/diff` runs `git diff` (no args; unstaged
 *   changes vs HEAD). The `--stat` flag is a
 *   future chunk.
 * - `/diff` does NOT use the bash tool (no
 *   permission check, no validation). The user
 *   explicitly opted into the diff view; the
 *   permission policy doesn't apply to read-only
 *   inspection commands.
 * - `/agents` shows a flat list; no grouping
 *   by status / parent / capability. Future:
 *   `/agents --running` filters to running.
 */
import type { ReplCommand } from "./types.js";
/**
 * F17.6: list of the 2 Tier 2 batch 2 commands. The
 * runner includes this in the default registry after
 * `BUILTIN_TIER2_COMMANDS` (built-ins always win on
 * name collision).
 *
 * **Defined last** because each entry is a `const`
 * declared above. Forward references in `const` arrays
 * would force us to either inline the literals (less
 * readable) or convert each command to a function
 * declaration (less idiomatic for a data literal).
 * The bottom-of-file position is the cleanest fix
 * (same pattern as `BUILTIN_COMMANDS` in
 * `commands.ts`, `BUILTIN_INFO_COMMANDS` in
 * `commands-info.ts`, and `BUILTIN_TIER2_COMMANDS` in
 * `commands-tier2.ts`).
 */
export declare const BUILTIN_TIER2_BATCH2_COMMANDS: ReadonlyArray<ReplCommand>;
//# sourceMappingURL=commands-tier2-batch2.d.ts.map