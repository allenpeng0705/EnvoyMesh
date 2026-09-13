# EnvoyMesh family — multi-product packaging design

**Status:** design agreed in outline; **S0, S1 and S2 done; S3 started** (§13) · **Owner:** product / packaging · **Created:** 2026-09-12

> **Building a new app?** Start with `docs/envoymesh-new-app-guide.md` — the how-to for a new product (desktop + mobile), including the family rules it must not break and the upstream sync procedure. This document is the *why*: the decisions and the measurements behind them.
>
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
| **S2** ✅ | The discovery dialog: found / none / damaged / in-use, with end-user wording | ✅ all five states modelled (`profile-discovery.ts`, 13 tests); ✅ the node's damaged *and* in-use paths; ◻ the dialog rendering belongs to a product UI |
| **S3** ◐ | `lock` + `node.json` + attach; health identity; ownership-checked supervisor cleanup | ✅ lock, endpoint, identity probe, refusal of a second owner (16 tests + a two-process run); ◻ attach (token exchange + client); ◻ `/health` carrying identity; ◻ the Rust supervisor's kill-by-port |
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

### S2 review round 2 — six defects, and one test that passed for the wrong reason (2026-09-13)

Reading the first S2 version back against §6 and §7 found more than the first pass did:

1. **The facts block did not exist**, although §7 says the dialog shows owner, display name, created and last-used. Prose mentioned the owner; every timestamp was dropped on the floor — `DescribeProfileSituationInput` took only `lastUsedByApp`.
2. **The headline contradicted the buttons**: with `canCreate: false` the *missing* state still announced "a new one will be created" while offering no such choice.
3. **A dialog with no way forward.** With `canCreate` *and* `canChooseFolder` both false, `missing` and `damaged` produced `choices: []`. Worse, the test written to prevent exactly this — "never leaves the user without a way forward" — only exercised the defaults, so it **passed for the wrong reason**. The test now walks every state × capability combination, and the model falls back to "Not now".
4. **"Start a new profile here" was offered as an ordinary option** although a UI must confirm it. Choices now carry `destructive?: boolean`.
5. **The jargon test banned arbitrary words** ("sync", "null") and would have failed on unrelated edits — the way a useful test gets deleted instead of fixed. Narrowed to vocabulary that is unambiguously developer-facing.
6. **The damage list read "A, and B"** for two items.

`ProfileSituation` gained `facts: { label, value }[]` (owner, where, created, last used *with* the app and version, device) so a UI has something to show beyond a sentence, and `ProfileSituationState` gained `"in-use"` — which an inspection can never report, because the files may be perfectly healthy; only the lock knows.

### S2 review round 1 — the gate caught my own growth

### S3 (first slice) ◐ — one process owns a home (2026-09-13)

**New module:** `packages/node-core/src/node-registry.ts` — **560 reusable modules**. Three pieces, and the failures they exist to prevent are the ones I could previously only describe:

| Piece | Property |
|---|---|
| `lock` (`acquireNodeLock` / `releaseNodeLock`) | `wx` exclusive create, so eight simultaneous claimants produce **exactly one** winner (asserted concurrently, not argued); a claim whose pid is gone is **taken over** so a crashed node cannot lock the user out; release is pid-guarded so one process can never delete another's claim |
| `node.json` (`writeNodeEndpoint`) | 0600, atomic, naming pid, port, path, owner and schema — what a second product reads to say *who* has the home |
| `probeNodeEndpoint` | answers **two** questions: is something serving there, and is it the node we mean. The transport's `/health` body is identical across products, which is how the desktop guardian can be satisfied by a different product holding the port; identity is verified when the payload carries it and reported as `identityUnknown` when it does not |

**Wired into the node**, with the order chosen by observation: **lock before profile load**, because two processes that both load (and on a fresh home both *create*) a profile have already done the damage by the time either notices.

**Two defects found by running it, not by testing it:**

