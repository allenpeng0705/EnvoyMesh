# Capability route executor (Phase 16E)

**Status:** Shipped (in-process)  
**Scope:** EnvoyMesh-native agent orchestration — **not** OpenClaw bridge / Social RPC.

## Problem

Capability matching produces an **intent route** (ordered EMP steps + `mesh.*` tool hints). Something must turn that plan into **actions** on the home node without handing libp2p to external agents.

## Architecture

```
Goal + capability tags
        ↓
capability-intent-routing   (@envoymesh/api)
        ↓
capability-provider job     (routeSteps, routeStepIndex)
        ↓
capability-route-executor   (@envoymesh/api — pure)
        ↓
executeTool / mesh runtime  (apps/node)
```

### Modules

| Module | Layer | Notes |
|--------|-------|-------|
| `capability-intent-routing.ts` | `@envoymesh/api` | Catalog, scoring, manifest custom routes |
| `capability-route-executor.ts` | `@envoymesh/api` | `resolveRouteStepExecution`, defer human/task steps |
| `capability-route-executor.ts` | `apps/node` | `executeCapabilityRouteStep` → `executeTool` |
| `capability-provider-worker.ts` | `apps/node` | Job state machine + step loop |

## Step resolution rules

1. **Execute** when a registry tool exists and params are satisfiable (e.g. `mesh.library_discover` without `targetOwnerId`).
2. **Defer** human-only intents (`bond.accept`), approval-gated chat, trust-mode intro broadcast, or `task.*` (mandate runtime not in this slice).
3. **Skip** when no tool mapping exists (recorded in `stepResults`).

Deferred steps are **not failures** — the job can still reach `completed` with `stepResults[].deferred === true`.

## In-process entry points

| API | Purpose |
|-----|---------|
| `mesh.match_capability_route` | Planner — rank routes or fetch one by `routeId` |
| `mesh.capability_provider.start` | Start job; daemon tick runs `runCapabilityProviderWorker()` |
| `NodeService.startCapabilityProviderJob` | Same loop (internal / tests) |

Bridge / `json-rpc` exposure is **intentionally deferred** until EMP wire semantics for standing postures are frozen — see [Bridge exposure (deferred)](#bridge-exposure-deferred) below.

## Bridge exposure (deferred)

**Do not** expose posture job start/status over the OpenClaw / HomeClaw HTTP bridge until:

1. **`emp/0.1` wire fields are stable** for the flows each posture uses (`knowledge.response.suggestedRelativePath`, mandate `posture` / `posturePolicy`, `postureRef` on envelopes).
2. **Job lifecycle semantics are frozen** — terminal states, `correlationId` stitching, and what constitutes success vs `approval_needed` for document acquisition and capability provider jobs.
3. **Bridge ADR** ([openclaw-agent-bridge-adr.md](./openclaw-agent-bridge-adr.md)) defines a versioned HTTP surface (not ad-hoc tool passthrough).

| Posture | In-process today | Bridge (future) |
|---------|------------------|-----------------|
| `social_proxy` | `NodeService` + orchestrator | Deferred — intros/bond semantics still trust-mode sensitive |
| `document_acquisition` | `startDocumentAcquisitionJob` + worker tick | Deferred — needs frozen `knowledge.response` + share pull contract |
| `capability_provider` | `mesh.capability_provider.start` + worker tick | Deferred — task.propose does not await accept/result yet |

**Allowed today on bridge:** `chat.message`, `mesh.async_reply`, `list-tools` / `execute-tool` for stable mesh tools (Phase 9K). **Not allowed yet:** starting or polling async posture jobs from external agents.

When bridge support ships, add: `POST /bridge/posture/start`, `GET /bridge/posture/status/:jobId` with explicit `emp/0.1` capability negotiation in bridge handshake.

## Job fields

- `agentRouteId`, `routeSteps`, `routeStepIndex`, `stepResults`
- Terminal: `completed` | `failed` | `cancelled`
- Activity kind: `capability_provider_stage`

## Next slices

1. ~~E2E test: bonded peer + `mesh.capability_provider.start` → `completed`.~~ **Done.**
2. Share executor with document-acquisition negotiate/acquire phases (partial — legacy pull-share path).
3. Task mandate runtime for non-deferred `task.*` steps (await accept/result).
4. Bridge posture job API — **only after** [Bridge exposure (deferred)](#bridge-exposure-deferred) criteria met.
