# envoy-harness integration — v1.9 sub-plan (per-runtime tags — Pi, Hermes, Codex, OpenHuman)

> **Status:** ✅ **DONE** (2026-08-21). 1 commit on
> `envoy_harness_integration` branch (the user
> delegated commit; bundled v1.9.1 + v1.9.2 +
> v1.9.3 into a single commit at the end of
> v1.9). 18 new tests (12 `extractTagsByRuntime`
> unit + 6 `runtimeTags` router unit) + 246
> pre-existing tests regression-clean on the
> affected paths. No new type errors
> (pre-existing multiformats/ArrayBuffer
> conflict in `packages/network/src/index.ts:2791`
> unchanged).
>
> **What this doc covers:** v1.9 in **concrete
> detail** — every file path, every type, every
> test, every commit boundary, and the design
> questions for team sign-off.
>
> **What this doc covers:** v1.9 in **concrete
> detail** — every file path, every type, every
> test, every commit boundary, and the design
> questions for team sign-off.
>
> **Order:** Phase 8 v0 + v1.1 + v1.2 + v1.3 +
> v1.4 + v1.5 + v1.6 + v1.7 + v1.8 are done. v1.9
> generalizes the **per-runtime tag extraction**
> to support ALL `AgentRuntime` values (not just
> `envoy-harness` + `openclaw`). v1.9 is a
> **foundation chunk** — it doesn't change the
> v1.x routing behavior (only envoy-harness +
> openclaw are in the routing path), but it
> sets up the data structure for future
> per-runtime routing (when v1.x starts
> routing to pi / hermes / codex / openhuman).

## 1. Goal

**The manifest's per-runtime tag lists are
extracted for ALL `AgentRuntime` values, not
just envoy-harness + openclaw.** v1.9 is a
**foundation chunk** — the router still uses
only the envoy-harness + openclaw tag lists
(v1.1 + v1.7 behavior, preserved). The other
runtime tag lists (pi, hermes, codex,
codex-cli, openhuman) are extracted but not
yet consumed by the router. Future chunks
(v1.9+ or later) will use them when v1.x
extends the routing to support more runtimes.

**Why now (the v1 backlog says
"Per-runtime tags — Ext, Pi"):** the v1.1
extractor (`extractEnvoyHarnessTags`) and the
v1.7 extractor (`extractOpenClawTags`) are
duplicated functions. v1.9 unifies them into
a single `extractTagsByRuntime(manifest,
runtime)` helper. The v1.1 + v1.7 callers
migrate to the new helper; the other runtimes
gain their own tag lists for future use.

**The v1.x scope:** v1.9 ships the data
structure. The actual per-runtime routing
extension (when v1.x starts routing to pi /
hermes / codex / openhuman) is a v1.9+ future.
v1.9 just makes the data available.

## 2. Existing pieces (what we build on)

### 2.1 v1.1 `extractEnvoyHarnessTags`

**File:** `apps/node/src/manifest-envoy-harness-tags.ts:68-79`

The v1.1 extractor filters the manifest by
`runtime === "envoy-harness"` and returns the
union of tags:

```ts
export function extractEnvoyHarnessTags(
  manifest: NodeManifest,
): ReadonlyArray<string> {
  const tags = new Set<string>();
  for (const skill of manifest.skills) {
    if (skill.runtime !== "envoy-harness") continue;
    for (const tag of skill.tags) {
      tags.add(tag);
    }
  }
  return [...tags];
}
```

**The v1.9 change:** generalize to
`extractTagsByRuntime(manifest, runtime)`. The
v1.1 caller migrates to
`extractTagsByRuntime(manifest, "envoy-harness")`.

### 2.2 v1.7 `extractOpenClawTags`

**File:** `apps/node/src/manifest-envoy-harness-tags.ts:127-141` (added in v1.7)

The v1.7 extractor is parallel to the v1.1
extractor, filtered by `runtime === "openclaw"`.
The v1.9 change migrates the v1.7 caller to
`extractTagsByRuntime(manifest, "openclaw")`.

