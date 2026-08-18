# Improving EnvoyMesh's Agent Network — A Design Document

> A design doc for making EnvoyMesh's mesh-level agent orchestration work cleanly across heterogeneous agent runtimes (OpenClaw, Pi, Hermes, Codex, and any future HTTP/JSON-RPC/CLI agent).
>
> Companion: [`improving-agent-network.zh.md`](./improving-agent-network.zh.md) (中文版)
>
> Scope: a non-breaking additive layer (the **Mesh Adapter Pattern**) plus per-agent verifiers, 3-tuple reputation, cross-agent verification, and federated self-evolution. Grounded in the actual code under `apps/node/src/chain-*.ts` and `packages/protocol/src/agent-network*.ts`.

---

## 0. Why this document exists

EnvoyMesh is a **P2P mesh of nodes**, each running **one agent** (OpenClaw, Pi, Hermes, Codex, or a future runtime). The chain orchestrator (`apps/node/src/chain-orchestrator.ts`, 2700 lines) coordinates multi-node team jobs by dispatching `ChainSubtask`s to bonded peers based on a `capabilityTag` string and a `reputationScore` number.

Today, the mesh sees all agents through one lens: `ChainProvider { peerId, capabilities: string[], reputationScore: number }`. The orchestrator knows *that* a peer can do a thing; it does not know *which agent runtime* is doing it, *how the result will be shaped*, or *how to verify the result in a runtime-appropriate way*.

This is fine when every node runs the same agent. It is a **heterogeneity tax** when nodes run different agents:

- An OpenClaw worker returns a chat-style string. A Hermes worker returns a code diff with reasoning. A Pi worker returns an `extension`-shaped result. The orchestrator has to know each shape to merge them.
- A "pass" verdict for OpenClaw (the worker wrote a coherent summary) is not the same evidence as a "pass" for Hermes (the diff is semantically correct). Today there is no way to express that.
- Reputation is a single number per peer. "Alice is good at translate" lumps together her OpenClaw runs and her Hermes runs as if they were the same kind of work.

**The fix is a Mesh Adapter Pattern (MAP) — a thin, additive layer between the orchestrator and the per-node agent runtime that normalizes capability advertisement, result delivery, and verification across runtimes.** The orchestrator keeps its state machine; what changes is the *seam* it sees.

This is also the natural home for the **verifier-as-first-class** silver bullet we developed in `harness-design/design.md` and for **federated self-evolution** at the agent-runtime level.

---

## 1. Current state — what EnvoyMesh already has

This section is the ground truth for the rest of the document. It is based on direct reading of the listed files.

### 1.1 The chain orchestrator

`apps/node/src/chain-orchestrator.ts` is a 2700-line centerpiece. The state machine is:

```
planChain → launchChain → evaluateBids → trackChain (heartbeat)
  → synthesizeChain → publishChainReport
```

Key properties (from the file's own header comments, lines 1-27):

- **Multi-round negotiation**: up to 3 rounds. Round 1 awards; round 3 with no acceptable bids waits for owner.
- **Cancel-before-accept**: every `handleOrchestratorAccept` checks cancellation first; this is what makes late awards safe to ignore.
- **Trust gating**: workers must be `direct` trust to bid; orchestrators must be `referred` trust to send `task.chain.mandate`.
- **Budget integration**: `chain-budget-ledger.ts` enforces `Σ workerAllocations.committedUsd + synthesisSpendUsd ≤ maxChainCostUsd` (invariant stated at line 19-22).

### 1.2 The arbitration store

`apps/node/src/chain-arbitration.ts` is an append-only per-chain ledger keyed by `subtaskId`. Two properties that matter for this design (lines 17-22):

> - The store is append-only; we never mutate entries in place.
> - `applyArbitration` is idempotent (re-applying the same payload is a no-op).

This is **exactly the data shape a verifier verdict needs** — append-only, idempotent, signed. The verdict is just another entry type in this store.

### 1.3 The budget ledger

`apps/node/src/chain-budget-ledger.ts` tracks `maxChainCostUsd` with `reserve()` / `tryCommit()` / `release()` / `finalize()`. This is a textbook saga. **The verification budget can use the same primitive** — reserve before the verifier runs, commit if it passes, release if it fails.

### 1.4 The sensitivity gate

`apps/node/src/chain-sensitivity-gate.ts` already enforces bond-level × sensitivity-level approval. The `SENSITIVITY_RANK` constant and `bondMaxSensitivity()` function are the right shape for an additional `MIN_REP_FOR_SENSITIVITY` extension.

### 1.5 The local worker execution

`apps/node/src/chain-worker-executor.ts` and `chain-llm.ts` together wire the worker's local agent. Two facts matter:

- **Default engine is OpenClaw** (line 4 of `chain-worker-executor.ts`): *"Default Agent Network engine = Built-in OpenClaw."*
- **Ext Agent is a node-owner-only option** (`agentNetworkWorkerEngine`). Per the user's clarification: each node runs one agent at a time.

The local OpenClaw runtime is at `packages/openclaw-runtime/src/index.ts`. It exposes a `discoverOpenClaw()` + `OpenClawRuntime` API that takes an `OpenClawMessage` and returns a text response.

### 1.6 What's already in protocol

`packages/protocol/src/agent-network-profile.ts` and `agent-network-handoff.ts` already exist. There is an "agent network profile" concept in the protocol layer. The MAP design below should be **structurally compatible** with this — extending, not replacing.

### 1.7 The "heterogeneity tax" — where the gap is

> **Grounded (2026-08-18):** this section previously described the seam as
> `findProviders / executeStep` from `agent-chain-orchestrator.ts:48-55`.
> That module is **Phase 24B legacy and now dead code** — nothing imports
> `runAgentChain` in production (the only reference is a Phase 23-25 legacy
> test). The production seams are different and live on **two sides**:

**Worker side** — `ChainWorkerHandlerDeps.executeSubtask` in `chain-worker.ts:107-111`:

```ts
executeSubtask?: (
  subtask: ChainSubtask,
  onPartial: (partial: TaskChainPartialPayload) => Promise<void>,
  opts?: { inputArtifacts?: NamedArtifact[] },
) => Promise<{ ok: boolean; finalNote?: string }>
```

The two production implementations are `createOpenClawChainSubtaskExecutor`
and `createExtAgentChainSubtaskExecutor` in `chain-worker-executor.ts:139-178`,
both built on the shared `createEngineChainSubtaskExecutor` (`chain-worker-executor.ts:180-271`)
whose contract is `{ isReady, ask }`. They emit `task.chain.partial` events
during execution (streaming `ChainSubtaskPartial` with `note`, `confidence`,
and Phase 53 named artifacts) and are wired in
`node-service-chain-orchestration.ts:942-957` based on the node's
`agentNetworkWorkerEngine` config.

**Orchestrator side** — `ChainOrchestratorSendDeps.findWorkers(capability) → Promise<string[]>` plus
wire negotiation (`task.chain.propose` → `task.chain.bid` → `task.chain.accept` → heartbeat →
`task.chain.partial`). Work is dispatched **over the wire**; the orchestrator never runs the
worker's agent in-process.

`ChainProvider` (with `capabilities: string[]`) and the `string | null` `executeStep`
survive only in the dead `agent-chain-orchestrator.ts`. **The real heterogeneity tax** is:

- The worker's result channel is `ChainSubtaskPartial` (`note` + `artifactFragment` +
  `namedArtifacts`). Today every engine produces a **text** artifact. A runtime that wants
  to return structured data or file refs must be squeezed through the same text-shaped
  pipeline (`chain-worker-executor.ts:123-133` clips everything to `{ kind: "text" }`).
- Readiness is a boolean (`isOpenClawReady` / `isExtAgentBridgeReady`); there is no
  per-skill capability advertisement that says *what* the engine is good at.
- The worker reports `confidence` self-reported in the partial; there is no verified verdict.

The MAP adapter replaces the `{ isReady, ask }` contract on the worker side with
`AgentAdapter.execute` → `SignedAgentResult` (typed `ContentBlock[]`) and adds
`AgentAdapter.verify` for the orchestrator's verdict. `chain-map.ts` is the bridge
that maps `ChainSubtask ↔ ExecuteInput` and `SignedAgentResult → ChainSubtaskPartial`
so the orchestrator's wire protocol does not change.

---

## 2. Goals

In priority order (each is a guard against a specific failure mode):

1. **The orchestrator must not know which agent runtime is on the other side.** It sees normalized `CapabilityManifest`, normalized `AgentResult`, normalized `Verdict`. (Avoid: "Hermes returns X, OpenClaw returns Y, I have to handle both in the merge step.")
2. **Each agent runtime has its own verifier.** A pass for OpenClaw (coherent summary) is not the same evidence as a pass for Hermes (semantically correct diff). (Avoid: "universal verifier that pretends one rule fits all runtimes.")
3. **Reputation is keyed by `(peerId, agentRuntime, skillId)`, not by `peerId` alone.** (Avoid: "Alice's OpenClaw translate score contaminates her Hermes translate score.")
4. **Self-evolution happens at the agent-runtime level.** Each runtime has its own scoreboard; the mesh federates *opt-in* rules across peers running the same runtime. (Avoid: "agent modifies its own prompt in production, audit trail is opaque.")
5. **Cross-agent verification is available for critical tasks at explicit cost.** Two runtimes run the same task; the result is the intersection. (Avoid: "we pay double for every task whether we need it or not.")
6. **The change is non-breaking.** New packages added; existing chain orchestrator keeps working until the seam is migrated. (Avoid: "rewrite the orchestrator to ship this.")
7. **Owner controls what runs on its node.** Adding a new adapter is a node-config change, not a protocol change. (Avoid: "adding a new agent runtime requires a mesh-wide upgrade.")

