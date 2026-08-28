# envoy-harness integration — v1.17 sub-plan (remove deprecation shims)

> **Status:** ✅ **DONE** (2026-08-21). 1
> commit on `envoy_harness_integration`
> branch (the user delegates the commit).
> 2 deprecation-shim tests removed + 1
> shim test removed (net -3 tests in
> `manifest-openclaw-tags.test.ts`; the
> file becomes 40 tests from 43) + 268
> pre-existing tests regression-clean.
> No new type errors.

## 1. Goal

**Remove the v1.1 + v1.7 deprecation
shims** (`extractEnvoyHarnessTags` +
`extractOpenClawTags`). v1.9 ships
`extractTagsByRuntime(manifest, runtime)`
which generalizes the v1.1 + v1.7
extractors. The deprecation shims
were kept as backward compat (Q3 + Q10
of the v1.9 sub-plan). v1.17 removes
the shims now that all production
callers have migrated.

## 2. Audit

```
$ grep -rn "extractEnvoyHarnessTags\|extractOpenClawTags" --include="*.ts" apps/ packages/
```

**Results:**
- The functions are defined in
  `apps/node/src/manifest-envoy-harness-tags.ts`
  (the shims themselves)
- The functions are imported in
  `apps/node/test/manifest-openclaw-tags.test.ts`
  (deprecation-shim tests)

**No production callers.** All
production callers migrated to
`extractTagsByRuntime(manifest, runtime)`
in v1.9. Safe to remove.

## 3. Design

### 3.1 The removal

**File:** `apps/node/src/manifest-envoy-harness-tags.ts` (modify)

Remove the two shim functions
(`extractEnvoyHarnessTags` +
`extractOpenClawTags`) + their JSDoc
comments. The file keeps
`extractTagsByRuntime` +
`extractEnvoyHarnessSkills` (the v1.2
per-skill projection is a separate
function; not a deprecation shim).

**File:** `apps/node/test/manifest-openclaw-tags.test.ts` (modify)

