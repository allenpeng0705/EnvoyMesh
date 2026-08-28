# envoy-harness integration — Step 6 sub-plan (cross-verify Q4 A)

> **Status:** Draft (2026-08-20). Detailed sub-plan for
> Step 6. Companion to
> [`agent-harness-integration.md`](./agent-harness-integration.md) (the
> design) and
> [`agent-harness-integration-step3-4.md`](./agent-harness-integration-step3-4.md)
> (the high-level plan for Step 3 + Step 4) +
> [`agent-harness-integration-step5.md`](./agent-harness-integration-step5.md)
> (Step 5 sub-plan).
>
> **What this doc covers:** Step 6 in **concrete
> detail** — every file path, every type, every
> test, every commit boundary, and the design
> questions for team sign-off. Read the design doc
> for "why"; read this for "exactly what to build".
>
> **Order:** Step 6 is the last step in Phase 8 —
> the trust mechanism. Steps 0 / 0+ / 1 / 2 / 3 / 4
> / 5 are all done (2026-08-20). Step 6 ships after
> Step 5.

## 1. Goal

**Team-job verification uses the OTHER runtime as the
verifier by default.** The worker writes; the cross
verifier re-runs the same task on a different runtime;
the verdicts are combined and written to the
`ArbitrationStore` (the scoreboard / transcript).

| Mode (Q4) | Writer | Verifier | When |
|---|---|---|---|
| **(a) `envoy-writes-openclaw-verifies` (default)** | envoy-harness | OpenClaw | Most Team jobs |
| **(b) `openclaw-writes-envoy-verifies` (override)** | OpenClaw | envoy-harness | Security-sensitive or cost-sensitive jobs |
| **`rule-only` (opt-out)** | worker | worker (rule pass only) | Per-node opt-out or jobs that opt out |

**Why this matters (Q4 design):** envoy-harness has
novel features (mesh-native sub-agents, federated
scoreboard, `lsp_*` tools, multi-provider LLM, cost
cap, 3-tuple reputation). OpenClaw is mature with
battle-tested community skills. Combining them —
envoy-harness writes, OpenClaw verifies (or
vice-versa) — gets the best of both. The verifier
re-runs the same task on a different runtime, so a
disagreement surfaces as `disputed` + `needsHuman:
true` (per the existing `combineToVerdict` policy).

**After Step 6:** A Team job with
`verifyMode: "cross-runtime"` (the Q4 (a) default
for envoy-writes jobs) always runs the cross
verifier. The verdicts land in the
`ArbitrationStore`; the scoreboard reflects both
verdicts; the orchestrator's existing
disagreement-verifier compares the two results.

## 2. Existing pieces (what we build on)

### 2.1 The orchestrator's verify loop — `chain-verify-loop.ts`

**File:** `apps/node/src/chain-verify-loop.ts:189`

`runChainVerificationLoop(deps, state, envelope,
payload)` is the orchestrator's verify flow (Phase 41
/ MAP). Today:

1. **Rule pass** — `adapter.verify({result, objective})`
   (the worker's runtime's verifier rules — F1.4d's
   6 default rules from
   `@envoymesh/envoy-harness`).
2. **Escalation gate** —
   `shouldEscalateToCrossAgent(verdict, {mandate,
   criticality})` returns `true` when:
   - verdict is `partial` or `disputed`, AND
   - `criticality === "high"`, OR
   - `maxSensitivity === "private"` AND
     `maxChainCostUsd >= 20` (the
     `CROSS_AGENT_COST_THRESHOLD_USD`).
3. **Cross run** — `pickSecondRuntime(deps, workerRuntime)`
   picks the OTHER runtime;
   `secondAdapter.execute(input)` re-runs the same
   task on it.
4. **Disagreement check** — `crossVerifier.verify({objective,
   resultA, resultB})` compares the two results.
5. **Verdict write** — both `VerdictEntry` (source:
   `"rule"`) + `VerdictEntry` (source: `"cross"`)
   land in the `ArbitrationStore`.

**The gap:** the escalation gate only fires on
`partial`/`disputed`. Step 6 adds a `verifyMode` to
`ChainMandate` that forces the cross run regardless
of the rule verdict (Q4 mode a + b).

### 2.2 `EnvoyHarnessAdapter.verify()` — F9.5

**File:**
`envoy-harness/packages/envoy-harness-adapter/src/adapter.ts:271`

