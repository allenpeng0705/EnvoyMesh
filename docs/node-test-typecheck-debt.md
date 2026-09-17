# Node test typecheck debt

`npm run typecheck:tests:node` (`tsc -p tsconfig.test.json`) is the only program
that typechecks `apps/node/test/**`. It started as a 5-file seed. This document is
the measured inventory of what is still *outside* it, so widening the seed is a
checklist instead of an archaeology project.

**Ground rules for whoever works this list:** fix by giving a fixture its real
shape (schema-built fixtures beat hand-written literals), never by `skipLibCheck`,
`@ts-ignore`, `@ts-expect-error`, `as any`, `as unknown as`, deleting a test,
weakening an assertion, narrowing an already-covered include, or changing a
`strict`-family flag. When a real error cannot be fixed without changing test
*behaviour*, leave it and add it to the "needs a decision" list below. An honest
count beats a smaller one.

## How to re-measure

The compiler settings must match `tsconfig.test.json` exactly (same `extends`,
same `paths: {}`, same `lib`). `tsconfig.test.measure.json` is the checked-in
throwaway that only widens `include`; compile it:

```bash
npx tsc -p tsconfig.test.measure.json --pretty false 2>&1 | grep -c 'error TS'
npx tsc -p tsconfig.test.measure.json --pretty false 2>&1 \
  | grep -E 'error TS' | sed -E 's/\(([0-9]+),([0-9]+)\): error.*//' | sort -u | wc -l
```

One measurement caveat: `apps/node/test/types/openclaw-upstream.d.ts` is
tracked but deliberately **not** listed in the seed `include`. The measure
config's `**/*.ts` glob also does not pull `.d.ts` files; if a local
`packages/openclaw` checkout is present, `openclaw-*` can still read clean for
other reasons. Do not treat a measured 0 on that prefix as "wired into the
seed" — see "Needs a decision".

Everything below was re-measured this way on 2026-09-17.

## Where it stands

| | files | files with errors | errors | seed files covered |
|---|---:|---:|---:|---:|
| before any pass | 670 | 269 | 1,167 | 5 |
| after pass 1 (previous agent) | 670 | 261 | 1,017 | 81 |
| observed at the start of pass 2 | 670 | 257 | 1,012 | 81 |
| after pass 2 | 670 | 234 | 967 | 164 |
| observed at the start of pass 3 | 670 | 233 | 960 | 164 |
| after pass 3 (this pass) | 670 | 199 | **884** | **243** |

The 1,017 → 1,012 gap is explained: pass 1 also added
`apps/node/test/types/openclaw-upstream.d.ts` and `scripts/lib/source-files.d.mts`
after writing its numbers, which removed the last five `TS7016` errors across four
files. Pass 2 fixed 45 errors and 23 erroring files and widened the seed by 83
files (81 → 164).

The 967 → 960 gap is the same shape one pass later: pass 2's write-up was taken
*before* the `NodeServiceImpl.stopMemoryPruneTimer` product fix that shipped in
the same commit (`122c7218`). That fix removed the four `product-store-matrix`
errors the write-up still counted (plus three more elsewhere), which is why the
"start of pass 3" row reads 960 / 233 instead of the doc's 967 / 234.

Pass 3 fixed 76 errors and 34 erroring files, widened the seed by 79 files
(164 → 243), and closed the `phase13-e2e-harness.ts` `never`-collapse that was
holding seven globs hostage.

## Per-directory inventory

`apps/node/test` is a **flat** directory: 657 test `.ts` files sit directly in it,
and it is the whole debt. Every subdirectory is clean and in the seed.

| directory | files | files with errors | errors | dominant classes |
|---|---:|---:|---:|---|
| `test` (flat root) | 657 | 199 | 884 | arg-not-assignable (199), not-assignable (196), property-missing-on-type (159) |
| `test/fleet` | 1 | 0 | 0 | — (in the seed) |
| `test/helpers` | 3 | 0 | 0 | — (in the seed) |
| `test/integration` | 2 | 0 | 0 | — (in the seed) |
| `test/support/agent-network-lab` | 7 | 0 | 0 | — (in the seed) |

## Dominant classes (error codes)

Counts are the post-pass-3 measurement.