---

## 3. Architecture: the Mesh Adapter Pattern (MAP)

```
┌─────────────────────── Node A ─────────────────────────┐
│                                                         │
│  ┌─ OpenClawAdapter ─────────────────────────────────┐  │
│  │  getCapabilities()  → CapabilityManifest         │  │
│  │  execute(task, mandate) → AgentResult             │  │
│  │  verify(result)  → Verdict                       │  │
│  │  (own verifier: chat-coherence + completeness)   │  │
│  └────────────────────┬──────────────────────────────┘  │
│                       │                                 │
│  ┌─ Manifest Broadcast (signed by owner) ────────┐    │
│  │  { runtime: "openclaw", version, skills, ...}  │    │
│  └────────────────────┬──────────────────────────────┘  │
│                       │                                 │
└───────────────────────┼─────────────────────────────────┘
                        │  (libp2p / circuit relay)
                        │
┌─────────────────────── Node B ─────────────────────────┐
│  ┌─ PiAdapter ─────────────────────────────────────┐    │
│  │  getCapabilities()  → CapabilityManifest         │    │
│  │  execute(...) → AgentResult                      │    │
│  │  verify(result)  → Verdict                       │    │
│  │  (own verifier: command-sequence + loop-detect)  │    │
│  └────────────────────┬──────────────────────────────┘    │
└───────────────────────┼─────────────────────────────────┘
                        │
                        ▼
       ┌────────────────────────────────────┐
       │  MAP Interop Layer                  │
       │  • normalize manifests (skill set)  │
       │  • normalize results (content blocks)│
       │  • normalize verdicts (Verdict)     │
       │  • reputation: per (peer, runtime,   │
       │    skill)                            │
       └────────────────┬───────────────────┘
                        │
                        ▼
       ┌────────────────────────────────────┐
       │  Chain Orchestrator                 │
       │  (existing chain-orchestrator.ts)   │
       │  • state machine unchanged          │
       │  • findProviders: by skillId        │
       │  • executeStep: takes AgentResult   │
       │  • trackChain: feeds Verdict        │
       └────────────────────────────────────┘
```

**The orchestrator's state machine does not change.** What changes is its *seam*: the type of `findProviders` returns, the type `executeStep` returns, the data fed into `trackChain`. The merge step (`synthesizeChain`) operates on normalized `ContentBlock[]` instead of opaque strings.

### 3.1 What lives where

| Component | Location | Owns |
|---|---|---|
| **CapabilityManifest / AgentResult / Verdict schemas** | `packages/protocol/src/agent-adapter.ts` (new) | Wire format, signed envelope |
| **AgentAdapter interface** | `packages/agent-adapter/src/agent-adapter.ts` (new) | Common surface: `getCapabilities`, `execute`, `verify` |
| **Per-runtime adapters** | `packages/agent-adapter/src/{openclaw,pi,hermes,codex}-adapter.ts` (new) | Runtime-specific I/O, runtime-specific verifier |
| **Adapter registry** | `packages/agent-adapter/src/adapter-registry.ts` (new) | Pick one adapter per node based on `settings.json` |
| **MAP interop layer** | `apps/node/src/chain-map.ts` (new) | Worker-side bridge: `ChainSubtask → ExecuteInput`, `SignedAgentResult → ChainSubtaskPartial`, advisory `adapter.verify` gate. Shadow mode compares adapter path vs legacy engine path |
| **Adapter broadcast** | `apps/node/src/agent-adapter-broadcast.ts` (new) | Periodic signed manifest broadcast |
| **3-tuple reputation** | `apps/node/src/chain-reputation-3tuple.ts` (new) | Reads from `ArbitrationStore`, exposes `getScore(peer, runtime, skill)` |
| **Cross-agent verifier** | `packages/agent-adapter/src/cross-agent-verifier.ts` (new) | Two-runtime comparison |
| **Per-agent scoreboard** | `apps/node/src/verifier-scoreboard.ts` (new) | Local append-only, 5-step self-evolution per runtime |
| **Federated scoreboard** | `apps/node/src/mesh-scoreboard.ts` (new) | Public, opt-in pull of rules across peers running the same runtime |
| **Modified worker executor** | `apps/node/src/chain-worker-executor.ts` (the `createEngineChainSubtaskExecutor` `{ isReady, ask }` contract) | Gains an adapter-backed variant dispatching through `chain-map.ts`; state machine unchanged |

### 3.2 The non-negotiables

- **Append-only everywhere.** Verdicts, scoreboard entries, reputation changes — all append-only. Mirrors `chain-arbitration.ts` discipline.
- **Signed by the owner.** Every manifest, result, and verdict is Ed25519-signed by the node's owner key. Mirrors `EnvoyEnvelope` discipline in `AGENTS.md:102-119`.
- **Failure modes are explicit.** Every result carries a `Verdict` discriminant; reputation is a function of verdict history, not a self-reported number.
- **Adapter is per-node, not per-mesh.** Each node picks one adapter based on its own config. The mesh sees the adapter's manifest, not the config.
- **MAP is the only seam the orchestrator touches.** The orchestrator never imports from `openclaw-runtime` directly; it goes through `chain-map.ts`.

---

## 4. The three new schemas

These go in `packages/protocol/src/agent-adapter.ts`. They are *additive*; no existing schema changes.

### 4.1 `CapabilityManifest`

What a node exposes to the mesh. Replaces (does not delete) the current `ChainProvider.capabilities: string[]`.

```ts
import { z } from 'zod'

export const SkillIdSchema = z.string().regex(/^[a-z][a-z0-9_-]{1,63}$/)
export type SkillId = z.infer<typeof SkillIdSchema>

export const AgentRuntimeSchema = z.enum([
  'openclaw',
  'pi',
  'hermes',
  'codex',
  'codex-cli',
  'openhuman',
  // Adapters register new values via packages/agent-adapter/src/runtime-registry.ts
  // Mesh treats unknown runtimes as opaque (capability advertisement only).
])
export type AgentRuntime = z.infer<typeof AgentRuntimeSchema>

export const SkillDescriptorSchema = z.object({
  skillId: SkillIdSchema,
  /** Human-readable description for owner UX and marketplace UI. */
  description: z.string().min(1).max(280),
  /**
   * Cost envelope the adapter is willing to run this skill in.
   * Soft signal — orchestrator's chain-budget-ledger is the authoritative gate.
   */
  costCeilingUsd: z.number().positive().optional(),
  /**
   * The maximum sensitivity this skill may operate on.
   * Mirrors ChainMandate.maxSensitivity.
   */
  maxSensitivity: z.enum(['public', 'friends', 'private']).default('friends'),
  /**
   * Adapter-defined tags for marketplace filtering.
   * Examples: ['code', 'analysis', 'translate', 'review'].
   */
  tags: z.array(z.string()).default([]),
})
export type SkillDescriptor = z.infer<typeof SkillDescriptorSchema>

export const ReputationScoreSchema = z.number().min(0).max(1)
export type ReputationScore = z.infer<typeof ReputationScoreSchema>

export const CapabilityManifestSchema = z.object({
  /** Which agent runtime this adapter wraps. */
  runtime: AgentRuntimeSchema,
  /** Runtime version (semver-ish; owner-controlled). */
  runtimeVersion: z.string(),
  /** The owning node's peerId. */
  peerId: z.string(),
  /** Owner's ownerId (cross-checked via mandate). */
  ownerId: z.string(),
  /** Skills the node is willing to run. */
  skills: z.array(SkillDescriptorSchema).min(1),
  /**
   * Past reputation per skill. Computed from the ArbitrationStore
   * verdicts on this node; cached for the manifest's TTL window.
   */
  reputationBySkill: z.record(SkillIdSchema, ReputationScoreSchema).default({}),
  /** ISO timestamp; manifests are valid for a TTL (default 5 min). */
  issuedAt: z.string().datetime(),
  /** TTL in seconds. */
  ttlSeconds: z.number().int().positive().default(300),
})
export type CapabilityManifest = z.infer<typeof CapabilityManifestSchema>

export const SignedCapabilityManifestSchema = CapabilityManifestSchema.extend({
  signature: z.string(), // Ed25519 over canonical JSON of unsigned manifest
})
export type SignedCapabilityManifest = z.infer<typeof SignedCapabilityManifestSchema>
```

### 4.2 `AgentResult`

What a node returns to the orchestrator after running a skill. Replaces (does not delete) the current `Promise<string | null>` from `executeStep`.

