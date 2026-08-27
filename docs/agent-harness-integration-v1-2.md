# envoy-harness integration — v1.2 sub-plan (per-skill tag matching)

> **Status:** ✅ **DONE** (2026-08-21). 1 commit on
> `envoy_harness_integration` branch (the user
> delegated commit; bundled v1.2.1 + v1.2.2 +
> v1.2.3 into a single commit at the end of v1.2).
> 22 new tests (9 router unit v1.2 + 9 formatter
> unit + 4 e2e v1.2.2) + 110 pre-existing tests
> regression-clean. Detailed sub-plan for v1.2.
> **v1.3 (2026-08-21) replaces the B-class fall-
> through (Q2 of v1.2) with per-skill formatters.**
> B-class skills (setup-sponsor-friend / peer-list
> / relay-status) are now chat-reachable — see
> [`agent-harness-integration-v1-3.md`](./agent-harness-integration-v1-3.md).
> Companion to
> [`agent-harness-integration.md`](./agent-harness-integration.md) (the
> design),
> [`agent-harness-integration-step5.md`](./agent-harness-integration-step5.md)
> (the Step 5 v0 router), and
> [`agent-harness-integration-v1-1.md`](./agent-harness-integration-v1-1.md)
> (the v1.1 dynamic-vocabulary router).
>
> **What this doc covers:** v1.2 in **concrete
> detail** — every file path, every type, every
> test, every commit boundary, and the design
> questions for team sign-off. Read the design doc
> for "why"; read v1.1 for the router starting
> point; read this for "exactly what to build".
>
> **Order:** Phase 8 v0 + v1.1 are done and
> pushed. v1.2 takes the router from "route to
> the envoy-harness runtime" (v1.1) to "route to
> a specific envoy-harness skill" (v1.2). The
> mesh-native skills (`setup-sponsor-friend` /
> `peer-list` / `relay-status`) become reachable
> from the chat surface.

## 1. Goal

**v1.1 routes signal-bearing prompts to the
envoy-harness runtime's free-form LLM ask.
v1.2 takes the next step: when the prompt's tags
match a specific envoy-harness skill (by `skillId`),
dispatch to that skill's `execute()` instead of
the runtime's free-form ask.**

**Why this matters:** the v1.1 router is half a
feature. Today, a prompt like "set up a mesh
sub-agent for this task" routes to envoy-harness
→ free-form LLM ask → "Here's how to set up a
mesh sub-agent..." (a text answer). With v1.2,
the same prompt scores `setup-sponsor-friend`
(highest tag overlap: `mesh` + `bond` + `sponsor`)
→ dispatches to the skill's `execute()` → the
sponsor-friend bridge actually runs the bond
flow (search → join → hello → wait). Same prompt,
different action: text answer vs. real side
effect.

**After v1.2:**
- The `user-prompt-router` picks a target skill
  (when one matches) AND a target runtime.
- The host calls `askEnvoyHarnessSkill(message,
  skillId)` instead of `askEnvoyHarness(message)`
  when a target skill is identified.
- The mesh-native skills become accessible from
  the chat surface (not just from Team jobs).
- The v1.1 free-form LLM ask remains the
  fallback for prompts that don't uniquely
  match a single skill.

## 2. Existing pieces (what we build on)

### 2.1 v1.1 router — `user-prompt-router.ts`

**File:** `apps/node/src/user-prompt-router.ts`

The v1.1 router takes:
- `envoyHarnessTags?: ReadonlyArray<string>` —
  the dynamic vocabulary (the flat union of
  envoy-harness skill tags from the manifest).

The router scans the prompt for tag matches and
returns:
- `signals: ReadonlyArray<SignalMatch>` — the
  matched tokens with their category + offset.
- `runtime: "openclaw" | "envoy-harness"` — the
  chosen runtime.
- `reason: "default" | "opt-in-disabled" | "signal" | "envoy-harness-unready"`.

