# envoy-harness integration — v1.12 sub-plan (Tauri UI for the scoreboard badge)

> **Status:** ✅ **DONE** (2026-08-21). 1
> commit on `envoy_harness_integration`
> branch (the user delegates the commit;
> the Tauri UI implementation is the
> Tauri team's work; v1.12 ships the
> sub-plan + the Tauri design doc
> section). No new tests (design-only
> chunk; the backend (v1.10 + v1.11) is
> already tested). No new type errors.
>
> **What this doc covers:** v1.12 in
> **concrete detail** — the backend
> exposure pattern for the Tauri team +
> the Tauri UI design + the design
> questions for team sign-off.
>
> **Order:** Phase 8 v0 + v1.1 + v1.2 + v1.3 +
> v1.4 + v1.5 + v1.6 + v1.7 + v1.8 + v1.9 +
> v1.10 + v1.11 + v1.13 + v1.14 are done.
> v1.10 ships the scoreboard formula +
> the Tauri UI helpers
> (`categorizeReputation` +
> `isNoHistoryReputation`). v1.11 ships
> the per-3-tuple wiring helper
> (`getWorkerReputation`). v1.13 ships
> the per-peer projection helper
> (`getReputationBySkillForPeer`). v1.12
> ships the **Tauri-team handoff** —
> the sub-plan + the Tauri design doc
> section for the actual Tauri UI
> implementation.

## 1. Goal

**Ship the Tauri-team handoff for the
scoreboard badge UI.** v1.10 + v1.11 +
v1.13 ship the backend helpers
(`reputationFromVerdicts` +
`categorizeReputation` +
`isNoHistoryReputation` +
`getWorkerReputation` +
`getReputationBySkillForPeer`). v1.12
ships the **Tauri design doc** that
tells the Tauri team what to build +
how to call the backend helpers.

**Why now:** v1.10 + v1.11 + v1.13
ship the backend. The Tauri team
needs a design doc to build the
actual UI. v1.12 is the handoff.

**The v1.12 scope:** the sub-plan doc
(this file) + the Tauri design doc
section (§18) that tells the Tauri
team what to build. The actual Tauri
UI implementation is the Tauri team's
work (out of scope for our repo).

## 2. Existing pieces (what we build on)

### 2.1 v1.10 backend helpers

**File:** `apps/node/src/chain-scoreboard.ts`

- `reputationFromVerdicts(verdicts): number` — the formula (returns `[-1, 1]`)
- `categorizeReputation(score): "trusted" | "mixed" | "untrusted"` — the UI category
- `isNoHistoryReputation(verdictCount): boolean` — the empty-input helper
- `SCOREBOARD_SOURCE_WEIGHTS` + `SCOREBOARD_TRUST_THRESHOLDS` — the constants

### 2.2 v1.11 per-3-tuple wiring

**File:** `apps/node/src/chain-scoreboard.ts:307-355`

- `getWorkerReputation(store, criteria): number | undefined` — reads the 3-tuple from the store + returns the mapped `[0, 1]` score (or `undefined`)

### 2.3 v1.13 per-peer projection

**File:** `apps/node/src/chain-scoreboard.ts:357+`

- `getReputationBySkillForPeer(stores, peerId): Record<string, number> | undefined` — the per-peer projection (MAX across runtimes per skill)

### 2.4 The Tauri design doc

**File:** `docs/taui-agent-routing-settings.md`

The Tauri design doc is the home for the
Tauri UI design. §16 (v1.10) covers
the chat report surface for the
scoreboard category. §17 (v1.11)
covers the worker trust badge.
§18 (v1.13) covers the per-skill
reputation display. v1.12 adds the
next section.

## 3. Design

### 3.1 The Tauri-team handoff — what to build

The Tauri team builds the **chain
report surface** (a future Tauri
panel; not in the chat surface). The
chain report shows:

- The worker's trust category (per
  the v1.10 `categorizeReputation`)
- The per-skill reputation (per the
  v1.13 `getReputationBySkillForPeer`)