```ts
async verify(input: VerifyInput): Promise<Verdict[]> {
  const local = await runLocalVerifier(input);
  if (!this.crossVerifyWith) return local;
  const cross = await this.crossVerifyWith(input);
  return [...local, ...cross];
}
```

The `crossVerifyWith?: CrossVerifyFn` option is
defined but **not wired by default**. Step 6 wires
it with `defaultCrossVerify(openClawAdapter)`.

### 2.3 `defaultCrossVerify(otherAdapter)` — F9.5

**File:**
`envoy-harness/packages/envoy-harness-adapter/src/verify.ts:288`

Re-runs the same skill on a different `AgentAdapter`
and returns the local verifier's verdicts for the
new result. Used at construction time:

```ts
const adapter = new EnvoyHarnessAdapter({
  buildAgent,
  signResult,
  workerPeerId,
  crossVerifyWith: defaultCrossVerify(openClawAdapter),
});
```

**The gap:** the bridge doesn't currently construct
the adapter with this option. Step 6 wires it.

### 2.4 `LocalCrossRuntimeSubmitter` (Step 2)

**File:**
`envoy-harness/packages/envoy-harness-adapter/src/local-cross-runtime-submitter.ts`

The host-side bridge for cross-runtime sub-agents
(Step 2's `Q1 C` decision). Routes a sub-agent
submission by `preferredRuntime`:
- `envoy-harness` → inner `LocalMeshSubmitter`
- `openclaw` → host-injected `LocalRuntimeBridge`
- unknown → throw

**Step 6 reuses** this pattern for the verify
dispatch: the cross adapter is the OTHER runtime;
the `LocalCrossRuntimeSubmitter` already knows how
to route.

### 2.5 `ChainMandate.criticality`

**File:**
`packages/protocol/src/agent-network.ts:180`

```ts
criticality: z.enum(["normal", "high"]).optional(),
```

Already on the signed mandate; the orchestrator
reads it as the high-criticality escalation trigger
(chain-verify-loop.ts:261). Step 6 adds a sibling
field `verifyMode` next to it.

### 2.6 The ArbitrationStore (the transcript)

**File:** `apps/node/src/chain-arbitration-store.ts`
(referenced from chain-verify-loop.ts).

The orchestrator's authoritative reputation write
(per design §7.1 — workers never self-report).
`VerdictEntry` is the wire record; both rule +
cross verdicts land here. The scoreboard reads
this store. Step 6 doesn't need to touch the
store — the existing write paths in
`chain-verify-loop.ts` already do the right thing
once `verifyMode` drives the escalation.

## 3. Design

### 3.1 The `verifyMode` schema

Add to `UnsignedChainMandateSchema` (next to
`criticality`):

```ts
/**
 * Phase 8 / Step 6 — cross-verify mode (Q4 A).
 * Controls whether the orchestrator runs the
 * cross-runtime verifier (re-runs the same task
 * on the OTHER runtime) in addition to the
 * worker's own rule pass.
 *  - `"rule-only"` (default for OpenClaw-only
 *    jobs; per-node opt-out for envoy-writes
 *    jobs): rule pass only. No cross run.
 *  - `"cross-runtime"` (Q4 (a) default for
 *    envoy-writes jobs): always run cross;
 *    combine verdicts (pass wins over
 *    partial/fail/disputed).
 *  - `"cross-runtime-strict"` (Q4 (b) override
 *    for security/cost-sensitive jobs): always
 *    run cross; cross verdict takes priority
 *    over the rule verdict.
 * Absent = `"rule-only"`.
 */
verifyMode: z.enum(["rule-only", "cross-runtime", "cross-runtime-strict"]).optional(),
```

**Why a per-job field, not a per-node field:**
the per-job choice is the primary surface (per Q4
"per-job override to (b)"). A per-node default
is a follow-up (see §3.4).

### 3.2 Escalation gate — honor `verifyMode`

Update `chain-verify-loop.ts:shouldEscalateToCrossAgent`:

```ts
export function shouldEscalateToCrossAgent(
  verdict: Verdict,
  opts: {
    mandate: ChainMandate;
    criticality?: "normal" | "high";
  },
): boolean {
  // Q4 (a) + (b) — verifyMode forces the cross
  // run regardless of the rule verdict.
  const verifyMode = opts.mandate.verifyMode ?? "rule-only";
  if (verifyMode === "cross-runtime" || verifyMode === "cross-runtime-strict") {
    return true;
  }
  // Existing logic (unchanged) — rule-only mode.
  if (verdict.kind !== "partial" && verdict.kind !== "disputed") return false;
  if (opts.criticality === "high") return true;
  return (
    opts.mandate.maxSensitivity === "private" &&
    opts.mandate.maxChainCostUsd >= CROSS_AGENT_COST_THRESHOLD_USD
  );
}
```

### 3.3 Verdict combining — honor `cross-runtime-strict`

Update `chain-verify-loop.ts:combineToVerdict` to take
a `verifyMode` parameter; in
`cross-runtime-strict` mode, the cross verdict always
wins over the rule verdict:

```ts
export function combineToVerdict(
  verdicts: readonly Verdict[],
  verifyMode: ChainMandate["verifyMode"] = "rule-only",
): Verdict {
  if (verdicts.length === 0) {
    return { kind: "disputed", needsHuman: true, signals: ["verifier produced no verdicts"] };
  }
  // In cross-runtime-strict, the LAST verdict
  // (the cross verdict) takes priority. The
  // runChainVerificationLoop passes the cross
  // verdicts AFTER the rule verdicts; the
  // existing `pass > fail > partial > first`
  // precedence handles the rest.
  if (verifyMode === "cross-runtime-strict") {
    return verdicts[verdicts.length - 1];
  }
  const pass = verdicts.find((v) => v.kind === "pass");
  if (pass) return pass;
  const fail = verdicts.find((v) => v.kind === "fail");
  if (fail) return fail;
  const partial = verdicts.find((v) => v.kind === "partial");
  if (partial) return partial;
  return verdicts[0];
}
```

### 3.4 Per-node default

The design doc's Q4 says "(a) is default". The
default applies to Team jobs that don't set
`verifyMode` explicitly. For envoy-writes jobs,
the default should be `cross-runtime` (Q4 a). For
OpenClaw-writes jobs, the default should be
`rule-only` (no cross, since OpenClaw is the
mature runtime — no novel features to cross-check).

The runtime's default is determined by the
**worker's runtime**:

```ts
function defaultVerifyModeForWorker(workerRuntime: AgentRuntime): VerifyMode {
  return workerRuntime === "envoy-harness"
    ? "cross-runtime"      // Q4 (a)
    : "rule-only";          // OpenClaw is mature; no cross needed
}
```

**v0 surface:** the function is hard-coded.
Future: add a per-node config field for the
owner to flip the default (e.g. always
`cross-runtime-strict` for security-sensitive
deployments).

**Why a function, not a config field:** the Q4
default is a design decision, not an operator
preference. The owner can override per-job via
`ChainMandate.verifyMode`. The per-node opt-out
is a follow-up (out of v0 scope).

### 3.5 `EnvoyHarnessAdapter` cross-verify wiring

Wire `defaultCrossVerify(openClawAdapter)` in the
bridge's adapter construction:

**File:** `envoy-harness/packages/envoy-harness-adapter/src/adapter.ts`

The bridge exports a factory
`buildEnvoyHarnessAdapterWithCrossVerify({buildAgent, signResult, workerPeerId, openClawAdapter})`
that constructs the adapter with
`crossVerifyWith: defaultCrossVerify(openClawAdapter)`
set. The host calls this when it has both adapters
available (e.g. in `apps/node/src/agent-runtime-envoy/factory.ts`).

**Why the bridge owns this, not the host:** the
host doesn't know about
`defaultCrossVerify`. The bridge is the seam
that knows about both envoy-harness and (now) the
cross-verify composition. The factory wraps both.

**v0 limits** (inherited from F9.5):

- `inputArtifacts` is NOT re-passed (the cross
  adapter may not have access to the same
  files; v0 trusts the worker to include any
  needed context in the result content).
- `costCeilingUsd: 0` (the orchestrator is the
  authoritative budget gate; v0 cross-verify
  runs for free to keep the cost predictable).
- `deadlineMs: 30_000` (tight; cross-verify
  should be fast or the orchestrator escalates).

### 3.6 The full flow

```text
Team job lands on a node
   ↓
worker (envoy-harness) executes the subtask
   ↓
worker's final partial arrives at the orchestrator
   ↓
chain-verify-loop.runChainVerificationLoop:
  1. Rule pass: adapter.verify({result, objective})
     → worker-runtime verdicts (e.g. from F1.4d's
     6 default rules)
  2. Escalation gate: shouldEscalateToCrossAgent(ruleVerdict, {mandate, criticality})
     - if verifyMode === "cross-runtime" or
       "cross-runtime-strict" → always escalate
     - else → existing logic (partial/disputed +
       high-criticality or private+expensive)
  3. Cross run (if escalation):
     - pickSecondRuntime(workerRuntime) → the OTHER runtime
     - secondAdapter.execute(input) → re-run the same task
     - crossVerifier.verify({objective, resultA, resultB}) → compare
  4. Verdict combine: combineToVerdict([...rule, ...cross], verifyMode)
     - "rule-only" → existing precedence (pass > fail > partial > first)
     - "cross-runtime" → same precedence (pass wins; cross-disagreement
       surfaces as disputed + needsHuman via the cross verdict)
     - "cross-runtime-strict" → cross verdict always wins
  5. Verdict write: rule + cross VerdictEntry to ArbitrationStore
     (existing write paths; no changes needed)
   ↓
Scoreboard reflects both verdicts
```

### 3.7 The wiring in `factory.ts`

The host's `createEnvoyHarnessAdapter` (in
`apps/node/src/agent-runtime-envoy/factory.ts:67`)
constructs the `EnvoyHarnessAdapter`. Step 6
modifies it to accept an `openClawAdapter?` option
and wire `crossVerifyWith` when present:

