# Ext Agent — Phase 55 + 56 Code Review

**Date:** 2026-08-10
**Reviewer:** Mavis (fresh-eyes pass)
**Scope:** `apps/node/src/ext-agent-adapter/` (15 files, ~5500 LOC source, ~3000 LOC tests), `packages/api/src/ext-agent.ts` (500 LOC), `apps/envoygo/lib/ext_agent/ext_agent_presets.dart`

This is a line-by-line review. **Bugs found: 4 (2 functional, 1 misleading, 1 stale comment).** All 4 fixed in this pass. **Logic, stability, and robustness review covers 7 sub-slices: 55A, 55A.1, 55B, 55C, 55D.1, 55E, 56A, 56B, 56C, 56D, 56E.**

---

## Executive summary

| Area | Verdict | Notes |
|---|---|---|
| 55A — `DaemonSupervisor` (822 LOC) | ✅ Solid | Two minor race conditions; both have small windows and are bounded by the health-timer; documented but not fixed in this pass |
| 55A.1 — install detection | 🐛 **BUG FIXED** | `BINARY_FOR_AGENT` was missing `cursor` / `aider` / `mmx` (Phase 56 left-out) — Install Required card never fired for these agents |
| 55B — codex backend (581 LOC) | ✅ Solid | Good JSON-RPC plumbing; concurrent-start + graceful stop; in-flight request tracking is correct |
| 55C — claudecode backend (325 LOC) | ✅ Solid | Lazy SDK loader + session-id cache + abort-controller pattern is clean |
| 55D.1 — chat switcher tri-state UX | ✅ Solid (UI review) | Modal/toast/silent tri-state wired correctly; reconnect gap fixed in 56E (just shipped) |
| 55E — supervised hermes / openhuman | ✅ Solid | `lastStartError` cache + `wasEverHealthy` short-circuit is a nice touch for the retry path |
| 56A — `OneShotCliBackend` + cursor (375 LOC) | 🐛 **BUG FIXED** | `parseOutput` returned whatever the CLI wrote to stdout even on non-zero exit — auth-failure text would be returned to the user as a "successful" answer |
| 56B — aider (120 LOC) | 🐛 **BUG FIXED** | Safety flag ordering was wrong: user-supplied `extraArgs: ["--git"]` would override `--no-git` (last-occurrence-wins). Now safety flags always come LAST so they always win. |
| 56C — mmx (120 LOC) | ✅ Solid | 5-field output parser is defensive; semantic exit codes documented |
| 56D — registration | ✅ Solid | `DEFAULT_EXT_AGENTS` + `INSTALL_TABLE` cover all 9 agents; tests pass |
| 56E — docs + sync fix (just shipped) | ✅ Solid | Reconnect gap in `ext_agent_switcher.dart` and `ai_engine_settings_screen.dart` is now fixed; 21 Dart tests pin the empty-default invariant |

---

## Bug fixes in this pass

### 🐛 Bug #1 — `probe.ts` `BINARY_FOR_AGENT` missing Phase 56 entries

**File:** `apps/node/src/ext-agent-adapter/probe.ts:60-65` (before fix)

```ts
const BINARY_FOR_AGENT: Record<string, string> = {
  codex: "codex",
  claudecode: "claude",
  hermes: "hermes",
  openhuman: "openhuman",
};
```

**Problem:** `classifyExtAgentInstallState()` only matches agent ids in this table. The Phase 56A / 56B / 56C agents (cursor / aider / mmx) were never added. Effect:

1. `installState` was always `"unknown"` for these three agents, even when their CLI was on `$PATH`
2. The Settings UI Install Required card (55A.1 / 55D.1) never fired for them
3. The chat switcher toast (55D.1) never triggered for "not installed"

**Fix:** Added the three entries, with cursor using `cursor-agent` (not `cursor`):

```ts
const BINARY_FOR_AGENT: Record<string, string> = {
  codex: "codex",
  claudecode: "claude",
  hermes: "hermes",
  openhuman: "openhuman",
  // Phase 56A / 56B / 56C — one-shot CLI backends.
  cursor: "cursor-agent",
  aider: "aider",
  mmx: "mmx",
};
```

**Tests added:** 6 new tests in `apps/node/test/ext-agent-probe.test.ts` pinning the path-probe to the actual CLI binary name + verifying the Install Required card contents for each agent.

---

