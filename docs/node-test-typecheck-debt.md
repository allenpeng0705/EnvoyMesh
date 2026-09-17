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

One measurement caveat: `apps/node/test/types/openclaw-upstream.d.ts` (untracked,
left by an earlier pass) is inside the measured glob, so it makes `openclaw-*`
read clean. That declaration is deliberately **not** wired into the seed — see
"Needs a decision" — so treat `openclaw-*`'s measured 0 as an artifact.

Everything below was re-measured this way on 2026-09-17.

## Where it stands

| | files | files with errors | errors | seed files covered |
|---|---:|---:|---:|---:|
| before any pass | 670 | 269 | 1,167 | 5 |
| after pass 1 (previous agent) | 670 | 261 | 1,017 | 81 |
| observed at the start of pass 2 | 670 | 257 | 1,012 | 81 |
| after pass 2 (this pass) | 670 | 234 | **967** | **164** |

The 1,017 → 1,012 gap is explained: pass 1 also added
`apps/node/test/types/openclaw-upstream.d.ts` and `scripts/lib/source-files.d.mts`
after writing its numbers, which removed the last five `TS7016` errors across four
files. Pass 2 fixed 45 errors and 23 erroring files and widened the seed by 83
files (81 → 164).

## Per-directory inventory

`apps/node/test` is a **flat** directory: 657 test `.ts` files sit directly in it,
and it is the whole debt. Every subdirectory is clean and in the seed.

| directory | files | files with errors | errors | dominant classes |
|---|---:|---:|---:|---|
| `test` (flat root) | 657 | 234 | 967 | arg-not-assignable (212), not-assignable (205), property-missing-on-type (193) |
| `test/fleet` | 1 | 0 | 0 | — (in the seed) |
| `test/helpers` | 3 | 0 | 0 | — (in the seed) |
| `test/integration` | 2 | 0 | 0 | — (in the seed) |
| `test/support/agent-network-lab` | 7 | 0 | 0 | — (in the seed) |

## Dominant classes (error codes)

Counts are the post-pass-2 measurement.

| code | meaning | count |
|---|---|---:|
| `TS2345` | argument not assignable to parameter | 212 |
| `TS2322` | type not assignable to type | 205 |
| `TS2339` | property does not exist on type | 193 |
| `TS2353` | object literal has an excess/unknown property | 89 |
| `TS2352` | cast between non-overlapping types | 53 |
| `TS2739` | value missing required properties | 42 |
| `TS2741` | value missing one required property | 28 |
| `TS18048` | value possibly `undefined` | 20 |
| `TS2493` | tuple has no element at that index | 17 |
| `TS2554` | wrong argument count | 16 |
| `TS2305` | module has no exported member | 13 |
| `TS2304` | cannot find name | 13 |
| `TS7006` | parameter implicitly `any` | 9 |
| `TS2740` | value missing required properties | 9 |
| `TS2694` | namespace has no exported member | 7 |
| `TS2719` | two values typed as each other | 5 |
| `TS2459` | declaration not exported | 5 |
| `TS18046` | value of type `unknown` | 5 |
| others | `TS2749`, `TS2584`, `TS2551`, `TS1117`, `TS2558`, `TS2540`, `TS2367`, `TS2774`, `TS2724`, `TS2698`, `TS2571`, `TS2430`, `TS2348`, `TS2341`, `TS1064` | 13 |

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
| `node-*` | 32 | 157 |
| `chain-*` | 36 | 115 |
| `agent-*` | 21 | 111 |
| `discovery-*` | 10 | 45 |
| `a2a-*` | 6 | 40 |
| `cli-*` | 11 | 33 |
| `task-*` | 5 | 28 |
| `bridge-*` | 7 | 24 |
| `chat-*` | 4 | 18 |
| `capability-*` | 4 | 17 |
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
| `phase13-*` | 1 | 11 |
| (48 smaller clusters) | | each ≤ 11 |