- The "no history" state (per the v1.10
  `isNoHistoryReputation`)

The chain report is a future Tauri
panel (the Tauri team's work). v1.12
ships the design + the backend
exposure pattern; the Tauri team
implements the actual UI.

### 3.2 The backend exposure pattern

The Tauri team reads the chain report
data via the orchestrator's existing
API surface (the chain's
`ArbitrationStore` is exposed to the
Tauri side via the orchestrator's
introspection API). The Tauri team
calls the v1.13 `getReputationBySkillForPeer`
helper + the v1.11 `getWorkerReputation`
helper + the v1.10 `categorizeReputation`
+ `isNoHistoryReputation` helpers
from the Tauri code.

The Tauri team is responsible for:
- The actual panel UI (TSX in the
  Tauri monorepo)
- The data refresh (when the
  `ArbitrationStore` updates, the
  Tauri panel re-fetches)
- The user-friendly labels (per the
  v1.10 §16 + v1.11 §17 + v1.13 §18
  design docs)

### 3.3 No new code

v1.12 doesn't ship new code. The
backend (v1.10 + v1.11 + v1.13) is
already tested. v1.12 is the design
doc only.

## 4. Design questions for team sign-off

| # | Question | Default (proposed) | Alternative |
|---|---|---|---|
| **Q1** | Tauri UI surface | **Chain report panel** (a future Tauri panel; not in the chat surface) | Chat surface (the chat badge; but the chat badge is already covered by v1.10 §16 + v1.11 §17 + v1.13 §18) |
| **Q2** | Backend exposure | **Tauri team calls the v1.10 + v1.11 + v1.13 helpers via the orchestrator's introspection API** (the existing pattern) | Add a new Tauri-specific API method (more work; out of scope for v1.12) |
| **Q3** | User-friendly labels | **Tauri team owns the label copy** (per the v1.10 §16 + v1.11 §17 + v1.13 §18 design docs) | We pre-write the label copy (more work; out of scope for v1.12) |
| **Q4** | Data refresh | **Tauri team owns the refresh logic** (when the `ArbitrationStore` updates, the panel re-fetches) | Add a notification mechanism (out of scope for v1.12) |
| **Q5** | Test scope | **No new tests** (v1.12 is design-only; the backend is already tested) | Add Tauri-side tests (out of scope for our repo) |
| **Q6** | Sub-chunk granularity | **Single commit** (v1.12 is a sub-plan + a Tauri design doc section; no code) | N/A (v1.12 is a single sub-chunk by design) |

**Defaults at-default (Q1-Q6):** I have no strong opinion on Q1 (the chain report is the natural surface; the chat badge is already covered), Q2 (the Tauri team's standard pattern; no new API needed), Q3 (label copy is the Tauri team's call; the design docs give the suggested copy), Q4 (refresh is the Tauri team's call), Q5 (no tests for a design-only chunk; the backend is already tested), Q6 (single commit is the right granularity).

## 5. Plan

### Sub-chunk v1.12.1 — the sub-plan + Tauri design doc (1 commit)

- New: `docs/agent-harness-integration-v1-12.md` — this sub-plan + DONE stamp.
- Modify: `docs/taui-agent-routing-settings.md` — add the next section (the actual Tauri UI design).
- Modify: `docs/agent-harness-integration.md` — add v1.12 status to the change log.
- Modify: `docs/agent-harness-integration-v1-10.md` + `docs/agent-harness-integration-v1-11.md` + `docs/agent-harness-integration-v1-13.md` — v1.12 status note (v1.12 is the Tauri-team handoff for the scoreboard UI; the backend is already shipped in v1.10 + v1.11 + v1.13).

**Total: 1 sub-chunk, 1 commit at the end of v1.12** (per the v1.4-v1.14 commit pattern).

## 6. Out of scope (deferred)

- **Tauri UI implementation** — the
  Tauri team picks up the actual UI
  implementation in their workstream.
  v1.12 ships the design + the backend
  exposure pattern; the Tauri team
  implements the panel.
- **Notification mechanism** — when the
  `ArbitrationStore` updates, the Tauri
  panel re-fetches. v1.12 doesn't
  ship a notification mechanism; the
  Tauri team picks up the refresh
  logic in their workstream.
- **Tauri-side tests** — the Tauri team
  adds the Tauri-side tests in their
  workstream. v1.12 doesn't ship Tauri
  tests (out of scope for our repo).

## 7. References

- [`agent-harness-integration-v1-10.md`](./agent-harness-integration-v1-10.md)
  (the v1.10 scoreboard formula + the
  Tauri UI helpers; v1.12 is the
  handoff for the §16 design)
- [`agent-harness-integration-v1-11.md`](./agent-harness-integration-v1-11.md)
  (the v1.11 per-3-tuple wiring helper;
  v1.12 is the handoff for the §17
  design)
- [`agent-harness-integration-v1-13.md`](./agent-harness-integration-v1-13.md)
  (the v1.13 per-peer projection
  helper; v1.12 is the handoff for the
  §18 design)
- [`taui-agent-routing-settings.md`](./taui-agent-routing-settings.md)
  (the Tauri design doc; v1.12 adds the
  next section)
- [`chain-scoreboard.ts`](../../apps/node/src/chain-scoreboard.ts)
  (the v1.10 + v1.11 + v1.13 backend
  helpers; the Tauri team calls these
  via the orchestrator's introspection
  API)

## Locked decisions (2026-08-21)

| # | Question | Locked answer |
|---|---|---|
| **Q1** | Tauri UI surface | **Chain report panel** (a future Tauri panel; not in the chat surface) |
| **Q2** | Backend exposure | **Tauri team calls the v1.10 + v1.11 + v1.13 helpers via the orchestrator's introspection API** (the existing pattern) |
| **Q3** | User-friendly labels | **Tauri team owns the label copy** (per the v1.10 §16 + v1.11 §17 + v1.13 §18 + v1.14 §19 design docs) |
| **Q4** | Data refresh | **Tauri team owns the refresh logic** (when the `ArbitrationStore` updates, the panel re-fetches) |
| **Q5** | Test scope | **No new tests** (v1.12 is design-only; the backend is already tested) |
| **Q6** | Sub-chunk granularity | **Single commit** (v1.12 is a sub-plan + a Tauri design doc section; no code) |

## Commit log (2026-08-21)

| Commit | Sub-chunk | Description |
|---|---|---|
| (1 commit, user-delegated) | v1.12.1 bundled | 1 commit on `envoy_harness_integration` branch. v1.12.1: this sub-plan doc + the Tauri design doc §20 (Tauri-team handoff for the scoreboard badge UI; the chain report panel; the backend exposure pattern) + the parent doc change log entry + the v1.10 + v1.11 + v1.13 status notes. No new tests (design-only; the backend is already tested). |

**Total:** 1 commit, no new tests, 278 pre-existing tests regression-clean. No new type errors.

## What landed in v1.12 (key file references)

**Docs:**
- `docs/agent-harness-integration-v1-12.md` (NEW) — this sub-plan + DONE stamp
- `docs/agent-harness-integration.md` — change log entry
- `docs/agent-harness-integration-v1-10.md` — v1.12 status note (v1.12 is the Tauri-team handoff for the v1.10 scoreboard UI)
- `docs/agent-harness-integration-v1-11.md` — v1.12 status note (v1.12 is the Tauri-team handoff for the v1.11 per-3-tuple wiring)
- `docs/agent-harness-integration-v1-13.md` — v1.12 status note (v1.12 is the Tauri-team handoff for the v1.13 per-peer projection)
- `docs/taui-agent-routing-settings.md` — §20 (Tauri-team handoff for the scoreboard UI; the chain report panel; the backend exposure pattern; the data refresh)

**Tauri UI implementation:** out of scope (the Tauri team's work).
