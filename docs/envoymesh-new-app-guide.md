# Building an EnvoyMesh-family app — the guide

**Status:** living reference · **Created:** 2026-09-13 · **Companions:** `docs/envoymesh-multi-product-design.md` (why the family works this way), `docs/envoymesh-refactoring-plan.md` (how the reusable layer was carved out)

> **Read this before starting EnvoyCoder or EnvoyAgent.** It answers four questions: what you get for free, how to build a desktop/CLI app, how to build its mobile app, and how to stay in sync with EnvoyMesh as it moves. Every command here is one you can run today, and every rule is enforced by a gate — so "I followed the guide" is checkable rather than a claim.

---

## 1. The three decisions you inherit

A new app does not start from zero, because the family already settled three things (`multi-product-design.md` §3). Adopt them or argue with them explicitly — do not quietly do something else:

| Decision | What it means for you |
|---|---|
| **D1 — separate app, separate process** | You get your own installer, release cadence, state directory and crash domain. You do **not** get to put your features into the shared core. |
| **D2 — one identity, one mesh owner at a time** | Your app either **attaches** to the node that is already running (no keys, no second mesh) or, if none is running, becomes the node using the shared profile. Two processes on one profile is corruption, not sharing. |
| **D3 — share local models, never cloud** | A local engine can be shared; provider credentials never are. |

## 2. What already exists

`node scripts/classify-modules.mjs --check` currently reports **815 modules: 563 `reusable`, 252 `product-bound`**. Reusable means machine-checked: no product concept named, no dependency on product code, and every import inside a declared core package. What that buys you, by package:

| Package | What you get | Notes |
|---|---|---|
| `@envoymesh/protocol` | envelopes, schemas, canonical JSON, the pairing + app-identity contract | dependency-free and browser-safe — safe to import from a web UI |
| `@envoymesh/host-connect` | the JSON-RPC WebSocket host, its ports, the auth gates, the attach client | binds `ws`; the host says *who* asks, never *what they may do* |
| `@envoymesh/node-core` | where the profile lives, the home marker, profile inspection, the node lock + endpoint + identity probe, product-attach conventions, ports | the "one root per machine" rules |
| `@envoymesh/reuse-host` | **the product-facing surface**: a host wired from two ports, the harness (ext-agent adapters, daemon supervisor, reachability probe), pairing (build/parse), the relay roster, the attach client | start here |
| `@envoymesh/api/core` | the reusable half of the RPC contract (`NodeService` types, pairing codec, pair-URI) | the *product-bound* half stays behind `@envoymesh/api` |
| `@envoymesh/{identity,bonds,network,vault,models,local-store,harness,agent-adapter,ipfs-helia,kb-obsidian,rag,node-core,host-connect,reuse-host,mobile-identity,openclaw-runtime}` | the rest of the kernel: crypto, policy, transport, storage, model routing, RAG | all declared core packages |

**What you must supply:** your product's state, your RPC dispatcher, your UI, and — if you want capabilities beyond diagnostics — an owner-granted capability list. That is the whole list; everything else has a home already.

## 3. Choose the topology

Four axes, independent of each other. Recommended defaults in bold:

| Axis | Options | Default |
|---|---|---|
| Where your app lives | **`apps/<product>` in this repo** · its own repo | in-repo first: you inherit the gates, the wiring checks and the 9,100-test suite on day one |
| Mesh | **attach to a running node** · run your own node | attach when one is running (`resolveRunningNode`), own node otherwise |
| Identity | **borrow the session** · hold the key | borrow: a product session never touches `libp2p-private.key` |
| Model | **share a local engine** · own provider config | share local; cloud/peer keys stay in your app |

## 4. Build the app (desktop / CLI), step by step

### 4.1 Scaffold and wire it in seven places

A new package must be declared in **seven** places. Missing one does not produce a clear error — it produces `TS6059` on unrelated files, source resolution that silently falls back to build output, or a package one package manager cannot see. `node scripts/check-workspace-wiring.mjs` enforces all of them (rules R1–R6):

1. root `package.json` → `workspaces`
2. your `package.json` (`name`, `exports`, `dependencies`)
3. **each consumer's** `package.json` → `dependencies`
4. **each consumer's** `tsconfig.json` → `references`
5. root `tsconfig.json` → `references`, and `tsconfig.base.json` → `paths`
6. `vitest.config.ts` → alias
7. `pnpm-workspace.yaml` → `packages`

```bash
node scripts/check-workspace-wiring.mjs   # must print: all clean across N workspaces
```

### 4.2 Depend on the surface, not the internals

