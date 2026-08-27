/**
 * Phase A / Item 5 — the model-facing `ask_user` tool.
 *
 * **Reference:** gap-closure-plan item 5 + deepseek
 * `tool-ask-user` (`ctx.userQuestions.ask(...)`).
 *
 * **What this does:** the model calls `ask_user` when it
 * needs human input ("which option?", "what's the project
 * root?", "paste the error log"). The tool delegates to
 * the `UserQuestionService` (chunk 5.1) and returns the
 * human's answer as a `tool_result` so the model can
 * continue.
 *
 * **Why a tool, not an `Agent.run` option:** tools are
 * how the model expresses "I need help". The model
 * decides WHEN to ask based on its own judgment; making
 * it a tool means the model sees the tool in its tool
 * list and decides dynamically.
 *
 * **Auto-registration:** the `Agent` constructor registers
 * this tool when the host provides a `userQuestions` field
 * (same pattern as `makeTaskTool({ submitter })` and
 * `makeLspTools(manager)`). No `userQuestions` → no
 * `ask_user` tool. The model never sees it.
 *
 * **Result mapping** (the model sees one of these in the
 * `tool_result` block — see
 * [`docs/implementation-plan-chunk-5-2.md`](../../docs/implementation-plan-chunk-5-2.md)
 * for the full table):
 *
 * | Service answer | `isError` | content |
 * |---|---|---|
 * | `{ value: "..." }` (free-form) | `false` | `User answered: <value>` |
 * | `{ value: "no", optionIndex: 1 }` | `false` | `User selected: "no" (option 2)` |
 * | multiline value | `false` | `User answered:\n<value>` |
 * | `cancelled: "no-provider"` | `false` | `no user channel available; please use your default answer` |
 * | `cancelled: "aborted" \| "timeout"` | `true` | `ask_user cancelled by user: <reason>` |
 *
 * **Why `isError: false` for `no-provider`:** the tool ran
 * successfully; there's just no human. The model should
 * treat this as a benign "fall through to your default"
 * condition, not as a tool failure. The "aborted" /
 * "timeout" cases ARE failures (the user actively stopped
 * the question); `isError: true` makes the model treat
 * them as recovery-worthy.
 *
 * **Stability:** additive. New fields on the args are
 * additive; new `cancelledReason` values are additive.
 */
import { z } from "zod";
import type { Tool } from "../tools/types.js";
import type { UserQuestionService } from "./user-questions.js";
/** Constructor options for `makeAskUserTool`. */
export interface MakeAskUserToolOptions {
    /**
     * The user-question service. Required — the tool is
     * useless without one. The agent's constructor wires
     * the service here; the tool doesn't construct or
     * own the service.
     */
    service: UserQuestionService;
}
/**
 * The tool's input. Mirrors `UserQuestionRequest` minus
 * `signal` (the agent's `ctx.abortSignal` is used).
 */
declare const AskUserInputSchema: z.ZodObject<{
    prompt: z.ZodString;
    options: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    recommendedIndex: z.ZodOptional<z.ZodNumber>;
    multiline: z.ZodOptional<z.ZodBoolean>;
    timeoutMs: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    prompt: string;
    options?: string[] | undefined;
    timeoutMs?: number | undefined;
    recommendedIndex?: number | undefined;
    multiline?: boolean | undefined;
}, {
    prompt: string;
    options?: string[] | undefined;
    timeoutMs?: number | undefined;
    recommendedIndex?: number | undefined;
    multiline?: boolean | undefined;
}>;
/** Inferred input type for the `ask_user` tool. */
export type AskUserInput = z.infer<typeof AskUserInputSchema>;
/**
 * Build the `ask_user` tool. The host provides the
 * `UserQuestionService`; the tool calls it on every
 * invocation.
 *
 * @example
 *   const service = createUserQuestionService();
 *   service.registerProvider(createReplStdinProvider());
 *   const tools = new ToolRegistry();
 *   tools.register(makeAskUserTool({ service }));
 *   const agent = new Agent({ ..., tools, userQuestions: service });
 */
export declare function makeAskUserTool(options: MakeAskUserToolOptions): Tool<typeof AskUserInputSchema>;
export {};
//# sourceMappingURL=ask-user-tool.d.ts.map