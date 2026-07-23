/**
 * Phase 40E — Cross-orchestrator + cross-home chain types.
 *
 * 40E extends the Phase 40 wire surface so chains can span:
 *   - Multiple orchestrators: orchestrator A hands off a sub-chain to
 *     orchestrator B (with owner pre-approval). B is responsible for
 *     that sub-chain's `task.chain.*` envelopes; A is responsible for
 *     the parent ledger.
 *   - Multiple home nodes: the worker pool lives on home-B while the
 *     orchestrator lives on home-A. Routes through the relay mesh.
 *
 * New intents (all `agent↔agent`, gated by trust tier `referred` or
 * higher — see §7.2 of agent_network.md):
 *
 *   - `task.chain.handoff`   — owner → orchestrator A: "ask B to take
 *                               over this sub-chain."
 *   - `task.chain.delegate`  — orchestrator A → orchestrator B: "you're
 *                               the new owner of these subtasks."
 *   - `task.chain.relay`     — orchestrator A → relay: "deliver this to
 *                               B via the relay mesh; record the route."
 *
 * Cross-orchestrator arbitration lives in `chain-arbitration.ts`
 * (Phase 40E.3). The arbitration ledger entry is the canonical source
 * of truth for "who owns what" — both A and B's local state must agree
 * with the arbitration ledger or they refuse to act.
 *
 * @see docs/agent_network.md §8 (Cross-orchestrator & cross-home chains)
 */

import { z } from "zod";

import {
  ChainIdSchema,
  ChainMandateSignedSchema,
  ChainSubtaskIdSchema,
  type ChainSubtask,
  type ChainMandate,
} from "./agent-network.js";

// ---------------------------------------------------------------------------
// Handoff request — owner → orchestrator A
// ---------------------------------------------------------------------------

/**
 * Status of a cross-orchestrator handoff. The same enum is reused for
 * the response from B and for the local arbitration ledger entry, so
 * downstream code can switch on it without duplicating string literals.
 */
export const ChainHandoffStatusSchema = z.enum([
  "pending", // orchestrator A has the request but hasn't contacted B
  "delegated", // B has accepted and is now responsible
  "rejected", // B refused (capacity, cost, capability mismatch)
  "expired", // owner-side deadline elapsed before B responded
  "cancelled", // owner revoked the request
]);
export type ChainHandoffStatus = z.infer<typeof ChainHandoffStatusSchema>;

/**
 * Phase 47D — serializable Assigner iteration side-state for handoff rehydrate.
 * Omits full `ChainReport` objects; drafts keep summary + judge metadata only.
 */
export const ChainIterationWireSchema = z.object({
  round: z.number().int().min(1).max(10),
  maxRounds: z.number().int().min(1).max(10),
  extendsInRound: z.number().int().min(0).max(32).default(0),
  maxExtendsInRound: z.number().int().min(0).max(32).default(2),
  extendMaxDepth: z.number().int().min(1).max(3).default(3),
  extendOnlyAfterPartial: z.boolean().default(true),
  sealedByRound: z.record(z.string(), z.array(z.string().min(1))).default({}),
  openRoundSubtaskIds: z.array(z.string().min(1)).max(64).default([]),
  drafts: z
    .array(
      z.object({
        round: z.number().int().min(1).max(10),
        summary: z.string().max(50_000),
        judgeDecision: z.string().max(32).optional(),
        judgeReason: z.string().max(2000).optional(),
      }),
    )
    .max(10)
    .default([]),
  judgeMode: z.enum(["llm", "always_stop", "owner"]).default("llm"),
  carryMode: z.enum(["summary", "full_draft", "structured"]).default("summary"),
  goal: z.string().min(1).max(8000),
  waitingForOwner: z.boolean().optional(),
  stopReason: z.string().max(64).optional(),
});
export type ChainIterationWire = z.infer<typeof ChainIterationWireSchema>;