Worst individual files: `node-service-start.test.ts` (24),
`agent-e2e-real.test.ts` (20), `node-config-service.test.ts` (19),
`a2a-tool-exposure.test.ts` (19), `node-service-v1-4.test.ts` (17),
`network-modes.test.ts` (17), `agent-runtime-envoy-runtime.test.ts` (16),
`cgnat-auto-apply.test.ts` (15), `autonomous-integration.test.ts` (14),
`setup-sponsor-friend-runtime.test.ts` (13),
`node-service-handlers-pairing-payload.test.ts` (13),
`node-config-store-autonomous.test.ts` (13), `agent-e2e.test.ts` (13),
`webrtc-call-e2e-helpers.ts` (12), `feed-backfill.test.ts` (12),
`chain-map.test.ts` (12), `phase13-e2e-harness.ts` (11).

## What pass 2 added to the seed, and why it is safe

`tsconfig.test.json` includes every *directory* and every multi-file
*filename-prefix glob* whose files **and transitive import closure** were clean
under these exact settings. Cleaning the closure matters: `tsc -p` reports errors
in imported files too, so a single stale helper turns a green glob red (that is
why `multihop-*` is still rejected — it imports `phase13-e2e-harness.ts`, and why
`phase13-e2e-harness.ts` blocks `call-*`, `phase-*`, `social-*`, `approval-*` and
more).

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

These globs are *one to twelve small files away* from being addable, measured
against the post-pass-2 error file. Sorted by errors to spend.

| glob | files it would cover | blockers (errors) |
|---|---:|---|
| `tool-*` | 2 | `tool-registry.test.ts` (1) — a deliberate `intent: "custom.intent"`; see decisions |
| `library-*` | 6 | `library-publish-export-multi-node-e2e.test.ts` (1) — a partial `CapabilityManifest`; see decisions |
| `owner-*` | 3 | `owner-targeting.test.ts` (2) — a partial `NodeArgs` fixture |
| `market-*` | 4 | `market-announce-inbound.test.ts` (2) — `"withdrawn"`/`"sold"` vs `"active"`; see decisions |
| `harness-*` | 2 | `harness-submit-transport.test.ts` (3), `harness-submit-inbound.test.ts` (1) |
| `pairing-*` | 4 | `pairing-lifecycle.test.ts` (2), `pairing-payload.test.ts` (1), `pairing-kiosk-server.test.ts` (1) |
| `client-*` | 4 | `client-proxy-push.test.ts` (5) |
| `product-*` | 5 | `product-store-matrix.test.ts` (4), `product-state-layout.test.ts` (1) — the matrix file is blocked on `stopMemoryPruneTimer`, see decisions |
| `two-*` | 2 | `two-node-playwright-e2e.test.ts` (6) |
| `share-*` | 3 | `share-inbound.test.ts` (5), `share-inbound-extended.test.ts` (1) |
| `mcp-*` | 3 | `mcp-server-adapter.test.ts` (6) |
| `broadcast-*` | 3 | `broadcast-inbound-matching.test.ts` (6), `broadcast-inbound.test.ts` (1) |
| `inbound-*` | 3 | `inbound-chat-assist.test.ts` (7) |
| `pi-*` | 7 | `pi-terminal-session.test.ts` (8) |
| `scoreboard-*` | 2 | `scoreboard-rule-inbound.test.ts` (5), `scoreboard-rule-broadcast.test.ts` (4) |
| `profile-*` | 9 | `profile-sync-outbound.test.ts` (4), `profile-sync-inbound.test.ts` (3), `profile-thumbnail-sync-e2e.test.ts` (2) |
| `bond-*` | 9 | `bond-challenge.test.ts` (9), `bond-inbound.test.ts` (2), `bond-autonomy-worker.test.ts` (1) |
| `ext-*` | 12 | `ext-agent-adapter-codex.test.ts` (6), `ext-agent-supervised-openhuman.test.ts` (3), `ext-agent-supervised-hermes.test.ts` (3) |

