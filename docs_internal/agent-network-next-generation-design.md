# Agent Network next-generation design

Status: implementation plan  
Scope: EnvoyMesh node, protocol, API, Social, EnvoyGo, and the Envoy Harness adapter  
Primary goal: make multi-node Team Jobs deterministic, explainable, recoverable, and measurably reliable without weakening owner control or local-first security.

Implementation progress (2026-08-26):

- `[x]` Phase 60 registered in the canonical Agent Network design and EnvoyMesh implementation plan.
- `[x]` Stable attempt IDs and attempt-aware compatibility state for current awards/partials.
- `[x]` Append-only per-chain JSONL journal: ordered events, monotonic sequence, corrupt-tail recovery, attempt projection reducer, atomic checkpoints, journal-tail replay, and checkpoint-primary restore with one-shot legacy migration.
- `[x]` Owner-only lazy step provenance RPC plus Social Execution details and EnvoyGo provenance bottom sheet; compact `provenanceSummary` on active state.
- `[x]` Synthesis/artifact lineage journaled on report publish (`artifact.selected`, `synthesis.lineage`).
- `[x]` Deterministic lab manual clock and partition/one-shot-drop fault transport.
- `[x]` Phase 60B signed leases: protocol, store, publisher, inbound, selection (post-review hardened).
- `[x]` Phase 60C strategy presets + Beta reliability store + ranking + Social strategy/lease/reliability badges.
- `[x]` Phase 60D reconcile protocol, receipt store, RECOVERING gate, recovery UX.
- `[x]` Phase 60E speculation: policy gates, dual-award wire path, cancel losers, late-final retention.
- `[x]` Phase 60F lab matrix (§10.3 scenarios 1–14), diagnostics RPCs, Social + EnvoyGo Test Agent Network, packaged three-process smoke script. Open release follow-ups: human a11y/threat sign-off.

