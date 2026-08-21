# envoy-harness integration — v1.1 sub-plan (capability-tag-based signal detection)

> **v1.7 (2026-08-21) status:** v1.7 implements
> Q4 of the v1.1 sub-plan, which was deferred
> to v1.7. v1.1's envoy-harness tags are
> **positive** signals (Q1 + Q2); v1.7 adds
> the **inverse rule** — OpenClaw tags are
> **negative** signals. When a prompt matches
> an OpenClaw tag in the merged manifest, the
> router routes to OpenClaw regardless of any
> positive (envoy-harness) signals. See
> [`agent-harness-integration-v1-7.md`](./agent-harness-integration-v1-7.md)
> for the v1.7 sub-plan + DONE stamp.

> **Status:** ✅ **DONE** (2026-08-21). 1 commit on
> `envoy_harness_integration` branch (the user
> delegated commit; bundled v1.1.1 + v1.1.2 +
> v1.1.3 into a single commit at the end of v1.1).
> 14 new tests (9 unit v1.1 + 5 e2e v1.1.2) + 73
> pre-existing tests regression-clean. Detailed
> sub-plan for v1.1. Companion to
> [`agent-harness-integration.md`](./agent-harness-integration.md) (the
> design) and
> [`agent-harness-integration-step5.md`](./agent-harness-integration-step5.md)
> (the Step 5 sub-plan + v0 signal router).
>
> **v1.2 (2026-08-21) supersedes v1.1's runtime-level
> routing with per-skill routing** — see
> [`agent-harness-integration-v1-2.md`](./agent-harness-integration-v1-2.md)
> for the v1.2 follow-up. v1.1's dynamic vocabulary
> is unchanged (the v0 `MESH_KEYWORDS` constant is
> still the private backward-compat fallback).
>
> **What this doc covers:** v1.1 in **concrete
> detail** — every file path, every type, every
> test, every commit boundary, and the design
> questions for team sign-off. Read the design doc
> for "why"; read Step 5 for the v0 starting point;
> read this for "exactly what to build".
>
> **Order:** Phase 8 v0 is done and pushed (Step 0
> through Step 6). v1.1 is the first v1 chunk.
> The v0 → v1 transition replaces the hardcoded
> keyword vocabulary with a dynamic vocabulary
> extracted from the merged manifest's envoy-harness
> skill tags.

## 1. Goal

**The user-prompt signal router reads the merged
manifest's envoy-harness skill tags dynamically, not
from a hardcoded list.** Adding a new envoy-harness
skill with a new tag automatically extends the
router's vocabulary; the v0 hardcoded
`MESH_KEYWORDS` constant goes away.

**Why this matters (Step 5 Q3 + design doc §3.2
"Capability-tag-based detection"):** the v0 router
is fragile — it relies on a hand-curated list of
mesh keywords that drifts out of sync as envoy-harness
skills are added. v1 makes the router **manifest-aware**:
the vocabulary IS the union of envoy-harness skill
tags, updated every time the merged manifest changes.

**After v1.1:**
- `runOwnerAgentTurnViaRuntime` reads the manifest
  once (via `getNodeManifest()`) and extracts
  envoy-harness skill tags.
- `routeUserPrompt` gets the tags as a new input
  field; the router matches against the manifest's
  tags.
- New envoy-harness skills with new tags
  automatically extend the router's vocabulary.