| code | meaning | count |
|---|---|---:|
| `TS2345` | argument not assignable to parameter | 199 |
| `TS2322` | type not assignable to type | 196 |
| `TS2339` | property does not exist on type | 159 |
| `TS2353` | object literal has an excess/unknown property | 87 |
| `TS2352` | cast between non-overlapping types | 46 |
| `TS2739` | value missing required properties | 41 |
| `TS2741` | value missing one required property | 26 |
| `TS18048` | value possibly `undefined` | 18 |
| `TS2554` | wrong argument count | 16 |
| `TS2493` | tuple has no element at that index | 12 |
| `TS2305` | module has no exported member | 12 |
| `TS2304` | cannot find name | 12 |
| `TS7006` | parameter implicitly `any` | 8 |
| `TS2740` | value missing required properties | 8 |
| `TS2694` | namespace has no exported member | 7 |
| `TS2719` | two values typed as each other | 5 |
| `TS2459` | declaration not exported | 5 |
| `TS18046` | value of type `unknown` | 4 |
| others | `TS2749`, `TS2584`, `TS1117`, `TS2558`, `TS2540`, `TS2367`, `TS2774`, `TS2724`, `TS2698`, `TS2571`, `TS2430`, `TS2348`, `TS2341`, `TS1064` | 14 |

`TS7016` (imported `.js` has no declaration) and `TS2578` (unused
`@ts-expect-error`) are now at **0**.

The four big codes are still one story: tests build objects for product types that
have since gained required fields (or dropped fields the test still sets). The fix
is almost always to complete the fixture or delete the stale property — **except**
where the missing member is read from a product result type, which is a product
question (see the four `TS2339` findings below).

## Root clusters (the flat directory, grouped by filename prefix)

Prefixes are the only structure the flat root has.

| prefix glob | files with errors | errors |
|---|---:|---:|
| `node-*` | 31 | 155 |
| `chain-*` | 36 | 114 |
| `agent-*` | 21 | 113 |
| `discovery-*` | 10 | 45 |
| `a2a-*` | 6 | 40 |
| `cli-*` | 11 | 33 |
| `task-*` | 5 | 28 |
| `bridge-*` | 7 | 24 |
| `chat-*` | 4 | 18 |
| `network-*` | 1 | 17 |
| `autonomous-*` | 2 | 15 |
| `cgnat-*` | 1 | 15 |
| `feed-*` | 3 | 15 |
| `webrtc-*` | 2 | 15 |
| `outbound-*` | 3 | 14 |
| `document-*` | 12 | 13 |
| `peer-*` | 4 | 13 |
| `setup-*` | 1 | 13 |
| `bond-*` | 3 | 12 |
| `ext-*` | 3 | 12 |
| (smaller clusters) | | each ≤ 11 |

Worst individual files: `node-service-start.test.ts` (24),
`agent-e2e-real.test.ts` (20), `node-config-service.test.ts` (19),
`a2a-tool-exposure.test.ts` (19), `node-service-v1-4.test.ts` (17),
`network-modes.test.ts` (17), `agent-runtime-envoy-runtime.test.ts` (16),
`cgnat-auto-apply.test.ts` (15), `autonomous-integration.test.ts` (14),
`setup-sponsor-friend-runtime.test.ts` (13),
`node-service-handlers-pairing-payload.test.ts` (13),
`node-config-store-autonomous.test.ts` (13), `agent-e2e.test.ts` (13),
`webrtc-call-e2e-helpers.ts` (12), `feed-backfill.test.ts` (12),
`chain-map.test.ts` (12), `user-prompt-router.test.ts` (11),
`task-runtime-guard.test.ts` (11), `rendezvous-integration.test.ts` (11).

## What pass 2 added to the seed, and why it is safe

`tsconfig.test.json` includes every *directory* and every multi-file
*filename-prefix glob* whose files **and transitive import closure** were clean
under these exact settings. Cleaning the closure matters: `tsc -p` reports errors
in imported files too, so a single stale helper turns a green glob red. Pass 2
left `multihop-*` rejected because it imported `phase13-e2e-harness.ts`; pass 3
fixed that helper (below), which is what turned `multihop-*`, `call-*`, `phase-*`,
`approval-*` and `capability-*` green.

