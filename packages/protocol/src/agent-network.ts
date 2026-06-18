/**
 * Phase 40 — Agent Network Collaboration Layer schemas.
 *
 * This file defines the wire surface for multi-agent chains. Chains are a
 * superset of single-shot A2A: one orchestrator node fans out N subtasks to
 * N workers, collects partial results, optionally negotiates counter-proposals,
 * and synthesizes a single `ChainReport` deliverable for the owner.
 *
 * Design doc: docs/agent_network.md
 * Implementation checklist: docs/implementation-plan.md §"Phase 40"
 *
 * The schemas are deliberately split from index.ts so the agent-network wire
 * surface is reviewable in one place (mirrors envelope-role-refinement.ts).
 *
 * **Schema invariants (enforced at parse time, see agent-network.test.ts):**
 * - `ChainSubtaskBidSchema.bidExpiresAt` is mandatory ISO datetime; bounded so
 *   crash-replay cannot award stale bids (default = proposal.deadline + 30s,
 *   ceiling = now + 5 min when no proposal is available).
 * - `ChainSubtaskAwardSchema.negotiationRound` is int 1..3 (3-round hard cap).
 * - `ChainReportSchema.chainSummary.synthesisCostUsd` is nonnegative; the
 *   invariant Σ workerAllocations.committedUsd + synthesisSpendUsd ≤
 *   maxChainCostUsd is checked at the orchestrator (chain-budget-ledger) and
 *   re-verified in tests, but the parse-time check only guarantees nonnegativity.
 */

import { z } from "zod";

import type { Artifact, EnvoyActorRole, Sensitivity } from "./index.js";

/**
 * Local copies of the small enum schemas to avoid a circular import with
 * ./index.js (which re-exports this module). The values MUST stay in sync
 * with the canonical definitions in ./index.js — the
 * `packages/protocol/test/agent-network.test.ts` suite asserts this in the
 * "schema sync" block.
 *
 * If you add or remove a variant of Artifact, Sensitivity, or EnvoyActorRole
 * in index.ts, update these local schemas here too.
 */

const TextArtifactLocalSchema = z.object({
  kind: z.literal("text"),
  content: z.string().min(1).max(64_000),
  mimeType: z.string().min(1).optional(),
});

const FileArtifactLocalSchema = z.object({
  kind: z.literal("file"),
  vaultPath: z.string().min(1),
  contentHash: z.string().min(1).max(128),
  mimeType: z.string().min(1).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  displayName: z.string().min(1).optional(),
});

const StructuredArtifactLocalSchema = z.object({
  kind: z.literal("structured"),
  schemaRef: z.string().min(1).max(256),
  data: z.record(z.string(), z.unknown()),
});

// CompositeArtifactSchema is defined further down in this file. We use
// z.union (not z.discriminatedUnion) so we can include a z.lazy reference.
// This is the "schema sync" copy that must mirror index.ts's ArtifactSchema.
// z.union is slightly slower at runtime than z.discriminatedUnion but the
// recursive cycle is unavoidable for composite artifacts.
const ArtifactSchema: z.ZodTypeAny = z.union([
  TextArtifactLocalSchema,
  FileArtifactLocalSchema,
  StructuredArtifactLocalSchema,
  z.lazy(() => CompositeArtifactSchema) as z.ZodTypeAny,
]);

const SensitivityLocalSchema = z.enum(["public", "friends", "trusted", "private"]);
const EnvoyActorRoleLocalSchema = z.enum(["human", "agent", "system"]);

// Type-only re-aliases so downstream consumers get the canonical types
// without runtime drift.
type _Artifact = Artifact;
type _Sensitivity = Sensitivity;
type _EnvoyActorRole = EnvoyActorRole;
// Suppress unused-type alias warnings while preserving the cross-reference.
export type { _Artifact as ArtifactRef, _Sensitivity as SensitivityRef, _EnvoyActorRole as EnvoyActorRoleRef };

