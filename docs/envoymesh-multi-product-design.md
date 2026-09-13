# EnvoyMesh family — multi-product packaging design

**Status:** design agreed in outline; **S0, S1 and S2's model implemented** (§13) · **Owner:** product / packaging · **Created:** 2026-09-12

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

**Attributed so far (§13, S0).** The node process itself — the full social node, everything loaded, mDNS/DHT/relay off — starts at **~650 MB** and grew to **718 MB over 70 s** before a collection took it back to **513 MB**, holding 5 TCP sockets. A `tsx` wrapper adds a second process (~79–93 MB). So the node is the heavy component, and the rest of the 2 GB is the WebView and/or a model server. Two consequences: (a) a product that shares one node pays that node's full weight, which is an argument for *separating heavy runtimes* rather than sharing everything; (b) the honest comparison for D1 is "EnvoyCoder's node, built only from `reusable` + coder modules" against this 650 MB, which is measurable once EnvoyCoder exists.

**The blocker, and its fix (§13, S0).** `npm run node:dev` did not start:

```
node_modules/@envoymesh/envoy-harness          -> ../../../envoy-harness/packages/envoy-harness
node_modules/@envoymesh/envoy-harness-adapter  -> ../../../envoy-harness/packages/envoy-harness-adapter
```

`apps/node/src` imports those live (`node-service-eh-user-question.ts`, `agent-runtime-envoy/local-runtime-registry.ts`, `node-service-setup-sponsor-friend.ts`). They resolve into a **sibling checkout**, whose copy of `@envoymesh/protocol` predates this refactor — 10 compiled files, missing `ext-agent-contract.js`, `pairing-contract.js`, `json-rpc-wire.js` and `version.js` — so the process died at import with `ERR_MODULE_NOT_FOUND`. The sibling's `@envoymesh/protocol` is a **copied directory** (not a link), and it is four modules behind.

**No gate caught this, because `vitest.config.ts` aliases `@envoymesh/*` to in-repo sources.** The suite was green (966 files, 8,988 tests) while the real node could not start. This is the same failure shape as the five broken `require()` calls in the shipped ESM build (§8.16 of the plan): the test path and the run path are not the same path — which is why S0 was "make it run", not "write more tests".

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
| **S0** ✅ | Make the node runnable in a working checkout: refresh the sibling `envoy-harness` links (or vendor the remaining contract symbols into `packages/protocol`, which this refactor already did for five of them) | ✅ node starts; >2 GB attributed by process (§13) |
| **S1** ✅ | Root resolution (`ENVOYMESH_HOME` → setting → per-OS default → legacy), `envoymesh.json` marker, detection helper, and move the node default off `./data/default` | ✅ starting from two different CWDs resolves to **one** identity; marker written on first run; 18 tests over found / missing / damaged / permissions (§13) |
| **S2** ◐ | The discovery dialog: found / none / damaged / in-use, with end-user wording | ✅ the model + the node's damaged-profile path (`profile-discovery.ts`, 8 tests); ◻ the dialog rendering belongs to a product UI; ◻ **in-use** needs S3's lock |
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

---

## 13. Implementation log

Chronological, newest last. Each entry says what was measured or observed, not just what was written.

### S0 ✅ — the node runs again (2026-09-13)

**What was wrong.** The sibling checkout's `@envoymesh/protocol` is a copied directory, four modules behind this repo (`ext-agent-contract.ts`, `json-rpc-wire.ts`, `pairing-contract.ts`, `version.ts`). Any path that resolved `@envoymesh/protocol` through `node_modules/@envoymesh/envoy-harness*` died at import.

**Fix.** Replaced the stale copy with a symlink to `packages/protocol` (the original is preserved beside it as `protocol.stale-20260913`, so `pnpm install` in the sibling restores it or the symlink can be removed). Verified by starting the node, not by a test:

```
[config] config:updated: model=disabled …
[openclaw] Built-in OpenClaw gateway at http://127.0.0.1:18789/webhook/envoymesh
[rag] deferring vault reindex until Envoy Local embed sidecar is ready
```

**For other machines**, the right fix is to refresh that checkout (`pnpm install` in `envoy-harness`, or `npm run build:envoy-harness`, which is already a documented script here) — the symlink is a local repair of a broken environment, not a repo change.