| glob | new files covered | blockers fixed |
|---|---:|---|
| `terminal-*` | 17 | `terminal-manager.test.ts` (1), `terminal-playwright-browser.test.ts` (6) |
| `relay-*` | 16 | `relay-health.test.ts` (1), `relay-broadcast-e2e.test.ts` (2), `relay-client-cycle-phase46.test.ts` (1), `relay-reservation-health.test.ts` (3), `relay-websocket-bridge-e2e.test.ts` (1) |
| `envoy-*` | 19 | `envoy-harness-chats.test.ts` (1), `envoy-harness-task.test.ts` (5), `envoy-local-embed-runtime.test.ts` (1), `envoy-terminal-session.test.ts` (5) |
| `ws-*` | 7 | `ws-session-identity.test.ts` (1), `ws-narrow-node-surface.test.ts` (2); `ws-host-boundary.test.ts` was already fixed by `scripts/lib/source-files.d.mts` (pass 1) |
| `knowledge-*` | 5 | `knowledge-e2e.test.ts` (2) |
| `kb-*` | 5 | `kb-mcp-writeback-e2e.test.ts` (1), `kb-plugin-registry-e2e.test.ts` (1), `kb-sensitivity-mesh-e2e.test.ts` (2 + 3 surfaced once the `VaultSearchResult` import was corrected) |
| `ai-*` | 3 | `ai-context-sensitivity.test.ts` (1) |
| `coding-*` | 3 | `coding-schedule-store.test.ts` (1) |
| `wan-*` | 4 | `wan-join-invite-node-service.test.ts` (1) |
| `connectivity-*` | 4 | `connectivity-diagnostics.test.ts` (2), `connectivity-quiet-wan-e2e.test.ts` (1) |

Total: **+83 files** covered (81 → 164), **45 errors** fixed. The four target
globs were worth 59 files; the six bonus globs 24.

Pass 1 (kept) added the subdirectories `helpers/**`, `fleet/**`, `support/**` and
the root globs `bundled-*`, `content-*`, `context-*`, `eh-*`, `family-*`, `geo-*`,
`home-*`, `ipfs-*`, `json-*`, `kubo-*`, `libp2p-*`, `mesh-*`, `multi-*`, `open-*`,
`rpc-*`, `service-*`, `session-*`, `test-*`, `transfer-*`, `trust-*`, `vault-*`,
`worker-*` (81 files total).

## What pass 3 added to the seed, and why it is safe

Same rule, measured again: a glob was added only when its files *and transitive
import closure* were at 0 errors under `tsconfig.test.measure.json`. The pass
added 22 globs plus two individual files: **+79 files covered** (164 → 243).