/** A chain-scoped identifier. Format: `chain_<uuid>`. */
export const ChainIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^chain_[a-zA-Z0-9_-]+$/, "chainId must start with chain_ and use a safe character set");

/** A chain mandate identifier. Format: `chainmandate_<uuid>`. */
export const ChainMandateIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^chainmandate_[a-zA-Z0-9_-]+$/, "chainMandateId must start with chainmandate_");

/** A subtask identifier within a chain. Format: `subtask_<uuid>`. */
export const ChainSubtaskIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^subtask_[a-zA-Z0-9_-]+$/, "subtaskId must start with subtask_");

/** The role a node plays within a single chain. */
export const ChainRoleSchema = z.enum(["orchestrator", "worker"]);

/** Cap on chain depth (orchestrator → sub-orchestrator → worker → sub-worker). */
export const CHAIN_MAX_DEPTH = 3;

/**
 * The owner-signed mandate that authorizes a chain. Mirrors the existing
 * `UnsignedMandate` shape but adds chain-specific bounds.
 *
 * Signed variant (`ChainMandateSignedSchema`) carries an Ed25519 signature
 * over canonical JSON of the rest, matching the project's signing convention.
 */
export const UnsignedChainMandateSchema = z.object({
  version: z.literal("0.1"),
  chainMandateId: ChainMandateIdSchema,
  chainId: ChainIdSchema,
  issuerOwnerId: z.string().min(1),
  /** The orchestrator node that will publish the chain report. */
  orchestratorOwnerId: z.string().min(1),
  /** Maximum total cost the orchestrator may commit across all workers + synthesis. */
  maxChainCostUsd: z.number().nonnegative(),
  /** Hard cost ceiling for any single worker's bid. Bids above this are rejected. */
  costCeilingUsd: z.number().nonnegative(),
  /** Maximum concurrent worker sessions (matches active peer sessions). */
  maxWorkers: z.number().int().min(1).max(16),
  /** Allowed depth (1, 2, or 3). Depth-3 chains require explicit opt-in. */
  allowDepth3: z.boolean().default(false),
  /** Sensitivity ceiling for all artifacts the chain produces. */
  maxSensitivity: SensitivityLocalSchema,
  /** Deadline by which the orchestrator should publish the final chain report. */
  deadlineAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  /**
   * Phase 40D — rebalance policy.
   *
   * - `"manual"` (default): rebalance only fires when the owner clicks the bar.
   * - `"auto"`: the orchestrator auto-rebalances when a worker stalls (no
   *   heartbeat for `stallTimeoutMs`) or a partial lands below
   *   `lowConfidenceThreshold`. Capped at `maxAutoRebalances` times so a
   *   runaway worker can't blow through the budget silently.
   * - `"never"`: the rebalance bar is hidden entirely; the owner has opted
   *   out of any budget increases.
   */
  rebalancePolicy: z.enum(["manual", "auto", "never"]).default("manual"),
  /**
   * Heartbeat gap (ms) before an in-flight subtask is considered "stalled".
   * Default 60_000 (1 min). Only consulted when `rebalancePolicy === "auto"`.
   */
  stallTimeoutMs: z.number().int().positive().optional(),
  /**
   * Partial confidence below this threshold is considered "low quality".
   * Triggers an auto-rebalance when `rebalancePolicy === "auto"`. Default 0.5.
   */
  lowConfidenceThreshold: z.number().min(0).max(1).optional(),
  /**
   * Safety cap on auto-rebalances. Default 2. Prevents a single bad
   * worker from burning the owner's budget without explicit approval.
   */
  maxAutoRebalances: z.number().int().nonnegative().default(2),
  /**
   * Auto-rebalance budget increment in USD. Each auto-rebalance adds this
   * many dollars to `maxChainCostUsd` (on top of the previous max). The
   * last value used is persisted so the audit log can show the progression.
   * Default 5.0.
   */
  autoRebalanceIncrementUsd: z.number().nonnegative().default(5),
});

