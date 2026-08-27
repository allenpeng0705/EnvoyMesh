# Chunk D1 — adapter-driven chain worker

> **Status:** ✅ DONE (2026-08-22, working tree — pending user commit).
> Part of the **distributed-collaboration** major feature
> (`docs/distributed-collaboration.md` in envoy-harness;
> `implementation-plan.md` §"Distributed collaboration").

## Goal

The envoy-harness chain worker (`createEnvoyHarnessChainSubtaskExecutor`)
ran on the legacy text-in/text-out `ask` seam. D1 makes it **adapter-driven**:
the live runtime's `EnvoyHarnessAdapter` executes + verifies the subtask and
emits the standard `task.chain.partial` stream with named artifacts — the
same wire shape as the OpenClaw MAP path. This is the prerequisite for both
distribution scenarios: the mesh team-job path and the standalone peer
server (the peer server is the same adapter behind JSON-RPC).

## Changes

- `apps/node/src/chain-map.ts` — `MapChainSubtaskExecutorInput.adapter`
  accepts `AgentAdapter | (() => AgentAdapter | undefined)` (lazy getter).
  The executor resolves it after the readiness gate; a getter returning
  `undefined` despite ready fails cleanly with `unavailableCode` (no model
  call). Backward compatible (existing callers pass the adapter object).
- `apps/node/src/chain-worker-executor.ts` —
  `createEnvoyHarnessChainSubtaskExecutor` now takes `adapter: () =>
  AgentAdapter | undefined` (lazy — the runtime builds the adapter on first
  ask) instead of `askEnvoyHarness`, and delegates to
  `createMapChainSubtaskExecutor` (`engineLabel: "envoy-harness"`,
  `unavailableCode: "envoy_harness_unavailable"`).
- `apps/node/src/node-service-chain-orchestration.ts` — the envoy engine
  branch passes `adapter: () => deps.getEnvoyHarnessAdapter?.()` (the v1.16
  host seam) instead of `askEnvoyHarness`.

## Behavior changes (intended)

- Worker-side result is now a structured `SignedAgentResult` (validated by
  `SignedAgentResultSchema`) with named artifacts, not just text.
- `runVerify` defaults on: the worker-side local verifier runs before
  finalizing; a `fail` verdict fails the subtask (`map_verify_fail`); a
  pass carries its rule score into `confidence` (e.g. 1.0) instead of the
  legacy 0.85.
- Empty content fails with `map_empty_result`; adapter unavailable (getter
  undefined despite ready) fails with `envoy_harness_unavailable`.

## Tests

- Updated e2e: the executor drives the **real runtime adapter** (warm-up +
  subtask execute via `FakeModel`), emits the partial stream with named
  artifacts, and reports a pass verdict confidence. The fixture's
  `ModelResponse.usage` was corrected to `{ inputTokens, outputTokens }`
  (the schema validation surfaced the legacy fixture's wrong shape).
- Updated unavailable test: adapter getter must not resolve when not ready.
- New test: adapter getter returns undefined despite ready → clean
  `envoy_harness_unavailable`, no model call.

## Verification

- `tsc -b` clean.
- EnvoyMesh hermetic lane: 449 passed (chain-map + runtime executor
  suites included).

## Next

Chunk D2 — `@envoymesh/envoy-harness-peer` package + JSON-RPC transport +
`PeerMeshSubmitter` (in-process pair + parity vs `LocalMeshSubmitter`).
