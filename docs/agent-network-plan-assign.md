# Team jobs — Plan + Assign + Merge

> Design + implementation note for Assigner-driven Team jobs.
> Product overview: [`agent-network-guide.md`](./agent-network-guide.md).
> **Multi-round refinement (A ∩ B):** [`agent-network-iteration.md`](./agent-network-iteration.md) · Phase 47 in [`implementation-plan.md`](./implementation-plan.md).

## Workflow (one round — shipped)

1. Build **eligible roster** (bonded + Join Agent Network + can execute). Specialty tags are **soft**. Roster includes `roles[]` / `primaryRole` when set.
2. **Assigner** (default = trigger node) runs one LLM **plan+assign** prompt with the roster. Mode from job / chain defaults:
   - **skill** (default): skills + freshness, context, spend, **throughputTokensPerSec**, same-LAN.
   - **role**: prefer collaboration roles; LLM may substitute / skill-fallback; structured `warnings[]` for the owner.
3. Every step gets a `preferredWorkerPeerId` (and optional `requiredRole`). No specialty match → **best generalist**. One worker → all steps to them. Empty roster → `no_workers`.
4. Dispatch via **A2A** `task.chain.*` to named peers (direct assign by default).
5. Wait for all steps → **Assigner merges** into one final Team job report / composite artifact.

See **[agent-network-roles.md](./agent-network-roles.md)** for role schema, prompt modules, and transparency.

**Inside the DAG (not a whole-job loop):** dependency-ready scheduling; parent finals inject `prior[subtaskId]: …` into child constraints **and** first-class `inputArtifacts` on propose (`prepareSubtaskPropose` / Phase 53 — see [agent-network-artifacts.md](./agent-network-artifacts.md)). Optional `threadId` keeps related steps on one preferred worker; stall reassign prefers sticky peer / same `requiredRole`. Bid negotiation rounds remain separate — see iteration design §2.

## Multi-round iteration (Phase 47)

| Layer | Status | Behavior |
|-------|--------|----------|
| **B** | **47A shipped** | Seal round → draft → judge → optional **full replan** with prior draft as input |
| **A** | **47B shipped** | **Append** a few dependent steps without rewriting finished work |
| **UX / handoff** | **47C–47D shipped** | Judge heuristics + Team jobs UI; handoff knobs/`iterationState` + `chain:iteration` |

Defaults keep today’s behavior: `iterationMaxRounds = 1` (no outer B until opted in). Intra-round extend uses `extendMaxStepsPerRound` (default 2) via Assigner `pendingExtendSteps` queue. Full design: **[`agent-network-iteration.md`](./agent-network-iteration.md)**.

```text
goal → Round 1 DAG (+ optional capped extends) → draft₁ → Judge
     → Round 2 plan+assign(prior=draft₁) → … → Final
```

## Code map

| Piece | Location |
|-------|----------|
| Profile throughput | `packages/protocol/src/agent-network-profile.ts` |
| Soft scoring + `assignWorkersToSteps` | `packages/api/src/agent-network-score.ts` |
| Soft worker pool | `findAgentNetworkWorkers` in `apps/node/src/node-service-chain-orchestration.ts` |
| Plan+assign prompt / parse (skill + role modes) | `apps/node/src/chain-plan-assign.ts` |
| Collaboration roles (profile) | `packages/protocol/src/agent-network-profile.ts` · [agent-network-roles.md](./agent-network-roles.md) |
| LLM entry | `apps/node/src/chain-decomposer.ts` (`getRoster`) |
| Named launch | `_runChainGoal` prefers `subtask.preferredWorkerPeerId` |
| Roster mock AI | `packages/models` `mockResponseText: "__plan_assign_from_roster__"` |
| Multi-home E2E | `apps/node/test/chain-plan-assign-three-home-e2e.test.ts` |
| Assigner handoff E2E | `apps/node/test/chain-assigner-handoff-e2e.test.ts` |
| Stall reassign E2E | `apps/node/test/chain-stall-reassign-e2e.test.ts` |
| Live-LLM plan E2E | `apps/node/test/chain-plan-assign-live-llm-e2e.test.ts` (gated) |
| Iteration design (Phase 47) | `docs/agent-network-iteration.md` |

## Standards

- **A2A (EMP lane):** cards, propose/accept, results, merge/report, Assigner handoff (`task.chain.handoff` with `goal`).
- **MCP:** Assigner helpers exposed as mesh tools **and** MCP descriptors via `listAgentNetworkMcpTools()` (`mesh.list_agent_network_workers`, `mesh.probe_peer`, cards). `mesh.chain.run` remains on the owner-agent allowlist. Cross-home work stays A2A.

## Testing

| Layer | What |
|-------|------|
| Unit | `chain-plan-assign`, `agent-network-score`, soft membership pool, DAG advance / stall reassign, mock `synthesizePlanAssignFromRosterPrompt`, decomposer plan+assign |
| Smoke / E2E | `chain-plan-assign-three-home-e2e.test.ts` — 3 libp2p homes, **same** `modelProviders: { mode: "mock", mockResponseText: "__plan_assign_from_roster__" }`, **different** membership + `agentNetworkProfile.skills`; asserts ranking, named assignees, 3-step plan, report |
| Smoke / E2E | `chain-assigner-handoff-e2e.test.ts` — trigger hands off via `assignerPeerId`; Assigner plans+merges on the same `chainId` |
| Smoke / E2E | `chain-stall-reassign-e2e.test.ts` — multi-home award with ranked backups; aged award + `trackChain` → one reassign (worker list rotates to backup; cap holds) |
| Live (opt-in) | `chain-plan-assign-live-llm-e2e.test.ts` — Assigner uses live MiniMax; workers stay on roster mock; asserts multi-step named plan from roster + report. Requires `ENVOY_PHASE18_LIVE_TESTS=1` and model credentials (same gate as Phase 18). |

```bash
ENVOY_PHASE18_LIVE_TESTS=1 RUN_E2E=1 npx vitest run \
  apps/node/test/chain-plan-assign-live-llm-e2e.test.ts
```

## Assigner handoff

- `chainStartFromGoal` / `_runChainGoal` accept optional `assignerPeerId`.
- Default = local agent. When set to another eligible peer, trigger sends `task.chain.handoff` with `goal` (empty `subtaskIds`); the remote node runs plan+assign+merge and keeps the same `chainId` for correlation.
- Assigner must be bonded + Join Agent Network (`assigner_not_eligible` otherwise).
- **Iteration (Phase 47):** loop ownership stays with the Assigner for that `chainId`; handoff carries `iterationMaxRounds` / judge / extend knobs and optional `iterationState` rehydrate blob (see iteration design §5.3).

## Dependency schedule + stall re-assign

- `launchChain` proposes only dependency-ready roots; dependents wait.
- Final parent partial → `advanceReadySubtasks` proposes children with:
  - `inputArtifacts` (named parent outputs / fragment / note→text; size-capped), and
  - `prior[subtaskId]: …` constraint lines (compat skim).
- Stall (past `stallTimeoutMs` from last heartbeat or award time) → `reassignStalledSubtask` once via `pickStallReassignWorker` (same `threadId` sticky peer → same `requiredRole` preferred → list order). Named/direct launch proposes the primary only; ranked backups stay on the list for recovery.