**Measured while doing it (O5, partial).** Full social node, mDNS/DHT/relay off: **652 MB → 718 MB over 70 s**, then a collection to **513 MB**, 5 TCP sockets. A `tsx` wrapper adds a second process (79–93 MB). The node — not the mesh, not the host — is the heavy component.

### S1 ✅ — one root, one identity per machine (2026-09-13)

**New module:** `packages/node-core/src/envoymesh-home.ts` (**557 reusable modules**, up from 556; classified `reusable` because it imports only `node:*`). It owns root resolution, the marker, and profile detection — paths and inspection only; which stores go where stays with the callers (§5).

| Decision implemented | Behaviour |
|---|---|
| Per-OS default root | `~/Library/Application Support/EnvoyMesh` · `%LOCALAPPDATA%\EnvoyMesh` · `$XDG_DATA_HOME/EnvoyMesh` |
| `ENVOYMESH_HOME` wins | Resolved (never used as-is), and used even when absent so a script can point anywhere |
| Legacy adoption | `~/.envoymesh` is used **iff** the preferred root does not already hold a home, so an existing install keeps its identity instead of silently starting a second one |
| Marker | `envoymesh.json` — `schema`, `createdAt`, `ownerId`, `lastUsedBy`; written atomically, mode `0600`, schema never downgraded |
| Detection | `inspectProfile()` → `found` / `missing` / `damaged`, naming exactly which markers are absent or unreadable, and reporting **who** the profile belongs to even when damaged |
| Safe product paths | `productDirIn(home, product)` rejects `..`, separators and empty names |

**Wired in.** `apps/node/src/args.ts` no longer defaults to `./data/default`; `apps/node/src/index.ts` creates the root tree and writes the marker before the profile loader runs.

**Acceptance, verified by running the node twice from different working directories:**

```
run 1 from /tmp/cwd-a:  [home] created /tmp/envoytest-home (schema 1) — profile …
run 2 from /tmp/cwd-b:  [home] using   /tmp/envoytest-home (schema 1) — profile …
owner key identical in both runs: YES
```

**A finding while verifying:** the first run left `<home>/profile` as `drwxr-xr-x` — the profile loader's `mkdir` is subject to umask, and that directory holds `libp2p-private.key` and the owner key inside `profile.json` (both `0600`, so only a directory listing leaked, but the listing is what names the owner). Fixed by creating the root and profile `0700` before the loader runs; re-verified on a fresh home: `0700` root, `0700` profile, `0600` key.

**Tests:** `packages/node-core/test/envoymesh-home.test.ts` — 18 cases covering per-OS defaults, override precedence, legacy adoption (both directions), marker round-trip/0600/corrupt/loose-typed input, schema non-downgrade, and all three detection states including "damaged still reports its owner". One of them failed first and was right to: `inspectProfile` returned no owner for a damaged profile, which is exactly what a discovery dialog needs to display — the implementation was fixed rather than the assertion.

**Not done here** (deliberately): the discovery dialog (S2), `node.json`/lock/attach (S3), and the shared engine (S4). O1–O5 remain open; O5 is partially answered above.

### S1 review — three defects in my own S1 code (2026-09-13)

Reading the change back found three things the tests did not:

1. **The marker never recorded `ownerId`** — the one field the whole discovery story rests on. `touchHomeMarker` ran *before* the profile was loaded, and the owner is only known after, so no call ever passed it. Fixed by making `ownerId` an optional argument and touching the marker a second time after the profile loads; an absent value never clears a recorded one. Verified: the marker now carries `ownerId` matching `profile.json`.
2. **`ensureHomeDirs` created a nested `profile/` inside an explicit profile directory.** With `--profile /somewhere`, `homeForProfileDir` returns `/somewhere`, so the helper made `/somewhere/profile` — harmless but wrong. Now gated on the root layout (`resolve(profileDir) === profileDirIn(home)`).
3. **Dead code**: `isWritableDir` was exported but never called. Removed rather than left for a future caller to wonder about, the same rule applied to `ensureHomeDirs` (now used).

Also added: `isHomeSchemaSupported()`, wired into the node as a warning — a home written by a *newer* build is not fatal, but treating its layout as known would be.

**What the review confirmed is already right:** the loader *refuses* to replace a damaged profile — a JSON parse failure is not a missing file, so `loadOrCreateNodeProfile` re-throws instead of generating a new identity (`packages/local-store/src/index.ts:163`). The failure mode was loud but ugly: a raw `SyntaxError` stack trace.

