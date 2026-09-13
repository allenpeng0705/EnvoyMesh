# EnvoyMesh family — multi-product packaging design

**Status:** design agreed in outline; **not implemented** · **Owner:** product / packaging · **Created:** 2026-09-12

> **Why this is its own document.** `docs/envoymesh-refactoring-plan.md` §11 states "**No product design**" and §12's banner adds that "product design belongs in its own document … mixing it into an encapsulation plan is precisely how the §2.3 mixed surface came into being." This is that document. It decides nothing about the refactor and changes no module's classification; it *consumes* the refactor's split (556 `reusable` / 252 `product-bound`) and records how a family of products should be installed, configured and run next to each other.
>
> Figures below were measured on 2026-09-12 at `90eb7523` unless labelled otherwise. Every one is annotated with the file and line it came from, so a later reader can re-derive it.

---

## 1. The question

What happens when a user installs **EnvoyMesh** (social), **EnvoyCoder** (coding) and **EnvoyAgent** (agents) on the same machine — and what should happen?

This is not hypothetical. It is the first question a second product forces, and it is the one the refactor's boundary work exists to make answerable.

## 2. Measured baseline — the mesh is not the problem

| Configuration | RSS | Idle CPU | Open FDs |
|---|---|---|---|
| Empty Node host + WS server, no libp2p | 136 MB | ~0% | 19 |
| One libp2p mesh node, idle (no bootstrap/mDNS/DHT) | 185.6 MB | 0.95% of one core | 14 |
| One mesh node + mDNS | 180.9 MB | — | — |
| One mesh node + live relay connection and reservation | 186.4 MB | 1.27% | 16 |

Measured by starting `EnvoyMesh` from `packages/network/dist` in three configurations and sampling `process.memoryUsage()` plus `/dev/fd`.

**Consequences.**

1. A libp2p node costs **~50 MB** over an empty process, and **~1% of one core** idle. Connections are cheap: a live relay connection added **~1 MB**.
2. Therefore "three products = three libp2p nodes" costs about **370 MB** — real on a laptop, decisive on a phone, but **not** the driver of any headline memory number.
3. Sharing the mesh is worth doing for *identity*, *WAN presence* and *relay load* reasons, not for memory.

**An unattributed observation.** The owner reports a running EnvoyMesh costing **>2 GB**. That is not the mesh (≈186 MB) and not an empty host (≈136 MB), so it is the product surface: the Tauri WKWebView rendering the social SPA, the social stores, the external `@envoymesh/envoy-harness*` runtime, and/or a spawned `llama-server`. **This figure must be attributed before any packaging decision is justified by memory** (§11, O5), because if a resident agent runtime is 1.2 GB, the highest-value change is making *that* lazy, not splitting apps.

**A blocker to measuring it here.** `npm run node:dev` does not start in this checkout:

```
node_modules/@envoymesh/envoy-harness          -> ../../../envoy-harness/packages/envoy-harness
node_modules/@envoymesh/envoy-harness-adapter  -> ../../../envoy-harness/packages/envoy-harness-adapter
```

`apps/node/src` imports those live (`node-service-eh-user-question.ts`, `agent-runtime-envoy/local-runtime-registry.ts`, `node-service-setup-sponsor-friend.ts`). They resolve into a **sibling checkout**, whose copy of `@envoymesh/protocol` predates this refactor — 10 compiled files, missing `ext-agent-contract.js` and `pairing-contract.js` — so the process dies at import with `ERR_MODULE_NOT_FOUND`.

**No gate caught this, because `vitest.config.ts` aliases `@envoymesh/*` to in-repo sources.** The suite is green (966 files, 8,988 tests) while the real node cannot start. This is the same failure shape as the five broken `require()` calls in the shipped ESM build (§8.16 of the plan): the test path and the run path are not the same path. **Fix this before measuring anything** (S0).

## 3. The three decisions

### D1 — Apps and processes are separate

Each product is its own app, its own OS process, its own installer, its own release cadence. Not one process hosting three surfaces.