```ts
export const ContentBlockSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('text'),
    text: z.string(),
    mimeType: z.string().optional(),
  }),
  z.object({
    kind: z.literal('file'),
    vaultPath: z.string(),
    contentHash: z.string(),
    displayName: z.string().optional(),
    mimeType: z.string().optional(),
  }),
  z.object({
    kind: z.literal('structured'),
    schemaRef: z.string(), // e.g. 'envoymesh://chain-report/v1'
    data: z.unknown(),
  }),
  z.object({
    kind: z.literal('image'),
    vaultPath: z.string(),
    contentHash: z.string(),
    mimeType: z.string(),
    altText: z.string().optional(),
  }),
])
export type ContentBlock = z.infer<typeof ContentBlockSchema>

export const CitationSchema = z.object({
  /** What the agent claims is the source. Format adapter-defined. */
  source: z.string(),
  /** The block in the result that the citation refers to. */
  blockIndex: z.number().int().nonnegative(),
  /** Optional structured ref (e.g. a vault path, a URL, a peer id). */
  ref: z.unknown().optional(),
})
export type Citation = z.infer<typeof CitationSchema>

export const AgentMetricsSchema = z.object({
  durationMs: z.number().int().nonnegative(),
  promptTokens: z.number().int().nonnegative().optional(),
  completionTokens: z.number().int().nonnegative().optional(),
  costUsd: z.number().nonnegative(),
})
export type AgentMetrics = z.infer<typeof AgentMetricsSchema>

export const AgentResultSchema = z.object({
  /** What skill produced this result. Must match the manifest. */
  skillId: SkillIdSchema,
  /** What runtime produced it. */
  runtime: AgentRuntimeSchema,
  /** The owning node's peerId. */
  peerId: z.string(),
  /** The chain this result belongs to (correlation). */
  correlationId: z.string(),
  /**
   * The actual content. **Always a typed block array**, not an opaque string.
   * The orchestrator's merge step (synthesizeChain) consumes this directly.
   */
  content: z.array(ContentBlockSchema).min(0),
  /** Citations the agent claims for its content blocks. */
  citations: z.array(CitationSchema).default([]),
  /** Operational metrics. */
  metrics: AgentMetricsSchema,
  /**
   * Adapter-private raw output. **Never read by the orchestrator.**
   * Stored in the audit log for debugging; signature covers it so a
   * malicious adapter cannot retroactively edit it.
   */
  raw: z.unknown().optional(),
  /** ISO timestamp at completion. */
  completedAt: z.string().datetime(),
})
export type AgentResult = z.infer<typeof AgentResultSchema>

export const SignedAgentResultSchema = AgentResultSchema.extend({
  signature: z.string(), // Ed25519 over canonical JSON of unsigned result
})
export type SignedAgentResult = z.infer<typeof SignedAgentResultSchema>
```

### 4.3 `Verdict`

The verifier's judgment on a result. Replaces the current absence-of-verdict (the orchestrator today just trusts the result's `ok` boolean).

```ts
export const VerdictSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('pass'),
    score: z.number().min(0).max(1),
    confidence: z.enum(['low', 'medium', 'high']).default('medium'),
    notes: z.string().optional(),
  }),
  z.object({
    kind: z.literal('partial'),
    score: z.number().min(0).max(1),
    reason: z.string(),
    /** Which blocks (by index) are usable. */
    usableBlocks: z.array(z.number().int().nonnegative()).optional(),
  }),
  z.object({
    kind: z.literal('fail'),
    reason: z.string(),
    /** Whether the orchestrator should release the cost reserve. */
    rollback: z.boolean().default(true),
  }),
  z.object({
    kind: z.literal('disputed'),
    needsHuman: z.literal(true),
    /** Reasons the verifier is uncertain. */
    signals: z.array(z.string()),
  }),
])
export type Verdict = z.infer<typeof VerdictSchema>

export const VerifierSourceSchema = z.enum([
  'rule',     // Deterministic rule engine. Fast, cheap, no LLM.
  'llm',      // Secondary verifier LLM. Slower, more expensive, probabilistic.
  'human',    // Owner or designated human reviewer.
  'cross',    // Two runtimes compared (cross-agent disagreement).
])
export type VerifierSource = z.infer<typeof VerifierSourceSchema>

export const VerdictEntrySchema = z.object({
  /** The chain this verdict is for. */
  chainId: z.string(),
  /** The subtask within the chain. */
  subtaskId: z.string(),
  /** Which worker's result is being judged. */
  workerPeerId: z.string(),
  /** Which runtime the worker used. */
  workerRuntime: AgentRuntimeSchema,
  /** The skill that was run. */
  skillId: SkillIdSchema,
  /** The verdict. */
  verdict: VerdictSchema,
  /** Where this verdict came from. */
  source: VerifierSourceSchema,
  /** If `source === 'llm'`, the model that produced it. */
  verifierModel: z.string().optional(),
  /** If `source === 'human'`, the owner who produced it. */
  verifierOwnerId: z.string().optional(),
  /** The orchestrator's peerId (issuing the verdict). */
  issuedBy: z.string(),
  /** ISO timestamp. */
  issuedAt: z.string().datetime(),
  signature: z.string(),
})
export type VerdictEntry = z.infer<typeof VerdictEntrySchema>
```

`VerdictEntry` is designed to slot into the existing `ArbitrationStore` (`chain-arbitration.ts:35` defines `type ArbitrationStore = Map<string, ChainArbitrationEntry>`). The existing store's `append-only` + `idempotent` invariants apply unchanged.

### 4.4 Why three schemas, not one

The split is intentional:

- `CapabilityManifest` is **what the node advertises it can do**. Stable across runs; changes only when the adapter or its config changes.
- `AgentResult` is **what the node produced for a specific subtask**. Different every time.
- `Verdict` is **the orchestrator's judgment of that result**. Issued by the orchestrator's verifier, not by the worker.

A worker cannot self-verify (`source: 'rule'` or `'llm'` or `'human'` are orchestrator-side). The worker signs its `AgentResult`; the orchestrator issues a `Verdict` against it. This is the seam where reputation moves.

---

## 5. Per-agent adapter design

### 5.1 The `AgentAdapter` interface

`packages/agent-adapter/src/agent-adapter.ts`:

```ts
import type {
  AgentRuntime,
  CapabilityManifest,
  SignedAgentResult,
  SkillDescriptor,
  Verdict,
  VerdictEntry,
} from '@envoymesh/protocol'

export interface AgentAdapter {
  /** The runtime this adapter wraps. */
  readonly runtime: AgentRuntime

  /**
   * The list of skills this adapter can run. **Adapter's own choice.**
   * The orchestrator sees only the manifest; the manifest is built from this.
   */
  describeSkills(): SkillDescriptor[]

  /**
   * Build a signed manifest for broadcast. Owner's signing key, not the
   * adapter's, signs the envelope.
   */
  buildManifest(input: {
    peerId: string
    ownerId: string
    reputationBySkill: Record<string, number>
  }): Promise<CapabilityManifest>

  /**
   * Run a skill. The mandate is a normalized input; the adapter translates
   * to whatever shape its runtime expects.
   *
   * **The adapter is the only place that knows about the runtime's
   * specifics.** The orchestrator does not.
   */
  execute(input: {
    skillId: string
    objective: string
    inputArtifacts: ReadonlyArray<NamedArtifact>
    costCeilingUsd: number
    deadlineMs: number
    correlationId: string
    signal: AbortSignal
  }): Promise<SignedAgentResult>

  /**
   * Runtime-specific verifier. **Each adapter brings its own.**
   * The orchestrator does not know how to verify a Pi result vs a
   * Hermes result; the adapter does.
   *
   * Returns one or more verdicts. Multiple verdicts on the same result
   * are OR-combined by the orchestrator (any 'pass' short-circuits to pass;
   * any 'fail' short-circuits to fail; only all-uncertain becomes 'disputed').
   */
  verify(input: {
    result: SignedAgentResult
    objective: string
  }): Promise<Verdict[]>
}
```

### 5.2 The `OpenClawAdapter` (canonical, since we know it best)

`packages/agent-adapter/src/openclaw-adapter.ts`:

