/**
 * Phase A / Item 6 — plan injection as a bounded
 * context fragment.
 *
 * **Reference:** the `ContextualUserFragment` rule
 * (Phase 8 / v2.1, `src/context/fragment.ts`).
 *
 * **What this does:** when a plan is
 * `active: true` AND `status: "approved"`, the next
 * model call sees a `ContextualUserFragment` with the
 * plan text. The fragment is high-priority (1000) so
 * the plan survives any budget cuts that drop memory
 * fragments (priority 100) and memory indexes
 * (priority -100).
 *
 * **The priority hierarchy (highest to lowest):**
 *  - 1000 — plan (when approved)
 *  - 100 — memory (full body, on-demand)
 *  - -100 — memory index (the always-loaded list)
 *  - 0 — default (everything else)
 *
 * **No-plan cases:** the function returns `[]` when
 * the plan is inactive, in draft, proposed, or
 * rejected. Only `approved` plans are injected.
 *
 * **Stability:** the fragment's `render()` output is
 * stable + parseable (the model reads it; humans can
 * copy it). The shape is:
 *
 *   ACTIVE PLAN (approved at <updatedAt>):
 *
 *   <planText>
 */
import { createBoundedFragment, } from "../context/fragment.js";
import { estimateMessageTokens } from "../context/budget.js";
/** The priority of the plan fragment. Highest in
 *  the bounded-fragment assembly; the plan survives
 *  any budget cuts. */
export const PLAN_FRAGMENT_PRIORITY = 1000;
/**
 * Build the plan fragment when the plan is in the
 * `approved` status AND `active: true`. Returns
 * `[]` otherwise.
 *
 * The function is pure: no I/O, no clock. The
 * caller passes the `PlanState`; the function
 * decides whether to inject.
 */
export function buildPlanFragment(state) {
    if (state === undefined)
        return [];
    if (!state.active)
        return [];
    if (state.reviewStatus !== "approved")
        return [];
    if (state.planText.length === 0)
        return [];
    return [
        createBoundedFragment({
            id: "plan",
            owner: "plan",
            priority: PLAN_FRAGMENT_PRIORITY,
            estimatedTokens: estimateMessageTokens({
                role: "user",
                content: [{ type: "text", text: state.planText }],
            }),
            text: renderPlanText(state),
        }),
    ];
}
/** The rendered plan fragment text. Stable + parseable. */
export function renderPlanText(state) {
    return `ACTIVE PLAN (approved at ${state.updatedAt}):\n\n${state.planText}`;
}
//# sourceMappingURL=inject.js.map