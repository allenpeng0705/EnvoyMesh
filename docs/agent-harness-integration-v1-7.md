# envoy-harness integration — v1.7 sub-plan (OpenClaw tags as negative signals)

> **Status:** ✅ **DONE** (2026-08-21). 1 commit on
> `envoy_harness_integration` branch (the user
> delegated commit; bundled v1.7.1 + v1.7.2 +
> v1.7.3 into a single commit at the end of
> v1.7). 19 new tests (9 v1.7 `routeUserPrompt`
> integration + 7 v1.7 `extractOpenClawTags`
> unit + 3 v1.7 dispatch e2e) + 240
> pre-existing tests regression-clean on the
> affected paths. No new type errors
> (pre-existing multiformats/ArrayBuffer
> conflict in `packages/network/src/index.ts:2791`
> unchanged).
>
> **v1.8 (2026-08-21) status note:** v1.8 builds
> on v1.7. v1.7 added the negative-signal scan
> (OpenClaw tags as implicit opt-out); v1.8
> adds the F9.5 cross-verify primitive (the
> verifier prefers a different model family).
> v1.8 doesn't change v1.7's routing layer —
> it only changes the chain-verify loop. See
> [`agent-harness-integration-v1-8.md`](./agent-harness-integration-v1-8.md)
> for the v1.8 sub-plan + DONE stamp.
>
> **What this doc covers:** v1.7 in **concrete
> detail** — every file path, every type, every
> test, every commit boundary, and the design
> questions for team sign-off.
>
> **What this doc covers:** v1.7 in **concrete
> detail** — every file path, every type, every
> test, every commit boundary, and the design
> questions for team sign-off.
>
> **Order:** Phase 8 v0 + v1.1 + v1.2 + v1.3 +
> v1.4 + v1.5 + v1.6 are done. v1.7 implements
> the **OpenClaw tags as negative signals** feature
> (Q4 of the v1.1 sub-plan, deferred to v1.7).
> When a prompt matches a tag from an OpenClaw
> skill in the merged manifest, the router
> routes to OpenClaw regardless of any positive
> (EH) signals — the OpenClaw tag is a
> **negative signal** that vetoes the EH routing.

## 1. Goal

**The user-prompt signal router treats OpenClaw
skill tags as negative signals.** When a prompt
contains a tag that matches an OpenClaw skill in
the merged manifest, the router routes to
OpenClaw regardless of any positive (envoy-
harness) signals. This is the **inverse** of
v1.1's envoy-harness tags (which are positive
signals — they pull the prompt toward EH).

**Why now:** the v1.1 design explicitly deferred
this feature to v1.7 (Q4 of the v1.1 sub-plan).
v1.1 only uses envoy-harness tags as positive
signals. The current default is "route to EH on
any positive signal; otherwise OpenClaw." v1.7
adds the "route to OpenClaw on any negative
signal" branch — the inverse rule.

**The two-rule design (v1.1 + v1.7 together):**
1. **Positive rule (v1.1):** EH tag in prompt →
   route to EH (when EH is ready).
2. **Negative rule (v1.7):** OpenClaw tag in
   prompt → route to OpenClaw (regardless of
   positive signals).

The negative rule wins (Q2 — veto semantics).
The user can use `!eh` to force EH when there's
an OpenClaw tag conflict (the explicit prefix
overrides the implicit tag).

## 2. Existing pieces (what we build on)

### 2.1 v1.1 — envoy-harness tags as positive signals

**File:** `apps/node/src/manifest-envoy-harness-tags.ts:68-79`

The v1.1 design extracts the union of tags from
envoy-harness skills in the merged manifest:

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

**The v1.7 change:** add a parallel
`extractOpenClawTags(manifest)` that filters by
`runtime === "openclaw"`. The router uses
the OpenClaw tag list as a negative-signal
vocabulary (the same way v1.1 uses the EH tag
list as a positive-signal vocabulary).

### 2.2 v0 corner case — v0 prefix scan uses the original prompt

