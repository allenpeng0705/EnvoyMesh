/**
 * Phase A / Item 6 — plan state.
 *
 * **Reference:** deepseek `plan-mode` (logged
 * collaboration state) + codex
 * `codex-rs/tasks/plan/` (lifecycle: draft →
 * proposed → approved / rejected).
 *
 * **What this is:** a structured record of "the
 * plan" for the session. When the user is in plan
 * mode, the model produces a plan, the user reviews
 * it, and the plan is injected as a top-priority
 * fragment on subsequent model calls. The plan is
 * NOT free text on disk; it's a record on the
 * Session (the unit of persistence).
 *
 * **Lifecycle (the state machine):**
 *
 *   - `enter`     : inactive → active (draft)
 *   - `edit`      : any active state → active (draft, plan text updated)
 *   - `propose`   : active (draft) → active (proposed)
 *   - `approve`   : active (proposed) → active (approved)
 *   - `reject`    : active (any) → active (rejected)
 *   - `exit`      : active (any) → inactive
 *
 * Invalid transitions throw — the caller (the REPL's
 * `/plan` command dispatcher) catches and prints an
 * error to stderr.
 *
 * **Why a state machine, not a free-form flag:**
 * the lifecycle is the contract. A plan that's
 * "approved" is the only one that gets injected;
 * "proposed" plans are drafts; "rejected" plans
 * are kept for audit. The state machine makes the
 * transitions explicit + testable.
 *
 * **Stability:** additive. New states are new
 * variants of the `reviewStatus` union. The
 * `PlanState` interface is the contract.
 */
// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
/**
 * Create a fresh plan state in the initial
 * configuration: `active: false, planText: ""`,
 * `status: "draft"`, `updatedAt: now`.
 */
export function createPlanState(now = () => new Date().toISOString()) {
    return {
        active: false,
        planText: "",
        reviewStatus: "draft",
        updatedAt: now(),
    };
}
// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------
/**
 * The set of valid transitions. Invalid transitions
 * throw (e.g. `approve` on an inactive session).
 *
 * The matrix:
 *
 *   | from      | enter | propose | approve | reject | exit | edit  |
 *   |-----------|-------|---------|---------|--------|------|-------|
 *   | inactive  |   ✓   |    -    |    -    |   -    |  -   |   -   |
 *   | draft     |   -   |    ✓    |    -    |   ✓    |  ✓   |   ✓   |
 *   | proposed  |   -   |    -    |    ✓    |   ✓    |  ✓   |   -   |
 *   | approved  |   -   |    -    |    -    |   ✓    |  ✓   |   -   |
 *   | rejected  |   -   |    ✓    |    -    |   ✓    |  ✓   |   ✓   |
 *
 * (`enter` from inactive is the only path to active.
 * `edit` is allowed from draft + rejected — the user
 * can re-edit a draft before proposing, or revise
 * a rejected plan before re-proposing.)
 */
export function applyTransition(current, transition, now = () => new Date().toISOString()) {
    const updatedAt = now();
    switch (transition.kind) {
        case "enter":
            if (current.active) {
                throw new PlanTransitionError("enter", `plan mode is already active (status: ${current.reviewStatus})`);
            }
            return { ...current, active: true, updatedAt };
        case "edit": {
            if (!current.active) {
                throw new PlanTransitionError("edit", "plan mode is not active (use /plan enter first)");
            }
            if (current.reviewStatus !== "draft" && current.reviewStatus !== "rejected") {
                throw new PlanTransitionError("edit", `cannot edit a plan in status '${current.reviewStatus}' ` +
                    `(revert to draft or rejected first)`);
            }
            return {
                ...current,
                planText: transition.planText,
                reviewStatus: "draft", // editing reverts to draft
                updatedAt,
            };
        }
        case "propose":
            if (!current.active) {
                throw new PlanTransitionError("propose", "plan mode is not active");
            }
            if (current.reviewStatus !== "draft" && current.reviewStatus !== "rejected") {
                throw new PlanTransitionError("propose", `cannot propose a plan in status '${current.reviewStatus}'`);
            }
            return { ...current, reviewStatus: "proposed", updatedAt };
        case "approve":
            if (!current.active) {
                throw new PlanTransitionError("approve", "plan mode is not active");
            }
            if (current.reviewStatus !== "proposed") {
                throw new PlanTransitionError("approve", `cannot approve a plan in status '${current.reviewStatus}' ` +
                    `(propose first)`);
            }
            return { ...current, reviewStatus: "approved", updatedAt };
        case "reject": {
            if (!current.active) {
                throw new PlanTransitionError("reject", "plan mode is not active");
            }
            // `exactOptionalPropertyTypes: true` means we
            // can't set `rejectionReason: undefined`; the
            // property must be omitted when there's no
            // reason. We use a conditional spread to
            // satisfy the strict mode.
            const next = {
                ...current,
                reviewStatus: "rejected",
                updatedAt,
            };
            if (transition.reason !== undefined) {
                next.rejectionReason = transition.reason;
            }
            return next;
        }
        case "exit":
            if (!current.active) {
                throw new PlanTransitionError("exit", "plan mode is not active");
            }
            return { ...current, active: false, updatedAt };
    }
}
/** A failed transition. The REPL command catches
 *  these and prints the message to stderr. */
export class PlanTransitionError extends Error {
    transition;
    constructor(transition, message) {
        super(`plan transition '${transition}' failed: ${message}`);
        this.transition = transition;
        this.name = "PlanTransitionError";
    }
}
//# sourceMappingURL=state.js.map