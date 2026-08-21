# envoy-harness integration — v1.3 sub-plan (B-class per-skill result formatter)

> **Status:** ✅ **DONE** (2026-08-21). 1 commit on
> `envoy_harness_integration` branch (the user
> delegated commit; bundled v1.3.1 + v1.3.2 +
> v1.3.3 into a single commit at the end of v1.3).
> 52 new tests (30 b-class-formatters unit + 20
> skill-result-formatter unit + 2 e2e) + 143
> pre-existing tests regression-clean. Detailed
> sub-plan for v1.3. Companion to
> [`agent-harness-integration.md`](./agent-harness-integration.md) (the
> design),
> [`agent-harness-integration-v1-2.md`](./agent-harness-integration-v1-2.md)
> (the v1.2 per-skill routing; v1.3 is the formatter
> follow-up), and
> [`agent-harness-integration-step5.md`](./agent-harness-integration-step5.md)
> (the Step 5 v0 router).
>
> **What this doc covers:** v1.3 in **concrete
> detail** — every file path, every type, every
> test, every commit boundary, and the design
> questions for team sign-off. Read the design
> doc for "why"; read v1.2 for the dispatch
> starting point; read this for "exactly what to
> build".
>
> **Order:** v1.2 is done + pushed. v1.3
> **unblocks the mesh-native skills from chat**.
> Today, the v1.2 formatter throws
> `StructuredResultError` for B-class
> `structured` first blocks (Q2 of v1.2);
> v1.3 ships a per-skill formatter that turns
> each B-class result into a 1-line chat
> summary.

## 1. Goal

**v1.2 routes signal-bearing prompts to a specific
envoy-harness skill. v1.3 makes the B-class skills
(setup-sponsor-friend / peer-list / relay-status)
chat-reachable** by shipping a per-skill formatter
that turns their `structured` `tool-result` blocks
into human-readable chat summaries.

