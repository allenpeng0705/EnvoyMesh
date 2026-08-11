# ADR-0001: One-shot CLI subprocess per ask (Phase 56)

**Status:** Accepted
**Date:** 2026-08-10
**Phase:** 56 (A/B/C)
**Authors:** Allen Peng (sponsor), Mavis (review)

---

## Context

EnvoyMesh's Ext Agent bridge can drive any of 9 external AI agents
(Pi, HomeClaw, Hermes, OpenHuman, Codex, Claude Code, Cursor CLI,
Aider, MMX-CLI). Three of these — Cursor, Aider, and MMX-CLI — are
shipped as standalone CLI binaries that the user installs and runs
locally. The bridge needs to invoke them on demand when the user
sends a message to Ext Agent chat.

There are two architectural choices for invoking these CLIs:

1. **Long-lived subprocess per agent** — spawn the CLI once, keep it
   alive across asks, speak a custom wire protocol (JSON-RPC,
   NDJSON, or a domain-specific schema) for the lifetime of the
   sidecar. This is what the Codex (55B) and Hermes/OpenHuman
   (55E-supervised) backends already do.

2. **One-shot subprocess per ask** — spawn a fresh subprocess for
   every `ask()` call, capture stdout, parse the response, return
   the text. Kill the subprocess on timeout. No long-lived state.

We need to pick one for Phase 56.

## Decision

**Use option 2 (one-shot subprocess per ask) for Cursor, Aider, and
MMX-CLI.** The shared infrastructure lives in
`OneShotCliBackend` (see `apps/node/src/ext-agent-adapter/one-shot-cli-backend.ts`).

## Rationale

### Why one-shot

1. **No wire protocol to maintain.** The Codex / Hermes / OpenHuman
   backends each define a JSON-RPC schema and parse the CLI's
   stateful output. For Cursor / Aider / MMX-CLI, the "wire" is
   `argv` + stdout + exit code — a stateless contract. The CLI is
   invoked once with the user's text as a flag, and emits a single
   response on stdout. There's no session to maintain.

2. **Crash isolation by construction.** A long-lived subprocess can
   drift into a bad state (memory leak, file-handle exhaustion, stuck
   event loop). A fresh subprocess per ask is immune: every `ask()`
   starts with a clean process. The cost is spawn overhead (~50-200ms
   per ask), but for chat-bridge use cases (10-60s typical response
   time) this is negligible.

3. **Install detection is unified with the 55A DaemonSupervisor.**
   `OneShotCliBackend` reuses `InstallMissingError` (the same shape
   the 55A `DaemonSupervisor` raises) so the existing 55A.1 Install
   Required card path surfaces automatically when the binary is
   missing. No new install-card code to write.

4. **Simpler testing.** Spawn a real `node` script as a fake CLI,
   assert on stdout — no need to maintain a daemon. Tests run in
   <1s each.

5. **Session continuity is the agent's responsibility, not ours.**
   `OneShotCliBackend.ask(text, sessionKey)` validates `sessionKey`
   is non-empty but doesn't use it. Cursor's `--resume <sessionId>`,
   Aider's `--chat-history-file`, and MMX's session-id are all
   available via the backend's `extraArgs` constructor option. A
   future caller that needs continuity can plumb `sessionKey` →
   `--resume` without changing the base class.

### Why NOT one-shot for Codex / Hermes / OpenHuman

- **Codex already has a long-lived design** (55B). The `app-server`
  JSON-RPC over stdio is the official way to drive Codex; the CLI
  is built around persistent connections. Re-implementing it as
  one-shot would fight the protocol.
- **Hermes and OpenHuman run as long-lived daemons** (their primary
  use case is "leave them running"). The supervisor (55A) is the
  right pattern for them; the 55E autostart wrapper just adds lazy
  spawn on first `ask()`.
- **Pi and Claude Code run in-process.** The SDK or runtime is
  imported into the home node, not a separate process. The
  supervisor pattern is irrelevant.

## Consequences

### Positive

- **Smaller code surface.** `OneShotCliBackend` is ~270 LOC; each
  per-agent subclass is ~100 LOC (3 × 100 = 300 LOC). Total: ~570
  LOC for 3 agents. The 55B/55C/55E approach would be ~1500+ LOC
  for 3 agents (each with its own JSON-RPC schema, restart policy,
  healthcheck, install-card surface).
- **No session-key plumbing required** for the common case. Session
  continuity is an opt-in via `extraArgs` if a future caller needs
  it.
- **Tests are fast and hermetic.** The fake-script-with-probe
  pattern spawns a real `node` process, asserts on its stdout, and
  exits in <1s.

### Negative

- **Spawn overhead per ask.** ~50-200ms on cold path, less on warm
  path (filesystem cache). For chat-bridge responses (10-60s), this
  is negligible. For high-frequency calls (>10/sec), the overhead
  would add up — but the chat-bridge is not a high-frequency API.