### 2.3 The dispatch

**File:** `apps/node/src/node-service-handlers-run-owner-agent-turn.ts:469-499`

The `readManifestView` function returns:
- `tags: ReadonlyArray<string>` (envoy-harness tags, for the v1.1 positive rule)
- `skills: ReadonlyArray<EnvoyHarnessSkillEntry>` (envoy-harness skills, for the v1.2 per-skill matching)
- `openClawTags: ReadonlyArray<string>` (openclaw tags, for the v1.7 negative rule)

**The v1.9 change:** the v1.9 view also
includes the per-runtime tag list for ALL
runtimes (a `Record<AgentRuntime, ReadonlyArray<string>>`).
The v1.1 + v1.7 callers migrate to read from
this map. The other runtimes' tag lists are
available for future consumers.

### 2.4 The router

**File:** `apps/node/src/user-prompt-router.ts:303-322`

The v1.1 + v1.7 router takes:
- `envoyHarnessTags?: ReadonlyArray<string>` (v1.1 — positive signal vocabulary)
- `envoyHarnessSkills?: ReadonlyArray<EnvoyHarnessSkillEntry>` (v1.2 — per-skill matching)
- `openClawTags?: ReadonlyArray<string>` (v1.7 — negative signal vocabulary)

**The v1.9 change:** the v1.9 router gains
`runtimeTags?: Partial<Record<AgentRuntime, ReadonlyArray<string>>>`
(the per-runtime tag map). The v1.1 + v1.7
callers migrate to read from this map (the
v1.9 helper extracts `envoyHarnessTags` +
`openClawTags` from the map). The other
runtimes' tag lists are available for future
consumers.

**Why `Partial<Record>`:** the router only
consumes the runtimes it routes to (EH +
OpenClaw for v1.x). The per-runtime map is
optional — callers can pass only the runtimes
they care about. The other runtimes' tag
lists are still extracted (for future use)
but not consumed by the router.

## 3. Design

### 3.1 The generic extractor

**File:** `apps/node/src/manifest-envoy-harness-tags.ts`
(modify)

```ts
/**
 * Phase 8 / v1.9 — extract the union of
 * `tags[]` across all skills of a given
 * `AgentRuntime` in the merged manifest.
 * Generalizes the v1.1 `extractEnvoyHarnessTags`
 * + the v1.7 `extractOpenClawTags` into a
 * single function.
 *
 * **Why a single function (not per-runtime
 * extractors):** the algorithm is identical
 * across runtimes; the only difference is the
 * `runtime` filter. A single function with a
 * parameter is DRY and easier to test.
 *
 * **Empty result handling:** when the
 * manifest has no skills of the given runtime,
 * the returned array is empty. The router
 * treats `[]` as "no tag-based signals" (Q8 of
 * the v1.1 sub-plan; the v1.9 equivalent).
 *
 * **Order:** insertion order is the order in
 * which tags are first seen in `manifest.skills`.
 * The router doesn't depend on order.
 *
 * @param manifest The merged node manifest
 *   (typically from `NodeServiceImpl.getNodeManifest()`).
 * @param runtime The runtime to filter by
 *   (`AgentRuntime` — one of "envoy-harness",
 *   "openclaw", "pi", "hermes", "codex",
 *   "codex-cli", "openhuman").
 * @returns The deduplicated union of skills'
 *   tags for the given runtime (read-only).
 */
export function extractTagsByRuntime(
  manifest: NodeManifest,
  runtime: AgentRuntime,
): ReadonlyArray<string> {
  const tags = new Set<string>();
  for (const skill of manifest.skills) {
    if (skill.runtime !== runtime) continue;
    for (const tag of skill.tags) {
      tags.add(tag);
    }
  }
  return [...tags];
}
```

The v1.1 + v1.7 callers migrate:

```ts
// v1.1 (before):
tags: extractEnvoyHarnessTags(manifest),

// v1.9 (after):
tags: extractTagsByRuntime(manifest, "envoy-harness"),
```