1. **Damaged was reported before ownership** — so the second process printed "the profile looks incomplete" *and then* "EnvoyMesh is already using it". A node that is still starting has not written every file yet, so a healthy in-use home reads as damaged — and telling a user their profile is incomplete invites them to start a new identity beside a healthy one. Ownership now wins: verified by starting a second node against a live one, which prints only the in-use block, exits 3, and changes nothing.
2. **`releaseNodeLock` is async, so the `exit` handler never finished it** — every clean shutdown left a lock file behind and the next start reported it as stale. Stale claims are taken over, so this was never fatal, but it made every clean exit look like a crash. Added `releaseNodeLockSync` for the exit path; verified by `SIGTERM`: lock and `node.json` both gone, port released, profile intact.

**My verification was invalid before it was right**, which is worth recording: the first two-process run "passed" with a deleted home and four leftover node processes from earlier runs fighting over port 3030 — so the second process hit `EADDRINUSE` and exited 1 for reasons that had nothing to do with the lock. Killed everything, re-ran against a clean port, and only then did the result mean anything.

**And the full suite failed once, for a reason that had nothing to do with S3.** `apps/node/test/reuse-host.test.ts` — *"boots, authenticates a client and serves an RPC end to end"* — failed with `expected undefined to deeply equal { version: '0.5.0', … }` and passed in isolation. Cause: it resolved on the **first** WebSocket message, while the transport also pushes an unsolicited `connected` event; under load the push arrives first and the test reads it as its RPC reply. Message *order* is not part of the contract — correlating on the JSON-RPC `id` is — so the test now filters by id (the same discipline my own CLI probe needed, learned the same way). The suite's test count went **up** by one after the fix, because the racing assertion had been silently skipping.

### S3 (second slice) ◐ — the three found issues, fixed (2026-09-13)

Everything S3's first slice named as owed, except attach itself.

**1. `/health` says who it is.** Every EnvoyMesh-family product answered with the same body (`{"ok":true,"service":"envoymesh-home-ws",…}`), which made `200` mean "something is listening on the port" and nothing more. `WsServer.setHealthIdentity(fn)` now adds `app`/`ownerId`/`peerId` (lazily, and omitted entirely when unknown — a host with no identity must not look like a *named* node). The node publishes its owner id, which is what identifies the profile.

One implementation detail worth keeping: the identity closure is set where the WS server starts, and deliberately does **not** read `meshStarted` or `lastKnownLibp2pPeerId` — both are declared ~700 lines below, so a closure touching them would throw a temporal-dead-zone error on any `/health` arriving during startup. The owner id is what identity matching needs, so the peer id is simply not claimed.

**2. The CLI watchdog now requires that identity.** It treated **any** `200` as proof of life, so a different product holding :3030 would have kept a wedged node alive forever — the watchdog would never fire, and the user would see a frozen app with a healthy process. It is told the owner id and treats a foreign or identity-less reply as a failure (which is the truth: this process is then serving nobody). Verified in a live run: the watchdog logs `owner=envoy:owner:l3f2bO…`, and `/health` returns `"app":"EnvoyMesh","ownerId":"envoy:owner:l3f2bO4OOkkQzSZGlD8kv0LeCV0ncUymv3aoO_bis50"`.

**3. The desktop supervisor no longer kills by port alone.** `kill_stale_listeners_on_node_ports()` ran `lsof -ti :3030|3031|3032` and SIGTERM-then-SIGKILLed **whatever it found**, with no check of whose process it was — so launching EnvoyMesh could kill a second product's host. It now reads this profile's `node.json`, and kills a listener only when the descriptor names **that pid**; anything else is logged and left alone, as is the case where no descriptor exists at all. The same descriptor supplies the owner id for the liveness probe, so a foreign node on 3030 no longer satisfies the guardian while the supervised node is wedged.

The Rust side is compile-verified (`cargo check`) and unit-tested (`cargo test --bin envoymesh`, 17 passing, including two new cases: identity matching for same/other/absent owner, and the `home_dir_for_profile` rule mirrored from `homeForProfileDir`). What is *not* verified is the supervisor end to end — that needs a packaged desktop app.

