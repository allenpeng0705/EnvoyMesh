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
export { createUserQuestionService, } from "./user-questions.js";
export { createReplStdinProvider, DEFAULT_MULTILINE_SENTINEL, } from "./providers/repl-stdin.js";
export { makeAskUserTool, } from "./ask-user-tool.js";
export { createAskForApprovalShim, } from "./ask-for-approval-shim.js";
export { emptyTurnHints, hasTurnHints, mergeTurnHints, } from "./turn-hints.js";
export { makeSuggestFollowUpsTool, } from "./suggest-follow-ups-tool.js";
//# sourceMappingURL=index.js.map