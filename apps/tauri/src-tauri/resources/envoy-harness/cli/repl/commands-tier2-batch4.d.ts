/**
 * F14.3 — Tier 2 batch 4 commands.
 *
 * Two real-feature commands that complete the F14
 * REPL surface (the F18 gap-analysis commands
 * `codex /review` + `codex /export`):
 *
 * - `/review [staged]` — runs the model as a code
 *   reviewer. Reads `git diff` (default) or
 *   `git diff --cached` (with the `staged` arg)
 *   and sends the diff to the model with a
 *   system prompt. Prints the review to stdout.
 *   No diff (clean tree) → "no changes to review".
 *   Non-git dir → error to stderr.
 *
 * - `/export [format] [path]` — exports the
 *   current session. Formats: `jsonl` (default)
 *   and `md` (Markdown). Path: defaults to
 *   `<cwd>/<sessionId>.<ext>`. Writes a file the
 *   user can share / archive.
 *
 * **Why a separate file from F17.5/F17.6/F14.1:**
 consistent with the existing tier-2 batches
 (one file per batch). F14.3 is the F18 commands
 bundle — `/review` and `/export` are the last
 two F18 commands not yet shipped.
 *
 * **v0 limitations:**
 * - `/review` does NOT chunk very large diffs.
 *   A diff with 50k+ lines is sent in one model
 *   call (which may exceed the model's context
 *   window). A future chunk can add diff
 *   truncation / chunking.
 * - `/review` is human-text only (no machine-
 *   readable review). A future chunk can add
 *   `/review --format=json`.
 * - `/export` does NOT redact secrets. The
 *   exported file is the raw session. Users
 *   who share exported files should review
 *   them first.
 * - `/export` only writes JSONL or MD. PDF,
 *   HTML, etc. are future-chunk candidates.
 */
import type { ReplCommand } from "./types.js";
/**
 * F14.3 + Phase A / Item 6: list of the 3 Tier 2
 * batch 4 commands. The runner includes this in
 * the default registry after
 * `BUILTIN_TIER2_BATCH3_COMMANDS` (built-ins
 * always win on name collision).
 *
 * **Defined last** because each entry is a `const`
 * declared above. Forward references in `const`
 * arrays would force us to either inline the
 * literals (less readable) or convert each command
 * to a function declaration (less idiomatic for
 * a data literal). The bottom-of-file position is
 * the cleanest fix (same pattern as
 * `BUILTIN_COMMANDS` in `commands.ts`,
 * `BUILTIN_INFO_COMMANDS` in `commands-info.ts`,
 * `BUILTIN_TIER2_COMMANDS` in `commands-tier2.ts`,
 * `BUILTIN_TIER2_BATCH2_COMMANDS` in
 * `commands-tier2-batch2.ts`, and
 * `BUILTIN_TIER2_BATCH3_COMMANDS` in
 * `commands-tier2-batch3.ts`).
 */
export declare const BUILTIN_TIER2_BATCH4_COMMANDS: ReadonlyArray<ReplCommand>;
//# sourceMappingURL=commands-tier2-batch4.d.ts.map