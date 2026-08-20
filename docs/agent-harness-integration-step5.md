# envoy-harness integration — Step 5 sub-plan (signal-based auto opt-in)

> **Status:** Draft (2026-08-20). Detailed sub-plan for
> Step 5. Companion to
> [`agent-harness-integration.md`](./agent-harness-integration.md) (the
> design) and
> [`agent-harness-integration-step3-4.md`](./agent-harness-integration-step3-4.md)
> (the high-level plan).
>
> **What this doc covers:** Step 5 in **concrete
> detail** — every file path, every type, every
> test, every commit boundary, and the design
> questions for team sign-off. Read the design doc
> for "why"; read this for "exactly what to build".
>
> **Order:** Step 5 ships after Step 4 (merged
> manifest, done 2026-08-20). Step 6 (cross-verify)
> follows Step 5.

## 1. Goal

**Tauri EnvoyAI user prompts route to Built-in OpenClaw by default;
signal-bearing prompts auto opt-in to envoy-harness.** Signal-bearing
= prompt text contains a mesh keyword, an envoy-harness tool name, or
an explicit hint prefix.

**Why this matters (Q3 D — the design decision):**

- OpenClaw is mature, battle-tested, and the user default.
- Switching the default would surface every envoy-harness rough edge
  in every chat.
- envoy-harness has **novel features** (mesh-native sub-agents,
  federated scoreboard, `lsp_*` tools, multi-provider LLM, cost cap,
  3-tuple reputation, `JsonLinesTracer`, persisted sessions) that
  OpenClaw does not have and will not add. These features earn their
  place when signal-bearing prompts reach them.
- A signal-based router lets envoy-harness **prove itself** on
  relevant tasks without disrupting ordinary chat.

**After Step 5:** an owner types *"summarize this article"* → OpenClaw
(default). The same owner types *"spawn a federated mesh sub-agent to
verify this verifier rule with cost cap 0.50"* → envoy-harness. The
choice is automatic; the user can override with an explicit hint.

## 2. Existing pieces (what we build on)

### 2.1 The Tauri user-prompt entry point

**File:** `apps/node/src/node-service-handlers-run-owner-agent-turn.ts:57`

`runOwnerAgentTurnViaRuntime(ctx, message, options)` is the function
the Social UI calls when the user types into EnvoyAI. Today's flow
(per §3 of the file):

1. `ensureOpenClawReady()` — if OpenClaw is up, `askOpenClaw(...)` is
   called. Result is wrapped as `OwnerAgentTurnResult { modelUsed:
   "openclaw" }`.
2. If OpenClaw throws or is unavailable → fall back to scripted-tutor
   (when no model is configured).
3. If no tutor reply → fall back to native LLM planner
   (`runDocumentAgentTurnCore`).

**The router plugs in between step 1 and step 2.** When the prompt is
signal-bearing AND envoy-harness is ready → call
`ctx.askEnvoyHarness(...)` instead of `ctx.askOpenClaw(...)`. Result
gets `modelUsed: "envoy-harness"`.

### 2.2 `askEnvoyHarness` + `isEnvoyHarnessReady`

**File:** `apps/node/src/node-service-impl.ts:4871` (ask) and
`apps/node/src/node-service-impl.ts:4833` (ready probe)

Already implemented in Step 2 / b3. The runtime is `RealEnvoyHarnessRuntime`
from `apps/node/src/agent-runtime-envoy/runtime.ts:259`. The
`isEnvoyHarnessReady()` probe is **synchronous** (reads the resolved
config without constructing the model adapter). The `askEnvoyHarness`
call is async.

**Readiness contract** (per
[`agent-runtime-envoy/config.ts:48`](../../apps/node/src/agent-runtime-envoy/config.ts)):
`ready: true` requires a parseable `<provider>:<model>` AND a
non-empty API key (or keyless provider). The reason string is
non-null when not ready — surface this in the log.

### 2.3 Existing router pattern

