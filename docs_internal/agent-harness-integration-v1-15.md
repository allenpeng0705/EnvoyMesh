# envoy-harness integration — v1.15 sub-plan (Tauri UI for the per-runtime tag map)

> **Status:** ✅ **DONE** (2026-08-21). 1
> commit on `envoy_harness_integration`
> branch (the user delegates the commit;
> the Tauri UI implementation is the
> Tauri team's work; v1.15 ships the
> sub-plan + the Tauri design doc
> section). No new tests (design-only
> chunk; the backend (v1.9 + v1.14) is
> already tested). No new type errors.
>
> **What this doc covers:** v1.15 in
> **concrete detail** — the backend
> exposure pattern for the Tauri team +
> the Tauri UI design + the design
> questions for team sign-off.
>
> **Order:** Phase 8 v0 + v1.1 + v1.2 + v1.3 +
> v1.4 + v1.5 + v1.6 + v1.7 + v1.8 + v1.9 +
> v1.10 + v1.11 + v1.13 + v1.14 + v1.12
> are done. v1.9 ships the per-runtime
> tag map (the data structure). v1.14
> ships the per-runtime routing extension
> (the consumption). v1.15 ships the
> **Tauri-team handoff** for the
> per-runtime tag map UI panel.

## 1. Goal

**Ship the Tauri-team handoff for the
per-runtime tag map UI panel.** v1.9
ships the data structure
(`extractTagsByRuntime` +
`runtimeTags: Partial<Record<AgentRuntime, ReadonlyArray<string>>>`);
v1.14 ships the router consumption.
v1.15 ships the **Tauri design doc**
that tells the Tauri team what to
build + how to call the backend.

**Why now:** v1.9 + v1.14 ship the
data + the consumption. The Tauri
team needs a design doc to build
the actual UI panel. v1.15 is the
handoff.

**The v1.15 scope:** the sub-plan doc
(this file) + the Tauri design doc
section (§21) that tells the Tauri
team what to build. The actual Tauri
UI implementation is the Tauri team's
work (out of scope for our repo).

## 2. Existing pieces (what we build on)

### 2.1 v1.9 backend helpers

**File:** `apps/node/src/manifest-envoy-harness-tags.ts`

- `extractTagsByRuntime(manifest, runtime): ReadonlyArray<string>` — extracts the union of tags for a given runtime
- `extractEnvoyHarnessTags(manifest)` — deprecation shim (v1.1 wrapper; v1.17 future)
- `extractOpenClawTags(manifest)` — deprecation shim (v1.7 wrapper; v1.17 future)

### 2.2 v1.9 dispatch exposure

**File:** `apps/node/src/node-service-handlers-run-owner-agent-turn.ts:547`

The dispatch's `readManifestView`
returns the per-runtime tag map. v1.15
ships the design for the Tauri team
to read this map + render the
per-runtime tag list.

### 2.3 v1.14 routing consumption

**File:** `apps/node/src/user-prompt-router.ts`

v1.14 consumes the per-runtime tag map
for routing. v1.15 ships the design
for the Tauri team to display the
same map (the per-runtime tag list
visible to the owner).

## 3. Design

### 3.1 The Tauri-team handoff — what to build

The Tauri team builds the **per-runtime
tag map panel** (a future Tauri panel
in the Settings UI). The panel shows:

- For each of the 7 runtimes
  (envoy-harness / openclaw / pi /
  hermes / codex / codex-cli /
  openhuman), the list of tags
  (extracted from the merged manifest)