**The v1.2 change:** the router's input gets a
*second* field — the structured skill list (with
`skillId` + `tags`) — so the router can pick a
specific skill, not just a runtime. The output
gets a new `targetSkill?: string` field with the
matched `skillId`.

### 2.2 The merged manifest's envoy-harness skills

**File:** `apps/node/src/agent-adapter-manifest-aggregate.ts:67-107`

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

The v1.1 helper `extractEnvoyHarnessTags(manifest)`
returns the flat tag list. v1.2 needs the
*structured* list — `{ skillId, tags }[]` for
each envoy-harness skill.

**The v1.2 source:** filter `manifest.skills` by
`runtime === "envoy-harness"`, project to
`{ skillId, tags }`. Pass this to the router
in the new `envoyHarnessSkills` input field.

### 2.3 The envoy-harness skills' tags (the 8 skills)

**File:**
`envoy-harness/packages/envoy-harness-adapter/src/skills.ts:61-157`

| Skill | Tags |
|---|---|
| `setup-sponsor-friend` | `mesh`, `bond`, `sponsor` |
| `peer-list` | `mesh`, `observability` |
| `relay-status` | `mesh`, `observability` |
| `code-edit` | `code`, `edit` |
| `code-review` | `code`, `review` |
| `doc-search` | `doc`, `search` |
| `bash-run` | `bash`, `shell` |
| `plan` | `plan` |

**Worked example.** Prompt: "set up a mesh
sub-agent for the new node". The tag matches per
skill:

| Skill | Matched tags | Score |
|---|---|---|
| `setup-sponsor-friend` | `mesh` | 1 |
| `peer-list` | `mesh` | 1 |
| `relay-status` | `mesh` | 1 |
| `code-edit` | (none) | 0 |
| `code-review` | (none) | 0 |
| `doc-search` | (none) | 0 |
| `bash-run` | (none) | 0 |
| `plan` | (none) | 0 |

Top score: 1, shared by 3 skills → **tie, fall
through to free-form LLM ask** (the prompt is
ambiguous). v1.2 doesn't force-route to the
wrong skill.

**Better example.** Prompt: "set up a mesh
sponsor bond". Tag matches:

| Skill | Matched tags | Score |
|---|---|---|
| `setup-sponsor-friend` | `mesh` + `sponsor` | 2 |
| `peer-list` | `mesh` | 1 |
| `relay-status` | `mesh` | 1 |

Top score: 2, uniquely held by `setup-sponsor-friend`
→ **route to `setup-sponsor-friend.execute()`**.

### 2.4 The host's ask path — `askEnvoyHarness`

**File:**
`apps/node/src/node-service-impl.ts:4871`
(method body)

The host's `askEnvoyHarness(prompt)` lazily
constructs the EH model adapter and runs a
free-form LLM ask. The return value is a string
(after `stripModelThinking`).

**The v1.2 change:** add a sibling method
`askEnvoyHarnessSkill(prompt, skillId)` that
takes a specific skill ID, calls the adapter's
`execute({ skillId, objective, ... })`, formats
the result as text, and returns the string.

### 2.5 The `ExecuteInput` shape

**File:** `packages/agent-adapter/src/agent-adapter.ts:70-92`

```ts
export interface ExecuteInput {
  skillId: string;
  objective: string;
  inputArtifacts: ReadonlyArray<NamedArtifact>;
  costCeilingUsd: number;
  deadlineMs: number;
  correlationId: string;
  signal: AbortSignal;
}
```

The chat path fills these in:
- `skillId` — from the router's `targetSkill`.
- `objective` — the user's message.
- `inputArtifacts` — `[]` (chat has no artifacts).
- `costCeilingUsd` — from the skill's
  `SkillDescriptor.costCeilingUsd`
  (descriptor default; conservative).
- `deadlineMs` — `30_000` (chat budget).
- `correlationId` — `randomUUID()`.
- `signal` — `AbortSignal.timeout(deadlineMs)`.