**Why.** (a) A user who installs only EnvoyCoder should never load the social surface — that is the entire point of the 556/252 split. (b) Isolation: separate processes are separate crash, upgrade and permission domains. (c) Independent install and update.

**What it is not.** Separate apps do **not** imply separate mesh nodes, separate identities, or separate model runtimes. Those are D2 and D3.

### D2 — Mesh and identity are shared, with exactly one owner process at a time

A human is **one peer** on the mesh: one owner key, one device certificate, one bond set, one vault, one set of contacts.

**The hard constraint.** Two processes holding the same `libp2p-private.key` is **not** sharing — it is corruption. Both would claim the same PeerId: a relay sees one peer check in twice, peers hold ambiguous connections to that id, and a node can dial itself. Both processes would also write the same stores, and **there is no lock anywhere today** (no flock, no pidfile, no `O_EXCL` guard in `apps/node/src` or `packages/*/src`). So "shared identity" must mean **exactly one process owns the mesh at a time**, and the others **attach to it as clients**.

**The shape.** The first EnvoyMesh-family app to start becomes *the node*; others discover it and attach — the same client/server split `apps/envoygo` already implements from the phone side (`HomeRemoteClient`), and that OpenClaw's remote onboarding already dials (`packages/openclaw/src/commands/onboard-remote.ts` validates `ws://`/`wss://` targets).

**Rejected alternative:** three independent nodes, each with its own identity. It is simpler to build and worse to use: three peers per human means every friend sees three strangers, and bonds, device certificates and vaults all have to be established three times. It is retained as an explicit *standalone* mode for a user who wants full isolation.

### D3 — Model runtime: share local, never share non-local

The rule is already a type in the tree: `packages/models/src/index.ts:45` — `export type ModelProviderType = "local" | "cloud" | "peer"`.

- **`local`** → one shared local engine. Probe whether it is running, start it under a lock if not, share the weights and the process.
- **`cloud` / `peer`** → **never shared.** Each app keeps its own provider config and credentials; "sharing" a cloud key across apps would mean one app's quota and one app's revocation surface controlling another's.

**An app must be able to tell whether the local engine is running when its own model setting is local.** The mechanism exists: `apps/node/src/envoy-local-runtime.ts:951` already probes **`/v1/models`** (`"[envoy-local] watchdog: /v1/models unreachable — restarting chat sidecar"`), and `packages/node-core/src/service-ports.ts` fixes the endpoints (`ENVOY_LOCAL_PORT` 18790 chat, `ENVOY_LOCAL_EMBED_PORT` 18791 embeddings, both offsettable).

## 4. The shared root

### 4.1 Location