```ts
import { spawn, type ChildProcess } from 'node:child_process'
import { OpenClawRuntime, discoverOpenClaw, type OpenClawModelConfig } from '@envoymesh/openclaw-runtime'
import type { AgentAdapter } from './agent-adapter.js'
import type { AgentResult, ContentBlock, SkillDescriptor, Verdict, SignedAgentResult } from '@envoymesh/protocol'
import { signCanonicalPayload } from '@envoymesh/identity'

const OPENCLAW_SKILLS: SkillDescriptor[] = [
  {
    skillId: 'translate',
    description: 'Translate text between natural languages.',
    costCeilingUsd: 5,
    maxSensitivity: 'friends',
    tags: ['language', 'text'],
  },
  {
    skillId: 'summarize',
    description: 'Produce a structured summary of a long document or chat thread.',
    costCeilingUsd: 3,
    maxSensitivity: 'private',
    tags: ['text', 'analysis'],
  },
  {
    skillId: 'chat-assist',
    description: 'Conversational assistance with the owner\'s contacts.',
    costCeilingUsd: 2,
    maxSensitivity: 'friends',
    tags: ['chat', 'support'],
  },
]

export class OpenClawAdapter implements AgentAdapter {
  readonly runtime = 'openclaw' as const

  constructor(
    // Grounded (2026-08-18): the adapter wraps the production OpenClaw
    // path, not the raw `OpenClawRuntime` child-process class:
    //   - askViaRuntime_  — `askOpenClawViaRuntime` (policy prompt + RAG +
    //                       webhook bridge + per-ask lock)
    //   - isReady_        — `isOpenClawReady()` (matches the existing
    //                       createOpenClawChainSubtaskExecutor contract)
    //   - workerPeerId_   — the node's agent peerId
    private readonly askViaRuntime_: (
      prompt: string,
      ctx?: { ownerApproved?: boolean },
    ) => Promise<string>,
    private readonly isReady_: () => boolean,
    private readonly workerPeerId_: string,
    private readonly runtimeVersion_: () => Promise<string>,
  ) {}

  describeSkills(): SkillDescriptor[] {
    return OPENCLAW_SKILLS
  }

  async buildManifest(input: {
    peerId: string
    ownerId: string
    reputationBySkill: Record<string, number>
  }): Promise<CapabilityManifest> {
    const unsigned = {
      runtime: this.runtime,
      // NOTE: the real `OpenClawRuntime` has no `version()` method. The
      // runtime version is a config string the adapter reads from
      // `settings.json` (`openclawConfig.runtimeVersion`) or defaults to
      // `"unknown"` — see chain-map.ts first cut.
      runtimeVersion: await this.runtimeVersion_(),
      peerId: input.peerId,
      ownerId: input.ownerId,
      skills: this.describeSkills(),
      reputationBySkill: input.reputationBySkill,
      issuedAt: new Date().toISOString(),
      ttlSeconds: 300,
    }
    return signCanonicalPayload(unsigned, /* owner private key */)
  }

  async execute(input: {
    skillId: string
    objective: string
    inputArtifacts: ReadonlyArray<NamedArtifact>
    costCeilingUsd: number
    deadlineMs: number
    correlationId: string
    signal: AbortSignal
  }): Promise<SignedAgentResult> {
    const prompt = this.buildPrompt(input)

    // Grounded (2026-08-18): the real `OpenClawRuntime` has no `prompt()`
    // method. Production execution goes through `askOpenClawViaRuntime`
    // (apps/node/src/node-service-openclaw-runtime.ts:1733), which:
    //   - ensures the runtime is ready (`ensureOpenClawReadyViaRuntime`),
    //   - builds EnvoyMesh policy prompts + RAG context,
    //   - routes through the webhook bridge under a per-ask lock.
    // The adapter wraps THAT function (plus `isOpenClawReady()`), not the
    // raw child-process runtime. `buildOpenClawSubtaskPrompt` (already in
    // chain-worker-executor.ts) formats constraints/role/thread/artifacts.
    const text = await this.askViaRuntime_(prompt, {
      ownerApproved: true,
      // deadlineMs/signal propagate if the host bridges them; otherwise the
      // adapter falls back to the runtime's responseTimeoutMs.
    })

    const content: ContentBlock[] = [{ kind: 'text', text, mimeType: 'text/markdown' }]
    const unsigned: AgentResult = {
      skillId: input.skillId,
      runtime: this.runtime,
      // NOTE: `OpenClawRuntime` has no `peerId` — the adapter takes the
      // node's agent peerId as a constructor input (same as the existing
      // createOpenClawChainSubtaskExecutor({ workerPeerId })).
      peerId: this.workerPeerId_,
      correlationId: input.correlationId,
      content,
      citations: [],
      metrics: { durationMs: /* now - startedAt */, costUsd: /* runtime-reported or 0 */ },
      completedAt: new Date().toISOString(),
    }
    return signCanonicalPayload(unsigned, /* node-provisioned signing key */)
  }

  async verify(input: {
    result: SignedAgentResult
    objective: string
  }): Promise<Verdict[]> {
    // OpenClaw-specific verifier. Composes rules; no LLM in default.
    const rules = [
      new OutputMatchesObjectiveRule(),       // Does the result text address the objective?
      new NonEmptyContentRule(),              // Is the result non-empty?
      new MarkdownStructureRule(),            // Is the result a well-formed markdown?
      new OwnerAllowedTopicsRule(),           // Does the result stay within owner policy?
    ]
    const verdicts: Verdict[] = []
    for (const rule of rules) {
      const v = await rule.check(input.result, input.objective)
      if (v) verdicts.push(v)
    }
    return verdicts
  }

  private buildPrompt(input: { /* ... */ }): string {
    // Translate (skillId, objective, inputArtifacts) into OpenClaw's
    // expected prompt shape. Today this is what `chain-llm.ts` does
    // in DECOMPOSE_SYSTEM_PROMPT / MERGE_SYSTEM_PROMPT. We move it
    // here so the seam is in one place.
    return /* ... */
  }
}
```

**This is the only place that knows about OpenClaw.** The orchestrator sees `AgentResult`; the verifier sees the same.

> **Grounding note (2026-08-18):** the sketch above deliberately keeps the
> OpenClaw-specific **prompt building** in the adapter, but the production
> prompt builder already exists in `chain-worker-executor.ts`:
> `buildOpenClawSubtaskPrompt` formats constraints / role / thread / Phase 53
> input artifacts, and `formatInputArtifactsForPrompt` renders named artifacts.
> The first-cut adapter (`chain-map.ts` + `openclaw-adapter.ts`) reuses those
> rather than duplicating them.

### 5.3 Sketches of other adapters

**`PiAdapter` (sketch)**: `pi -p <objective>` invocation through the Pi CLI; result parsed as JSON. Verifier: `CommandSequenceVerifier` (was the right tool called?), `LoopDetectionVerifier` (did the same file get read 5 times?).

**`HermesAdapter` (sketch)**: HTTP POST to Hermes local server; result includes reasoning trace. Verifier: `ReasoningTraceVerifier` (does the trace loop?), `CodeDiffVerifier` (does the diff compile?).

**`CodexAdapter` (sketch)**: HTTP to Codex local API; result is a code diff. Verifier: `DiffAppliesVerifier` (does the diff apply cleanly?), `TestCoverageDeltaVerifier` (did coverage change appropriately?).

**The shape is identical. The internals differ.** That is the point.

### 5.4 The `AdapterRegistry`

`packages/agent-adapter/src/adapter-registry.ts`:

```ts
export class AdapterRegistry {
  private adapters = new Map<AgentRuntime, AgentAdapter>()

  register(adapter: AgentAdapter): void {
    this.adapters.set(adapter.runtime, adapter)
  }

  /** Per-node: pick the adapter based on settings.json's `agentRuntime`. */
  forNode(settings: NodeSettings): AgentAdapter {
    const runtime = settings.agentRuntime ?? 'openclaw' // default
    const adapter = this.adapters.get(runtime)
    if (!adapter) {
      throw new Error(
        `No adapter registered for runtime "${runtime}". ` +
        `Available: ${[...this.adapters.keys()].join(', ')}`,
      )
    }
    return adapter
  }

  /**
   * The orchestrator uses this to route. Today, the orchestrator sits
   * on the same node as the adapter, so `forNode()` is the only path
   * used in practice. `byRuntime()` exists for the future case where
   * a cross-orchestrator wants to dispatch a subtask to a specific
   * runtime class.
   */
  byRuntime(runtime: AgentRuntime): AgentAdapter | null {
    return this.adapters.get(runtime) ?? null
  }
}
```

**Owner-side configuration** in `~/.envoymesh/settings.json` becomes:

```json
{
  "agentRuntime": "openclaw",  // or "pi", "hermes", "codex"
  "openclawConfig": { /* ... */ },
  "piConfig": { /* ... */ }
}
```

A new runtime ships as a new adapter file in `packages/agent-adapter/src/`. No protocol change. No orchestrator change. No mesh upgrade.

---

## 6. Per-agent verifier design

### 6.1 Why universal verifier is wrong

Imagine one verifier for "did the worker do the job":

- OpenClaw returns a chat string. A "universal" verifier looks for: non-empty, addresses objective, coherent. Pass.
- Hermes returns a code diff with reasoning. A "universal" verifier looks for: non-empty, addresses objective, coherent. Pass.
- But the Hermes diff doesn't compile. The OpenClaw string is wrong but plausible. **Same verdict, different quality.**

A universal verifier cannot know the difference. It is by construction blind to runtime-specific failure modes.

### 6.2 The `CompositeVerifier` pattern

`packages/agent-adapter/src/verifier.ts`:

```ts
import type { Verdict, AgentResult } from '@envoymesh/protocol'

/** A single rule. Cheap, deterministic. */
export interface VerifierRule {
  readonly name: string
  check(input: { result: AgentResult; objective: string }): Promise<Verdict | null>
}

/** A whole verifier: a sequence of rules. */
export abstract class CompositeVerifier {
  protected abstract rules(): VerifierRule[]

  async verify(input: { result: AgentResult; objective: string }): Promise<Verdict[]> {
    const verdicts: Verdict[] = []
    for (const rule of this.rules()) {
      const v = await rule.check(input)
      if (v !== null) verdicts.push(v)
    }
    return verdicts
  }
}
```

The orchestrator's `trackChain` calls the adapter's `verify(result, objective)`. The adapter returns one or more verdicts. The orchestrator combines them with **OR-of-pass, AND-of-fail, default-disputed**:

```ts
// In chain-orchestrator.ts (additive; does not change existing state machine)
function combineVerdicts(verdicts: Verdict[]): Verdict {
  if (verdicts.some(v => v.kind === 'fail')) {
    return verdicts.find(v => v.kind === 'fail')!
  }
  if (verdicts.length === 0) {
    return { kind: 'disputed', needsHuman: true, signals: ['verifier produced no verdicts'] }
  }
  if (verdicts.every(v => v.kind === 'pass')) {
    const scores = verdicts.filter(v => v.kind === 'pass').map(v => v.score)
    return {
      kind: 'pass',
      score: scores.reduce((a, b) => a + b, 0) / scores.length,
      confidence: scores.length >= 3 ? 'high' : 'medium',
    }
  }
  // Some pass, some partial: degrade to partial.
  return { kind: 'partial', score: 0.5, reason: 'verifier disagreement' }
}
```

### 6.3 The four verifier sources

| Source | When | Cost | Trust |
|---|---|---|---|
| `rule` | Always runs first | ~free | Deterministic; only flags known failure modes |
| `llm` | When `rule` returns `partial` or `disputed` | $$ (separate budget) | Probabilistic; needs own model choice |
| `human` | When `llm` also returns `disputed` | UX cost | Authoritative; but slow |
| `cross` | When task is critical (owner-flagged) | 2× cost | Strongest; uses two runtimes |