### 2.6 The `AgentResult` shape (skill output)

**File:** `packages/protocol/src/agent-adapter.ts:235-262`

```ts
export const AgentResultSchema = z.object({
  skillId: SkillIdSchema,
  runtime: AgentRuntimeSchema,
  peerId: z.string().min(1),
  correlationId: z.string().min(1),
  content: z.array(ContentBlockSchema),  // ← typed blocks
  citations: z.array(CitationSchema).default([]),
  metrics: AgentMetricsSchema,
  raw: z.unknown().optional(),
  completedAt: z.string().datetime(),
});
```

`ContentBlock` is a discriminated union:
- `kind: "text"` — string content
- `kind: "file"` — vault path + content hash
- `kind: "structured"` — typed data per
  `schemaRef`
- `kind: "image"` — vault path + content hash

**The v1.2 formatter:**
- First block is `text` → return `block.text`.
- Multiple text blocks → join with `\n\n`.
- First block is `structured` (B-class) →
  fall through to v1.1 free-form LLM ask,
  log a debug line (Q2 — B-class falls through
  in v1.2; formatter in v1.3).
- Mixed text + structured → return text blocks
  joined, mention structured blocks in a
  trailing line (e.g. "(plus 2 structured
  items)").

## 3. Design

### 3.1 Router input — new `envoyHarnessSkills` field

**File:** `apps/node/src/user-prompt-router.ts`

```ts
export interface EnvoyHarnessSkillEntry {
  /** The skill's manifest ID. */
  skillId: string;
  /** The skill's tags (word-boundary / exact-substring
      match — same algorithm as v1.1). */
  tags: ReadonlyArray<string>;
}

export interface RouteUserPromptInput {
  // ... v1.1 fields ...
  /**
   * v1.2 — structured skill list from the merged
   * manifest's envoy-harness skills. The host
   * reads the manifest once + projects the
   * envoy-harness subset to `{ skillId, tags }[]`.
   *
   * The router picks the best-match skill and
   * sets `decision.targetSkill` to its `skillId`.
   *
   * **When `undefined` or empty:** v1.1 behavior
   * (no per-skill routing; the host's
   * `askEnvoyHarness` path stays). The v1.1
   * `envoyHarnessTags` field is still used for
   * the tag-based signal scan; `envoyHarnessSkills`
   * is the per-skill routing source. Both are
   * independent — `envoyHarnessTags` is for signal
   * detection, `envoyHarnessSkills` is for skill
   * targeting.
   */
  envoyHarnessSkills?: ReadonlyArray<EnvoyHarnessSkillEntry>;
}
```

### 3.2 Router output — new `targetSkill` field

```ts
export interface RouteUserPromptDecision {
  runtime: "openclaw" | "envoy-harness";
  reason:
    | "default"
    | "opt-in-disabled"
    | "signal"
    | "signal-skill"
    | "envoy-harness-unready";
  signals: ReadonlyArray<SignalMatch>;
  hintPrefixLength: number | undefined;
  /**
   * v1.2 — when the router picks a specific
   * envoy-harness skill, this is the `skillId`
   * to dispatch to. `undefined` means "no
   * specific skill matched" (v1.1 free-form
   * LLM ask path).
   *
   * **Set when:** the top-scoring skill's score
   * is ≥ 1 AND strictly greater than the
   * second-best skill's score (Q1 — uniquely-held
   * threshold). Tie → fall through; no
   * `targetSkill` is set.
   */
  targetSkill?: string;
}
```

### 3.3 Skill matching algorithm

