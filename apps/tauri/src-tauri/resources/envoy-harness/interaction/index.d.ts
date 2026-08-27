/**
 * Phase A / Item 5 — public surface for the user-question
 * service. Re-exported by the package entry point so
 * consumers (Tauri host, mesh adapter) can register their
 * own providers.
 *
 * **Chunk 5.1:** the service + REPL stdin provider.
 * **Chunk 5.2:** the `ask_user` model-facing tool + the
 * `AskForApproval` shim that routes hook asks through
 * the same service.
 */
export { createUserQuestionService, type UserQuestionAnswer, type UserQuestionProvider, type UserQuestionRequest, type UserQuestionService, } from "./user-questions.js";
export { createReplStdinProvider, DEFAULT_MULTILINE_SENTINEL, type ReplStdinProviderOptions, } from "./providers/repl-stdin.js";
export { makeAskUserTool, type AskUserInput, type MakeAskUserToolOptions, } from "./ask-user-tool.js";
export { createAskForApprovalShim, type CreateAskForApprovalShimOptions, } from "./ask-for-approval-shim.js";
export { emptyTurnHints, hasTurnHints, mergeTurnHints, type DeferredTask, type TurnHints, } from "./turn-hints.js";
export { makeSuggestFollowUpsTool, type MakeSuggestFollowUpsToolOptions, } from "./suggest-follow-ups-tool.js";
//# sourceMappingURL=index.d.ts.map