```jsonc
// apps/coder/package.json
{
  "dependencies": {
    "@envoymesh/reuse-host": "0.5.0",   // host + harness + pairing + relay roster + attach
    "@envoymesh/api/core": "0.5.0",     // the reusable RPC contract
    "@envoymesh/protocol": "0.5.0",     // wire types, pairing, app identity
    "@envoymesh/node-core": "0.5.0"     // home, profile, lock, attach conventions
  }
}
```

Import `@envoymesh/api/core`, never `@envoymesh/api` — the root barrel reaches product-bound modules, and rule 6b fails the build if a declared-core package's entry point can reach them.

### 4.3 Boot a host

```ts
import { createReuseHost, createShellHostNodeService } from "@envoymesh/reuse-host";

const host = createReuseHost({
  port: 0,                       // 0 = ephemeral; `host.port` reports what was bound
  sessionIdentity,               // your tokens → your sessions
  dispatch,                      // your methods; the host only says who is asking
});
await host.serve();              // resolves once the port is bound; rejects if taken
console.log(`listening on ws://127.0.0.1:${host.port}/ws`);
```

`packages/reuse-host/src/cli.ts` is a complete, runnable example (`envoy-reuse-host`), and `apps/node/test/reuse-host.test.ts` proves a host can be built with **no** product surface at all.

### 4.4 Use the shared home, keep your own state

```ts
import { resolveHomeDir, profileDirIn, productDirIn, ensureHomeDirs } from "@envoymesh/node-core";

const home = resolveHomeDir();            // ENVOYMESH_HOME → per-OS default → legacy ~/.envoymesh
const kernel = profileDirIn(home);        // identity + the 14 kernel stores (shared)
const mine = productDirIn(home, "EnvoyCoder");  // your 34-ish product stores (yours alone)
```

The kernel/product split is not a convention you invent: `node scripts/inventory-node-stores.mjs --check` reports **48 stores (14 kernel / 34 product)** and fails if a product store is reachable without a profile-directory guard. Put your own stores in `productDirIn(home, "<Product>")` and they will be yours.

### 4.5 Attach instead of competing

```ts
import { resolveRunningNode, ATTACH_LOCAL_PRODUCT_METHOD } from "@envoymesh/node-core";
import { requestProductSession } from "@envoymesh/reuse-host";

const running = await resolveRunningNode(home);
if (running.status === "running") {
  const grant = await requestProductSession(
    { port: running.endpoint!.port, path: running.endpoint!.path },
    { product: "EnvoyCoder", version: ENVOYMESH_VERSION },
  );
  // grant.wsUrl already carries the token; grant.scopeKey is "product:EnvoyCoder"
} else {
  // no node is running: become it (`acquireNodeLock`), or start in a local-only mode
}
```

`resolveRunningNode` returns `"running"` only for a node whose **identity it verified**; `"unverified"` covers a live claim that will not prove it is yours. Do not skip that check — this call hands out a credential.

### 4.6 What your dispatcher must (not) do

- **Do** answer your own methods and refuse the rest.
- **Do not** re-implement identity: the transport resolves sessions and enforces three gates for you (loopback-or-session for everything, `preAuthMethods` for pairing, `loopbackOnlyMethods` for anything that mints a credential).
- Your product scope is **refused by default** in EnvoyMesh's router, and allowed only where its allow-list says so — the same discipline should apply to yours.

### 4.7 Capabilities are granted, not assumed

Coding is the first capability, and it is owner-set:

```ts
// owner-only, on the node that hosts you
await node.updateNodeConfig({ productGrants: { EnvoyCoder: ["coding"] } });
```

Until the owner does that, your product scope is refused the coding surface it exists for. The default is **nothing**, the read fails closed, and the vocabulary is open — add capability names as your product needs them, on both sides.

## 5. Build the mobile app

### 5.1 Use the thin-client model, not a second node

A phone should not run a mesh node for product features — that is why `apps/envoygo` is a thin client, and why the reusable Dart packages exist:

| Dart package | What it is |
|---|---|
| `envoy_thin_client` | `HomeRemoteClient` → JSON-RPC over the home node's WebSocket |
| `envoy_mesh` | the reusable SDK: identity, signing, envelope verify, address policy, pairing URI |
| `envoy_mesh_libp2p` | reusable libp2p transport (host, sessions, seed store) |
| `envoy_reuse_fixture` | the **proof**: a consumer built only from `reusable` modules, with a test that scans its own imports |

Add them by path, exactly as EnvoyGo does (`apps/envoygo/pubspec.yaml`):

```yaml
dependencies:
  envoy_thin_client:
    path: ../../packages/envoy-thin-client-dart
  envoy_mesh:
    path: ../../packages/envoy-mesh-dart
  envoy_mesh_libp2p:
    path: ../../packages/envoy-mesh-libp2p-dart