**Why this matters:** today, the v1.2 dispatch
falls through to the v1.1 free-form LLM ask for
B-class skills. The user types "set up a mesh
sponsor bond" → router picks `setup-sponsor-friend`
→ skill runs → returns `structured` first block →
formatter throws → dispatch falls back to LLM. The
LLM describes what the bond flow *would* do, but
the actual bond flow never runs. v1.3 fixes this:
the formatter produces a 1-line summary, the
chat reply shows the actual outcome ("Bonded with
sponsor (12D3Koo...)" or "Sponsor bond failed:
network-unreachable; will retry in 5m").

**After v1.3:**
- B-class skills (orchestration) are
  chat-reachable. The user types a chat prompt,
  the router picks the B-class skill, the skill
  runs, the formatter produces a 1-line summary.
- The v1.2 fall-through (Q2) is removed for
  B-class; other `structured` blocks still throw
  (defensive — we only know how to format the 3
  B-class skills).
- Per-skill formatters are 1-line (compact) +
  success/failure differentiation + skipped-
  reason surfacing.

## 2. Existing pieces (what we build on)

### 2.1 v1.2 formatter — `skill-result-formatter.ts`

**File:** `apps/node/src/skill-result-formatter.ts`

The v1.2 formatter handles:
- `text` first block → return `block.text`.
- Multiple `text` blocks → join with `\n\n`.
- `structured` first block → throws
  `StructuredResultError` (Q2 of v1.2).
- `file` / `image` first block → vault-path
  summary.
- Empty content → `""`.

**The v1.3 change:** the `structured` first block
path is updated to dispatch to a per-skill
formatter when the schemaRef is
`envoymesh://tool-result/v1` AND the skillId is
one of the 3 B-class skills
(`setup-sponsor-friend` / `peer-list` /
`relay-status`). Other `structured` blocks
(unknown `schemaRef` or unknown `skillId`) still
throw — we only know how to format B-class.

### 2.2 The B-class tools — `sponsorFriendTool` etc.

**File:**
`envoy-harness/packages/envoy-harness-adapter/src/b-class-skills/sponsor-friend.ts:629`
(`sponsorFriendTool`)

The B-class tools return `{ content: JSON.stringify(result) }` where `result` is a
`BClassSponsorFriendResult` (typed). The adapter
wraps this in a `SignedAgentResult` with `content:
[{ kind: "tool_result", type: "tool_result",
toolCallId, content, isError }]` (local type).

The wire translation (`translation.ts:97-122`)
converts the local `tool_result` to:

```ts
{
  kind: "structured",
  schemaRef: "envoymesh://tool-result/v1",
  data: {
    toolCallId: "...",
    content: <ToolResultData.content>,  // JSON.stringify(result)
    isError: false,
  },
}
```

So `data.content` is a JSON string. v1.3 parses
this string + dispatches to the per-skill
formatter.

### 2.3 The B-class result shapes

**File:**
`envoy-harness/packages/envoy-harness-adapter/src/b-class-skills/sponsor-friend.ts:131-152`
(`BClassSponsorFriendResult`)

```ts
export interface BClassSponsorFriendResult {
  ok: boolean;
  skipped?: boolean;
  reason?:
    | "already-completed"
    | "disabled-or-incomplete"
    | "already-bonded"
    | "cooldown"
    | "profile-not-ready"
    | "mesh-not-ready"
    | "protocol-mismatch"
    | "auto-exhausted"
    | "single-flight";
  ownerId?: string;
  cooldownUntil?: string;
  lastErrorKind?: string;
  attempts?: number;
  finalNote?: string;
}
```

`peer-list` and `relay-status` have similar typed
results (defined in their respective bridge
files; see the per-formatter sections below).

**The v1.3 source:** the host imports these
types from `@envoymesh/envoy-harness-adapter`
(or a sub-path) and writes per-skill formatters
that take the parsed result + return a 1-line
string.

## 3. Design

### 3.1 Per-skill formatter map

**File:** `apps/node/src/b-class-result-formatters.ts` (NEW)

```ts
import type { ContentBlock } from "@envoymesh/protocol";

/**
 * A function that formats a B-class skill's
 * parsed result as a 1-line chat summary.
 *
 * **Input:** the `data.content` field of a
 *   `tool-result` structured block, parsed as
 *   `unknown` (the JSON shape is typed; the
 *   formatter casts to the right shape).
 *
 * **Output:** a 1-line chat string. Examples:
 *   - "Bonded with sponsor (12D3Koo...)"
 *   - "Sponsor bond failed: network-unreachable (will retry in 5m)"
 *   - "Sponsor bond already completed (12D3Koo...)"
 */
export type BClassFormatter = (data: unknown) => string;

/**
 * The B-class formatter map. Keyed by `skillId`.
 * Each entry is a function that takes the parsed
 * JSON result + returns a 1-line summary.
 */
export const B_CLASS_FORMATTERS: Readonly<Record<string, BClassFormatter>> = {
  "setup-sponsor-friend": formatSponsorFriendResult,
  "peer-list": formatPeerListResult,
  "relay-status": formatRelayStatusResult,
};

/**
 * Look up the B-class formatter for a given
 * `skillId`. Returns `undefined` when the skill
 * is not a B-class skill (e.g. a code skill —
 * those return `text` blocks, not `structured`).
 */
export function getBClassFormatter(
  skillId: string,
): BClassFormatter | undefined {
  return B_CLASS_FORMATTERS[skillId];
}
```

### 3.2 The 3 per-skill formatters

```ts
// 1. setup-sponsor-friend
function formatSponsorFriendResult(data: unknown): string {
  const r = data as Partial<BClassSponsorFriendResult>;
  if (r.ok === true) {
    if (r.skipped === true) {
      // skipped reasons: already-completed,
      // disabled-or-incomplete, already-bonded,
      // cooldown, profile-not-ready,
      // mesh-not-ready, single-flight
      return `Sponsor bond: ${r.reason ?? "skipped"}` +
        (r.ownerId ? ` (${r.ownerId.slice(0, 16)}...)` : "");
    }
    // Success: bonded with sponsor
    return `Bonded with sponsor` +
      (r.ownerId ? ` (${r.ownerId.slice(0, 16)}...)` : "") +
      (r.attempts ? ` after ${r.attempts} attempt${r.attempts === 1 ? "" : "s"}` : "");
  }
  // Failure: ok: false
  return `Sponsor bond failed: ${r.lastErrorKind ?? r.reason ?? "unknown"}` +
    (r.finalNote ? ` (${r.finalNote})` : "");
}

// 2. peer-list
function formatPeerListResult(data: unknown): string {
  const r = data as Partial<BClassPeerListResult>;
  // r = { count: number, peers: [{ peerId, lastSeenAt, msgCount }] }
  if (r.peers === undefined || r.count === undefined) {
    return `Peer list: unknown shape`;
  }
  const top3 = r.peers.slice(0, 3).map((p) =>
    p.peerId.slice(0, 16) + (p.msgCount > 0 ? ` (${p.msgCount} msg)` : ""),
  );
  const more = r.count - top3.length;
  return `Observed ${r.count} peer${r.count === 1 ? "" : "s"}: ${top3.join(", ")}` +
    (more > 0 ? ` (and ${more} more)` : "");
}

// 3. relay-status
function formatRelayStatusResult(data: unknown): string {
  const r = data as Partial<BClassRelayStatusResult>;
  // r = { relayPeerId, enabled, peerCount, bookCount, traceCount, ... }
  if (!r.enabled) {
    return `Relay: disabled`;
  }
  return `Relay ${r.relayPeerId?.slice(0, 16) ?? "(unknown)"}: ` +
    `${r.peerCount ?? 0} peers, ${r.bookCount ?? 0} book entries, ` +
    `${r.traceCount ?? 0} recent traces`;
}
```

### 3.3 Updated v1.2 formatter — dispatch per-skill

**File:** `apps/node/src/skill-result-formatter.ts` (modify)

The v1.2 `structured` first block path:

```ts
if (first.kind === "structured") {
  // Q2 of v1.2: throws StructuredResultError
  // → dispatch falls back to v1.1 free-form LLM ask.
  throw new StructuredResultError(result.skillId, first.schemaRef);
}
```

becomes (v1.3):

```ts
if (first.kind === "structured") {
  // v1.3 — dispatch to the per-skill formatter
  // when (1) the schemaRef is the B-class
  // tool-result and (2) the skillId has a
  // registered B-class formatter. Otherwise,
  // fall through to the v1.2 throw (defensive —
  // unknown schemaRef or unknown skillId).
  if (first.schemaRef === "envoymesh://tool-result/v1") {
    const formatter = getBClassFormatter(result.skillId);
    if (formatter !== undefined) {
      const parsed = parseToolResultContent(first.data);
      if (parsed !== undefined) {
        return formatter(parsed);
      }
    }
  }
  // Fall through to v1.2 — unknown structured
  // shape, throw (preserves Q2 + Q7 fall-through).
  throw new StructuredResultError(result.skillId, first.schemaRef);
}
```

Where `parseToolResultContent` parses the
`data.content` JSON string:

```ts
function parseToolResultContent(data: unknown): unknown {
  if (data === null || typeof data !== "object") return undefined;
  const d = data as { content?: unknown };
  if (typeof d.content !== "string") return undefined;
  try {
    return JSON.parse(d.content);
  } catch {
    return undefined;  // malformed JSON → fall through
  }
}
```

### 3.4 Updated dispatch — no more fall-through for B-class

**File:**
`apps/node/src/node-service-handlers-run-owner-agent-turn.ts`

The v1.2 dispatch's per-skill path catches
`StructuredResultError` and falls through to
`askEnvoyHarness`. v1.3 no longer throws
`StructuredResultError` for B-class (the
formatter returns a 1-line string instead). The
catch block stays (defensive — unknown skillId
or malformed data still throws).

The behavior change: B-class skills no longer
fall through. The skill runs, the formatter
returns a 1-line string, the chat reply shows
the result. The `routingReason: "signal-skill"`
+ `targetSkill: <b-class-skill>` flow is
preserved.

### 3.5 Test strategy

**Unit tests in `b-class-result-formatters.test.ts`** (NEW):

- `formatSponsorFriendResult`:
  - `ok: true` (success) → "Bonded with sponsor (12D3Koo...) after N attempts"
  - `ok: true, skipped: true, reason: "already-completed"` → "Sponsor bond: already-completed (12D3Koo...)"
  - `ok: false, lastErrorKind: "network-unreachable"` → "Sponsor bond failed: network-unreachable (...)"
  - `ok: true, reason: "cooldown", cooldownUntil` → "Sponsor bond: cooldown (until 2026-08-22T...)"
  - Malformed input → "Sponsor bond: unknown shape" or similar (graceful degradation)
- `formatPeerListResult`:
  - 5 peers → "Observed 5 peers: 12D3Koo..., ... (and 2 more)"
  - 1 peer → "Observed 1 peer: 12D3Koo..."
  - 0 peers → "Observed 0 peers: "
  - Malformed → "Peer list: unknown shape"
- `formatRelayStatusResult`:
  - enabled + relayPeerId → "Relay 12D3Koo...: N peers, M book entries, K recent traces"
  - disabled → "Relay: disabled"
- `getBClassFormatter`:
  - "setup-sponsor-friend" → returns formatter
  - "code-edit" → returns undefined
  - "unknown-skill" → returns undefined

**Unit tests in `skill-result-formatter.test.ts`** (modify):

- Replace the v1.2 "structured first block throws" tests
  with v1.3 tests:
  - `structured` with `schemaRef: "envoymesh://tool-result/v1"` + B-class skillId → returns formatted string
  - `structured` with unknown `schemaRef` → still throws `StructuredResultError`
  - `structured` with B-class schemaRef + unknown skillId → still throws
  - `structured` with malformed `data.content` JSON → throws `StructuredResultError` (graceful fail)

**E2E tests in `run-owner-agent-turn-routing.test.ts`** (additions):

- v1.3 — B-class skill now reachable from chat:
  - `getNodeManifest` returns B-class skills + `setup-sponsor-friend.execute()` returns a JSON-stringified `BClassSponsorFriendResult` with `ok: true`
  - Prompt "set up a mesh sponsor bond" → `askEnvoyHarnessSkill` called, returns the formatted "Bonded with sponsor..." string
  - Result: `routingReason: "signal-skill"`, `targetSkill: "setup-sponsor-friend"`, `modelUsed: "envoy-harness"`, `answer: "Bonded with sponsor..."`
  - **No more fall-through** to OpenClaw (the v1.2 behavior was: B-class → throw → OpenClaw; v1.3 is: B-class → format → reply).

## 4. Design questions for team sign-off

> These are the choices that need a decision before implementation
> starts. **Defaults proposed in bold**; flip if you disagree.

| # | Question | Default (proposed) | Alternative |
|---|---|---|---|
| **Q1** | Format style | **1-line summary (compact)** for both success and failure; skipped reasons get distinct wording | Multi-line (key-value pairs); 1-line + a "details" indicator for the UI to expand |
| **Q2** | Failure format | **Distinct from success: "X failed: <lastErrorKind> (<finalNote>)"** — no truncation of `lastErrorKind` | Same as success (just the reason field); verbose multi-line with all `setupSponsorFriend*` fields |
| **Q3** | Skipped reason surfacing | **Show the reason + relevant context** ("Sponsor bond: cooldown (until T...)" / "Sponsor bond: already-completed") | Generic "skipped" without context |
| **Q4** | Where do the formatters live? | **Host (`apps/node/src/b-class-result-formatters.ts`)** — the adapter is for `execute()`; the host formats for the chat surface | Adapter (`envoy-harness-adapter` exports `formatBClassResult`); the host imports |
| **Q5** | Handle tool-call blocks (`envoymesh://tool-call/v1`)? | **No** — only format tool-result blocks. Tool-call blocks are intermediate transcript; v1.3 only formats the final result | Format tool-call blocks too (e.g. "Sponsor: called `sponsor_friend` with `force=true`") |
| **Q6** | Unknown `structured` blocks | **Still throw `StructuredResultError`** (defensive — v1.3 only knows 3 B-class skills) | Silent fall-through to v1.1 LLM ask (no error) |
| **Q7** | Test fixtures | **Synthetic JSON shapes** (hardcoded, matching the bridge's typed result) — no bridge import in unit tests | Real bridge imports (`@envoymesh/envoy-harness-adapter`) — couples tests to bridge types |
| **Q8** | `peerId` truncation in chat | **First 16 chars + `...`** (matches the existing chat UX pattern in the bond-trace logs) | Full peerId (let the UI truncate if needed) |

**Defaults at-default (Q1-Q8):** I have no strong opinion
on Q1 (1-line is the chat convention; multi-line is
the verbose convention — pick one), Q2 (failure
distinction is the right call but the wording is
yours), Q3 (skipped surfacing is the right call but
the wording is yours), Q4 (host is the cleaner
seam; adapter is the easier test), Q5 (tool-call
blocks are intermediate; v1.3 only formats the
final result), Q6 (defensive throw is the right
default), Q7 (synthetic is more portable), Q8
(16-char truncation is the existing pattern).

## 5. Plan

### Sub-chunk v1.3.1 — per-skill formatters (1 commit)

- New: `apps/node/src/b-class-result-formatters.ts` —
  `formatSponsorFriendResult` + `formatPeerListResult` +
  `formatRelayStatusResult` + `B_CLASS_FORMATTERS` map +
  `getBClassFormatter` lookup.
- New: `apps/node/test/b-class-result-formatters.test.ts` —
  ~12 unit tests (4 per skill + 3 for `getBClassFormatter`).
- Existing 9 formatter unit tests + 59 router unit tests
  + 32 e2e tests regression-clean.

### Sub-chunk v1.3.2 — update skill-result-formatter (1 commit)

- Modify: `apps/node/src/skill-result-formatter.ts` —
  v1.2's `structured` path now dispatches to
  `getBClassFormatter` when the schemaRef matches.
  Add `parseToolResultContent` helper. Other
  `structured` blocks still throw.
- Modify: `apps/node/test/skill-result-formatter.test.ts` —
  replace the v1.2 "structured throws" tests with
  v1.3 "structured dispatches per-skill" tests
  (~6 tests).
- Modify: `apps/node/test/run-owner-agent-turn-routing.test.ts` —
  add ~2 e2e tests for B-class end-to-end
  (skill result formats + returns as chat reply).
- Existing tests regression-clean (the v1.2 tests
  that expected "B-class throws" are replaced;
  the v1.2 "B-class falls through to LLM" behavior
  is gone for B-class, preserved for unknown
  structured blocks).

### Sub-chunk v1.3.3 — doc closeout (1 commit)

- Modify: `docs/agent-harness-integration.md` —
  add v1.3 status to §9 change log.
- Modify: `docs/agent-network-engine.md` §2.2.2 —
  note v1.3's B-class formatter (the v1.2 sub-section
  currently says "B-class falls through; v1.3 ships
  the formatter").
- Modify: `docs/agent-harness-integration-v1-2.md` —
  status note: v1.2's B-class fall-through is now
  handled by v1.3.
- New: `docs/agent-harness-integration-v1-3.md` —
  status banner + commit log (this doc gets the
  "DONE" stamp).

**Total: 3 sub-chunks, bundled into 1 commit at the
end of v1.3 (per the v1.1 + v1.2 commit pattern).**
On `envoy_harness_integration` branch.

## 6. Out of scope (deferred)

- **Multi-line B-class formatters** (Q1 alternative) —
  v1.3 ships 1-line; multi-line is a UI affordance
  (v1.4 / Tauri work).
- **Format `tool-call` blocks** (Q5 alternative) —
  v1.3 only formats the final `tool-result` block;
  intermediate transcript stays in the audit log.
- **Format non-B-class `structured` blocks** (Q6
  alternative) — v1.3 only knows 3 B-class skills.
  Future skills add their formatters to the map.
- **Chat UX for B-class results** (Tauri) — the
  Social UI can render the 1-line summary as a
  "Sponsor bond" chip + a "details" button to
  expand the full `BClassSponsorFriendResult`.
  Tauri work, v1.4+.
- **Verifying the B-class formatter's output** —
  the chat dispatch doesn't verify the formatted
  string. The bridge's own `verify()` is the
  authoritative gate (Q4 of the v1.2 doc). v1.3
  trusts the bridge's result.

## 7. References

- [`agent-harness-integration.md`](./agent-harness-integration.md)
  (the design)
- [`agent-harness-integration-v1-2.md`](./agent-harness-integration-v1-2.md)
  (the v1.2 dispatch + Q2 / Q7 fall-through; v1.3
  removes the B-class fall-through)
- [`skill-result-formatter.ts`](../../apps/node/src/skill-result-formatter.ts)
  (the v1.2 formatter; v1.3 modifies the
  `structured` first-block path)
- [`translation.ts`](../../envoy-harness/packages/envoy-harness-adapter/src/translation.ts)
  (the `envoymesh://tool-result/v1` schemaRef
  encoding for `tool_result` local blocks)
- [`sponsor-friend.ts`](../../envoy-harness/packages/envoy-harness-adapter/src/b-class-skills/sponsor-friend.ts:131)
  (`BClassSponsorFriendResult` shape)
- [`peer-list.ts`](../../envoy-harness/packages/envoy-harness-adapter/src/b-class-skills/peer-list.ts)
  (`BClassPeerListResult` shape — v1.3 reads it)
- [`relay-status.ts`](../../envoy-harness/packages/envoy-harness-adapter/src/b-class-skills/relay-status.ts)
  (`BClassRelayStatusResult` shape — v1.3 reads it)

---

**Status:** 8 design questions locked (2026-08-21,
all defaults accepted; user validated fresh-eyes
review). ✅ **DONE** (bundled into 1 commit at end
of v1.3; user delegated commit).

### Commit log (2026-08-21)

| Commit | Sub-chunk | Description |
|---|---|---|
| (1 commit, user-delegated) | v1.3.1 + v1.3.2 + v1.3.3 bundled | 1 commit on `envoy_harness_integration` branch. v1.3.1: per-skill formatters (NEW `apps/node/src/b-class-result-formatters.ts`) + 30 unit tests. v1.3.2: update `skill-result-formatter.ts` to dispatch per-skill formatters + tool-call blocks (Q5 narrow) + Q6 silent fall-through + `console.debug` log + `NodeServiceImpl.askEnvoyHarnessSkill` updated to handle `string \| undefined` return + 20 unit tests + 2 new e2e tests. v1.3.3: doc closeout (`agent-harness-integration.md` change log + `agent-network-engine.md` §2.2.2 update + `agent-harness-integration-v1-2.md` status note + this DONE stamp). |

**Total:** 1 commit, 52 new tests (30 + 20 + 2), 143 pre-existing tests regression-clean. The **end-user-first** principle from `AGENTS.md` drove Q2's failure format: user-readable headline + cause + next-step + a `[debug details:]` block at the bottom (verbose for power users + audit log).

### Locked decisions (2026-08-21)

| # | Question | Locked answer |
|---|---|---|
| **Q1** | Format style | 1-line summary (compact; matches the v1.2 token-style summaries) |
| **Q2** | Failure format | Verbose multi-line with all `setupSponsorFriend*` fields (failures are rare; full context is justified) — **end-user-first ordering**: user-readable headline ("Couldn't set up the sponsor bond.") + plain-language cause ("Your relay is unreachable. The network kept dropping.") + next-step hint ("Click Retry, or check your relay.") + a `[debug details:]` block at the bottom with the raw fields (for power users + audit log) |
| **Q3** | Skipped reason surfacing | Show reason + relevant context (e.g. "cooldown (until 2026-08-22T...)") |
| **Q4** | Where do the per-skill formatters live? | Host (`apps/node/src/b-class-result-formatters.ts`) — the adapter is for `execute()`; the host formats for the chat surface |
| **Q5** | Handle tool-call blocks? | **Narrow scope:** format tool-call blocks only when the result's first block is a B-class `tool-result` (i.e. we're already in the B-class formatter path). LLM-ask skills (text first block) keep v1.2 behavior (tool-call blocks silently dropped). The B-class chat reply has 2 lines: the tool-call summary + the tool-result summary. |
| **Q6** | Unknown `structured` blocks | Silent fall-through to v1.1 LLM ask + `console.debug` line so owners can diagnose misconfigured skills (the debug log is silent in production; visible in dev/staging with verbose logging) |
| **Q7** | Test fixtures | Real bridge imports (`BClassSponsorFriendResult` / `PeerListResult` / `BClassRelayStatusResult`) — couples tests to the bridge's types; cleaner end-to-end typed tests |
| **Q8** | `peerId` truncation in chat | First 16 chars + `...` (matches the existing bond-trace chat UX pattern) |
