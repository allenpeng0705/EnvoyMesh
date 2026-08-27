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
import { spawn } from "node:child_process";
/** Default timeout for shell handlers, in milliseconds. */
const DEFAULT_TIMEOUT_MS = 5000;
/** Maximum stderr length to include in the block reason. */
const MAX_STDERR_REASON = 200;
/** The exit code a hook uses to signal a blocking error (deepseek
 *  hook-protocol convention: exit 2 = block with stderr as reason). */
const BLOCKING_EXIT_CODE = 2;
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
export async function runShellHandler(command, eventName, payload, timeoutMs = DEFAULT_TIMEOUT_MS) {
    return new Promise((resolve) => {
        const child = spawn("sh", ["-c", command], {
            env: {
                ...process.env,
                HOOK_EVENT: eventName,
                HOOK_PAYLOAD: JSON.stringify(payload),
                TOOL_CALL: JSON.stringify(payload), // legacy alias
                RESULT_FILE: "", // populated by PostToolUse (not used in v0)
            },
            stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill("SIGKILL");
        }, timeoutMs);
        if (child.stdout) {
            child.stdout.on("data", (d) => {
                stdout += d.toString();
            });
        }
        if (child.stderr) {
            child.stderr.on("data", (d) => {
                stderr += d.toString();
            });
        }
        child.on("close", (code) => {
            clearTimeout(timer);
            if (timedOut) {
                resolve({
                    kind: "block",
                    reason: `hook timed out after ${timeoutMs}ms`,
                });
                return;
            }
            if (code !== 0) {
                // Phase B / Item 15.2: exit 2 is the deepseek
                // convention for "block with stderr as the reason"
                // (the legacy top-level `decision: "block"` shape
                // also uses this exit code). Other non-zero exits
                // are still treated as a generic block (matches
                // the v0 behavior — the legacy top-level shape
                // expected exit 0 for everything else).
                //
                // The deepseek codec trims stderr (it's
                // typically a multi-line free-form field that
                // gets surfaced to the model; a trailing newline
                // is noise). MAX_STDERR_REASON caps the length.
                const trimmed = stderr.trim().slice(0, MAX_STDERR_REASON);
                resolve({
                    kind: "block",
                    reason: code === BLOCKING_EXIT_CODE
                        ? trimmed || "blocked by hook"
                        : `hook exited ${code}${trimmed ? `: ${trimmed}` : ""}`,
                });
                return;
            }
            // Parse stdout. JSON shape takes precedence; fall back to
            // plain text as add-context.
            const parsed = tryParseJson(stdout);
            if (parsed) {
                const decision = mapJsonToDecision(parsed, eventName);
                resolve(decision);
                return;
            }
            // Non-JSON stdout: treat as add-context (if non-empty).
            const trimmed = stdout.trim();
            if (trimmed.length > 0) {
                resolve({ kind: "add-context", content: trimmed });
            }
            else {
                resolve({ kind: "continue" });
            }
        });
        child.on("error", (err) => {
            clearTimeout(timer);
            resolve({
                kind: "block",
                reason: `hook failed to start: ${err.message}`,
            });
        });
    });
}
/**
 * Run a module handler. Imports the module, calls its default
 * export with `{ name: eventName, payload }` (the `HookEvent` shape).
 * The default export must be a `HookFn` (see `types.js`).
 *
 * **Why dynamic import?** the module path is user-provided
 * (from `hooks.toml`). Static imports are resolved at compile
 * time and would not allow user-provided paths.
 */
export async function runModuleHandler(modulePath, eventName, payload) {
    try {
        const mod = await import(modulePath);
        if (typeof mod.default !== "function") {
            return {
                kind: "block",
                reason: `hook module ${modulePath} has no default export`,
            };
        }
        return await mod.default({ name: eventName, payload });
    }
    catch (err) {
        return {
            kind: "block",
            reason: `hook module ${modulePath} failed: ${err.message}`,
        };
    }
}
/**
 * Map a parsed JSON stdout object to a `HookDecision`.
 * The shape accepts BOTH the legacy envoy top-level shape
 * AND the deepseek `hook-protocol` extensions (see the
 * file header for the full list).
 *
 * **Precedence:** `hookSpecificOutput.permissionDecision`
 * (the deepseek extension) overrides the legacy top-level
 * `decision`. The `additionalContext` field is gathered
 * alongside the decision; when the firing event is NOT
 * `PreToolUse` / `PostToolUse` (where an `add-context` from
 * a hook is appropriate), it's still surfaced (the
 * `HookRegistry` decides whether to apply it based on
 * the event name).
 *
 * **Discriminator:** when `hookSpecificOutput.hookEventName`
 * is set and DOESN'T match the firing event, the
 * event-scoped fields (`permissionDecision`,
 * `additionalContext`, etc.) are discarded; the
 * legacy top-level fields still apply. The
 * discriminator value is preserved in the decision's
 * `reason` (prepended) so the log shows the mismatch.
 */
