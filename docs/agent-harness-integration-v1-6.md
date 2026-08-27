# envoy-harness integration — v1.6 sub-plan (per-prompt opt-out `!openclaw` + v0 corner-case fix)

> **v1.7 (2026-08-21) status:** v1.7 builds on
> v1.6. The v1.6 `!openclaw` opt-out is the
> **per-prompt explicit** opt-out; v1.7's
> OpenClaw tags are the **per-prompt implicit**
> opt-out (a tag in the prompt that matches an
> OpenClaw skill). Together they form the
> v1.4–v1.7 spectrum: per-node (v1.4 toggle)
> → per-prompt explicit (v1.6 `!openclaw`) →
> per-prompt implicit (v1.7 OpenClaw tag).
> See [`agent-harness-integration-v1-7.md`](./agent-harness-integration-v1-7.md)
> for the v1.7 sub-plan + DONE stamp.

> **Status:** ✅ **DONE** (2026-08-21). 1 commit on
> `envoy_harness_integration` branch (the user
> delegated commit; bundled v1.6.1 + v1.6.2 +
> v1.6.3 into a single commit at the end of v1.6).
> 17 new tests (12 v1.6 `routeUserPrompt`
> integration + 5 v1.6 dispatch e2e) + 221
> pre-existing tests regression-clean on the
> affected paths. No new type errors (pre-existing
> multiformats/ArrayBuffer conflict in
> `packages/network/src/index.ts:2791` unchanged).
>
> **What this doc covers:** v1.6 in **concrete
> detail** — every file path, every type, every
> test, every commit boundary, and the design
> questions for team sign-off.
>
> **What this doc covers:** v1.6 in **concrete
> detail** — every file path, every type, every
> test, every commit boundary, and the design
> questions for team sign-off.
>
> **Order:** Phase 8 v0 + v1.1 + v1.2 + v1.3 +
> v1.4 + v1.5 are done. v1.6 adds the
> **per-prompt opt-out hint** (`!openclaw`) +
> fixes the **v0 corner case** where a v1.5
> inline hint can mask a v0 prefix
> (e.g. `/cost:0.5 !eh translate this` currently
> doesn't strip `!eh` because the original prompt
> doesn't start with `!eh`).

## 1. Goal

**The owner gets a per-prompt way to force a
prompt to OpenClaw regardless of the signal
router's choice.** The owner types
`!openclaw <message>` at the start of the
prompt; the router routes to OpenClaw
unconditionally. This is the **per-prompt
mirror** of the v1.4 per-node opt-in toggle
(an "off switch" for one prompt).

**Why now:** the v1.4 toggle is a per-node
affordance (the owner wants the SIGNAL-BASED
ROUTER OFF for all prompts on the node). v1.6
is the **per-prompt** affordance (the owner
wants THIS prompt to OpenClaw, regardless of
the node's signal-routing policy). The two
compose: the per-node toggle decides whether
the signal router runs; the per-prompt
`!openclaw` overrides the signal router's
choice for a single message.

**The v0 corner case fix** (also v1.6): a v1.5
inline hint before a v0 prefix (e.g.
`/cost:0.5 !eh translate this`) currently
masks the v0 prefix because the v0 scan checks
the **original** prompt. The result: the LLM
sees `!eh translate this` (the `!eh` is
leaked). v1.6 fixes this by **re-scanning the
cleanPrompt** (post v1.5 strip) for v0
prefixes; if the cleanPrompt has a v0 prefix
that the original missed, the cleanPrompt's
prefix wins.

## 2. Existing pieces (what we build on)

### 2.1 v0 mechanism — `HINT_PREFIXES` + `!eh` prefix scan

**File:** `apps/node/src/user-prompt-router.ts:110`

The v0 router has a hardcoded list of "force
to envoy-harness" prefixes:

```ts
const HINT_PREFIXES: ReadonlyArray<string> = [
  "!eh",
  "/eh",
];
```

The signal scanner checks the **trimmed**
prompt for any of these at offset 0 (followed
by whitespace or end-of-string). When matched,
the prefix token (e.g. `!eh`) is reported as
a signal with `category: "explicit-hint"`.

**The v1.6 change:** add `!openclaw` to the
list. The order matters — the first matching
prefix wins. We put `!openclaw` **first** so
that `!openclaw !eh translate` → `!openclaw`
(the opt-out wins), but `!eh !openclaw
translate` → `!eh` (the explicit route wins).
This matches the "the first prefix typed is
the intent" mental model.

### 2.2 v0 corner case — v1.5 hint masks v0 prefix

**File:** `apps/node/src/user-prompt-router.ts:489-499`

The v1.5 hint extraction runs **before** the
signal scan, but the signal scan still uses
the **original** prompt. The result: a v1.5
hint at the start of the prompt (e.g.
/cost:0.5) can mask a v0 prefix later in the
prompt (e.g. !eh).

**The v1.6 change:** after extracting v1.5
hints, re-scan the **cleanPrompt** (post
v1.5 strip) for v0 prefixes. If the
cleanPrompt has a v0 prefix that the original
missed (because a v1.5 hint masked it), use
the cleanPrompt's prefix.

### 2.3 The `reason: "opt-in-disabled"` precedent

**File:** `apps/node/src/user-prompt-router.ts:323-328`

The router's `reason` field is a closed union
of 5 values today. v1.6 adds a 6th:
`"opt-out-explicit"`. The chat badge
(Tauri UI) maps it to a user-friendly label
(e.g. "Used the free built-in assistant").

The `reason` is also exposed on
`OwnerAgentTurnResult.routingReason` in
`packages/api/src/owner-agent-loop.ts:90-95`
— the Tauri UI uses this for the chat badge.

## 3. Design

### 3.1 The hint syntax

**`!openclaw` is the syntax** (Q1 of the v1.6
sub-plan). Rationale:

- The v0 prefix style is `!`-prefixed (`!eh`).
  `!openclaw` follows the same convention.
- The runtime name (`openclaw`) is explicit
  and unambiguous — `!openclaw` means "force
  OpenClaw".
- The alternative `!noclaw` is shorter but
  ambiguous — could be misread as "no claw"
  (some non-command usage).
- The alternative `/openclaw` would be
  inconsistent with the v0 `!eh` style (the
  v0 prefix is `!`, not `/`).

**Position:** start of the trimmed prompt,
followed by whitespace or end-of-string. Same
as v0 `!eh`. The regex is
`^!openclaw(\s|$)/i`.

**The order in `HINT_PREFIXES` is the
precedence order** (Q5):

```ts
const HINT_PREFIXES: ReadonlyArray<string> = [
  "!openclaw",  // Q5: opt-out first (safety net)
  "!eh",
  "/eh",
];
```

If the user types `!openclaw !eh translate`,
`!openclaw` is at offset 0 and wins. If the
user types `!eh !openclaw translate`, `!eh`
is at offset 0 and wins. The "first match
wins" rule matches user mental model ("the
prefix I typed first is my intent").

### 3.2 The router change — opt-out branch

**File:** `apps/node/src/user-prompt-router.ts`
(modify)

The current `routeUserPrompt` flow:

```
1. Opt-in check (opt-in disabled → OpenClaw, reason: "opt-in-disabled")
2. Extract v1.5 inline hints → cleanPrompt
2a. Scan ORIGINAL prompt for signals
3. No signals → OpenClaw, reason: "default"
4. v1.2 per-skill matching
5. Signals matched → check isEnvoyHarnessReady
   5a. per-skill dispatch (envoy-harness, reason: "signal-skill")
   5b. free-form LLM ask (envoy-harness, reason: "signal")
6. EH unready → OpenClaw, reason: "envoy-harness-unready"
```

The v1.6 change inserts a new step **after
step 2a** (after the v1.5 hint extraction +
original prompt scan):

```
1. Opt-in check (unchanged)
2. Extract v1.5 inline hints → cleanPrompt
2a. Scan ORIGINAL prompt for signals
2b. v1.6 — re-scan CLEAN prompt for v0 prefixes (v0 corner case fix)
2c. v1.6 — check for !openclaw opt-out (the new branch)
3. No signals → OpenClaw, reason: "default"
... (unchanged)
```

```ts
// Step 2b — v1.6: re-scan the cleanPrompt for v0 prefixes.
// Fixes the v0 corner case: a v1.5 hint before !eh
// (e.g. `/cost:0.5 !eh translate this`) currently masks
// the !eh because the v0 scan checks the ORIGINAL
// prompt. The cleanPrompt has the v1.5 hint stripped,
// so a v0 prefix at the start of the cleanPrompt is
// detected here.
//
// We only USE the cleanPrompt's signal when the original
// didn't find a v0 prefix. If the original had a v0
// prefix, we keep it (the original is the "explicit"
// prefix; the cleanPrompt's prefix is "derived").
const cleanPromptSignals = scanSignals(
  cleanPrompt,
  input.envoyHarnessTags,
);
const originalHasExplicitHint = signals.some(
  (s) => s.category === "explicit-hint",
);
const cleanPromptHasExplicitHint = cleanPromptSignals.some(
  (s) => s.category === "explicit-hint",
);
const finalSignals =
  cleanPromptHasExplicitHint && !originalHasExplicitHint
    ? cleanPromptSignals
    : signals;

// Step 2c — v1.6: opt-out. `!openclaw` at the start of
// the (final) signal list routes to OpenClaw
// unconditionally. The v1.5 hints are recorded on the
// decision (for the audit log) but NOT threaded to the
// OpenClaw runtime (the dispatch ignores them on the
// OpenClaw path — OpenClaw doesn't have a hint concept).
const explicitHint = finalSignals.find(
  (s) => s.category === "explicit-hint",
);
if (explicitHint?.token === "!openclaw") {
  return {
    runtime: "openclaw",
    reason: "opt-out-explicit",
    signals: finalSignals,
    hintPrefixLength: explicitHint.token.length, // 9
    targetSkill: undefined,
    costCapUsd: hints.costCapUsd,
    providerHint: hints.providerHint,
    cleanPrompt,
  };
}
```

### 3.3 The reason type — closed union extension

**File:** `apps/node/src/user-prompt-router.ts:323-328`
(modify)

```ts
reason:
  | "default"
  | "opt-in-disabled"
  | "opt-out-explicit" // v1.6 — new
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
  | "opt-out-explicit"; // v1.6 — new
```

The Tauri team maps `"opt-out-explicit"` to a
user-friendly label (e.g. "Used the free
built-in assistant for this one" or "Used
OpenClaw"). The internal value stays
developer-jargon for the audit log.

### 3.4 The dispatch — no change

**File:** `apps/node/src/node-service-handlers-run-owner-agent-turn.ts`
(modify: nothing)

The dispatch checks `decision.runtime === "envoy-harness"`
for the EH path; for any other runtime
(including `!openclaw` opt-out), the dispatch
falls through to OpenClaw. The dispatch uses
`effectiveMessage = stripHintPrefix(decision.cleanPrompt, decision)`,
which strips the `!openclaw` prefix (length 9)
just like it strips `!eh` (length 3) today.

**The v1.5 hints are NOT threaded to the
OpenClaw runtime** (consistent with v1.5):
the dispatch only passes `providerHint` +
`costCapUsd` to `askEnvoyHarness` /
`askEnvoyHarnessSkill` (the EH runtime
methods). The OpenClaw path ignores the
hints. This is correct — the user explicitly
opted out of EH, so EH-specific hints are
moot.

### 3.5 Test strategy

**Unit tests in `user-prompt-router.test.ts` (modify):**

- `!openclaw translate this` → routes to OpenClaw, `reason: "opt-out-explicit"`, `hintPrefixLength: 9`
- `!openclaw mesh` → routes to OpenClaw (the mesh signal is overridden by the opt-out)
- `!openclaw` with v1.5 hints (e.g. `!openclaw translate /cost:0.5 /provider:openai`) → routes to OpenClaw, hints are stripped from cleanPrompt, `costCapUsd: 0.5`, `providerHint: "openai"`
- `!eh !openclaw translate` → routes to EH (`!eh` is at the start; order matters)
- `!openclaw !eh translate` → routes to OpenClaw (`!openclaw` is at the start; order matters)
- `!openclaw` is case-insensitive (e.g. `!OPENCLAW translate` matches)

**v0 corner-case fix tests (unit):**

- `/cost:0.5 !eh translate this` → cleanPrompt re-scan detects `!eh`, routes to EH, `hintPrefixLength: 3`
- `/cost:0.5 !openclaw translate this` → cleanPrompt re-scan detects `!openclaw`, routes to OpenClaw
- `!eh /cost:0.5 translate this` → original scan detects `!eh` (no re-scan needed); `!eh` wins
- `mesh /cost:0.5 !eh translate this` → original scan detects `mesh` (a v1.1 dynamic tag), no explicit-hint; cleanPrompt re-scan finds `!eh`; `!eh` wins over `mesh`

**E2E tests in `run-owner-agent-turn-routing.test.ts` (modify):**

- `!openclaw translate this` → OpenClaw is called, `modelUsed: "openclaw"`, `routingReason: "opt-out-explicit"`
- `!openclaw mesh` → OpenClaw is called, `routingReason: "opt-out-explicit"`, the mesh signal is in `routingSignals` but the runtime is OpenClaw
- `!openclaw mesh /provider:openai /cost:0.5` → OpenClaw is called, the cleanPrompt (with `!openclaw` + v1.5 hints stripped) is what OpenClaw sees; the v1.5 hints are NOT passed to OpenClaw
- `/cost:0.5 !eh translate this` → EH is called (v0 corner case fix), `routingReason: "signal"`, the `!eh` is stripped, the LLM sees only `translate this`
- `!openclaw` is case-insensitive in the e2e dispatch

## 4. Design questions for team sign-off

> These are the choices that need a decision
> before implementation starts. **Defaults
> proposed in bold**; flip if you disagree.

| # | Question | Default (proposed) | Alternative |
|---|---|---|---|
| **Q1** | Hint syntax | **`!openclaw`** — explicit, follows the v0 `!eh` prefix style | `!noclaw` (shorter, ambiguous); `/openclaw` (inconsistent with v0 `!` prefix style) |
| **Q2** | Hint position | **Start of trimmed prompt** (consistent with v0 `!eh`); the regex is `^!openclaw(\s|$)/i` | Inline (anywhere) — would require a new "inline opt-out" category, more complex |
| **Q3** | Scope | **OpenClaw only** — the v1.6 hint forces OpenClaw | Per-runtime opt-out (e.g. `!openclaw` → OpenClaw, `!eh` → EH) — but `!eh` is already at-start, so this is just `!openclaw` for v1.6; per-runtime opt-in is the v1.4 toggle's job |
| **Q4** | Precedence | **`!openclaw` wins always** — the per-prompt opt-out is the most explicit; it overrides the v1.4 per-node opt-in toggle, the v1.1 signal router, the v1.2 per-skill dispatch, and the v1.5 inline hints | `!openclaw` only wins when no `!eh` / `/eh` is also present (first-prefix-wins at start) — but the order in `HINT_PREFIXES` already gives us this |
| **Q5** | Order in `HINT_PREFIXES` | **`!openclaw` first** — the opt-out is the safety net; `!openclaw !eh ...` → OpenClaw, `!eh !openclaw ...` → EH | `!eh` / `/eh` first (the explicit route) — `!openclaw !eh ...` → EH, `!eh !openclaw ...` → EH (the explicit route always wins) |
| **Q6** | v1.5 hint interaction | **Strip v1.5 hints from cleanPrompt; ignore them on the OpenClaw path** — the user opted out of EH, so EH-specific hints are moot. The hints are still recorded on the decision (audit log). | Pass the v1.5 hints to OpenClaw (but OpenClaw doesn't support them; would need a future OpenClaw-side change) |
| **Q7** | Opt-in-disabled interaction | **Opt-in-disabled wins over `!openclaw`** — the router short-circuits before the opt-out check. `!openclaw` is a signal-based opt-out; the v1.4 opt-in-disabled is a node-wide policy. The opt-in check is the first branch. | `!openclaw` wins over opt-in-disabled (treat the per-prompt opt-out as the most explicit) — but the opt-in check is conceptually a "routing off" switch, not a "routing to X" switch |
| **Q8** | v0 corner-case fix scope | **Re-scan the cleanPrompt for v0 prefixes; use the cleanPrompt's prefix only when the original didn't have one** — the original is "explicit", the cleanPrompt's prefix is "derived" (post v1.5 strip) | Always re-scan the cleanPrompt; if the cleanPrompt has a v0 prefix, use it (regardless of whether the original had one) — could cause regressions if the original had a different prefix |
| **Q9** | Backward compat | **`undefined` = use existing default** — the new `!openclaw` is additive; existing prompts (without `!openclaw`) keep current behavior. No migration. | Force every node to recognize `!openclaw` (no migration needed; this is a router-side change) |
| **Q10** | Tauri UI scope | **Backend + design doc only** — the Tauri team picks up the actual UI in their own workstream; the design doc updates `docs/taui-agent-routing-settings.md` with the chat badge mapping for `"opt-out-explicit"`. v1.6 ships the new reason + the router logic. | Bundle the Tauri UI work in this chunk (the Tauri team commits in the same PR) |

**Defaults at-default (Q1-Q10):** I have no
strong opinion on Q1 (the user already
specified `!openclaw` in the v1 backlog, so
that's the default), Q3 (OpenClaw-only is the
most common case; per-runtime is a v1.6+
future), Q4 (`!openclaw` wins is the
"explicit override" mental model), Q5 (the
order in `HINT_PREFIXES` is the "first match
wins" rule; putting `!openclaw` first is the
"opt-out is the safety net" stance), Q6
(strip + ignore is the simplest; the v1.5
hints are EH-specific, OpenClaw doesn't
support them), Q7 (opt-in-disabled is the
node-wide policy; per-prompt opt-out doesn't
override it), Q8 (re-scan only when the
original missed is the "additive" change;
always re-scan could cause regressions), Q9
(additive, no migration), Q10 (backend +
design doc is the v1.4 + v1.5 pattern).

## 5. Plan

### Sub-chunk v1.6.1 — opt-out hint + v0 corner-case fix (1 commit)

- Modify: `apps/node/src/user-prompt-router.ts` —
  add `!openclaw` to `HINT_PREFIXES` + add
  the opt-out branch in `routeUserPrompt` +
  re-scan the cleanPrompt for v0 prefixes
  (the v0 corner-case fix).
- Modify: `RouteUserPromptDecision` — add
  `"opt-out-explicit"` to the `reason` union.
- Modify: `packages/api/src/owner-agent-loop.ts` —
  add `"opt-out-explicit"` to the
  `routingReason` union.
- New: `apps/node/test/user-prompt-router.test.ts` —
  ~10 unit tests for the opt-out + v0
  corner-case fix.

### Sub-chunk v1.6.2 — dispatch integration (1 commit)

- Modify: `apps/node/src/node-service-handlers-run-owner-agent-turn.ts` —
  no functional change (the dispatch already
  routes non-EH runtimes to OpenClaw). The
  sub-chunk is a comment update + a sanity
  test.
- New: `apps/node/test/run-owner-agent-turn-routing.test.ts` —
  ~5 e2e tests for the opt-out dispatch
  (OpenClaw is called + the cleanPrompt is
  what OpenClaw sees + the v1.5 hints are
  ignored).

### Sub-chunk v1.6.3 — Tauri UI design doc + closeout (1 commit)

- Modify: `docs/taui-agent-routing-settings.md` —
  §11 (Tauri chat badge for `"opt-out-explicit"`)
  + §10 (no change to the per-message UI;
  `!openclaw` is the power-user escape hatch).
- Modify: `docs/agent-harness-integration.md` —
  add v1.6 status to the change log.
- Modify: `docs/agent-network-engine.md` §2.2.2 —
  note v1.6's `!openclaw` opt-out + the v0
  corner-case fix.
- Modify: `docs/agent-harness-integration-v1-5.md` —
  v1.6 status note (v1.6 builds on v1.5).
- New: `docs/agent-harness-integration-v1-6.md` —
  this doc gets the "DONE" stamp.

**Total: 3 sub-chunks, bundled into 1 commit
at the end of v1.6** (per the v1.1 + v1.2 +
v1.3 + v1.4 + v1.5 commit pattern). On
`envoy_harness_integration` branch.

## 6. Out of scope (deferred)

- **Per-runtime opt-out** (`!openclaw` for
  OpenClaw, `!eh` for EH) — v1.6 is
  OpenClaw-only. The v1.4 per-node opt-in
  toggle is the runtime-wide equivalent; the
  v1.6 per-prompt opt-out is the per-message
  equivalent. Per-runtime opt-out (e.g. force
  `!ext` to ext runtime) is a v1.6+ future.
- **Inline opt-out** (e.g. `!openclaw` anywhere
  in the prompt) — v1.6 uses the v0 prefix
  style (start of trimmed prompt). Inline
  opt-out is a v1.6+ future.
- **The Tauri UI implementation** (Q10
  default) — the actual chat badge for
  `"opt-out-explicit"` lives in the Tauri
  monorepo. v1.6 ships the backend + a design
  doc.
- **`reason: "opt-out-explicit"` re-mapping
  to Tauri chat badge labels** — the Tauri
  team maps the internal value to a
  user-friendly label (e.g. "Used the free
  built-in assistant for this one").

## 7. References

- [`agent-harness-integration.md`](./agent-harness-integration.md)
  (the design — Q1 routing, Q5 node config)
- [`agent-harness-integration-v1-1.md`](./agent-harness-integration-v1-1.md)
  (v1.1 dynamic vocabulary)
- [`agent-harness-integration-v1-2.md`](./agent-harness-integration-v1-2.md)
  (v1.2 per-skill routing)
- [`agent-harness-integration-v1-4.md`](./agent-harness-integration-v1-4.md)
  (v1.4 Tauri UI affordances — the per-node
  opt-in toggle that v1.6's `!openclaw`
  complements at the per-prompt level)
- [`agent-harness-integration-v1-5.md`](./agent-harness-integration-v1-5.md)
  (v1.5 inline hints — `extractPromptHints` +
  the v0 corner case that v1.6 fixes)
- [`user-prompt-router.ts`](../../apps/node/src/user-prompt-router.ts)
  (the v0 + v1.1 + v1.2 + v1.3 + v1.5 router;
  v1.6 adds the opt-out branch + the cleanPrompt
  re-scan)
- [`node-service-handlers-run-owner-agent-turn.ts`](../../apps/node/src/node-service-handlers-run-owner-agent-turn.ts)
  (the v1.5 dispatch — uses `decision.cleanPrompt`;
  v1.6 doesn't change the dispatch logic)
- [`owner-agent-loop.ts`](../../packages/api/src/owner-agent-loop.ts)
  (the `OwnerAgentTurnResult.routingReason` —
  v1.6 adds `"opt-out-explicit"` to the union)
- [`taui-agent-routing-settings.md`](./taui-agent-routing-settings.md)
  (the Tauri UI design doc — v1.6 updates the
  chat badge mapping for the new reason)

## Locked decisions (2026-08-21)

| # | Question | Locked answer |
|---|---|---|
| **Q1** | Hint syntax | **`!openclaw`** (the user pre-specified in the v1 backlog; the v0 `!eh` prefix style) |
| **Q2** | Hint position | **Start of trimmed prompt** (consistent with v0 `!eh`; the regex is `^!openclaw(\s|$)/i`) |
| **Q3** | Scope | **OpenClaw only** for v1.6 (per-runtime opt-out is a v1.6+ future) |
| **Q4** | Precedence | **`!openclaw` wins always** when detected; opt-in-disabled wins when the node is opted out (the opt-in check is the first branch) |
| **Q5** | Order in `HINT_PREFIXES` | **`!openclaw` first** (the opt-out is the safety net; `!openclaw !eh ...` → OpenClaw, `!eh !openclaw ...` → EH) |
| **Q6** | v1.5 hint interaction | **Strip v1.5 hints from cleanPrompt; ignore them on the OpenClaw path** (the hints are still recorded on the decision for the audit log) |
| **Q7** | Opt-in-disabled interaction | **Opt-in-disabled wins** (the router short-circuits before the opt-out check; opt-in-disabled is the node-wide policy) |
| **Q8** | v0 corner-case fix scope | **Re-scan the cleanPrompt for v0 prefixes; use the cleanPrompt's prefix only when the original didn't have one** (additive change; no regressions) |
| **Q9** | Backward compat | **`undefined` = use existing default** (the new `!openclaw` is additive; existing prompts keep current behavior) |
| **Q10** | Tauri UI scope | **Backend + design doc only** (the Tauri team picks up the actual UI in their own workstream; consistent with v1.4 + v1.5) |

## Commit log (2026-08-21)

| Commit | Sub-chunk | Description |
|---|---|---|
| (1 commit, user-delegated) | v1.6.1 + v1.6.2 + v1.6.3 bundled | 1 commit on `envoy_harness_integration` branch. v1.6.1: `!openclaw` added to `HINT_PREFIXES` (first) + new opt-out branch in `routeUserPrompt` with `reason: "opt-out-explicit"` + new `cleanPrompt` re-scan step (the v0 corner-case fix) + `RouteUserPromptDecision.reason` + `OwnerAgentTurnResult.routingReason` gain `"opt-out-explicit"` + 12 new unit tests for the opt-out + v0 corner-case. v1.6.2: dispatch integration (no code change — the dispatch already routes non-EH runtimes to OpenClaw) + 5 new e2e tests for the opt-out dispatch. v1.6.3: doc closeout (this DONE stamp + `agent-harness-integration.md` change log entry + `agent-network-engine.md` §2.2.2 update + `agent-harness-integration-v1-5.md` status note + `taui-agent-routing-settings.md` §12). |

**Total:** 1 commit, 17 new tests (12 + 5), 221 pre-existing tests regression-clean on the affected paths. No new type errors. The **end-user-first** principle from `AGENTS.md` drove the framing: the Tauri UI is the primary UX (the chat badge for `"opt-out-explicit"` reads "Used the free built-in assistant for this one" — not the developer-jargon value); the `!openclaw` hint is the power-user escape hatch (the regular user never sees the hint syntax).

## What landed in v1.6 (key file references)

**Backend (Node side):**
- `apps/node/src/user-prompt-router.ts` — `!openclaw` added to `HINT_PREFIXES` (first) + new opt-out branch in `routeUserPrompt` (case-insensitive compare against `!openclaw`) + new `cleanPrompt` re-scan step (the v0 corner-case fix) + `RouteUserPromptDecision.reason` gains `"opt-out-explicit"`
- `packages/api/src/owner-agent-loop.ts` — `OwnerAgentTurnResult.routingReason` gains `"opt-out-explicit"`

**Tests:**
- `apps/node/test/user-prompt-router.test.ts` — 12 new unit tests (7 for the `!openclaw` opt-out + 5 for the v0 corner-case fix)
- `apps/node/test/run-owner-agent-turn-routing.test.ts` — 5 new e2e tests (the opt-out dispatch + the v0 corner-case fix in the e2e flow)

**Docs:**
- `docs/agent-harness-integration-v1-6.md` (NEW) — this sub-plan + DONE stamp
- `docs/agent-harness-integration.md` — change log entry
- `docs/agent-network-engine.md` — §2.2.2 v1.6 section
- `docs/agent-harness-integration-v1-5.md` — v1.6 status note (v1.6 builds on v1.5)
- `docs/taui-agent-routing-settings.md` — §12 (Tauri chat badge for `"opt-out-explicit"` + power-user hint tooltip + the v0 corner-case fix background)