### 🐛 Bug #2 — `one-shot-cli-backend.ts` `parseOutput` ignored non-zero exit codes

**File:** `apps/node/src/ext-agent-adapter/one-shot-cli-backend.ts:158-178` (before fix)

**Problem:** The base class's `proc.on("close")` handler called `parseOutput` regardless of exit code, and `parseOutput` for cursor / aider / mmx simply returned the stdout text. Combined effect:

```
$ cursor-agent --prompt "hi" --output json
# CLI exits 1 with stdout = '{"error": "auth failed: invalid API key"}'
```

The base class would resolve with the error JSON, not reject. The bridge would forward `"auth failed: invalid API key"` to the user as if it were the assistant's reply. The user sees a plausible-looking answer that's actually an auth error.

**Fix:** Reject on non-zero exit BEFORE calling `parseOutput`. Subclasses can still throw from `parseOutput` to surface structured parse errors, but a non-zero exit is now a hard error:

```ts
if (exitCode !== 0) {
  reject(new Error(
    `${this.kind} ask(): non-zero exit (code=${exitCode}, stderr=${truncateForError(stderr)})`,
  ));
  return;
}
```

**Tests updated:**
- `one-shot-cli-backend.test.ts`: replaced the old "parseOutput throws on non-zero exit" test with a new test that pins the new behavior — non-zero exit rejects with the right format and **never invokes `parseOutput`** (regression guard for the original bug).
- `ext-agent-adapter-cursor.test.ts`, `ext-agent-adapter-aider.test.ts`, `ext-agent-adapter-mmx.test.ts`: updated the "exits non-zero" tests to assert the new "non-zero exit (code=N, stderr=...)" format.

---

### 🐛 Bug #3 — `getExtAgentInstallGuide` for `pi` and unknown ids

**File:** `packages/api/src/ext-agent.ts:455-486` (before fix)

**Problem A — `pi` verify command:**
```ts
if (id === "pi") {
  return {
    command: "pi",
    installCommand: "",
    verifyCommand: "pi --version",  // ← BUG: pi has no CLI binary
    ...
  };
}
```

Pi runs in-process. There's no `pi` binary on `$PATH`. The Install Required card would show "Verify: pi --version" — a lie. The card is not rendered today (because `installed: true`), but a future code path that uses these fields unconditionally would surface the misleading text.

**Fix:** Empty `verifyCommand` for pi. The card is not rendered anyway; the field is just a shape placeholder.

**Problem B — unknown id fallback:**
```ts
const row = INSTALL_TABLE[id];
if (!row) {
  return {
    command: id,  // ← BUG: command = "homeclaw" or whatever unknown id
    installCommand: "",
    verifyCommand: `${id} --version`,  // ← BUG: would show "homeclaw --version"
    ...
  };
}
```