function mapJsonToDecision(parsed, eventName) {
    // The legacy top-level decision (approve / block /
    // continue / add-context / modify). The deepseek codec
    // accepts the same vocabulary on the top level.
    const topDecision = parsed["decision"];
    const topReason = toStr(parsed["reason"]);
    // The deepseek `hookSpecificOutput` block.
    const hso = asObject(parsed["hookSpecificOutput"]);
    const claimedEventName = hso ? toStr(hso["hookEventName"]) : undefined;
    // The firing event MUST match the claimed event (when
    // the hook bothered to claim one). A mismatch discards
    // the event-scoped fields only — the legacy top-level
    // decision still applies.
    const hsoMatches = hso === undefined ||
        claimedEventName === undefined ||
        claimedEventName === eventName;
    // The deepseek `permissionDecision` field (allow/deny/ask).
    // Only consulted when the event-specific block matches
    // (or is absent). The legacy top-level decision loses
    // to it.
    let permissionDecision;
    let permissionReason;
    if (hso !== undefined && hsoMatches) {
        const pd = hso["permissionDecision"];
        if (pd === "allow" || pd === "deny" || pd === "ask") {
            permissionDecision = pd;
        }
        permissionReason = toStr(hso["permissionDecisionReason"]);
    }
    // The `additionalContext` field (deepseek CC extension).
    // Applied as `add-context` when present. Composed with
    // any legacy top-level `decision: "add-context"` (the
    // hook is allowed to set either; we surface both).
    let additionalContext;
    if (hso !== undefined && hsoMatches) {
        additionalContext = toStr(hso["additionalContext"]);
    }
    // Resolve the final decision kind. Order:
    // 1. `permissionDecision` (deepseek extension) — wins.
    // 2. legacy top-level `decision` (envoy's original shape).
    // 3. `add-context` (either from top-level or
    //    `additionalContext`).
    // 4. fall through to `continue`.
    // 1. permissionDecision
    if (permissionDecision !== undefined) {
        if (permissionDecision === "deny") {
            return {
                kind: "block",
                reason: permissionReason ?? topReason ?? "denied by hook",
            };
        }
        if (permissionDecision === "ask") {
            // The `ask` decision is for PreToolUse (and any other
            // event that wants to ask the user a question).
            return {
                kind: "ask",
                question: permissionReason ?? topReason ?? "hook asks for confirmation",
            };
        }
        // "allow" — proceed (continue).
        return { kind: "continue" };
    }
    // 2. legacy top-level decision
    if (typeof topDecision === "string") {
        if (topDecision === "block") {
            return {
                kind: "block",
                reason: topReason ?? "blocked by hook",
            };
        }
        if (topDecision === "add-context") {
            const content = toStr(parsed["content"]) ?? "";
            return { kind: "add-context", content };
        }
        if (topDecision === "modify") {
            return { kind: "modify", modified: parsed["modified"] };
        }
        // Unknown top-level decision (e.g. "approve") — treat
        // as continue.
        return { kind: "continue" };
    }
    // 3. additionalContext alone (no decision)
    if (additionalContext !== undefined) {
        return { kind: "add-context", content: additionalContext };
    }
    // 4. fall through
    // When the event-specific block mismatched, we discard
    // the event-scoped fields (per deepseek's protocol). The
    // legacy top-level fields (if any) already produced a
    // decision above; if we got here with a mismatch, the
    // hook emitted no usable decision → continue. (We could
    // log the mismatch via a side channel, but v0 keeps
    // the runner pure; the existing `verbose` log captures
    // it via the `fire()` path.)
    return { kind: "continue" };
}
/**
 * Try to parse stdout as JSON. Returns the parsed object, or
 * `null` if the stdout is not valid JSON. Used by the shell
 * runner to interpret the handler's decision.
 */
function tryParseJson(stdout) {
    const trimmed = stdout.trim();
    if (trimmed.length === 0)
        return null;
    if (!trimmed.startsWith("{"))
        return null;
    try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed === "object" && parsed !== null)
            return parsed;
        return null;
    }
    catch {
        return null;
    }
}
/** Coerce an unknown value to a string, or `undefined`. */
function toStr(value) {
    return typeof value === "string" ? value : undefined;
}
/** A plain (non-null, non-array) object, or `undefined`. */
function asObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? value
        : undefined;
}
//# sourceMappingURL=runner.js.map