```ts
function pickTargetSkill(
  prompt: string,
  skills: ReadonlyArray<EnvoyHarnessSkillEntry>,
): { skillId: string; score: number } | undefined {
  let best: { skillId: string; score: number } | undefined;
  let secondBestScore = 0;
  for (const skill of skills) {
    const score = scoreSkill(prompt, skill.tags);
    if (score === 0) continue;
    if (best === undefined || score > best.score) {
      // New best. The old best becomes second best.
      secondBestScore = best?.score ?? 0;
      best = { skillId: skill.skillId, score };
    } else if (score > secondBestScore) {
      secondBestScore = score;
    }
  }
  if (best === undefined) return undefined;
  if (best.score === secondBestScore) return undefined; // tie
  return best;
}

function scoreSkill(
  prompt: string,
  tags: ReadonlyArray<string>,
): number {
  const lower = prompt.toLowerCase();
  let score = 0;
  for (const tag of tags) {
    if (findTagInPrompt(lower, tag) >= 0) score++;
  }
  return score;
}
```

### 3.4 Updated decision tree

```
1. signalOptIn === "disabled"      →  { runtime: "openclaw", reason: "opt-in-disabled" }
2. No signals matched              →  { runtime: "openclaw", reason: "default" }
3. Signals matched & !EH ready     →  { runtime: "openclaw", reason: "envoy-harness-unready" }
4. Signals matched & EH ready
   4a. targetSkill set             →  { runtime: "envoy-harness", reason: "signal-skill", targetSkill }
   4b. No targetSkill              →  { runtime: "envoy-harness", reason: "signal" }
```

The new `reason: "signal-skill"` distinguishes
the per-skill path from the v1.1 free-form path.
The Social UI can use this to render a "routed
to skill `setup-sponsor-friend`" badge (v1.3+
UX).

### 3.5 Host wiring — new `askEnvoyHarnessSkill`

**File:**
`apps/node/src/node-service-impl.ts` (new
method, ~40 lines)

```ts
/**
 * Phase 8 / v1.2 — ask the envoy-harness runtime
 * to run a specific skill. The skill is identified
 * by `skillId` (the router's `targetSkill` output).
 * The adapter is lazy-constructed on first call.
 *
 * **Returns:** the skill's result, formatted as
 * text. For `text` first-block skills, this is
 * the block's `text`. For `structured` first-block
 * skills (B-class), v1.2 falls through to a
 * free-form LLM ask (Q2) — the formatter is v1.3.
 *
 * **Throws:** on transient errors (network,
 * timeout). The dispatch catches + falls back to
 * v1.1 free-form LLM ask.
 */
async askEnvoyHarnessSkill(
  message: string,
  skillId: string,
): Promise<string> {
  // 1. Look up the skill in the manifest.
  const manifest = this.getNodeManifest();
  const skill = manifest.skills.find(
    (s) => s.runtime === "envoy-harness" && s.skillId === skillId,
  );
  if (!skill) {
    throw new Error(`unknown envoy-harness skill: ${skillId}`);
  }
  // 2. Lazy-construct the adapter (same path as
  //    `askEnvoyHarness`).
  const adapter = await this._getOrCreateEnvoyHarnessAdapter();
  // 3. Build the ExecuteInput.
  const deadlineMs = 30_000;
  const input: ExecuteInput = {
    skillId,
    objective: message,
    inputArtifacts: [],
    costCeilingUsd: skill.costCeilingUsd ?? 1.0, // Q5
    deadlineMs,
    correlationId: randomUUID(),
    signal: AbortSignal.timeout(deadlineMs),
  };
  // 4. Run the skill.
  const result = await adapter.execute(input);
  // 5. Format the result. v1.2 only handles
  //    `text` first-block skills; structured
  //    first-block falls through (Q2).
  return formatSkillResult(result);
}
```

### 3.6 The skill result formatter

**File:** `apps/node/src/skill-result-formatter.ts`
(NEW, ~50 lines)

