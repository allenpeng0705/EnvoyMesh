# EnvoyMesh — Agent Network Collaboration Layer

> **Status:** Design proposal, **Phase 40 candidate**. Awaiting owner approval before implementation.
> **Scope:** Multi-agent collaboration, multi-round negotiation, parent/child task lineage, structured chain reports, end-to-end observability.
> **Prereqs already shipped:** Phase 24 (Agent Marketplace — single-shot A2A), Phase 33 (typed Artifacts), Phase 32 (AI Engine / Ext Agent selection), Phase 23–25 (capability routes, reputation anchors).

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
  // Required capability tag (matches the agent card's capabilities[]).
  requiredCapability: z.string().min(1).max(64),
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
});

/** Orchestrator's reply to a bid. */
export const ChainSubtaskAwardSchema = z.object({
  subtaskId: z.string().regex(/^sub_/),
  chainId: ChainIdSchema,
  workerPeerId: z.string().min(1),
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

- A worker may only receive `task.chain.propose` if the orchestrator's bond level is **at least `referred`** (existing policy: `task.*` is `referred`-minimum).
- A worker may only bid (`task.chain.bid`) if the orchestrator's bond level is **at least `direct`**. Rationale: bidding reveals the worker's cost structure, which is private to closer relationships.
- The orchestrator may only award to a worker with bond level **at least `referred`**.
- A `task.chain.report` reaches the owner over the existing chat / knowledge channels; no new channel required.

### 7.3 Audit events

`AuditEventType` gains:

- `chain.created`, `chain.planned`, `chain.launched`, `chain.completed`, `chain.failed`, `chain.cancelled`
- `chain.subtask_proposed`, `chain.subtask_bid_received`, `chain.subtask_awarded`, `chain.subtask_partial_received`, `chain.subtask_completed`
- `chain.subtask_split`, `chain.subtask_merged`, `chain.subtask_re_bid`
- `chain.report_published`, `chain.depth_exceeded`, `chain.budget_exceeded`

Each audit event carries the full lineage (`chainId`, `parentTaskId`, `subtaskId`, `depth`) so a single audit query can reconstruct the chain tree.

### 7.4 Failure containment

- **Budget exceeded:** orchestrator marks chain `failed` with `reason: budget_exceeded`. All in-flight subtasks receive `task.chain.cancel`. Already-completed subtasks' results are still merged into a partial chain report — the owner is informed that the chain is incomplete.
- **Worker unresponsive:** orchestrator's `task.chain.heartbeat` cadence is 30s; after 3 missed heartbeats the orchestrator may re-award the subtask to a backup bidder (one of the original bid list) or cancel.
- **Orchestrator crash:** the chain `taskId` (root) is in the audit journal. On orchestrator restart, the journal replays the chain — any subtasks that completed before the crash are re-merged; any in-flight subtasks are re-bid. This is **state-machine replay**, not full crash recovery.
- **Cost ceiling violated by sub-mandate:** the bonds engine rejects the sub-mandate at parse time. The orchestrator logs `chain.budget_exceeded` and fails the chain.

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

1. **Depth = 2 vs. 3 default.** This doc proposes depth = 2 default with depth = 3 opt-in. If you want depth = 3 always-on, the budget math gets more complex (orchestrator must track per-subtree budget), and the audit tree is one level deeper.
2. **Bidding cost ceiling enforcement.** Today the bid says `proposedCostUsd` and the orchestrator decides. Should the bonds engine **reject** a bid that exceeds `costCeilingUsd` at parse time, or just warn? (This doc proposes **reject** — keeps audit clean.)
3. **`task.chain.report` to owner.** Should the chain report be a chat message (uses existing `chat.message`), a knowledge entry (`knowledge.query`-shaped), or its own channel? (This doc proposes **its own channel** — `task.chain.report` with `recipientRole: "human"`, since it carries lineage metadata that `chat.message` doesn't support.)
4. **Composite artifact aggregation.** The `aggregation: "weighted_concat"` default is a stub. Should the orchestrator run an LLM pass over the weighted parts to produce a synthesized text? That's an explicit cost. (This doc proposes **yes, by default, with `owner_review` as an opt-out for "I want to read the parts and decide myself".**)
5. **Phase 40E (cross-home chains) timing.** Should it land before Phase 41 (TBD), or be deferred until after Phase 41 ships?

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

## 13. References

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