| glob | new files covered | blockers fixed |
|---|---:|---|
| `tool-*` | 2 | `tool-registry.test.ts` (1) — `intent` is the closed `EnvoyIntent`; the "custom" intent was not executable |
| `library-*` | 6 | `library-publish-export-multi-node-e2e.test.ts` (1) — a partial `CapabilityManifest` completed with the values the old fixture produced implicitly |
| `owner-*` | 3 | `owner-targeting.test.ts` (2 `NodeArgs` + 2 store stubs that surfaced once the args were fixed) |
| `market-*` | 4 | `market-announce-inbound.test.ts` (2) — the local `card()` helper pinned `status` to `"active"`; typed against `MarketCard` |
| `harness-*` | 2 | `harness-submit-transport.test.ts` (3: `SignedAgentResult` from the wrong module, `intent?: string`, `mockReply` override type), `harness-submit-inbound.test.ts` (1: annotate the mutated envelope) |
| `pairing-*` | 4 | `pairing-lifecycle.test.ts` (2), `pairing-payload.test.ts` (1), `pairing-kiosk-server.test.ts` (1) |
| `client-*` | 4 | `client-proxy-push.test.ts` (5) — complete `RpcCallerContext` helper |
| `product-*` | 5 | `product-state-layout.test.ts` (1); `product-store-matrix.test.ts` was already fixed by the product `stopMemoryPruneTimer` |
| `phase13-*` | 1 | `phase13-e2e-harness.ts` (11) — see the `never`-collapse note below |
| `multihop-*` | 2 | unlocked by the `phase13` fix |
| `phase-*` | 5 | `phase-18-e2e.test.ts` + `phase-18-multinode-e2e.test.ts`: `describe.sequential.skipIf` → `describe.skipIf(...).sequential(...)` (Vitest 4 types `skipIf` on `SuiteAPI`, not on the chainable) |
| `approval-*` | 3 | the harness `chatAssistApprovalConfig` now fills `ContactAiPreferences.knowledgeAccess`/`priority` |
| `call-*` | 18 | `call-signaling-e2e-full-flow.test.ts` (4, discriminate `CallEvent` before reading `sdpOffer`/`sdpAnswer`), `call-integration.test.ts` (1, `hangupCall` reason) |
| `capability-*` | 8 | `capability-discovery-triggered-only.test.ts` (8, typed the `vi.hoisted` mock so `mock.calls[0][0]` is not an empty tuple), `capability-manifest.test.ts` (4, discriminate `DiscoveryInboundResult`), `capability-discovery-empty-routing-table.test.ts` (4, return the spy beside the `never`-typed mesh), `capability-discovery-broadcast.test.ts` (1, `deviceId`) |
| `file-*` | 1 | `file-share-e2e.test.ts` (1) — the local handler type was the stale one; `MeshDataTransferHandler`/`InboundDataTransfer` are `{ voucher: unknown; voucherUtf8 }` |
| `persistent-*` | 1 | `persistent-acp-host.test.ts` (1) — `run()` prompt blocks may carry `text` |
| `phase16-*` | 2 | `phase16-smoke-e2e.test.ts` (1) — `CapabilityProviderJob.error`, not `failureReason` |
| `p2p-*` | 1 | `p2p-a2a.test.ts` (1) — complete `NodeArgs` from `parseNodeArgs([])` |
| `one-*` | 1 | `one-shot-cli-backend.test.ts` (1) — `command` is required, so there is no `= {}` default |
| `reuse-*` | 1 | `reuse-host.test.ts` (1) — `HostConnectionStatus` is `{ peerId, multiaddrs }` |
| `reputation-*` | 1 | `reputation-inbound.test.ts` (1) — `intent: EnvoyIntent` |
| `sync-*` | 1 | `sync-state-inbound.test.ts` (2) — sign the envelope the handler expects |

Two individual files were added too: `kernel-composability-probe.test.ts`
(1 error, an `outcomes.find` possibly-undefined guard) and
`memory-prune-timer.test.ts` (already clean). `product-store-matrix.test.ts` is
covered by `product-*`.


## Fixed in pass 2 (45 errors)