export const ChainMandateSignedSchema = UnsignedChainMandateSchema.extend({
  signature: z.string().min(1),
});

export type UnsignedChainMandate = z.infer<typeof UnsignedChainMandateSchema>;
export type ChainMandate = z.infer<typeof ChainMandateSignedSchema>;

/**
 * A single subtask the orchestrator plans to fan out. Workers receive the
 * subtask as a `task.chain.propose` payload and may respond with a bid.
 */
export const ChainSubtaskSchema = z.object({
  version: z.literal("0.1"),
  subtaskId: ChainSubtaskIdSchema,
  chainId: ChainIdSchema,
  chainMandateId: ChainMandateIdSchema,
  /** 1..CHAIN_MAX_DEPTH (3). Enforced at parse time so malformed depth is caught early. */
  depth: z.number().int().min(1).max(CHAIN_MAX_DEPTH),
  /** Required capability tag. Worker must advertise this capability to bid. */
  requiredCapability: z.string().min(1).max(64),
  objective: z.string().min(1).max(2000),
  requestedResult: z.string().min(1).max(1000),
  constraints: z.array(z.string().min(1)).max(32).default([]),
  /** Subtasks must run in order relative to these sibling IDs (DAG ordering). */
  dependsOn: z.array(ChainSubtaskIdSchema).max(16).default([]),
  /** Per-subtask cost ceiling. Defaults to mandate.costCeilingUsd if absent. */
  costCeilingUsd: z.number().nonnegative().optional(),
  /** Per-subtask deadline. Defaults to mandate.deadlineAt if absent. */
  deadlineAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
});

export type ChainSubtask = z.infer<typeof ChainSubtaskSchema>;

/**
 * A worker's response to a `task.chain.propose` — declares willingness and
 * price to execute one subtask.
 *
 * **bidExpiresAt is mandatory and bounded.** It must be in the future at parse
 * time (relative to the orchestrator's clock). The worker computes it as
 * `proposal.deadline + 30s`, capped at `now + 5 minutes`. On the worker side,
 * any `task.chain.accept` that arrives after `bidExpiresAt` is rejected with
 * a `chain.bid_expired` audit event and a deny decision.
 */
export const ChainSubtaskBidSchema = z.object({
  version: z.literal("0.1"),
  subtaskId: ChainSubtaskIdSchema,
  chainId: ChainIdSchema,
  workerPeerId: z.string().min(1),
  workerOwnerId: z.string().min(1),
  /** USD cost the worker is committing to (deterministic; no negotiation on this field post-award). */
  proposedCostUsd: z.number().nonnegative(),
  /** ISO datetime at which the worker promises to deliver (capability-local ETA + 60s slack). */
  proposedEtaAt: z.string().datetime(),
  /** ISO datetime at which this bid expires. Required, must be parseable as a future datetime. */
  bidExpiresAt: z.string().datetime(),
  /** Free-text rationale or proposed tweaks (for counter-bid UI). */
  rationale: z.string().max(2000).optional(),
  createdAt: z.string().datetime(),
});

export type ChainSubtaskBid = z.infer<typeof ChainSubtaskBidSchema>;

/**
 * The orchestrator's award decision. `negotiationRound` is enforced to 1..3
 * at parse time — a 4th-round award is malformed and rejected.
 *
 * Workers receiving a `task.chain.accept` with `negotiationRound > 3` must
 * refuse the award (defense-in-depth even if the orchestrator misbehaves).
 */
export const ChainSubtaskAwardSchema = z.object({
  version: z.literal("0.1"),
  subtaskId: ChainSubtaskIdSchema,
  chainId: ChainIdSchema,
  workerPeerId: z.string().min(1),
  /** Round number of this award decision (1 = initial award, 2 = first counter, 3 = final). */
  negotiationRound: z.number().int().min(1).max(3),
  /** Final accepted cost in USD. */
  acceptedCostUsd: z.number().nonnegative(),
  /** Per-subtask deadline reaffirmed by the orchestrator. */
  deadlineAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});