The remaining ~200 erroring files live in prefixes with no clean majority
(`node-*` 157, `chain-*` 115, `agent-*` 111, `discovery-*` 45, `a2a-*` 40): those
need per-file work, not a glob.

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
3. **`NodeServiceImpl.stopMemoryPruneTimer`** — *a genuine product gap, reported
   not worked around.* The method exists **only in tests**: `git log -S
   stopMemoryPruneTimer -- apps/node/src` is empty; `2a5e6083` and `097d5a81`
   introduced it in the test tree. The runtime has the private field it would
   stop (`apps/node/src/node-service-impl.ts:1774`) and arms it with
   `setInterval` (`:2473`) but never clears or `unref`s it — there is no
   `stop*Timer` method anywhere in `apps/node/src` and exactly one
   `clearInterval` in the whole file (a different timer). So the tests'
   `svc.stopMemoryPruneTimer?.()` is a silent no-op and the interval outlives the
   test. This is a product defect (missing cleanup API), and fixing it means
   changing `apps/node/src`, which is out of scope for the test-typing pass. The
   7 test reads were deliberately left in place; deleting them would erase the
   signal. Do not "fix" this by deleting the calls.
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
   do not edit anything under `packages/openclaw/`. An earlier pass left
   `apps/node/test/types/openclaw-upstream.d.ts` — an ambient declaration in the
   test tree — but it is **not** part of the seed and should not be treated as one
   (it also makes the full-tree measurement read `openclaw-*` as clean; see "How
   to re-measure").
2. **A declaration for a repo script was accepted.** `scripts/lib/source-files.mjs`
   is *tracked*, so its sibling `scripts/lib/source-files.d.mts` persists for every
   importer and needed no `allowJs`. It fixed `ws-host-boundary.test.ts` and
   `ws-narrow-node-surface.test.ts` and is what made `ws-*` addable.
   `ws-host-boundary.test.ts` was also added to the seed individually.
3. **`phase13-e2e-harness.ts`** (11 × `TS2339`): the harness intersects
   `NodeServiceImpl` with a private-member structural type and the intersection
   collapses to `never`. This one file blocks `multihop-*`, `call-*`, `task-*`,
   `phase-*`, `social-*`, `approval-*`, `capability-*` and more. It is a genuine
   resolution artifact; the fix is the harness's cast strategy (or
   `NodeServiceImpl`'s visibility), not the tests that consume it.
4. **`ToolDefinition.intent`** (`tool-registry.test.ts`, 1): the test builds a
   custom tool with `intent: "custom.intent"`, but the field is the closed
   `EnvoyIntent` union (`apps/node/src/tool-registry.ts:101`). Either tools may
   only map onto protocol intents (the test is wrong) or the field should be
   `string` (the type is too tight for extensible tools). A product decision.
5. **`market-announce-inbound.test.ts`** (2): the test writes `"withdrawn"` and
   `"sold"` into a field typed `"active"`. Either the announcement status enum
   gained values the type never learned, or the fixture is stale. Read the
   producer before choosing.
6. **`library-publish-export-multi-node-e2e.test.ts`** (1): passes
   `{ version, capabilities, topics }` where `CapabilityManifest` requires
   `id`/`versionTag`/`visibility`/`sensitivityCeiling`/`keywords`/`approvedAt`/`updatedAt`
   and has no `topics`. Completing it changes what the discovery handler sees
   (`visibility`/`sensitivityCeiling` are currently `undefined`), so this is not
   behaviour-preserving without a decision.
7. **Casts that no longer overlap** (`TS2352`, 53): e.g. `PairingPayload` →
   `Record<string, unknown>` (12), `ModelProviderConfig` (8),
   `SetupSponsorFriendRuntimeDeps` (5). These were "make the compiler stop
   complaining" casts; each needs the real narrow/brand/assertion strategy chosen,
   which is a design call per site.
8. **Union-narrowing `TS2339`s left in `discovery-*` and `autonomous-*`** (17 + 13):
   same diagnosis as question 1/2 above, mechanical but out of the way of any
   near-miss glob. Fixing them lowers the count without unlocking a seed entry.

## Verification

- `npm run typecheck:tests:node` — exit 0 at 164 covered files.
- `npm run typecheck` (node + social) — exit 0.
- `npx tsc -b` — exit 0.
- A type error injected into a newly covered file (`relay-health.test.ts`) makes
  `npm run typecheck:tests:node` exit non-zero; removing it returns to 0.
- `npx vitest run` — 989 passed / 5 skipped files, 9,257 passed / 19 skipped
  tests (unchanged from before pass 2).