| class | files | errors | fix |
|---|---:|---:|---|
| test value corrupted by a global rename | 2 | 6 | `caf90492` renamed the *sandbox mode value* `"workspace-write"` → `"task-write"` in `envoy-harness-{chats,task}.test.ts`; the harness peer's `SessionMetadata.permissionMode` is unchanged, so the value was restored (`../envoy-harness/packages/envoy-harness/src/session.ts:35`) |
| incomplete fixtures (missing required fields) | 4 | 9 | `relay-health.test.ts` roster entry (`firstSeenAt`, 1); `envoy-terminal-session.test.ts` (`EnvoyTerminalSessionDeps` typed, `modelProviders: {}` → `{ mode: "mock" }`, typed `findSessionByCwd` mock + completed `TerminalSessionSummary`, 5); `wan-join-invite-node-service.test.ts` (`RelayConfig.relayId`, 1); `connectivity-diagnostics.test.ts` (AuditEvent literals rebuilt through `createAuditEvent`, which fills `version`/`eventId`, 2) |
| untyped/loose test-local types | 4 | 6 | `terminal-manager.test.ts` `onData` callback param typed (1); `relay-client-cycle-phase46.test.ts` `inspect(input: unknown)` (1); `relay-reservation-health.test.ts` reservation-stub params `pid: unknown` compared with `String(pid)` (3); `kb-plugin-registry-e2e.test.ts` `activateResult: KbPluginActivateResult` (1) |
| browser globals in `page.evaluate` | 1 | 6 | `terminal-playwright-browser.test.ts` declares the two globals the test injects on `window` (`declare const window: { __termOut: string[]; __termWs: WebSocket }`) instead of pulling DOM types into every node test; the redundant `as unknown as` casts were removed |
| test reads a union member without discriminating | 2 | 4 | `knowledge-e2e.test.ts` hoisted `refusalReason` behind `result.ok` (2); `kb-sensitivity-mesh-e2e.test.ts` narrowed with an explicit `if (!result.ok) throw` before reading `responsePayload` (2) |
| wrong module / wrong arity | 3 | 4 | `envoy-local-embed-runtime.test.ts` imported `ENVOY_LOCAL_MIN_MODEL_BYTES` from `@envoymesh/node-core` (it lives in `../src/envoy-local-manifest.js`, 1); `kb-mcp-writeback-e2e.test.ts` imported `exists` from `node:fs/promises` (unused — removed, 1); `library-read-inbound.test.ts` passed an argument to the zero-arg `readAuditEvents()` (the argument was ignored at runtime — removed, 2) |
| `VaultSearchResult` imported from the wrong module | 2 | 2 | `ai-context-sensitivity.test.ts` and `kb-sensitivity-mesh-e2e.test.ts` imported it from `../src/ai-context.js`, which re-imports but does not re-export it; corrected to `@envoymesh/vault` |
| deliberate-invalid call expressed without a suppression directive | 1 | 2 | `ws-narrow-node-surface.test.ts`: the `@ts-expect-error` sat on the property line while the error is reported on the argument line (`TS2578` + `TS2345`). Replaced with a `Partial<WsServerOptions<unknown>>` value and one assertion; `start()` still throws on the missing resolver |
| async helper's declared return type was not a promise | 1 | 1 | `relay-websocket-bridge-e2e.test.ts` `createRelayBridge` returns `new Promise(...)` and every caller `await`s it; the annotation now says `Promise<{ wsUrl; stop }>` |
| helper predicate typed narrower than its callers | 1 | 1 | `relay-broadcast-e2e.test.ts` `waitFor` accepts `() => boolean \| Promise<boolean>` (one call site is sync, the rest async) |
| capability array typed `string[]` | 1 | 1 | `relay-broadcast-e2e.test.ts` `testProfile(..., capabilities: Capability[])` |
| resolver returns the right type already | 1 | 1 | `ws-session-identity.test.ts` dropped the `as HostSession<unknown>` widening of `resolveSession`, which already returns `HostSession<RpcCallerContext>` (a non-null assertion replaces it) |
| possibly-null response | 1 | 1 | `connectivity-quiet-wan-e2e.test.ts` explicit guard after `waitFor` |
| unused `@ts-expect-error` removed | 1 | 1 | `coding-schedule-store.test.ts` — `harness: "nope"` is no longer rejected by the type (the runtime validator still throws `coding_schedule_harness_invalid`, which the test asserts) |

One net-zero row is not in the table: correcting the `VaultSearchResult` import in
`kb-sensitivity-mesh-e2e.test.ts` made the real type visible and surfaced three
masked `TS2353`s (the old fixture used `snippet`/`matchScore`). Those three were
fixed with the same edit (`chunk`/`score`/`matches`), so the import fix's measured
drop is 1 and the fixture's is 0 — the class is real work, just not a delta.

Pass 1's fixes (kept): `ChainMandate` fixtures built through
`ChainMandateSignedSchema.parse(...)` (85 errors), `NodeProfile` fixture
completion (59), a `FamilyAttachmentDescriptor` stub (4), one wrong relative
import, one unused wrong `readFileSync` import.

## Checklist: the cheap next wins

These globs are the refreshed near-miss ranking, measured against the post-pass-3
error file: every glob outside the seed whose whole transitive closure has ≤ 30
errors. Sorted by errors to spend.