The default flow is **`rule → llm → human`**, escalating on uncertainty. **`cross` is opt-in per task** (owner adds `"verifyWith": "cross-agent"` to the chain proposal).

### 6.4 The cross-agent disagreement verifier

`packages/agent-adapter/src/cross-agent-verifier.ts`:

```ts
import type { AgentResult, Verdict, SignedAgentResult, AgentRuntime } from '@envoymesh/protocol'

export class CrossAgentDisagreementVerifier {
  /**
   * Two runtimes, same task, same objective. If their conclusions
   * agree (high semantic similarity), pass. If they disagree, disputed.
   */
  async verify(input: {
    objective: string
    resultA: SignedAgentResult
    resultB: SignedAgentResult
  }): Promise<Verdict> {
    if (input.resultA.runtime === input.resultB.runtime) {
      // Same runtime twice is not "cross"; degrade to single-runtime verify.
      return { kind: 'disputed', needsHuman: true, signals: ['cross-agent verifier requires two distinct runtimes'] }
    }

    const similarity = await this.semanticSimilarity(
      this.extractConclusion(input.resultA),
      this.extractConclusion(input.resultB),
    )

    if (similarity >= 0.85) {
      return { kind: 'pass', score: similarity, confidence: 'high', notes: 'two runtimes agreed' }
    }
    if (similarity >= 0.5) {
      return { kind: 'partial', score: similarity, reason: 'partial agreement across runtimes' }
    }
    return {
      kind: 'disputed',
      needsHuman: true,
      signals: [
        `runtime ${input.resultA.runtime} and ${input.resultB.runtime} disagreed`,
        `semantic similarity: ${similarity.toFixed(2)}`,
      ],
    }
  }

  private extractConclusion(result: SignedAgentResult): string {
    // For text results, the last text block. For structured, a tagged field.
    // Adapter-specific; falls back to the full content joined.
    const lastText = [...result.content].reverse().find(b => b.kind === 'text')
    return lastText?.kind === 'text' ? lastText.text : JSON.stringify(result.content)
  }

  private async semanticSimilarity(a: string, b: string): Promise<number> {
    // Embedding-based similarity. Uses a small dedicated model
    // (e.g. text-embedding-3-small); verifier LLM choice is a
    // node-level config, not hardcoded here.
    return /* ... */
  }
}
```

**Why this matters**: a Pi worker and a Hermes worker independently reviewing the same code is *much* stronger evidence than either alone. The cost is double, but for "should I sign this $50k contract?" tasks, it's worth it.

---

## 7. Reputation: 3-tuple key

### 7.1 Today

```ts
// chain-orchestrator.ts:21
export interface ChainProvider {
  ownerId: string
  peerId: string
  capabilities: string[]
  reputationScore: number   // ← single number per peer
}
```

This is wrong because:

- It conflates "Alice's OpenClaw translate score" with "Alice's Hermes translate score".
- It is updated by the *worker* (self-reported) or by a single number that doesn't decompose.
- It cannot be the basis for "Alice can do private-sensitivity tasks" because we don't know *what* she's good at.

### 7.2 The new shape

`apps/node/src/chain-reputation-3tuple.ts`:

```ts
import type { AgentRuntime, SkillId, ReputationScore } from '@envoymesh/protocol'

/**
 * Reputation is a function of verdict history, not a self-reported number.
 * Keyed by (peerId, runtime, skillId) so OpenClaw translate and Hermes
 * translate are tracked separately.
 */
export type ReputationKey = `${string}::${AgentRuntime}::${string}`

export class ReputationBook3Tuple {
  private scores = new Map<ReputationKey, ReputationScore>()
  private readonly windowSize: number

  constructor(windowSize = 50) {
    this.windowSize = windowSize
  }

  key(peerId: string, runtime: AgentRuntime, skillId: SkillId): ReputationKey {
    return `${peerId}::${runtime}::${skillId}`
  }

  /**
   * Update from a verdict entry. This is the single source of reputation
   * change. Verdicts are append-only; rolling the window gives the live score.
   */
  recordVerdict(entry: VerdictEntry): void {
    const key = this.key(entry.workerPeerId, entry.workerRuntime, entry.skillId)
    // Implementation: maintain a per-key circular buffer of the last N verdicts
    // and compute score = (pass + 0.5 * partial) / total, weighted by recency.
    // Failures are weighted higher than passes (defensive bias).
    /* ... */
  }

  getScore(peerId: string, runtime: AgentRuntime, skillId: SkillId): ReputationScore {
    return this.scores.get(this.key(peerId, runtime, skillId)) ?? 0
  }

  /** For the manifest broadcast. */
  snapshotFor(peerId: string, runtime: AgentRuntime): Record<SkillId, ReputationScore> {
    const out: Record<string, ReputationScore> = {}
    for (const skill of this.allSkillsFor(peerId, runtime)) {
      out[skill] = this.getScore(peerId, runtime, skill as SkillId)
    }
    return out
  }
}
```

### 7.3 The storage: derived from `ArbitrationStore`

`VerdictEntry` goes into the existing `ArbitrationStore` (append-only, idempotent — `chain-arbitration.ts:17-22`). The reputation book is **derived state** computed on read from the store, not a separate write target. This is critical: a single source of truth, two views.

```ts
// In chain-arbitration.ts (additive method)
export function getVerdictsFor(store: ArbitrationStore, criteria: {
  workerPeerId?: string
  workerRuntime?: AgentRuntime
  skillId?: SkillId
}): VerdictEntry[] {
  // Iterate the store; filter; return sorted by issuedAt.
  /* ... */
}
```

### 7.4 The sensitivity gate extension

`chain-sensitivity-gate.ts` already has `MIN_REP` not present; today it gates only on bond level. We add reputation-as-gate:

```ts
// in chain-sensitivity-gate.ts (additive)
const MIN_REP_FOR_SENSITIVITY: Record<SensitivityLevel, number> = {
  'public': 0.0,    // any direct bond
  'friends': 0.6,   // 60%+ pass rate over the rolling window
  'private': 0.85,  // 85%+ AND at least 10 verdicts in the window
}

export function requiresReputationApproval(
  mandate: ChainMandate,
  workerRuntime: AgentRuntime,
  workerReputation: ReputationScore,
  workerVerdictCount: number,
): { required: boolean; reason?: string } {
  const minRep = MIN_REP_FOR_SENSITIVITY[mandate.maxSensitivity as SensitivityLevel]
  if (mandate.maxSensitivity === 'public') {
    return { required: false }
  }
  if (workerVerdictCount < 10 && mandate.maxSensitivity === 'private') {
    return {
      required: true,
      reason: `worker has only ${workerVerdictCount} verdicts; need ≥10 for private-sensitivity work`,
    }
  }
  if (workerReputation < minRep) {
    return {
      required: true,
      reason: `worker ${workerRuntime} reputation ${workerReputation} < required ${minRep} for ${mandate.maxSensitivity}`,
    }
  }
  return { required: false }
}
```

**The effect**: a brand-new peer running Pi can bid on `public`-sensitivity tasks immediately. It has to earn 60%+ pass rate before it can take `friends`-sensitivity work, and 85%+ with 10+ verdicts before it can take `private` work. **This is progressive trust, made operational.**

---

## 8. Cross-agent verification (the "two-doctor" pattern)

### 8.1 When to enable

Cross-agent verification doubles the cost. Enable it when:

1. The owner marks the task as critical (`chain proposal metadata: { criticality: 'high' }`).
2. The mandate's `maxSensitivity === 'private'` AND the cost is over a threshold (e.g. $20).
3. The orchestrator's verifier has already returned `partial` (re-run with a different runtime for tie-breaking).

Default: rule-based only. LLM and cross are explicit opt-in.

### 8.2 Cost model

Add a verification budget line item to `chain-budget-ledger.ts`:

```ts
// additive to ChainBudgetLedgerState
export interface ChainBudgetLedgerState {
  // ... existing fields ...
  /** Reserved for verifier costs (LLM calls, cross-agent runs). */
  verificationReservedUsd: number
  /** Committed to verifier runs. */
  verificationCommittedUsd: number
}
```

`maxChainCostUsd` includes verification. If verifier spend eats the budget, the orchestrator downgrades to rule-only and continues.

### 8.3 The flow