### S2 (first half) ✅ — the discovery model, and what the node now says (2026-09-13)

**New module:** `packages/node-core/src/profile-discovery.ts` — **558 reusable modules**. It turns an inspection into what a product should *say* and what the user can *choose*, with the wording in one place and a test that keeps it free of developer vocabulary (`profileDir`, `undefined`, `JSON`, `ENVOYMESH_`, `envoy:owner:`).

| State | Headline (end-user wording) | Choices |
|---|---|---|
| `found` | "A profile for Alice was found on this computer." | Use it *(recommended)* · Create a new one · Choose a different folder |
| `missing` | "No profile was found, so a new one will be created." | Create my profile *(recommended)* · Choose a different folder |
| `damaged` | "The profile for Alice looks incomplete." | Choose a different folder *(recommended)* · Start a new profile here |

Three properties the tests pin, beyond the wording: every reachable state offers **at least one** choice (a dialog with no way forward is worse than no dialog); **no choice deletes anything**, and the one that starts fresh says the existing files are kept; and the caller's real capabilities are honoured (`canCreate`, `canChooseFolder`), so the model never offers what the product cannot do.

**Wired into the node.** Startup now reports the situation for a damaged profile and **exits 2 with a readable message** instead of printing a stack trace:

```
[home] A profile here looks incomplete.
       In “…/profile”, some files are missing (human-profile.json) and some files
       cannot be read (profile.json). Nothing has been changed. If you have a
       backup, restore it; otherwise choose another folder, or start a new profile here.
       • Choose a different folder — Use a backup or another profile you already have.
       • Start a new profile here — The incomplete files are kept, but a new identity
         is created beside them.
EnvoyMesh cannot start with the profile in “…/profile”.
Nothing was changed. Fix or move that folder (or restore a backup), then start EnvoyMesh again.
```

Verified by corrupting a real profile and starting the node against it: the message appears, the exit code is 2, and the damaged file is still 11 bytes of truncated JSON — **not** replaced.

**Review fixes inside S2 itself:** the damage list read "A, and B" (now "A and B" / "A, B and C" — the kind of detail that makes a product feel machine-written), and the node died with a `SyntaxError` *after* printing its readable message.

**What is left of S2 is rendering, deliberately.** The dialog itself belongs to a product UI (Social/Tauri today, EnvoyKit later); this module is the part that can be tested without a browser and cannot drift into each product inventing its own wording. The **in-use** state (§6, state 4) needs the lock from S3 before it can be modelled honestly.

**Also in this change:** `packages/node-core/src` joined the module-size gate in CI and in `scripts/test/gates.test.mjs` — a core package carrying product-facing modules should not grow unbounded unnoticed. Its only current finding is a pre-existing warning (`home-fs.ts`, 509 lines).

### S2 review — the gate caught my own growth, and a lie in the help text (2026-09-13)

Two things the seeded suite and a read-through found after S2 was written:

1. **`apps/node/src/args.ts` hit 802 lines — over the 800-line hard cap** — because of the six lines S1 added to it. `node --test scripts/test/gates.test.mjs` failed on the repo's own tree, which is precisely what that test is for ("the synthetic fixtures cannot catch drift in the real tree"). The allowlist is for *pre-existing v1.x* modules; adding an entry for growth I had just caused would be the rule inverted, so the 85 lines of static `--help` text moved to `apps/node/src/args-help.ts` and `args.ts` is **723** lines. Verified as CI runs it: **658 files scanned, 0 over the hard cap**.
   The move also re-tested a trap this refactor has hit three times: `printHelp` is *called* inside `args.ts` **and** imported from `./args.js` by `discovery-dashboard.ts`, so it needed an import **and** a re-export — a re-export alone does not create local scope.
2. **The help text still advertised `Default: ./data/default`** — stale the moment S1 changed the default, in the one place a user looks to find out where their profile went. Now:

```
  --profile <dir>       Profile directory for Envoy identity. Default: the shared EnvoyMesh home
                        (macOS ~/Library/Application Support/EnvoyMesh; Windows %LOCALAPPDATA%\EnvoyMesh).
                        Env: ENVOYMESH_HOME (the whole home) or ENVOYMESH_PROFILE (this directory);
                        the flag also exists because npm eats --flags on Windows.
```