```ts
import type { SignedAgentResult, ContentBlock } from "@envoymesh/protocol";

/**
 * Format a skill's `SignedAgentResult.content` as
 * a chat-reply string.
 *
 * **v1.2 rules:**
 * - First block is `text` → return `block.text`.
 * - Multiple text blocks → join with `\n\n`.
 * - First block is `structured` (B-class) → throw
 *   a typed `StructuredResultError`. The dispatch
 *   catches + falls back to v1.1 free-form LLM ask.
 * - First block is `file` or `image` → return a
 *   summary (the vault path; v1.2 doesn't embed).
 * - Empty content array → return empty string.
 */
export function formatSkillResult(
  result: SignedAgentResult,
): string {
  if (result.content.length === 0) return "";
  const first = result.content[0];
  if (!first) return "";
  if (first.kind === "text") {
    const textBlocks = result.content
      .filter((b): b is Extract<ContentBlock, { kind: "text" }> => b.kind === "text")
      .map((b) => b.text);
    return textBlocks.join("\n\n");
  }
  if (first.kind === "structured") {
    throw new StructuredResultError(
      result.skillId,
      first.schemaRef,
    );
  }
  if (first.kind === "file") {
    return `Saved to vault: ${first.vaultPath}`;
  }
  if (first.kind === "image") {
    return `Saved image to vault: ${first.vaultPath}`;
  }
  return ""; // exhaustive
}
```

### 3.7 Dispatch update — use `targetSkill` when set

**File:**
`apps/node/src/node-service-handlers-run-owner-agent-turn.ts`

The existing EH dispatch (around line 174):

```ts
if (decision.runtime === "envoy-harness") {
  try {
    const answer = stripModelThinking(await ctx.askEnvoyHarness(effectiveMessage));
    // ...
  }
}
```

becomes:

```ts
if (decision.runtime === "envoy-harness") {
  // v1.2 — when a specific skill was targeted,
  // dispatch to that skill's execute(). Fall back
  // to v1.1 free-form LLM ask on structured
  // first-block (Q2) or execute() failure (Q7).
  if (decision.targetSkill !== undefined) {
    try {
      const answer = stripModelThinking(
        await ctx.askEnvoyHarnessSkill(
          effectiveMessage,
          decision.targetSkill,
        ),
      );
      const result = buildRoutedResult({
        answer,
        modelUsed: "envoy-harness",
      });
      // ... persist + return ...
    } catch (err) {
      // Q7 — fall through to free-form LLM ask
      // (the skill might not handle this prompt;
      // the LLM is a safer default).
      console.warn(
        `[envoy-harness] skill ${decision.targetSkill} failed, ` +
        `falling back to free-form LLM ask:`,
        err instanceof Error ? err.message : String(err),
      );
      // Fall through to the v1.1 path below.
    }
  }
  // v1.1 path — free-form LLM ask (also v1.2's
  // fallback when targetSkill is undefined or
  // askEnvoyHarnessSkill throws).
  try {
    const answer = stripModelThinking(await ctx.askEnvoyHarness(effectiveMessage));
    // ...
  }
}
```

### 3.8 Test strategy

**Unit tests in `user-prompt-router.test.ts`** (additions):

- Single skill with 2 tag matches → `targetSkill` set, `reason: "signal-skill"`.
- Multiple skills, one uniquely best → `targetSkill` set to the best.
- Multiple skills, top score tied → `targetSkill` undefined, `reason: "signal"`.
- No skills → `targetSkill` undefined.
- No tags match → `targetSkill` undefined.
- Hyphenated tag match → counted correctly.
- `envoyHarnessSkills: undefined` → v1.1 behavior preserved.
- `envoyHarnessSkills: []` → v1.1 behavior preserved.

**Unit tests in `skill-result-formatter.test.ts`** (NEW):

- `text` first block → returns `text`.
- Multiple `text` blocks → joined with `\n\n`.
- `structured` first block → throws `StructuredResultError`.
- `file` first block → returns vault path summary.
- `image` first block → returns vault path summary.
- Empty content → returns `""`.

**E2E tests in `run-owner-agent-turn-routing.test.ts`** (additions):