**4. `reuse-host` no longer defaults to 3030.** It defaulted to EnvoyMesh's own port, so a second product starting with no `--port` either died with `EADDRINUSE` or — before the health-identity work — took the port and made EnvoyMesh's own liveness check believe its node was healthy. It now defaults to `0` and reports the port it bound, which it can already do.

**What S3 still owes:** attach itself — the token exchange plus a client that connects to a running node instead of starting a second one. Both halves now exist to build on: the endpoint descriptor on disk says where the node is, and `/health` says whose it is.

### S3 (third slice) ◐ — `resolveRunningNode`, and the probe gets a consumer (2026-09-13)

**Where it shows up for the user.** The node's own in-use message now distinguishes "EnvoyMesh is using this profile — close it" from "…it is not answering on port 3030 right now, so it may be shutting down", because a live claim that does not answer is a different situation and "close the app" is poor advice for it. Verified in a two-process run: node 2 probed node 1, matched the owner id, and used the first wording with **zero** unverified warnings; `/health` on node 1 reports `{"app":"EnvoyMesh","ownerId":"envoy:owner:YQ1zCno…","port":3030}`.

`probeNodeEndpoint` was written in the first slice and had no production caller. That is the shape of a helper that rots, so the node now uses it: `resolveRunningNode(home)` answers the question a second product actually has — *is a node running here, and is it the one the descriptor claims?*

| Status | Meaning |
|---|---|
| `none` | no claim on the home |
| `stale` | a claim whose process is gone |
| `unverified` | a live claim, but the endpoint would not prove it: no descriptor, nothing answering, no identity reported, or **a different node answering on that port** |
| `running` | verified: the endpoint answered `/health` naming the owner the descriptor claims — only then is `wsUrl` returned |

No authentication happens there, deliberately: the token comes from the pairing flow, which is the product's business. Discovery and verification are the shared part.

### S3 (fourth slice) — the apps-group invariants, and a security finding that gates attach (2026-09-13)


**The owner's rule:** every app in the group uses the same relay network, the same QR scanning and the same URI connecting. Checked against the tree, all three were already true — and that turned out to be the interesting part.

| Invariant | State |
|---|---|
| One relay roster | `packages/api/src/default-bootstrap.ts`, **one** declaration, `reusable` |
| One QR format | `protocol/src/pairing-contract.ts` (payload) + `api/src/envoy-pair-uri.ts` (codec) |
| One URI scheme | `envoy://pair` — builder and parser now in **the same module** |
| Reachable from a product's own surface | ✅ after this change: `@envoymesh/reuse-host` exports the roster, the codec and both URI directions |

Two real gaps closed:

1. **The builder was a second copy.** `reuse-host` built `envoy://pair?…` itself, next to the shared parser — working, tested (the interop test passed), and still a format fork waiting to happen. `buildEnvoyPairUri` now lives in `envoy-pair-uri.ts` beside `parseEnvoyPairUri`; `reuse-host` re-exports it, so no consumer changed.
2. **A product could not reach the roster from its own surface.** It had to know that the relay addresses live in `api/core` and the codec in `protocol`. Both are now exported by `@envoymesh/reuse-host`.

**And the invariants are now enforced, not just described**: `packages/reuse-host/test/apps-group-invariants.test.ts` reads the tree and asserts one builder, one parser definition, one roster declaration, and that the product-facing package exports them. Writing it caught my own over-reach: I first asserted that only one module may contain `startsWith("envoy://pair")`, which failed on the Social SPA — and the SPA is *right*: it classifies a scanned code and passes it through unchanged. **Recognising a format is not implementing it**, so the assertion now says exactly that, with the reasoning in the test.

**The finding that gates attach.** Probing the running node from the machine's LAN address with **no token**:

```
listFamilyProfiles → {"profiles":[{"id":"owner","name":"tsdq2OwmR8HX","isOwner":true,…
getNodeStatus      → {"status":"offline"}
```