```ts
export interface CreateEnvoyHarnessAdapterInput {
  workerPeerId: string;
  config: EnvoyHarnessRuntimeConfig;
  /**
   * Phase 8 / Step 6 — optional OpenClaw adapter
   * for cross-verify. When provided, the envoy-harness
   * adapter's `verify()` is wired with
   * `defaultCrossVerify(openClawAdapter)`. The
   * orchestrator's chain-verify-loop calls
   * `adapter.verify()` and the cross verdict
   * surfaces when `verifyMode: "cross-runtime"`.
   */
  openClawAdapter?: AgentAdapter;
}

export function createEnvoyHarnessAdapter(
  input: CreateEnvoyHarnessAdapterInput,
): AgentAdapter {
  // ... existing build
  const crossVerifyWith = input.openClawAdapter
    ? defaultCrossVerify(input.openClawAdapter)
    : undefined;
  const adapter = new EnvoyHarnessAdapter({
    buildAgent,
    signResult: signResult as never,
    workerPeerId: input.workerPeerId,
    ...(crossVerifyWith ? { crossVerifyWith } : {}),
  });
  return adapter;
}
```

**v0 production wiring:** the host always
provides `openClawAdapter` (the OpenClaw
subprocess is always available; it's the
default AI engine).

### 3.8 Test strategy

