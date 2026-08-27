/**
 * F17.5 — Tier 2 batch 1 commands (real features).
 *
 * Three commands that go beyond print/info:
 * - `/new` — start a fresh session (clear transcript + new id)
 * - `/compact` — context window compaction. Flags (chunk 1.2):
 *   - default → drop-oldest, keep last 20 messages
 *   - `--keep N` → drop-oldest with custom N
 *   - `--summarize` → LLM-summarize the dropped messages
 *   - `--budget N` → drop until total tokens ≤ N (token budget)
 * - `/init` — generate AGENTS.md via an LLM call + write to cwd
 *
 * **Why a separate file:** these commands need new Agent
 * capabilities (`newSession`, `compact`, `generateAgentsMd`).
 * The Tier 1 commands (F17.2.5) were pure data display.
 *
 * **Phase A / Item 1 (chunk 1.2):** added `--budget N` and
 * `--remote` flags. The `--remote` flag is parsed but the
 * v0 implementation is "log a warning + fall back to
 * budget" (the remote-history transport is a future chunk —
 * it needs a network or local-file target).
 */
import type { ReplCommand } from "./types.js";
/**
 * F17.5: list of the 3 Tier 2 batch 1 commands. The runner
 * includes this in the default registry after
 * `BUILTIN_COMMANDS` and `BUILTIN_INFO_COMMANDS` (built-ins
 * always win on name collision).
 *
 * **Defined last** because each entry is a `const` declared
 * above. Forward references in `const` arrays would force
 * us to either inline the literals (less readable) or
 * convert each command to a function declaration (less
 * idiomatic for a data literal). The bottom-of-file
 * position is the cleanest fix (same pattern as
 * `BUILTIN_COMMANDS` in `commands.ts` and
 * `BUILTIN_INFO_COMMANDS` in `commands-info.ts`).
 */
export declare const BUILTIN_TIER2_COMMANDS: ReadonlyArray<ReplCommand>;
//# sourceMappingURL=commands-tier2.d.ts.map