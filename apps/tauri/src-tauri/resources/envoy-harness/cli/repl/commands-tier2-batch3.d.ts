/**
 * F14.1 — Tier 2 batch 3 commands.
 *
 * Two real-feature commands that complete the F14
 * REPL surface (the F18 commands identified by the
 * codex/claudecode/pi gap analysis that weren't
 * already shipped by F17.5 or F17.6):
 *
 * - `/rename <title>` — set the session's display
 *   title. Calls `ctx.agent.setTitle(title)`
 *   (or, if the session is in-memory, mutates the
 *   metadata directly). For `PersistedSession` this
 *   also rewrites the JSONL header on disk so the
 *   new title survives `--resume`.
 * - `/copy` — print the last assistant text. Reads
 *   `ctx.lastResponse` (the loop tracks the last
 *   turn's text in this field). When no turn has
 *   happened yet, prints "no response yet".
 *
 * **Why a separate file from F17.5 / F17.6:** the
 * F14 phase bundles the persistence work with the
 * F18 gap-analysis commands. F14.1 ships 2 commands
 * (`/rename`, `/copy`); F14.3 ships the other 2
 * (`/review`, `/export`). The original F14 plan
 * listed 3 batch-3 commands (`/new`, `/rename`,
 * `/copy`), but F17.5 already shipped `/new`
 * (start a fresh session — new id + new transcript),
 * which is the codex-equivalent semantic. The
 * `/clear` vs `/new` distinction in codex/
 * claudecode is preserved: F17.2 `/clear` resets
 * the transcript (keeps id, keeps AGENTS.md);
 * F17.5 `/new` mints a new session id.
 *
 * **v0 limitations:**
 * - `/rename` does NOT validate the title (no
 *   length cap, no character restriction). A
 *   future chunk can add a max-length + character
 *   policy.
 * - `/copy` prints to stdout, NOT the system
 *   clipboard. "Copy" in the v0 sense is "print
 *   the text so the user can copy it manually
 *   (or pipe to pbcopy/xclip)". A real clipboard
 *   integration is a host concern (the Tauri app
 *   can wire it; the v0 CLI doesn't).
 * - `/copy` only tracks the LAST response. There's
 *   no `/copy <n>` for older turns. A future
 *   chunk can add a message index.
 */
import type { ReplCommand } from "./types.js";
export declare const BUILTIN_TIER2_BATCH3_COMMANDS: ReadonlyArray<ReplCommand>;
//# sourceMappingURL=commands-tier2-batch3.d.ts.map