export type ChainSubtaskAward = z.infer<typeof ChainSubtaskAwardSchema>;

/**
 * A worker's partial deliverable. Workers may submit multiple partials per
 * subtask (with monotonically increasing `seq`) before the final result.
 *
 * The orchestrator emits `chain.partial_received` audit events on each
 * partial, and `chain.subtask_completed` when the worker's final
 * `task.result` arrives (status === "completed").
 */
export const ChainSubtaskPartialSchema = z.object({
  version: z.literal("0.1"),
  subtaskId: ChainSubtaskIdSchema,
  chainId: ChainIdSchema,
  workerPeerId: z.string().min(1),
  /** Monotonic per-(subtaskId, workerPeerId) sequence number. Starts at 1. */
  seq: z.number().int().min(1),
  /** True when this is the worker's terminal partial before their task.result. */
  isFinal: z.boolean().default(false),
  /** Free-text progress note (visible in the chain tree). */
  note: z.string().max(2000).optional(),
  /**
   * Phase 40D — worker's self-reported confidence in this partial (0..1).
   * Compared against `chainMandate.lowConfidenceThreshold` by `trackChain`
   * to decide whether to auto-rebalance. Optional: older workers may
   * omit it (treated as `1.0` = "fully confident").
   */
  confidence: z.number().min(0).max(1).optional(),
  /** Optional artifact fragment (e.g. file being uploaded in pieces). */
  artifactFragment: ArtifactSchema.optional(),
  createdAt: z.string().datetime(),
});

export type ChainSubtaskPartial = z.infer<typeof ChainSubtaskPartialSchema>;

/**
 * One weighted contribution to a `composite` artifact. The orchestrator
 * publishes a `ChainReport` whose `compositeArtifact.parts[]` is a list of
 * these (one per worker contribution).
 */
export const CompositeArtifactPartSchema = z.object({
  subtaskId: ChainSubtaskIdSchema,
  workerPeerId: z.string().min(1),
  workerOwnerId: z.string().min(1),
  /** Weight for the weighted_concat aggregation (range 0..1, sum should be 1 across all parts). */
  weight: z.number().min(0).max(1),
  /** The worker's contribution. May be text/file/structured. */
  artifact: ArtifactSchema,
  /** Optional attribution note for the composite renderer. */
  note: z.string().max(1000).optional(),
});

/**
 * A composite artifact bundled from N weighted worker contributions.
 * Emitted as part of `ChainReport.executiveArtifact` or as a section artifact
 * for a chain report section.
 */
export const CompositeArtifactSchema = z.object({
  kind: z.literal("composite"),
  parts: z.array(CompositeArtifactPartSchema).min(1),
  /** Aggregation kind determines how the parts are combined. */
  aggregation: z.enum(["concatenate", "weighted_concat", "merge_structured", "owner_review"]),
  createdAt: z.string().datetime(),
});

export type CompositeArtifactPart = z.infer<typeof CompositeArtifactPartSchema>;
export type CompositeArtifact = z.infer<typeof CompositeArtifactSchema>;

/**
 * A section of a chain report — markdown body plus optional citation back to
 * the underlying subtask in the chain tree.
 */
export const ChainReportSectionSchema = z.object({
  heading: z.string().min(1).max(200),
  bodyMarkdown: z.string().min(1).max(32_000),
  /** Citations are `[subtaskId, snippet]` tuples that the renderer can link to `ChainTreeView`. */
  citations: z
    .array(
      z.object({
        subtaskId: ChainSubtaskIdSchema,
        snippet: z.string().min(1).max(500),
      }),
    )
    .max(64)
    .default([]),
});

export type ChainReportSection = z.infer<typeof ChainReportSectionSchema>;

/**
 * The final deliverable published by the orchestrator to the owner via
 * `task.chain.report` (agent → human).
 *
 * **Budget invariant (enforced by chain-budget-ledger, also re-verified in tests):**
 * Σ workerAllocations[].committedUsd + chainSummary.synthesisCostUsd ≤
 * maxChainCostUsd from the chain mandate.
 */