**File:** `apps/node/src/user-prompt-router.ts:705-726`

The v0 prefix scan iterates `HINT_PREFIXES` in
order. For v1.7, the OpenClaw tag scan is a
**signal scan** (like the EH tag scan), not a
v0 prefix scan. The signal scan uses the
**original** prompt (per the v1.1 design; the
v1.6 v0 corner-case fix only applies to v0
prefixes, not to mesh-keyword signals).

### 2.3 The `reason` union

**File:** `apps/node/src/user-prompt-router.ts:336-342`

The router's `reason` field is a closed union
of 6 values today (after v1.6):
`"default" | "opt-in-disabled" |
"opt-out-explicit" | "signal" | "signal-skill"
| "envoy-harness-unready"`. v1.7 adds a 7th:
`"openclaw-tag-match"`.

The chat badge (Tauri UI) maps the internal
value to a user-friendly label. The
`"openclaw-tag-match"` label is "Used the free
built-in assistant for this one" (same as
`"opt-out-explicit"` — the chat user doesn't
need to distinguish why OpenClaw was chosen;
both are "OpenClaw was the right call").

## 3. Design

### 3.1 The OpenClaw tag extraction

**File:** `apps/node/src/manifest-envoy-harness-tags.ts`
(modify)

```ts
/**
 * Phase 8 / v1.7 — extract the union of `tags[]`
 * across all openclaw skills in the merged
 * manifest. The result is the negative-signal
 * vocabulary the user-prompt router uses to
 * veto EH routing.
 *
 * **Mirror of `extractEnvoyHarnessTags`:** the
 * same algorithm, filtered by
 * `runtime === "openclaw"` instead of
 * `runtime === "envoy-harness"`. Both
 * extractors share the manifest staleness +
 * empty-array semantics.
 *
 * **Why a separate function (not merging the
 * two):** the two vocabularies have different
 * semantics (positive vs. negative signals).
 * Keeping them apart makes the v1.7 intent
 * explicit and lets the router apply the
 * negative rule separately from the positive
 * rule.
 */
export function extractOpenClawTags(
  manifest: NodeManifest,
): ReadonlyArray<string> {
  const tags = new Set<string>();
  for (const skill of manifest.skills) {
    if (skill.runtime !== "openclaw") continue;
    for (const tag of skill.tags) {
      tags.add(tag);
    }
  }
  return [...tags];
}
```

### 3.2 The router change — negative signal scan

**File:** `apps/node/src/user-prompt-router.ts`
(modify)

The router adds a new optional field on
`RouteUserPromptInput`:

```ts
export interface RouteUserPromptInput {
  prompt: string;
  isEnvoyHarnessReady: boolean;
  envoyHarnessUnreadyReason?: string;
  signalOptIn: "enabled" | "disabled";
  envoyHarnessTags?: ReadonlyArray<string>;
  envoyHarnessSkills?: ReadonlyArray<EnvoyHarnessSkillEntry>;
  // Phase 8 / v1.7 — negative-signal vocabulary
  // (the OpenClaw tag list from the merged
  // manifest). When the prompt matches any of
  // these tags, the router routes to OpenClaw
  // regardless of any positive (envoy-harness)
  // signals. Optional: `undefined` = no negative
  // signal scan (v1.6 behavior, preserved).
  openClawTags?: ReadonlyArray<string>;
}
```

The new branch in `routeUserPrompt` inserts
**after step 2c** (after the v1.6 opt-out
check) and **before step 3** (the no-signals
check):