**Reference:** `apps/node/src/reputation-router.ts:21`

Pure function `rankProviders(providers, opts)` → ranked list. No
state, no I/O. Tests inject the input and assert on the output.

The new prompt router follows the same shape: pure function
`routeUserPrompt(prompt, ctx) → { runtime, matchedSignals, reason }`,
called from the orchestration context. No state.

### 2.4 Per-node config + env-var knobs

`PersistedNodeConfig` (the on-disk node config) already carries
`agentNetworkWorkerEngine: "openclaw" | "ext" | "envoy-harness"`. The
**signal-based opt-in is orthogonal** to that — it's about Tauri user
prompts, not Team jobs. The natural surface is an env var for v0
(consistent with `ENVOY_HARNESS_MODEL` / `ENVOY_HARNESS_API_KEY`):

| Env var | Default | Effect |
|---|---|---|
| `ENVOY_HARNESS_SIGNAL_OPT_IN` | `enabled` | When `disabled`, signal router never picks envoy-harness (always OpenClaw). |

The Tauri settings UI field is a follow-up (out of scope for v0 —
matches the Step 3 "always opt-in via code" pattern that landed the
Tauri UI rewrite as separate work).

### 2.5 The `OwnerAgentTurnResult` shape

**File:** `packages/api/src/owner-agent-turn.ts` (canonical)

The result already carries `modelUsed: string`. Step 5 adds one
field:

```ts
interface OwnerAgentTurnResult {
  // ... existing
  /** The runtime that actually handled the prompt. v0: "openclaw" |
   *  "envoy-harness" | "scripted-tutor" | "native". The router's
   *  decision is reflected here. */
  modelUsed: "openclaw" | "envoy-harness" | "scripted-tutor" | "native";
  /** Which signals (if any) the router matched. Empty when the
   *  prompt was routed to OpenClaw by default. Used for the
   *  Social UI "routed by signal" badge + debugging. */
  routingSignals?: ReadonlyArray<string>;
  /** Why the router made its choice. "default" = OpenClaw because no
   *  signal matched; "mesh-keyword: <token>" = envoy-harness because
   *  the token triggered a match; "envoy-harness-unready" = signal
   *  matched but envoy-harness wasn't ready so we fell back to
   *  OpenClaw. */
  routingReason?: string;
}
```

The Social UI can show a small "→ envoy-harness (mesh keyword: mesh)"
badge from `routingReason`. Out of scope for Step 5 implementation
(only the result fields land); the UI badge is a future task.

## 3. Design

### 3.1 Routing pipeline

```text
Social UI prompt
   ↓
runOwnerAgentTurnViaRuntime(ctx, message)
   ↓
routeUserPrompt(message, { isEnvoyHarnessReady, signalOptIn })
   ↓
   ├─ signalOptIn === "disabled"   →  { runtime: "openclaw", reason: "opt-in-disabled" }
   ├─ no signal matched            →  { runtime: "openclaw", reason: "default" }
   ├─ signal matched & EH ready    →  { runtime: "envoy-harness", reason: "signal:<token>", signals: [...] }
   └─ signal matched & EH not ready → { runtime: "openclaw", reason: "envoy-harness-unready", signals: [...] }
   ↓
dispatch(ctx, message, decision)
   ↓
OwnerAgentTurnResult { modelUsed, routingSignals, routingReason }
```

The dispatch is a 1-line change in `runOwnerAgentTurnViaRuntime`:
check the decision, call `askOpenClaw` or `askEnvoyHarness` based on
`decision.runtime`. The OpenClaw try/catch + tutor + native fallback
chain is preserved.

### 3.2 The router function (pure, testable)

**File (proposed):** `apps/node/src/user-prompt-router.ts`

