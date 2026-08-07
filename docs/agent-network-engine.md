# Agent Network — worker AI Engine policy

> **Status:** Canonical product policy (2026-08).  
> **Audience:** engineers implementing Team job worker execution.  
> **Related:** [agent-network-vocabulary.md](./agent-network-vocabulary.md),
> [agent-network-config.md](./agent-network-config.md) (chat AI Engine flags),
> [agent-network-plan-assign.md](./agent-network-plan-assign.md).

## 1. Separation of concerns

| Who decides | What |
|-------------|------|
| **Team job creator / Assigner** | Which **peer (node)** works on each step — membership → skills → online / LAN / profile |
| **Owner of each home node** | Which **local AI Engine** executes Agent Network work **on that node** |

The Assigner never picks OpenClaw vs Ext Agent. Peers advertise skills; the
orchestrator assigns peers.

Chat / bridge AI Engine toggles (`openclawEnabled`, `bridgeEnabled`) remain as
documented in [agent-network-config.md](./agent-network-config.md). This doc
covers **Agent Network worker execution** only.

## 2. Per-node Agent Network engine

| Mode | Who runs accepted Team-job subtasks on this node |
|------|--------------------------------------------------|
| **Default (step 1)** | **Built-in OpenClaw** (EnvoyAI) |
| **Later (step 2)** | **Ext Agent** — owner selects on **their** node |

Rules:

1. **Default = OpenClaw.** Joining Agent Network implies this node’s worker
   path uses Built-in OpenClaw until the owner opts into Ext for AN.
2. **Manual, node-local.** Only the owner of that home node chooses. Not the
   Team job creator, not the Assigner, not a per-step UI.
3. **One engine for Agent Network at a time.** If the owner selects Ext Agent
   for Agent Network, Built-in OpenClaw does **not** run AN worker subtasks on
   that node (and the reverse). Chat routing may still differ; AN is exclusive.
4. **Ext Agent (later)** may expose its own skills onto the Agent Card for
   ranking. Until then, Ext ids/names are **not** skills (see vocabulary).

```text
Owner config (this node)          Assigner (Team job)
─────────────────────────         ───────────────────
AN engine: OpenClaw | Ext    →    pick peer by membership + skills
       ↓                          assign step → that peer
  execute subtask locally
```

## 3. Phasing

### Step 1 — OpenClaw (now)

- Wire `executeSubtask` so accepted Team-job work calls Built-in OpenClaw.
- If OpenClaw is not running / errors / returns empty: emit a **final failed
  partial** (`confidence` low, note starts with `Failed:`) — do **not** fake
  success with stub text.
- Orchestrator recovery remains peer-level: stall timeout → reassign once to
  another worker (existing `reassignStalledSubtask`). No Ext↔OpenClaw swap on
  the same node in step 1.

### Step 2 — Ext Agent for Agent Network (later)

- Owner setting: **Agent Network engine = OpenClaw | Ext Agent** (default OpenClaw).
- When Ext is selected: Ext executes AN subtasks; OpenClaw does not for AN.
- Ext advertises skills for soft ranking (separate from chat bridge presence).
- Same fail semantics: honest failure → stall / reassign to another peer.

## 4. Error handling summary

| Failure | Worker node | Orchestrator |
|---------|-------------|--------------|
| OpenClaw (or Ext) unavailable / timeout / empty | Decline bid/accept; if somehow awarded, final partial `Failed: …`. Local self ranked offline. | Prefer backup peer via stall/worker-failed reassign (≤1). If no backup, Failed note remains for the report. |
| Peer offline / no heartbeat | — | Stall → cancel → propose next ranked peer (≤1 reassign) |
| No backup peers | — | Job waits or completes with Failed content in report when exhausted |

Local engine fallback (OpenClaw → native `modelProviders`) is **out of scope for
step 1** Agent Network workers. Prefer clear failure over silent stub text so
the Assigner can reassign.

## 5. Implementation pointers

| Concern | Location |
|---------|----------|
| Policy (this doc) | `docs/agent-network-engine.md` |
| Membership / skills vocabulary | `docs/agent-network-vocabulary.md` |
| Worker accept → execute | `apps/node/src/chain-worker-executor.ts`, `buildChainWorkerDeps` |
| OpenClaw ask | `NodeService.askOpenClaw` / `askOpenClawViaRuntime` |
| Stall reassign | `apps/node/src/chain-orchestrator.ts` → `reassignStalledSubtask` |