```ts
// 2d. v1.7 — negative-signal scan. When the
//     prompt matches any OpenClaw tag in the
//     manifest, the router routes to OpenClaw
//     (the negative rule). This VETOES the
//     positive (envoy-harness) signals — see
//     Q2 of the v1.7 sub-plan.
//
//     **Why after the v1.6 opt-out check:**
//     the v1.6 opt-out is the per-prompt
//     explicit opt-out (`!openclaw` prefix); the
//     v1.7 negative signal is the implicit
//     opt-out (OpenClaw tag in the prompt).
//     Both route to OpenClaw, but the v1.6
//     branch is more explicit (the user typed
//     the prefix). When both fire, the v1.6
//     branch wins (we already routed to
//     OpenClaw with reason: "opt-out-explicit"
//     — the v1.7 scan is a no-op for the
//     current request).
//
//     **Why the negative rule vetoes the
//     positive rule** (Q2): the user typed a
//     tag that matches an OpenClaw skill; the
//     user's intent is OpenClaw. The
//     `!eh` prefix can override the negative
//     rule (the user can force EH with the
//     explicit prefix).
const openClawSignals = scanOpenClawSignals(
  input.prompt,
  input.openClawTags,
  signals, // exclude tags that are already EH tags
);
if (openClawSignals.length > 0) {
  return {
    runtime: "openclaw",
    reason: "openclaw-tag-match",
    signals: [...signals, ...openClawSignals],
    hintPrefixLength: signals[0]?.category === "explicit-hint"
      ? signals[0].token.length
      : undefined,
    targetSkill: undefined,
    costCapUsd: hints.costCapUsd,
    providerHint: hints.providerHint,
    cleanPrompt,
  };
}
```

The `scanOpenClawSignals` helper:

```ts
/**
 * Phase 8 / v1.7 — scan the prompt for tags that
 * match an OpenClaw skill (the negative-signal
 * vocabulary). Returns the matched OpenClaw
 * signals (token + offset).
 *
 * **Algorithm (per Q2 / Q5 of the v1.7
 * sub-plan):**
 * 1. Iterate `openClawTags` (the manifest's
 *    OpenClaw tag list).
 * 2. For each tag, check if the prompt
 *    contains the tag (word-boundary for
 *    single-word tags; exact substring for
 *    hyphenated tags — same as v1.1).
 * 3. **Exclude tags that are also in the EH
 *    tag list** (Q4 of the v1.7 sub-plan):
 *    when an EH skill AND an OpenClaw skill
 *    share a tag, the EH tag wins (positive
 *    signal takes precedence over the
 *    negative rule for the same tag).
 * 4. Return the matched OpenClaw signals.
 */
function scanOpenClawSignals(
  prompt: string,
  openClawTags: ReadonlyArray<string> | undefined,
  existingSignals: ReadonlyArray<SignalMatch>,
): ReadonlyArray<SignalMatch> {
  if (!openClawTags || openClawTags.length === 0) {
    return [];
  }
  const lower = prompt.toLowerCase();
  const matched: SignalMatch[] = [];
  // Build a set of EH tags from the existing
  // signals (so we can exclude OpenClaw tags
  // that are also EH tags).
  const existingTags = new Set(
    existingSignals
      .filter((s) => s.category === "mesh-keyword")
      .map((s) => s.token.toLowerCase()),
  );
  for (const tag of openClawTags) {
    if (existingTags.has(tag.toLowerCase())) {
      // The tag is also an EH tag — the
      // positive rule wins. Skip.
      continue;
    }
    const offset = findTagInPrompt(lower, tag);
    if (offset >= 0) {
      matched.push({
        token: prompt.slice(offset, offset + tag.length),
        category: "mesh-keyword", // reuse the v0 + v1.1 category
        offset,
      });
    }
  }
  return matched;
}
```

### 3.3 The dispatch — no change

**File:** `apps/node/src/node-service-handlers-run-owner-agent-turn.ts`
(modify: nothing significant)

The dispatch already routes non-EH runtimes
(including `runtime: "openclaw"` from
`reason: "openclaw-tag-match"`) to OpenClaw. The
dispatch uses `effectiveMessage = stripHintPrefix
(decision.cleanPrompt, decision)` (the v1.5 +
v1.6 fix). The OpenClaw runtime gets the
cleanPrompt (with v1.5 hints + v0 prefixes
stripped).