```ts
// v1.7 (before):
openClawTags: extractOpenClawTags(manifest),

// v1.9 (after):
openClawTags: extractTagsByRuntime(manifest, "openclaw"),
```

The v1.1 + v1.7 wrapper functions
(`extractEnvoyHarnessTags` +
`extractOpenClawTags`) are kept as
**deprecation shims** (one-liner wrappers
around `extractTagsByRuntime`) for
backward compat with any external callers
(Q10 of the v1.9 sub-plan). They can be
removed in a v1.9+ future.

### 3.2 The dispatch — per-runtime tag map

**File:** `apps/node/src/node-service-handlers-run-owner-agent-turn.ts:469-499`
(modify)

The `readManifestView` function returns a
`runtimeTags` field (a `Partial<Record<AgentRuntime, ReadonlyArray<string>>>`):

```ts
function readManifestView(
  ctx: RunOwnerAgentTurnContext,
): {
  tags: ReadonlyArray<string> | undefined;
  skills: ReadonlyArray<EnvoyHarnessSkillEntry> | undefined;
  openClawTags: ReadonlyArray<string> | undefined;
  /**
   * Phase 8 / v1.9 — per-runtime tag map.
   * Each runtime's tag list (the v1.1
   * `extractEnvoyHarnessTags` + v1.7
   * `extractOpenClawTags` + the new
   * per-runtime tag lists for pi, hermes,
   * codex, codex-cli, openhuman). The router
   * consumes only the EH + OpenClaw tag
   * lists (v1.x routing path); the other
   * runtimes' tag lists are available for
   * future consumers.
   */
  runtimeTags: Partial<Record<AgentRuntime, ReadonlyArray<string>>>;
} {
  let manifest: NodeManifest | undefined;
  try {
    manifest = ctx.getNodeManifest();
  } catch (err) {
    console.warn(...);
    return { tags: undefined, skills: undefined, openClawTags: undefined, runtimeTags: {} };
  }
  if (manifest === undefined) {
    return { tags: undefined, skills: undefined, openClawTags: undefined, runtimeTags: {} };
  }
  return {
    tags: extractTagsByRuntime(manifest, "envoy-harness"),
    skills: extractEnvoyHarnessSkills(manifest),
    openClawTags: extractTagsByRuntime(manifest, "openclaw"),
    // v1.9 — extract tags for ALL runtimes.
    // The router only consumes EH + OpenClaw
    // for v1.x; the other runtimes' tag lists
    // are available for future consumers.
    runtimeTags: {
      "envoy-harness": extractTagsByRuntime(manifest, "envoy-harness"),
      "openclaw": extractTagsByRuntime(manifest, "openclaw"),
      "pi": extractTagsByRuntime(manifest, "pi"),
      "hermes": extractTagsByRuntime(manifest, "hermes"),
      "codex": extractTagsByRuntime(manifest, "codex"),
      "codex-cli": extractTagsByRuntime(manifest, "codex-cli"),
      "openhuman": extractTagsByRuntime(manifest, "openhuman"),
    },
  };
}
```

The v1.9 dispatch threads the per-runtime
tag map to the router:

```ts
const decision = routeUserPrompt({
  prompt: agentMessage,
  isEnvoyHarnessReady: ctx.isEnvoyHarnessReady(),
  envoyHarnessUnreadyReason: undefined,
  signalOptIn: ctx.signalOptIn,
  envoyHarnessTags: manifestView.tags,
  envoyHarnessSkills: manifestView.skills,
  openClawTags: manifestView.openClawTags,
  // v1.9 — per-runtime tag map. The router
  // uses `runtimeTags["envoy-harness"]` +
  // `runtimeTags["openclaw"]` for the v1.1
  // + v1.7 routing decisions. The other
  // runtimes' tag lists are available for
  // future consumers.
  runtimeTags: manifestView.runtimeTags,
});
```

### 3.3 The router — `runtimeTags` field

**File:** `apps/node/src/user-prompt-router.ts:303-322`
(modify)

The `RouteUserPromptInput` interface gains a
`runtimeTags?` field:

```ts
export interface RouteUserPromptInput {
  // ... existing fields ...
  /**
   * Phase 8 / v1.9 — per-runtime tag map.
   * Each runtime's tag list (the v1.1 +
   * v1.7 + v1.9 tag lists). The router uses
   * `runtimeTags["envoy-harness"]` for the
   * v1.1 positive rule + `runtimeTags["openclaw"]`
   * for the v1.7 negative rule. The other
   * runtimes' tag lists are available for
   * future consumers.
   *
   * **Why a `Partial<Record>`:** the router
   * only consumes the runtimes it routes to
   * (EH + OpenClaw for v1.x). The per-runtime
   * map is optional — callers can pass only
   * the runtimes they care about. The other
   * runtimes' tag lists are still extracted
   * (for future use) but not consumed by the
   * router.
   *
   * **When `undefined`:** the router uses
   * `envoyHarnessTags` + `openClawTags`
   * independently (the v1.8 behavior,
   * preserved for backward compat).
   */
  runtimeTags?: Partial<Record<AgentRuntime, ReadonlyArray<string>>>;
}
```

The router's signal scan uses
`runtimeTags["envoy-harness"]` (falling back
to `envoyHarnessTags` for backward compat):

```ts
// In the v1.1 + v1.9 router:
const envoyHarnessVocabulary =
  input.runtimeTags?.["envoy-harness"] ??
  input.envoyHarnessTags;
// Use `envoyHarnessVocabulary` for the
// positive-signal scan.
```

The router's negative-signal scan (v1.7)
uses `runtimeTags["openclaw"]` (falling back
to `openClawTags` for backward compat):

```ts
const openClawVocabulary =
  input.runtimeTags?.["openclaw"] ??
  input.openClawTags;
// Use `openClawVocabulary` for the
// negative-signal scan.
```

### 3.4 The migration

The v1.9 migration is:
- `extractEnvoyHarnessTags` → `extractTagsByRuntime(manifest, "envoy-harness")` (the v1.1 callers)
- `extractOpenClawTags` → `extractTagsByRuntime(manifest, "openclaw")` (the v1.7 callers)
- The `readManifestView` returns the new `runtimeTags` map
- The `RouteUserPromptInput` gains the new `runtimeTags?` field

The v1.1 + v1.7 wrapper functions are kept as
**deprecation shims** (one-liner wrappers
around `extractTagsByRuntime`) for backward
compat. They can be removed in a v1.9+ future
(Q10).

### 3.5 Test strategy

**Unit tests in `manifest-envoy-harness-tags.test.ts` (new file or modify existing):**

- `extractTagsByRuntime(manifest, "envoy-harness")` returns the v1.1 result (existing tests)
- `extractTagsByRuntime(manifest, "openclaw")` returns the v1.7 result (existing tests)
- `extractTagsByRuntime(manifest, "pi")` returns the union of tags from pi skills
- `extractTagsByRuntime(manifest, "hermes")` returns the union of tags from hermes skills
- `extractTagsByRuntime(manifest, "codex")` returns the union of tags from codex skills
- `extractTagsByRuntime(manifest, "codex-cli")` returns the union of tags from codex-cli skills
- `extractTagsByRuntime(manifest, "openhuman")` returns the union of tags from openhuman skills
- `extractTagsByRuntime(manifest, "pi")` excludes non-pi skills
- `extractTagsByRuntime(manifest, "pi")` deduplicates tags across skills
- `extractTagsByRuntime(manifest, "pi")` returns `[]` when the manifest has no pi skills
- `extractEnvoyHarnessTags` (deprecation shim) still returns the v1.1 result
- `extractOpenClawTags` (deprecation shim) still returns the v1.7 result

**Unit tests in `user-prompt-router.test.ts` (modify):**

- The v1.1 positive rule uses `runtimeTags["envoy-harness"]` when `runtimeTags` is provided
- The v1.1 positive rule falls back to `envoyHarnessTags` when `runtimeTags` is undefined
- The v1.7 negative rule uses `runtimeTags["openclaw"]` when `runtimeTags` is provided
- The v1.7 negative rule falls back to `openClawTags` when `runtimeTags` is undefined
- `runtimeTags["pi"]` doesn't change the routing behavior in v1.x (consumed by future chunks)

