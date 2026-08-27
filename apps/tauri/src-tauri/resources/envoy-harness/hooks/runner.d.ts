/**
 * Hook runners — execute a single hook handler.
 *
 * **Two runners** (per design §8.3):
 *
 * - `runShellHandler` — spawn a shell, run a command, parse the
 *   output into a `HookDecision`. Used for the `handler.command`
 *   case.
 *
 * - `runModuleHandler` — `import()` a TS module, call its default
 *   export. Used for the `handler.module` case.
 *
 * **Wire format for shell handlers:**
 *
 * The shell handler receives the event payload via env vars:
 * - `HOOK_EVENT` — the event name (string)
 * - `HOOK_PAYLOAD` — the event payload (JSON string)
 * - `TOOL_CALL` — legacy alias for `HOOK_PAYLOAD` (deprecated)
 * - `RESULT_FILE` — populated by PostToolUse (not used in v0)
 *
 * The handler's stdout is parsed as JSON if possible:
 *   { "decision": "block", "reason": "..." }
 *   { "decision": "add-context", "content": "..." }
 *   { "decision": "continue" }  (or any other value)
 *
 * If stdout is not valid JSON, it's treated as `add-context` content
 * (after trimming). This is the "easy mode" — just `echo` something
 * and it's added to the context.
 *
 * **Non-zero exit** is treated as `block` with the first 200 chars
 * of stderr as the reason. This matches Codex's behavior.
 *
 * **Phase B / Item 15.2 — deepseek codec extensions:** in
 * addition to the legacy top-level shape, the runner now
 * recognizes the deepseek `hook-protocol` extensions:
 *
 * - **Exit 2** → `block` with stderr as the reason (the
 *   legacy block-with-stderr semantics, but only on exit
 *   2 specifically — other non-zero exits are still
 *   treated as a generic "hook exited N" block).
 * - **`permissionDecision`** (`allow` / `deny` / `ask`)
 *   in `hookSpecificOutput` → `continue` / `block` / `ask`
 *   (the existing `ask` decision kind is for `PreToolUse`).
 * - **`additionalContext`** in `hookSpecificOutput` → the
 *   existing `add-context` decision.
 * - **`hookSpecificOutput.hookEventName`** — when set,
 *   must match the firing event. A mismatch discards the
 *   event-scoped fields (the legacy top-level fields still
 *   apply). The discriminator is always surfaced in the
 *   decision when present, even on a mismatch (useful
 *   for the log).
 *
 * **Timeout** (default 5s) uses `SIGKILL` because a hung shell can't
 * be politely asked to exit. The decision is `block` with a
 * `timed out after Xms` reason.
 *
 * **Security:** hooks run with the same permission system as the
 * bash tool. A hook that does `rm -rf /` is caught by
 * `readOnlyValidation` if the session is in read-only mode. Hooks
 * are not a back door; they are part of the same trust model.
 */
import type { HookDecision, HookEventName } from "../types.js";
/**
 * Run a shell handler. The command runs in `sh -c "$command"`, with
 * the event payload passed via env vars. See file header for the
 * wire format.
 *
 * **Timeout:** if the handler doesn't complete within `timeoutMs`
 * (default 5s), it's killed with `SIGKILL` and the decision is
 * `block` with a `timed out` reason.
 *
 * **Idempotency:** running the same handler twice with the same
 * input returns the same decision (modulo non-determinism in the
 * command itself, which is the user's responsibility).
 */
export declare function runShellHandler(command: string, eventName: HookEventName, payload: unknown, timeoutMs?: number): Promise<HookDecision>;
/**
 * Run a module handler. Imports the module, calls its default
 * export with `{ name: eventName, payload }` (the `HookEvent` shape).
 * The default export must be a `HookFn` (see `types.js`).
 *
 * **Why dynamic import?** the module path is user-provided
 * (from `hooks.toml`). Static imports are resolved at compile
 * time and would not allow user-provided paths.
 */
export declare function runModuleHandler(modulePath: string, eventName: HookEventName, payload: unknown): Promise<HookDecision>;
//# sourceMappingURL=runner.d.ts.map