- `targetSkill` set → host calls `askEnvoyHarnessSkill(message, skillId)`, NOT `askEnvoyHarness`.
- `targetSkill` set, `askEnvoyHarnessSkill` throws → falls through to `askEnvoyHarness` (Q7).
- `targetSkill` set, skill returns `structured` first block → falls through to `askEnvoyHarness` (Q2).
- No `targetSkill` (v1.1 behavior) → `askEnvoyHarness` called as before.

## 4. Design questions for team sign-off

> These are the choices that need a decision before implementation
> starts. **Defaults proposed in bold**; flip if you disagree.

| # | Question | Default (proposed) | Alternative |
|---|---|---|---|
| **Q1** | Score threshold for `targetSkill` | **Uniquely-held: top score strictly > second-best** (tie → fall through) | First-match-wins: top score ≥ 1, ties broken by insertion order |
| **Q2** | B-class (orchestration) skill first-block behavior | **Fall through to free-form LLM ask** + log debug (v1.2 doesn't reach B-class from chat) | Auto-route with a per-skill formatter (B-class returns a 1-line summary) |
| **Q3** | Tiebreak on equal score | **Insertion order** (first match wins) — but the Q1 default makes this moot (ties fall through) | Runtime priority: code skills before B-class |
| **Q4** | `execute()` deadline for chat | **30_000 ms** (chat budget) | 60_000 ms (some B-class skills take 6+ min — but B-class falls through per Q2, so 30s is safe) |
| **Q5** | `execute()` costCeilingUsd source | **`SkillDescriptor.costCeilingUsd`** (descriptor default; conservative) | No cap (use runtime config) |
| **Q6** | `targetSkill` in `OwnerAgentTurnResult` | **Expose as a routing field** (`routingReason: "signal-skill"` carries it) — also add `targetSkill?: string` to the result for debug | Internal detail only (not in the result) |
| **Q7** | Failure fallback for `askEnvoyHarnessSkill` | **Fall through to v1.1 free-form LLM ask** (the skill might not handle this prompt; LLM is safer) | Fall through to OpenClaw |
| **Q8** | `envoyHarnessSkills` input shape | **`ReadonlyArray<{ skillId, tags }>`** (projected from the manifest) | Full `ReadonlyArray<MergedSkillEntry>` (router already imports the manifest types) |

**Defaults I'd flip if I were king (Q1):** I lean strongly
toward the uniquely-held threshold. The alternative
(first-match-wins) would force-route ambiguous prompts
to the wrong skill. Uniquely-held is "be strict about
uniqueness" — the prompt must unambiguously match one
skill to be force-routed. Ambiguous prompts go to the
free-form LLM ask, which is the safe default.

**Defaults I'd flag for discussion (Q2):** the B-class
fall-through is the most v1.2-internal decision. The
alternative (auto-route with a per-skill formatter) is
the v1.3+ vision. I think v1.2 should ship the routing
right first; the formatter is a clean follow-up.

**Defaults at-default (Q3-Q8):** I have no strong opinion
on Q3 (moot given Q1's strict threshold), Q4 (30s is
conservative; matches the chat budget elsewhere), Q5
(descriptor default is the right policy; no cap is
risky for chat), Q6 (expose for debug; the API is
additive), Q7 (LLM fallback is safer than OpenClaw
fallback), Q8 (projected shape keeps the router
independent of the manifest's full type).

## 5. Plan

### Sub-chunk v1.2.1 — router API + skill matching (1 commit)

- Modify: `apps/node/src/user-prompt-router.ts` — add
  `envoyHarnessSkills` input field; add `targetSkill?`
  output field; add `pickTargetSkill` + `scoreSkill`
  helpers; update `routeUserPrompt` decision tree to
  emit `reason: "signal-skill"` when a skill is
  picked.
- Modify: `apps/node/test/user-prompt-router.test.ts`
  — add ~8 unit tests for the new behavior.
- Existing 50 unit tests + 28 e2e tests
  regression-clean.

### Sub-chunk v1.2.2 — host wiring + formatter (1 commit)

- New: `apps/node/src/skill-result-formatter.ts` —
  `formatSkillResult(result)` + `StructuredResultError`.
- New: `apps/node/test/skill-result-formatter.test.ts`
  — ~5 unit tests.
- Modify: `apps/node/src/node-service-impl.ts` —
  add `askEnvoyHarnessSkill(message, skillId)` method.
- Modify: `apps/node/src/node-service-handlers-run-owner-agent-turn.ts`
  — add `askEnvoyHarnessSkill` to `RunOwnerAgentTurnContext`;
  dispatch to it when `decision.targetSkill` is set;
  pass the `envoyHarnessSkills` to the router.
- Modify: `apps/node/src/node-service-contexts.ts` —
  add `askEnvoyHarnessSkill` to deps + build.
- Modify: `apps/node/src/node-service-impl-service-deps.ts` —
  wire `askEnvoyHarnessSkill`.
- Modify: `apps/node/test/run-owner-agent-turn-routing.test.ts`
  — add ~4 e2e tests.
- Existing 50 unit + 28 e2e tests regression-clean.

### Sub-chunk v1.2.3 — doc closeout (1 commit)

- Modify: `docs/agent-harness-integration.md` —
  add v1.2 status to §9 change log.
- Modify: `docs/agent-network-engine.md` §2.2 —
  note v1.2 per-skill routing in the routing table;
  add new §2.2.2 sub-section explaining the per-skill
  matching algorithm + result formatter + B-class
  fall-through.
- Modify: `docs/agent-harness-integration-step5.md` —
  status note: v1.2 added per-skill routing on top
  of v1.1's dynamic vocabulary.
- Modify: `docs/agent-harness-integration-v1-1.md` —
  status note: v1.2 supersedes v1.1's runtime-only
  routing with per-skill routing.
- New: `docs/agent-harness-integration-v1-2.md` —
  status banner + commit log (this doc gets the
  "DONE" stamp).

**Total: 3 sub-chunks, bundled into 1 commit at the
end of v1.2 (per the v1.1 commit pattern).** On
`envoy_harness_integration` branch.

## 6. Out of scope (deferred)

- **Per-skill result formatter for B-class skills**
  (Q2 alternative) — v1.2 falls through to free-form
  LLM ask for `structured` first-block skills. v1.3+
  ships a per-skill formatter.
- **Multi-skill dispatch (run N skills in parallel)**
  — v1.2 picks at most one skill per turn. Future
  chunks could allow a prompt to fan out to multiple
  skills (e.g. "set up sponsor AND list peers" → both
  skills run).
- **Skill-to-skill handoff (skill A's output as
  skill B's input)** — v1.2 is single-shot. The
  Team-job orchestrator (chain-orchestrator) already
  supports multi-step skill execution; the chat
  surface stays single-shot for v1.2.
- **Skill-specific UI affordances** (Tauri) — v1.2
  exposes `routingReason: "signal-skill"` + the
  result's `targetSkill`; v1.3+ adds the chat UI
  affordance to render "routed to skill X" badge.
- **Per-prompt skill override (hint prefix)** — v1.2
  uses tag-based scoring. A future chunk could add
  `!skill:setup-sponsor-friend` as a hint prefix
  for explicit skill override.
- **OpenClaw tags as negative signals (Q4 of v1.1)**
  — still deferred to v1.3+.

## 7. References

- [`agent-harness-integration.md`](./agent-harness-integration.md)
  (the design — §3.2 capability-tag-based detection,
  §6 v1 deferred)
- [`agent-harness-integration-step5.md`](./agent-harness-integration-step5.md)
  (the v0 router)
- [`agent-harness-integration-v1-1.md`](./agent-harness-integration-v1-1.md)
  (the v1.1 dynamic-vocabulary router — v1.2's
  starting point)
- [`user-prompt-router.ts`](../../apps/node/src/user-prompt-router.ts)
  (v1.1 router — to be extended)
- [`agent-adapter-manifest-aggregate.ts`](../../apps/node/src/agent-adapter-manifest-aggregate.ts)
  (the merged manifest with `MergedSkillEntry`)
- [`ENVOY_HARNESS_SKILLS`](../../envoy-harness/packages/envoy-harness-adapter/src/skills.ts:61)
  (the 8 skills' tags — v1.2's matching source)
- [`AgentAdapter.execute`](../../packages/agent-adapter/src/agent-adapter.ts:168)
  (the skill execution contract)
- [`ContentBlockSchema`](../../packages/protocol/src/agent-adapter.ts:173)
  (the `text` / `structured` / `file` / `image`
  block kinds — v1.2 formatter)

---

**Status:** 8 design questions locked (2026-08-21,
all defaults accepted; user validated fresh-eyes
review). ✅ **DONE** (bundled into 1 commit at end
of v1.2; user delegated commit).

### Commit log (2026-08-21)

| Commit | Sub-chunk | Description |
|---|---|---|
| (1 commit, user-delegated) | v1.2.1 + v1.2.2 + v1.2.3 bundled | 1 commit on `envoy_harness_integration` branch. v1.2.1: `envoyHarnessSkills` input + `targetSkill` output + `pickTargetSkill` + 9 unit tests. v1.2.2: `skill-result-formatter` (NEW) + `extractEnvoyHarnessSkills` helper + `RunOwnerAgentTurnContext.askEnvoyHarnessSkill` field + `NodeServiceImpl.askEnvoyHarnessSkill` method + `runtime.askSkill` + `OwnerAgentTurnResult.targetSkill` + 9 formatter tests + 4 e2e tests (2 v1.1 tests updated to expect v1.2 per-skill behavior). v1.2.3: doc closeout (`agent-harness-integration.md` change log entry + `agent-network-engine.md` §2.2.2 per-skill routing sub-section + `agent-harness-integration-step5.md` status note + `agent-harness-integration-v1-1.md` status note + this DONE stamp). |

**Total:** 1 commit, 22 new tests (9 router unit + 9 formatter unit + 4 e2e), 110 pre-existing tests regression-clean.

### Locked decisions (2026-08-21)

| # | Question | Locked answer |
|---|---|---|
| **Q1** | Score threshold for `targetSkill` | Uniquely-held: top score strictly > second-best; tie → fall through to free-form LLM ask |
| **Q2** | B-class skill first-block behavior | Fall through to free-form LLM ask (B-class skills not reachable from chat in v1.2; formatter in v1.3+) |
| **Q3** | Tiebreak on equal score | Insertion order (first match wins; same as v1.1 manifest's order-preservation contract) — moot given Q1 but kept as 3-line insurance policy |
| **Q4** | `execute()` deadline for chat | 60_000 ms (generous headroom for code skills; revisit when v1.3 adds B-class formatter + per-skill deadline override) |
| **Q5** | `execute()` costCeilingUsd source | `SkillDescriptor.costCeilingUsd`; **default to `1.0` when undefined** (don't pass `0` or `Infinity`; "I don't know, be conservative" sentinel) |
| **Q6** | `targetSkill` in `OwnerAgentTurnResult` | Expose as a routing field — add `targetSkill?: string` to `OwnerAgentTurnResult`; combined with `routingReason: "signal-skill"`, the Social UI can render the badge |
| **Q7** | Failure fallback for `askEnvoyHarnessSkill` | Fall through to v1.1 free-form LLM ask (the skill might not handle this prompt; LLM is the safer default). Log the failure (skill name + error message) |
| **Q8** | `envoyHarnessSkills` input shape | Projected shape: `ReadonlyArray<{ skillId, tags }>` (router is manifest-independent; the host does the projection) |