**Unit tests in `chain-verify-loop.test.ts`** (additions):

- `verifyMode: "rule-only"` + pass verdict → no cross
- `verifyMode: "rule-only"` + disputed verdict → no cross (unchanged)
- `verifyMode: "cross-runtime"` + pass verdict → cross runs (NEW)
- `verifyMode: "cross-runtime"` + disputed verdict → cross runs (NEW)
- `verifyMode: "cross-runtime-strict"` + pass rule + fail cross → cross wins (fail)
- `verifyMode: "cross-runtime-strict"` + disputed rule + pass cross → cross wins (pass)
- `verifyMode` absent → existing behavior (`rule-only` semantics)
- `defaultVerifyModeForWorker("envoy-harness")` → `"cross-runtime"`
- `defaultVerifyModeForWorker("openclaw")` → `"rule-only"`

**E2E tests in `chain-verify-loop.test.ts`** (additions, hermetic):

- A Team job with `verifyMode: "cross-runtime"` runs the cross-agent verifier
- The cross verdict lands in the `ArbitrationStore`
- A Team job with `verifyMode: "cross-runtime-strict"` uses the cross verdict
- A Team job with `verifyMode: "rule-only"` (or absent) skips cross (existing behavior)

**Bridge unit tests** in
`envoy-harness-adapter/test/adapter.test.ts`
(additions):

- `EnvoyHarnessAdapter` with `crossVerifyWith` set → `verify()` returns `[...local, ...cross]`
- The cross closure is called with the same `VerifyInput`
- The cross closure's failure surfaces as a `disputed` verdict (existing F9.5 behavior)

**v0 production wiring tests:**

- `createEnvoyHarnessAdapter({openClawAdapter})` wires the cross-verify closure
- `createEnvoyHarnessAdapter({})` (no `openClawAdapter`) skips cross-verify (backward compatible)

