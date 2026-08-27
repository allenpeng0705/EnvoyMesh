/**
 * Phase A / Item 5 — the `AskForApproval` shim.
 *
 * **Reference:** gap-closure-plan item 5 + deepseek
 * `approval.ts` (`AskForApproval` delegates to
 * `ctx.userQuestions`).
 *
 * **What this does:** the existing `AskHandler` is the
 * host's per-call approval callback (F9.1). When a hook
 * returns `kind: "ask"`, the agent calls the handler; the
 * handler returns an `AskDecision` (`allow` / `deny` /
 * `modify`). This shim translates between the
 * `AskHandler` surface and the `UserQuestionService`
 * surface (chunk 5.1), so the human sees ONE interaction
 * surface (REPL picker, Tauri dialog, mesh composer) for
 * BOTH `ask_user` tool calls and approval asks.
 *
 * **Why a factory, not a singleton:** two agents can
 * share the same `UserQuestionService` but have different
 * shims (e.g. one agent's shim adds a third "modify"
 * option later without affecting another). The factory
 * also takes the service as a closure, keeping the shim
 * stateless and easy to test.
 *
 * **The translation table** is in
 * [`docs/implementation-plan-chunk-5-2.md`](../../docs/implementation-plan-chunk-5-2.md).
 * The short version:
 *
 * - **Yes (option 0) → `allow`; No (option 1) → `deny`.**
 *   The picker shows `["Yes", "No"]` by default.
 * - **Free-form "y" / "yes" / "Y" / "YES" → `allow`;**
 *   anything else → `deny`. The deepseek convention
 *   is fail-closed.
 * - **Cancellation → `deny`** with the cancellation
 *   reason in the message. "no-provider" becomes
 *   "no user channel" (matches the tool's
 *   benign-fall-through semantics).
 *
 * **Backward compat:** the shim is INSTALLED by the
 * `Agent` constructor ONLY when (a) `userQuestions` is
 * set AND (b) the host did not provide an explicit
 * `askHandler`. An explicit `askHandler` always wins.
 *
 * **Stability:** additive. New translation rules are
 * additive (e.g. a future "modify" option for
 * `AskRequest` to expose the existing `modify` decision).
 */
// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
/**
 * Build an `AskHandler` that delegates to the given
 * `UserQuestionService`. The returned handler is
 * stateless and safe to share across multiple hooks
 * (one Agent can have one shim).
 *
 * @example
 *   const service = createUserQuestionService();
 *   const askHandler = createAskForApprovalShim({ service });
 *   const agent = new Agent({ ..., userQuestions: service, askHandler });
 *   // OR: just pass `userQuestions`; the agent installs the shim
 *   // automatically when `askHandler` is absent.
 */
export function createAskForApprovalShim(options) {
    const { service } = options;
    const labels = options.options ?? DEFAULT_OPTIONS;
    const format = options.formatPrompt ?? defaultFormatPrompt;
    return async (req) => {
        const uqReq = {
            prompt: format(req),
            options: labels,
            signal: req.signal,
        };
        const answer = await service.ask(uqReq);
        return translateAnswer(answer);
    };
}
// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------
/** The default Yes / No labels. The first → `allow`; the second → `deny`. */
const DEFAULT_OPTIONS = ["Yes", "No"];
/**
 * Build the prompt the human sees. Includes the tool
 * name, a short summary of the args, and the original
 * question.
 *
 * **Why a short arg summary:** the human needs enough
 * context to decide without seeing the full JSON dump.
 * For `bash` we show the `command`; for `read_file` the
 * `path`; everything else falls back to
 * `JSON.stringify(args)`.
 */
function defaultFormatPrompt(req) {
    const action = summarizeArgs(req.tool, req.args);
    const lines = [`Allow ${req.tool} to ${action}?`];
    if (req.question) {
        lines.push("");
        lines.push(req.question);
    }
    return lines.join("\n");
}
/**
 * Pick a short human-legible string summarizing `args`
 * for the given tool. Falls back to a JSON dump for
 * tools that don't have a known shape.
 */
function summarizeArgs(tool, args) {
    if (args === null || typeof args !== "object") {
        return JSON.stringify(args);
    }
    const obj = args;
    switch (tool) {
        case "bash": {
            if (typeof obj["command"] === "string") {
                // Truncate long commands so the prompt stays
                // scannable. A 200-char `cat foo.txt` is not a
                // help to the human — they can see the args
                // in the AskRequest's `args` field if they
                // want the full thing.
                return `run \`${truncate(obj["command"], 100)}\``;
            }
            break;
        }
        case "read_file": {
            if (typeof obj["path"] === "string") {
                return `read \`${truncate(obj["path"], 100)}\``;
            }
            break;
        }
        case "write": {
            if (typeof obj["path"] === "string") {
                return `write to \`${truncate(obj["path"], 100)}\``;
            }
            break;
        }
        case "edit": {
            if (typeof obj["path"] === "string") {
                return `edit \`${truncate(obj["path"], 100)}\``;
            }
            break;
        }
        case "git": {
            if (typeof obj["subcommand"] === "string") {
                return `run \`git ${truncate(obj["subcommand"], 60)}\``;
            }
            break;
        }
        case "ask_user": {
            if (typeof obj["prompt"] === "string") {
                return `ask you: ${truncate(obj["prompt"], 60)}`;
            }
            break;
        }
    }
    // Unknown tool / shape — JSON dump. Long JSON
    // strings get truncated so the prompt stays scannable.
    const dumped = JSON.stringify(args);
    return truncate(dumped, 80);
}
/** Truncate `s` to `max` characters, adding "..." when cut. */
function truncate(s, max) {
    if (s.length <= max)
        return s;
    return `${s.slice(0, max - 3)}...`;
}
/**
 * Map a `UserQuestionAnswer` back to an `AskDecision`.
 * The translation table lives in
 * [`docs/implementation-plan-chunk-5-2.md`](../../docs/implementation-plan-chunk-5-2.md).
 */
function translateAnswer(answer) {
    if (answer.cancelled) {
        const reason = answer.cancelledReason ?? "aborted";
        if (reason === "no-provider") {
            return { kind: "deny", reason: "no user channel" };
        }
        return { kind: "deny", reason: `user cancelled (${reason})` };
    }
    // Picker choice.
    if (answer.optionIndex === 0) {
        return { kind: "allow" };
    }
    if (answer.optionIndex !== undefined && answer.optionIndex >= 1) {
        return { kind: "deny", reason: "user denied" };
    }
    // Free-form value. "y" / "yes" (case-insensitive)
    // → allow; everything else → deny. Fail-closed.
    const v = answer.value.trim().toLowerCase();
    if (v === "y" || v === "yes") {
        return { kind: "allow" };
    }
    return { kind: "deny", reason: `user denied (input: ${JSON.stringify(answer.value)})` };
}
//# sourceMappingURL=ask-for-approval-shim.js.map