A *wrong* token is refused (`UNAUTHORIZED`), so authentication works — but a tokenless client is served regardless of where it connects from, and the node binds `0.0.0.0` (deliberately, so paired phones can reach it). The transport documents the reason: *"Clients without any token (Social UI, Capacitor app) are legacy and unrestricted."* The Social UI is loopback-only, and **the Capacitor app named in that comment was deleted** (`apps/` is now cli, envoygo, node, relay, social, tauri; `packages/mobile-identity` survives only as the SPA's browser-safe identity). So the rationale is half-stale, and what it currently permits is any device on the network reading the owner's surface.

The fix is small and preserves every legitimate flow — require `loopback OR a valid session` for non-pre-auth methods, which the transport can decide because it knows the remote address (the session type does not currently expose it, so that is the reusable-layer part). It is **not** in this change: it alters a shipped product's authorisation behaviour, and it is the same decision attach depends on (below). Reported rather than taken.

**Why this gates attach.** Both come down to one question: *what may a caller who is not the owner do?* Attaching a second product means deciding whether it gets the owner's scope (as the tokenless Social UI does today) or a product scope of its own. Building the token exchange before that decision would hardcode the answer by accident.

### S3 (fifth slice) ✅ — the LAN exposure is closed (2026-09-13)

The owner's call on both questions: require **loopback or a valid session**, and give an attached product **a scope of its own**.

The transport now records whether a socket's peer is on this machine (`127.0.0.1`, `::1`, `::ffff:127.0.0.1`, `127.x`) and refuses everything else unless the caller authenticated. The predicate deliberately treats `0.0.0.0` and `::` as **not** local — those are bind addresses, and a real peer never has them, so accepting them would be a hole dressed as a convenience.

| Flow | Before | After |
|---|---|---|
| Owner's UI — loopback, no token | allowed | **allowed** (unchanged: the SPA connects to `ws://127.0.0.1:3030/ws` with no token) |
| Paired phone — any address, valid token | allowed | **allowed** (unchanged) |
| Pairing a new device — pre-auth method, no token, from the network | allowed | **allowed** |
| A device on the network — no token | **served the owner's data** | **`UNAUTHORIZED`** |
| Wrong token, any address | refused | refused (unchanged) |

Verified against the running node from the machine's LAN address — the same probe that exposed the hole:

```
1) loopback, no token  → {"profiles":[{"id":"owner","name":"TgWvaDfksR1k","isOwner":true,…}]}
2) LAN, no token       → {"error":{"code":"UNAUTHORIZED","message":"Authentication required"}}
3) LAN, wrong token    → {"error":{"code":"UNAUTHORIZED",…}}
4) LAN, pairThinClient → {"error":{"message":"pairingToken is required"}}   ← pre-auth path intact
```

`packages/host-connect/test/access-gate.test.ts` pins all four flows plus the predicate itself (7 tests). The non-loopback cases connect to this machine's own LAN address, so the server really does see a non-loopback peer — a test that only ever connects to `127.0.0.1` cannot fail for the right reason here. An escape hatch (`allowUnauthenticatedNonLoopback: true`) exists for a host that is *meant* to serve an open surface; nothing in this repo sets it.

**Recorded for the next slice:** an attached product gets `scopeKey: "product:<Name>"`, not the owner's scope — least privilege, no key sharing, and it extends the per-scope gating the node already performs (`mayFamilyProfileUseCoding`). This change is what makes that meaningful, because until now "not the owner" and "no token" were the same thing.

### S4 (first slice) ✅ — one app per pairing code, and a product's own allow-list (2026-09-13)

Three things the owner asked for, two of which were missing.

**1. A dedicated mobile app pairs only with its corresponding desktop app.** It could not before: nothing tied a pairing code to a product, so any EnvoyMesh-family phone app could pair with any desktop app. The code now carries the app that minted it:

| Layer | Change |
|---|---|
| `PairingPayload` / `PairWithHomeNodeParams` | `app?: string` — "which app made this code" |
| the compact codec (`pairing-token.ts`) | `app` travels inside the gzip token, and stays **absent** when it was never set |
| the URI (`envoy-pair-uri.ts`) | built and parsed with the rest |
| the node | its pairing payload claims `resolveAppName()` (`ENVOYMESH_APP_NAME`, default `EnvoyMesh`), and `pairThinClient` refuses another app's code |
| the rule | `pairingAppMismatch()` in `node-core`, returning an **end-user sentence**: *"That code was made by EnvoyCoder, and this is EnvoyMesh. Open EnvoyCoder and show its pairing code, or install EnvoyCoder here."* |

A code minted before the field existed is accepted: refusing it would break every QR already printed, and the phone still authenticates afterwards.

**2. A product is refused by default, not allowed by omission.** Owner-only enforcement is a deny-list, so a product scope was refused that list and allowed *everything else* — measured on a real node, a product session could call `getNodeStatus` and would have been allowed any other unlisted method too. `PRODUCT_ALLOWED_RPC_METHODS` now names what a product may do at all: diagnostics, plus the coding surface (each of which is *also* capability-gated, so the list is a boundary rather than a permission). Terminals stay owner-only — a product runs its own tooling in its own process. Where both gates cover a method, owner-only fires first.

**3. Coding is granted per product, by the owner.** `mayFamilyProfileUseCoding()` is family-profile policy and a product scope is not a family profile, so an attached EnvoyCoder was refused the surface it exists for. `NodeConfig.productGrants` — owner-set through the already owner-only `updateNodeConfig` — now answers for products, with **nothing** as the default and a fail-closed read. Example: `{ "EnvoyCoder": ["coding"] }`. Pinned by test: denied before the grant, allowed after, unaffected for a *different* product, revoked by an empty list.

### S4 (second slice) — the review, and five real defects (2026-09-13)

Reviewing the stretch rather than trusting it. Every one of these was found by checking a claim I had written down, and four of the five were in code I had just described as done.

**1. The app check I added was dead code that pretended otherwise.** A pairing token is **opaque** — `validatePairingToken` resolves it against *this node's* in-memory QR token, review token or invite — so `decodePairingToken(pairingToken)` always threw, `codeApp` was always `undefined`, and the "enforcement" ran nothing. Worse, the comment implied the node enforced per-app pairing, which it *cannot*: a token minted by another app's node does not validate here at all, and cross-app pairing arrives when someone **scans** the wrong code and the app dials the `wsUrl` inside it. The rule is therefore the **client's**, and it now lives in `@envoymesh/protocol` (`app-identity.ts`, browser-safe and dependency-free) so a web UI can apply it without pulling a node runtime into its bundle. The Social scanner refuses another app's code with the same sentence the node would use, and the server-side call is documented for what it actually covers.

**2. A product token could be laundered into an owner session.** `validatePairingToken` accepts **any** record in the session-token store, and product sessions live in that store — so an attached product could hand its own token to `pairThinClient` as a `pairingToken` and be minted a thin-client session bound to `getOwner()`. Proved with a test that *resolved* where it should have thrown, then refused at that call: a product token is not a pairing token.

**3. Terminal and agent-core streams were open to any authenticated non-owner.** `socketMethods` (`homeTerminalWsOpen`, `homeClawCoreWs*`) runs **before** the dispatcher, which is where the product allow-list lives — so an attached product, or a registered family session, could open a live terminal through the one path with no allow-list at all. `homeTerminalWsOpen`'s own implementation has no caller check either. The transport now requires the **owner's scope** for socket methods, which is the right layer: it uses the host's own vocabulary (`isOwnerScope`), not product names.

**4. The Social app could not build.** Vite's alias matches by **prefix**, and the SPA enumerates subpaths explicitly — `@envoymesh/api/core`, the reusable entry this refactor created, was never added. Every package bundled into the SPA that imports it (`rag` among them, 7 call sites) failed the build with `Could not load …/src/index.ts/core`. Fixed by adding the alias before the generic one; `vite build` now completes. **This is the `social-build` phase of the test orchestrator, so it was a green-CI red-product gap** — the unit suite never runs a bundle.

**5. A scanned code could put arbitrary text in a user's dialog.** The app-mismatch sentence embeds the name from the code, which is untrusted input on its way to a screen someone is being asked to trust. Labels are now stripped of control characters and capped at 40 characters with an ellipsis.

Also corrected: the note that "terminals stay owner-only" was wrong when written — they were owner-only for *RPC* names (the `terminal*` prefix) but not for the socket-method path, which is defect 3.

Verified after all five: `tsc -b` 0 errors; **`vite build` completes** for the Social app; suite 977 files (972 passed, 5 skipped), 9,100 tests, 0 failed; manifest 815 modules (563 reusable); boundary rules 1–6; wiring R1–R6; core-surface `--check`; inventory 48 stores 0 ungated.

### S3 (sixth slice) ✅ — attach works, and it found a transport bug (2026-09-13)

The exchange, end to end: a second app on this machine asks the running node for a session of its own.

| Piece | Where | What it does |
|---|---|---|
| The convention | `node-core/src/product-attach.ts` | the method name and `product:<Name>` scope encoding, in one place so client and node cannot disagree |
| The gate | `host-connect` `loopbackOnlyMethods` | a method that hands out a session is refused from the network **before the handler runs** |
| The node | `attachLocalProduct` (+ `session-token-store`'s `product` field, `sessionCallerFromToken`) | mints a token against the product, never a family profile |
| The exchange | `host-connect/src/attach-client.ts`, re-exported by `reuse-host` | one request over loopback, one session back, ready to dial |

**Verified against a real node**, which is where the value shows:

```
resolveRunningNode      → running  ws://127.0.0.1:3030/ws
LAN attach attempt      → {"code":"UNAUTHORIZED","message":"This can only be done from the machine running the node"}
grant                   → scopeKey "product:EnvoyCoder", ownerId envoy:owner:8fIvWQay…, token 36 chars
product session → getNodeStatus    → OK
product session → updateNodeConfig → ERROR owner-only: Only the node owner can call updateNodeConfig
stored record           → product "EnvoyCoder", deviceId "product:EnvoyCoder", no profileId, no family binding
```

That last line is the whole design in one result: a product attaches, works, and **cannot touch an owner-only RPC** — least privilege by construction, not by good intentions. `apps/node/test/product-attach.test.ts` (7 tests) pins the scope, the ownership refusal, token replacement and per-product isolation; `host-connect/test/attach-client.test.ts` (6) pins the exchange and both gates, including a raw socket to this machine's LAN address for the refusal.

**And verifying it found a real transport bug.** The first attach worked, but *using* the session timed out. I assumed my probe was at fault — it wasn't. `handleConnection` attached its `message` listener **after** awaiting `resolveSession`, and `ws` is an EventEmitter: a frame that arrives during that await is emitted with no listener attached and **silently dropped**. A client that sends on `open` loses its first request and hangs. It only showed up because the attach path makes `resolveSession` do real work (a token-store read) rather than hitting a warm cache — under a fast resolver the window is too small to hit. Fixed by attaching the listener before the await, queueing anything that arrives before the dispatcher is installed, and awaiting the auth state inside the dispatcher. The regression test makes the resolver deliberately slow so the race is deterministic; before the fix it fails on the timeout, after it passes at ~305 ms.

**A known gap, pinned rather than hidden.** Owner-only enforcement is a *deny-list* (`OWNER_ONLY_RPC_METHODS` plus the `terminal*` prefix), so a product session is refused everything on that list and **allowed everything else** — `getNodeStatus` is the proof in the run above. That is not least privilege; the honest follow-up is a product **allow-list** (what a product *may* call) rather than relying on the deny-list's coverage. A test asserts today's behaviour so the next slice has to change it deliberately.

**One more thing the scope does not solve:** `mayFamilyProfileUseCoding()` is family-profile policy, and a product scope is not a family profile — so an attached EnvoyCoder would be refused the `coding`-gated RPCs it exists for. Wiring per-product capability grants (which product may use which capability) is the next slice, and it is policy the product owns, not the transport.

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
