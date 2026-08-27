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
import type { AskHandler, AskRequest } from "../types.js";
import type { UserQuestionService } from "./user-questions.js";
/** Constructor options for `createAskForApprovalShim`. */
export interface CreateAskForApprovalShimOptions {
    /**
     * The user-question service the shim delegates to.
     * Required. The shim does NOT own the service; the
     * host (Agent, REPL) registers a provider and shares
     * the service between the ask_user tool and the
     * shim.
     */
    service: UserQuestionService;
    /**
     * Optional override for the "yes" / "no" labels.
     * Default: `["Yes", "No"]`. The first entry maps to
     * `allow`; the second to `deny`. More than two
     * entries are ignored (the picker shows at most
     * two options for a yes/no decision).
     */
    options?: ReadonlyArray<string>;
    /**
     * Optional override for the rendered prompt header.
     * Default: `"Allow {tool} to {action}?\n\n{question}"`
     * where `{action}` is a short summary of the args
     * (e.g. the `command` for `bash`, the `path` for
     * `read_file`).
     */
    formatPrompt?: (req: AskRequest) => string;
}
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
export declare function createAskForApprovalShim(options: CreateAskForApprovalShimOptions): AskHandler;
//# sourceMappingURL=ask-for-approval-shim.d.ts.map