| OS | Path | Note |
|---|---|---|
| macOS | `~/Library/Application Support/EnvoyMesh/` | Per-user app support; **not** iCloud-synced |
| Windows | `%LOCALAPPDATA%\EnvoyMesh\` | **`LOCALAPPDATA`, not `APPDATA`** — see below |
| Linux | `~/.local/share/EnvoyMesh/` | XDG convention |
| Legacy | `~/.envoymesh/` | Already in use (`packages/harness/src/backends.ts:409` writes `openhuman.api-key` there). Recognize it; do not ignore it |

**Why not `%APPDATA%` on Windows.** It is the *roaming* profile: it syncs to the domain/cloud profile. `profile.json` holds `owner`, `device` and `deviceCertificate` (`packages/local-store/src/index.ts:150`), and `packages/identity` generates those with a `privateKeyPem` inside them. The shared root therefore contains the **owner private key**; a roaming folder ships it off the machine.

**Permissions.** Root `0700`, secrets `0600` — the repo's existing file-mode convention (`AGENTS.md`: "File modes: `0o600` for all data files").

### 4.2 Override

- `ENVOYMESH_HOME` — the root (new).
- `ENVOYMESH_PROFILE` — already read (`apps/node/src/args.ts:685`); keep it working, meaning "this profile directory", for back-compat and scripted use.
- **The real interface is the app's own setting**, not an env var: this is an end-user product (see `AGENTS.md`, "Default = end-user first, developer second"). Env wins when set; the GUI writes the setting; both must resolve through one function.

### 4.3 What makes a directory a profile

Detection is already well-defined by what the node writes:

| Marker | Meaning | Source |
|---|---|---|
| `profile.json` | owner + device + device certificate (contains private keys) | `packages/local-store/src/index.ts:90`, `:150` |
| `human-profile.json` | the signed human profile (display name, username) | `packages/local-store/src/index.ts:101` |
| `libp2p-private.key` | the peer identity | `apps/node/src/libp2p-key-loader.ts:6` |

All three present and parseable = **a profile**. Partially present = **damaged**: report it and offer repair or a new profile — **never create a fresh identity beside a damaged one**, or the user silently loses their contacts and bonds and cannot tell why.

### 4.4 The missing version marker

There is **no `schemaVersion` / `storeVersion` anywhere** in `apps/node` or `packages/local-store` (verified by grep). With several apps of different versions sharing one profile, that is the first thing to add — a marker in the root:

```json
{
  "schema": 1,
  "createdAt": "2026-09-12T00:00:00.000Z",
  "ownerId": "envoy:owner:…",
  "lastUsedBy": { "app": "EnvoyMesh", "version": "0.5.0", "at": "2026-09-12T00:00:00.000Z" }
}
```

It gives the discovery dialog something real to show ("created by EnvoyMesh 0.5.0, last used yesterday by EnvoyCoder") and lets an app of an older schema **refuse politely** instead of writing a layout it does not understand. `deriveOwnerId(ownerPublicKeyPem)` already exists (`packages/identity/src/index.ts:621`), so `ownerId` is verifiable rather than trusted.

## 5. Layout

```
<root>/
  envoymesh.json      schema + createdAt + ownerId + lastUsedBy   (§4.4)
  lock                single-writer lock for profile/             (does not exist today)
  node.json           the running node: pid, port, token, peerId, schema (0600)
  profile/            identity + the 14 KERNEL stores             ← shared by every app
  runtime/            llama-server binary + GGUF weights          ← shared local engine (D3)
  <product>/          product state: chats (messenger), repos (coder), sessions (agent)
