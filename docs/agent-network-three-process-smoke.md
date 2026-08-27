# Phase 60 — three-process Agent Network smoke

Operator / release guide for the **packaged libp2p three-home smoke** that
covers Phase 60 lease wiring on real mesh paths.

This smoke **complements** the deterministic in-process lab matrix. It does
**not** replace it.

| Suite | When | What it proves |
|-------|------|----------------|
| `apps/node/test/agent-network-lab-matrix.test.ts` | Every PR / unit run | §10.3 logic: leases, strategies, reconcile, speculation, journal (virtual clock + fault transport) |
| `apps/node/test/agent-network-three-process-smoke.test.ts` | Pre-release / OS smoke | Real loopback libp2p: lease envelopes cross homes, preview marks `availabilitySource: "lease"`, Team job awards and publishes a report |

Design reference: [agent-network-next-generation-design.md](./agent-network-next-generation-design.md) §10–11.  
Checklist: [implementation-plan.md](./implementation-plan.md) Phase 60F.

---

## What this smoke asserts

One sequential test boots **three** Phase13 homes (assigner + two workers):

1. **Join Agent Network** on each home (`capabilityProviderEnabled`, membership,
   agent-network profile, Agent Card exchange after bonding).
2. **Lease inbound routing** on each mesh (`wireWorkerLeaseInboundHandler` —
   same intents the daemon handles in `apps/node/src/index.ts`).
3. **Lease publishers** via `startWorkerLeaseBroadcaster` + immediate
   `publishNow()`.
4. Wait until the assigner’s
   `agentNetworkDiagnosticsSnapshot()` shows **≥2 `leaseReady` workers**.
5. Assert local feature ads include `worker-lease-v1` and `chain-attempt-v1`.
6. `chainPreviewGoal` — at least one suggested worker has
   `availabilitySource: "lease"` (not only legacy probe / unknown).
7. Competitive `chainEvaluateBids` → **`awarded: true`** and
   `chainGetState.awardedCount > 0` (assigner is **not** in the worker pool).
8. **`wireMockTeamJobEngine`** on all three homes — stubs OpenClaw ready +
   sync replies so workers execute without a real gateway (mock
   `modelProviders` from `enableAgentNetworkWorker`).
9. Waits for **`partialCount > 0` or `published`**, then a published **report**
   with non-empty executive summary (execute→report gate).

For production OpenClaw / Harness / Ext Agent paths (no stub), use Phase 43
`npm run test:e2e:chain-three-home` when engines are available.

It does **not** re-run all fourteen lab scenarios (stall / dual-award /
corrupt journal / privacy-local). Those stay in the lab matrix.

---

## Prerequisites

- Repo root with `npm install` completed.
- No paid models, internet, or community relay required (loopback libp2p only).
- OpenClaw / Ext Agent / Harness **do not** need to be live: lease TTL +
  membership are enough for preview/select; execution uses the existing
  chain inbound path (same as other plan+assign E2Es).
- Port: meshes listen on `127.0.0.1` with ephemeral ports
  (`setAllowLoopbackDialHints(true)` in the Phase13 harness).

---

## How to run

### Recommended (script)

```bash
bash scripts/agent-network-three-process-smoke.sh
```

The script sets `RUN_E2E=1` and runs only the Phase 60 smoke file. Exit `0`
means OK; non-zero means failure (see vitest output).

### npm script

```bash
npm run test:e2e:agent-network-three-process
```

### Direct vitest

```bash
# Required: RUN_E2E=1 — without it, *smoke* files are excluded from the default suite
RUN_E2E=1 npx vitest run apps/node/test/agent-network-three-process-smoke.test.ts
```

### Watch / single assertion (debug)

```bash
RUN_E2E=1 npx vitest apps/node/test/agent-network-three-process-smoke.test.ts
```

### Lab matrix (unit — every PR)

```bash
npx vitest run apps/node/test/agent-network-lab-matrix.test.ts
```

No `RUN_E2E` needed; this file is included in the default unit suite on purpose
(name avoids `*e2e*` / `*three-node*` excludes).

---

## When to run it

| Moment | Lab matrix | Three-process smoke |
|--------|------------|---------------------|
| Local Agent Network PR | Yes | Optional |
| `npm run test:dev` / CI unit | Yes (via unit) | No (excluded) |
| Before tagging a Phase 60 / Agent Network release | Yes | **Yes — once per OS** (macOS / Windows / Linux) |
| After changing lease wire, mesh inbound, or award probe short-circuit | Yes | **Yes** |

Suggested release checklist line:

```text
[ ] bash scripts/agent-network-three-process-smoke.sh   # this host OS
[ ] npx vitest run apps/node/test/agent-network-lab-matrix.test.ts
```

---

## Interpreting failures

| Symptom | Likely cause | What to check |
|---------|--------------|---------------|
| Timeout waiting for `leaseReady ≥ 2` | Lease envelopes not delivered or not accepted | Bonds registered? `wireWorkerLeaseInboundHandler` on assigner? Broadcaster `publishNow` errors in stderr (`[agent.worker.lease]`) |
| Preview has workers but `availabilitySource` never `"lease"` | Lease store empty / expired / revoked on assigner | Diagnostics snapshot `workers[].leaseReady` / `exclusionReasons` |
| Preview `workerCount < 2` | Membership / Agent Card exchange incomplete | `refreshAgentNetworkMembershipIndex`, card list for both worker owners |
| Award / report timeout | Chain inbound not wired, or worker engine down | `wireHomeAsChainParticipant`; accept may log `handler_denied` / `openclaw_unavailable` without a ready AN engine — award-side assert should still pass |
| `worker_peer_mismatch` on leases | Lease envelope senderPeerId ≠ `lease.workerPeerId` | Fixed in `buildWorkerLeaseEnvelope` (must use agent peer id + `agentCredential`) |
| Flaky only under load | Loopback mesh timing | Re-run once; if persistent, raise wait budgets in the test (currently 30–45s waits, 180s test timeout) |

Useful debug dumps inside a failing run (temporarily):

```ts
console.log(await orchestrator.service.agentNetworkDiagnosticsSnapshot());
console.log(await orchestrator.service.chainGetState({ chainId }));
```

---

## Relation to Social / EnvoyGo “Test Agent Network”

UI diagnostics (`agentNetworkDiagnosticsSnapshot` / `Simulate`) are **no-spend
simulations** against the live node. This smoke is an **automated mesh E2E**
that proves the same lease snapshot + ranking inputs under three homes.

- UI: interactive readiness / dry-plan for operators.
- Smoke: CI/release gate for wire correctness.

---

## File map

| Path | Role |
|------|------|
| `apps/node/test/agent-network-three-process-smoke.test.ts` | The smoke test |
| `scripts/agent-network-three-process-smoke.sh` | Wrapper (`RUN_E2E=1` + vitest) |
| `apps/node/test/phase13-e2e-harness.ts` → `wireWorkerLeaseInboundHandler` | Mesh → `handleInboundWorkerLease` |
| `apps/node/test/chain-plan-assign-e2e-helpers.ts` | Bond / membership / chain wiring helpers |
| `apps/node/test/agent-network-lab-matrix.test.ts` | In-process §10.3 matrix (PR gate) |

---

## Extending later (optional)

Safe follow-ups if release risk warrants them (keep each as a separate `it`
with long timeouts):

1. Assigner process restart → `RECOVERING` → reconcile → no duplicate award.
2. Dual-award critical step with `highest-confidence` across two homes.
3. Lease revoke mid-preview → worker drops from lease-ready set.

Prefer adding those only after the corresponding lab matrix scenario is green
and you need mesh-level confirmation.