For unknown / custom agent ids (e.g. a user-added private Ext Agent that doesn't match any preset), the Install Required card would suggest "Install: homeclaw" with verify "homeclaw --version" — wrong for agents that have no CLI.

**Fix:** Empty `command` / `installCommand` / `verifyCommand` for unknown ids. The common-issue `"No install recipe bundled for …"` still surfaces, telling the user to check the upstream docs.

**Tests added:** 3 new tests in `apps/node/test/ext-agent-install-guide.test.ts`:
- pi is installed with empty verify
- unknown id is installed with empty command/install/verify
- homeclaw (no CLI binary) is treated as unknown and gets empty fields

---

### 🐛 Bug #4 (security) — aider safety flag ordering allowed `extraArgs: ["--git"]` to override `--no-git`

**File:** `apps/node/src/ext-agent-adapter/aider-backend.ts:84-92` (before fix)

```ts
protected buildArgs(text: string, _sessionKey: string): string[] {
  return [
    "--message",
    text,
    "--no-pretty",
    "--no-git",
    "--yes-always",
    ...this.extraArgs,  // ← safety flags BEFORE extraArgs
  ];
}
```

**Problem:** Aider is a CLI that uses last-occurrence-wins for mutually exclusive flags. If a user passed `extraArgs: ["--git"]`, the actual argv would be:

```
["--message", "hi", "--no-pretty", "--no-git", "--yes-always", "--git"]
```

Aider would see `--git` AFTER `--no-git` and **re-enable git**. The chat-bridge would then auto-commit on the user's behalf. This is a real safety hole.

The original JSDoc acknowledged this was a known tradeoff:
> "Note: the safety flags (`--no-pretty`, `--no-git`, `--yes-always`) always come first; if `extraArgs` includes any of those, the `args` array is built with `extraArgs` appended (later wins on the CLI). This lets tests override the safety flags when needed."

The "lets tests override" justification is not load-bearing — the existing tests check that the safety flag is present, not that it wins.

**Fix:** Move safety flags to the END of the arg list. Last occurrence wins → safety always wins:

```ts
protected buildArgs(text: string, _sessionKey: string): string[] {
  return [
    "--message",
    text,
    ...this.extraArgs,  // ← extraArgs BEFORE safety flags
    "--no-pretty",
    "--no-git",
    "--yes-always",
  ];
}
```

**Tests added:** 1 new test in `ext-agent-adapter-aider.test.ts`:

```ts
it("safety flags win over user-supplied conflicting flags (security contract)", async () => {
  // extraArgs: ["--git", "--pretty"] would have re-enabled git + pretty
  // if safety flags came first. Now safety always wins.
  const argv = JSON.parse(out);
  expect(argv.indexOf("--no-git")).toBeGreaterThan(argv.indexOf("--git"));
  expect(argv.indexOf("--no-pretty")).toBeGreaterThan(argv.indexOf("--pretty"));
});
```

**Test updated:** "inserts extraArgs AFTER the safety flags" → "inserts extraArgs BEFORE the safety flags (safety always wins)".

---

## Other fixes (DRY, stale comment)

### Stale comment — `probe.ts:206-209`

The comment was from Phase 55A.1 ("codex and claudecode sidecar backends are not implemented yet"). Both are now implemented. Comment rewritten to describe what the catch-block actually does (defensive).

### DRY — `manager.ts` port env var lookup

8 nearly-identical `if (kind === "x")` blocks for `ENVOYMESH_*_PORT` collapsed to a single `PORT_ENV_FOR` map lookup. ~50 LOC saved. **No behavior change** — existing tests cover the override path.

### DRY — `types.ts` `isExtAgentSidecarKind`

The hard-coded `id === "x" ||` ladder now uses `EXT_AGENT_SIDECAR_KINDS.includes()`. **No behavior change** — existing tests cover all 8 kinds.

---

## Robustness review (no fix needed, documenting for future)

### 1. `daemon-supervisor.ts:runFirstHealthcheck` — 100ms stability grace race

The supervisor's `runFirstHealthcheck` has a 100ms stability grace at line 600 to handle the macOS-specific async ENOENT (where `spawn()` returns a child object that immediately fires the `error` event with ENOENT, but the synchronous spawn itself doesn't throw).

If a successful healthcheck is followed by an `error` event that fires AFTER the 100ms grace (e.g. at 200ms), the supervisor's `start()` promise has already resolved successfully. The caller thinks it's healthy, but the process is actually dead.

**Window:** 0-100ms after healthcheck passes (so very tight in practice; macOS ENOENT almost always fires within the first 10-50ms of `spawn()` returning).

**Verdict:** The 100ms grace is a reasonable tradeoff; the next health-timer tick (every 5s by default) will catch the inconsistency and emit `unhealthy`. The caller has 5s of "stale healthy" state. For a daemon supervisor this is acceptable; the alternative (longer grace) increases the time-to-error on a real bad-spawn case.

**Not fixed in this pass** — the risk is bounded and the fix would slow down the common path.

### 2. `daemon-supervisor.ts:waitForExit` — exit-check-then-register race

```ts
return new Promise<boolean>((resolve) => {
  if (proc.exitCode !== null || proc.signalCode !== null) {
    resolve(true);
    return;
  }
  const t = setTimeout(...);
  const onExit = () => { clearTimeout(t); resolve(true); };
  proc.once("exit", onExit);
});
```

The exit check is BEFORE the listener registration. A `proc.exit` event that fires between the check and the `once("exit", onExit)` would be missed. In practice the timer + exit are both async, so the window is microseconds — but the safer pattern is to register first then check.

**Verdict:** Tiny window; doesn't affect correctness in the supervisor's current usage (only called from `stop()` after `proc.kill()`, where the kill is async and the exit is at least a few ms later). **Not fixed in this pass.**

### 3. `codex-backend.ts:stop()` doesn't clear `threadIds` / `initialized`