export const ChainHandoffRequestPayloadSchema = z
  .object({
    chainId: ChainIdSchema,
    /**
     * Subtask IDs to hand off. Empty when this is a whole-job Assigner
     * handoff (`goal` set) — B then runs plan+assign+merge.
     */
    subtaskIds: z.array(ChainSubtaskIdSchema).max(64).default([]),
    /**
     * Orchestrator B's peer ID. Resolved by the owner from the public
     * directory; the orchestrator validates ownership before forwarding.
     */
    newOrchestratorPeerId: z.string().min(1),
    /** Owner's owner id (so the receiving orchestrator can verify mandate). */
    newOrchestratorOwnerId: z.string().min(1),
    /**
     * Whole-job Assigner handoff: natural-language goal for B to plan+assign+merge.
     * When set, `subtaskIds` may be empty.
     */
    goal: z.string().min(1).max(8000).optional(),
    maxChainCostUsd: z.number().nonnegative().optional(),
    costCeilingUsd: z.number().nonnegative().optional(),
    allowLlm: z.boolean().optional(),
    /** Optional human-readable rationale. */
    rationale: z.string().max(2000).optional(),
    /** ISO datetime by which B must respond. */
    expiresAt: z.string().datetime(),
    createdAt: z.string().datetime(),
    /** Phase 47D — opt-in outer iteration rounds for Assigner after handoff. */
    iterationMaxRounds: z.number().int().min(1).max(10).optional(),
    iterationJudgeMode: z.enum(["llm", "always_stop", "owner"]).optional(),
    extendMaxStepsPerRound: z.number().int().min(0).max(32).optional(),
    /**
     * Phase 47D — mid-job iteration blob so remote Assigner rehydrates the loop.
     * Absent on start-of-job goal handoff (knobs alone suffice).
     */
    iterationState: ChainIterationWireSchema.optional(),
  })
  .refine((d) => d.subtaskIds.length >= 1 || (typeof d.goal === "string" && d.goal.trim().length > 0), {
    message: "handoff requires subtaskIds or goal",
  });
export type ChainHandoffRequestPayload = z.infer<typeof ChainHandoffRequestPayloadSchema>;

export interface ChainHandoffRequest {
  chainId: string;
  subtaskIds: string[];
  newOrchestratorPeerId: string;
  newOrchestratorOwnerId: string;
  goal?: string;
  maxChainCostUsd?: number;
  costCeilingUsd?: number;
  allowLlm?: boolean;
  rationale?: string;
  expiresAt: string;
  createdAt: string;
  iterationMaxRounds?: number;
  iterationJudgeMode?: "llm" | "always_stop" | "owner";
  extendMaxStepsPerRound?: number;
  iterationState?: ChainIterationWire;
}

// ---------------------------------------------------------------------------
// Delegate accept — orchestrator B → orchestrator A
// ---------------------------------------------------------------------------

export const ChainHandoffDelegatePayloadSchema = z.object({
  chainId: ChainIdSchema,
  /** Echo of the request's subtask IDs. B confirms it's taking these. */
  subtaskIds: z.array(ChainSubtaskIdSchema).min(1).max(64),
  /** The original handoff request id (so A can correlate). */
  handoffRequestId: z.string().min(1),
  /**
   * New chain ID assigned by B for the sub-chain. The owner now
   * references sub-chains by their full ID, not just subtask IDs.
   */
  subChainId: ChainIdSchema,
  /**
   * Re-signed sub-mandate for the sub-chain. B re-signs as issuer; A
   * cross-references the original mandate by `chainId`. Sub-mandate
   * inherits `costCeilingUsd`, `maxWorkers`, and `deadlineAt` from the
   * original unless explicitly overridden here.
   */
  subChainMandate: ChainMandateSignedSchema,
  /** ISO datetime the sub-chain should report back to A by. */
  reportBackByAt: z.string().datetime(),
  /** Estimated cost for B to handle the sub-chain (USD). */
  estimatedCostUsd: z.number().nonnegative(),
  createdAt: z.string().datetime(),
});
export type ChainHandoffDelegatePayload = z.infer<typeof ChainHandoffDelegatePayloadSchema>;