- The v0 vocabulary's tool names, lsp regex, and
  hint prefix stay (these aren't tag-based).

## 2. Existing pieces (what we build on)

### 2.1 v0 router — `user-prompt-router.ts`

**File:** `apps/node/src/user-prompt-router.ts:67`

```ts
const MESH_KEYWORDS: ReadonlyArray<string> = [
  "mesh", "federated", "cross-node",
];
const TOOL_NAMES: ReadonlyArray<string> = [
  "RemoteMeshSubmitter", "FanOutSpec",
];
const LSP_REGEX = /\blsp_\w+/i;
const HINT_PREFIXES: ReadonlyArray<string> = ["!eh", "/eh"];
```

The router matches:
- `MESH_KEYWORDS` (case-insensitive substring)
- `TOOL_NAMES` (case-insensitive substring)
- `LSP_REGEX` (word-boundary regex)
- `HINT_PREFIXES` (word-boundary at start of trimmed prompt)

**The v1 change:** replace `MESH_KEYWORDS` with a
dynamic `envoyHarnessTags` field (extracted from the
manifest). The other 3 vocabularies stay (not tag-based).

### 2.2 The merged manifest's tags

**File:** `apps/node/src/agent-adapter-manifest-aggregate.ts:72`

```ts
export interface MergedSkillEntry {
  skillId: string;
  description: string;
  costCeilingUsd: number | undefined;
  maxSensitivity: SkillDescriptor["maxSensitivity"];
  tags: ReadonlyArray<string>;
  runtime: AgentRuntime;
}
```

The `NodeManifest.skills` array has every skill (from
every runtime), each tagged with its `tags` and
`runtime`. Step 4 wires the aggregator + `getNodeManifest()`.

**The v1.1 source:** filter `manifest.skills` by
`runtime === "envoy-harness"` and union their
`tags` arrays. The result is the dynamic vocabulary
passed to the router.

### 2.3 Envoy-harness skills already have tags

**File:**
`envoy-harness/packages/envoy-harness-adapter/src/skills.ts:61`

| Skill | Tags |
|---|---|
| `setup-sponsor-friend` | `["mesh", "bond", "sponsor"]` |
| `peer-list` | `["mesh", "observability"]` |
| `relay-status` | `["mesh", "observability"]` |
| `code-edit` | `["code", "edit"]` |
| `code-review` | `["code", "review"]` |
| `doc-search` | `["doc", "search"]` |
| `bash-run` | `["bash", "shell"]` |
| `plan` | `["plan"]` |

The dynamic vocabulary will include `mesh`, `bond`,
`sponsor`, `observability`, `code`, `edit`, `review`,
`doc`, `search`, `bash`, `shell`, `plan` — 12 unique
tags across 8 skills. The v0 hand-curated vocabulary
is just `["mesh", "federated", "cross-node"]` — 3
keywords that don't all match the actual skills
(`federated` and `cross-node` aren't in any
envoy-harness skill's tags).

### 2.4 The host wiring

**File:**
`apps/node/src/node-service-handlers-run-owner-agent-turn.ts:57`

The host's `runOwnerAgentTurnViaRuntime` calls
`routeUserPrompt(input)` and dispatches. v1.1
extracts envoy-harness tags from
`getNodeManifest()` once (at context build), then
threads them through.

## 3. Design

### 3.1 New input field: `envoyHarnessTags`

**File:** `apps/node/src/user-prompt-router.ts`

```ts
export interface RouteUserPromptInput {
  prompt: string;
  isEnvoyHarnessReady: boolean;
  envoyHarnessUnreadyReason: string | undefined;
  signalOptIn: "enabled" | "disabled";
  /**
   * v1.1 — dynamic tag vocabulary extracted from
   * the merged manifest's envoy-harness skills.
   * The host reads the manifest once and passes
   * the union of all `envoy-harness` skills'
   * tags here.
   *
   * When undefined, the router uses the v0
   * `MESH_KEYWORDS` as a fallback (backward
   * compatible with callers that haven't been
   * updated to read the manifest).
   *
   * When provided, the router matches the prompt
   * against the manifest's tags (word-boundary
   * regex) AND the v0 vocabulary's tool names,
   * lsp regex, and hint prefix. The two sources
   * are unioned.
   */
  envoyHarnessTags?: ReadonlyArray<string>;
}
```

### 3.2 The router's new scanning logic

**File:** `apps/node/src/user-prompt-router.ts`

The `scanSignals` function adds a tag-based scan:

```ts
function scanSignals(
  prompt: string,
  envoyHarnessTags: ReadonlyArray<string> | undefined,
): ReadonlyArray<SignalMatch> {
  const signals: SignalMatch[] = [];
  // ... v0 logic: hint prefix, tool names, lsp regex ...

  // v1.1 — tag-based detection. When
  // `envoyHarnessTags` is provided, scan the
  // prompt for any tag (word-boundary regex so
  // "meshes" doesn't match "mesh"; the v0
  // substring FP is gone). The first occurrence
  // wins per tag.
  if (envoyHarnessTags && envoyHarnessTags.length > 0) {
    const lower = prompt.toLowerCase();
    for (const tag of envoyHarnessTags) {
      const offset = findTagInPrompt(lower, tag);
      if (offset >= 0) {
        signals.push({
          token: prompt.slice(offset, offset + tag.length),
          category: "mesh-keyword", // reuse the v0 category
          offset,
        });
      }
    }
  }

  return sortSignalsByOffset(signals);
}
```

`findTagInPrompt` uses a word-boundary regex:

```ts
function findTagInPrompt(lower: string, tag: string): number {
  // Hyphenated tags (e.g. "cross-node") match as
  // exact substrings; single-word tags (e.g.
  // "mesh") match with word-boundary so "meshes"
  // doesn't match "mesh".
  const re = tag.includes("-")
    ? new RegExp(escapeRegex(tag), "i")
    : new RegExp(`\\b${escapeRegex(tag)}\\b`, "i");
  const m = lower.match(re);
  return m?.index ?? -1;
}
```

### 3.3 The host wiring

**File:**
`apps/node/src/node-service-handlers-run-owner-agent-turn.ts`

The host reads the manifest once (at context build)
and passes the tags to `routeUserPrompt`. The
manifest read is sync (per `getNodeManifest()` —
no I/O after init).

```ts
// At context build (or in a new helper):
const manifest = nodeService.getNodeManifest?.();
const envoyHarnessTags = manifest
  ? extractEnvoyHarnessTags(manifest)
  : undefined;

// In the call site:
const decision = routeUserPrompt({
  prompt: agentMessage,
  isEnvoyHarnessReady: ctx.isEnvoyHarnessReady(),
  envoyHarnessUnreadyReason: undefined,
  signalOptIn: ctx.signalOptIn,
  envoyHarnessTags, // v1.1 — new field
});
```

`extractEnvoyHarnessTags(manifest)`:

```ts
function extractEnvoyHarnessTags(
  manifest: NodeManifest,
): ReadonlyArray<string> {
  const tags = new Set<string>();
  for (const skill of manifest.skills) {
    if (skill.runtime === "envoy-harness") {
      for (const tag of skill.tags) tags.add(tag);
    }
  }
  return [...tags];
}
```

### 3.4 The decision tree stays the same

The router's decision tree (default / opt-in-disabled
/ signal / envoy-harness-unready) doesn't change.
v1.1 only changes the SIGNAL DETECTION layer. The
decision branches are unaffected.

### 3.5 The v0 vocabulary's `MESH_KEYWORDS` goes away

The hardcoded `MESH_KEYWORDS = ["mesh", "federated",
"cross-node"]` is replaced by the dynamic
`envoyHarnessTags`. The v0 vocabulary's tool names,
lsp regex, and hint prefix stay (these are not
tag-based).

**Backward compat:** when `envoyHarnessTags` is
undefined (no manifest passed), the router uses
the v0 `MESH_KEYWORDS` as fallback. This way, callers
that haven't been updated still work — the router
degrades to the v0 behavior gracefully.

### 3.6 Test strategy

**Unit tests in `user-prompt-router.test.ts`** (additions):

- `envoyHarnessTags: ["mesh"]` + "set up a mesh sub-agent" → matches `mesh` (positive)
- `envoyHarnessTags: ["mesh"]` + "the meshes overlap" → no match (word-boundary tightening)
- `envoyHarnessTags: ["mesh", "observability"]` + "federated task" → no match (manifest doesn't have `federated`)
- `envoyHarnessTags: ["code"]` + "review this PR" → no match (manifest's `code` doesn't appear in "review")
- `envoyHarnessTags: ["mesh"]` + "mesh-based federated" → matches `mesh` (word-boundary)
- `envoyHarnessTags: ["cross-node"]` + "across-node thing" → matches `cross-node` (hyphenated tag = exact substring)
- `envoyHarnessTags: undefined` → falls back to v0 `MESH_KEYWORDS` (backward compat)
- `envoyHarnessTags: []` → empty manifest → no tag-based signals (only v0 tool names / lsp / hint)
- `envoyHarnessTags: ["mesh", "code"]` + "review the code" → matches `code` (positive)
- Combined: `envoyHarnessTags: ["mesh"]` + lsp_* + "lsp_goto_definition" → both signals (mesh + tool name)

**E2E tests in `run-owner-agent-turn-routing.test.ts`** (additions):

- The host reads the manifest, extracts envoy-harness tags, and passes them through
- A prompt with a manifest-tag keyword routes to envoy-harness
- A prompt with a v0-keyword that isn't in the manifest does NOT route to envoy-harness (e.g. "federated" without `federated` in tags)
- When the manifest is unavailable (envoy-harness not installed), the router falls back to v0

## 4. Design questions for team sign-off

> These are the choices that need a decision before implementation
> starts. **Defaults proposed in bold**; flip if you disagree.

| # | Question | Default (proposed) | Alternative |
|---|---|---|---|
| **Q1** | `envoyHarnessTags` undefined fallback | **Fall back to v0 `MESH_KEYWORDS`** (backward compat) | Always require `envoyHarnessTags` (no fallback; throw) |
| **Q2** | Tag matching algorithm | **Word-boundary regex for single-word tags, exact substring for hyphenated tags** | Always exact substring (accept FPs like "meshes" → "mesh") |
| **Q3** | v0 `MESH_KEYWORDS` constant | **Remove it** (replaced by the dynamic vocabulary) | Keep it as a merge with the dynamic tags (v0 keywords are always present) |
| **Q4** | OpenClaw tags as negative signals | **No** (v1.1 only uses envoy-harness tags as positive signals) | Yes — the manifest's OpenClaw tags become "don't route to envoy-harness" hints |
| **Q5** | Manifest staleness | **Read on every `runOwnerAgentTurnViaRuntime` call** (sync; the manifest is cached after init) | Read once at node startup (cached) — but new envoy-harness skills aren't picked up until restart |
| **Q6** | Manifest read failure | **Fall back to v0 vocabulary** (log a warning) | Fail loud (the user-prompt routing is broken without the manifest) |
| **Q7** | Tag-based signal category in the result | **Reuse `"mesh-keyword"`** (the v0 category — the tag IS a keyword) | New category `"manifest-tag"` (cleaner, but breaks the existing test assertions) |
| **Q8** | Empty `envoyHarnessTags: []` (manifest has no envoy-harness skills) | **No tag-based signals** (only v0 tool names / lsp / hint) | Fall back to v0 `MESH_KEYWORDS` (same as `undefined`) |

## 5. Plan

### Sub-chunk v1.1.1 — `envoyHarnessTags` API + router scan (1 commit)

- Modify: `apps/node/src/user-prompt-router.ts` — add
  `envoyHarnessTags` to `RouteUserPromptInput`; add
  `findTagInPrompt` helper; update `scanSignals` to
  use the manifest tags when provided
- Modify: `apps/node/src/user-prompt-router.test.ts` —
  add ~10 unit tests for the new behavior
- Existing 41 tests regression-clean

### Sub-chunk v1.1.2 — host wiring (1 commit)

- Modify:
  `apps/node/src/node-service-handlers-run-owner-agent-turn.ts`
  — read `getNodeManifest()` once at context build,
  extract envoy-harness tags, pass to `routeUserPrompt`
- New: `apps/node/src/manifest-envoy-harness-tags.ts`
  (or similar) — the `extractEnvoyHarnessTags` helper
- New: `apps/node/test/run-owner-agent-turn-routing.test.ts`
  — add ~4 e2e tests for the host wiring
- Existing 23 e2e tests regression-clean

### Sub-chunk v1.1.3 — doc closeout (1 commit)

- Modify: `docs/agent-harness-integration.md` — add
  v1.1 status to the change log
- Modify: `docs/agent-network-engine.md` §2.2 — note
  the v1.1 dynamic vocabulary (replace v0's hardcoded
  keywords)
- Modify: `docs/agent-harness-integration-step5.md` —
  status note that the v0 vocabulary is replaced by
  v1.1
- New: `docs/agent-harness-integration-v1-1.md` —
  status banner + commit log (this doc gets a
  "DONE" stamp)

**Total: 3 commits, all on `envoy_harness_integration` branch.**

## 6. Out of scope (deferred)

- **Tag-based signal detection for OpenClaw
  (Q4)** — the v1.1 router only uses envoy-harness
  tags as positive signals. OpenClaw tags as
  negative signals ("don't route to envoy-harness")
  is a v1.2 candidate.
- **Per-skill tag matching** — v1.1 matches tags
  globally (any tag triggers envoy-harness). v1.2
  could match the specific skill the user wants
  (e.g. "set up sponsor friend" → specific skill).
- **Capability tags from non-envoy-harness runtimes
  (e.g. Ext, Pi)** — v1.1 only reads envoy-harness
  skills' tags. v1.2 could include other runtimes'
  tags.
- **Word-boundary for hyphenated multi-word tags** —
  v1.1 uses exact substring for hyphenated tags.
  v1.2 could implement smarter boundary detection
  (e.g. Unicode-aware word boundary).
- **Tag-based per-skill routing** — the v0 / v1.1
  router routes to a runtime, not a specific skill.
  v1.2 could pick a specific skill based on the
  matched tag + the prompt's intent.

## 7. Open questions

1. **Q1 (undefined fallback)** — fall back to v0
   vocabulary (proposed) or always require
   `envoyHarnessTags`? Fallback is more forgiving
   (callers that haven't been updated still work);
   always-require is stricter.
2. **Q2 (matching algorithm)** — word-boundary for
   single-word tags + exact substring for hyphenated
   (proposed) or always exact substring? Word-boundary
   reduces the v0 substring FPs (Q6 follow-up).
3. **Q4 (OpenClaw tags as negative)** — v1.1 only
   uses envoy-harness tags as positive signals.
   Q4 says OpenClaw tags should be negative. This
   is a bigger design change (the router would need
   to know BOTH vocabularies).
4. **Q5 (manifest staleness)** — read on every call
   (proposed) or cache at startup? Read-on-every-call
   is fresh but has a small overhead; cache-at-startup
   is faster but stale.

## 8. References

- [`agent-harness-integration.md`](./agent-harness-integration.md)
  (the design — §3.2 capability-tag-based detection,
  §6 v1 deferred)
- [`agent-harness-integration-step5.md`](./agent-harness-integration-step5.md)
  (the v0 router; this doc is the v1 upgrade)
- [`user-prompt-router.ts`](../../apps/node/src/user-prompt-router.ts)
  (the v0 router — to be upgraded)
- [`agent-adapter-manifest-aggregate.ts`](../../apps/node/src/agent-adapter-manifest-aggregate.ts)
  (the merged manifest with `MergedSkillEntry.tags`)
- [`ENVOY_HARNESS_SKILLS`](../../envoy-harness/packages/envoy-harness-adapter/src/skills.ts:61)
  (the envoy-harness skills' tags — the dynamic
  vocabulary source)

---

**Status:** 4 design questions locked (2026-08-21,
all defaults accepted). ✅ **DONE** (bundled
into 1 commit at end of v1.1; user delegated
commit).

### Commit log (2026-08-21)

| Commit | Sub-chunk | Description |
|---|---|---|
| (1 commit, user-delegated) | v1.1.1 + v1.1.2 + v1.1.3 bundled | 1 commit on `envoy_harness_integration` branch. v1.1.1: `envoyHarnessTags` API + router scan + 9 unit tests. v1.1.2: `extractEnvoyHarnessTags(manifest)` helper + host wiring (read manifest once + pass tags) + 5 e2e tests. v1.1.3: doc closeout (`agent-harness-integration.md` change log entry + `agent-network-engine.md` §2.2.1 v1.1 dynamic vocabulary + `agent-harness-integration-step5.md` status note + this DONE stamp). |

**Total:** 1 commit, 14 new tests (9 unit + 5 e2e), 73 pre-existing tests regression-clean.

### Locked decisions (2026-08-21)

| # | Question | Locked answer |
|---|---|---|
| **Q1** | `envoyHarnessTags` undefined fallback | Fall back to v0 `MESH_KEYWORDS` (backward compat) |
| **Q2** | Tag matching algorithm | Word-boundary regex for single-word tags, exact substring for hyphenated tags |
| **Q3** | v0 `MESH_KEYWORDS` constant | **Remove from primary path; keep as private legacy fallback** (reconciles Q1 + Q3 — Q1 says fall back, Q3 says remove; both honored by removing the constant from the primary scan while keeping the list as the `undefined` fallback) |
| **Q4** | OpenClaw tags as negative signals | No — only envoy-harness tags as positive (v1.1 is additive) |
| **Q5** | Manifest staleness | Read on every `runOwnerAgentTurnViaRuntime` call (sync; cached after init) |
| **Q6** | Manifest read failure | Fall back to v0 vocabulary (log a warning) |
| **Q7** | Tag-based signal category | Reuse `"mesh-keyword"` (the v0 category — the tag IS a keyword) |
| **Q8** | Empty `envoyHarnessTags: []` | No tag-based signals (only v0 tool names / lsp / hint) |

**Q1/Q3 reconciliation note (2026-08-21):** Q1 and Q3
were initially framed as alternatives but the team
chose to honor both: the `MESH_KEYWORDS` constant stays
in the file (Q1 wins on data — backward-compat fallback)
but it is no longer the *primary* scan vocabulary (Q3
wins on positioning — the merged manifest's envoy-harness
skill tags are primary). Callers that pass
`envoyHarnessTags` use the dynamic vocabulary; callers
that don't (or whose manifest is broken — Q6) fall back
to `MESH_KEYWORDS`.