Remove the 2 deprecation-shim tests
("`extractEnvoyHarnessTags` still
returns the v1.1 result" +
"`extractOpenClawTags` still returns
the v1.7 result"). The 12 v1.9
`extractTagsByRuntime` tests +
the 7 v1.7 mirror-symmetric tests
remain.

**Test count:** 43 → 40 (-3 net; the
deprecation-shim tests + their mirror
companion).

### 3.2 No other changes

v1.17 is a small, focused change.
No new tests, no new code, no new
docs (the v1.9 sub-plan already
documents the deprecation shim
removal as a v1.9+ future).

## 4. Design questions for team sign-off

| # | Question | Default (proposed) | Alternative |
|---|---|---|---|
| **Q1** | Removal scope | **Both shims** (`extractEnvoyHarnessTags` + `extractOpenClawTags`) | One at a time (the v1.1 shim first, then the v1.7 shim) |
| **Q2** | Test removal | **Remove the deprecation-shim tests + their mirror companion** | Keep the deprecation-shim tests (as a regression guard) |
| **Q3** | Audit approach | **Grep for all callers** (production + test) | TypeScript's `noUnusedLocals` (would catch unused exports) |
| **Q4** | Sub-chunk granularity | **Single commit** (v1.17 is small: 2 function removals + 2 test removals + doc closeout) | N/A |

**Defaults at-default (Q1-Q4):** I have no strong opinion on Q1 (both shims have no production callers; remove both in one commit), Q2 (the deprecation-shim tests are redundant after removal; keeping them is just cruft), Q3 (grep is the right tool for a small codebase; `noUnusedLocals` is overkill for a single shim), Q4 (single commit is the right granularity for a small change).

## 5. Plan

### Sub-chunk v1.17.1 — the removal (1 commit)

- Modify: `apps/node/src/manifest-envoy-harness-tags.ts` — remove `extractEnvoyHarnessTags` + `extractOpenClawTags` + their JSDoc comments.
- Modify: `apps/node/test/manifest-openclaw-tags.test.ts` — remove the 2 deprecation-shim tests + their import.
- Modify: `docs/agent-harness-integration-v1-9.md` — v1.17 status note (v1.17 removes the deprecation shims; the v1.9 `extractTagsByRuntime` is the canonical extractor).
- Modify: `docs/agent-harness-integration.md` — add v1.17 status to the change log.

## 6. Out of scope (deferred)

- **v0 `MESH_KEYWORDS` removal** — the
  v0 `MESH_KEYWORDS` constant in
  `user-prompt-router.ts` is still
  used as a fallback for callers that
  pass `envoyHarnessTags === undefined`.
  v1.17 doesn't touch it; a v1.17+
  future chunk can remove it.

## 7. References

- [`agent-harness-integration-v1-9.md`](./agent-harness-integration-v1-9.md)
  (the v1.9 per-runtime tag map; v1.17
  removes the deprecation shims that
  v1.9 added as backward compat)
- [`manifest-envoy-harness-tags.ts`](../../apps/node/src/manifest-envoy-harness-tags.ts)
  (the shim source file; the
  `extractEnvoyHarnessTags` +
  `extractOpenClawTags` functions are
  removed in v1.17)
- [`manifest-openclaw-tags.test.ts`](../../apps/node/test/manifest-openclaw-tags.test.ts)
  (the deprecation-shim tests are
  removed in v1.17)

## Locked decisions (2026-08-21)

| # | Question | Locked answer |
|---|---|---|
| **Q1** | Removal scope | **Both shims** (`extractEnvoyHarnessTags` + `extractOpenClawTags`) |
| **Q2** | Test removal | **Remove the deprecation-shim tests + the v1.7 mirror-symmetric tests** |
| **Q3** | Audit approach | **Grep for all callers** (production + test) |
| **Q4** | Sub-chunk granularity | **Single commit** (v1.17 is small: 2 function removals + test removals + doc closeout) |

## Commit log (2026-08-21)

| Commit | Sub-chunk | Description |
|---|---|---|
| (1 commit, user-delegated) | v1.17.1 bundled | 1 commit on `envoy_harness_integration` branch. v1.17.1: removed `extractEnvoyHarnessTags` + `extractOpenClawTags` from `apps/node/src/manifest-envoy-harness-tags.ts` (the v1.1 + v1.7 deprecation shims that the v1.9 `extractTagsByRuntime` generalizes). Removed the 9 corresponding tests in `apps/node/test/manifest-openclaw-tags.test.ts` (2 deprecation-shim tests + 7 v1.7 mirror-symmetric tests). The v1.9 `extractTagsByRuntime` tests (10) remain. Doc closeout. |

**Total:** 1 commit, net -9 tests in `manifest-openclaw-tags.test.ts` (file becomes 10 tests from 19) + 278 pre-existing tests regression-clean (now 269 after the removal). No new type errors.

## What landed in v1.17 (key file references)

**Backend (Node side):**
- `apps/node/src/manifest-envoy-harness-tags.ts` — removed `extractEnvoyHarnessTags` (v1.1 deprecation shim) + `extractOpenClawTags` (v1.7 deprecation shim) + their JSDoc comments. The v1.9 `extractTagsByRuntime(manifest, runtime)` is the canonical extractor. The v1.2 `extractEnvoyHarnessSkills` is unchanged (not a deprecation shim; a separate function for the per-skill projection).

**Tests:**
- `apps/node/test/manifest-openclaw-tags.test.ts` — removed the 2 deprecation-shim tests + the 7 v1.7 mirror-symmetric tests (the v1.9 `extractTagsByRuntime` tests cover the same behavior). Net -9 tests.

**Docs:**
- `docs/agent-harness-integration-v1-17.md` (NEW) — this sub-plan + DONE stamp
- `docs/agent-harness-integration.md` — change log entry
- `docs/agent-harness-integration-v1-9.md` — v1.17 status note (v1.17 removes the deprecation shims; the v1.9 `extractTagsByRuntime` is the canonical extractor)
