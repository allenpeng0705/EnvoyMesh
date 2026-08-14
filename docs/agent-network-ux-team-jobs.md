# Team jobs — Fleet readiness, live story & multi-node UX

> Status: **Phase 58 — `[x]` shipped** (58A–58E).
>
> Related: [`agent-network-guide.md`](./agent-network-guide.md) ·
> [`agent-network-artifacts.md`](./agent-network-artifacts.md) ·
> [`agent-network-job-input-delivery.md`](./agent-network-job-input-delivery.md) (Phase 59) ·
> [`implementation-plan.md`](./implementation-plan.md) Phase 58.

## Principles

1. Team jobs live in **Team jobs** — chat stays chat (no default “Run as team job” chrome).
2. Opt-in is the norm — never assume peers joined Agent Network.
3. Progressive depth — goal + pool first; DAG / Assigner later.
4. Honesty — attachments are home-vault paths; cross-home **bytes** are Phase 59 (handoff, not sync).

## Waves

| Wave | Status | Outcome |
|------|--------|---------|
| **58A** | `[x]` | Fleet readiness checklist + skip useless Preview |
| **58B** | `[x]` | Live `steps[]` + artifact / attachment honesty |
| **58C** | `[x]` | Per-step cancel/reassign + observed badges |
| **58D** | `[x]` | EnvoyGo iteration resolve + observed list |
| **58E** | `[x]` | Advanced Assigner picker |

## 58A — Fleet readiness (shipped)

`FleetReadinessPanel` + `buildFleetReadinessChecklist`: Join → engine → bonds → peer Join → fresh card → online → other ready. Skip Preview when `skipPreview`. Social + EnvoyGo hints.

## 58B — Live job story (shipped)

`buildChainLiveSteps` → `chainGetState` / listActive / `chain:state`. Social `ChainLiveSteps` + honesty; EnvoyGo light step list.

## 58C — Per-step control + worker UX (shipped)

- Owner cancel-by-subtask (+ dependents) notifies awarded workers; `chainReassignSubtask` wraps stall-reassign.
- Assigner UI: Cancel step / Reassign on `ChainLiveSteps`.
- Observed cards: role badges (assigned / waiting assigner / blocked / done) — no manage CTAs.

## 58D — EnvoyGo control (shipped)

- Parse `iteration`; banner when `waitingForOwner` → `chainResolveIteration`.
- Faster poll while waiting; observed section via `chainListObserved`.

## 58E — Assigner picker (shipped)

Job settings: **Orchestrate on** this node | bonded ready peer → `assignerPeerId` / handoff.

## Out of scope

- Chat recruitment; standing vault sync; mobile bid inbox; Phase 59 byte delivery.