Live checklist: [implementation-plan.md Phase 60](./implementation-plan.md#phase-60--agent-network-deterministic-execution-provenance--recovery).

## 1. Outcomes

This design adds eight connected capabilities:

1. A deterministic three-node integration lab: one assigner, one Envoy Harness worker, and one OpenClaw or Ext Agent worker.
2. Signed, short-lived worker leases as the availability source of truth.
3. Per-step execution provenance from discovery through artifact production.
4. Owner-selectable team strategies: balanced, fastest, cheapest, highest-confidence, privacy-local, and diverse-model.
5. Bounded speculative execution for critical steps.
6. Calibrated reliability by capability, runtime, model family, and connectivity path.
7. Protocol-aware restart reconciliation before timers and reassignment resume.
8. A no-spend Agent Network simulation and diagnostics experience.

These are one system rather than independent features:

```text
signed lease + manifest + local observations
                 │
                 ▼
         candidate reliability view
                 │
       strategy policy + privacy gate
                 │
                 ▼
          assignment decision
                 │
      provenance journal + checkpoint
                 │
       optional speculative attempts
                 │
                 ▼
       verification / consensus result
                 │
                 ▼
      calibrated reliability update
```

## 2. Design principles

- The assigner is authoritative for assignment, budget, provenance, and final reliability observations.
- Workers may advertise facts and capabilities, but never self-award trust or reputation.
- Every remotely accepted availability claim is signed, bounded, and expires.
- Agent Card membership remains identity/profile metadata. A lease answers “available now.”
- A transport connection is evidence of reachability, not evidence that a runtime can execute.
- Strategies alter ranking and redundancy within mandate limits; they never bypass sensitivity, cost, or owner policy.
- Restart recovery reconciles with peers before declaring work failed or spending again.
- Diagnostics simulation exercises real decision code with synthetic transports and model adapters; it must not invoke paid models or mutate reputation.
- Existing nodes remain interoperable through capability negotiation and optimistic fallback.

## 3. Canonical state model

### 3.1 Worker identity and availability

A recruitable worker is the intersection of:

```text
bond permits recruitment
AND Agent Card membership includes agent-network-worker/task.execute
AND fresh signed lease advertises the required runtime/capability
AND local readiness/transport policy accepts the route
```

For legacy peers without lease support, the assigner may use the existing ready probe, but marks the candidate `availabilitySource: legacy_probe` and applies a ranking penalty. Agent Card `lastSeenAt` must no longer mean engine availability.

### 3.2 Attempt identity

Introduce `attemptId` as the unit of execution. A subtask can have one or more attempts:

```ts
type ChainAttemptState = {
  attemptId: string;
  chainId: string;
  subtaskId: string;
  workerPeerId: string;
  workerOwnerId?: string;
  runtime: AgentRuntime;
  modelFamily?: string;
  modelId?: string;
  role: "primary" | "speculative" | "replacement";
  state:
    | "planned"
    | "offered"
    | "awarded"
    | "running"
    | "final_received"
    | "verified"
    | "selected"
    | "rejected"
    | "cancelled"
    | "lost";
  createdAt: string;
  updatedAt: string;
  assignmentReason: string[];
  reassignmentReason?: ChainReassignmentReason;
};
```

Existing `awards`, `partials`, and heartbeat maps migrate to attempt-aware storage. During compatibility rollout, the first attempt keeps the current `subtaskId` lookup projection.

### 3.3 Authoritative orchestration journal

Persist an append-only JSONL journal per active chain plus a compact checkpoint:

```text
<profile>/team-jobs/active/<chainId>/events.jsonl
<profile>/team-jobs/active/<chainId>/checkpoint.json
```

Journal events have monotonically increasing `seq`, `eventId`, `chainId`, `at`, `type`, and a typed body. Examples:

- `chain.planned`
- `candidate.considered`
- `attempt.awarded`
- `attempt.transport_selected`
- `attempt.partial_received`
- `attempt.verdict_recorded`
- `attempt.reassigned`
- `artifact.produced`
- `artifact.selected`
- `recovery.started`
- `recovery.peer_reconciled`
- `chain.published`

The checkpoint is a materialized projection. Recovery replays any journal tail after `checkpoint.lastSeq`. Atomic checkpoint replacement remains useful, but the journal prevents a one-second checkpoint interval from losing the exact reason or attempt transition.

## 4. Signed worker leases

### 4.1 Protocol

Add intents:

- `agent.worker.lease`
- `agent.worker.lease.revoke`
- `agent.worker.lease.request`

Suggested payload:

```ts
const AgentWorkerLeasePayloadSchema = z.object({
  leaseId: z.string().min(1),
  workerPeerId: z.string().min(1),
  ownerId: z.string().min(1),
  issuedAt: z.string().datetime(),
  notBefore: z.string().datetime(),
  expiresAt: z.string().datetime(),
  sequence: z.number().int().nonnegative(),
  runtimes: z.array(z.object({
    runtime: AgentRuntimeSchema,
    runtimeVersion: z.string().min(1).optional(),
    modelFamily: z.string().min(1).optional(),
    modelIdHash: z.string().min(1).optional(),
    ready: z.boolean(),
    capacity: z.object({
      maxConcurrent: z.number().int().min(0).max(32),
      availableSlots: z.number().int().min(0).max(32),
      queueDepth: z.number().int().min(0).max(10_000),
    }),
    skillIds: z.array(SkillIdSchema).max(128),
  })).max(16),
  connectivity: z.object({
    direct: z.boolean(),
    relay: z.boolean(),
  }),
  nonce: z.string().min(16),
});
```

The signed Envoy envelope authenticates the agent. The embedded agent credential binds it to the owner. Receivers additionally require a non-blocked bond and ensure `workerPeerId === envelope.senderPeerId`.

### 4.2 Lease rules

- Default TTL: 30 seconds.
- Refresh: every 10 seconds with ±10% deterministic jitter derived from peer ID.
- Maximum accepted TTL: 120 seconds.
- A higher `sequence` replaces an older lease for the same worker.
- A revoke immediately invalidates the current lease if its sequence is equal or higher.
- Clock skew allowance: 10 seconds, but never extend `expiresAt` locally.
- Store only the latest lease per worker; cap the store by bonded worker count.
- Redact exact model IDs from remote advertisements by default. `modelIdHash` or model family is sufficient for diversity and calibration.
- Lease expiry stops new awards. It does not cancel running work until heartbeat/recovery policy decides.

### 4.3 Availability state

```ts
type WorkerAvailability =
  | { state: "ready"; source: "lease"; leaseId: string; expiresAt: string }
  | { state: "legacy_ready"; source: "legacy_probe"; checkedAt: string }
  | { state: "busy"; retryAfterMs?: number }
  | { state: "expired" | "revoked" | "engine_down" | "unreachable" | "unknown" };
```

The capability index retains identity/membership and prunes old card records conservatively. A separate `WorkerLeaseStore` owns live availability. Do not merge lease state into `capability-index.json`.

## 5. Execution provenance

### 5.1 Data model

Each `ChainLiveStep` and report exposes a redacted provenance projection:

```ts
type ChainStepProvenance = {
  subtaskId: string;
  selectedAttemptId?: string;
  attempts: Array<{
    attemptId: string;
    role: "primary" | "speculative" | "replacement";
    workerPeerId: string;
    workerDisplayName?: string;
    runtime: AgentRuntime;
    modelFamily?: string;
    transportPath?: "self" | "lan_direct" | "wan_direct" | "relay" | "unknown";
    state: ChainAttemptState["state"];
    attemptNumber: number;
    assignmentReasons: string[];
    reassignmentReason?: ChainReassignmentReason;
    verifier?: {
      runtime?: AgentRuntime;
      modelFamily?: string;
      source: "rule" | "llm" | "cross" | "human" | "consensus";
      verdict: "pass" | "partial" | "fail" | "disputed";
      score?: number;
    };
    timing: {
      awardedAt?: string;
      startedAt?: string;
      finalAt?: string;
      durationMs?: number;
    };
    cost: { reservedUsd: number; committedUsd: number };
  }>;
  artifacts: Array<{
    artifactId: string;
    attemptId: string;
    key: string;
    kind: "text" | "file" | "structured";
    contentHash?: string;
    parentArtifactIds: string[];
    selected: boolean;
  }>;
};
```

`assignmentReasons` use stable codes, not free-form model explanations: `skill_exact`, `role_match`, `same_lan`, `lease_ready`, `lowest_eta`, `lowest_cost`, `highest_reliability`, `model_diversity`, `privacy_local`, and `owner_selected`.

### 5.2 Collection points

- Candidate ranking records considered workers and score components.
- Transport resolution records the selected path at send time.
- Award/reassign paths create attempts and reason codes.
- Partial handling attaches artifacts to the producing attempt.
- Verification records verifier source/runtime/model family.
- Synthesis records input artifact IDs and the selected output lineage.

### 5.3 UX

Social desktop gets an expandable “Execution details” panel on each step:

```text
Research market risks                         Done
Alice's Harness · Envoy Harness · Claude      18s · $0.42
Direct LAN · verified by OpenClaw             Pass 0.91

Attempts (2)
1  Bob / OpenClaw       relay       reassigned: heartbeat timeout
2  Alice / Envoy Harness direct LAN selected

Artifacts
brief.json ← sources.txt ← job input “market-data.csv”
```

EnvoyGo uses a bottom sheet with summary-first disclosure. Peer IDs, hashes, and timestamps live under “Technical details.” Screen-reader labels must describe state and reason without relying on badge color.

Reports retain provenance after completion, subject to existing report retention. Sensitive prompts, artifact contents, API endpoints, and full model IDs are excluded.

## 6. Team strategies

### 6.1 Strategy schema

```ts
type ChainTeamStrategyId =
  | "balanced"
  | "fastest"
  | "cheapest"
  | "highest-confidence"
  | "privacy-local"
  | "diverse-model";

type ChainTeamStrategy = {
  id: ChainTeamStrategyId;
  weights: {
    skill: number;
    eta: number;
    cost: number;
    reliability: number;
    transport: number;
    modelDiversity: number;
  };
  constraints: {
    localOnly?: boolean;
    directOnly?: boolean;
    maxAttemptsPerStep: number;
    requireIndependentVerifier?: boolean;
  };
};
```

Built-in presets are versioned protocol-independent policy in the node/API. The mandate stores the selected ID and resolved strategy snapshot so replay is deterministic if defaults change later.

### 6.2 Locked preset semantics

| Strategy | Primary behavior | Speculation |
|---|---|---|
| Balanced | current skill tier first, then reliability/cost/ETA | critical only when budget allows |
| Fastest | lowest predicted completion time, prefer direct path and available slots | hedge after adaptive delay |
| Cheapest | lowest expected total cost including retries | off by default |
| Highest-confidence | lower confidence bound of reliability, independent verification | two attempts for critical steps |
| Privacy-local | self or same-owner local runtimes; no remote artifact delivery | only across local runtimes |
| Diverse-model | avoid same model family across worker/verifier and parallel attempts | two distinct model families |

Hard gates run before scoring: bond/trust, mandate, sensitivity, runtime capability, lease, input-delivery policy, and budget. A strategy cannot assign a worker that fails a hard gate.

### 6.3 Deterministic score

Normalize each component to `[0, 1]` and retain the component vector in provenance:

```text
score = Σ weight[i] × component[i]
tie-break = higher lease sequence, then workerPeerId lexical order
```

LLMs may propose roles/subtasks, but the final worker ranking must remain deterministic and testable.

## 7. Speculative execution

### 7.1 When allowed

Speculation is allowed only when all are true:

- step criticality is `high` or the selected strategy explicitly enables it;
- mandate `maxParallelAttemptsPerStep >= 2`;
- the worst-case cost of all attempts plus verification fits the chain budget;
- inputs may be disclosed to every selected worker;
- two qualified workers/runtimes exist;
- the step does not declare non-idempotent side effects.

Default maximum: two concurrent attempts per step. Never speculate file writes, external messages, purchases, account changes, or other side-effecting tools unless a future transactional tool contract exists.

### 7.2 Modes

- `immediate_dual`: start two attempts together; used by highest-confidence/diverse-model.
- `hedged`: start a second attempt when the primary exceeds `p75 predicted duration × 1.25`; used by fastest.
- `verify_only`: one worker plus an independent verifier; not execution speculation.

### 7.3 Selection and cancellation

1. Receive final candidates independently.
2. Run deterministic rules on each.
3. If exactly one passes, select it.
4. If both pass and structured outputs are equivalent, select lower cost then earlier final.
5. If both pass but materially disagree, run independent cross-verification or ask the owner according to policy.
6. Record a verdict for every completed attempt; do not punish a valid non-selected result.
7. Send cancel to remaining attempts after selection. Committed work remains accounted for; only unused reservations are released.

Consensus must never be “first response wins” for a critical step.

## 8. Calibrated reliability

### 8.1 Dimensions

Replace the flattened score used for routing with a local derived view keyed by:

```text
(workerPeerId, runtime, modelFamily, skillId, connectivityClass)
```

Connectivity class is `self | lan_direct | wan_direct | relay`. The existing `(peer, runtime, skill)` score remains a compatibility projection and manifest field.

### 8.2 Observations

An assigner records:

- verified quality outcome: pass/partial/fail/disputed and score;
- completion vs timeout/cancel;
- latency: award-to-first-partial and award-to-final;
- delivery success;
- reconnect/reassignment events;
- verifier independence and source;
- observation context and sample timestamp.

Owner cancellations, assigner shutdowns, and transport-wide outages are censored observations and must not count as worker quality failures.

### 8.3 Calibration

Use a Beta posterior for completion/quality probability:

```text
prior Beta(2, 2)
pass:    α += sourceWeight × score
partial: α += sourceWeight × 0.5 × score
fail:    β += sourceWeight
timeout attributable to worker: β += 0.75
```

Expose:

- posterior mean;
- conservative lower confidence bound used by `highest-confidence`;
- sample count/effective sample weight;
- exponentially weighted latency quantiles;
- last observation time.

Back off sparse dimensions hierarchically:

```text
exact 5-tuple
→ (peer, runtime, skill)
→ (peer, runtime)
→ network-wide runtime/skill prior
→ neutral prior
```

Do not federate raw local observations initially. Remote self-advertised reliability is informational only. Existing signed verdict federation can later share privacy-preserving aggregates with minimum sample thresholds.

## 9. Protocol-aware restart recovery

### 9.1 New intents

- `task.chain.reconcile.request`
- `task.chain.reconcile.response`

Request fields:

```ts
{
  chainId,
  orchestratorEpoch,
  knownAttempts: [{ attemptId, subtaskId, lastKnownState, lastPartialSeq }],
  requestedAt
}
```

Response fields:

```ts
{
  chainId,
  workerEpoch,
  attempts: [{
    attemptId,
    subtaskId,
    state: "unknown" | "accepted" | "running" | "final" | "cancelled",
    lastPartialSeq,
    finalPartial?: TaskChainPartialPayload,
    artifactHashes?: string[]
  }],
  respondedAt
}
```

Responses are signed normal envelopes. Workers keep a bounded attempt receipt store for at least the mandate lifetime plus 24 hours.

### 9.2 Recovery state machine

```text
load checkpoint + replay journal
          │
          ▼
 RECOVERING (no watchdog/reassign timers)
          │
     reconcile every awarded/running attempt
          │
   ┌──────┼───────────────┐
 final  running          unknown/timeout
   │       │                  │
 ingest   resume timer   wait grace, then reassign
   └──────┴───────────────┘
          │
          ▼
 RUNNING / AWAITING OWNER / COMPLETE
```

Rules:

- Generate and persist `orchestratorEpoch` on each process start.
- Do not re-award until reconciliation completes or the recovery grace deadline expires.
- A recovered final partial is deduplicated by `(attemptId, partialSeq, contentHash)`.
- A worker reporting `running` receives a renewed heartbeat deadline, not a duplicate accept.
- `unknown` from a worker is stronger than transport timeout and may trigger replacement immediately after a short grace.
- Conflicting finals are retained as separate attempts and sent through normal verification/selection.
- Budget reservations restore before reconciliation. Never reserve twice for the same attempt.
- Recovery provenance is visible to the owner.

## 10. Deterministic three-node integration lab

### 10.1 Topology

```text
Node A — assigner
  deterministic planner + verifier

Node B — Envoy Harness worker
  FakeModelAdapter, fixed token/tool trace, runtime envoy-harness

Node C — OpenClaw or Ext worker
  FakeOpenClawGateway or FakeExtBridge, fixed responses
```

All nodes use real `EnvoyMesh` instances bound to `127.0.0.1/tcp/0`, real identities, direct bonds, signed envelopes, real chain stores, and temporary profile/vault directories. mDNS, public bootstrap, external relays, paid models, and wall-clock sleeps are disabled.

### 10.2 Lab components

Create `apps/node/test/support/agent-network-lab/`:

- `lab-clock.ts`: manually advanced monotonic and wall clock.
- `lab-node.ts`: identity/profile/store/service construction.
- `lab-bonds.ts`: symmetric direct bonds and peer directory registration.
- `lab-runtime.ts`: deterministic Harness/OpenClaw/Ext adapters.
- `lab-transport.ts`: fault-injecting transport wrapper.
- `lab-events.ts`: await journal predicates without arbitrary sleeps.
- `lab-fixtures.ts`: mandates, plans, artifacts, verifier outcomes.

Fault controller API:

```ts
lab.transport.partition("assigner", "openclaw-worker");
lab.transport.delay("harness-worker", { partialMs: 5_000 });
lab.transport.dropNext("task.chain.heartbeat", { from: "openclaw-worker" });
await lab.restartNode("assigner");
lab.clock.advanceBy(31_000);
await lab.flush();
```

`flush()` drains queued protocol work; it never sleeps. Eventual assertions wait on journal sequence changes with a bounded real timeout only to detect deadlocks.

### 10.3 Required scenarios

1. Lease discovery selects both runtime-specific workers.
2. Balanced strategy deterministically selects the expected primary.
3. Worker disconnect before award causes no budget reservation.
4. Disconnect after award triggers heartbeat timeout and replacement.
5. Assigner restart while a worker runs reconciles and accepts its final without duplicate execution.
6. Worker restart returns `unknown`; assigner reassigns once after grace.
7. Late final from the replaced attempt is retained but cannot overwrite the selected artifact.
8. Highest-confidence runs two critical attempts, verifies both, and selects deterministically.
9. Diverse-model never chooses two attempts from the same model family when an alternative exists.
10. Privacy-local rejects remote workers before input delivery.
11. Relay-path reliability is recorded separately from LAN direct reliability.
12. Expired/revoked leases disappear from selection immediately.
13. Malformed, replayed, wrong-peer, and overlong leases are rejected.
14. Recovery with a corrupted checkpoint replays the journal; corrupted journal tail stops safely at the last valid event.

File name: `apps/node/test/agent-network-lab-matrix.test.ts` (in-process lab;
included in the default unit suite). Optional packaged smoke:
`scripts/agent-network-three-process-smoke.sh` →
`apps/node/test/agent-network-three-process-smoke.test.ts` (libp2p three-home
lease wire + chain report; `RUN_E2E=1`). Operator guide:
`docs/agent-network-three-process-smoke.md`.

CI runs two forms:

- deterministic in-process lab on every Agent Network PR;
- optional packaged three-process smoke before release to verify lease/mesh wiring.

## 11. Simulation and diagnostics

### 11.1 Modes

- `readiness`: validate membership, leases, runtime readiness, and routes.
- `dry-plan`: plan and rank using a user-entered goal without awarding work.
- `failover`: synthetically remove the selected route/worker and show the replacement decision.
- `verification`: feed safe fixture outputs through rules and verifier selection without calling a model.
- `recovery`: load a synthetic checkpoint and show reconciliation outcomes.

### 11.2 Node API

```ts
agentNetworkDiagnosticsSnapshot(): Promise<AgentNetworkDiagnosticsSnapshot>;
agentNetworkSimulate(params: AgentNetworkSimulationParams): Promise<AgentNetworkSimulationResult>;
agentNetworkExportDiagnostics(params: { simulationId?: string }): Promise<{ json: string }>;
```

Simulation input includes topology overrides, strategy, capability, criticality, sensitivity, budget, and injected faults. It calls the same hard gates, score functions, speculative policy, and recovery reducer as production with:

```ts
effects = {
  sendEnvelope: recordOnly,
  executeModel: forbidden,
  deliverArtifact: recordOnly,
  writeReliability: forbidden,
  spendBudget: simulatedLedger,
}
```

The result includes candidates, exclusion reasons, component scores, selected attempts, predicted failover, lease expiry timeline, and privacy/budget warnings.

### 11.3 UX

Social: Team Jobs → Manage workers → “Test Agent Network.” Use a stepper:

1. Network readiness
2. Choose a preset scenario or enter a dry-run goal
3. Inspect assignment
4. Inject “worker offline,” “relay unavailable,” “runtime down,” or “assigner restarted”
5. Review expected recovery and export redacted JSON

EnvoyGo provides the same snapshot and preset fault tests, optimized as cards. Advanced topology editing remains desktop-only initially.

The page clearly displays “Simulation — no work sent, no model spend, no reputation changes.”

## 12. API and compatibility plan

### 12.1 Additive API fields

- `ChainPreviewSuggestedWorker.runtime`, `modelFamily`, `availability`, `scoreComponents`.
- `ChainLiveStep.provenanceSummary`, `attemptCount`, `selectedAttemptId`.
- `ChainGetStateResult.recovery`, `strategy`, `provenance`.
- `ChainReport.provenance` with a schema version.

Large provenance is fetched lazily using `chainGetStepProvenance({chainId, subtaskId})`; list endpoints return only summaries.

### 12.2 Capability negotiation

Agent Card/manifest advertises protocol features:

```ts
features: [
  "worker-lease-v1",
  "chain-attempt-v1",
  "chain-reconcile-v1",
  "chain-provenance-v1"
]
```

Rollout behavior:

- New assigner + old worker: legacy ready probe, single attempt, no reconcile; provenance marks limitations.
- Old assigner + new worker: current chain protocol remains accepted.
- Speculation requires `chain-attempt-v1` for every participating worker.
- Recovery reconciliation requires `chain-reconcile-v1`; otherwise use the conservative legacy grace period.

### 12.3 Migration

- Read current `active-team-jobs.json` once and emit `migration.imported_checkpoint` into the new journal.
- Existing reports remain readable with `provenanceVersion` absent.
- Existing ArbitrationStore verdicts seed the `(peer, runtime, skill)` fallback reliability view.
- Existing capability-index TTL remains as stale identity cleanup, not availability.

## 13. Security and privacy review

- Verify every lease/reconcile envelope signature and credential before parsing into state.
- Enforce sender/worker/attempt bindings; never accept a worker’s status for another peer.
- Bound lease rate, payload size, runtime count, skills, and replay registry.
- Strategy and simulation inputs pass the same sensitivity and mandate gates as production.
- Model diversity uses model family or a salted model ID hash, not provider secrets.
- Provenance stores hashes and labels, not artifact contents or prompts.
- Reliability observations are local and cannot be overwritten by worker claims.
- Speculation multiplies disclosure; show this in owner confirmation for private inputs.
- Simulation cannot send envelopes, execute models, deliver bytes, write reliability, or mutate production budgets.
- Diagnostics exports redact owner IDs, peer IDs, paths, endpoints, tokens, prompt text, and artifact contents by default.

## 14. Implementation phases

### Phase A — orchestration journal and attempt model

Deliver:

- `[x]` attempt IDs and attempt-aware in-memory state;
- `[x]` typed journal/checkpoint reducer;
- `[x]` migration from `active-team-jobs.json`;
- `[x]` provenance collection for current single-attempt execution;
- `[x]` lazy provenance RPC and basic Social/EnvoyGo display.

Exit gates:

- `[x]` replay produces byte-equivalent state projection;
- `[x]` crash after every journal transition recovers without duplicate budget reservations;
- `[x]` current Team Job tests remain green.

### Phase B — signed leases

Deliver:

- `[x]` protocol intents/schemas (parsers + role policy + schema tests);
- `[ ]` feature advertisement;
- `[x]` lease publisher, verifier, store, expiry/revoke behavior;
- `[x]` selection based on lease with legacy-probe fallback;
- `[ ]` lease state in worker UI and diagnostics snapshot.

Exit gates:

- security tests for spoof/replay/TTL/sequence/rate limits;
- lease expiry removes new-award eligibility within one refresh interval;
- no Agent Card timestamp is interpreted as runtime readiness.

### Phase C — deterministic strategy engine and calibrated reliability

Deliver:

- `[x]` versioned presets and resolved strategy snapshot;
- `[x]` deterministic component scoring/exclusion reasons;
- `[x]` reliability observation store and hierarchical Bayesian projection;
- `[ ]` preview/runtime badges and confidence/sample-size UX.

Exit gates:

- golden ranking fixtures for every preset;
- sparse history never presents false precision;
- owner/network failures are censored rather than counted as worker failures.

### Phase D — reconciliation recovery

Deliver:

- reconcile intents and worker receipt store;
- `RECOVERING` state and paused timers;
- final/ongoing/unknown conflict handling;
- recovery UX and audit events.

Exit gates:

- assigner restart does not duplicate execution or spend;
- recovered final is deduplicated and published once;
- legacy peer behavior remains conservative and bounded.

### Phase E — speculative execution

Deliver:

- speculative policy and budget preflight;
- immediate/hedged modes;
- independent verification/consensus selector;
- cancellation and late-final handling;
- owner controls and provenance UX.

Exit gates:

- prohibited side-effecting steps never speculate;
- worst-case cost cannot exceed mandate budget;
- late results cannot replace a selected artifact silently.

### Phase F — three-node lab and simulation UX

Build the lab support early during Phases A–E, then make it a formal release gate here.

Deliver:

- deterministic three-node E2E suite and packaged smoke;
- diagnostics/simulation service with effect isolation;
- Social page, EnvoyGo cards, redacted export;
- operator documentation and troubleshooting links.

Exit gates:

- all 14 lab scenarios pass without paid models or internet;
- simulation has tests proving zero network/model/reputation side effects;
- accessibility, high contrast, reduced motion, and localization checks pass.

## 15. Recommended execution order

The dependency-safe order is:

1. Build the lab clock, fake runtimes, fault transport, and journal predicate helpers.
2. Introduce attempts and the journal while behavior is still single-worker.
3. Add provenance because it makes every later feature observable.
4. Add signed leases and remove Agent Card freshness from availability decisions.
5. Add reliability observations and deterministic strategies.
6. Add reconcile protocol and restart recovery.
7. Add speculative execution after attempts, budget recovery, and provenance are proven.
8. Ship diagnostics simulation by reusing the completed decision engine and fault fixtures.

Do not begin speculative execution before attempt-aware persistence and reconciliation. Otherwise a restart can duplicate parallel work and charge the budget twice.

## 16. Release gates

- Protocol schemas and role-policy table tests pass.
- Node typecheck, unit/integration suite, Social production build, and EnvoyGo analyzer/tests pass.
- Deterministic three-node suite passes repeatedly with randomized test order.
- Packaged three-process smoke passes on macOS, Windows, and Linux.
- Security review covers spoofed leases, replay, recovery conflicts, provenance redaction, and speculative disclosure.
- Performance gate: 1,000 workers, 100 active chains, and 10,000 reliability observations remain within agreed ranking and checkpoint latency budgets.
- Recovery chaos gate kills the assigner after every state transition and proves no duplicate selected artifact or budget commitment.
- UX signoff covers Social and EnvoyGo, keyboard/screen-reader operation, high contrast, reduced motion, and all supported locales.

## 17. First implementation slice

The first PR should be deliberately small:

1. Add `ChainAttemptState` and create one primary attempt for each current award.
2. Add the journal reducer/store and migrate the current active checkpoint.
3. Record assignment, transport, partial, verification, artifact, and reassignment events.
4. Add `chainGetStepProvenance` and a compact read-only Social panel.
5. Add the three-node lab skeleton with one happy-path Harness + OpenClaw scenario.

This slice changes observability and recovery foundations without changing worker-selection behavior. It is therefore the safest base for leases, strategies, reconciliation, and speculation.