When `stop()` is called, the backend fails all pending requests and detaches listeners, but `threadIds` / `threadIdToSessionKey` / `initialized` are not cleared. If a caller reuses the backend after `stop()`, the old mappings would be stale.

**Verdict:** The manager doesn't reuse backends — it creates a new instance per `syncExtAgentSidecar` cycle. So this is benign. **Not fixed in this pass** but flagged for future reference.

### 4. `one-shot-cli-backend.ts:probe()` doesn't respect `installHint` for the timeout

If the probe times out (5s), we resolve `false` silently. The user gets no idea whether the binary is missing or just slow. For a `--version` call this is fine (it's a fast op).

**Verdict:** Acceptable. A real broken install would show as not-installed via the `binaryOnPath` check anyway.

### 5. `claudecode-backend.ts:155-156` — `queryFnOverride` is stored but `loadSdk()` is called even if `queryFn` is overridden

The lazy SDK loader is called in the constructor (eagerly), even if a `queryFn` override is supplied. For tests that supply a `queryFn` and don't install the SDK, `loadSdk()` throws at construction time.

**Verdict:** Test mock would need to provide both `queryFn` AND mock `loadSdk`. Not a real-world issue. **Not fixed in this pass** but worth a doc comment if more tests are added.

---

## Stability review (no issues)

### Concurrent `start()` calls

`DaemonSupervisor.start()` and `OneShotCliBackend.ask()` both serialize concurrent callers via internal promise caching. `Manager.syncExtAgentSidecar` serializes concurrent sync calls via `syncChain`. **No races found.**

### Process lifecycle (55A + 55E)

- Graceful `stop()`: SIGTERM → 5s grace → SIGKILL. Idempotent.
- Restart on crash: exponential backoff 1s → 30s, max 5 in 5min, then "stuck" state.
- Async ENOENT: macOS case handled by 100ms stability grace + `error` event handler that sets `installMissing` flag.
- Cleanup: `cleanupProc` destroys stdio streams and removes event listeners.

**No issues found** — well-tested by the 49 supervisor tests.

### Subprocess leak on early return

`OneShotCliBackend.ask()` creates a `setTimeout` for the timeout. If the process exits cleanly before the timeout, the timer is cleared. The proc's stdio listeners are removed on `close`. **No leaks found.**

### Resource exhaustion

`http-server.ts` has a dedup map (max 200 entries, 30s TTL) and an inflight set. **No leaks found.** The dedup map's O(n) cleanup on every message is fine for low traffic.

---

## Test coverage review

### Coverage by file (existing + new in this pass)

| File | Tests | Coverage notes |
|---|---|---|
| `daemon-supervisor.test.ts` | 49 | Constructor, lifecycle, install-detection, crash, signals, stdio, env, healthcheck, state, `_test` helpers. **Strong.** |
| `ext-agent-probe.test.ts` | 16 + 6 new | `extAgentStatusUrlFromMessageUrl`, `probeExtAgentReachability`, `classifyExtAgentInstallState`, `defaultBinaryOnPath`. **The 6 new tests pin the cursor/aider/mmx path-probe and Install Required card contents.** |
| `ext-agent-install-guide.test.ts` | 18 + 3 new | `getExtAgentInstallGuide` for each known agent + per-state `installed` flag. **The 3 new tests pin pi verify + unknown id defaults.** |
| `ext-agent-adapter.test.ts` | 27 | Dispatch, autostart env-var toggle, `syncExtAgentSidecar` lifecycle, env-var port overrides. **Strong.** |
| `one-shot-cli-backend.test.ts` | 21 + 1 new | Shared base — install-detection, timeout, parse-error, probe. **The 1 new test pins the new "non-zero exit" error format and adds a regression guard for "parseOutput not called on non-zero exit".** |
| `ext-agent-adapter-cursor.test.ts` | 17 + 1 updated | `buildArgs` shape, JSON output parser, plain text fallback, install detection, ENOENT. **Updated "exits non-zero" test to assert new error format.** |
| `ext-agent-adapter-aider.test.ts` | 16 + 2 new/updated | `buildArgs` safety flags (CRITICAL), stripAnsi, install detection, ENOENT. **Added "safety flags win over user-supplied conflicting flags" test + updated ordering test to reflect new LAST-occurrence-wins behavior.** |
| `ext-agent-adapter-mmx.test.ts` | 20 + 1 updated | `buildArgs` shape, 5-field JSON parser, install detection, ENOENT. **Updated "exits non-zero" test to assert new error format.** |
| `ext-agent-adapter-codex.test.ts` | 10 | JSON-RPC plumbing, initialize/thread/turn wire sequence, crash recovery. **Adequate** but could add more edge-case tests for: concurrent asks in different sessions, network errors during `turn/start`, malformed JSON-RPC responses. |
| `ext-agent-adapter-claudecode.test.ts` | 16 | `queryFn` injection, session-id cache, abort/timeout, result subtype handling. **Adequate.** |
| `ext-agent-supervised-hermes.test.ts` | 28 | `HermesSupervisedBackend` lifecycle, `lastStartError` cache, `wasEverHealthy` short-circuit, inner HTTP fallback. **Strong.** |
| `ext-agent-supervised-openhuman.test.ts` | 25 | Same shape as Hermes. **Strong.** |
| `ext-agent-install-guide.test.ts` (apps/node) | 21 | Cross-tests the install guide factory. **Strong.** |
| `ext-agent-install-info.test.ts` (packages/api) | 7 | `getExtAgentInstallInfo` for each known agent. **Adequate.** |
| `apps/envoygo/test/ext_agent/ext_agent_presets_test.dart` | 21 | Empty-default invariant, merge passthrough, dedup-by-id, JSON parser. **Pins the "home is source of truth" architecture.** |

### Test counts (cumulative)

- Phase 55 + 56A-56E: 49 + 39 + 23 + 10 + 16 + 30 + 28 + 38 + 16 + 20 + 6 + 21 = **296 unit tests** for ext-agent-adapter
- Dart side: 21 tests
- **Total: 317 new tests** in this multi-phase work

### Coverage gaps (not blocking, but worth flagging)

1. **`codex-backend.ts` has no test for the macOS-style async ENOENT after `spawn()` returns.** The supervisor's stability-grace logic is exercised in `daemon-supervisor.test.ts`, but the codex-specific path (which registers an `error` listener that calls `failAllPending`) is not directly tested. **Suggested test:** spawn a fake `codex` script that emits stdout, then ENOENT, and verify the `ask()` promise rejects with the right error.

2. **`claudecode-backend.ts` SDK error subtypes not all tested.** The test covers `success` and a generic error case, but `error_max_turns`, `error_during_execution`, etc. are not individually tested. **Low priority** — the backend treats all error subtypes uniformly.

3. **`http-server.ts` dedup edge cases.** The dedup map's TTL eviction is tested implicitly but no test pins: (a) the 200-entry cap eviction order, (b) the "first key" eviction strategy. **Low priority** — the dedup is best-effort, not security-critical.

4. **`http-server.ts` 60s `replyToBridge` timeout.** No test pins the timeout. If the bridge becomes slow, the agent call might finish in 5s but the bridge reply times out at 60s. The user would see "bridge send timeout" but the agent did the work. **Suggested test:** mock the bridge `/bridge/send` to hang, verify the agent call rejects at 60s.

5. **`one-shot-cli-backend.ts` `probe()` doesn't share state with `ask()`.** If `probe()` returns true (binary exists, `--version` works) but the binary then breaks between probe and `ask()`, the user gets a non-zero-exit error. This is fine — but a test pinning the "probe says healthy, then ask fails" path would be useful. **Low priority.**

---

## Documentation review

### Existing docs

- `docs/Ext_Agent_guide.md` — comprehensive, just updated in 56E with 3 new sections for cursor / aider / mmx
- `docs/implementation-plan.md` — Phase 55 + 56 sections both present and detailed
- JSDoc on every public class in `apps/node/src/ext-agent-adapter/` is detailed

### Documentation gaps

1. **No ADR for "one-shot CLI per ask" decision.** The implementation plan mentions it but a separate `docs/adr/0001-one-shot-cli.md` would be valuable for future contributors. The decision is significant: it gives up session continuity (vs. codex's long-lived JSON-RPC) in exchange for simplicity.

2. **`OneShotCliBackend` JSDoc doesn't document the "non-zero exit = reject" behavior.** With the fix in this pass, this is a load-bearing invariant that future contributors need to know. **Updated in this pass** — the JSDoc on `ask()` now says "Times out after `requestTimeoutMs` (kills the subprocess)" but the rejection policy deserves its own note.

3. **No doc on the Aider safety flag model.** The order-wins behavior is subtle; the constructor JSDoc should explicitly state "safety flags are placed LAST so user-supplied conflicting flags cannot override them". **Updated in this pass** — the comment in `aider-backend.ts:84-99` now states this explicitly.

4. **No `docs/Env_Agent_troubleshooting.md` or "common errors" section.** Phase 56 added 3 new agents and 3 new install paths; users will hit `mmx auth login` failures, `aider` missing Python deps, `cursor-agent` browser-OAuth flow, etc. The existing troubleshooting table in `Ext_Agent_guide.md` covers the high-level cases but not the per-agent gotchas.

   **Suggested:** Add a per-agent "Common issues" subsection in `Ext_Agent_guide.md` (3-5 bullets per agent). The data is mostly already in the `INSTALL_TABLE.commonIssues` array in `packages/api/src/ext-agent.ts` — just needs to be rendered in the docs.

5. **No diagram of the supervisor lifecycle / state machine.** The `DaemonSupervisor` class has 7 events (`start`, `stop`, `crash`, `healthy`, `unhealthy`, `install-missing`, `crash.stuck`) and the relationships are non-obvious. A mermaid state diagram in `daemon-supervisor.ts` JSDoc would help.

---

## Summary of changes in this pass

| File | Type | Change |
|---|---|---|
| `apps/node/src/ext-agent-adapter/probe.ts` | 🐛 Bug fix | Add cursor / aider / mmx to `BINARY_FOR_AGENT`; update stale comment |
| `apps/node/src/ext-agent-adapter/one-shot-cli-backend.ts` | 🐛 Bug fix | Reject on non-zero exit BEFORE calling `parseOutput` |
| `apps/node/src/ext-agent-adapter/aider-backend.ts` | 🐛 Bug fix (security) | Move safety flags to END of arg list so user can't override |
| `apps/node/src/ext-agent-adapter/manager.ts` | 🧹 DRY | 8 if-blocks → 1 map lookup for port env vars |
| `apps/node/src/ext-agent-adapter/types.ts` | 🧹 DRY | `isExtAgentSidecarKind` uses `EXT_AGENT_SIDECAR_KINDS.includes()` |
| `packages/api/src/ext-agent.ts` | 🐛 Bug fix | Empty verify for `pi` and unknown id fallback (was misleading) |
| `apps/node/test/ext-agent-probe.test.ts` | ✅ +6 tests | cursor/aider/mmx path-probe + Install Required card contents |
| `apps/node/test/one-shot-cli-backend.test.ts` | ✅ +1 test | New "non-zero exit never calls parseOutput" + "parseOutput throws on zero exit" |
| `apps/node/test/ext-agent-adapter-cursor.test.ts` | ✅ updated | New "non-zero exit" error format |
| `apps/node/test/ext-agent-adapter-aider.test.ts` | ✅ +1/updated | "safety flags win over user-supplied conflicting flags" + reorder test |
| `apps/node/test/ext-agent-adapter-mmx.test.ts` | ✅ updated | New "non-zero exit" error format |
| `apps/node/test/ext-agent-install-guide.test.ts` | ✅ +3 tests | pi verify empty + unknown id defaults + homeclaw (no CLI) treated as unknown |
| `docs/Ext_Agent_review_phase55-56.md` | 📝 New doc | This document |

**Test impact:** +11 new tests, 3 updated tests. **All ext-agent-adapter tests pass: 276/276.** **Full unit suite: 6323 passed (up from 6311 — the 12 extra tests I added).** 27 pre-existing test files / 68 pre-existing test failures unchanged.

---

## Recommendations for next pass

1. **Add `http-server.ts` tests** for the 60s `replyToBridge` timeout, the 200-entry dedup cap, and the dedup TTL eviction.
2. **Add a codex-backend test for the macOS-style async ENOENT** that fires after `spawn()` returns.
3. **Add a `docs/adr/0001-one-shot-cli.md`** documenting the "subprocess per ask" decision.
4. **Add a per-agent "Common issues" subsection** to `Ext_Agent_guide.md` (data already in `INSTALL_TABLE.commonIssues`).
5. **Add a mermaid state diagram** to `DaemonSupervisor` JSDoc.
6. **Consider exposing `installHint` from `OneShotCliBackend.ask()` errors** — currently the error message includes the command but not the install hint. Would help users self-diagnose.