```ts
/** v0: keyword + tool-name + hint-prefix matching. */
export interface SignalMatch {
  /** The matched token, e.g. "mesh", "lsp_*", "!eh". */
  token: string;
  /** The category, e.g. "mesh-keyword", "tool-name", "explicit-hint". */
  category: "mesh-keyword" | "tool-name" | "explicit-hint";
  /** Where in the prompt (offset). Useful for logs + UI debug. */
  offset: number;
}

export interface RouteUserPromptInput {
  /** The raw prompt text. */
  prompt: string;
  /** Is envoy-harness configured and ready? (sync probe). */
  isEnvoyHarnessReady: boolean;
  /** The reason envoy-harness isn't ready, when applicable. */
  envoyHarnessUnreadyReason?: string;
  /** Is the per-node opt-in enabled? */
  signalOptIn: "enabled" | "disabled";
}

export interface RouteUserPromptDecision {
  /** The chosen runtime. */
  runtime: "openclaw" | "envoy-harness";
  /** Why. See §2.5. */
  reason:
    | "default"
    | "opt-in-disabled"
    | "signal"
    | "envoy-harness-unready";
  /** The matched signals. Empty when `runtime === "openclaw"` and
   *  `reason !== "envoy-harness-unready"`. */
  signals: ReadonlyArray<SignalMatch>;
}

export function routeUserPrompt(
  input: RouteUserPromptInput,
): RouteUserPromptDecision;
```

The function is **pure** — no I/O, no side effects. Every test
asserts on the return value, never mocks the clock or the network.

### 3.3 Signal categories (v0)

**Three categories, six signal types.** Each is matched as a
case-insensitive substring on the prompt text:

| Token | Category | Example match |
|---|---|---|
| `mesh` | mesh-keyword | "set up a **mesh** sub-agent" |
| `federated` | mesh-keyword | "**federated** scoreboard query" |
| `cross-node` | mesh-keyword | "**cross-node** verifier rule" |
| `lsp_*` (regex) | tool-name | "use **lsp_goto_definition** on this file" |
| `RemoteMeshSubmitter` | tool-name | "spawn via **RemoteMeshSubmitter**" |
| `FanOutSpec` | tool-name | "build a **FanOutSpec**" |
| `!eh` / `/eh` (hint prefix) | explicit-hint | "**!eh** translate this to French" |

**Why hint prefix (`!eh` or `/eh`):** gives the user a way to force
envoy-harness even when the prompt doesn't contain a mesh keyword.
The hint is stripped from the prompt before dispatch
(so the LLM doesn't see "!eh translate this" — it sees
"translate this").

**Why `lsp_*` as a regex, not a fixed list:** envoy-harness exposes
`lsp_goto_definition`, `lsp_find_references`, `lsp_hover`,
`lsp_document_symbols`, etc. A regex matches the family without
hard-coding each tool. The match checks for the literal `lsp_` at a
word boundary.

**What's NOT in v0:**

- **Cost cap** — requires a UI affordance (the user types
  `/cost:0.5` to set it). The chat path doesn't have a cost-cap
  parameter today. v0: skip; v1 when the chat UI adds a cost
  field.
- **Multi-provider** — same reason. The user can configure the
  provider in settings; the prompt can't override per-message in
  v0. v1: a `/provider:openai` hint prefix.
- **Capability-tag-based detection (v1)** — once the merged
  manifest exposes structured capability tags (e.g.
  `tags: ["mesh", "lsp", "federated"]`), the router can read
  `getNodeManifest()` and match. v0: keyword only.

### 3.4 Test strategy

**Unit tests for `routeUserPrompt`** (in
`apps/node/test/user-prompt-router.test.ts`):

- No signal → `openclaw` (default)
- Single mesh keyword → `envoy-harness` (signal)
- Multiple keywords → `envoy-harness` (signals contains all)
- `!eh` hint prefix → `envoy-harness` (explicit-hint)
- `/eh` hint prefix → `envoy-harness` (explicit-hint)
- `lsp_goto_definition` → `envoy-harness` (tool-name, regex)
- `mesh` keyword + EH unready → `openclaw` (envoy-harness-unready, signals still populated)
- opt-in disabled → `openclaw` (opt-in-disabled, regardless of signals)
- empty prompt → `openclaw` (default)
- whitespace-only prompt → `openclaw` (default)
- hint prefix at offset N → `signals[0].offset === N` (verify offset)
- case-insensitive: `MESH` matches → `envoy-harness`
- substring false positive: `"meshes"` (plural) — the test asserts
  it matches too (we accept the false positive for v0; tightening
  is a v1 task)