- A note when a runtime has no tags
  (e.g. "no envoy-harness skills
  installed")
- A read-only display (the owner
  can't edit the manifest from this
  panel; the panel is informational)

### 3.2 The backend exposure pattern

The Tauri team reads the per-runtime
tag map via the dispatch's
`readManifestView` (already exposed).
The Tauri team calls
`extractTagsByRuntime(manifest, runtime)`
for each of the 7 runtimes + builds
the per-runtime tag list display.

The Tauri team is responsible for:
- The actual panel UI (TSX in the
  Tauri monorepo)
- The data refresh (when the manifest
  changes, the panel re-fetches)
- The user-friendly labels (per the
  v1.15 Tauri design section)

### 3.3 No new code

v1.15 doesn't ship new code. The
backend (v1.9 + v1.14) is already
tested. v1.15 is the design doc only.

## 4. Design questions for team sign-off

| # | Question | Default (proposed) | Alternative |
|---|---|---|---|
| **Q1** | Tauri UI surface | **Settings panel (per-runtime tag list display)** | Chat surface (not appropriate; tag list is a config, not a chat) |
| **Q2** | Edit capability | **Read-only** (the owner can't edit the manifest from this panel) | Edit (out of scope; requires a manifest editor) |
| **Q3** | Backend exposure | **Tauri team calls `extractTagsByRuntime` via the orchestrator's introspection API** (the existing pattern) | Add a new Tauri-specific API method (out of scope) |
| **Q4** | User-friendly labels | **Tauri team owns the label copy** | Pre-write the label copy (out of scope) |
| **Q5** | Test scope | **No new tests** (v1.15 is design-only; the backend is already tested) | Add Tauri-side tests (out of scope) |
| **Q6** | Sub-chunk granularity | **Single commit** (v1.15 is a sub-plan + a Tauri design doc section; no code) | N/A |

**Defaults at-default (Q1-Q6):** I have no strong opinion on Q1 (the Settings panel is the natural surface for a config display), Q2 (read-only is the right default; edit requires a manifest editor), Q3 (the existing pattern is sufficient), Q4 (label copy is the Tauri team's call), Q5 (no tests for a design-only chunk), Q6 (single commit is the right granularity).

## 5. Plan

### Sub-chunk v1.15.1 — the sub-plan + Tauri design doc (1 commit)

- New: `docs/agent-harness-integration-v1-15.md` — this sub-plan + DONE stamp.
- Modify: `docs/taui-agent-routing-settings.md` — add §21 (Tauri UI for the per-runtime tag map panel).
- Modify: `docs/agent-harness-integration.md` — add v1.15 status to the change log.
- Modify: `docs/agent-harness-integration-v1-9.md` + `docs/agent-harness-integration-v1-14.md` — v1.15 status note (v1.15 is the Tauri-team handoff for the per-runtime tag map UI).

**Total: 1 sub-chunk, 1 commit at the end of v1.15** (per the v1.4-v1.14 commit pattern).

## 6. Out of scope (deferred)

- **Tauri UI implementation** — the
  Tauri team picks up the actual UI
  implementation. v1.15 ships the
  design + the backend exposure
  pattern.
- **Manifest editor** — the owner
  can't edit the manifest from this
  panel. A future Tauri panel could
  add a manifest editor; out of scope
  for v1.15.

## 7. References

- [`agent-harness-integration-v1-9.md`](./agent-harness-integration-v1-9.md)
  (the v1.9 per-runtime tag map; v1.15
  is the handoff for the Settings panel
  display)
- [`agent-harness-integration-v1-14.md`](./agent-harness-integration-v1-14.md)
  (the v1.14 per-runtime routing; v1.15
  is the handoff for the Settings
  panel display of the same map)
- [`taui-agent-routing-settings.md`](./taui-agent-routing-settings.md)
  (the Tauri design doc; v1.15 adds
  §21)
- [`manifest-envoy-harness-tags.ts`](../../apps/node/src/manifest-envoy-harness-tags.ts)
  (the v1.9 + v1.1 + v1.7 extractors; the
  Tauri team calls `extractTagsByRuntime`
  via the orchestrator's introspection
  API)

## Locked decisions (2026-08-21)

| # | Question | Locked answer |
|---|---|---|
| **Q1** | Tauri UI surface | **Settings panel (per-runtime tag list display)** |
| **Q2** | Edit capability | **Read-only** (the owner can't edit the manifest from this panel) |
| **Q3** | Backend exposure | **Tauri team calls `extractTagsByRuntime` via the orchestrator's introspection API** (the existing pattern) |
| **Q4** | User-friendly labels | **Tauri team owns the label copy** |
| **Q5** | Test scope | **No new tests** (v1.15 is design-only; the backend is already tested) |
| **Q6** | Sub-chunk granularity | **Single commit** (v1.15 is a sub-plan + a Tauri design doc section; no code) |

## Commit log (2026-08-21)

| Commit | Sub-chunk | Description |
|---|---|---|
| (1 commit, user-delegated) | v1.15.1 bundled | 1 commit on `envoy_harness_integration` branch. v1.15.1: this sub-plan doc + the Tauri design doc §21 (Tauri-team handoff for the per-runtime tag map UI panel) + the parent doc change log entry + the v1.9 + v1.14 status notes. No new tests (design-only; the backend is already tested). |

**Total:** 1 commit, no new tests, 278 pre-existing tests regression-clean. No new type errors.

## What landed in v1.15 (key file references)

**Docs:**
- `docs/agent-harness-integration-v1-15.md` (NEW) — this sub-plan + DONE stamp
- `docs/agent-harness-integration.md` — change log entry
- `docs/agent-harness-integration-v1-9.md` — v1.15 status note (v1.15 is the Tauri-team handoff for the v1.9 per-runtime tag map)
- `docs/agent-harness-integration-v1-14.md` — v1.15 status note (v1.15 is the Tauri-team handoff for the v1.14 routing consumption)
- `docs/taui-agent-routing-settings.md` — §21 (Tauri-team handoff for the per-runtime tag map UI panel; the backend exposure pattern; the data refresh)

**Tauri UI implementation:** out of scope (the Tauri team's work).