export const ChainReportSchema = z.object({
  version: z.literal("0.1"),
  chainId: ChainIdSchema,
  chainMandateId: ChainMandateIdSchema,
  orchestratorOwnerId: z.string().min(1),
  orchestratorPeerId: z.string().min(1),
  /** True when the owner flagged this report to be exempt from 90-day GC. */
  pinned: z.boolean().default(false),
  chainSummary: z.object({
    /** Duration of the chain in milliseconds (createdAt of mandate → createdAt of report). */
    durationMs: z.number().int().nonnegative(),
    /** Number of subtasks the chain fanned out. */
    subtaskCount: z.number().int().min(1),
    /** Number of distinct workers who contributed. */
    workerCount: z.number().int().min(1),
    /** Per-worker committed cost, in USD. */
    workerAllocations: z
      .array(
        z.object({
          subtaskId: ChainSubtaskIdSchema,
          workerPeerId: z.string().min(1),
          committedUsd: z.number().nonnegative(),
        }),
      )
      .min(1),
    /**
     * Cost of the LLM synthesis pass in USD. Tracked separately from worker
     * allocations so the chain-budget-ledger can reserve it up-front
     * (worker awards never spend into the synthesis reserve).
     */
    synthesisCostUsd: z.number().nonnegative(),
  }),
  /** Markdown executive summary shown at the top of the report. */
  executiveSummary: z.string().min(1).max(32_000),
  /** Optional top-level artifact — often a `composite` artifact. */
  executiveArtifact: ArtifactSchema.optional(),
  /** Structured sections, each with citations back to the chain tree. */
  sections: z.array(ChainReportSectionSchema).max(32).default([]),
  /**
   * Roles that the report is intended for. The default `["human"]` is
   * enforced as non-empty so a chain report can never be published to
   * zero recipients (which would be silently dropped by the chat layer).
   * For owner-facing reports this is always `["human"]`; we keep the
   * array shape so a future multi-role report (e.g. orchestrator-to-owner
   * + a copy to a fleet manifest) can extend it without a wire bump.
   */
  recipientRoles: z.array(EnvoyActorRoleLocalSchema).min(1).default(["human"]),
  createdAt: z.string().datetime(),
});

export type ChainReport = z.infer<typeof ChainReportSchema>;

// ---------------------------------------------------------------------------
// Wire payload schemas (envelope.payload for each task.chain.* intent)
// ---------------------------------------------------------------------------

/** `task.chain.mandate` — orchestrator announces a new chain. */
export const TaskChainMandatePayloadSchema = z.object({
  chainMandate: ChainMandateSignedSchema,
});

/** `task.chain.propose` — orchestrator proposes a subtask to a worker. */
export const TaskChainProposePayloadSchema = z.object({
  subtask: ChainSubtaskSchema,
  chainMandate: ChainMandateSignedSchema,
});

/** `task.chain.bid` — worker responds with a bid. */
export const TaskChainBidPayloadSchema = z.object({
  bid: ChainSubtaskBidSchema,
});

/** `task.chain.accept` — orchestrator awards a subtask. */
export const TaskChainAcceptPayloadSchema = z.object({
  award: ChainSubtaskAwardSchema,
});

/** `task.chain.partial` — worker streams a partial deliverable. */
export const TaskChainPartialPayloadSchema = z.object({
  partial: ChainSubtaskPartialSchema,
});

/** `task.chain.merge` — orchestrator publishes a mid-chain merge (rare; for split/merge sub-flows). */
export const TaskChainMergePayloadSchema = z.object({
  chainId: ChainIdSchema,
  /** Subtask IDs being merged into one (size ≥ 2). */
  mergingSubtaskIds: z.array(ChainSubtaskIdSchema).min(2).max(16),
  /** New subtask that supersedes the merged ones (its `dependsOn` should reference the merged set). */
  newSubtask: ChainSubtaskSchema,
  /** Worker selected to run the merged subtask (may differ from any of the originals). */
  awardedWorkerPeerId: z.string().min(1),
  /** Cost allocated to the merge (separate from the original subtask costs). */
  mergeCostUsd: z.number().nonnegative(),
  createdAt: z.string().datetime(),
});