```

### 5.2 The pairing flow, precisely

```
desktop app                       phone app
───────────                       ─────────
mints a short-lived token
builds PairingPayload{ wsUrl, lanWsUrl, token, ownerPublicKey, ownerId,
                       relayPeerId?, relayWsUrls?, app: "EnvoyCoder" }
      │  encodePairingToken()  →  a compact gzip code, or the envoy://pair URI
      ▼                                  │  scan
   shows QR ───────────────────────────► │
                                         ├─ 1. REFUSE if `app` is not yours
                                         │     pairingAppMismatch(code.app, resolveAppName())
                                         ├─ 2. dial wsUrl (LAN first, relay fallback)
                                         ├─ 3. pairThinClient({ pairingToken: code.token })
                                         └─ 4. store the session token, reconnect with ?token=…
```

**Step 1 is the phone's job and only the phone's.** The node cannot refuse a cross-app code: the token inside it is opaque and app-local, so what actually happens is that someone scans the wrong QR and the app dials the URL inside it. Hence:

```dart
// Dart (package:envoy_thin_client) — the twin of the TS rule, in the shared contract
final data = parsePairingUri(scanned);
final mismatch = pairingAppMismatch(data?.app, 'EnvoyCoder'); // your own product name
if (mismatch != null) {
  return showMessage(mismatch); // "That code was made by EnvoyMesh, and this is EnvoyCoder. …"
}
```

Both the compact code a QR carries and the legacy query form expose `app`, and both are
covered by tests in `packages/envoy-thin-client-dart/test/pairing_uri_test.dart`. The
Dart default (`kDefaultAppName`) and the TypeScript one (`DEFAULT_APP_NAME` in
`@envoymesh/protocol`) must agree — a test asserts it, because if they drift, every code
minted on one side looks foreign to the other.

Codes minted before the field existed carry no `app` and are accepted — that is deliberate, so already-printed QRs keep working.

### 5.3 What the phone may then do

- It connects with a **session token**, never a key. Credentials stay in `session-tokens.json` under the profile.
- A family-profile session is refused the owner-only RPCs (`terminal*` included) and the live-stream socket methods; the owner's own UI is not.
- Pairing is the only path in for a device: there is no anonymous access, over the LAN or anywhere else.

## 6. The family contract — do not break these

These are what make several apps one group rather than several apps that resemble each other. Each is enforced, and each gate names the file at fault:

| Rule | Enforced by |
|---|---|
| One relay roster (`packages/api/src/default-bootstrap.ts`) | `packages/reuse-host/test/apps-group-invariants.test.ts` |
| One pairing format: one builder, one parser (`api/src/envoy-pair-uri.ts`) | same |
| One app identity (`@envoymesh/protocol`'s `app-identity.ts`), checked client-side | `packages/protocol/test/app-identity.test.ts` |
| Kernel state shared, product state per product | `node scripts/inventory-node-stores.mjs --check` |
| Nothing `reusable` reaches product code | `node scripts/check-module-boundary.mjs` (rules 1–6) |
| Every package declared in seven places | `node scripts/check-workspace-wiring.mjs` (R1–R6) |
| New modules classified in the same change | `node scripts/classify-modules.mjs --check` |
| Generated artifacts current (`api/src/core.ts`, `api/src/core-node-service.ts`) | `node scripts/generate-core-surface.mjs --check` |
| No module over the size cap | `node scripts/check-module-size.mjs apps/node/src packages/host-connect/src packages/harness/src packages/api/src packages/reuse-host/src packages/node-core/src` |

## 7. Syncing with EnvoyMesh

### 7.1 While you are in this repo

Just pull. You are in the same tree, so `git pull` gives you the core, the gates and the suite at once. Run the gates after pulling (§6) — a contract change will fail loudly rather than surprising you at runtime.

### 7.2 When your app gets its own repo

Three options, in the order I would pick them:

| Option | How | Trade-off |
|---|---|---|
| **Subtree/submodule of the core packages** | vendor `packages/{protocol,host-connect,node-core,reuse-host,api}` and pin a commit | reproducible, offline, but you must re-vendor to upgrade |
| **`file:` dependencies to a sibling checkout** | `"@envoymesh/reuse-host": "file:../EnvoyMesh/packages/reuse-host"` | simplest, and **how the existing sibling (`envoy-harness`) works** — see the warning below |
| npm registry | publish the core packages | not done yet; nothing in the family is published |

**The sibling-checkout warning, from experience.** `node_modules/@envoymesh/envoy-harness*` in this repo point at `../envoy-harness`, and that checkout held a *copied* `@envoymesh/protocol` that was four modules behind. The node then failed to start with `ERR_MODULE_NOT_FOUND` while the whole test suite stayed green — because vitest aliases `@envoymesh/*` to in-repo sources, so the tests never touched the copy. **Lesson: a `file:` dependency is a copy, not a link. Re-run the install in the consumer after any core change, and start the real process — not just the tests — after upgrading.**

### 7.3 Versioning

`ENVOYMESH_VERSION` is generated into `packages/protocol/src/version.ts` by `node scripts/sync-version.mjs`; `@envoymesh/api` re-exports it. Do not hand-edit either. Record the version in your own `envoymesh.json` marker via `touchHomeMarker(home, { app: "EnvoyCoder", version })` — that is how the discovery dialog can say "last used by EnvoyCoder 1.2.0".

### 7.4 Contract changes go upstream, never in a fork

If your app needs a symbol from a product-bound module, **move the contract symbol into a core package** (`protocol` for wire/CONTRACT types, `node-core` for host concerns) and re-export it from where it was. That is exactly how the earlier products became possible — `ExtAgentDefinition`, `ENVOYMESH_VERSION`, the pairing payloads and the outbound mesh ports all travelled that way, and each was accompanied by a test asserting the whole family still shares one definition. Then run:

```bash
node scripts/classify-modules.mjs                # regenerate the manifest in the same change
node scripts/check-module-boundary.mjs
node scripts/generate-core-surface.mjs           # if you touched the RPC surface
npx tsc -b && npx vitest run
```

### 7.5 The Envoy Harness is a peer — clone it, do not get it from EnvoyMesh

Everything in §7.2 assumes the thing you need is **core**, so vendoring or `file:`-linking *this* repo is the right move. `@envoymesh/envoy-harness*` is the one exception, and the rule is explicit:

> **A product that wants the Envoy Harness clones or copies `envoy-harness` directly — never through EnvoyMesh's link, and never vendored into EnvoyMesh.**

EnvoyMesh keeps its own `file:../envoy-harness/…` link because it needs the harness to run at all; that link is a **local development arrangement, not a distribution channel**. If EnvoyCoder reached the harness *through* EnvoyMesh, then EnvoyCoder would depend on this repo for someone else's package — and inherit this repo's release cadence for code this repo does not own.

The task is entirely yours to do:

```bash
git clone <envoy-harness> ../envoy-harness        # sibling, or anywhere you like
# then point your OWN package.json at YOUR copy:
#   "@envoymesh/envoy-harness": "file:../envoy-harness/packages/envoy-harness"
npm run build:envoy-harness                        # its build, not ours
```

Both harness names exist, and they are different things:

| Name | What it is | How to get it |
|---|---|---|
| `@envoymesh/harness` | **in-repo package** — ext-agent adapters + Pi runtime, extracted from `apps/node`; declared core, classified `reusable` | it is part of the core you vendor (§7.2) |
| `@envoymesh/envoy-harness*` | **external sibling checkout** — `envoy-harness`, `-adapter`, `-peer`, `-client` | clone/copy it yourself, per this section |

**What EnvoyMesh owes you is an honest failure, not a working import.** Sixteen static *value* imports across ten files sit on the node's **boot path** — measured with the TypeScript parser, walking static relative imports from `apps/node/src/index.ts` (429 files reachable): `node-service-impl.ts` (×3), `agent-runtime-envoy/persistent-acp-host.ts` (×2), `node-service-setup-sponsor-friend.ts`, `envoy-harness-workspace.ts`, `agent-runtime-envoy/factory.ts`, `agent-runtime-envoy/manifest.ts`, `agent-runtime-envoy/local-runtime-registry.ts` (×2), `agent-runtime-envoy/runtime.ts` (×2), `agent-runtime-envoy/bridge-to-envoy-harness-skill.ts`, `agent-runtime-envoy/acp-host.ts` (×2). Across the workspace there are 19 such imports in 13 files (8 more are type-only and erased). It is the boot path that decides whether the process starts at all — so a missing harness surfaces as `ERR_MODULE_NOT_FOUND` from four directories deep inside a `file:` path, before any of it runs. `node scripts/check-peer-deps.mjs` runs ahead of that — it resolves the four packages, prints the counts it measured (so a stale number in this guide is visible), and on failure prints exactly which package is missing, whether the link or only the build output is absent, and the clone + build commands above. It also **refuses to check a subset**: import a fifth `@envoymesh/envoy-harness-*` package and it fails rather than reporting OK for something nobody resolved. Wired into `npm run node:dev` and into `ci-node-hermetic.yml`, so the reason arrives before the four-second stack trace does.

Making those imports lazy was the alternative, and it was rejected: it would turn `node-service-impl.ts`'s call sites async — a large, invasive change to product code for a condition that only affects a **dev checkout**. The packaged desktop app stages the harness bundle at build time and is never affected.

### 7.6 Shared local engine lock — pass the **asset root**, not home

`acquireEngineLock` / `releaseEngineLock` take the **engine asset directory** returned by `resolveEngineRoot(…).dir` / `engineRootFor(…).dir` (normally `<home>/runtime/envoy-local`). The claim file is `<that-dir>/engine-chat.lock` (and `engine-embed.lock` for embeddings).

Do **not** pass the EnvoyMesh home. That would place the lock where no runtime looks, so two products on one machine would each believe they own the engine. Sticky `engine-root.json` already makes every process agree on the asset directory; the lock API must use that same path.

## 8. Definition of done

- [ ] `node scripts/check-workspace-wiring.mjs` — clean across all workspaces
- [ ] `node scripts/classify-modules.mjs --check` — every new module classified
- [ ] `node scripts/check-module-boundary.mjs` — rules 1–6 pass
- [ ] `node scripts/inventory-node-stores.mjs --check` — your stores grouped, 0 ungated
- [ ] `node scripts/generate-core-surface.mjs --check` — generated artifacts current
- [ ] If your app imports the Envoy Harness: `node scripts/check-peer-deps.mjs` resolves it from **your own** clone, not from EnvoyMesh's link (§7.5)
- [ ] `npx tsc -b` — 0 errors, and **`vite build`** for any web UI (a green unit suite does not prove a bundle builds)
- [ ] `npx vitest run` — the whole suite, and check the **collected file count**, not just the exit code
- [ ] **Run the real thing**: your app attaching to a real node, over loopback, and from the LAN (which must be refused a tokenless call)
- [ ] Your mobile app refuses another product's QR with the shared sentence
- [ ] Nothing you added is reachable by a caller the family would not trust: no new anonymous path, no new cross-app path, no shared key

## 9. Pre-flight for EnvoyCoder and EnvoyAgent

| | EnvoyCoder | EnvoyAgent |
|---|---|---|
| App package | `apps/coder` (host + harness driven from your own dispatcher) | `apps/agent` |
| Product scope | `product:EnvoyCoder` via `attachLocalProduct` | `product:EnvoyAgent` |
| Capabilities to request | `["coding"]` (owner-granted, via `updateNodeConfig`) | likely `["agents"]` — **the vocabulary does not exist yet**; add it where `"coding"` lives |
| Product state | `<home>/EnvoyCoder/` — repos, runs, transcripts | `<home>/EnvoyAgent/` — sessions, leases, results |
| Mobile app | `apps/coder-mobile` (Flutter, thin client + pairing) | `apps/agent-mobile` |
| Pairing `app` name | `ENVOYMESH_APP_NAME=EnvoyCoder` | `ENVOYMESH_APP_NAME=EnvoyAgent` |
| Relay | the shared roster, unchanged | the shared roster, unchanged |
| Biggest open question | what a product may call beyond the current allow-list | same, plus capability vocabulary |

**Open decisions to settle before writing code** (they are yours, and they change the shape): who hosts the node when several apps are installed (first to start, or a designated host); whether a product with no node running goes local-only; how many profiles one root holds; and whether a product may attach to a *remote* node (today `resolveRunningNode` is loopback-only, and a remote product pairs with a QR like a phone does).

## 10. Where to read more

| Document | For |
|---|---|
| `docs/envoymesh-multi-product-design.md` | why the family works this way; every decision, with the measurement behind it |
| `docs/envoymesh-refactoring-plan.md` | how the reusable layer was carved out; the gates' rules and their seeded tests |
| `AGENTS.md` / `CLAUDE.md` | repo conventions: the seven wiring places, module-size rule, test layout |
| `packages/reuse-host/src/index.ts` + `src/cli.ts` | the smallest complete product surface, readable in one sitting |
| `packages/envoy-reuse-fixture` | what a Dart consumer may import, asserted mechanically |
| `apps/node/test/reuse-host.test.ts`, `packages/host-connect/test/access-gate.test.ts` | how the gates behave, in executable form |