**E2E tests in `run-owner-agent-turn-routing.test.ts` (modify):**

- The dispatch threads `runtimeTags` to the router
- The v1.1 + v1.7 behavior is preserved when `runtimeTags` is provided (the manifest has EH + OpenClaw skills)
- The v1.1 + v1.7 behavior is preserved when `runtimeTags` is NOT provided (backward compat)

## 4. Design questions for team sign-off

> These are the choices that need a decision
> before implementation starts. **Defaults
> proposed in bold**; flip if you disagree.

| # | Question | Default (proposed) | Alternative |
|---|---|---|---|
| **Q1** | Extractor API | **`extractTagsByRuntime(manifest, runtime)`** — single function with a runtime parameter | Per-runtime extractors (`extractPiTags`, `extractHermesTags`, etc.) — duplicates the algorithm |
| **Q2** | Per-runtime tag map shape | **`Partial<Record<AgentRuntime, ReadonlyArray<string>>>`** — the host extracts tags for all runtimes; the router consumes only the runtimes it routes to | `Map<AgentRuntime, ReadonlyArray<string>>` — same content, different type (less idiomatic in this codebase) |
| **Q3** | v1.1 + v1.7 wrapper functions | **Keep as deprecation shims** (one-liner wrappers around `extractTagsByRuntime`) for backward compat | Remove them (the v1.1 + v1.7 callers migrate; any external callers break) |
| **Q4** | Router field name | **`runtimeTags`** (per-runtime tag map) | `runtimeTagsByRuntime` (more explicit, but verbose) |
| **Q5** | Router fallback when `runtimeTags` is undefined | **Use `envoyHarnessTags` + `openClawTags` independently** (the v1.8 behavior, preserved for backward compat) | Throw an error (the v1.9 host always provides the map) |
| **Q6** | Per-runtime routing extension | **Out of scope (v1.9+ future)** — v1.9 ships the data structure; the actual per-runtime routing (when v1.x starts routing to pi / hermes / codex / openhuman) is a v1.9+ chunk | Bundle the per-runtime routing in v1.9 (would require extending the router + dispatch to support more runtimes) |
| **Q7** | Backward compat (Tauri UI) | **No UI change** — the Tauri UI is unchanged (the v1.1 + v1.7 behavior is preserved; the other runtimes' tag lists are not exposed in v1.x) | Add a Tauri UI section for the per-runtime tag map (for future per-runtime routing) |
| **Q8** | Tauri UI scope | **Backend + design doc only** (consistent with v1.4-v1.8) | Bundle the Tauri UI work in this chunk |
| **Q9** | Migration of the v1.1 + v1.7 callers | **In-place** (the v1.1 + v1.7 callers migrate to the new helper in the same commit) | Step-by-step (deprecate the old helpers in v1.9, remove in v1.9+ future) |
| **Q10** | Wrapper removal | **v1.9+ future** (the deprecation shims can be removed when all callers have migrated) | v1.9 itself (the wrappers are removed in the same commit as the migration) |

**Defaults at-default (Q1-Q10):** I have no
strong opinion on Q1 (DRY function with a
parameter is the standard pattern; per-runtime
extractors are duplicates), Q2 (`Partial<Record>`
is the codebase-idiomatic type; `Map` is less
common), Q3 (deprecation shims are the standard
migration pattern; breaking changes are riskier),
Q4 (`runtimeTags` is concise; the type annotation
makes the per-runtime nature clear), Q5
(backward compat is the safest default; throwing
breaks existing callers), Q6 (the per-runtime
routing extension is a significant design
change; v1.9 just lays the foundation), Q7 (no
UI change for v1.x; the per-runtime tag map is
internal), Q8 (consistent with v1.4-v1.8), Q9
(in-place is simpler; the migration is small),
Q10 (deprecation shims allow external callers
to migrate; the v1.9+ future removal is a
breaking change that's easier to coordinate
with a release).

## 5. Plan

### Sub-chunk v1.9.1 — generic extractor + per-runtime tag map (1 commit)

- Modify: `apps/node/src/manifest-envoy-harness-tags.ts` —
  add `extractTagsByRuntime(manifest, runtime)`
  function. Keep `extractEnvoyHarnessTags` +
  `extractOpenClawTags` as deprecation shims.
- Modify: `apps/node/src/node-service-handlers-run-owner-agent-turn.ts` —
  `readManifestView` returns the new `runtimeTags`
  field (a `Partial<Record<AgentRuntime, ReadonlyArray<string>>>`).
  The v1.1 + v1.7 callers migrate to use the
  per-runtime map.
- New: `apps/node/test/manifest-envoy-harness-tags.test.ts`
  additions — ~12 unit tests for
  `extractTagsByRuntime` (each runtime + edge
  cases + deprecation shim tests).

### Sub-chunk v1.9.2 — router integration + e2e tests (1 commit)

- Modify: `apps/node/src/user-prompt-router.ts` —
  add `runtimeTags?` field on
  `RouteUserPromptInput`. The v1.1 + v1.7
  callers use `runtimeTags["envoy-harness"]` +
  `runtimeTags["openclaw"]` (falling back to
  the old `envoyHarnessTags` + `openClawTags`
  for backward compat).
- New: `apps/node/test/user-prompt-router.test.ts`
  additions — ~5 unit tests for the v1.9
  router (runtimeTags consumption + fallback
  for each rule).
- New: `apps/node/test/run-owner-agent-turn-routing.test.ts`
  additions — ~3 e2e tests for the v1.9
  dispatch (runtimeTags threading + backward
  compat).

### Sub-chunk v1.9.3 — Tauri UI design doc + closeout (1 commit)

- Modify: `docs/taui-agent-routing-settings.md` —
  §15 (per-runtime tag map design; v1.9 is
  a foundation chunk; the per-runtime routing
  extension is v1.9+ future).
- Modify: `docs/agent-harness-integration.md` —
  add v1.9 status to the change log.
- Modify: `docs/agent-network-engine.md` —
  §3.2.2 (per-runtime tag extraction status
  update).
- Modify: `docs/agent-harness-integration-v1-1.md` —
  v1.9 status note (v1.9 generalizes the
  v1.1 extractor to all runtimes).
- Modify: `docs/agent-harness-integration-v1-7.md` —
  v1.9 status note (v1.9 generalizes the
  v1.7 extractor to all runtimes).
- Modify: `docs/agent-harness-integration-v1-8.md` —
  v1.9 status note (v1.9 lays the foundation
  for future per-runtime routing).
- New: `docs/agent-harness-integration-v1-9.md` —
  this doc gets the "DONE" stamp.

**Total: 3 sub-chunks, bundled into 1 commit
at the end of v1.9** (per the v1.1-v1.8 commit
pattern). On `envoy_harness_integration` branch.

## 6. Out of scope (deferred)

- **Per-runtime routing extension** (when v1.x
  starts routing to pi / hermes / codex /
  openhuman) — v1.9+ future. v1.9 ships the
  data structure; the actual per-runtime
  routing requires extending the router +
  the dispatch + the per-runtime adapter
  construction (significant design change).
- **Tauri UI for the per-runtime tag map**
  (Q8 default) — the Tauri team picks up the
  per-runtime UI in their workstream when the
  per-runtime routing extension lands. v1.9
  ships the backend + a design doc.
- **Removal of the v1.1 + v1.7 wrapper
  functions** (Q10 default) — the deprecation
  shims can be removed when all callers have
  migrated. v1.9+ future.
- **Per-runtime model families** (v1.9+ future)
  — the v1.8 `MODEL_FAMILY` table is
  hardcoded; v1.9+ could derive the model
  family from the per-runtime tag map (e.g.
  each runtime has a `modelFamily` tag).
  v1.9 doesn't change v1.8.

## 7. References

- [`agent-harness-integration.md`](./agent-harness-integration.md)
  (the design — Q1 routing, Q5 node config)
- [`agent-harness-integration-v1-1.md`](./agent-harness-integration-v1-1.md)
  (v1.1 `extractEnvoyHarnessTags` — v1.9
  generalizes the v1.1 extractor to all runtimes)
- [`agent-harness-integration-v1-7.md`](./agent-harness-integration-v1-7.md)
  (v1.7 `extractOpenClawTags` — v1.9
  generalizes the v1.7 extractor to all runtimes)
- [`agent-harness-integration-v1-8.md`](./agent-harness-integration-v1-8.md)
  (v1.8 `MODEL_FAMILY` table — v1.9 lays the
  foundation for per-runtime routing; the
  model family table is independent)
- [`manifest-envoy-harness-tags.ts`](../../apps/node/src/manifest-envoy-harness-tags.ts)
  (the v1.1 + v1.7 extractors; v1.9 adds the
  generic `extractTagsByRuntime` function)
- [`user-prompt-router.ts`](../../apps/node/src/user-prompt-router.ts)
  (the v1.1 + v1.2 + v1.5 + v1.6 + v1.7 + v1.8
  router; v1.9 adds the `runtimeTags?` field)
- [`node-service-handlers-run-owner-agent-turn.ts`](../../apps/node/src/node-service-handlers-run-owner-agent-turn.ts)
  (the v1.4 + v1.5 + v1.6 + v1.7 + v1.8
  dispatch; v1.9 extends `readManifestView`
  with the per-runtime tag map)
- [`taui-agent-routing-settings.md`](./taui-agent-routing-settings.md)
  (the Tauri UI design doc — v1.9 adds the
  per-runtime tag map section)

## Locked decisions (2026-08-21)

| # | Question | Locked answer |
|---|---|---|
| **Q1** | Extractor API | **`extractTagsByRuntime(manifest, runtime)`** — single function with a runtime parameter |
| **Q2** | Per-runtime tag map shape | **`Partial<Record<AgentRuntime, ReadonlyArray<string>>>`** |
| **Q3** | v1.1 + v1.7 wrapper functions | **Keep as deprecation shims** (one-liner wrappers around `extractTagsByRuntime`) |
| **Q4** | Router field name | **`runtimeTags`** (per-runtime tag map) |
| **Q5** | Router fallback when `runtimeTags` is undefined | **Use `envoyHarnessTags` + `openClawTags` independently** (the v1.8 behavior, preserved) |
| **Q6** | Per-runtime routing extension | **Out of scope (v1.9+ future)** — v1.9 ships the data structure only |
| **Q7** | Backward compat (Tauri UI) | **No UI change** — the Tauri UI is unchanged for v1.x |
| **Q8** | Tauri UI scope | **Backend + design doc only** (consistent with v1.4-v1.8) |
| **Q9** | Migration of the v1.1 + v1.7 callers | **In-place** (the v1.1 + v1.7 callers migrate to the new helper in the same commit) |
| **Q10** | Wrapper removal | **v1.9+ future** (the deprecation shims can be removed when all callers have migrated) |

## Commit log (2026-08-21)

| Commit | Sub-chunk | Description |
|---|---|---|
| (1 commit, user-delegated) | v1.9.1 + v1.9.2 + v1.9.3 bundled | 1 commit on `envoy_harness_integration` branch. v1.9.1: new `extractTagsByRuntime(manifest, runtime)` function in `manifest-envoy-harness-tags.ts` (generalizes the v1.1 + v1.7 extractors) + the v1.1 `extractEnvoyHarnessTags` + v1.7 `extractOpenClawTags` wrappers are kept as deprecation shims (one-liner wrappers around the new generic helper) + 12 new unit tests for `extractTagsByRuntime` (each runtime + edge cases + deprecation shim tests). v1.9.2: `RouteUserPromptInput` gains a `runtimeTags?: Partial<Record<AgentRuntime, ReadonlyArray<string>>>` field. The v1.1 + v1.7 callers read from `runtimeTags["envoy-harness"]` + `runtimeTags["openclaw"]` (with fallback to the old `envoyHarnessTags` + `openClawTags` fields for backward compat). The dispatch's `readManifestView` function returns the per-runtime tag map. 6 new router unit tests for the `runtimeTags` consumption + fallback. v1.9.3: doc closeout (this DONE stamp + `agent-harness-integration.md` change log entry + status notes on `agent-harness-integration-v1-1.md` + `agent-harness-integration-v1-7.md` + `agent-harness-integration-v1-8.md` + `taui-agent-routing-settings.md` §15). |

**Total:** 1 commit, 18 new tests (12 + 6), 246 pre-existing tests regression-clean on the affected paths. No new type errors.

## What landed in v1.9 (key file references)

**Backend (Node side):**
- `apps/node/src/manifest-envoy-harness-tags.ts` — new `extractTagsByRuntime(manifest, runtime)` function + the v1.1 `extractEnvoyHarnessTags` + v1.7 `extractOpenClawTags` wrappers are now deprecation shims (one-liner wrappers around the new generic helper)
- `apps/node/src/user-prompt-router.ts` — new `runtimeTags?: Partial<Record<AgentRuntime, ReadonlyArray<string>>>` field on `RouteUserPromptInput` + the v1.1 + v1.7 callers read from `runtimeTags["envoy-harness"]` + `runtimeTags["openclaw"]` (with fallback to the old fields for backward compat)
- `apps/node/src/node-service-handlers-run-owner-agent-turn.ts` — `readManifestView` returns the new `runtimeTags` field (a `Partial<Record<AgentRuntime, ReadonlyArray<string>>>` map) + threads the field to `routeUserPrompt`

**Tests:**
- `apps/node/test/manifest-openclaw-tags.test.ts` — 12 new unit tests for `extractTagsByRuntime` (each runtime + edge cases + deprecation shim tests)
- `apps/node/test/user-prompt-router.test.ts` — 6 new unit tests for the `runtimeTags` consumption + fallback

**Docs:**
- `docs/agent-harness-integration-v1-9.md` (NEW) — this sub-plan + DONE stamp
- `docs/agent-harness-integration.md` — change log entry
- `docs/agent-network-engine.md` — status update (v1.9 is a foundation chunk)
- `docs/agent-harness-integration-v1-1.md` — v1.9 status note (v1.9 generalizes the v1.1 extractor)
- `docs/agent-harness-integration-v1-7.md` — v1.9 status note (v1.9 generalizes the v1.7 extractor)
- `docs/agent-harness-integration-v1-8.md` — v1.9 status note (v1.9 lays the foundation for future per-runtime routing)
- `docs/taui-agent-routing-settings.md` — §15 (per-runtime tag map design; v1.9 is a foundation chunk)

## v1.10 status note (2026-08-21)

v1.10 builds on the v1.9 per-runtime tag map:
the runtimes that produce verdicts (the
verifier source) are the same runtimes whose tag
lists v1.9 extracted. v1.10's
`SCOREBOARD_SOURCE_WEIGHTS` table
(`apps/node/src/chain-scoreboard.ts`) is keyed by
`VerifierSource` — and the v1.9 `runtimeTags` map
is the input the v1.10 orchestrator handler will
use to filter verdicts by runtime for the 3-tuple
reputation book. v1.10 ships the formula + Tauri
UI helper (foundation chunk); the actual wiring
into the orchestrator's verdict-history reads is
v1.10+ future.

**Why the foundation chunk matters for v1.9:**
v1.9 made the per-runtime tag map available; v1.10
consumes the per-runtime tag map's "what verdicts
exist for this runtime" answer. v1.9+ future
(per-runtime routing) will then use the v1.9
runtime tag list as the routing vocabulary, and
the v1.10 score as the routing-weight input. The
two are independent: v1.10 doesn't change v1.9;
v1.9 doesn't change v1.10. They compose cleanly
because the per-runtime data structure v1.9 ships
is exactly the per-runtime data the v1.10
formula's caller (a future orchestrator handler)
needs.