- **No streaming.** One-shot means the user sees nothing until the
  CLI exits and we parse stdout. Long-lived backends can stream
  delta tokens. Acceptable tradeoff for chat-bridge (vs. UI).
- **CLI args can't grow unbounded.** Each `extraArgs` is a string[];
  for very long conversations the `--message <text>` flag could
  exceed the OS argv limit (~256KB on Linux, ~64KB on macOS). For
  Cursor / Aider / MMX, the practical limit is well above typical
  chat-bridge messages. We do not pass large context blobs.

### Risks

- **macOS ENOENT race** (documented in `daemon-supervisor.ts:560-575`).
  `spawn()` returns a child object for a non-existent binary that
  fires the `error` event with `ENOENT` some time later. We catch
  this in `OneShotCliBackend.ask()` via the `proc.once("error", ...)`
  handler. The pre-spawn `command -v` check is the primary defense.
- **Process group leak.** A long-running one-shot CLI (e.g. Aider
  spawning a Python venv) could leak child processes on SIGKILL.
  We don't process-group-kill by default. This is acceptable for
  the current agents; revisit if a future agent spawns heavy
  subprocesses.
- **Aider safety flag ordering.** Aider's `--no-git` / `--no-pretty`
  / `--yes-always` are placed LAST in argv so user-supplied
  conflicting flags cannot override them (last-occurrence-wins).
  The Phase 55+56 review caught and fixed this — see the
  review's bug #4.

## Alternatives considered

### 1. Long-lived subprocess per agent (Codex / Hermes / OpenHuman pattern)

**Pros:**
- Streaming (delta tokens)
- Session continuity is free
- Matches the existing 55B / 55E / supervised pattern

**Cons:**
- Each agent needs a JSON-RPC schema, restart policy, healthcheck
- 3 new JSON-RPC parsers (~1500 LOC) for 3 agents
- The 3 target CLIs don't all have a stable wire protocol —
  Cursor's CLI is still in flux, Aider's stdout is human-readable
  by default, MMX's CLI is brand-new (2026-04-09)

**Verdict:** Rejected. The wire-protocol cost dominates the
spawn-overhead cost for chat-bridge use.

### 2. HTTP server per agent (the Hermes / OpenHuman pattern)

**Pros:**
- No subprocess management at all
- Reuses the existing HTTP-client code in `backends.ts`

**Cons:**
- Each target CLI would need to ship with an HTTP adapter (or
  we'd need to write one in TypeScript and ship it as a wrapper)
- The user's `~/.cursor/bin/cursor-agent` binary is the agent —
  adding an HTTP adapter means an extra hop, an extra process,
  and an extra config surface

**Verdict:** Rejected. The CLIs already accept the user's text
as a flag; an HTTP adapter adds nothing.

### 3. Library imports (the Claude Code pattern)

**Pros:**
- In-process, no spawn overhead
- TypeScript types

**Cons:**
- Aider, Cursor, MMX don't ship a Node library
- Wrapping each in a library would mean maintaining a TypeScript
  shim that calls the CLI

**Verdict:** Rejected. The CLIs are the canonical interface;
shims add maintenance cost.

## Implementation reference

- `apps/node/src/ext-agent-adapter/one-shot-cli-backend.ts` — shared base class
- `apps/node/src/ext-agent-adapter/cursor-agent-backend.ts` — Phase 56A
- `apps/node/src/ext-agent-adapter/aider-backend.ts` — Phase 56B
- `apps/node/src/ext-agent-adapter/mmx-backend.ts` — Phase 56C
- `apps/node/test/one-shot-cli-backend.test.ts` — 22 tests for the base
- `apps/node/test/ext-agent-adapter-cursor.test.ts` — 17 tests
- `apps/node/test/ext-agent-adapter-aider.test.ts` — 22 tests
- `apps/node/test/ext-agent-adapter-mmx.test.ts` — 20 tests
- `docs/Ext_Agent_guide.md` — operator-facing docs
- `docs/implementation-plan.md` (Phase 56) — design history

## When to revisit

This decision should be revisited if any of the following becomes true:

1. **A new agent's CLI is designed for stateful sessions** (e.g.
   `gpt-cli` ships a built-in `--resume` flow). One-shot can still
   handle this via `extraArgs`; if the protocol becomes complex
   enough, a long-lived variant may be cheaper.
2. **Spawn overhead becomes a bottleneck** (>100ms per ask at the
   50th percentile). Could add a process pool (reuse warm
   subprocesses). Out of scope today.
3. **A new agent needs streaming delta tokens to the UI** (e.g. for
   a "live response" UX). One-shot fundamentally can't stream; the
   long-lived pattern is required.
4. **The macOS ENOENT race causes too many false-positive
   install-missing reports in production.** Today, the pre-spawn
   `command -v` check + 100ms grace + post-grace healthcheck catch
   the common cases. If the false-positive rate climbs, the
   supervisor's grace should be tuned (see the Phase 55+56 review).