```
orchestrator.trackChain(step, result)
  │
  ├─► adapter.verify(result, objective)              // adapter's own rules
  │   └─► rule verdicts
  │
  ├─► combineVerdicts(rule verdicts)
  │   ├─ pass  → continue
  │   ├─ fail  → release budget, mark subtask failed
  │   └─ partial / disputed → escalate
  │
  ├─► if escalation needed && criticality == high:
  │   ├─► find second runtime in manifest pool
  │   ├─► orchestrator.executeStep(secondManifest, same step)
  │   ├─► CrossAgentDisagreementVerifier.verify(resultA, resultB)
  │   └─► combineVerdicts(... )
  │
  └─► if still disputed:
      └─► return to owner for human review
```
|
|> **Status 2026-08-18:** `CrossAgentDisagreementVerifier` first cut (`packages/agent-adapter/src/cross-agent-verifier.ts`) plus the node-side host seam (`apps/node/src/pi-map-adapter.ts`) are in and tested. **The escalation caller is now wired (same day):** `apps/node/src/chain-verify-loop.ts` (`runChainVerificationLoop`) runs from `handleOrchestratorPartial` on final partials — it re-packages the partial as a `SignedAgentResult`, runs the adapter's rule verifier, writes a `rule` `VerdictEntry` into the chain's `ArbitrationStore` (the authoritative reputation write), and on `partial`/`disputed` verdicts escalates to a second distinct runtime (budgeted via the ledger's `verificationReservedUsd`/`verificationCommittedUsd`; a budget miss downgrades to rule-only) and writes a `cross` `VerdictEntry`. Escalation triggers today: `partial`/`disputed` rule verdict on a `maxSensitivity: "private"` chain with `maxChainCostUsd ≥ $20`, or the owner `criticality: "high"` hint (the owner-UI wiring that sets it is the remaining Week 2-3 item).

---

This is the part that comes from Penguin's `self-evolve.ts` (the 5-step protocol), applied at the **agent-runtime** level, with mesh-level sharing.

### 9.1 Local scoreboard (per node, per runtime)

`apps/node/src/verifier-scoreboard.ts`:

```ts
import { z } from 'zod'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const EntrySchema = z.object({
  version: z.number().int().positive(), // monotonically increasing per runtime
  hypothesis: z.string(),
  rulesetHash: z.string(),              // hash of the active verifier ruleset
  meanScore: z.number().min(0).max(1),
  passRateBefore: z.number().min(0).max(1),
  passRateAfter: z.number().min(0).max(1),
  nRuns: z.number().int().nonnegative(),
  status: z.enum(['kept', 'reverted']),
  ownerSignature: z.string(),           // Ed25519 of owner (contamination guard)
  createdAt: z.string().datetime(),
})
type Entry = z.infer<typeof EntrySchema>

export class VerifierScoreboard {
  constructor(
    private readonly filePath: string,    // e.g. ~/.envoymesh/agent-state/<peer>/verifier-scoreboard.yaml
  ) {}

  async append(entry: Entry): Promise<void> {
    // Append-only. YAML for human inspection. Signed by owner.
    /* ... */
  }

  async readAll(): Promise<Entry[]> {
    // For the 5-step protocol's "evaluate" step.
    /* ... */
  }

  async latest(): Promise<Entry | null> {
    // For "what is the current ruleset version".
    /* ... */
  }
}
```

**This is the Penguin 5-step protocol, but the *target* is the verifier ruleset**, not `AGENTS.md`. The protocol itself is identical:

```
1. SNAPSHOT      — copy current ruleset to /snapshots/v<n>.json
2. HYPOTHESIZE   — model: "verifier failed on 4 of 10 cases; missing rule X"
3. CANDIDATE     — apply rule X to the local ruleset
4. EVALUATE      — re-run 50 tasks with the candidate ruleset
5. COMMIT/REVERT — strict greater pass rate; otherwise restore
```

The contamination guard (Penguin discipline): the optimizer never sees the rubric. **The optimizer sees the scoreboard and the failed-task descriptions.** The rubric (the private evaluation criteria) is owner-only.

### 9.2 Mesh-federated scoreboard (public, opt-in)

`apps/node/src/mesh-scoreboard.ts`:

```ts
const FederatedEntrySchema = z.object({
  runtime: AgentRuntimeSchema,
  ruleVersion: z.number().int().positive(),
  hypothesis: z.string(),
  /** Aggregate stats across N peers that adopted this rule. */
  federatedPasses: z.number().int().nonnegative(),
  federatedFailures: z.number().int().nonnegative(),
  meanImprovement: z.number(),         // vs previous version
  /** Which peers contributed data. */
  contributingPeers: z.array(z.string()),
  /** Hash of the rule JSON so peers can pull it. */
  rulesetHash: z.string(),
  /** When the federation started tracking. */
  federatedAt: z.string().datetime(),
  signature: z.string(),                // mesh-wide trust anchor (out of scope here)
})
```

A peer running `pi` can opt in to **pull rule v7 from peer A** (which has been validated on 47 other Pi nodes). On the local node, the rule runs through the local 5-step protocol; if it passes, it joins the local scoreboard; if it fails, the pull is rejected.

**This is skill / rule sharing, not model sharing.** The risk surface is much smaller than "share model weights". A rule is a JSON file; the worst case is a bad rule that the local evaluator catches.

### 9.3 What is not shared

- **Conversation content.** Federated scoreboards carry hypotheses and stats, never user data.
- **Owner mandates.** Trust policy is per-node; federation never overrides it.
- **The agent's runtime config.** Different nodes have different model configs, sensitivity policies, cost limits.

---

## 10. Migration plan (3 sprints)

### Sprint 1: MAP protocol + OpenClawAdapter, additive (4 weeks)

### Sprint 1: Shadow mode (4 weeks)

> **Status (2026-08-18):** implemented. `packages/agent-adapter/src/openclaw-adapter.ts` (canonical adapter wrapping the production ask path via injected `askViaRuntime`) and the worker-side interop layer `apps/node/src/chain-map.ts` exist and are unit-tested. The `executeSubtask` wiring in `node-service-chain-orchestration.ts` runs the MAP adapter path in shadow mode alongside the legacy OpenClaw path when `ENVOYMESH_MAP_SHADOW=1`, delivering via legacy while auditing `chain.map_shadow` diff events. Off by default.

**Goal**: a manifest is broadcast, an `AgentResult` is returned, the orchestrator's existing path is unchanged.

Week 1-2: New package

- Create `packages/protocol/src/agent-adapter.ts` with the three schemas
- Create `packages/agent-adapter/` package with `AgentAdapter` interface, `AdapterRegistry`, `OpenClawAdapter`
- Tests: schema roundtrip, manifest signing, OpenClawAdapter's verifier rules

Week 2-3: Wiring

- `agent-adapter-broadcast.ts`: periodic signed manifest broadcast (every TTL/2, default 2.5 min)
- `chain-map.ts`: MAP interop layer; today it just *also* runs the old engine path (`createOpenClawChainSubtaskExecutor` in `chain-worker-executor.ts`) and logs the difference
- Settings: `agentRuntime` field in `~/.envoymesh/settings.json`

Week 3-4: Shadow mode

- In shadow mode, `chain-map.ts` runs both paths (old engine path `chain-worker-executor.ts` and new `OpenClawAdapter.execute`) and compares the results.
- Owners see a "MAP shadow" log entry but no behavior change.
- **Success criterion**: after 1-2 weeks of shadow, results are identical for ≥95% of tasks. (If not, the adapter is mis-modeling; iterate.)

### Sprint 2: Switch to adapter path; per-(peer, runtime, skill) reputation (3 weeks)

> **Status (2026-08-18):** Sprint 2 seam complete. Reputation: `chain-plan-assign.ts` blends per-skill reputation (`PlanAssignRosterEntry.reputationBySkill`, soft `+0.2×rep` addend) into `scoreFor` / `bestPeerForRole`; the 3-tuple reader (`chain-reputation-3tuple.ts`) derives scores from the widened `ArbitrationStore` (`recordVerdictEntry` / `getVerdictsFor`); the roster is enriched via `deriveRosterReputation`; `chain-sensitivity-gate.ts` gained `requiresReputationApproval`. Seam switch: `executeSubtask` now routes OpenClaw subtasks through the adapter-backed executor when `useMAP` is set (primary; shadow/legacy preserved), with the legacy prompt surface (constraints/role/thread/brief-report policy) preserved via `buildSubtaskPromptForAdapter`. Orchestrator pool: `findWorkers` gained a manifest-carrying pool (`findWorkersWithManifests` / `resolveWorkerPool`; `ChainRankedWorker.manifest` synthesized from the card profile via `manifestFromAgentNetworkProfile`). Merge unification: `synthesizeChain` consumes normalized `ContentBlock[]` — `chain-map.ts` owns the bidirectional artifact↔block map (`resultArtifactsToContentBlocks` / `contentBlocksToResultArtifacts`) and the one canonical text projection (`contentBlocksToText`), so legacy and adapter partials reach the merge step as the same typed currency; `WorkerContribution` carries `contentBlocks`, and the LLM merge adapter prefers the block projection. Roll out: `NodeConfig.useMAP` opt-in (Agent Network settings UI toggle) + live `ENVOYMESH_MAP_ROLLBACK=1` rollback flag.
>
> **Known gaps (by design):** (1) **Verdict write path** — no production code writes `VerdictEntry` yet; the authoritative writer is the orchestrator's verification flow (Sprint 3 cross-agent verification). Worker-side `adapter.verify` stays advisory per §7.1 (no self-reported reputation). Until then the 3-tuple readers and `requiresReputationApproval` are dormant. (2) ~~Manifest pool consumer~~ **resolved 2026-08-18 (first cut)** — `adapter.manifest` broadcasts land (`agent-adapter-broadcast.ts` + `handleInboundCapabilityManifest` → `ChainSideState.remoteManifests`), and `findAgentNetworkWorkersRanked` prefers a fresh wire manifest over card synthesis, so `findWorkersWithManifests`/`resolveWorkerPool` are consulted with real wire data. Hardening (owner-signature verification on first receipt, manifest TTL sweep) is follow-up.

Week 1: Switch the seam

- Worker side: the `executeSubtask` wiring in `node-service-chain-orchestration.ts` routes through `chain-map.ts` (adapter-backed executor); `chain-worker-executor.ts` stays as the legacy path (Sprint 1 shadow mode compares them)
- Orchestrator side: `findWorkers` expands from `Promise<string[]>` (capability-tag pool) to a worker pool carrying manifests (Sprint 2)
- `synthesizeChain` consumes normalized `ContentBlock[]` / named artifacts (Sprint 2)
- The orchestrator's state machine does not change

Week 2: 3-tuple reputation

- Add `chain-reputation-3tuple.ts`
- Extend `chain-sensitivity-gate.ts` with `requiresReputationApproval`
- `VerdictEntry` becomes a new entry type in `ArbitrationStore`

Week 3: Roll out

- Owners opt in via `settings.json: { "useMAP": true }`
- Two-week monitoring period; rollback flag ready

### Sprint 3: Second adapter + cross-agent verification (4 weeks)

Week 1-2: Second adapter (e.g. Pi)

- Add `packages/agent-adapter/src/pi-adapter.ts` — **first cut done 2026-08-18**
- Pi-specific verifier (command sequence, loop detection) — **done 2026-08-18**
- Node-side wiring seam `apps/node/src/pi-map-adapter.ts` (`createPiAdapterFromHost`) — **done 2026-08-18**. The Pi runtime now records `tool_use_start` events into `PiPromptResult.toolTrace` (forwarded into `PiRunResult.trace`), so the Pi verifier's loop / destructive-command checks run on live traces (`confidence: "medium"` on a clean trace; "low" only when Pi makes no tool calls).
- Tests: side-by-side with Hermes/OpenClaw on the same task — package + node tests done; side-by-side harness pending

Week 2-3: Cross-agent verification

- `CrossAgentDisagreementVerifier` — **first cut done 2026-08-18**; the escalation *caller* in the orchestrator is pending
- Verification budget in `chain-budget-ledger.ts` — pending
- Owner UI: mark chain as `criticality: 'high'` in the chain proposal — pending
- **Manifest broadcast (`apps/node/src/agent-adapter-broadcast.ts`) — first cut done 2026-08-18**: `adapter.manifest` intent added to the protocol (agent→agent); the node builds an owner-signed `SignedCapabilityManifest` (`buildSignedCapabilityManifest`) and pushes it to bonded peers every TTL/2 via `startManifestBroadcaster` (started at node startup). Inbound: `handleInboundCapabilityManifest` verifies the owner signature against the contact-owner key store and stores fresh manifests in `ChainSideState.remoteManifests`; `findAgentNetworkWorkersRanked` now prefers a fresh wire manifest over card synthesis — the manifest-carrying worker pool is **live**.

Week 3-4: Federated scoreboard (initial)

- `verifier-scoreboard.ts` (local, per-runtime)
- `mesh-scoreboard.ts` (federated, opt-in)
- One peer-to-peer pull tested manually before wider rollout

**Total: 11 weeks, 2 engineers, ~3000 lines of new code, no rewrite of the existing orchestrator.**

### Risk assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Adapter is missing runtime-specific failure modes | Medium | High | Shadow mode in Sprint 1 catches divergence |
| Reputation-book-3tuple diverges from `ArbitrationStore` | Low | High | Append-only store is the single source; book is derived |
| Cross-agent verifier costs blow the budget | Medium | Medium | Verification budget cap; downgrades to rule-only |
| Federated scoreboard pulls a bad rule | Medium | Medium | Local 5-step protocol is the gate; the federation is opt-in only |
| `chain-orchestrator.ts` state machine needs a change we missed | Low | High | 2700-line file; refactor in 1-week PR; plenty of test coverage already |

---

## 11. Concrete file changes

This section is the literal "what to type" for the first sprint.

### New files

| Path | LoC (est) | Purpose |
|---|---|---|
| `packages/protocol/src/agent-adapter.ts` | 200 | Three new schemas, signed envelopes |
| `packages/protocol/test/agent-adapter.test.ts` | 150 | Schema roundtrip, signature verification |
| `packages/agent-adapter/package.json` | 30 | New package, peer dep on `@envoymesh/protocol` |
| `packages/agent-adapter/src/agent-adapter.ts` | 80 | `AgentAdapter` interface |
| `packages/agent-adapter/src/verifier.ts` | 60 | `CompositeVerifier` + `VerifierRule` |
| `packages/agent-adapter/src/adapter-registry.ts` | 60 | `AdapterRegistry` |
| `packages/agent-adapter/src/openclaw-adapter.ts` | 280 | The canonical adapter |
| `packages/agent-adapter/src/verifier-rules/output-matches-objective.ts` | 60 | One rule, exported |
| `packages/agent-adapter/src/verifier-rules/non-empty-content.ts` | 30 | One rule, exported |
| `packages/agent-adapter/src/verifier-rules/markdown-structure.ts` | 60 | One rule, exported |
| `packages/agent-adapter/src/verifier-rules/owner-allowed-topics.ts` | 80 | One rule, owner-policy-aware |
| `packages/agent-adapter/test/openclaw-adapter.test.ts` | 250 | Adapter + verifier tests |
| `apps/node/src/agent-adapter-broadcast.ts` | 120 | Periodic manifest broadcast — **done 2026-08-18** |
| `apps/node/src/agent-adapter-manifest-inbound.ts` | 120 | Inbound `adapter.manifest` verification + store — **done 2026-08-18** |
| `apps/node/src/chain-map.ts` | 220 | MAP interop layer — worker-side bridge: `ChainSubtask → ExecuteInput`, `SignedAgentResult → ChainSubtaskPartial`, advisory verify gate (Sprint 1) |
| `apps/node/test/chain-map.test.ts` | 150 | Chain-map bridge + shadow-mode equivalence tests |
| `packages/agent-adapter/src/pi-adapter.ts` | 260 | Pi runtime adapter + Pi-specific verifier (loop, command sequence) (Sprint 3) — **done 2026-08-18** |
| `packages/agent-adapter/src/cross-agent-verifier.ts` | 130 | Two-runtime disagreement verifier (Sprint 3) — **done 2026-08-18** |
| `apps/node/src/pi-map-adapter.ts` | 70 | Host→Pi adapter wiring seam (Sprint 3) — **done 2026-08-18** |

**Sprint 1 total: ~1700 lines, mostly tests.**

### Modified files

| Path | Change |
|---|---|
| `packages/protocol/src/index.ts` | Export new schemas from `agent-adapter.ts` |
| `packages/api/src/agent-network-settings.ts` (if exists) | Add `agentRuntime: AgentRuntime` field |
| `apps/node/src/node-service-chain-orchestration.ts` (line ~942, the `executeSubtask` wiring) | Dispatch the worker-side executor through `chain-map.ts` (adapter-backed variant) when the node runs a MAP runtime (Sprint 1 shadow / Sprint 2 switch) — **shadow + primary + `resolveMapWorkerMode` done 2026-08-18** |
| `apps/node/src/chain-worker-executor.ts` (the `createEngineChainSubtaskExecutor` contract) | Optionally share prompt/artifact formatting with the adapter; add an adapter-backed executor variant (Sprint 1) |
| `apps/node/src/chain-arbitration.ts` (the `ChainArbitrationEntry` union) | Widened to `ChainArbitrationEntry | VerdictEntry`; added `recordVerdictEntry` / `getVerdictsFor` + narrowing guards (Sprint 2) — **done 2026-08-18** |
| `apps/node/src/chain-reputation-3tuple.ts` (new) | `ReputationBook3Tuple`, `scoreFromVerdicts` (recency + defensive bias), `deriveReputationBySkillForPeer` (Sprint 2) — **done 2026-08-18** |
| `apps/node/src/chain-sensitivity-gate.ts` | Add `requiresReputationApproval` (Sprint 2) — **done 2026-08-18** |
| `apps/node/src/chain-budget-ledger.ts` | Add `verificationReservedUsd` / `verificationCommittedUsd` (Sprint 3) |
| `apps/node/src/chain-plan-assign.ts` (`scoreFor` / `bestPeerForRole`) | Blend 3-tuple reputation into role/skill scoring (Sprint 2) — **done 2026-08-18** |
| `apps/node/src/chain-orchestrator.ts` (`findWorkers` seam) | Manifest-carrying worker pool: `ChainWorkerManifestEntry`, `findWorkersWithManifests?`, `resolveWorkerPool` (Sprint 2) — **done 2026-08-18** |
| `packages/api/src/ws-protocol.ts` (`NodeConfig`) | Add `useMAP?: boolean` opt-in (Sprint 2 Week 3) — **done 2026-08-18**; live rollback via `ENVOYMESH_MAP_ROLLBACK=1` |
| `apps/node/src/agent-chain-orchestrator.ts` (line 21, `ChainProvider` interface) | **Dead code** (Phase 24B legacy; nothing imports `runAgentChain` in production). The manifest is preferred over `ChainProvider`; the legacy file is deprecated for deletion, not modification (Sprint 2) |

> **Grounded (2026-08-18):** `chain-orchestrator.ts`'s `findProviders` /
> `executeStep` are **not** the seam to change — that seam is the dead
> `agent-chain-orchestrator.ts`. The orchestrator-side change is
> `findWorkers` (capability string → manifest pool) and the worker-side
> change is the executor wiring above.

### Existing files explicitly NOT modified

- `packages/identity/src/*` — no change to signing/verification primitives
- `packages/network/src/*` — no change to libp2p layer
- `packages/bonds/src/*` — no change to trust tier logic
- `apps/node/src/chain-llm.ts` — stays as the legacy path during Sprint 1 shadow mode; deprecated in Sprint 2
- `apps/node/src/inbound-guard.ts` — no change; the new schemas reuse the same signing conventions

---

## 12. Testing strategy

### 12.1 Unit tests

For each adapter, write a test suite with three categories:

- **Happy path**: known input → known output. At least 10 cases per skill.
- **Rule triggers**: hand-crafted results that should trigger each verifier rule (e.g. empty content → `OutputMatchesObjectiveRule` returns `fail`).
- **Cross-adapter equivalence**: same task, two adapters, results compared. The OpenClaw adapter and a stub Pi adapter on the same task should produce semantically similar `ContentBlock[]`.

### 12.2 Integration tests

In `apps/node/test/`:

- **MAP shadow mode equivalence**: run the same chain 100 times under both the legacy engine path (`createOpenClawChainSubtaskExecutor` / `chain-worker-executor.ts`) and the new adapter path (`chain-map.ts` + `OpenClawAdapter.execute`). Assert ≥95% content equivalence (semantic similarity ≥0.9 on text blocks).
- **Reputation 3-tuple independence**: simulate 50 verdicts for `(peerA, openclaw, translate)` with pass rate 0.9, and 50 for `(peerA, hermes, translate)` with pass rate 0.4. Assert the two scores are tracked separately.
- **Sensitivity gate extension**: a peer with reputation 0.5 on a `private`-sensitivity mandate should be blocked. A peer with reputation 0.9 on the same mandate should pass.

### 12.3 E2E tests (orchestrator level)

In `apps/node/test/e2e/`:

- **Two-doctor cross-agent**: a `criticality: 'high'` chain on the same task, two different runtimes, asserts `CrossAgentDisagreementVerifier` returns `pass` when results agree, `disputed` when they don't.
- **Federated scoreboard pull**: peer A publishes a rule, peer B (running the same runtime) opts in to pull, asserts the rule is validated locally before adoption.
- **Shadow mode parity**: a chain that runs in shadow mode for 2 weeks; asserts the orchestrator behavior is identical to non-shadow.

### 12.4 Test data

- A frozen, owner-signed fixture of 50 chain tasks (varied skills, sensitivities, costs) for shadow-mode equivalence testing. Lives in `apps/node/test/fixtures/chain-tasks/`.
- A frozen, owner-signed fixture of 100 results (some pass, some fail, some partial) for verifier rule testing.

---

## 13. Open questions (resolved 2026-08-18)

These were open questions during design. All six are resolved as of 2026-08-18 on the `improve_agent_network` branch. The original question and the recommended answer are preserved; the resolution is recorded inline as a blockquote directly under each question. The "Not yet addressed (deferred)" list at the end of §14 covers things that remain open.

1. **Stable surface for each agent runtime.** OpenClaw: `openclaw-runtime` already exposes a TS API. Pi: CLI invocation only today. Hermes: HTTP. Codex: HTTP. **For each non-OpenClaw adapter, do we wrap the agent's local HTTP/CLI surface, or do we ask the agent to expose a stable TS API?** I recommend wrapping. Wrapping means the adapter has full control over input shaping and result parsing; pushing the API into each agent is more work and slower.

   > **Resolved (2026-08-18): wrap.** `envoy-harness-adapter` (Package 3, the only place that knows about the mesh) wraps the CLI surface via `child_process.spawn` for v0. The adapter is the only place that knows the runtime's specifics. If a non-OpenClaw team later exposes a TS API, the adapter can switch to the in-process shape without changing the `AgentAdapter` interface. envoy-harness's design §11 (`EnvoyHarnessAdapter`) is the canonical "wrap-the-CLI" example for this.

2. **Verifier LLM choice.** The `llm` source needs a model. Options: a dedicated `verifier-llm` config in `settings.json`; or fall through to the owner's primary model; or use a separate small model. **I recommend**: separate config, defaulting to the owner's primary model, owner-overridable. Use a *cheaper* model than the worker (e.g. worker uses `claude-opus-4`, verifier uses `claude-haiku`). The intuition: verifier checks the worker's claim; the worker is the more expensive one.

   > **Resolved (2026-08-18): as recommended.** envoy-harness's design §12 (`CompositeVerifier`) and §14 (Cost tracking) already align. A `verifier-llm` config lives in `settings.json`, defaulting to the owner's primary model, owner-overridable. The "use a cheaper model than the worker" rule is a soft default, overridable per-adapter.

3. **Default reputation seeding.** A brand-new node has no verdicts. The sensitivity gate should let it through for `public` (reputation threshold 0.0). **Should it have a non-zero default for `friends` (e.g. 0.5) to bootstrap?** I lean no — the whole point of progressive trust is that you have to earn it. But a node that's been online for 30 days and has never produced a verdict should at least show "no track record" rather than "0.0". So: a separate "track record exists" boolean is also part of the gate.

   > **Resolved (2026-08-18): as recommended.** No bootstrap default for `friends` — reputation must be earned. The "track record exists" boolean is a separate field on the gate, surfaced to UX as a distinct state (not conflated with "reputation = 0"). envoy-harness's design §7 (3-tuple reputation) inherits this directly.

4. **Per-runtime cost model.** Today, `OpenClawRuntime.prompt` has a `costUsd` field but it's set externally. **Who pays for the verifier LLM?** Three options: (a) from the chain's `maxChainCostUsd` (the worker pays indirectly); (b) from a separate `verificationBudgetUsd` field on the mandate; (c) from the orchestrator's own node (free, owner absorbs). **I recommend (b)** — explicit per-chain verification budget — because it makes the cost visible to the owner who is choosing criticality.

   > **Resolved (2026-08-18): (b).** envoy-harness's design §14 (Cost tracking) and §15 (Sub-agent protocol) already align — the orchestrator passes `verificationBudgetUsd` separately from `maxChainCostUsd`, and the budget-ledger reserves both at chain start. The owner sees verification cost in the chain summary, separate from worker cost.

5. **Federated scoreboard trust.** The mesh-federated scoreboard today is "any peer can claim any rule". **What's the trust model for federated entries?** Options: signed by a known contributor (out of scope here, requires a mesh-wide identity layer that doesn't exist yet); or based on a vote among contributing peers; or based on a stake. **I recommend**: defer the federated scoreboard to a later sprint, after the local 3-tuple reputation has run in production for a quarter. Until then, only local self-evolution.

   > **Resolved (2026-08-18): defer.** envoy-harness's design §9.2 (Federated self-evolution) says "opt-in, after the local 3-tuple reputation has run in production for a quarter." Same intent, same deferral. When we do pick this up, the trust model will likely be signature-based (requires a mesh-wide identity layer that doesn't exist yet) — but we don't commit to a specific model until that identity layer exists.

