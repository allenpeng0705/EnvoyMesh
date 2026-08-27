/**
 * Model-facing plan mode tools (DeepSeek-shaped).
 *
 * - `enter_plan_mode` — ask the human to switch into plan mode
 * - `exit_plan_mode` — present a plan for review; approve → leave
 *   planning and keep an approved plan for injection
 */
import { z } from "zod";
import { applyTransition, createPlanState, } from "./state.js";
const APPROVE = "Approve plan and continue";
const KEEP = "Keep planning";
const ENTER_YES = "Switch to plan mode";
const ENTER_NO = "Stay in agent mode";
export function makeEnterPlanModeTool(opts) {
    const { userQuestions } = opts;
    return {
        name: "enter_plan_mode",
        description: "Ask the human whether to switch this session into plan mode " +
            "(investigate and draft a plan only — no workspace changes until " +
            "they approve). Use when the task is large, ambiguous, or risky " +
            "and a plan would help. Do not call when already in plan mode.",
        parameters: z.object({
            reason: z
                .string()
                .optional()
                .describe("Short reason shown to the human for switching."),
        }),
        async execute(args, ctx) {
            const current = ctx.session.getPlan() ?? createPlanState();
            if (current.active) {
                return {
                    content: "Already in plan mode — keep investigating / drafting.",
                };
            }
            const reason = args.reason !== undefined && args.reason.trim().length > 0
                ? args.reason.trim()
                : "This looks like a multi-step change that benefits from a plan first.";
            const answer = await userQuestions.ask({
                prompt: `${reason}\n\nSwitch to plan mode?`,
                options: [ENTER_YES, ENTER_NO],
                recommendedIndex: 0,
                signal: ctx.abortSignal,
            });
            if (answer.cancelled) {
                return {
                    content: "enter_plan_mode cancelled — stay in agent mode.",
                    isError: true,
                };
            }
            if (answer.optionIndex === 1 || answer.value === ENTER_NO) {
                return {
                    content: "User declined plan mode — continue in agent mode.",
                };
            }
            const next = applyTransition(current, { kind: "enter" });
            ctx.session.setPlan(next);
            return {
                content: "Plan mode is now active. Investigate and produce a plan only — " +
                    "do not modify the workspace until the user approves via exit_plan_mode.",
            };
        },
    };
}
export function makeExitPlanModeTool(opts) {
    const { userQuestions } = opts;
    return {
        name: "exit_plan_mode",
        description: "Use only in plan mode. Present the complete plan (markdown, starting " +
            "with a # heading) for human review. On approval, plan mode ends and " +
            "you carry out the plan from the next step. On 'keep planning', revise " +
            "using the user's feedback.",
        parameters: z.object({
            plan: z
                .string()
                .min(1)
                .describe("The complete plan as markdown, starting with a # heading that names it."),
        }),
        async execute(args, ctx) {
            let current = ctx.session.getPlan() ?? createPlanState();
            if (!current.active) {
                return {
                    content: "Error: exit_plan_mode requires plan mode (call enter_plan_mode first, " +
                        "or the user can /plan enter).",
                    isError: true,
                };
            }
            const answer = await userQuestions.ask({
                prompt: `Plan review\n\nApprove this plan and leave plan mode?\n\n${args.plan}`,
                options: [APPROVE, KEEP],
                recommendedIndex: 0,
                signal: ctx.abortSignal,
            });
            if (answer.cancelled) {
                return {
                    content: "Plan review cancelled — stay in plan mode and wait for the user.",
                    isError: true,
                };
            }
            if (answer.optionIndex === 1 || answer.value === KEEP) {
                const feedback = answer.value !== KEEP && answer.value.length > 0
                    ? answer.value
                    : "(no extra feedback)";
                return {
                    content: `User chose to keep planning. Feedback: ${feedback}. ` +
                        `Revise the plan and call exit_plan_mode again when ready.`,
                    isError: true,
                };
            }
            // Stamp plan text → propose → approve, stay active so injection works.
            try {
                if (current.reviewStatus !== "draft" &&
                    current.reviewStatus !== "rejected") {
                    // Force draft via exit+enter if needed so edit is legal.
                    current = applyTransition(current, { kind: "exit" });
                    current = applyTransition(current, { kind: "enter" });
                }
                current = applyTransition(current, {
                    kind: "edit",
                    planText: args.plan,
                });
                current = applyTransition(current, { kind: "propose" });
                current = applyTransition(current, { kind: "approve" });
                ctx.session.setPlan(current);
            }
            catch (err) {
                return {
                    content: `Failed to approve plan: ${err.message}`,
                    isError: true,
                };
            }
            return {
                content: "Plan approved — plan mode remains with an approved plan injected " +
                    "on the next turn. Carry out the plan starting with your next step. " +
                    "The user can `/plan exit` when done.",
            };
        },
    };
}
//# sourceMappingURL=mode-tools.js.map