| glob | entries | closure errors | error files |
|---|---:|---:|---:|
| `two-*` | 2 | 6 | `two-node-playwright-e2e.test.ts` (1) |
| `share-*` | 3 | 6 | `share-inbound.test.ts` (5), `share-inbound-extended.test.ts` (1) |
| `mcp-*` | 3 | 6 | `mcp-server-adapter.test.ts` (6) |
| `broadcast-*` | 3 | 7 | `broadcast-inbound-matching.test.ts` (6), `broadcast-inbound.test.ts` (1) |
| `inbound-*` | 3 | 7 | `inbound-chat-assist.test.ts` (7) |
| `pi-*` | 7 | 8 | `pi-terminal-session.test.ts` (8) |
| `profile-*` | 9 | 9 | `profile-sync-outbound.test.ts` (4), `profile-sync-inbound.test.ts` (3), `profile-thumbnail-sync-e2e.test.ts` (2) |
| `scoreboard-*` | 2 | 9 | `scoreboard-rule-inbound.test.ts` (5), `scoreboard-rule-broadcast.test.ts` (4) |
| `bond-*` | 9 | 12 | `bond-challenge.test.ts` (9), `bond-inbound.test.ts` (2), `bond-autonomy-worker.test.ts` (1) |
| `ext-*` | 12 | 12 | `ext-agent-adapter-codex.test.ts` (6), `ext-agent-supervised-openhuman.test.ts` (3), `ext-agent-supervised-hermes.test.ts` (3) |
| `document-*` | 15 | 13 | 12 files, one error each except `document-autonomy-enforcement.test.ts` (2) |
| `peer-*` | 6 | 13 | `peer-path.test.ts` (3 + 1 implicit-any), `peer-directory-learn.test.ts` (1), `peer-pool.test.ts` (1), … |
| `setup-*` | 1 | 13 | `setup-sponsor-friend-runtime.test.ts` (13) |
| `outbound-*` | 4 | 14 | 3 files |
| `autonomous-*` | 2 | 15 | union-narrowing `TS2339`s, see the pass-2 `TS2339` note |
| `cgnat-*` | 1 | 15 | `cgnat-auto-apply.test.ts` (15) |
| `feed-*` | 10 | 15 | 3 files |
| `webrtc-*` | 2 | 15 | `webrtc-call-e2e-helpers.ts` (12) + 1 |
| `network-*` | 1 | 17 | `network-modes.test.ts` (17) |
| `chat-*` | 10 | 18 | 4 files |
| `bridge-*` | 12 | 24 | 7 files |
| `task-*` | 8 | 28 | `task-runtime-guard.test.ts` (11), `task-lifecycle.test.ts` (5), `task-cancel-e2e.test.ts` (5), `task-results-store.test.ts` (4), `task-store.test.ts` (3) |

Two of the one-error globs are **blocked by product gaps, not test bugs** and are
deliberately left red: `social-*` (1, `runSocialProxyPass`'s declared return type
drops `sessionsTouched`) and `style-*` (1, `buildGetContactDisclosureTool`'s
declared return type drops `error`). See "Needs a decision".

`developer-*` (2), `digest-*` (3), `lan-*` (3), `nearby-*` (3), `second-*` (3),
`review-*` (4), `trigger-*` (4), `bind-*` (6), `ensure-*` (6), `search-*` (7),
`daemon-*` (8), `run-*` (9), `sandbox-*` (10), `send-*` (10), `rendezvous-*` (11)
and `user-*` (11) are the remaining ≤ 11-error clusters.

The remaining erroring files live in prefixes with no clean majority
(`node-*` 155, `chain-*` 114, `agent-*` 113, `discovery-*` 45, `a2a-*` 40, `cli-*`
33): those need per-file work, not a glob.

## The four `TS2339` questions (pass 2), answered with runtime evidence

The earlier draft of this list called all four "the product type does not
declare" a member the test reads. Reading each producer says otherwise: **three
are union-narrowing artifacts, not product gaps; one is a genuinely missing
method.** None of the four is a missing property on a result type.

1. **`DiscoveryInboundResult.reason`** — *not a gap.* The type declares it, on the
   failure arm: `apps/node/src/discovery-inbound.ts:245-249`, and every
   `ok: false` producer returns it (`:669`, `:751`, `:845`). The erroring tests
   read `result.reason` after `expect(result.ok).toBe(false)`, which does not
   narrow a discriminated union. Fix is test-side discrimination (one `if
   (!result.ok)`), not a product type change. ~17 sites remain in
   `discovery-*`/`capability-manifest.test.ts`; mechanical, but `discovery-*` is
   still 45 errors so it does not unlock a glob.