6. **The legacy path.** `chain-llm.ts` has the existing `DECOMPOSE_SYSTEM_PROMPT` and `MERGE_SYSTEM_PROMPT` baked in. **Should the new `OpenClawAdapter` reuse them or replace them?** I recommend: extract them to a `prompt-templates/` directory, both old and new paths use them. Avoids drift; the old path's prompt template is the gold standard until the new one proves better in shadow mode.

   > **Resolved (2026-08-18): as recommended, scoped to OpenClaw only.** envoy-harness uses different prompt templates (designed for the CLI flow, not the in-process OpenClaw runtime) and does **not** share the `prompt-templates/` directory with the legacy path. The extraction is for the `apps/node/src/chain-llm.ts` → `OpenClawAdapter` migration only, and is a separate work item.

---

## 14. Pointers

### What this document depends on

- `apps/node/src/chain-orchestrator.ts` (2700 lines, the orchestrator)
- `apps/node/src/chain-arbitration.ts` (append-only per-chain ledger, line 17-22 invariants)
- `apps/node/src/chain-budget-ledger.ts` (saga-style budget enforcement)
- `apps/node/src/chain-sensitivity-gate.ts` (sensitivity × bond level gate)
- `apps/node/src/chain-worker-executor.ts` (line 4: default engine is OpenClaw)
- `apps/node/src/chain-llm.ts` (line 30-58: the existing prompt templates)
- `apps/node/src/external-agent-gateway.ts` (existing ext agent surface)
- `packages/protocol/src/agent-network-profile.ts` (existing profile schema)
- `packages/protocol/src/agent-network-handoff.ts` (existing handoff schema)
- `packages/openclaw-runtime/src/index.ts` (the OpenClaw runtime API)