## 4. Design questions for team sign-off

> These are the choices that need a decision before implementation
> starts. **Defaults proposed in bold**; flip if you disagree.

| # | Question | Default (proposed) | Alternative |
|---|---|---|---|
| **Q1** | `verifyMode` schema values | **`"rule-only"` \| `"cross-runtime"` \| `"cross-runtime-strict"`** | Just two values: `rule-only` + `cross-runtime` (drop strict) |
| **Q2** | `cross-runtime-strict` semantics (when cross disagrees with rule) | **Cross verdict always wins** | Cross verdict wins only when it disagrees; rule wins on agreement |
| **Q3** | Per-node default surface for `verifyMode` | **Function `defaultVerifyModeForWorker(runtime)`** (envoy-harness → cross, openclaw → rule-only) | Add `PersistedNodeConfig.verifyModeDefault` field (requires schema migration) |
| **Q4** | When only one runtime is available (no second for cross) | **Skip cross with audit** (existing behavior; the cross step is no-op when `pickSecondRuntime` returns `undefined`) | Fail loud (the job can't run if `verifyMode` requires cross) |
| **Q5** | `verifyMode: "cross-runtime"` and the budget gate | **Budget gate still applies** (existing behavior — `verify_budget_denied` audit downgrades to rule-only) | Budget gate is bypassed when `verifyMode` forces cross (the owner explicitly opted in) |
| **Q6** | Envoy-harness `verify()` cross closure — what to pass as `inputArtifacts`? | **Empty array** (F9.5 v0 default; the cross adapter may not have access to the same files) | Forward the worker's `inputArtifacts` (the cross adapter may have access) |
| **Q7** | Cross-verify timing — when the cross runs in the orchestrator | **After the rule pass** (existing pattern; both verdicts land in the store) | In parallel with the rule pass (faster, but more complex) |
| **Q8** | `combineToVerdict` behavior on cross-runtime disagreement | **`disputed` + `needsHuman: true`** (existing; surfaced by `CrossAgentDisagreementVerifier`) | Per-mode override: `cross-runtime-strict` = fail, `cross-runtime` = disputed |

## 5. Plan

### Sub-chunk 6.1 — `verifyMode` API + orchestrator wiring (1 commit)

- Modify: `packages/protocol/src/agent-network.ts` — add
  `verifyMode` to `UnsignedChainMandateSchema`
- Modify: `apps/node/src/chain-verify-loop.ts` —
  honor `verifyMode` in `shouldEscalateToCrossAgent`
  + `combineToVerdict`; add
  `defaultVerifyModeForWorker(runtime)` helper
- Modify: `apps/node/src/chain-verify-loop.test.ts` —
  add ~8 unit tests for the new logic
- Existing 32-test sponsor-friend snapshot stays
  regression-clean

### Sub-chunk 6.2 — envoy-harness cross-verify wiring (1 commit)

- Modify: `envoy-harness/packages/envoy-harness-adapter/src/adapter.ts`
  — add a `buildEnvoyHarnessAdapterWithCrossVerify`
  factory that wires
  `crossVerifyWith: defaultCrossVerify(openClawAdapter)`
- Modify: `envoy-harness/packages/envoy-harness-adapter/src/index.ts`
  — re-export the new factory
- Modify: `envoy-harness/packages/envoy-harness-adapter/test/adapter.test.ts`
  — add ~3 unit tests for the cross-verify wiring
- Modify: `apps/node/src/agent-runtime-envoy/factory.ts`
  — add `openClawAdapter?` option to
  `CreateEnvoyHarnessAdapterInput`; wire the cross closure
- Modify: `apps/node/src/agent-runtime-envoy/runtime.ts`
  — thread the `openClawAdapter` through to the factory
- New: `apps/node/test/agent-runtime-envoy-cross-verify.test.ts`
  — ~3 e2e tests for the wiring

### Sub-chunk 6.3 — doc closeout (1 commit)

- Modify: `docs/agent-harness-integration.md` — status
  banner → Step 6 ✅ DONE; Step 6 section marked done
  with sub-chunk breakdown + locked decisions
- Modify: `docs/agent-network-engine.md` §2 — add the
  cross-verify policy (Q4 (a) + (b))
- Modify: `docs/agent-harness-integration-step3-4.md` —
  add Step 5 + Step 6 status
- Modify: `docs/agent-harness-integration-step5.md` —
  status banner → Step 5 ✅ DONE; add Step 6 section

**Total: 3 commits, all on `envoy_harness_integration` branch.**

## 6. Out of scope (deferred)

- **Per-node config field for `verifyModeDefault`** —
  the function `defaultVerifyModeForWorker(runtime)`
  is the v0 default. Per-node override is a follow-up
  (Tauri settings UI field + persisted config migration).
- **Tauri UI surface for the cross verdict** — the
  scoreboard already shows the verdicts. A
  "verifier disagreement" badge is a future task.
- **Cross verifier with a different model on the
  SAME runtime** (F9.5 use case) — that's
  `defaultCrossVerify(anotherAdapterOnSameRuntime)`,
  used for cross-model verification, not cross-runtime.
  v0 cross-verify is cross-runtime only.
- **Scoreboard formula adjustment** — the existing
  `aggregateReputation` reads the ArbitrationStore.
  v0 leaves the formula as-is; the cross verdict is
  one more `VerdictEntry` in the store.

## 7. Open questions

1. **Q1 (schema values)** — 3 values
   (`rule-only` / `cross-runtime` / `cross-runtime-strict`)
   or 2 (drop strict)? Strict is useful for
   security-sensitive jobs but adds complexity.
2. **Q2 (strict semantics)** — cross wins always
   (proposed) or only on disagreement?
3. **Q4 (no-second-runtime)** — skip with audit
   (proposed) or fail loud? Skip is more forgiving
   (the job still runs); fail-loud is stricter.
4. **Q5 (budget + cross)** — does the budget gate
   still apply? Proposed: yes (the audit
   `verify_budget_denied` downgrades to rule-only).
5. **Q6 (cross inputArtifacts)** — empty (proposed)
   or forward from worker? Forwarding is more
   accurate but may fail if the cross adapter
   doesn't have the same files.

## 8. References

- [`agent-harness-integration.md`](./agent-harness-integration.md)
  (the design — §4.2 Q4 cross-verify modes, §5 Step 6)
- [`agent-harness-integration-step5.md`](./agent-harness-integration-step5.md)
  (the Step 5 sub-plan; this doc is the analog for
  Step 6)
- [`chain-verify-loop.ts`](../../apps/node/src/chain-verify-loop.ts)
  (the orchestrator's verify flow; Phase 41 / MAP)
- [`EnvoyHarnessAdapter.verify()`](../../envoy-harness/packages/envoy-harness-adapter/src/adapter.ts:271)
  (F9.5 — the adapter-level verify hook)
- [`defaultCrossVerify()`](../../envoy-harness/packages/envoy-harness-adapter/src/verify.ts:288)
  (F9.5 — the default cross-verify closure)
- [`LocalCrossRuntimeSubmitter`](../../envoy-harness/packages/envoy-harness-adapter/src/local-cross-runtime-submitter.ts)
  (Step 2 — the host-side cross-runtime bridge)

---

**Status:** 8 design questions locked (2026-08-20, all
defaults accepted). Step 6 ✅ DONE (2026-08-20;
3 commits — 6.1 verifyMode API + chain-verify-loop
honors it, 6.2 envoy-harness cross-verify factory
+ host wiring, 6.3 doc closeout). 19 new tests
(14 unit + 3 e2e + 2 bridge) + 14 pre-existing
chain-verify-loop tests regression-clean.

### Locked decisions (2026-08-20)

| # | Question | Locked answer |
|---|---|---|
| **Q1** | `verifyMode` schema values | 3 values: `rule-only` \| `cross-runtime` \| `cross-runtime-strict` |
| **Q2** | `cross-runtime-strict` semantics | Cross verdict always wins |
| **Q3** | Per-node default surface | Function `defaultVerifyModeForWorker(runtime)` (envoy-harness → cross, openclaw → rule-only) |
| **Q4** | When only one runtime is available | Skip cross with audit (existing behavior) |
| **Q5** | `verifyMode: "cross-runtime"` and the budget gate | Budget gate still applies (`verify_budget_denied` downgrades to rule-only) |
| **Q6** | Cross-verify `inputArtifacts` | Empty array (F9.5 v0 default) |
| **Q7** | Cross-verify timing in the orchestrator | After the rule pass (existing pattern) |
| **Q8** | `combineToVerdict` on cross disagreement | `disputed` + `needsHuman: true` (existing behavior; surfaced by `CrossAgentDisagreementVerifier`) |