/** `task.chain.cancel` — orchestrator (or owner) cancels a subtask before completion. */
export const TaskChainCancelPayloadSchema = z.object({
  chainId: ChainIdSchema,
  subtaskId: ChainSubtaskIdSchema.optional(),
  reason: z.string().min(1).max(2000),
  cancelledBy: z.enum(["owner", "orchestrator", "policy"]),
  /** Worker peer IDs that must release any in-flight work for this subtask. */
  notifyWorkerPeerIds: z.array(z.string().min(1)).max(16).default([]),
  createdAt: z.string().datetime(),
});

/** `task.chain.heartbeat` — orchestrator heartbeats an in-flight subtask. */
export const TaskChainHeartbeatPayloadSchema = z.object({
  chainId: ChainIdSchema,
  subtaskId: ChainSubtaskIdSchema,
  workerPeerId: z.string().min(1),
  /** Worker-observed progress signal (e.g. percent done, last action). */
  progress: z.string().min(1).max(500),
  /** Optional ETA reaffirmation (worker may push a new proposedEtaAt). */
  proposedEtaAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
});

/** `task.chain.report` — orchestrator publishes the final ChainReport (agent → human). */
export const TaskChainReportPayloadSchema = z.object({
  report: ChainReportSchema,
});

// Inferred payload types (re-exported from protocol index for consumers).
export type TaskChainMandatePayload = z.infer<typeof TaskChainMandatePayloadSchema>;
export type TaskChainProposePayload = z.infer<typeof TaskChainProposePayloadSchema>;
export type TaskChainBidPayload = z.infer<typeof TaskChainBidPayloadSchema>;
export type TaskChainAcceptPayload = z.infer<typeof TaskChainAcceptPayloadSchema>;
export type TaskChainPartialPayload = z.infer<typeof TaskChainPartialPayloadSchema>;
export type TaskChainMergePayload = z.infer<typeof TaskChainMergePayloadSchema>;
export type TaskChainCancelPayload = z.infer<typeof TaskChainCancelPayloadSchema>;
export type TaskChainHeartbeatPayload = z.infer<typeof TaskChainHeartbeatPayloadSchema>;
export type TaskChainReportPayload = z.infer<typeof TaskChainReportPayloadSchema>;

// ---------------------------------------------------------------------------
// Constructors (createX) + parsers (parseX) — match the project convention
// documented in CLAUDE.md "Zod-driven design".
// ---------------------------------------------------------------------------

export function parseChainMandate(input: unknown): ChainMandate {
  return ChainMandateSignedSchema.parse(input);
}

export function parseChainSubtask(input: unknown): ChainSubtask {
  return ChainSubtaskSchema.parse(input);
}

export function parseChainSubtaskBid(input: unknown): ChainSubtaskBid {
  return ChainSubtaskBidSchema.parse(input);
}

export function parseChainSubtaskAward(input: unknown): ChainSubtaskAward {
  return ChainSubtaskAwardSchema.parse(input);
}

export function parseChainSubtaskPartial(input: unknown): ChainSubtaskPartial {
  return ChainSubtaskPartialSchema.parse(input);
}

export function parseChainReport(input: unknown): ChainReport {
  return ChainReportSchema.parse(input);
}

export function parseCompositeArtifact(input: unknown): CompositeArtifact {
  return CompositeArtifactSchema.parse(input);
}

export function createChainMandateId(): string {
  return `chainmandate_${crypto.randomUUID()}`;
}

export function createChainId(): string {
  return `chain_${crypto.randomUUID()}`;
}

export function createChainSubtaskId(): string {
  return `subtask_${crypto.randomUUID()}`;
}