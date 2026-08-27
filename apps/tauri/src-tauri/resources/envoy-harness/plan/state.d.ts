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
/** The plan's review status (lifecycle state). */
export type PlanReviewStatus = "draft" | "proposed" | "approved" | "rejected";
/** The plan state, attached to the session metadata. */
export interface PlanState {
    /** `true` when plan mode is active. `false` for
     *  ordinary sessions (no plan / plan was exited). */
    active: boolean;
    /** The plan text. Free-form — the model produces
     *  whatever structure it wants. Empty when no
     *  plan has been written yet. */
    planText: string;
    /** Lifecycle state (see the type definition). */
    reviewStatus: PlanReviewStatus;
    /** ISO 8601 timestamp of the last update. */
    updatedAt: string;
    /** Optional reason for the most recent rejection.
     *  Set by `reject`; cleared by the next `propose`
     *  or `enter` transition. */
    rejectionReason?: string;
}
/**
 * Create a fresh plan state in the initial
 * configuration: `active: false, planText: ""`,
 * `status: "draft"`, `updatedAt: now`.
 */
export declare function createPlanState(now?: () => string): PlanState;
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
export declare function applyTransition(current: PlanState, transition: PlanTransition, now?: () => string): PlanState;
/** A transition into the state machine. */
export type PlanTransition = {
    kind: "enter";
} | {
    kind: "edit";
    planText: string;
} | {
    kind: "propose";
} | {
    kind: "approve";
} | {
    kind: "reject";
    reason?: string;
} | {
    kind: "exit";
};
/** A failed transition. The REPL command catches
 *  these and prints the message to stderr. */
export declare class PlanTransitionError extends Error {
    readonly transition: string;
    constructor(transition: string, message: string);
}
//# sourceMappingURL=state.d.ts.map