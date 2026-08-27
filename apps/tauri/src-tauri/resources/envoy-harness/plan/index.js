/**
 * Phase A / Item 6 — public surface for the plan
 * subsystem. Re-exported by the package entry point.
 */
export { applyTransition, createPlanState, PlanTransitionError, } from "./state.js";
export { PLAN_FRAGMENT_PRIORITY, buildPlanFragment, renderPlanText, } from "./inject.js";
export { runReview } from "./review.js";
export { makeEnterPlanModeTool, makeExitPlanModeTool, } from "./mode-tools.js";
//# sourceMappingURL=index.js.map