**E2E tests** (in
`apps/node/test/run-owner-agent-turn-routing.test.ts`):

- `runOwnerAgentTurnViaRuntime` with a signal-bearing prompt →
  `askEnvoyHarness` called, `modelUsed: "envoy-harness"`
- Same with no signal → `askOpenClaw` called, `modelUsed: "openclaw"`
- Signal-bearing + EH unready → `askOpenClaw` called,
  `modelUsed: "openclaw"`, `routingReason: "envoy-harness-unready"`
- opt-in disabled + signal → `askOpenClaw` called,
  `modelUsed: "openclaw"`, `routingReason: "opt-in-disabled"`

**Hermetic:** all tests use a fake `askOpenClaw` and `askEnvoyHarness`
on the context. No real LLM, no real network. The e2e is run as part
of `pnpm test` (no opt-in env var needed for hermetic tests).

### 3.5 Logging + observability

Every routing decision logs one structured line:

```text
[user-prompt-router] decision=envoy-harness reason=signal signals=[mesh, lsp_*] prompt_chars=87 duration_ms=0
[user-prompt-router] decision=openclaw reason=default prompt_chars=42
[user-prompt-router] decision=openclaw reason=envoy-harness-unready signals=[mesh] unready=envoy_harness_api_key_missing
[user-prompt-router] decision=openclaw reason=opt-in-disabled prompt_chars=42
```

The logger is the host's `console.log` (matches the existing
`runOwnerAgentTurnViaRuntime` style). Future: ship to the same
log stream as the agent activity hooks.

### 3.6 Per-prompt vs per-node opt-in

**v0:** per-node only (env var). The user flips the switch once for
the whole node.

**Why no per-prompt opt-out in v0:** the user wants envoy-harness
signals to "earn" their place. Adding per-prompt opt-out (= a
"!openclaw" hint) would defeat the data collection. We log the
routing decision so the owner can see what fired; if a signal is
mis-firing, the v0 path is the env var. v1 can add a per-prompt
opt-out.

## 4. Design questions for team sign-off

> These are the choices that need a decision before implementation
> starts. **Defaults proposed in bold**; flip if you disagree.

| # | Question | Default (proposed) | Alternative |
|---|---|---|---|
| **Q1** | File name | **`user-prompt-router.ts`** | `agent-network-router.ts` (per design doc) |
| **Q2** | Hint prefix syntax | **`!eh` or `/eh`** (both) | Only `/eh` (slash = UI-friendly) |
| **Q3** | Cost cap + multi-provider in v0 | **Skip** (defer to v1 with UI affordance) | Add as hint prefixes (`/cost:0.5`, `/provider:openai`) |
| **Q4** | When EH matched but unready | **Fall back to OpenClaw** with `routingReason: "envoy-harness-unready"` | Fail loud (return error, no OpenClaw fallback) |
| **Q5** | Per-node opt-out mechanism | **`ENVOY_HARNESS_SIGNAL_OPT_IN=disabled` env var** | PersistedNodeConfig field (requires schema migration) |
| **Q6** | Substring false positives (`"meshes"` matches) | **Accept in v0**, tighten regex in v1 | Tighten to word boundary in v0 (more false negatives) |
| **Q7** | E2E test opt-in | **Always run** (hermetic; no API key needed) | Opt-in via `RUN_ROUTING_E2E=1` (matches `RUN_B_CLASS_E2E=1` pattern) |
| **Q8** | Hint prefix stripping | **Strip from prompt before dispatch** | Pass hint through (LLM sees `!eh translate this`) |
| **Q9** | Doc location for default routing table | **`agent-network-engine.md` §2** (where the doc already references Step 5) | New `docs/user-prompt-routing.md` |