```

**The kernel/product line is not invented here — it is the inventory's own split.** `node scripts/inventory-node-stores.mjs --check` reports **48 stores: 14 kernel / 34 product / 0 undecided**.

- **Shared (kernel, 14):** agent identity, node config, capability manifest, session tokens, device authorization, contact owner keys, peer-profile cache, discovery seeds, multi-hop discovery, peer reputation, sensitivity overrides, intent history, continuity, capability index.
- **Per product (34):** chat logs, chat rooms and their pending queues, drafts, auto-reply limits, family profiles and rooms, shop, market cache and search history, commerce receipts, reputation anchors, social proxy sessions, agent circles, document-acquisition and capability-provider jobs, coding heartbeat/runtime/schedule, chains, delegated chains, published library, web-content cache, worker leases/reliability/receipts, harness sessions and memory, published external exports.

So "EnvoyCoder checks the existing profile and uses it" means **kernel state shared, product state not** — which is what a user means by "use my existing setup", and also why EnvoyCoder must not read your chat transcripts.

**Payoffs of this layout.** The vault lives with the identity → **one index, one set of embeddings**, no reindexing per product. The engine assets live in `runtime/` → **one llama-server binary and one set of weights** (today they are installed under `{profile}/envoy-local/runtime/{tag}/` — `apps/node/src/envoy-local-runtime.ts:138`, `:660` — i.e. *per profile*, so two profiles currently mean two multi-GB downloads).

## 6. Discovery and flow

The owner's rule: **check the common place; tell the user a profile exists; let the user decide; if none exists, create one.**

| # | State | Behaviour |
|---|---|---|
| 1 | Resolve root | `ENVOYMESH_HOME` → app setting → per-OS default → legacy `~/.envoymesh` |
| 2 | **Profile found** | Show owner id, display name, created/last-used, peer id, size on disk, schema. Buttons: **Use it / Create a new one / Choose another folder** |
| 3 | **No profile** | Create it **at the root** — never relative to the working directory |
| 4 | **Profile found, and in use right now** | Do not open it twice: offer to attach (D2), or to create a second profile |
| 5 | **Damaged profile** | Report which markers are missing/unreadable; offer repair or a new profile; never a silent new identity |

**State 3 is a live bug today.** The node's default is `profileDir: "./data/default"` (`apps/node/src/args.ts`) — a *relative* path resolved against the process CWD. Starting the node from two different directories therefore produces **two identities**, silently. Moving the default to the shared root (S1) is a one-line change that removes a whole class of "why did my contacts disappear" reports.

**State 4 is the one the original rule did not cover**, and the one that corrupts data today, because no lock exists.

## 7. Attach protocol (D2 implementation)

- **`node.json`** (0600) written by the owning process: `{ pid, port, path, token, peerId, ownerId, schema, startedAt }`, removed on clean shutdown, treated as stale if the pid is gone or the endpoint does not respond.
- **`lock`** in the root: exactly one process may own `profile/`. Attempting to become the node while another holds it → attach or fail loudly, never "try anyway".
- **Health must identify the node.** Today `GET /health` returns `{"ok":true,"service":"envoymesh-home-ws",…}` in *every* product, because they share one transport, and the desktop liveness probe accepts any `200` containing `"ok":true` (`apps/tauri/src-tauri/src/main.rs:767`). An attaching app cannot confirm it found the right node, and the desktop guardian can be fooled into believing its own node is alive. `/health` must carry `peerId`/`ownerId` and the prober must check them.
- **The supervisor must not kill other products.** `kill_stale_listeners_on_node_ports()` (`apps/tauri/src-tauri/src/main.rs:632`) runs `lsof -ti :3030|3031|3032` and SIGTERM-then-SIGKILLs **whatever owns those ports**, with no identity check. Under D2 the owner may legitimately be a *different app*, so this must verify ownership (pid file / service identity) before killing.
- **Product-scoped sessions.** A session already carries `scopeKey` / `isOwnerScope` (`packages/host-connect`), and the node already gates features per scope (`mayFamilyProfileUseExtAgent`, `mayFamilyProfileUseCoding` — `apps/node/src/node-service-impl.ts:8710`, `:8741`). A product identity is the same idea one level up: session → product → allowed methods. This is what keeps D1 meaningful when apps attach to a shared node.

## 8. Model sharing (D3 implementation)

- **Probe:** `GET /v1/models` on the shared engine port (the watchdog already does this — `envoy-local-runtime.ts:951`). "Is the local model running" is answered by the engine, not by a flag in the app.
- **Spawn lock:** two apps must not race to start an engine. One lock, first winner starts, the other waits and then attaches.
- **Assets:** move `llama-server` and the GGUFs from `{profile}/envoy-local/` to `<root>/runtime/` so multiple profiles do not each download GBs.
- **The model-lease problem — the real complexity.** One `llama-server` serves **one model**. If EnvoyMesh holds a chat model and EnvoyCoder wants a code model, the shared engine cannot serve both without a reload (tens of seconds, GBs of churn). Options: (a) one agreed shared model; (b) a lease — the holder picks, others queue or fall back; (c) do not share chat models, only embeddings. **Embeddings (18791) are the easy win** — same model, useful to every product, and sharing them is what avoids reindexing the vault per product.
- **Cloud/peer providers are per-app and unshared**, including credentials.

## 9. Open decisions (owner's call)

| # | Question | Options | Recommendation |
|---|---|---|---|
| **O1** | Who hosts the node? | first app to start · a designated host (EnvoyMesh only) | **first to start** — more robust when only EnvoyCoder is installed; needs the ownership checks in §7 |
| **O2** | EnvoyCoder with no node running | start a node from the shared profile · **local-only mode** (no mesh) | **local-only by default** for a coding tool: nothing on the mesh unless a mesh app is running |
| **O3** | Profiles per root | one · many with a `current` pointer | layout supports many, **ship MVP with one** |
| **O4** | Existing installs | adopt/move the old per-app dir · leave it and start fresh | **offer to move** (Tauri used `app_data_dir/profile` — `main.rs:1698`; and `./data/default` may exist beside old checkouts); never duplicate silently |
| **O5** | Attribute the >2 GB before justifying D1 by memory | measure WebView / node / harness runtime / llama-server separately | do it in S0/S1 |

## 10. Implementation steps

| # | Step | Acceptance |
|---|---|---|
| **S0** | Make the node runnable in a working checkout: refresh the sibling `envoy-harness` links (or vendor the remaining contract symbols into `packages/protocol`, which this refactor already did for five of them) | `npm run node:dev` starts; then attribute the >2 GB by process |
| **S1** | Root resolution (`ENVOYMESH_HOME` → setting → per-OS default → legacy), `envoymesh.json` marker, detection helper, and move the node default off `./data/default` | Starting from two different CWDs resolves to **one** identity; marker written on first run; detection unit-tested against found / missing / damaged |
| **S2** | The discovery dialog: found / none / damaged / in-use, with end-user wording | A user can see which profile exists, who it belongs to, and choose; no silent creation in any state |
| **S3** | `lock` + `node.json` + attach; health identity; ownership-checked supervisor cleanup | Two apps: second attaches, never double-owns; supervisor kills only its own sidecar; `/health` identifies the node |
| **S4** | Shared local engine: assets to `runtime/`, `/v1/models` probe, spawn lock, model lease; embeddings first | Second app uses the running engine instead of spawning one; a racing start is resolved by the lock |

## 11. What this design does not change

- No social behaviour, feature set or RPC surface changes.
- No module classification changes: this document consumes the 556/252 split, it does not move the line.
- No new transport: LAN/relay `ws://` and libp2p + circuit relay already serve every consumer.
- The `coding` scope in the plan's §12.1 appendix remains a worked example; nothing here promotes it.