2. **`EvaluateAutonomousPolicyResult.reason` / `.domain`** — *not a gap.*
   `packages/api/src/autonomous-policy.ts:5-7` declares `reason` on
   `{ allowed: false }` and `domain` on `{ allowed: true }`; the producer returns
   exactly those (`:67-97`). Same missing-discrimination pattern; 13 sites remain
   in `autonomous-*`.
3. **`NodeServiceImpl.stopMemoryPruneTimer`** — *resolved in pass 3; the pass-2
   note below is kept because it was right when written.* The pass-2 text said the
   method existed **only in tests** and that the interval was never cleared. The
   final commit of that pass (`122c7218`) then shipped the product fix: the method
   is implemented at `apps/node/src/node-service-impl.ts:13998`, `stopNode` calls it
   (`:14008`), and the arming site (`:2481`) points at it as the matching teardown.
   The tests' `svc.stopMemoryPruneTimer?.()` is therefore no longer a no-op — the
   optional call is redundant now, not wrong — and `product-store-matrix.test.ts`
   dropped from 4 errors to 0 because of it. `memory-prune-timer.test.ts` (added in
   pass 3, now in the seed) pins the `clearInterval` behaviour directly.
4. **`KnowledgeQueryInboundResult.responsePayload`** — *not a gap.* The type
   declares it on the success arm (`apps/node/src/knowledge-query-inbound.ts:27-35`);
   the producers return it (`:395`, `:459`). The erroring sites
   (`agent-e2e.test.ts:443`, `knowledge-e2e.test.ts`, `kb-sensitivity-mesh-e2e.test.ts`)
   read it behind a *derived* boolean (e.g. `refused = !result.ok || …`) where no
   discriminant is in scope. Two of the three were fixed by hoisting/narrowing;
   `agent-e2e.test.ts` remains.

The pattern worth recording: `TS2339` on a named discriminated union is not
evidence of a type gap. Three of these four were misdiagnosed that way.

## Needs a decision, not a mechanical fix

1. **`openclaw-*` is deferred by owner decision.** The twelve files are blocked by
   `packages/openclaw/extensions/envoymesh/src/context-compose.js` having no
   declaration. `packages/openclaw` is a gitignored, untracked upstream checkout
   (`.gitignore:43`), so a `.d.ts` written there cannot persist; the owner has
   ruled that OpenClaw is handled separately. Do not add a declaration for it and
   do not edit anything under `packages/openclaw/`. The tracked ambient
   `apps/node/test/types/openclaw-upstream.d.ts` exists for local measurement
   convenience but is **not** part of the seed and should not be treated as one
   (it also risks making a full-tree measurement read `openclaw-*` as clean when
   someone widens measure to include `*.d.ts`; see "How to re-measure").
2. **A declaration for a repo script was accepted.** `scripts/lib/source-files.mjs`
   is *tracked*, so its sibling `scripts/lib/source-files.d.mts` persists for every
   importer and needed no `allowJs`. It fixed `ws-host-boundary.test.ts` and
   `ws-narrow-node-surface.test.ts` and is what made `ws-*` addable.
   `ws-host-boundary.test.ts` was also added to the seed individually.
3. **`phase13-e2e-harness.ts`** — *resolved in pass 3.* The harness cast
   `node.service as NodeServiceImpl & { _chainStore?…; _mesh?…; _inboundGuard?… }`.
   Those fields are `private` on `NodeServiceImpl`, and TypeScript reduces an
   intersection to `never` when a property "exists in multiple constituents and is
   private in some", after which every access is a `TS2339` on `never` (11 of
   them). The fix is a two-step cast through the public `NodeService` interface the
   class implements — `service as NodeService as NodeService & Internals` — which
   is legal overlap rather than `as unknown as` (forbidden) and needs no product
   visibility change. It unlocked `phase13-*`, `multihop-*`, `phase-*`,
   `approval-*`, `call-*` and `capability-*`.
