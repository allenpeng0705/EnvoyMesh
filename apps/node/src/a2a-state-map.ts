/**
 * Phase 48D — A2A v1.0 Task Lifecycle State Map.
 *
 * Translates EnvoyMesh's 12-state `TaskLifecycleState` to the 9 values
 * defined by the A2A v1.0 spec. The mapping is *lossy* on the
 * EnvoyMesh→A2A direction (4 pre-execution states collapse to
 * `submitted`; 3 execution phases collapse to `working`) and is
 * idempotent on the A2A→EnvoyMesh direction (every A2A state maps to
 * exactly one EnvoyMesh state).
 *
 * Why a separate module: the map is pure (no I/O, no clock) and is
 * exhaustively unit-tested. Keeping it out of `a2a-task-bridge.ts`
 * means the bridge module is focused on dispatch + auth + executor
 * wiring, not translation rules.
 *
 * Design: docs/a2a-mcp-interop-design.md §6.4.
 */

/** The 9 lowercase state values defined by the A2A v1.0 specification. */
export const A2A_STATE_VALUES = [
  "submitted",
  "working",
  "input-required",
  "completed",
  "canceled",
  "failed",
  "rejected",
  "auth-required",
  "unknown",
] as const;

export type A2AState = typeof A2A_STATE_VALUES[number];

/** The 12 lifecycle states used internally by EnvoyMesh. */
export type EnvoyTaskLifecycleState =
  | "created"
  | "planned"
  | "discovering"
  | "negotiating"
  | "waiting_for_peer"
  | "waiting_for_owner"
  | "running"
  | "partial"
  | "synthesizing"
  | "completed"
  | "failed"
  | "cancelled";

/**
 * The four EnvoyMesh states that share an A2A terminal mapping.
 * `canceled` is the spec spelling (single 'l'); EnvoyMesh uses
 * `cancelled` (double 'l'). This constant is exported so tests can
 * pin the discrepancy.
 */
export const TERMINAL_ENVOY_STATES = new Set<EnvoyTaskLifecycleState>([
  "completed",
  "failed",
  "cancelled",
]);

/**
 * Translate an EnvoyMesh task lifecycle state to the A2A v1.0 state.
 * Returns `"unknown"` for any unrecognized input — never throws.
 */
export function toA2AState(envoyState: string): A2AState {
  switch (envoyState) {
    // Pre-execution: queued / accepted but not yet working.
    case "created":
    case "planned":
    case "discovering":
    case "negotiating":
      return "submitted";

    // External blocking: waiting on a remote peer or human owner.
    case "waiting_for_peer":
    case "waiting_for_owner":
      return "input-required";

    // Active execution.
    case "running":
    case "partial":
    case "synthesizing":
      return "working";

    // Terminal.
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    // EnvoyMesh uses British "cancelled"; A2A uses American "canceled".
    case "cancelled":
      return "canceled";

    // Bridge-only sentinels. We accept them on the inbound direction
    // so a stored `A2AState` round-trips back to itself.
    case "submitted":
    case "working":
    case "input-required":
    case "canceled":
    case "rejected":
    case "auth-required":
    case "unknown":
      return envoyState as A2AState;

    default:
      return "unknown";
  }
}

/**
 * Translate an A2A v1.0 state back to the closest EnvoyMesh state.
 * Useful when an A2A client calls `tasks/cancel` and the bridge
 * records the result as an EnvoyMesh `task.cancel` payload.
 */
export function fromA2AState(a2aState: string): EnvoyTaskLifecycleState {
  switch (a2aState) {
    case "submitted":
      return "created";
    case "working":
      return "running";
    case "input-required":
      return "waiting_for_owner";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "canceled":
      return "cancelled";
    case "rejected":
      return "failed";
    case "auth-required":
      return "waiting_for_owner";
    case "unknown":
    default:
      return "created";
  }
}

/**
 * True iff the A2A state is a terminal state — the task will not
 * transition again. A2A clients use this to decide whether to keep
 * polling.
 */
export function isA2ATerminal(state: A2AState): boolean {
  return state === "completed" || state === "failed" || state === "canceled" || state === "rejected";
}