## 12. Evidence index

| Claim | Source |
|---|---|
| Mesh node ≈186 MB, ≈1% CPU | measured via `packages/network/dist` (three configurations) |
| Empty host ≈136 MB | `packages/reuse-host` CLI running |
| Ports 3030/3031/3032, 18789/18790/18791 + offset | `packages/node-core/src/service-ports.ts` |
| `ENVOYMESH_PROFILE`; default `./data/default` | `apps/node/src/args.ts:685`, `args.ts` defaults |
| Profile markers | `packages/local-store/src/index.ts:90`, `:101`, `:150`; `apps/node/src/libp2p-key-loader.ts:6` |
| Owner key inside `profile.json` | `packages/identity/src/index.ts` key generation; `NodeProfile` shape |
| 14 kernel / 34 product stores | `node scripts/inventory-node-stores.mjs --check` |
| 556 reusable / 252 product-bound modules | `node scripts/classify-modules.mjs --check` |
| `ModelProviderType = local \| cloud \| peer` | `packages/models/src/index.ts:45` |
| Engine assets per profile; `/v1/models` watchdog | `apps/node/src/envoy-local-runtime.ts:138`, `:660`, `:951` |
| Supervisor kills by port; health check is identity-blind; per-app data dir | `apps/tauri/src-tauri/src/main.rs:632`, `:767`, `:1698` |
| No profile lock; no schema version | grep over `apps/node/src` and `packages/*/src` (2026-09-12) |
| Legacy root `~/.envoymesh` | `packages/harness/src/backends.ts:409` |
| `deriveOwnerId` | `packages/identity/src/index.ts:621` |
| Per-scope feature gates | `apps/node/src/node-service-impl.ts:8710`, `:8741` |
| Sibling-link breakage | `node_modules/@envoymesh/envoy-harness*` symlinks + missing `ext-agent-contract.js` / `pairing-contract.js` in the sibling's `@envoymesh/protocol` copy |