## 5. Plan

### Sub-chunk 5.1 — the router pure function + unit tests (1 commit)

- New: `apps/node/src/user-prompt-router.ts` — the pure
  `routeUserPrompt(input) → decision` function (§3.2)
- New: `apps/node/test/user-prompt-router.test.ts` — ~12 unit
  tests covering every signal category + every fallback path
  (§3.4)
- No host wiring yet — this is the algorithm in isolation

### Sub-chunk 5.2 — host wiring into `runOwnerAgentTurnViaRuntime` (1 commit)

**Plan deviation:** the `OwnerAgentTurnResult` field
additions (`modelUsed: "envoy-harness"`,
`routingSignals`, `routingReason`) were originally
planned for 5.3, but they landed in 5.2 because the
dispatch needs `modelUsed: "envoy-harness"` to compile
+ the routing fields are tightly coupled with the
router integration. 5.3 is now doc-only.

- Modify: `apps/node/src/node-service-handlers-run-owner-agent-turn.ts`
  — read `isEnvoyHarnessReady()` + `ENVOY_HARNESS_SIGNAL_OPT_IN`,
  call `routeUserPrompt`, dispatch based on decision;
  strip hint prefix before any LLM call; populate
  routing fields on every result branch
- Modify: `RunOwnerAgentTurnContext` — add
  `isEnvoyHarnessReady(): boolean` +
  `askEnvoyHarness(prompt): Promise<string>` +
  `signalOptIn: "enabled" | "disabled"` (3 new fields)
- Modify: `apps/node/src/node-service-contexts.ts` —
  add 3 fields to `RunOwnerAgentTurnContextDeps` +
  wire them in `buildRunOwnerAgentTurnContext`
- Modify: `apps/node/src/node-service-impl-service-deps.ts` —
  pass the 3 new deps (reads `host.isEnvoyHarnessReady`,
  `host.askEnvoyHarness`, and `readSignalOptInEnv()`)
- Modify: `packages/api/src/owner-agent-loop.ts` —
  add `"envoy-harness"` to `modelUsed` enum, add
  `routingSignals?: ReadonlyArray<string>` +
  `routingReason?: "default" | "signal" | "envoy-harness-unready" | "opt-in-disabled"`
  to `OwnerAgentTurnResult`
- Modify: `packages/api/src/node-service.ts` —
  mirror the new `modelUsed` enum on
  `ChatMessage.metadata.assistantTurn.modelUsed`
- Modify: `apps/node/test/node-service-handlers-run-owner-agent-turn.test.ts`
  — add 3 default fields to `makeCtx` (no-op change
  for existing tests; ensures the new context shape
  is satisfied at runtime)
- New: `apps/node/test/run-owner-agent-turn-routing.test.ts` —
  23 e2e tests covering every branch + hint stripping
  + deep-fallback chain + persistence invariant
- Existing 4-test `node-service-handlers-run-owner-agent-turn`
  snapshot stays regression-clean
- Existing 32-test sponsor-friend snapshot stays regression-clean
- Existing 9-test agent-runtime-envoy-runtime snapshot stays regression-clean
- Existing 14-test agent-adapter-manifest-aggregate* snapshots
  stay regression-clean

### Sub-chunk 5.3 — doc closeout (1 commit)

- Modify: `docs/agent-network-engine.md` §2 — add the default
  routing table (Q3 D from the design doc)
- Modify: `docs/agent-harness-integration.md` §5 — mark Step 5
  ✅ DONE
- Modify: `docs/agent-harness-integration-step3-4.md` — add
  Step 5 status

**Total: 3 commits, all on `envoy_harness_integration` branch.**

## 6. Out of scope (deferred)

- **Capability-tag-based signal detection (v1)** — once the merged
  manifest exposes structured capability tags, the router can read
  them. v0: keyword only.
