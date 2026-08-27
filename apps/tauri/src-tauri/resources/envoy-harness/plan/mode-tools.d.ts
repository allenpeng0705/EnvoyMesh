/**
 * Model-facing plan mode tools (DeepSeek-shaped).
 *
 * - `enter_plan_mode` — ask the human to switch into plan mode
 * - `exit_plan_mode` — present a plan for review; approve → leave
 *   planning and keep an approved plan for injection
 */
import type { UserQuestionService } from "../interaction/user-questions.js";
import type { Tool } from "../tools/types.js";
export declare function makeEnterPlanModeTool(opts: {
    userQuestions: UserQuestionService;
}): Tool;
export declare function makeExitPlanModeTool(opts: {
    userQuestions: UserQuestionService;
}): Tool;
//# sourceMappingURL=mode-tools.d.ts.map