# envoy-harness integration — v2.1 sub-plan (bounded context fragments)

> **Status:** IN PROGRESS (2026-08-21). The primitive ships in
> envoy-harness (`src/context/`); the chain prompt-assembly
> integration is a follow-up chunk.
>
> **Reference:** Codex's `AGENTS.md` "Model visible context"
> rules — no unbounded items, hard cap 10K tokens per item,
> items >1K tokens are P0, every injected fragment implements
> `ContextualUserFragment` in `core/context`.

## 1. Goal

The chain's prompt assembly injects the subtask objective, the
verifier's verdict feedback, and the worker's last response
with **no size bounds**. A worker that returns a 50K-token
response inflates every subsequent step's prompt — silently
expensive. v2.1 makes every model-visible fragment a bounded,
typed, priority-ordered unit:

- Every fragment implements `ContextualUserFragment`.
- `estimatedTokens` is checked **at construction** — an
  over-budget fragment is rejected at the boundary, not at
  render time (when it's too late to fail the call).
- Assembly sorts by priority and truncates to a budget; a
  truncation policy decides what gets dropped first.

## 2. Primitive (this commit — envoy-harness `src/context/`)

```ts
export interface ContextualUserFragment {
  readonly id: string;                 // for log / debug
  readonly owner: string;              // "subtask-objective" | "verifier-feedback" | ...
  readonly priority: number;           // higher = kept longer
  readonly estimatedTokens: number;    // bounded at construction
  render(): string;                    // pure
}
```

- `createBoundedFragment(input, opts)` — throws when
  `estimatedTokens > hardCap` (default 10_000, the Codex cap).
- `assembleFragments(fragments, budget)` — stable-sort by
  priority desc, then render in order, truncating once the
  budget is exhausted; returns `{ text, dropped }` so the
  caller can audit what was dropped.

## 3. Follow-up chunk (deferred)

Wire the chain's prompt assembly (EnvoyMesh) through
`assembleFragments`: subtask objective (priority 100),
verifier feedback (50), worker last response (10). Until then,
the primitive is usable standalone + by hosts.

## 4. Why this matters

- Bounds the worst case: a 50K worker response can't silently
  blow every subsequent call.
- The truncation policy is explicit and auditable (the
  `dropped` list lands in the trace/audit).
- Same shape as Codex's rule → anyone who has read Codex
  recognizes the pattern.