**The Tauri chat badge** for the new reason
maps to the same user-friendly label as
`"opt-out-explicit"` ("Used the free built-in
assistant for this one") — the chat user
doesn't need to distinguish why OpenClaw was
chosen.

### 3.4 The host wiring — extract OpenClaw tags

**File:** `apps/node/src/node-service-handlers-run-owner-agent-run.ts:469-499`
(modify)

The `readManifestView` function gains a new
field:

```ts
function readManifestView(
  ctx: RunOwnerAgentTurnContext,
): {
  tags: ReadonlyArray<string> | undefined;
  skills: ReadonlyArray<EnvoyHarnessSkillEntry> | undefined;
  // Phase 8 / v1.7 — OpenClaw tag list (the
  // negative-signal vocabulary).
  openClawTags: ReadonlyArray<string> | undefined;
} {
  let manifest: NodeManifest | undefined;
  try {
    manifest = ctx.getNodeManifest();
  } catch (err) {
    console.warn(...);
    return { tags: undefined, skills: undefined, openClawTags: undefined };
  }
  if (manifest === undefined) {
    return { tags: undefined, skills: undefined, openClawTags: undefined };
  }
  return {
    tags: extractEnvoyHarnessTags(manifest),
    skills: extractEnvoyHarnessSkills(manifest),
    openClawTags: extractOpenClawTags(manifest),
  };
}
```

The call site in `routeUserPrompt`:

```ts
const decision = routeUserPrompt({
  prompt: agentMessage,
  isEnvoyHarnessReady: ctx.isEnvoyHarnessReady(),
  envoyHarnessUnreadyReason: undefined,
  signalOptIn: ctx.signalOptIn,
  envoyHarnessTags: manifestView.tags,
  envoyHarnessSkills: manifestView.skills,
  openClawTags: manifestView.openClawTags, // v1.7
});
```

### 3.5 The reason type — closed union extension

**File:** `apps/node/src/user-prompt-router.ts:336-342`
(modify)

```ts
reason:
  | "default"
  | "opt-in-disabled"
  | "opt-out-explicit"
  | "openclaw-tag-match" // v1.7 — new
  | "signal"
  | "signal-skill"
  | "envoy-harness-unready";
```

**File:** `packages/api/src/owner-agent-loop.ts:90-95`
(modify)

```ts
routingReason?:
  | "default"
  | "signal"
  | "signal-skill"
  | "envoy-harness-unready"
  | "opt-in-disabled"
  | "opt-out-explicit"
  | "openclaw-tag-match"; // v1.7 — new
```

### 3.6 Test strategy

**Unit tests in `manifest-envoy-harness-tags.test.ts` (new file or modify existing):**

- `extractOpenClawTags(manifest)` returns the union of tags from OpenClaw skills
- `extractOpenClawTags(manifest)` excludes non-OpenClaw skills
- `extractOpenClawTags(manifest)` deduplicates tags across skills
- `extractOpenClawTags(empty manifest)` returns `[]`
- `extractOpenClawTags(manifest with no OpenClaw skills)` returns `[]`

**Unit tests in `user-prompt-router.test.ts` (modify):**

- OpenClaw tag in prompt → routes to OpenClaw with `reason: "openclaw-tag-match"`
- OpenClaw tag + EH tag → OpenClaw tag wins (veto); `reason: "openclaw-tag-match"`
- OpenClaw tag + `!eh` prefix → `!eh` wins (explicit override); `reason: "signal"`
- OpenClaw tag + `!openclaw` prefix → `!openclaw` wins (already OpenClaw anyway); `reason: "opt-out-explicit"`
- OpenClaw tag with opt-in-disabled → opt-in-disabled wins (first branch); `reason: "opt-in-disabled"`
- OpenClaw tag that is also an EH tag → EH tag wins (positive rule precedence); `reason: "signal"`
- OpenClaw tag = undefined → no negative signal scan; v1.6 behavior preserved
- OpenClaw tag = [] → no negative signal scan; v1.6 behavior preserved
- Hyphenated OpenClaw tag (e.g. "creative-writing") matches exactly (substring, not word-boundary)

**E2E tests in `run-owner-agent-turn-routing.test.ts` (modify):**

- Prompt with OpenClaw tag → OpenClaw is called, `modelUsed: "openclaw"`, `routingReason: "openclaw-tag-match"`
- Prompt with both OpenClaw tag and EH tag → OpenClaw is called (veto); `routingReason: "openclaw-tag-match"`
- Prompt with OpenClaw tag and `!eh` prefix → EH is called (explicit override); `routingReason: "signal"`

## 4. Design questions for team sign-off

> These are the choices that need a decision
> before implementation starts. **Defaults
> proposed in bold**; flip if you disagree.

| # | Question | Default (proposed) | Alternative |
|---|---|---|---|
| **Q1** | OpenClaw tag source | **All tags from OpenClaw skills in the merged manifest** (parallel to `extractEnvoyHarnessTags`) | Manual list of OpenClaw tags (hardcoded in the router) — fragile, drifts from the manifest |
| **Q2** | Veto vs. override | **Veto** — any OpenClaw tag in the prompt routes to OpenClaw, regardless of positive signals. The user can override with `!eh`. | Override — OpenClaw tag only routes to OpenClaw when no positive signals match (same as v0 default; the OpenClaw tag adds no new behavior) |
| **Q3** | Precedence | **`!openclaw` > `!eh` > OpenClaw tag > EH tag > default** — explicit prefixes win over implicit tags; the OpenClaw tag vetoes the EH tag | `!openclaw` > OpenClaw tag > `!eh` > EH tag — the OpenClaw tag beats `!eh` (but `!openclaw` beats both) |
| **Q4** | EH+OpenClaw shared tag | **EH wins** — when a tag is in BOTH the EH list and the OpenClaw list, the positive rule wins. The user can use `!openclaw` to force OpenClaw for the shared tag. | OpenClaw wins — the negative rule beats the positive rule for shared tags (more aggressive veto) |
| **Q5** | Tag matching algorithm | **Same as v1.1** — word-boundary for single-word tags, exact substring for hyphenated tags | Always exact substring (accept false positives like "creative" matching "creativity") |
| **Q6** | Tag scan prompt source | **Original prompt** (consistent with the v1.1 + v1.2 + v1.6 EH tag scan) | CleanPrompt (post v1.5 strip) — but the v1.6 v0 corner-case fix only applies to v0 prefixes, not to mesh-keyword signals |
| **Q7** | Opt-in-disabled interaction | **Opt-in-disabled wins** (the router short-circuits before the OpenClaw tag scan; consistent with v1.6 Q7) | OpenClaw tag wins — even when the user has disabled signal routing, an OpenClaw tag routes to OpenClaw (redundant; the user disabled signal routing means everything goes to OpenClaw anyway) |
| **Q8** | Tauri chat badge | **Same label as `opt-out-explicit`** ("Used the free built-in assistant for this one") — the chat user doesn't need to distinguish why OpenClaw was chosen | Distinct label — "OpenClaw tag matched" (developer-jargon; defeats the end-user-first principle) |
| **Q9** | Empty `openClawTags: []` | **No negative signal scan** (v1.6 behavior preserved) | Fall back to a hardcoded `OPENCLAW_TAGS` constant (similar to the v0 `MESH_KEYWORDS` fallback) — fragile, drifts from the manifest |
| **Q10** | Backward compat | **`undefined` = no negative signal scan** (additive; existing callers without the field keep v1.6 behavior) | Force every caller to provide the OpenClaw tag list (no migration needed; the new field is optional) |
| **Q11** | Tauri UI scope | **Backend + design doc only** (the Tauri team picks up the actual chat badge mapping in their own workstream; consistent with v1.4 + v1.5 + v1.6) | Bundle the Tauri UI work in this chunk |
| **Q12** | Manifest staleness | **Read on every `runOwnerAgentTurnViaRuntime` call** (sync; consistent with the v1.1 design; the manifest is cached after init) | Read once at node startup (cached) — but new OpenClaw skills aren't picked up until restart |

**Defaults at-default (Q1-Q12):** I have no
strong opinion on Q1 (parallel to v1.1 is the
most natural design), Q2 (veto is the spirit of
"negative signals"; override makes the feature
useless), Q3 (explicit prefixes win over
implicit tags is the natural precedence; same
as v1.6), Q4 (shared tag — EH wins because the
EH tag is positive; the user can use
`!openclaw` to force OpenClaw for the shared
tag), Q5 (same as v1.1), Q6 (same as v1.1 +
v1.6), Q7 (opt-in-disabled is the node-wide
policy; consistent with v1.6), Q8 (end-user-
first: same label as opt-out-explicit), Q9
(additive; the v0 fallback pattern is fragile),
Q10 (additive; no migration), Q11 (consistent
with v1.4 + v1.5 + v1.6), Q12 (consistent with
v1.1).

## 5. Plan

### Sub-chunk v1.7.1 — OpenClaw tag extraction + helper (1 commit)

- New: `apps/node/src/manifest-envoy-harness-tags.ts` —
  `extractOpenClawTags(manifest)` (parallel to
  `extractEnvoyHarnessTags`).
- New: `apps/node/src/manifest-openclaw-tags.test.ts` —
  ~5 unit tests for the extractor (empty
  manifest, OpenClaw-only skills, mixed
  runtimes, deduplication).
- Modify: `apps/node/src/user-prompt-router.ts` —
  add `openClawTags?` to `RouteUserPromptInput`
  + add `scanOpenClawSignals` helper + add the
  `reason: "openclaw-tag-match"` to the union.
- Modify: `packages/api/src/owner-agent-loop.ts` —
  add `"openclaw-tag-match"` to the
  `routingReason` union.
- New: `apps/node/test/user-prompt-router.test.ts` —
  ~5 unit tests for the OpenClaw tag scan
  (veto, override, opt-in-disabled,
  shared tag, hyphenated tag).

### Sub-chunk v1.7.2 — dispatch integration (1 commit)

- Modify: `apps/node/src/node-service-handlers-run-owner-agent-turn.ts` —
  extend `readManifestView` to return
  `openClawTags` + thread the field to
  `routeUserPrompt`.
- New: `apps/node/test/run-owner-agent-turn-routing.test.ts` —
  ~3 e2e tests for the OpenClaw tag dispatch
  (OpenClaw tag → OpenClaw + shared tag → EH
  + `!eh` override).

### Sub-chunk v1.7.3 — Tauri UI design doc + closeout (1 commit)

- Modify: `docs/taui-agent-routing-settings.md` —
  §13 (Tauri chat badge for
  `"openclaw-tag-match"`; same label as
  `opt-out-explicit` per Q8).
- Modify: `docs/agent-harness-integration.md` —
  add v1.7 status to the change log.
- Modify: `docs/agent-network-engine.md` §2.2.2 —
  note v1.7's OpenClaw tags as negative
  signals.
- Modify: `docs/agent-harness-integration-v1-1.md` —
  v1.7 status note (v1.7 implements Q4 of the
  v1.1 sub-plan, deferred to v1.7).
- Modify: `docs/agent-harness-integration-v1-6.md` —
  v1.7 status note (v1.7 builds on v1.6's
  `!openclaw` opt-out).
- New: `docs/agent-harness-integration-v1-7.md` —
  this doc gets the "DONE" stamp.

**Total: 3 sub-chunks, bundled into 1 commit
at the end of v1.7** (per the v1.1 + v1.2 +
v1.3 + v1.4 + v1.5 + v1.6 commit pattern). On
`envoy_harness_integration` branch.

## 6. Out of scope (deferred)

- **Per-runtime negative signals** (e.g. `ext`
  skill tags as negative signals for EH) —
  v1.7 is OpenClaw-only. Per-runtime negative
  signals are a v1.7+ future.
- **A `scoreboard` formula** (weighting positive
  vs. negative signals) — v1.10 (per the v1
  backlog). v1.7 uses simple veto (any
  negative signal wins).
- **The Tauri UI implementation** (Q11
  default) — the actual chat badge for
  `"openclaw-tag-match"` lives in the Tauri
  monorepo. v1.7 ships the backend + a design
  doc.
- **Negative signals for the v0 prefix**
  (e.g. a `!noclaw` prefix to veto the EH
  routing) — the v1.6 `!openclaw` opt-out
  already covers this case. No new prefix
  needed.

## 7. References

- [`agent-harness-integration.md`](./agent-harness-integration.md)
  (the design — Q1 routing, Q5 node config)
- [`agent-harness-integration-v1-1.md`](./agent-harness-integration-v1-1.md)
  (v1.1 dynamic vocabulary — Q4 of the v1.1
  sub-plan, deferred to v1.7)
- [`agent-harness-integration-v1-6.md`](./agent-harness-integration-v1-6.md)
  (v1.6 `!openclaw` opt-out — the explicit
  opt-out; v1.7 adds the implicit opt-out)
- [`manifest-envoy-harness-tags.ts`](../../apps/node/src/manifest-envoy-harness-tags.ts)
  (v1.1 extractor — v1.7 adds a parallel
  `extractOpenClawTags` function)
- [`user-prompt-router.ts`](../../apps/node/src/user-prompt-router.ts)
  (the v1.1 + v1.2 + v1.5 + v1.6 router; v1.7
  adds the negative-signal scan)
- [`node-service-handlers-run-owner-agent-turn.ts`](../../apps/node/src/node-service-handlers-run-owner-agent-turn.ts)
  (the v1.5 + v1.6 dispatch; v1.7 extends
  `readManifestView` + threads `openClawTags`)
- [`owner-agent-loop.ts`](../../packages/api/src/owner-agent-loop.ts)
  (the `OwnerAgentTurnResult.routingReason` —
  v1.7 adds `"openclaw-tag-match"` to the
  union)
- [`taui-agent-routing-settings.md`](./taui-agent-routing-settings.md)
  (the Tauri UI design doc — v1.7 updates the
  chat badge mapping for the new reason)

## Locked decisions (2026-08-21)

| # | Question | Locked answer |
|---|---|---|
| **Q1** | OpenClaw tag source | **All tags from OpenClaw skills in the merged manifest** (parallel to `extractEnvoyHarnessTags`) |
| **Q2** | Veto vs. override | **Veto** — any OpenClaw tag in the prompt routes to OpenClaw, regardless of positive signals. The user can override with `!eh`. |
| **Q3** | Precedence | **`!openclaw` > `!eh` > OpenClaw tag > EH tag > default** (explicit prefixes win over implicit tags) |
| **Q4** | EH+OpenClaw shared tag | **EH wins** — when a tag is in BOTH lists, the positive rule wins. The user can use `!openclaw` to force OpenClaw. |
| **Q5** | Tag matching algorithm | **Same as v1.1** — word-boundary for single-word tags, exact substring for hyphenated tags |
| **Q6** | Tag scan prompt source | **Original prompt** (consistent with v1.1 + v1.2 + v1.6) |
| **Q7** | Opt-in-disabled interaction | **Opt-in-disabled wins** (the router short-circuits before the OpenClaw tag scan) |
| **Q8** | Tauri chat badge | **Same label as `opt-out-explicit`** ("Used the free built-in assistant for this one") — the chat user doesn't need to distinguish why OpenClaw was chosen |
| **Q9** | Empty `openClawTags: []` | **No negative signal scan** (v1.6 behavior preserved) |
| **Q10** | Backward compat | **`undefined` = no negative signal scan** (additive; existing callers keep v1.6 behavior) |
| **Q11** | Tauri UI scope | **Backend + design doc only** (consistent with v1.4 + v1.5 + v1.6) |
| **Q12** | Manifest staleness | **Read on every `runOwnerAgentTurnViaRuntime` call** (sync; consistent with v1.1) |

## Commit log (2026-08-21)

| Commit | Sub-chunk | Description |
|---|---|---|
| (1 commit, user-delegated) | v1.7.1 + v1.7.2 + v1.7.3 bundled | 1 commit on `envoy_harness_integration` branch. v1.7.1: `extractOpenClawTags` (parallel to v1.1's `extractEnvoyHarnessTags`) + `openClawTags?` on `RouteUserPromptInput` + `scanOpenClawSignals` helper + new opt-out branch in `routeUserPrompt` with `reason: "openclaw-tag-match"` + 9 unit tests for the negative-signal scan + 7 unit tests for the extractor. v1.7.2: `readManifestView` extended with `openClawTags` field + 3 e2e tests for the OpenClaw tag dispatch. v1.7.3: doc closeout (this DONE stamp + `agent-harness-integration.md` change log entry + `agent-network-engine.md` §2.2.2 update + `agent-harness-integration-v1-1.md` + `agent-harness-integration-v1-6.md` status notes + `taui-agent-routing-settings.md` §13). |

**Total:** 1 commit, 19 new tests (9 + 7 + 3), 240 pre-existing tests regression-clean on the affected paths. No new type errors. The **end-user-first** principle from `AGENTS.md` drove the framing: the Tauri chat badge for `"openclaw-tag-match"` uses the same label as `opt-out-explicit` ("Used the free built-in assistant for this one") — the chat user doesn't need to distinguish why OpenClaw was chosen.

## What landed in v1.7 (key file references)

**Backend (Node side):**
- `apps/node/src/manifest-envoy-harness-tags.ts` — new `extractOpenClawTags(manifest)` (parallel to the v1.1 `extractEnvoyHarnessTags`)
- `apps/node/src/user-prompt-router.ts` — new `openClawTags?` field on `RouteUserPromptInput` + new `scanOpenClawSignals` helper + new opt-out branch in `routeUserPrompt` (veto) + `RouteUserPromptDecision.reason` gains `"openclaw-tag-match"`
- `apps/node/src/node-service-handlers-run-owner-agent-turn.ts` — `readManifestView` extended with `openClawTags` field + `routeUserPrompt` call threads the field
- `packages/api/src/owner-agent-loop.ts` — `OwnerAgentTurnResult.routingReason` gains `"openclaw-tag-match"`

**Tests:**
- `apps/node/test/user-prompt-router.test.ts` — 9 new unit tests (veto + `!eh` override + opt-in-disabled + shared tag + `openClawTags: undefined` / `[]` + hyphenated tag + v1.5 hint interaction)
- `apps/node/test/manifest-openclaw-tags.test.ts` (NEW) — 7 unit tests (basic case + exclude non-OpenClaw + dedup + empty manifest + no OpenClaw skills + insertion order + mirror-symmetric)
- `apps/node/test/run-owner-agent-turn-routing.test.ts` — 3 new e2e tests (OpenClaw tag → OpenClaw + veto + `!eh` override)

**Docs:**
- `docs/agent-harness-integration-v1-7.md` (NEW) — this sub-plan + DONE stamp
- `docs/agent-harness-integration.md` — change log entry
- `docs/agent-network-engine.md` — §2.2.2 v1.7 section
- `docs/agent-harness-integration-v1-1.md` — v1.7 status note (v1.7 implements Q4 of the v1.1 sub-plan, deferred to v1.7)
- `docs/agent-harness-integration-v1-6.md` — v1.7 status note (v1.7 builds on v1.6's `!openclaw` opt-out)
- `docs/taui-agent-routing-settings.md` — §13 (Tauri chat badge for `"openclaw-tag-match"`; same label as `opt-out-explicit` per Q8)
