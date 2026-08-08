# EnvoyMesh — Agent Network Collaboration Layer (Team jobs)

> **Product name in the UI:** **Team jobs** (nav). Protocol and code still say
> “chain” (`task.chain.*`, `ChainsView`, etc.).
>
> **Start here if you want the operator explanation** (who can join, bonds,
> settings): [`agent-network-guide.md`](./agent-network-guide.md).
>
> **Status:** Phase 40 collaboration layer **shipped** (40A–40F). This file
> remains the design / protocol reference. Some introductory paragraphs below
> are historical (“proposal”); treat checklists in
> [`implementation-plan.md`](./implementation-plan.md) as the shipping record.
>
> **Vocabulary (2026-08):** Agent Card uses `membership[]` (opt-in / execute
> rights; tag `agent-network-worker`). Assignment specialties live in
> `agentNetworkProfile.skills[]` and subtask field `requiredSkill`.
> **Collaboration roles** (Phase 52) live in `agentNetworkProfile.roles[]`
> (`roles[0]` = primary) with Team job assignment mode `skill` \| `role` —
> see [`agent-network-roles.md`](./agent-network-roles.md) and
> [`agent-network-vocabulary.md`](./agent-network-vocabulary.md). Older
> excerpts below may still say `capabilities` / `requiredCapability` /
> `CapabilityIndex` — treat those as historical; runtime names are membership /
> skills / roles / `AgentNetworkMembershipIndex`.
>
> **Scope:** Multi-agent collaboration, multi-round negotiation, parent/child
> task lineage, structured reports, end-to-end observability.
> **Prereqs already shipped:** Phase 24 (single-shot A2A), Phase 33 (typed
> Artifacts), Phase 32 (AI Engine / Ext Agent selection), Phase 23–25
> (capability routes, reputation anchors), Phase 35–36 (fleet onboarding tab).

---

## 1. Why this document exists

EnvoyMesh currently has the building blocks for one node talking to another node's agent:

- A signed-envelope wire protocol (`task.mandate → task.propose → task.accept → task.result`)
- An Agent Card (`agent.card.request` / `agent.card.response`) with cached 24h auto-fetch on bond
- A 1-level chain orchestrator (`apps/node/src/agent-chain-orchestrator.ts`, max depth 3, keyword-based decomposition)
- A reputation router, a service-mesh auto-accept gate, and a single-task negotiation loop

But the user's actual target is **multiple agents collaborating concurrently to finish a complex task**, with:

- Each agent holding **one or more roles / capabilities**
- The team **negotiating multi-rounds** about who does what, how it splits, and how it merges
- A **deliverable** — a final artifact chain, not just "the last task.result that happened to win"

That requires four pieces we **do not have** today:

1. A **task tree** with explicit parent/child lineage (today: only loose `correlationId` envelopes; no parent field on journal entries or results)
2. A native **orchestration verb** on the wire (today: no `task.delegate`, no `task.chain`, no `task.fan-out`)
3. A **structured artifact** that represents a multi-agent deliverable (today: `Artifact` is `text | file | structured` — but there's no `composite` artifact that bundles N contributions)
4. **Counter-proposal / split / merge negotiation** (today: `task.negotiate` exists but only carries `cost` and `deadline` adjustments; first acceptance wins, no re-bid)

This document specifies all four — protocol additions, Node-service API, security model, and a phased rollout.

---

## 2. The target model

### 2.1 Three collaboration shapes

| Shape | When | Topology |
|---|---|---|
| **Solo A2A** | One task, one worker, one result | Worker (existing Phase 24 — unchanged) |
| **Fan-out / Fan-in** | One orchestrator fans out subtasks to N workers in parallel; merges results into a composite report | Orchestrator + N peers, all depth-1 |
| **Multi-round negotiation** | Multiple agents bid on the same subtask; orchestrator issues counter-proposals; partial-accept allowed | Orchestrator + N peers, with `task.negotiate` carrying a structured proposal |

All three share the same wire primitives (`task.*`, `task.subtask.*`, `task.negotiate`), so a complex task can mix them: a fan-out within a depth-2 sub-chain, or a re-negotiated subtask after a partial failure.

### 2.2 Orchestrator selection (v1)

Two modes, owner-controlled:

1. **`owner_picked`** (default) — the owner explicitly names the orchestrator peer-id in the chain mandate. Simpler authority, easier audit, matches how humans already pick "their" home node.
2. **`agent_elected`** — the owner authorizes "any direct-bonded peer with capability `chain.orchestrate` may elect". The candidate peers then issue `task.orchestrate.bid` envelopes; first accepted bid wins.

The mode is a field on `ChainMandate` (`orchestratorSelection: "owner_picked" | "agent_elected"`) so it's auditable.

### 2.3 Topology rules (depth limit)

- **Default depth = 2** (orchestrator → workers, no sub-orchestrators).
- **Depth = 3** allowed only when the owner signs a `ChainMandate` with `allowDepth3: true`.
- **Depth > 3 is not allowed** in any mode — surfaced as a `chain.depth_exceeded` audit event and a hard error to the caller.
- The depth limit is enforced at the **orchestrator node**, not at the worker, because only the orchestrator sees the chain.

### 2.4 Lifecycle of a chain

```
created → planned → discovering → negotiating → running
   → partial (some subtasks done, others failed/retried)
   → synthesizing (orchestrator merging partial results)
   → completed | failed | cancelled
```

`partial` is a new lifecycle state added to `TaskLifecycleStateSchema`. It signals "more work in flight; orchestrator should wait, retry, or escalate." `synthesizing` is a new state distinct from `running` so consumers (UI, audit) can tell the difference between "agents are computing" and "orchestrator is merging."

---

## 3. Protocol additions

All new payloads go through the same `EnvoyEnvelope` (signed, canonical-JSON, with `version: "0.1"`). All new intents require `senderRole: "agent" | "system"` per the existing role policy.

### 3.1 New wire intents

| Intent | Sender | Recipient | Purpose |
|---|---|---|---|
| `task.chain.mandate` | agent (orchestrator) | agent (worker) | Owner-signed chain mandate authorizing a worker to participate in a chain |
| `task.chain.propose` | agent (orchestrator) | agent (worker) | Orchestrator proposes a subtask within a chain |
| `task.chain.bid` | agent (worker) | agent (orchestrator) | Worker's counter-bid (cost, ETA, scope, partial-accept) |
| `task.chain.accept` | agent (orchestrator) | agent (worker) | Orchestrator commits to a worker's bid |
| `task.chain.partial` | agent (worker) | agent (orchestrator) | Worker delivers a partial result; signals more to come |
| `task.chain.merge` | agent (orchestrator) | agent (system / owner UI) | Orchestrator publishes a composite artifact |
| `task.chain.cancel` | agent (orchestrator) or owner | agent (worker) | Cancel one subtask or whole chain |
| `task.chain.heartbeat` | agent (worker) | agent (orchestrator) | Liveness for long-running subtasks |
| `task.chain.report` | agent (orchestrator) | owner | Final chain deliverable (rich multi-section report) |

We **deliberately reuse the existing `task.*` family** for low-level verb coverage (heartbeat, cancel, result) but **wrap them in `chain.*`** at the protocol level so a router can distinguish "this is a chain operation" from "this is a lone A2A task." Concretely, the orchestrator sends `task.chain.propose` (which carries a sub-`taskId` and a `chainId`), and on accept the worker emits a `task.result` whose `chainId` and `parentTaskId` fields back-link to the chain.

The naming choice is intentional: it keeps the wire envelope's `intent` field meaningful for routing/audit without bloating the `EnvoyIntentSchema` with a parallel family. (See §10 for the alternative we considered and rejected.)

### 3.2 New payload schemas (Zod)

```typescript
// packages/protocol/src/agent-network.ts (new file)

import { z } from "zod";

/** Stable, signed-by-owner identifier for a chain. */
export const ChainMandateIdSchema = z.string().regex(/^chain_[a-zA-Z0-9_-]{8,64}$/);

/** Stable identifier for a chain instance. */
export const ChainIdSchema = z.string().regex(/^chn_[a-zA-Z0-9_-]{8,64}$/);

/** A node's stable role within a chain. The orchestrator's role is always "orchestrator". */
export const ChainRoleSchema = z.enum([
  "orchestrator",
  "worker",
  "reviewer",      // can read partial results, cannot mutate
  "observer",      // read-only; for human auditors and external agents
]);

export const ChainMandateSchema = z.object({
  chainId: ChainIdSchema,
  chainMandateId: ChainMandateIdSchema,
  // Owner DID who authorized the chain.
  ownerId: z.string().regex(/^envoy:owner:/),
  // The orchestrator peer-id. In agent_elected mode, this is the elected peer;
  // in owner_picked mode, this is the peer the owner pre-named.
  orchestratorPeerId: z.string().min(1),
  orchestratorSelection: z.enum(["owner_picked", "agent_elected"]),
  // Capabilities the orchestrator is authorized to invoke across the chain.
  // Each capability is a string tag from the agent card (e.g. "doc.translate",
  // "code.review", "report.synthesize"). This is the chain's "skill ceiling".
  authorizedCapabilities: z.array(z.string().min(1)).max(64),
  // Depth and parallelism limits. Enforced by the orchestrator.
  allowDepth3: z.boolean().default(false),
  // maxWorkers = active concurrent worker peer sessions, NOT total historical
  // allocations. A worker counts toward this limit from award until the
  // subtask reaches a terminal state (`completed | failed | cancelled`).
  // See §7.4: when a worker is unresponsive, the orchestrator MUST emit
  // `chain.subtask_cancelled` to release the slot BEFORE awarding the backup.
  maxWorkers: z.number().int().min(1).max(64).default(8),
  // The orchestrator may mint sub-mandates within these bounds. Sub-mandate
  // budget = min(parent cost limit, sub-share).
  maxSubMandateCostUsd: z.number().nonnegative(),
  maxChainCostUsd: z.number().nonnegative(),
  expiresAt: z.string().datetime(),
  // What to do with partial results on termination.
  terminationPolicy: z.enum(["all_required", "best_effort", "first_n", "owner_decides"]),
  // Required acceptance criteria each worker must satisfy.
  acceptanceCriteria: z.array(z.object({
    description: z.string().min(1).max(500),
    verifier: z.enum(["orchestrator", "owner", "external_agent"]),
    externalVerifierPeerId: z.string().optional(),
  })).max(16),
});
export type ChainMandate = z.infer<typeof ChainMandateSchema>;

export const ChainMandateSignedSchema = ChainMandateSchema.extend({
  ownerPublicKey: z.string().min(1),
  signature: z.string().min(1),
});

/** A single subtask within a chain. */
export const ChainSubtaskSchema = z.object({
  subtaskId: z.string().regex(/^sub_[a-zA-Z0-9_-]{8,64}$/),
  chainId: ChainIdSchema,
  parentSubtaskId: z.string().regex(/^sub_[a-zA-Z0-9_-]{8,64}$/).optional(),
  depth: z.number().int().min(1).max(3),
  // Specialty hint — soft-matched against agentNetworkProfile.skills[].
  requiredSkill: z.string().min(1).max(64),
  // Plain-language brief the worker receives.
  objective: z.string().min(1).max(8000),
  // Explicit inputs (file IDs, prior artifact IDs, prior subtask IDs).
  inputs: z.array(z.object({
    kind: z.enum(["file", "artifact", "subtask_result", "knowledge_chunk"]),
    refId: z.string().min(1),
    note: z.string().max(500).optional(),
  })).max(32).default([]),
  // Expected output shape. Validated against ArtifactSchema on receipt.
  expectedArtifactKind: z.enum(["text", "file", "structured", "composite"]),
  // Cost ceiling for THIS subtask. Worker cannot bid above this.
  costCeilingUsd: z.number().nonnegative(),
  // Soft deadline; orchestrator may extend via negotiation.
  deadlineAt: z.string().datetime(),
  // If true, orchestrator requires multiple bids before accepting.
  requireMultipleBids: z.boolean().default(false),
  // If true, orchestrator may split this into sub-subtasks (depth 3 only).
  allowSplit: z.boolean().default(false),
});

/** Worker's response to a chain subtask proposal. */
export const ChainSubtaskBidSchema = z.object({
  subtaskId: z.string().regex(/^sub_/),
  chainId: ChainIdSchema,
  bidKind: z.enum(["accept", "counter", "split", "merge", "decline"]),
  // For "accept": the agreed cost / ETA.
  proposedCostUsd: z.number().nonnegative().optional(),
  proposedEtaAt: z.string().datetime().optional(),
  // For "counter": a redrafted objective within the same capability.
  counterObjective: z.string().max(8000).optional(),
  // For "split": proposed sub-subtask IDs the orchestrator should create.
  proposedSplits: z.array(ChainSubtaskSchema.pick({ subtaskId: true })).optional(),
  // For "merge": IDs of adjacent subtasks this worker could absorb.
  mergeWithSubtaskIds: z.array(z.string()).optional(),
  // Free-form justification, capped to keep audit logs small.
  justification: z.string().max(1000).optional(),
  // Hard expiry for this bid. The worker MUST reject any `task.chain.accept`
  // that arrives after `bidExpiresAt`. Default: proposal deadline + 30s grace.
  // Rationale: state-machine replay after an orchestrator crash must not award
  // a stale bid whose worker conditions (VRAM, third-party API cost) have
  // shifted since the bid was emitted. Recommended ceiling: 5 minutes.
  bidExpiresAt: z.string().datetime(),
});

/** Orchestrator's reply to a bid. */
export const ChainSubtaskAwardSchema = z.object({
  subtaskId: z.string().regex(/^sub_/),
  chainId: ChainIdSchema,
  workerPeerId: z.string().min(1),
  // Negotiation round counter. Enforces the 3-round cap from §5.2 at the
  // schema layer: a 4th round is a parse-time reject.
  negotiationRound: z.number().int().min(1).max(3).default(1),
  awardKind: z.enum(["accepted", "rejected", "split_accepted", "merge_accepted", "re_bidding"]),
  finalCostUsd: z.number().nonnegative(),
  finalEtaAt: z.string().datetime(),
  // When re_bidding, the orchestrator's counter-offer.
  counterOffer: ChainSubtaskBidSchema.optional(),
});

/** Subtask partial result — worker signals "more to come". */
export const ChainSubtaskPartialSchema = z.object({
  subtaskId: z.string().regex(/^sub_/),
  chainId: ChainIdSchema,
  // Sequence number so the orchestrator can detect drops.
  seq: z.number().int().min(1),
  artifact: ArtifactSchema, // Phase 33 union
  progressPct: z.number().min(0).max(100),
  nextEtaAt: z.string().datetime().optional(),
});

/** Final orchestrator-published composite. */
export const ChainReportSchema = z.object({
  chainId: ChainIdSchema,
  // The composite artifact. Internally a list of (subtaskId, artifact, weight).
  compositeArtifact: CompositeArtifactSchema,
  // Synthesized report sections for human readers.
  report: z.object({
    title: z.string().min(1).max(200),
    executiveSummary: z.string().min(1).max(8000),
    sections: z.array(z.object({
      heading: z.string().min(1).max(200),
      body: z.string().min(1).max(16000),
      citations: z.array(z.object({
        subtaskId: z.string().regex(/^sub_/),
        workerPeerId: z.string().min(1),
        artifactRef: z.string().min(1),
        excerpt: z.string().max(500).optional(),
      })).max(32).default([]),
    })).max(32),
    // Audit-friendly summary of the chain itself.
    chainSummary: z.object({
      totalSubtasks: z.number().int().min(0),
      completedSubtasks: z.number().int().min(0),
      failedSubtasks: z.number().int().min(0),
      totalCostUsd: z.number().nonnegative(),
      // Cost of the orchestrator's own synthesis pass (LLM token spend when
      // aggregating partials into the composite + sections). Tracked separately
      // from worker cost so the audit story can show "synthesis stayed within
      // its budget" independently of "workers stayed within their ceilings."
      // Must satisfy: workerCostUsd + synthesisCostUsd == totalCostUsd.
      synthesisCostUsd: z.number().nonnegative(),
      durationMs: z.number().int().nonnegative(),
      workerPeerIds: z.array(z.string()).min(1),
    }),
  }),
});

/** A new artifact kind — composite, bundling N contributions with weights. */
export const CompositeArtifactSchema = z.object({
  kind: z.literal("composite"),
  // Each entry is a (subtaskId, artifact, weight, attribution).
  parts: z.array(z.object({
    subtaskId: z.string().regex(/^sub_/),
    workerPeerId: z.string().min(1),
    weight: z.number().min(0).max(1),
    artifact: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("text"), text: z.string() }),
      z.object({ kind: z.literal("file"), fileId: z.string() }),
      z.object({ kind: z.literal("structured"), schemaRef: z.string(), data: z.unknown() }),
    ]),
    note: z.string().max(500).optional(),
  })).min(1).max(64),
  // Optional aggregation function. Default: orchestrator-defined synthesis.
  aggregation: z.enum(["concatenate", "weighted_concat", "merge_structured", "owner_review"]).default("weighted_concat"),
});

/** Wire payload wrappers (each carries chainId + chainMandateId). */
export const TaskChainProposePayloadSchema = z.object({
  chainMandate: ChainMandateSignedSchema,
  subtask: ChainSubtaskSchema,
});

export const TaskChainBidPayloadSchema = ChainSubtaskBidSchema;
export const TaskChainAwardPayloadSchema = ChainSubtaskAwardSchema;
export const TaskChainPartialPayloadSchema = ChainSubtaskPartialSchema;
export const TaskChainMergePayloadSchema = ChainReportSchema;
export const TaskChainReportPayloadSchema = ChainReportSchema;
export const TaskChainCancelPayloadSchema = z.object({
  chainId: ChainIdSchema,
  reason: z.string().max(500),
  affectedSubtaskIds: z.array(z.string().regex(/^sub_/)).default([]),
});
```

### 3.3 Role policy

All new intents require `senderRole: "agent"` and `recipientRole: "agent"`, except:

- `task.chain.report` is the **only** exception — `senderRole: "agent"`, `recipientRole: "human"` (the orchestrator reports back to the owner). It uses the human channel posture (`approvalRequired: false` because the owner is the authority that authorized the chain).

`task.chain.bid` is `senderRole: "agent" | "system"` — a system process may bid on behalf of an agent during scheduled-job mode (Phase 22-style), but the bid must be signed by the agent key.

### 3.4 What stays the same

- **Single-shot A2A** (`task.propose → task.result`) is unchanged. Phase 24 stays as-is.
- **Capability advertisement** (`agent.card.request / response`) is unchanged.
- **Bond engine policy** is unchanged — capability gating still applies at intent level.

---

## 4. Task tree & lineage

This is the most consequential schema change. We add `chainId`, `parentTaskId`, `depth`, and `subtaskId` to **both** the journal entry and the result payload.

### 4.1 Updated `TaskJournalEntry`

```typescript
// packages/protocol/src/index.ts — extend, do not break, existing fields

export const TaskJournalEntrySchema = z.object({
  version: z.literal("0.1"),
  eventId: z.string().min(1),
  taskId: z.string().min(1),

  // ── New in v0.2 ────────────────────────────────────────────
  chainId: ChainIdSchema.optional(),        // present iff this entry belongs to a chain
  parentTaskId: z.string().min(1).optional(),// null for chain root
  subtaskId: z.string().regex(/^sub_/).optional(),
  depth: z.number().int().min(0).max(3).optional(),
  // ───────────────────────────────────────────────────────────

  mandateId: z.string().min(1).optional(),
  eventType: TaskJournalEventTypeSchema,
  state: TaskLifecycleStateSchema,
  summary: z.string().min(1).max(2000),
  peerOwnerId: z.string().min(1).optional(),
  peerDeviceId: z.string().min(1).optional(),
  relatedMessageId: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
});
```

A new event type `chain_subtask_completed` is added to `TaskJournalEventTypeSchema`.

### 4.2 Updated `TaskResultPayload`

```typescript
export const TaskResultPayloadSchema = z.object({
  taskId: z.string().min(1),
  mandateId: z.string().min(1).optional(),
  status: TaskLifecycleStateSchema,

  // ── New in v0.2 ────────────────────────────────────────────
  chainId: ChainIdSchema.optional(),
  parentTaskId: z.string().min(1).optional(),
  subtaskId: z.string().regex(/^sub_/).optional(),
  // ───────────────────────────────────────────────────────────

  summary: z.string().min(1).max(4000),
  artifacts: z.array(ArtifactSchema).default([]),
  deliveryAttestation: z.object({...}).optional(),
});
```

### 4.3 Tree queries

`LocalTaskStore` exposes a new method:

```typescript
interface LocalTaskStore {
  // … existing methods …
  /** Returns all journal entries for a chain, sorted by createdAt, in DFS pre-order. */
  listChainEntries(chainId: ChainId): Promise<TaskJournalEntry[]>;
  /** Returns the chain report if it has been published; otherwise undefined. */
  getChainReport(chainId: ChainId): Promise<ChainReport | undefined>;
  /** Returns all chain reports owned by this home node, newest first. */
  listChainReports(opts?: { limit?: number; sinceMs?: number }): Promise<ChainReport[]>;
}
```

`LocalTaskResultsStore` keeps the existing per-`taskId` upsert (a subtask produces its own `task.result`), and adds a new file `chain-reports.json` keyed by `chainId`. The two stores remain linked: each `ChainReport.compositeArtifact.parts[].subtaskId` references a subtask whose individual `task.result` lives in `task-results.json`.

### 4.4 Retention

- `task-results.json`: existing policy + cap at 10,000 entries (LRU eviction on the worker node). Subtask results inside a chain are exempt from LRU until the chain itself is GC'd.
- `chain-reports.json`: 90-day default retention. Owner may pin reports (no GC). On expiry, the chain's per-subtask results are released for LRU.
- Audit JSONL: chain events are tagged with `chainId` so `readTaskJournalEntries({ chainId })` is O(matches) over the audit stream. No new index file needed.

---

## 5. Multi-round negotiation

### 5.1 Lifecycle of a subtask proposal

```
propose  ──►  (worker bids)  ──►  award
   ▲                │                  │
   │                │                  ▼
   │           counter / split /     worker executes
   │              merge / decline        │
   │                │                  ▼
   └────────────────┘            partial → partial → result
```

### 5.2 Counter-proposal rules

- A worker may counter-bid up to **3 times** per subtask. After 3 counters, the worker must `accept` or `decline`.
- The orchestrator may re-bid (send a `counter` back to the worker) up to **3 times** per subtask. After 3 rounds of re-bidding, the orchestrator must `award` to one of the bidders or `cancel` the subtask.
- **Cost ceiling is hard.** A counter that exceeds `costCeilingUsd` is rejected at parse time.
- **Splitting** is only allowed when `subtask.allowSplit === true` AND the chain's `allowDepth3 === true`. A split bid creates new sub-subtasks; the original subtask transitions to `cancelled` with reason `split_into_subtasks`.

### 5.3 Multi-bid collection

When `requireMultipleBids: true`, the orchestrator waits for **at least 2** bids before awarding. The window is `min(bidderCount, 3) × 30s` — if only one bid arrives in that window, the orchestrator may award it as a single-bidder case.

### 5.4 Why "first acceptance" is not enough

The current Phase 24 design awards on first acceptance. That works for solo A2A, but in a chain with multiple bidders and partial-failure tolerance:

- **Adversarial case:** a malicious worker accepts immediately to win, then sends an empty/poisoned `task.chain.partial` later. The orchestrator can't recover — the budget is gone.
- **Quality case:** the fastest bidder isn't always the best. Cost / reputation / ETA must be weighed.
- **Resilience case:** if one bidder fails mid-task, the orchestrator needs the other bids still on the table for fallback.

Counter-proposals close these gaps.

---

## 6. NodeService API additions

These are the public RPC methods exposed by `NodeServiceImpl` to Social/EnvoyGo/external clients.

```typescript
// packages/api/src/node-service.ts — additions

interface NodeService {
  // ── Chain authoring (called by the owner UI / orchestrator planning) ──
  /** Author a new chain mandate. Owner-signed. */
  createChainMandate(input: {
    orchestratorPeerId: string;
    orchestratorSelection: "owner_picked" | "agent_elected";
    authorizedCapabilities: string[];
    allowDepth3: boolean;
    maxWorkers: number;
    maxSubMandateCostUsd: number;
    maxChainCostUsd: number;
    expiresAt: string;
    terminationPolicy: ChainMandate["terminationPolicy"];
    acceptanceCriteria: ChainMandate["acceptanceCriteria"];
  }): Promise<{ chainId: ChainId; chainMandate: ChainMandateSigned }>;

  /** Decompose a goal into a chain of subtasks. LLM-driven, uses Phase 24's
   *  `decomposeTask` as a fallback. */
  planChain(input: {
    chainMandateId: string;
    goal: string;
    existingArtifacts?: Artifact[];
    preferredCapabilities?: string[];
  }): Promise<{ subtasks: ChainSubtask[]; planRationale: string }>;

  /** Launch a planned chain (orchestrator signs + sends task.chain.propose). */
  launchChain(input: {
    chainId: ChainId;
    subtasks: ChainSubtask[];
  }): Promise<{ chainId: ChainId; launchedAt: string }>;

  // ── Chain runtime (called by orchestrator internals + external monitors) ──
  /** Inspect chain state. */
  getChainStatus(chainId: ChainId): Promise<ChainStatusSnapshot>;
  listChainSubtasks(chainId: ChainId): Promise<ChainSubtask[]>;
  listChainBids(chainId: ChainId): Promise<ChainSubtaskBid[]>;
  listChainAwards(chainId: ChainId): Promise<ChainSubtaskAward[]>;

  /** Cancel a chain or specific subtasks. Owner or orchestrator only. */
  cancelChain(input: {
    chainId: ChainId;
    affectedSubtaskIds?: string[];
    reason: string;
  }): Promise<{ cancelled: boolean; cancelledAt: string }>;

  /** Inject a counter-bid (used by external bidders). */
  submitChainBid(input: ChainSubtaskBid): Promise<{ accepted: boolean }>;

  /** Publish the final chain report. Orchestrator only. */
  publishChainReport(input: ChainReport): Promise<{ publishedAt: string }>;

  // ── Worker side (called by a worker node when it receives task.chain.propose) ──
  /** List chain proposals waiting for THIS worker's bid. */
  listPendingChainProposals(): Promise<TaskChainProposePayload[]>;
  /** Submit a bid for a specific subtask. */
  bidOnSubtask(input: ChainSubtaskBid): Promise<{ accepted: boolean }>;
  /** Deliver a partial result. */
  deliverChainPartial(input: ChainSubtaskPartial): Promise<{ accepted: boolean; seq: number }>;
  /** Mark a subtask complete with its final artifact. */
  deliverChainResult(input: {
    subtaskId: string;
    chainId: ChainId;
    artifact: Artifact;
    summary: string;
  }): Promise<{ accepted: boolean }>;
}
```

### 6.1 Existing API surface that's preserved

- `runOwnerAgentTurn` (Phase 18B) — the planner remains the entry point for "owner says X." In v2 of the planner, the planner can detect when a goal matches a multi-step pattern and **auto-call `planChain` + `launchChain`** instead of doing local tool work. This is the integration point with the existing planner loop (Phase 24B).
- `runTaskNegotiationLoop` (Phase 24A) — unchanged for solo A2A. New code paths under `task.chain.*` are additive.
- `getOpenClawStatus` / `getBridgeStatus` (Phase 32) — unchanged. The AI Engine selection is orthogonal to whether the orchestrator is OpenClaw or Ext Agent.

---

## 7. Security model

### 7.1 Mandate hierarchy

```
Owner
  └── ChainMandate (owner-signed, on-chain-orchestrator peer)
        └── SubMandate (orchestrator-signed, on-worker peer)
              └── SubMandate (worker-signed, on-sub-worker peer; depth-3 only)
```

Each sub-mandate **must** carry:

- `parentMandateId`: the chain mandate it descends from
- `costShare`: the fraction of the parent's budget this sub-mandate consumes (must sum to ≤1.0 across siblings)
- `expiresAt`: ≤ parent's `expiresAt`
- `scope`: subset of parent's `authorizedCapabilities`

The bonds engine (`packages/bonds/src/index.ts`) gains a new entry:

```typescript
const capabilityRequirements: Partial<Record<EnvoyIntent, Capability[][]>> = {
  // …existing…
  "task.chain.propose":    [["task.execute", "chain.orchestrate"]],
  "task.chain.bid":        [["task.execute"]],
  "task.chain.accept":     [["task.execute", "chain.orchestrate"]],
  "task.chain.partial":    [["task.execute"]],
  "task.chain.merge":      [["task.execute", "chain.orchestrate"]],
  "task.chain.cancel":     [["task.execute"], ["approval.prompt"]],
  "task.chain.heartbeat":  [["task.execute"]],
  "task.chain.report":     [["task.execute", "chain.orchestrate"]],
  "task.chain.mandate":    [["task.execute"]],
};
```

Two new `Capability` values are added to `CapabilitySchema`:

- `chain.orchestrate` — agent can act as chain orchestrator (mint sub-mandates, merge artifacts)
- (Workers don't need a new capability; `task.execute` is sufficient for bidding and delivering partials.)

### 7.2 Trust gating

Each rule is stated in the direction **the receiving node requires the sending node to have**. The asymmetry is intentional and is **not** a relaxed/proposed inconsistency — each rule protects the *receiver* from a different class of leakage:

| Direction | Intent | Required bond of sender | What the receiver is protecting |
|---|---|---|---|
| Orchestrator → Worker | `task.chain.propose` | **`referred`** (existing `task.*` policy) | The worker will execute real work for the orchestrator; trust must exceed "stranger." |
| Worker → Orchestrator | `task.chain.bid` | **`direct`** | The worker is sharing its **pricing structure** — a competitive secret. Only share with orchestrators the worker has a closer-than-referred relationship with. |
| Orchestrator → Worker | `task.chain.accept` (award) | **`referred`** | The worker commits compute on the orchestrator's word; existing `task.*` policy already requires this. |

**Why asymmetric?** Cost structures are competitive data. A worker who reveals pricing to a thinly-connected orchestrator gives that orchestrator leverage in future negotiations. Bond level is the worker's market-leverage knob — `referred` says "I'll do the work for you," `direct` says "I'll tell you what it'd cost me first." These are different promises with different prerequisites. The asymmetry is the protection, not the bug.

`task.chain.report` reaches the owner over the existing chat / knowledge channels; no new channel required. (Report delivery inherits the channel-posture policy that already gates `report.create`, which requires `direct`-minimum in the current bonds table; no chain-specific tightening.)

### 7.3 Audit events

`AuditEventType` gains:

- `chain.created`, `chain.planned`, `chain.launched`, `chain.completed`, `chain.failed`, `chain.cancelled`
- `chain.subtask_proposed`, `chain.subtask_bid_received`, `chain.subtask_awarded`, `chain.subtask_partial_received`, `chain.subtask_completed`
- `chain.subtask_split`, `chain.subtask_merged`, `chain.subtask_re_bid`
- `chain.report_published`, `chain.depth_exceeded`, `chain.budget_exceeded`

Each audit event carries the full lineage (`chainId`, `parentTaskId`, `subtaskId`, `depth`) so a single audit query can reconstruct the chain tree.

### 7.4 Failure containment

- **Budget exceeded:** orchestrator marks chain `failed` with `reason: budget_exceeded`. All in-flight subtasks receive `task.chain.cancel`. Already-completed subtasks' results are still merged into a partial chain report — the owner is informed that the chain is incomplete.
- **Worker unresponsive:** orchestrator's `task.chain.heartbeat` cadence is 30s; after 3 missed heartbeats the orchestrator may re-award the subtask to a backup bidder (one of the original bid list) or cancel. **Ordering rule (mandatory):** the orchestrator MUST emit a `chain.subtask_cancelled` audit event AND send the `task.chain.cancel` envelope to the unresponsive worker BEFORE sending the new `task.chain.accept` to the backup. This releases the slot in `maxWorkers` so the new award does not exceed the parallelism cap. Skipping this step is a parsing-layer security violation against the `ChainMandate.maxWorkers` ceiling.
- **Orchestrator crash:** the chain `taskId` (root) is in the audit journal. On orchestrator restart, the journal replays the chain — any subtasks that completed before the crash are re-merged; any in-flight subtasks are re-bid. **Replay must honor `bidExpiresAt`** (§3.2): any bid whose `bidExpiresAt` is in the past at replay time is discarded, and the orchestrator solicits fresh bids for that subtask.
- **Cost ceiling violated by sub-mandate:** the bonds engine rejects the sub-mandate at parse time. The orchestrator logs `chain.budget_exceeded` and fails the chain.

### 7.5 Orchestrator-side `ChainBudgetLedger`

The orchestrator maintains an **in-memory budget ledger** keyed by `chainId`. Because workers cannot see each other and there is no shared ledger across the P2P mesh, the orchestrator is the sole authority on whether a new award would over-commit the chain's signed `maxChainCostUsd`. The ledger is the only thing standing between "three workers finish a $20 task for $30" and an honest budget.

```typescript
// apps/node/src/chain-budget-ledger.ts (new file, runtime state, not wire)

interface ChainBudgetLedgerEntry {
  chainId: ChainId;
  maxChainCostUsd: number;        // from ChainMandate
  maxSynthesisCostUsd: number;    // reserve for the orchestrator's own pass
  workerAllocations: Map<subtaskId, {
    peerId: string;
    committedUsd: number;
    status: "negotiating" | "awarded" | "partial_received" | "completed" | "cancelled";
  }>;
  synthesisSpendUsd: number;
}

interface ChainBudgetLedger {
  // Reserve the orchestrator's synthesis budget up-front, so worker awards
  // never spend into the LLM aggregation reserve.
  reserve(chainId: ChainId, maxChainCostUsd: number): { ok: true; workerBudgetUsd: number }
    | { ok: false; reason: "below_reserve_floor" };

  // Called BEFORE sending task.chain.accept. Returns false if the new award
  // would push workerAllocations sum above workerBudgetUsd. The caller MUST
  // NOT send the accept envelope on a `false` return.
  tryCommit(chainId: ChainId, subtaskId: string, peerId: string, committedUsd: number):
    { ok: true } | { ok: false; reason: "would_overcommit" };

  // Roll back a reservation when a worker declines or the bid is rejected.
  release(chainId: ChainId, subtaskId: string): void;

  // When the chain terminates, every residual allocation is rolled back so the
  // totals reconcile to `chainSummary.totalCostUsd` in the published report.
  finalize(chainId: ChainId): { workerCostUsd: number; synthesisCostUsd: number };
}
```

**Invariant:** at any moment, `Σ workerAllocations.committedUsd + synthesisSpendUsd ≤ maxChainCostUsd`. The ledger is the only thing that enforces this — workers cannot enforce it (they don't know about peers), and the wire does not enforce it (the budget is owner-signed, not peer-known).

**Crash recovery:** the ledger is rebuilt from the audit journal on orchestrator restart. The journal entries carry enough info (`chain.subtask_awarded` with `committedUsd`, `chain.synthesis_pass_completed` with `synthesisCostUsd`) to reconstitute the running totals before any new awards are issued.

**Wire visibility:** workers do NOT need to see other workers' allocations on the wire. The proposal carries only `costCeilingUsd` for the individual subtask — the orchestrator's job is to keep its own internal ledger honest and never issue an award that violates the global cap.

---

## 8. End-to-end observability

### 8.1 Chain tree reconstruction

A new Social UI tab **Activity → Chains** shows:

- A tree view of chains, expandable
- Per-subtask: status, worker peer, cost so far, ETA, last heartbeat, partial artifact preview
- Per-chain: total cost vs. budget, # completed / # total, time to ETA, current phase (`negotiating` | `running` | `synthesizing` | `completed`)

### 8.2 Rich report rendering

When a chain publishes a `task.chain.report`, the Social UI renders:

- A header with chain metadata (chainId, duration, total cost, worker peer-ids)
- The executive summary (long-form text)
- A list of sections, each with optional citations (clicking a citation jumps to the underlying subtask result in the chain tree)
- The composite artifact (downloadable as a single JSON, or rendered per-kind — text inline, file via the existing file-preview component, structured via the schema-ref renderer)

### 8.3 Audit trail

Every chain action appends to the existing JSONL audit log. The audit log supports:

- `grep '"chainId":"<id>"'` to extract a single chain's full history
- `jq 'select(.eventType | startswith("chain."))'` for chain-only events
- Existing audit viewer (Social → Settings → Activity) gains a "Chains" filter

---

## 9. Phased rollout

### 9.1 Phase 40A — Foundations (single-week)

- Add the new payload schemas to `packages/protocol/src/agent-network.ts` (new file)
- Extend `EnvoyIntentSchema` with the 9 new `task.chain.*` intents
- Extend `CapabilitySchema` with `chain.orchestrate`
- Extend `AuditEventType` with chain event types
- Update role-policy table
- Update `LocalTaskStore` with `listChainEntries`, `getChainReport`, `listChainReports`
- Add `chain-reports.json` persistence
- Tests: schema coverage, role-policy table coverage, store round-trip

**Deliverable:** protocol defines the wire surface; nothing sends them yet.

### 9.2 Phase 40B — Orchestrator core (single-week)

- New module `apps/node/src/chain-orchestrator.ts`:
  - `planChain(mandate, goal, deps)` — wraps the existing `decomposeTask` keyword fallback behind an LLM call
  - `launchChain(mandate, subtasks, deps)` — sends `task.chain.propose` envelopes
  - `evaluateBids(chainId, deps)` — score bids, decide awards
  - `trackChain(chainId, deps)` — heartbeat loop, partial collection, fallback on missed heartbeats
  - `synthesizeChain(chainId, deps)` — merge partials into a `ChainReport`
- New module `apps/node/src/chain-worker.ts`:
  - Inbound handlers for `task.chain.propose`, `task.chain.bid`, etc.
  - Outbound helpers for `deliverChainPartial`, `deliverChainResult`
- New module `apps/node/src/chain-bid-strategy.ts`:
  - Default bid policy: cost = base + reputation_discount, ETA = capability-local-ETA + slack
  - Honors `costCeilingUsd`, returns `decline` if exceeded
- RPC plumbing: `createChainMandate`, `planChain`, `launchChain`, `getChainStatus`, `cancelChain`, `submitChainBid`, `publishChainReport`, `listPendingChainProposals`, `bidOnSubtask`, `deliverChainPartial`, `deliverChainResult`
- Tests: in-process orchestrator tests, peer-to-peer round-trip tests via the existing two-node smoke harness

**Deliverable:** a single orchestrator node can drive a 3-worker fan-out end-to-end and produce a `ChainReport`.

### 9.3 Phase 40C — UI integration (single-week)

- Social → Settings → AI → "Chains" (in the existing Activity tab; new subview)
- Social → Agent Card → "Try a chain" — owner can launch a chain from a card's example objectives
- EnvoyGo `Me → AI Engine` adds a "Recent chains" section (read-only)
- Tests: component tests, e2e test launching a chain from the chat composer

**Deliverable:** owners can author, monitor, and read chain reports from the UI.

### 9.4 Phase 40D — Multi-orchestrator & negotiation polish (single-week)

- Multi-bid collection (default `requireMultipleBids: true` for chains > 3 workers)
- Counter-proposal UI in the orchestrator's bid-inbox (currently auto-evaluated)
- Cost-rebalance UI for the owner when `partial` results show uneven quality
- Chain-report pinning (no GC for pinned reports)
- LLM decomposer replaces the keyword fallback for plans longer than 3 steps

**Deliverable:** production-ready chain authoring experience.

### 9.5 Phase 40E — Cross-orchestrator chains (deferred)

- Orchestrator hands off a sub-chain to another orchestrator (depth-3 with explicit owner pre-approval)
- Cross-home chains (orchestrator on home-A, workers on home-B and home-C)
- Cross-network chains via relay-only transport

**Deliverable:** chains that span multiple home nodes. Requires Phase 11C-D mobile parity first.

---

## 10. Alternatives considered

### 10.1 Reuse the existing `task.*` verbs without a `chain.*` family

**Rejected.** A `task.propose` with `parentTaskId` would carry lineage, but a router / dispatcher / UI filter that wants to show "chains only" has to scan every task envelope and check for the lineage field. The `task.chain.*` intent namespace makes the surface introspectable.

### 10.2 LLM-driven decomposition as a hard requirement

**Rejected for v1.** The keyword fallback (`decomposeTask`) plus a per-step LLM is enough. Hard-requiring an LLM at decomposition time means offline / air-gapped home nodes (the Phase 11 mobile case) can't run chains. The LLM step is added in Phase 40D, not 40B.

### 10.3 Blockchain-style consensus on subtask awards

**Rejected.** EnvoyMesh is signed-envelope based, not consensus-based. A signed `task.chain.award` from the orchestrator is sufficient authority; no consensus needed. Cross-orchestrator arbitration (rare) uses the existing owner-decision flow.

### 10.4 Streaming partial results via libp2p streams

**Considered.** Using libp2p streams for long-running partial result delivery (instead of discrete envelopes) is cleaner for high-throughput cases. **Deferred** to a later phase: the discrete-envelope model is simpler to audit and route, and libp2p-stream semantics are not yet exposed for `task.*` envelopes elsewhere in the codebase. Tracked as a future optimization.

---

## 11. Open questions for owner review

> **Status after Gemini review (2026-06-17):** all 5 questions below were confirmed in the design-review pass. The doc reflects the confirmed answers. The owner should still review the wording in §3, §4, §5, §7.5 before approving implementation.

1. **Depth = 2 vs. 3 default.** ✅ **Confirmed: depth = 2 default with `allowDepth3: true` opt-in** on the chain mandate. Keeps the budget tree one level shallower and the audit story simpler; depth-3 chains pay the cost of writing + verifying a sub-mandate.
2. **Bidding cost ceiling enforcement.** ✅ **Confirmed: hard-reject at parse time.** The orchestrator's runtime rejects an incoming award whose `finalCostUsd` exceeds `costCeilingUsd`, and the bid that exceeded is also rejected (via the wire schema's nonnegativity constraint + a runtime cap). Audit gets a `chain.budget_exceeded` event with the offending peer-id.
3. **`task.chain.report` channel.** ✅ **Confirmed: dedicated channel.** `task.chain.report` is its own intent with `recipientRole: "human"`. The Social + EnvoyGo renderers get a specialized citation-aware view that `chat.message` cannot express.
4. **Composite artifact aggregation.** ✅ **Confirmed: LLM-driven synthesis by default**, **with a pre-flight budget check.** Before invoking the synthesis model, the orchestrator must verify `maxChainCostUsd − (Σ workerAllocations.committedUsd + synthesisSpendUsd) ≥ estimatedSynthesisCostUsd`. If not, the chain publishes a `best_effort` report (raw parts only, marked `aggregation: "owner_review"`) and the owner is told synthesis was skipped for budget reasons.
5. **Phase 40E (cross-home chains) timing.** ✅ **Confirmed: deferred** until Phase 11 mobile parity ships. Cross-home routing requires stable mobile relay endpoints, and layering cross-home multi-orchestrator consensus on top of an unstable mobile layer is too much surface area.

---

## 12. File-by-file change map

When this proposal is approved, the implementation will touch:

**New files:**
- `packages/protocol/src/agent-network.ts` — new schemas
- `apps/node/src/chain-orchestrator.ts` — orchestrator runtime
- `apps/node/src/chain-worker.ts` — worker inbound handlers
- `apps/node/src/chain-bid-strategy.ts` — bid scoring
- `apps/node/src/chain-report-synthesizer.ts` — merge + composite artifact
- `packages/local-store/src/chain-reports-store.ts` — new persistence
- `apps/social/src/components/views/ChainsView.tsx` — owner UI
- `apps/social/src/components/ChainTreeView.tsx` — chain tree component
- `docs/agent-network-runbook.md` — operator guide (post-Phase 40C)

**Modified files:**
- `packages/protocol/src/index.ts` — extend `EnvoyIntentSchema`, `CapabilitySchema`, `TaskJournalEntrySchema`, `TaskResultPayloadSchema`, `AuditEventType`; add new lifecycle states `partial`, `synthesizing`; add `task.chain.*` role-policy entries
- `packages/protocol/src/role-policy-table.ts` — add new intents
- `packages/local-store/src/index.ts` — surface chain store methods on `LocalTaskStore`
- `packages/api/src/node-service.ts` — add new RPCs
- `apps/node/src/node-service-impl.ts` — implement new RPCs; extend `runOwnerAgentTurn` to auto-detect chain candidates
- `apps/node/src/json-rpc-router.ts` — route new methods
- `apps/social/src/hooks/useNodeService.tsx` — add hook methods
- `apps/social/src/lib/direct-call-client.ts` — add client methods
- `apps/social/src/lib/storage.ts` — UI cache for chain list
- `apps/social/src/components/views/SettingsView.tsx` — wire Chains view into Settings (likely under Activity, per Phase 23)
- `apps/social/src/i18n/messages/en.ts` — add chain-related i18n keys
- `apps/envoygo/lib/services/node_service_client.dart` — add Flutter wrappers
- `docs/implementation-plan.md` — log Phase 40 ship

---

## 13. Phase 41 — Making Agent Network Usable & Powerful

> **Status:** `[~]` designed (2026-06-18). Builds on Phase 40's shipped protocol, orchestrator, worker, handoff, and relay infrastructure. Turns the keyword-based planner into an LLM-driven AI orchestrator and makes the agent network observable, billable, and resilient.

### 13.1 How we use it today

After Phase 40, the agent network is a **framework** — the schemas, state machines, and routing are correct and well-tested (77 tests), but it's not yet usable by a non-developer:

| Component | What exists | What's missing |
|-----------|------------|----------------|
| **Plan chain** | `planChain()` decomposes simple goals by keyword-matching verbs → capability tags | No LLM-driven decomposition. "Translate → Review → Summarize" works; "Find the best restaurant in Paris that my contacts have reviewed" doesn't. |
| **Discover workers** | `findWorkers(capability)` is an injectable callback — currently returns an empty array in production | No auto-population. Owner must manually configure which peers can do what. |
| **Award work** | Evaluates bids by cost; 3 negotiation rounds; budget enforcement at every step | Bid ranking is cost-only. No reputation weighting, no freshness decay, no capability-match precision score. |
| **Synthesize results** | `synthesizeChainReport()` concatenates partials; supports merge types but doesn't execute them | LLM-driven merge (`merge_structured`, `merge_summarize`) is stubbed. Composite reports are raw concatenation. |
| **Observe chains** | `chainStateSnapshot()` provides a clean read-only view | No Social UI renders it. No WebSocket push. Owner has no way to see active chains. |
| **Pay for work** | `ChainBudgetLedger` tracks committed/reserved/synthesis spend per chain | No export, no invoice, no payment rail. Budget caps are enforced but cost is invisible to the owner. |
| **Recover from stalls** | `trackChain()` detects stale subtasks via heartbeat timeout | No auto-action. Stalled subtasks remain stalled indefinitely. |

### 13.2 Phase 41 sub-phases

#### 41A — LLM decomposition & merge (🥇 highest impact)

**Goal:** Wire `llmDecompose` and `llmMerge` callbacks to EnvoyAI/OpenClaw so the orchestrator becomes an AI planner, not a keyword matcher.

**Design:**

```
Owner: "Find the best restaurant in Paris that my contacts have reviewed"
    │
    ▼
planChain(deps, state, goal, { allowLlm: true })
    │
    ├── llmDecompose(goal)
    │     │
    │     ├── Prompt: "Decompose '{goal}' into subtasks. Each subtask needs
    │     │   a capability tag from: [translation, review, search, summarize,
    │     │   analyze, extract, compare, rank]. Return JSON array."
    │     │
    │     └── Response: [
    │           { requiredSkill: "search",    objective: "Search bonded contacts' vaults for Paris restaurant reviews" },
    │           { requiredSkill: "extract",   objective: "Extract restaurant names, ratings, and review snippets" },
    │           { requiredSkill: "rank",      objective: "Rank restaurants by rating, recency, and reviewer trust tier" },
    │           { requiredSkill: "summarize", objective: "Produce a ranked list with evidence citations" }
    │         ]
    │
    ▼
launchChain() → propose to workers → evaluate bids → track progress
    │
    ▼
synthesizeChain(deps, state)
    │
    ├── llmMerge({ contributions: [...partials], kind: "merge_structured" })
    │     │
    │     ├── Prompt: "Synthesize these research results into a coherent
    │     │   report. Resolve contradictions, prioritize by recency, cite
    │     │   sources. Return JSON with { summary, rankings, sources }."
    │     │
    │     └── Response → ChainReport with aggregation: "llm_merged"
    │
    ▼
publishChainReport() → task.chain.report → owner sees final result
```

**Safety:** The LLM runs on the owner's hardware (EnvoyAI/OpenClaw), not on a worker's node. No worker sees the full goal — workers only see their assigned `objective`. The synthesis prompt includes a pre-flight budget check: `maxChainCostUsd − committedUsd − synthesisSpendUsd ≥ estimatedSynthesisCostUsd`.

**LLM fallback:** If `llmDecompose` returns `{ ok: false, reason }`, the orchestrator MUST fall back to the existing keyword-based `decomposeTask` function (Phase 40's fallback). Similarly, if `llmMerge` fails, synthesis falls back to `concatenate` aggregation with `aggregation: "concatenate"` (not `llm_merged`). The orchestrator MUST emit `chain.decompose_fallback` / `chain.merge_fallback` audit events so the owner knows the LLM path was not used. This ensures air-gapped or offline nodes can still run chains.

**Schema changes (minimal):**
- `ChainMandate.maxSynthesisCostUsd` — optional, defaults to 10% of `maxChainCostUsd`
- `llmDecompose` callback signature already defined in `ChainOrchestratorHandlerDeps`
- `llmMerge` callback signature already defined in `ChainOrchestratorHandlerDeps`

**Implementation:**
- `apps/node/src/chain-llm.ts` (new, ~200 lines) — EnvoyAI/OpenClaw adapter
  - `createLlmDecompose(envoyAI)` → returns `llmDecompose` callback
  - `createLlmMerge(envoyAI)` → returns `llmMerge` callback
  - `estimateSynthesisCost(promptTokens)` → returns USD estimate
- `apps/node/src/node-service-impl.ts` — pass EnvoyAI client to `ChainOrchestratorHandlerDeps`
- No protocol changes — callbacks are injectable deps, not schema types

**Tests:**
- `apps/node/test/chain-llm.test.ts` — mock LLM responses, verify prompt construction, cost estimation, error handling, fallback to keyword decompose on LLM failure, fallback to concatenation on merge failure
- Extend `chain-orchestrator.test.ts` — `planChain` with LLM decompose, `synthesizeChain` with LLM merge

**Exit criteria:**
- `[ ]` Owner can say "Find the best restaurant in Paris my contacts reviewed" and the orchestrator decomposes it into 4 subtasks
- `[ ]` Synthesis produces a coherent merged report, not raw concatenation
- `[ ]` Pre-flight budget check prevents synthesis if cost exceeds remaining budget
- `[ ]` LLM callbacks are injectable (tests can mock without real API keys)
- `[ ]` If LLM decompose fails, orchestrator falls back to keyword-based decomposition and emits `chain.decompose_fallback` audit event
- `[ ]` If LLM merge fails, synthesis falls back to concatenation and emits `chain.merge_fallback` audit event

---

#### 41B — Agent Card auto-discovery (🥇 highest impact)

**Goal:** When a bond is established, auto-fetch the peer's agent card and index their `membership[]`. This makes the worker pool dynamic — no manual configuration needed.

**Design:**

```
Bond established (bond.request → bond.accept)
    │
    ├── Phase 33 already registers request_agent_card as an OpenClaw tool
    │
    ├── Auto-fetch on bond: the local node sends agent.card.request
    │     to the newly bonded peer, receives agent.card.response, and
    │     indexes membership[] in an in-memory map.
    │
    └── AgentNetworkMembershipIndex (in-memory, persisted to disk on shutdown)
          capability: "translation" → [peerId_a, peerId_b]
          capability: "review"     → [peerId_b, peerId_c]
          capability: "search"     → [peerId_a]
```

**New file:**
- `apps/node/src/capability-index.ts` (~120 lines)
  - `AgentNetworkMembershipIndex` class: `Map<membershipTag, workerPeerId[]>`
  - `indexWorker(peerId, membership[])` — add/update
  - `removeWorker(peerId)` — on bond revoked
  - `findWorkers(capability)` — returns peerIds
  - `snapshot()` → persisted as JSON to `<profileDir>/capability-index.json`
  - Load on startup, save on change (debounced)

**Integration points:**
- `apps/node/src/index.ts` — after bond establishment, call `capabilityIndex.indexWorker(peerId, agentCard.capabilities)`
- `apps/node/src/chain-orchestrator.ts` — `findWorkers` callback now reads from `AgentNetworkMembershipIndex` instead of returning empty
- `apps/node/src/node-service-impl.ts` — instantiate `AgentNetworkMembershipIndex`, pass to orchestrator deps

**Tests:**
- `apps/node/test/capability-index.test.ts` — index, update, remove, snapshot persistence, load from disk

**Exit criteria:**
- `[ ]` After bonding with a peer who advertises `capabilities: ["translation", "review"]`, those appear in the capability index
- `[ ]` `findWorkers("translation")` returns the peer's ID within 5 seconds of bond establishment
- `[ ]` Index survives node restart (loads from `capability-index.json`)
- `[ ]` Revoking a bond removes the peer from the index

---

#### 41C — Bid ranking with reputation + freshness (🥈)

**Goal:** Rank bids by a composite score that considers cost, reputation, freshness, and capability-match precision — not just cost alone.

**Design:**

Replace `chain-bid-strategy.ts`'s cost-only ranking with a weighted composite:

```
bidScore(bid, peerReputation, timeNow) =
    w_cost      × (1 − bid.proposedCostUsd / maxCostCeiling)     // lower cost = higher score
  + w_reputation × (peerReputation.score / 100)                   // reputation from Phase 8K
  + w_freshness  × freshnessDecay(bid.bidExpiresAt, timeNow)     // fresher bids = higher score
  + w_precision  × capabilityMatchPrecision(bid, subtask)        // exact match > fuzzy match

**Default weights: w_cost=0.35, w_reputation=0.30, w_freshness=0.20, w_precision=0.15**
**Configurable via chain mandate: `bidRankingWeights?: { cost, reputation, freshness, precision }`**

**Weight normalization:** The orchestrator MUST validate that configured weights sum to 1.0 before use. If the sum deviates by more than 0.001, normalize by dividing each weight by the sum (e.g., `{ cost: 0.5, reputation: 0.5 }` is normalized to `{ cost: 0.5, reputation: 0.5 }` exactly; `{ cost: 1, reputation: 1 }` normalizes to `{ cost: 0.5, reputation: 0.5 }`). If any weight is negative or exceeds 1.0, reject the mandate with `{ ok: false, reason: "invalid_bid_ranking_weights" }` at mandate parse time.

**Implementation:**
- `apps/node/src/chain-bid-strategy.ts` — add `bidScore()` function, update `rankBids()` to use composite scoring
- `apps/node/src/chain-orchestrator.ts` — pass `PeerReputationRecord` to bid evaluation
- `@envoymesh/local-store` — `getPeerReputation(peerId)` already exists (Phase 8K)

**Freshness decay function:**
```typescript
function freshnessDecay(bidExpiresAt: string, now: Date): number {
  const remaining = new Date(bidExpiresAt).getTime() - now.getTime();
  if (remaining <= 0) return 0; // expired
  const maxWindow = 300_000; // 5 minutes
  return Math.min(1, remaining / maxWindow);
}
```

**Tests:**
- Extend `chain-bid-strategy.test.ts` — composite scoring, weight normalization, weight validation (reject negative/over-1 weights), edge cases (zero reputation, expired bid)

**Exit criteria:**
- `[ ]` A bid with lower cost but zero reputation scores lower than a reasonable-cost bid from a trusted peer
- `[ ]` Expired bids score 0
- `[ ]` Owner can configure bid ranking weights per chain mandate
- `[ ]` Invalid weights (negative, >1, or non-summing-to-1 without normalization) are rejected at mandate parse time

---

#### 41D — Chain UI in Social (🥉)

**Goal:** A dashboard panel in the Social UI that shows active chains, subtask progress, budget burn-down, and bid notifications.

**Design:**

```
Settings / Activity → Chains tab

┌─────────────────────────────────────────────────────────┐
│  Active Chains                                          │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 🔄 "Find best Paris restaurant"                 │   │
│  │    Chain #c_abc123 · 3/4 subtasks awarded       │   │
│  │    Budget: $2.50 / $10.00 · ETA: 4 min          │   │
│  │    [View Tree] [Cancel Chain]                    │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ ✅ "Translate → Review → Summarize handbook"     │   │
│  │    Completed · $3.75 spent · 2 min ago           │   │
│  │    [View Report]                                 │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**New components:**
- `apps/social/src/components/views/ChainsView.tsx` — dashboard panel
- `apps/social/src/components/ChainTreeView.tsx` — expandable subtask tree with status badges
- `apps/social/src/components/ChainReportView.tsx` — rendered composite report

**Data flow:**
- `NodeServiceImpl` calls `chainStateSnapshot()` on every state change
- Pushes `chain:state` events via WebSocket
- `useNodeState` / `useNodeService` subscribes and updates React state
- `ChainsView` renders from local state

**RPC surface (already defined, needs implementation):**
- `chainList()` — returns all active chain snapshots
- `chainGet(chainId)` — returns detailed chain state
- `chainCancel(chainId)` — cancels a chain
- `chainPlan(params)` — creates a new chain
- `chainLaunch(params)` — launches a planned chain

**Implementation touches:**
- `apps/social/src/components/views/ChainsView.tsx` (new)
- `apps/node/src/node-service-impl.ts` — implement chain RPCs
- `apps/social/src/hooks/useNodeService.tsx` — add hook methods
- `apps/social/src/components/views/SettingsView.tsx` — wire Chains tab
- `apps/social/src/i18n/messages/en.ts` — chain-related keys

**Exit criteria:**
- `[ ]` Owner sees all active chains with subtask progress and budget status
- `[ ]` Clicking "View Tree" shows an expandable subtask tree
- `[ ]` Completed chains show a rendered composite report
- `[ ]` Cancelling a chain from the UI sends cancel to all workers

---

#### 41E — Heartbeat enforcement + chain resilience (🥉)

**Goal:** Auto-detect stalled subtasks and take action — re-bid, cancel, or escalate to owner.

**Design:**

```
trackChain(deps, state) — runs every heartbeatIntervalMs (default 30s)
    │
    ├── For each active subtask:
    │     │
    │     ├── If lastHeartbeatAt > heartbeatTimeoutMs (default 120s):
    │     │     │
    │     │     ├── Log: "Subtask {id} stalled — no heartbeat for {n}ms"
    │     │     │
    │     │     └── Handle by policy:
    │     │           ├── "auto_rebid": Cancel current worker, re-launch subtask
    │     │           ├── "auto_cancel_subtask": Cancel subtask, mark chain partial
    │     │           ├── "auto_cancel_chain": Cancel entire chain
    │     │           └── "escalate": Push notification to owner
    │     │
    │     └── If lastConfidence < minConfidence (default 0.3):
    │           └── Auto-rebalance (if rebalancePolicy === "auto")
    │                 Bring in a second worker, keep best result
    │
    └── Emit chain:state push event after any state change
```

**New field on `ChainMandate`:**
- `stallPolicy`: `"auto_rebid" | "auto_cancel_subtask" | "auto_cancel_chain" | "escalate"` — default `"auto_rebid"`
- `heartbeatTimeoutMs`: number — default 120_000
- `minConfidence`: number — default 0.3

**Auto-rebalance exhaustion (critical):** When `autoRebalanceCount >= maxAutoRebalances`, the orchestrator MUST NOT issue another award. Instead:
1. Emit `chain.auto_rebalance_exhausted` audit event with `{ chainId, subtaskId, totalRebalances, reason }`.
2. Apply `stallPolicy` as if the subtask is permanently stalled:
   - `"auto_rebid"`: After exhausting rebalances, fall back to `"auto_cancel_subtask"` (mark chain partial).
   - `"auto_cancel_subtask"`: Cancel the subtask, emit `chain.subtask_cancelled`, keep other subtasks running.
   - `"auto_cancel_chain"`: Cancel all in-flight subtasks, emit `chain.cancelled` with `reason: "auto_rebalance_exhausted"`.
   - `"escalate"`: Push `chain:escalation` event to owner with details; do not auto-act.
3. If the mandate's `terminationPolicy` is `"owner_decides"`, always escalate after exhaustion regardless of `stallPolicy`.
4. **Invariant:** `autoRebalanceCount` is checked BEFORE attempting any award. The budget ledger is NOT affected by exhausted rebalances — only actual awards consume budget.

**Implementation:**
- `apps/node/src/chain-orchestrator.ts` — extend `trackChain()`
- `apps/node/src/chain-worker.ts` — ensure heartbeat is sent on schedule
- No new files — changes are localized to existing modules

**Tests:**
- Extend `chain-orchestrator.test.ts` — stalled subtask detection, auto-rebid, auto-cancel, escalate
- Add `chain-rebalance-exhaustion.test.ts` — verify `maxAutoRebalances` is checked before award, fallback policy applied on exhaustion, audit event emitted

**Exit criteria:**
- `[ ]` Sub-task stalled for 120s triggers auto-rebid (new worker selected)
- `[ ]` Stalled subtask with `stallPolicy: "escalate"` pushes notification to owner
- `[ ]` Low-confidence partial triggers auto-rebalance with a second worker
- `[ ]` After `maxAutoRebalances` exhausted, chain follows `stallPolicy` fallback; never issues another award
- `[ ]` `chain.auto_rebalance_exhausted` audit event is emitted with subtask and chain context

---

#### 41F — Chain audit trail (🥉)

**Goal:** Feed chain events into the existing JSONL audit pipeline so every chain operation is traceable with `correlationId`.

**Design:**

```
Chain event → ChainAuditSink.record({ type: "chain.*", outcome, summary, ... })
    │
    └── → LocalTaskStore.appendAuditEvent()
          │
          └── → <profileDir>/audit.jsonl (same file as all other audits)
```

**New audit event types:**
- `chain.planned` — goal, subtask count
- `chain.launched` — workers targeted
- `chain.bid_received` — worker, cost, bid kind
- `chain.awarded` — subtask, worker, final cost
- `chain.partial_received` — subtask, seq, progress %
- `chain.synthesized` — aggregation kind, synthesis cost
- `chain.completed` — total cost, total duration
- `chain.cancelled` — reason
- `chain.stalled` — subtask, last heartbeat
- `chain.auto_rebalance_exhausted` — subtask, total rebalances attempted, fallback policy applied (41E)
- `chain.decompose_fallback` — reason LLM decompose failed, keyword-based decomposition used (41A)
- `chain.merge_fallback` — reason LLM merge failed, concatenation used instead (41A)

**Implementation:**
- `apps/node/src/chain-inbound.ts` — already calls `deps.audit.record()`. Ensure the audit sink writes to the main JSONL.
- `apps/node/src/chain-orchestrator.ts` — add `deps.audit.record()` calls at key state transitions
- `packages/local-store/src/index.ts` — extend `AuditEventType` union with chain types

**Exit criteria:**
- `[ ]` Every chain state transition produces a JSONL audit line with `correlationId`
- `[ ]` `npm run cli -- audit --filter chain:*` shows chain events
- `[ ]` Audits survive node restart (same JSONL file)

---

#### 41G — Quick wins (low-effort, high-polish)

**41G.1 — chainStateSnapshot WebSocket push.** On every state change, push a `chain:state` event so the UI auto-updates. One-line change in `chain-orchestrator.ts` + one event subscription in the Social UI.

**41G.2 — In-memory capability index cache.** Before 41B ships, seed `findWorkers()` with an in-memory map populated from bonded contacts' agent cards. Simple: one `Map<string, string[]>` loaded on startup from `capability-index.json`.

**41G.3 — Bid justification in UI.** The `justification` field already exists on `ChainSubtaskBidSchema`. Expose it in the Chains UI so owners understand why a worker countered at a higher price.

**41G.4 — Chain cost summary CSV export.** `npm run cli -- chain export-costs <chainId>` writes a CSV with subtask, worker, cost, duration columns. Simple file write — no billing rail needed.

---

### 13.3 Phase 41 implementation plan

| Sub-phase | File(s) | Tests | ~Lines | Depends on |
|-----------|---------|-------|--------|------------|
| 41A — LLM decompose/merge | `chain-llm.ts` (new), `node-service-impl.ts` | 2 test files | ~300 | Phase 29 (OpenClaw runtime) |
| 41B — Agent Card auto-discovery | `capability-index.ts` (new), `index.ts`, `chain-orchestrator.ts` | 1 test file | ~200 | Phase 33 (A2A tool exposure) |
| 41C — Bid ranking | `chain-bid-strategy.ts` | extend existing | ~80 | Phase 8K (reputation) |
| 41D — Chain UI | `ChainsView.tsx`, `ChainTreeView.tsx`, `ChainReportView.tsx` (new) | 2 test files | ~500 | Phase 38 (WebRTC UI pattern) |
| 41E — Heartbeat enforcement | `chain-orchestrator.ts` | extend existing | ~100 | — |
| 41F — Chain audit trail | `chain-orchestrator.ts`, `chain-inbound.ts`, `local-store` | extend existing | ~80 | — |
| 41G — Quick wins | various | extend existing | ~150 | — |
| **Total** | | | **~1,410** | |

### 13.4 Phase 41 exit criteria

- `[ ]` Owner describes a goal in natural language and the orchestrator decomposes it into subtasks via LLM (41A)
- `[ ]` Workers are auto-discovered from bonded contacts' agent cards (41B)
- `[ ]` Bids are ranked by composite score (cost + reputation + freshness + precision), not cost alone (41C)
- `[ ]` Owner sees active chains, subtask progress, and budget burn-down in the Social UI (41D)
- `[ ]` Stalled subtasks are auto-detected and re-bid within 120s (41E)
- `[ ]` Every chain operation is audited with correlationId (41F)
- `[ ]` Quick wins: WebSocket push for chain state, in-memory capability cache, bid justification in UI, chain cost CSV export (41G)

---

## 14. References

- `docs/protocol-standard.md` — base EMP wire protocol
- `docs/envoyai-protocol.md` — EnvoyAI (OpenClaw) integration
- `docs/phase-33-a2a-tool-exposure.md` — typed Artifacts (Phase 33)
- `docs/agent-network-config.md` — AI Engine / Ext Agent selection (Phase 32)
- `apps/node/src/agent-chain-orchestrator.ts` — existing 1-level chain (Phase 24B, will be replaced)
- `apps/node/src/task-negotiation-loop.ts` — existing solo A2A loop (Phase 24A, will be wrapped)
- `apps/node/src/reputation-router.ts` — existing router (Phase 24C, will be a bid input)
- `packages/api/src/capability-intent-routing.ts` — existing capability routes
- `packages/local-store/src/task-results-store.ts` — existing per-task result store
- `packages/local-store/src/journal.ts` — existing JSONL audit