4. **`ToolDefinition.intent`** — *resolved: the product is right, the test was
   wrong.* `intent` is not a free-form routing key; `executeMeshTool` switches on it
   (`apps/node/src/tool-registry.ts:3015`) and its `default` returns
   `` `Unhandled mesh intent: ${tool.intent}` `` (`:3375-3382`), while
   `evaluatePolicy` also takes it (`:2989`). A tool with `"custom.intent"` can be
   registered but never executed, so the closed `EnvoyIntent` union is correct. The
   test now uses a real intent (`"chat.message"`).
5. **`market-announce-inbound.test.ts`** — *resolved: the product supports all four
   values; the test helper was the bug.* `MarketListingStatusSchema` is
   `["active", "reserved", "sold", "withdrawn"]` (`packages/protocol/src/market.ts:17-22`).
   The error came from `card(overrides: Partial<ReturnType<typeof baseCard>>)`,
   where `baseCard()` pinned `status: "active" as const`; the helper is now typed
   `Partial<MarketCard>`.
6. **`library-publish-export-multi-node-e2e.test.ts`** — *resolved: stale fixture,
   not a product gap.* `topics` was never a `CapabilityManifest` field — the
   per-request `requestedPublishTopics` is (`discovery-inbound.ts:98`) — and the
   manifest-aware branch reads `visibility`, `sensitivityCeiling`, `capabilities`
   and `keywords` (`:672-742`). The completed fixture uses
   `visibility: "public-preview"`, `sensitivityCeiling: "public"`, empty
   keywords/capabilities, which is exactly what the old `undefined` fields produced
   (`sensitivityAllowed` treats a missing ceiling as `"public"`,
   `capability-manifest-store.ts:144`). The file's tests were run before and after
   the change.
7. **Casts that no longer overlap** (`TS2352`, 46): e.g. `PairingPayload` →
   `Record<string, unknown>` (12), `ModelProviderConfig` (8),
   `SetupSponsorFriendRuntimeDeps` (5). These were "make the compiler stop
   complaining" casts; each needs the real narrow/brand/assertion strategy chosen,
   which is a design call per site. (Pass 3 removed 7 of the 53.)
8. **Union-narrowing `TS2339`s left in `discovery-*` and `autonomous-*`**: same
   diagnosis as question 1/2 above, mechanical but out of the way of any near-miss
   glob. Fixing them lowers the count without unlocking a seed entry.
9. **`NodeServiceImpl.runSocialProxyPass` returns a too-narrow type — product gap,
   reported not worked around.** The orchestrator's `SocialProxyPassResult` always
   includes `sessionsTouched` on the failure arms
   (`social-proxy-orchestrator.ts:224`, `:227`, `:230`, `:248`), but the service
   method narrows it to `{ ok; error?; correlationId? }` and casts the real result
   to that (`node-service-impl.ts:4726-4737`). The member exists at runtime, so
   `social-proxy-kill-switch-e2e.test.ts:46` is right and the declared type is
   missing a field. This keeps `social-*` out of the seed (1 error); the fix
   belongs in `apps/node/src`, not the test.
10. **`buildGetContactDisclosureTool` returns a too-narrow type — product gap.**
    The runtime returns `{ ok: false, error: "contactOwnerId is required" }`
    (`style-adapter.ts:512`) but the declared return type is
    `{ ok: boolean; disclosure?: ContactDisclosure }` (`:508`), so
    `style-adapter.test.ts:303` cannot read `.error`. Same shape as (9): the value
    is real, the type is not. This keeps `style-*` out of the seed (1 error).

## Verification

- `npm run typecheck:tests:node` — exit 0 at **243 covered files** (program
  test-tree files, counted with `tsc -p tsconfig.test.json --listFiles`; the old
  seed measured **164** the same way).
- `npm run typecheck` (node + social) — exit 0.
- `npx tsc -b` — exit 0.
- A type error injected into a newly covered file (`tool-registry.test.ts`)
  makes `npm run typecheck:tests:node` exit 2
  (`tool-registry.test.ts(708,7): error TS2322`); removing it returns to 0.
- `npx vitest run` — 990 passed / 5 skipped files, 9,260 passed / 19 skipped
  tests (the same as the pre-pass-3 baseline; the suite did not regress).

Measured with `tsconfig.test.measure.json` (extends the seed and widens `include`
to `apps/node/test/**/*.ts`): **884 errors / 199 files** post-pass-3, against
**960 / 233** at the start.