export interface ChainHandoffDelegate {
  chainId: string;
  subtaskIds: string[];
  handoffRequestId: string;
  subChainId: string;
  subChainMandate: ChainMandate;
  reportBackByAt: string;
  estimatedCostUsd: number;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Relay envelope — orchestrator A → relay mesh → orchestrator B
// ---------------------------------------------------------------------------

/**
 * Route hints for the relay mesh. The orchestrator doesn't need to
 * know the exact path — it just needs to know which relay nodes
 * already have the envelope so it can detect duplicates.
 */
export const ChainRelayRouteSchema = z.object({
  chainId: ChainIdSchema,
  /** Intent this relay envelope is wrapping (e.g. `task.chain.delegate`). */
  innerIntent: z.string().min(1),
  /** Receiver peer ID. */
  recipientPeerId: z.string().min(1),
  /** Relay nodes the envelope has already traversed. */
  viaRelays: z.array(z.string().min(1)).default([]),
  /** TTL in ms (envelope is dropped if older than this when it lands). */
  ttlMs: z.number().int().positive().default(60_000),
  /** Inner envelope payload, pre-serialized (the relay doesn't parse it). */
  innerPayload: z.unknown(),
  createdAt: z.string().datetime(),
});
export type ChainRelayRoute = z.infer<typeof ChainRelayRouteSchema>;

// ---------------------------------------------------------------------------
// Arbitration ledger entry — local copy of "who owns what"
// ---------------------------------------------------------------------------

/**
 * Phase 40E.3 — arbitration ledger entry. Both orchestrator A and B
 * maintain a local copy of this ledger. When the two diverge (rare;
 * happens on a network partition during a handoff), the most-recent
 * entry wins by the `createdAt` timestamp; older entries are tombstoned.
 *
 * The entry records the handoff request, the response, and the
 * resolved ownership for each subtask. The ledger is append-only; we
 * never mutate entries in place.
 */
export const ChainArbitrationEntrySchema = z.object({
  chainId: ChainIdSchema,
  /**
   * Globally unique arbitration id. Format: `arbitration_<chainId>_<seq>`.
   */
  arbitrationId: z.string().min(1),
  /** Sequence number within the chain's arbitration ledger. Starts at 1. */
  seq: z.number().int().min(1),
  /** Subtask IDs under dispute. Empty array means "the whole chain". */
  subtaskIds: z.array(ChainSubtaskIdSchema).default([]),
  /** Orchestrator that currently owns these subtasks (per this entry). */
  currentOwnerPeerId: z.string().min(1),
  currentOwnerOwnerId: z.string().min(1),
  /**
   * Prior owner peer-id (the orchestrator that's handing off). Used
   * for audit + recovery after a partition.
   */
  previousOwnerPeerId: z.string().min(1).optional(),
  /**
   * Status of the arbitration. Mirrors `ChainHandoffStatus` but is
   * stored independently so the arbitration ledger can outlive any
   * individual handoff.
   */
  status: ChainHandoffStatusSchema,
  /** Optional rationale (who initiated, why). */
  rationale: z.string().max(2000).optional(),
  createdAt: z.string().datetime(),
});
export type ChainArbitrationEntry = z.infer<typeof ChainArbitrationEntrySchema>;

/**
 * Phase 40E.3 — arbitration payload. Two orchestrators that both
 * think they own the same subtask will exchange arbitration envelopes;
 * whichever has the higher `seq` (or, for ties, the most recent
 * `createdAt`) wins. The losing side accepts the new ownership and
 * releases any budget it had reserved locally.
 */
export const ChainArbitrationPayloadSchema = z.object({
  chainId: ChainIdSchema,
  /** The winning arbitration entry (from the sender's perspective). */
  entry: ChainArbitrationEntrySchema,
  /** ISO datetime the sender expected the receiver to converge by. */
  convergeByAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});
export type ChainArbitrationPayload = z.infer<typeof ChainArbitrationPayloadSchema>;

// ---------------------------------------------------------------------------
// Convenience helper — get the sub-chain's root subtasks from a handoff
// ---------------------------------------------------------------------------

/**
 * Returns the root subtasks of a sub-chain: the subtasks being handed
 * off, plus any already-merged predecessors that the sub-chain depends
 * on. Empty array when the handoff has no parent subtasks.
 *
 * Useful for the orchestrator to compute the dependency graph for the
 * delegated sub-chain (e.g. to seed it into the local subtasks map).
 */
export function getSubChainRootSubtasks(
  subtasks: ReadonlyArray<ChainSubtask>,
  handoffSubtaskIds: ReadonlyArray<string>,
): ChainSubtask[] {
  const idSet = new Set(handoffSubtaskIds);
  return subtasks.filter((s) => idSet.has(s.subtaskId));
}

// ---------------------------------------------------------------------------
// Status helpers — used by both orchestrators and the UI
// ---------------------------------------------------------------------------

/** True when the handoff is still in a state that may transition. */
export function isHandoffOpen(status: ChainHandoffStatus): boolean {
  return status === "pending";
}

/** True when the handoff has reached a terminal state. */
export function isHandoffTerminal(status: ChainHandoffStatus): boolean {
  return status !== "pending";
}

/**
 * Returns true if the request has not yet expired. Uses `now` so the
 * caller can inject a clock for tests.
 */
export function isHandoffLive(
  request: { expiresAt: string },
  now: Date = new Date(),
): boolean {
  return new Date(request.expiresAt).getTime() > now.getTime();
}