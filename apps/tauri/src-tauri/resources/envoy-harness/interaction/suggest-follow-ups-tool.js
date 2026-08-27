/**
 * Model-facing tool: record follow-up suggestions and deferred tasks at turn end.
 */
import { z } from "zod";
export function makeSuggestFollowUpsTool(opts) {
    return {
        name: "suggest_follow_ups",
        description: "Record optional follow-up actions the human might take next, and work " +
            "you intentionally deferred (with a short reason). Call once near the end " +
            "of your reply when suggestions or deferrals would help — not for every turn.",
        parameters: z.object({
            followUps: z
                .array(z.string().min(1))
                .optional()
                .describe("Short actionable next steps (e.g. run tests, open a PR, fix lint)."),
            deferred: z
                .array(z.object({
                task: z.string().min(1).describe("What was not done."),
                reason: z
                    .string()
                    .min(1)
                    .describe("Why it was deferred (blocked, out of scope, needs input)."),
            }))
                .optional()
                .describe("Work intentionally left for later with a reason."),
        }),
        async execute(args) {
            const partial = {};
            if (args.followUps !== undefined && args.followUps.length > 0) {
                partial.followUps = args.followUps
                    .map((s) => s.trim())
                    .filter(Boolean);
            }
            if (args.deferred !== undefined && args.deferred.length > 0) {
                partial.deferred = args.deferred.map((d) => ({
                    task: d.task.trim(),
                    reason: d.reason.trim(),
                }));
            }
            if ((partial.followUps === undefined || partial.followUps.length === 0) &&
                (partial.deferred === undefined || partial.deferred.length === 0)) {
                return { content: "No follow-ups or deferrals recorded." };
            }
            opts.record(partial);
            const parts = [];
            if (partial.followUps !== undefined && partial.followUps.length > 0) {
                parts.push(`${partial.followUps.length} follow-up(s) recorded`);
            }
            if (partial.deferred !== undefined && partial.deferred.length > 0) {
                parts.push(`${partial.deferred.length} deferred item(s) recorded`);
            }
            return { content: parts.join("; ") + "." };
        },
    };
}
//# sourceMappingURL=suggest-follow-ups-tool.js.map