### What this document supersedes / extends

- `../harness-design/design.md` — the single-node verifier design is a *subcase* of this design (per-adapter verifier). The 5-step self-evolution protocol becomes the per-runtime scoreboard in §9.1.
- `../harness-design/design.md` §10 (Distributed) — extended into §5-9 here, with concrete schemas and adapter implementations.

### Inspirations (read alongside this)

- **DeepSeek-Harness** — for `Registrations are effects` (the future work item, deferred)
- **Penguin-Harness** — for the 5-step self-evolution protocol (§9.1) and the contamination guard (§9.1 closing notes)
- **Pi** — for `TaggedError` + `Result` (the `Verdict` schema §4.3 is the discriminated-union pattern)
- **The Cordis paper** — for the formal effects that justify append-only everything

### Not yet addressed (deferred)

- **Registrations are effects** (DeepSeek). Worth doing later, but only after MAP is in production.
- **HMR / hot reload** (DeepSeek, Pi). Pi's `/reload` is the right idea; EnvoyMesh's analogue is "re-broadcast the manifest when an adapter reloads".
- **Agent Skills standard** (Pi). Worth doing once OpenClawAdapter is stable; the format adapter is small.
- **Trace observability UI** (Penguin). A separate project; the data structure is in `chain-arbitration.ts`.
- **`run_subagent` clean API** (Penguin). The new `AgentAdapter.execute` *is* the clean API. No further work needed; just exposure.
