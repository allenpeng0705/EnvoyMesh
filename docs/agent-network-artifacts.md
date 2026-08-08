# Agent Network — Artifact handoff & worker stickiness

> **Status:** **Phase 53 — implemented** (53A–53E).  
> **Related:** [plan+assign](./agent-network-plan-assign.md) · [roles](./agent-network-roles.md) · [vocabulary](./agent-network-vocabulary.md) · [implementation plan §Phase 53](./implementation-plan.md#phase-53--artifact-handoff--worker-stickiness)

## 1. Goals

1. Pass **typed parent results** to child steps (`inputArtifacts` on `task.chain.propose`), not only truncated `prior[...]` constraint strings.
2. Keep **backward compatibility**: old workers ignore `inputArtifacts` and still see `prior[...]`.
3. Pin **ownership threads** (`threadId`) so related steps stay on one preferred worker; stall reassign prefers sticky peer / same `requiredRole`.

## 2. Non-goals (v1)

- New `cid` artifact kind (reuse `text` / `file` / `structured`)
- Hard block when soft `expects` are missing
- Cross-home vault byte transfer protocol (v1 passes **refs**: `vaultPath` + `contentHash`)
- Job-scoped cast overrides

## 3. Data model

| Field | Where | Meaning |
|-------|--------|---------|
| `namedArtifacts[]` | `ChainSubtaskPartial` | Named outputs (`{ key, artifact }`) |
| `inputArtifacts[]` | `task.chain.propose` | Parent pack for the worker |
| `threadId` | `ChainSubtask` | Soft ownership group |
| `produces` / `expects` | `ChainSubtask` | Soft keys (not enforced) |

`Artifact` remains the existing union: text (≤64k), file (`vaultPath` + `contentHash`), structured, composite.

**Fallback when packing inputs:**

1. Parent `namedArtifacts` if present  
2. Else `artifactFragment` → key `default`  
3. Else `note` → text artifact key `default`

## 4. Runtime

```text
Parent final partial (namedArtifacts)
  → Assigner buildInputArtifacts(+ size cap 48k)
  → prepareSubtaskPropose: inputArtifacts + prior[...] constraints
  → task.chain.propose
  → Worker OpenClaw prompt "## Input: {key}"
  → Final partial: artifactFragment + namedArtifacts[{ key: "result", … }]
```

**Stickiness**

- Materialize: first step in a `threadId` owns the preferred peer; later steps in that thread rewrite to the same peer.
- Stall: `pickStallReassignWorker` prefers same-thread sticky peer, then a peer preferred on another step with the same `requiredRole`, then list order. Cap remains one reassign per subtask.

## 5. Code map

| Piece | Location |
|-------|----------|
| Schemas | `packages/protocol/src/agent-network.ts` |
| `buildInputArtifacts` / `prepareSubtaskPropose` / stall pick | `apps/node/src/chain-orchestrator.ts` |
| Prompt + emit named result | `apps/node/src/chain-worker-executor.ts` |
| Propose cache `inputArtifacts` | `apps/node/src/node-service-chain-orchestration.ts` |
| `threadId` materialize | `apps/node/src/chain-plan-assign.ts` |
| Tests | `apps/node/test/chain-artifacts-handoff.test.ts`, executor + protocol tests |

## 6. Compatibility

| Case | Behavior |
|------|----------|
| Old worker | Ignores `inputArtifacts`; uses `prior[...]` + objective |
| Old partial (fragment only) | Packed as `{ key: "default", artifact }` |
| Empty parents | No `inputArtifacts`; constraints unchanged |
| Accept without propose cache | `task.chain.accept.inputArtifacts` recovers the pack |

**Notes**

- Partial `note` stays ≤8k; `namedArtifacts` / `artifactFragment` text may carry ≤64k for handoff.
- Launch/replan/extend always puts sticky `preferredWorkerPeerId` first even if skill ranking omitted them.
- Structured oversize inputs convert to clipped text under the same 48k pack budget (sized by actual JSON encoding).
