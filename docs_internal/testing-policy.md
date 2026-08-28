# Test policy

## How tests are organized

| Layer | Command | What it runs | When to use it |
|-------|---------|--------------|----------------|
| Unit + integration (default) | `npm test` | All unit + integration tests across `packages/*/test/` and `apps/*/test/**`, **excluding** E2E | Local dev loop, every PR |
| E2E only | `npm run test:e2e` | All E2E test files (multi-node libp2p, Playwright, browser) | Before merging a feature that touches mesh/relay/call paths |
| Specific E2E category | `npm run test:e2e:call-signaling`, `test:e2e:webrtc`, `test:e2e:relay`, etc. | A targeted subset of E2E | When iterating on one subsystem |
| E2E via env-var (legacy) | `RUN_E2E=1 npm test` | Same as `npm run test:e2e` — re-include E2E files in the default run | Used by some CI workflows |

## E2E opt-in gate

By default `npm test` **skips** all E2E tests. This is controlled in `vitest.config.ts`:

```ts
exclude: (() => {
  const always = ["**/node_modules/**", "packages/openclaw/test/**"];
  if (process.env.RUN_E2E === "1") return always;
  return [
    ...always,
    // File-name conventions
    "**/integration/**/*.test.ts",
    "**/test/**/*e2e*.test.ts",
    "**/test/**/*smoke*.test.ts",
    "**/test/**/*playwright*.test.ts",
    "**/test/**/*two-home*.test.ts",
    "**/test/**/*three-home*.test.ts",
    "**/test/**/*two-node*.test.ts",
    "**/test/**/*three-node*.test.ts",
    "**/test/**/*chain-playwright*.test.ts",
    "**/test/**/*chain-e2e*.test.ts",
    "**/test/**/*federated-rag*.test.ts",
    "**/test/**/*phase-*-e2e*.test.ts",
    // ...specific files that don't match the above patterns
  ];
})(),
```

If you're adding a new E2E test file, give it one of the conventional names (`*-e2e*.test.ts`, `*-smoke*.test.ts`, `*-playwright*.test.ts`, `*-two-home*.test.ts`, `*-three-home*.test.ts`, `*-two-node*.test.ts`, `*-three-node*.test.ts`) — that way it's automatically picked up by `npm run test:e2e`. If your file doesn't fit those patterns, add the path to the explicit list in `vitest.config.ts`.

## Why is E2E excluded by default?

E2E tests need infrastructure that isn't always available:

- **Multi-node libp2p E2E** (`*-e2e*.test.ts`, `*-two-home*.test.ts`, `*-three-home*.test.ts`) — spins up real `EnvoyMesh` instances and tries to connect them. They fail on developer machines behind NAT, in sandboxes, or with limited networking, because the libp2p swarm bootstrap (`bootstrap.libp2p.io`) is often slow or blocked.
- **Playwright / browser E2E** (`*-playwright*.test.ts`, `webrtc-call-e2e.test.ts`, `social-ui-e2e.test.ts`) — needs Chromium. Locally: `npx playwright install chromium`. CI: installed in `ci-smoke-local.yml` before the smoke step.
- **Smoke tests** (`*-smoke*.test.ts`) — same network needs as multi-node libp2p E2E.

If you ran them all in `npm test`, the developer feedback loop would be dominated by infrastructure-related failures, not actual code regressions.

## Pre-existing test failures

**Status: cleared.** `npm test` is **green** (`527 test files passed | 4 skipped`, `4425 tests passed | 15 skipped`, `0 failed`) and `npm run typecheck` reports zero errors. The previously documented "16 known failures" (114 → 16 → 0) were all fixed in this round. The mix was:

| Area | Fix |
|------|-----|
| `post-merge-chat-regression.test.ts` (6 tests) | Added `resetOwnerWarmCoordinatorForTests()` in `beforeEach` so the global warm-coordinator dedup state doesn't bleed across tests; switched `toEqual({connected, direct})` to `toMatchObject` to absorb the `pathVerified` decoration `withPathVerified` adds on connected peers. |
| `call-manager.test.ts` (2 tests) | Tests were passing 4 trailing args (`undefined, undefined, "audio", "<peerId>"`) — the 8th positional arg is `callerTransportPeerId`, so `"audio"` was binding to the transport slot. Removed the redundant leading `undefined`. |
| `call-reinvite.test.ts` | Test passed `peerDirectoryStore: {} as any`; production calls `listPeerRecords`/`getPeerByPeerId`. Provided real-method mocks returning `[]`/`null`. |
| `session-token-persistence.test.ts` | **Production bug**: `mergeInboundDeviceBinding` in `@envoymesh/local-store` returned early when no matching record existed, so a freshly-paired device was invisible to subsequent lookups. Now it creates a row when none exists. |
| `profile-sync-directory-learn.test.ts` | Mesh mock was missing `getConnectedPeerIds`/`scrubPeerStoreDialHints`/`sendChatExpectEnvelopeReply`. Added them (and made the reply return the envelope directly, matching the real `sendChatExpectEnvelopeReply` signature). |
| `mobile-node/test/index.test.ts` | **Production bug**: `_reconcileInboundDirectChatMessage` rebuilt `sender.nodeId` from `chatLog.sender.ownerId`, losing the envelope peer ID. Now preserves `message.sender.nodeId` from the inbound envelope while using the log row for `ownerId`/display name. |
| `daemon-agent-card-inbound.test.ts` | `mesh: { send: vi.fn() }` no longer covered the outbound-delivery code path. Added `createMockMesh(send)` helper providing every method the deliver chain touches (`getPeerConnectionInfo`, `closeConnectionsToPeer`, `ensurePeerReachable`, etc.). |
| `agent-card-a2e-full-daemon.test.ts` | Phase 13C full-daemon E2E — belongs behind the E2E gate. Added `**/test/**/*a2e*.test.ts` to the exclude list (the existing `*e2e*` pattern didn't match `a2e`). |
| `chat-diagnostics.test.ts` | **Production bug**: `buildChatDiagnostics` showed only hints the outbound send would use (which strips `/p2p-circuit/` when a direct TCP path is available). Diagnostics should expose *all* resolved options so operators can see relay fallback. Added a merge of seed circuit hints into the diagnostic view. |
| `node-service-fleet-manifest.test.ts` | Already passing — verified, no fix needed. |
| `search-peers.test.ts` (2 tests) | **Production bug**: `searchLocalPeers` skipped blocked trust records only via `bondedOwnerIds`, but the unbonded-sample branch then added blocked peers. Added a `blockedOwnerIds` early-continue so blocked peers are never surfaced regardless of branch. |
| `packages/protocol/test/role-policy-table.test.ts` | Schema added `call.mute` but the test asserted `length === 6`. Updated count to 7 (the policy table already had `call.mute` mapped to `HUMAN_HUMAN_ONLY`). |
| `packages/local-store/test/jsonl-resilience.test.ts` | Already passing — verified, no fix needed. |

Each fix distinguishes test drift (wrong arg order, stale counts, missing mocks) from production bugs (silent no-op on missing row, value lost in reconciliation, blocked-peer leak). The production bugs are now real protection against future regressions.

## Adding a new E2E test

1. Use one of the conventional file-name suffixes so it's auto-included by `npm run test:e2e`.
2. If the test needs Chromium or live libp2p, also add a graceful skip path so it doesn't break `npm test` if the dependencies are missing.
3. Don't put unit-test-style assertions in an E2E file — those belong in unit tests. E2E tests verify the end-to-end behavior of a real node pair or a real browser.
4. Update `vitest.config.ts` if your E2E test file doesn't match the conventional suffixes.

## CI expectations

The `ci-smoke-local.yml` workflow runs:

1. `npm test` — the curated unit + integration view (E2E excluded by default)
2. `npm run smoke:local-two-node` and `npm run smoke:phase13-two-node` — the operator-defined two-node libp2p smoke tests
3. `npx playwright install chromium` followed by `npx vitest run apps/node/test/webrtc-call-e2e.test.ts apps/node/test/social-ui-e2e.test.ts` — the browser E2E that the gate skipped locally

So even though `npm test` skips E2E in CI, the smoke and browser-E2E steps still run, and a real failure there will fail the build.

The `ci-node-refactor.yml` workflow runs a hand-picked subset of 13 test files — useful for refactoring PRs that touch `apps/node/**` and need a fast signal without the full unit + integration suite.