- **Tauri settings UI field for opt-in** — the env var is the v0
  surface. The Tauri AI Engine settings UI rewrite (already
  mentioned in the design doc §6) is a separate task.
- **Social UI "routed by signal" badge** — the
  `OwnerAgentTurnResult.routingReason` field lands in Step 5, but
  rendering the badge in the Social UI is a Social-team task.
- **Per-prompt opt-out** — v0 is per-node only. v1 can add a
  `!openclaw` hint.
- **Cost cap + multi-provider signals** — needs UI affordances
  the chat path doesn't have today. v0 skips; v1 adds hint
  prefixes when the chat UI supports them.
- **ML-based signal classification** — explicitly not on the
  roadmap. Keyword + explicit hint is enough for the v0 signal
  set; the merged manifest's capability tags are the structured
  signal v1.

## 7. Open questions

1. **Q1 (file name)** — `user-prompt-router.ts` (proposed) vs
   `agent-network-router.ts` (design doc)? The latter collides
   with the Team-job `agent-network-*` namespace. Proposing the
   former for clarity.
2. **Q2 (hint prefix)** — `!eh` or `/eh`? Proposing both for
   user choice. `/eh` is more UI-friendly (slash commands are
   common in chat UIs).
3. **Q4 (EH unready fallback)** — fall back to OpenClaw
   (proposed) or fail loud? OpenClaw fallback is the safe
   default; fail-loud is honest about the situation.
4. **Q5 (opt-out surface)** — env var (proposed) or persisted
   config field? Env var is consistent with the other
   envoy-harness knobs; persisted config requires a schema
   migration (acceptable but more work).
5. **Q6 (substring false positives)** — accept in v0 (proposed)
   or tighten? The v0 signal set is small enough that
   false positives are cheap; v1 can tighten when the v1
   capability-tag detector lands.

## 8. References

- [`agent-harness-integration.md`](./agent-harness-integration.md)
  (the design — §4.1 Q3 routing table, §5 Step 5 description)
- [`agent-harness-integration-step3-4.md`](./agent-harness-integration-step3-4.md)
  (the high-level plan)
- [`agent-network-engine.md`](./agent-network-engine.md)
  (existing engine policy — §2 will be updated with the
  default routing table)
- [`runOwnerAgentTurnViaRuntime`](../../apps/node/src/node-service-handlers-run-owner-agent-turn.ts:57)
  (the entry point)
- [`askEnvoyHarness` + `isEnvoyHarnessReady`](../../apps/node/src/node-service-impl.ts:4871)
- [`reputation-router.ts`](../../apps/node/src/reputation-router.ts:21)
  (the pure-router pattern we mirror)

---

**Status:** 9 design questions locked (2026-08-20, all
defaults accepted). Step 5 ✅ DONE (2026-08-20;
3 commits — 5.1 router + tests, 5.2 host wiring +
e2e tests, 5.3 doc closeout). See commit log
at the bottom of this doc + the
[`agent-harness-integration.md`](../agent-harness-integration.md)
§9 change log entry.

### Locked decisions (2026-08-20)

| # | Question | Locked answer |
|---|---|---|
| **Q1** | File name | `user-prompt-router.ts` |
| **Q2** | Hint prefix syntax | Both `!eh` and `/eh` |
| **Q3** | Cost cap + multi-provider in v0 | Skip; defer to v1 with UI affordance |
| **Q4** | When signal matched but EH unready | Fall back to OpenClaw with `routingReason: "envoy-harness-unready"` |
| **Q5** | Per-node opt-out surface | `ENVOY_HARNESS_SIGNAL_OPT_IN=disabled` env var |
| **Q6** | Substring false positive policy | Accept in v0; tighten with word boundary in v1 |
| **Q7** | E2E test opt-in policy | Always run (hermetic) |
| **Q8** | Hint prefix stripping | Strip before dispatch |
| **Q9** | Doc location | `docs/agent-network-engine.md` §2 |
