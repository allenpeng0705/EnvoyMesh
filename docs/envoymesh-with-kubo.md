# Running EnvoyMesh with Kubo (IPFS)

**Audience:** operators, desktop packagers, and developers enabling optional IPFS export.

**Related:** [external-distribution-ipfs-plan](./external-distribution-ipfs-plan.md) (design) · [developer-cli](./developer-cli.md) (`vault-ipfs-fingerprint`) · [p2p-file-sharing-plan](./p2p-file-sharing-plan.md) (Library / discovery)

---

## 1. Summary

EnvoyMesh **does not embed an IPFS node** in TypeScript. For vault → IPFS CIDs, the **desktop node** shells out to the **Kubo CLI** (`ipfs`, written in Go):

```
EnvoyMesh (TypeScript / Node)  ──spawn──►  ipfs add …  ──►  Kubo daemon (Go)
     │                                           │
     │  policy, audit, vault, bonds              │  UnixFS DAG + CID
     └─ published-external.json, discovery cid ───┘
```

This is **intentional**: canonical CIDs must match what **IPFS Desktop**, **gateways**, and **pinning services** expect from `ipfs add` — not a separate Envoy-only hash.

**You need Kubo for export** unless the desktop bundle includes the sidecar (`resources/kubo/ipfs`) or `ipfs` is on PATH. The node **starts the daemon automatically** on first export (Option C). Gateway verify and CID display do **not** require Kubo.

---

## 2. Two runtimes, one workflow

| Component | Language | Role in IPFS track |
|-----------|----------|-------------------|
| **EnvoyMesh node** (`apps/node`) | TypeScript (Node.js) | Policy gate, vault read, spawn `ipfs add`, persist CID, audit, discovery metadata |
| **Kubo** | Go | UnixFS import, local IPFS repo, DHT/pinning (if daemon running) |
| **EnvoyMesh Social / Tauri** | Rust shell + web UI | Settings toggles, Library Export, gateway verify RPC |
| **Mobile** | TypeScript (Capacitor) | **No Kubo** — display CIDs from discovery only |

EnvoyMesh and Kubo communicate via:

- **`ENVOYMESH_IPFS_EXE`** — path to the `ipfs` binary (Tauri sidecar or `ipfs` on PATH).
- **`ENVOYMESH_IPFS_PATH`** — isolated Kubo repo (default `{profile}/ipfs-kubo`; not `~/.ipfs`).
- **Managed daemon** — the node starts `ipfs daemon` on first export ([§3](#3-how-to-use-kubo-by-runtime) · [§9.3](#93-option-c--envoy-managed-kubo-daemon)).
- **Fixed CLI recipe** — see [§5](#5-interop-recipe-frozen-in-code).
- **Optional HTTP** — gateway verify uses `fetch()` to allowlisted gateways (no Kubo required).

There is **no in-process Go↔TypeScript FFI**. Kubo stays a subprocess; packaging and lifecycle are handled by the node ([§9](#9-packaging-envoymesh--kubo-together)).

---

## 3. How to use Kubo by runtime

The **Social UI never runs Kubo directly** — whether you open it in a **browser** or inside **Tauri**, IPFS export always happens in the **Node.js node process** (`apps/node`). The UI only sends RPC (`exportLibraryItemToIpfs`).

| Runtime | Where Kubo runs | User runs `ipfs init` / `ipfs daemon`? |
|---------|-----------------|----------------------------------------|
| **Tauri desktop app** | Bundled sidecar + managed engine | **No** (automatic) |
| **Social in browser** | System Kubo on PATH + managed engine | **No** (automatic repo + daemon) |
| **Mobile / in-browser node** | Not supported | N/A — use desktop for export |

---

### 3.1 Tauri desktop app (recommended for end users)

**Architecture:**

```text
┌──────────────────────────────────────────────────────────────┐
│  Tauri window (Social UI)                                     │
│       WebSocket RPC → localhost:3030                          │
└───────────────────────────┬──────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────┐
│  EnvoyMesh node (spawned by Tauri)                            │
│  ENVOYMESH_PROFILE → app data/profile                         │
│  ENVOYMESH_IPFS_EXE → bundled resources/kubo/ipfs             │
│  ENVOYMESH_IPFS_PATH → profile/ipfs-kubo                      │
│  • kubo-ipfs-engine: init repo + start daemon on first export │
└───────────────────────────┬──────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────┐
│  Kubo sidecar (Go binary in app bundle)                       │
└──────────────────────────────────────────────────────────────┘
```

**Build / packager steps (once per release):**

1. Fetch the Kubo sidecar for your platform:

   ```bash
   ./scripts/fetch-kubo-sidecar.sh          # default Kubo 0.32.1
   ./scripts/fetch-kubo-sidecar.sh 0.32.1   # pin a version
   ```

   This installs `apps/tauri/resources/kubo/ipfs` (macOS/Linux). On Windows, copy `ipfs.exe` from a [Kubo release](https://github.com/ipfs/kubo/releases) into `apps/tauri/resources/kubo/ipfs.exe`.

2. Build the node, Social UI, and Tauri app as usual (see [packaging.md](./packaging.md)).

Tauri bundles `resources/kubo/**` and, at startup, sets on the node child process:

- `ENVOYMESH_IPFS_EXE` — bundled binary when present
- `ENVOYMESH_IPFS_PATH` — `{app_data}/profile/ipfs-kubo`

**End-user steps (no terminal, no separate Kubo install):**

1. Open the **EnvoyMesh** desktop app.
2. **Settings → Node → External distribution** — turn on **Allow IPFS export**.
   - Check **IPFS engine**: should show *Available — starts automatically when you export* (or *Ready* after first export).
3. **Library** — click **Export** on a vault file.
   - First export initializes the local IPFS repo and starts the managed daemon (may take a few seconds).
4. Optional: add gateway URLs and use **Verify gateway**; toggle **Published** so bonded peers can see the CID in discovery.

You do **not** need IPFS Desktop, `ipfs init`, or a separate `ipfs daemon` terminal.

---

### 3.2 Social app in browser + Node.js (dev / power users)

**Architecture:**

```text
┌──────────────────────────────────────────────────────────────┐
│  Browser tab (Social UI — Vite dev or static build)            │
│       WebSocket RPC → ws://localhost:3030/ws                  │
└───────────────────────────┬──────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────┐
│  EnvoyMesh node (separate terminal — apps/node)               │
│  ENVOYMESH_PROFILE → ./data/default (or --profile)             │
│  ENVOYMESH_IPFS_EXE → unset → `ipfs` on PATH                  │
│  ENVOYMESH_IPFS_PATH → {profile}/ipfs-kubo                    │
│  • kubo-ipfs-engine: init repo + start daemon on first export │
└───────────────────────────┬──────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────┐
│  Kubo on PATH (install once) or ENVOYMESH_IPFS_EXE override   │
└──────────────────────────────────────────────────────────────┘
```

**Setup (one time):**

1. Install Kubo so the **same shell that runs the node** can execute `ipfs`:

   ```bash
   ipfs version -n   # must succeed in the terminal you use for node:dev
   ```

   Download from [github.com/ipfs/kubo/releases](https://github.com/ipfs/kubo/releases) or use IPFS Desktop (if `ipfs` is on PATH).

   Optional: point at a specific binary instead of PATH:

   ```bash
   export ENVOYMESH_IPFS_EXE=/path/to/ipfs
   ```

2. Install dependencies and start **both** processes:

   ```bash
   npm install

   # Terminal 1 — node (this process uses Kubo, not the browser)
   npm run node:dev

   # Terminal 2 — Social UI in browser
   npm run dev -w @envoymesh/social
   ```

3. Open the URL Vite prints (typically `http://localhost:5173`). The UI connects to the node WebSocket on port **3030**.

**Using IPFS export:**

1. In the browser UI: **Settings → Node → External distribution** → enable **Allow IPFS export**.
2. **Library → Export** on a file.

   The **node** (terminal 1), not the browser:

   - Creates `{profile}/ipfs-kubo` if needed (`ipfs init` via managed engine)
   - Starts `ipfs daemon` on port **5017** (default) if not already up
   - Runs `ipfs add` for the vault file and stores the CID

You do **not** need to run `ipfs init` or `ipfs daemon` manually unless you prefer your own `~/.ipfs` setup — EnvoyMesh uses an **isolated repo** under the profile by default.

**Optional env vars (node process only):**

| Variable | Default | Purpose |
|----------|---------|---------|
| `ENVOYMESH_IPFS_EXE` | `ipfs` on PATH | Kubo binary path |
| `ENVOYMESH_IPFS_PATH` | `{ENVOYMESH_PROFILE}/ipfs-kubo` | Isolated repo (not `~/.ipfs`) |
| `ENVOYMESH_IPFS_API_PORT` | `5017` | API port (avoids IPFS Desktop on 5001) |

**Verify from CLI (same managed engine):**

```bash
npm run cli -w @envoymesh/node -- vault-ipfs-fingerprint \
  --profile ./data/default --vault ./shared_vault --relative-path notes/export.md
```

---

### 3.3 Mobile and in-browser node (no Kubo)

**Capacitor mobile** and **MobileNode in a WebView** run the node inside JavaScript — there is no `child_process`, so **no Kubo export**.

- UI hides Export / Verify on mobile; Settings shows a read-only note.
- Use **Discover** to view/copy CIDs that bonded peers published from their **desktop** node.
- Export vault files from your **home Tauri or browser+node** setup.

---

## 4. Prerequisites (platforms)

### 4.1 Platforms

| OS | Tauri desktop | Browser + node:dev | Kubo source |
|----|---------------|-------------------|-------------|
| **macOS** | Tauri app + bundled sidecar | Browser UI + `node:dev` | Sidecar or [Kubo release](https://github.com/ipfs/kubo/releases) on PATH |
| **Linux** | Same | Same | Same |
| **Windows** | Same (`ipfs.exe` in bundle) | Same | Same |

Mobile (iOS/Android) does **not** run Kubo; use a **home desktop node** for export.

### 4.2 Manual Kubo (optional — not required for managed engine)

Power users may still use a global `~/.ipfs` repo with IPFS Desktop. EnvoyMesh **defaults to an isolated repo** under the profile so it does not touch `~/.ipfs` unless you set:

```bash
export ENVOYMESH_IPFS_PATH=$HOME/.ipfs
```

If you use **only** EnvoyMesh’s managed engine, skip manual steps. To confirm Kubo is visible to the node:

```bash
ipfs version -n
```

---

## 5. Interop recipe (frozen in code)

Canonical export uses **recipe id** `kubo-ipfs-export-v1` in `apps/node/src/kubo-ipfs-export.ts`:

```text
ipfs add --cid-version 1 --pin=false -Q <absoluteFilePath>
```

- **`--cid-version 1`** — CIDv1 / modern interop.
- **`--pin=false`** — Envoy records the CID; pinning is an explicit operator choice (Kubo, Pinata, etc.).
- **`-Q`** — quiet root CID on stdout.

Every successful export stores **`kuboVersion`** (`ipfs version -n`) and **`ipfsInteropRecipe`** on audit rows and in `published-external.json`.

**Developer CLI fingerprint** (same recipe):

```bash
npm run cli -w @envoymesh/node -- vault-ipfs-fingerprint \
  --vault ./shared_vault --relative-path notes/export.md
```

Integration tests with a real Kubo (optional):

```bash
ENVOYMESH_IPFS_CLI_TEST=1 npx vitest run apps/node/test/developer-cli.test.ts
```

---

## 6. Enable IPFS in the UI

All steps are **opt-in** (default off). Same flow in **browser** and **Tauri** — only the node backend differs ([§3](#3-how-to-use-kubo-by-runtime)).

### 6.1 Policy (Settings → Node → External distribution)

1. **Allow IPFS export** — sets `externalPublish.allowIpfs` in `node-config.json`.
2. **IPFS engine** — status line (desktop only): *Available*, *Ready*, or error hint from `getIpfsEngineStatus`.
3. **Gateway allowlist** (optional) — one HTTPS base URL per line, e.g. `https://ipfs.io`. Required for **Verify gateway** in Library.

### 6.2 Export a vault file (Library)

1. Open **Library**.
2. **Export** / **Re-export** on a row.
3. On first export, the node starts the managed Kubo daemon if needed ([§9.3](#93-option-c--envoy-managed-kubo-daemon)).
4. On success, CID is stored in `published-external.json` under the profile dir and shown in the UI.

Audit events: `vault.ipfs_export.started|completed|failed`.

### 6.3 Publish metadata to bonded peers (optional)

1. Toggle **Published** on the library row (`published-library.json`).
2. Peers using **Discover → Published files** may see metadata; if export hash matches vault bytes, **`cid`** is included (F3).

### 6.4 Verify via gateway (no Kubo)

1. Configure gateway allowlist (above).
2. Library → **Verify gateway** — node HTTP-fetches `{gateway}/ipfs/{cid}` and compares SHA-256 to vault `contentHash`.

Audit: `vault.ipfs_gateway_verify.*`.

### 6.5 Agent tools (bridge)

When HomeClaw/OpenClaw bridge is enabled:

- `mesh.library_export_ipfs` — requires owner approval.
- `mesh.library_verify_ipfs_gateway` — allowlisted HTTP verify.

---

## 7. Process layout (reference)

**Tauri (bundled Kubo + managed repo):**

```text
App data/profile/
├── node-config.json
├── published-external.json
└── ipfs-kubo/              ← ENVOYMESH_IPFS_PATH (isolated Kubo repo)
```

**Browser dev (`./data/default` profile):**

```text
./data/default/
├── published-external.json
└── ipfs-kubo/              ← same layout; Kubo from PATH
```

EnvoyMesh profile data and Kubo repo live **under the same profile tree** by default. They are **not** merged into `~/.ipfs` unless you override `ENVOYMESH_IPFS_PATH`.

---

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| **Browser UI:** Export fails / WebSocket error | Node not running | Start `npm run node:dev`; confirm port 3030 |
| **Browser UI:** “IPFS engine is not available” | Kubo not on PATH for **node** process | Install Kubo; run `ipfs version -n` in the **same terminal** as `node:dev`, or set `ENVOYMESH_IPFS_EXE` before starting node |
| **Tauri:** “IPFS engine is not available” | Sidecar missing from bundle | Run `./scripts/fetch-kubo-sidecar.sh` before Tauri build; rebuild app |
| `IPFS engine did not start in time` | Daemon failed or port busy | Retry export; set `ENVOYMESH_IPFS_API_PORT` if 5017 is taken |
| Export disabled error | Policy off | Settings → Allow IPFS export |
| Verify gateway: no allowlist | Empty `gatewayAllowlist` | Add `https://…` bases in Settings |
| CID on discovery missing | Stale export or file changed | Re-export; discovery only sends `cid` when export `contentHash` matches current vault bytes |
| Windows path issues | Rare; uses Node `path.resolve` + absolute path to Kubo | Test `vault-ipfs-fingerprint --file C:\…` from CLI |

---

## 9. Packaging EnvoyMesh + Kubo together

Tauri can bundle the Kubo sidecar (Option B); the node manages the daemon (Option C). **Browser Social always requires a separate Node.js process** — Kubo is never loaded in the browser tab.

Release CI (`tauri-release.yml`) builds EnvoyMesh (Social + spawned Node). **Run `fetch-kubo-sidecar.sh` before release builds** to include Kubo in the installer.

The **Go vs TypeScript split** is stable at runtime (subprocess + HTTP). Packaging covers version skew, PATH, and installer size.

### 9.1 Option A — Separate Kubo install (browser + node:dev)

**How:** Install Kubo on PATH for the machine running `npm run node:dev`. Managed engine handles repo + daemon ([§3.2](#32-social-app-in-browser--nodejs-dev--power-users)).

| Pros | Cons |
|------|------|
| No sidecar in repo; Kubo upgrades independent | Two terminals (node + Vite); PATH must work for node process |
| Works with IPFS Desktop if `ipfs` is on PATH | macOS GUI PATH issues do not apply (node runs from your shell) |

**Recommendation:** Default for **local development** with Social in browser.

### 9.2 Option B — Sidecar binary in Tauri bundle

**How:** Ship a **pinned Kubo binary** next to the app (e.g. `resources/kubo/ipfs` or `ipfs.exe`). Tauri sets **`ENVOYMESH_IPFS_EXE`** on the node child when the sidecar exists.

| Pros | Cons |
|------|------|
| One installer; known Kubo version matches CI golden tests | +30–50MB per platform; three binaries to build/cache |
| Reproducible CIDs across Envoy versions | Security updates require Envoy redeploy |
| Works when system PATH is empty (common on Windows/macOS GUI) | Must respect Kubo license (MIT/Apache — verify release notes) |

**Recommendation:** Best path for **Tauri end users** — no separate Kubo install ([§3.1](#31-tauri-desktop-app-recommended-for-end-users)).

**Implementation (shipped):**

1. `./scripts/fetch-kubo-sidecar.sh` → `apps/tauri/resources/kubo/ipfs`
2. Tauri bundle includes `resources/kubo/**` and sets `ENVOYMESH_IPFS_EXE` on the node child when present
3. `kubo-ipfs-cli.ts` resolves `ENVOYMESH_IPFS_EXE` (fallback: `ipfs` on PATH)

### 9.3 Option C — Envoy-managed Kubo daemon

**Status:** **Shipped** in `apps/node/src/kubo-ipfs-engine.ts`.

**How:** Node **spawns `ipfs daemon` lazily** on first export; repo at `{profile}/ipfs-kubo` or `ENVOYMESH_IPFS_PATH`; API port **5017** default (`ENVOYMESH_IPFS_API_PORT` to override).

| Pros | Cons |
|------|------|
| User never runs `ipfs daemon` manually | Daemon runs while node is up after first export |
| Isolated repo (not `~/.ipfs`) | Port 5017 conflict if already taken |

**Recommendation:** Shipped for **both Tauri and browser+node**; Settings → Node shows **IPFS engine** status via `getIpfsEngineStatus`.

### 9.4 Option D — Coexist with IPFS Desktop

**How:** Document “install IPFS Desktop” instead of raw Kubo; Envoy calls the same `ipfs` CLI.

| Pros | Cons |
|------|------|
| Familiar UX for IPFS users | Desktop must be running; shared `~/.ipfs` |
| No duplicate repo if user already uses IPFS | Enterprise users may forbid Desktop |

**Recommendation:** Supported if `ipfs` on PATH; EnvoyMesh still prefers `{profile}/ipfs-kubo` unless you set `ENVOYMESH_IPFS_PATH`.

### 9.5 Option E — Embedded TypeScript IPFS (Helia / UnixFS) — backlog

**How:** Implement UnixFS import in TypeScript; drop Kubo CLI dependency.

| Pros | Cons |
|------|------|
| Single language artifact; easier mobile story long-term | **CID parity risk** vs Kubo recipe |
| No Go binary in bundle | Large JS dependency tree; still need parity CI |

**Recommendation:** Only after **golden-vector CI** proves identical CIDs to `kubo-ipfs-export-v1` on fixture files. See [helia-ipfs-integration-plan](./helia-ipfs-integration-plan.md) — Helia runs **alongside** Kubo; owners **switch engines** in Settings (default stays Kubo).

---

## 10. Packaging decision matrix

| Goal | Suggested approach |
|------|-------------------|
| **Social in browser (dev)** | [§3.2](#32-social-app-in-browser--nodejs-dev--power-users) — Kubo on PATH + managed engine |
| **Tauri desktop “it just works”** | [§3.1](#31-tauri-desktop-app-recommended-for-end-users) — Option B + C |
| **Minimal installer, IPFS rare** | Option A — document Kubo install for node only |
| **No Go in fleet (future)** | Option E (Helia) — backlog |
| **Mobile / in-browser node** | No Kubo; export on home desktop ([§3.3](#33-mobile-and-in-browser-node-no-kubo)) |

---

## 11. Versioning and CI

- Record **`kuboVersion`** on every export for forensic parity.
- When bundling Kubo (Option B), **pin Kubo semver** in release notes and run `ENVOYMESH_IPFS_CLI_TEST=1` in release CI for that pinned binary.
- Envoy **libp2p** stack (`@envoymesh/network`) is **separate** from Kubo’s libp2p — they do not share a swarm connection unless you explicitly bridge workflows (not required for `ipfs add` export).

---

## 12. Security notes

- **CID ≠ permission** — publishing a CID does not grant vault access; bonds and mandates still gate P2P bytes.
- **Default deny** — `allowIpfs: false` until owner enables in Settings.
- **Gateways are untrusted** — verify compares bytes to local vault hash; treat mismatch as attack or stale cache.
- **Do not commit pinning API secrets** — future pinning integrations must stay out of audit logs (see IPFS plan §8).

---

## 13. Quick reference

| Task | Kubo required? | Where it runs |
|------|----------------|---------------|
| **Tauri** → Library → Export | Yes (bundled sidecar) | Node child spawned by Tauri |
| **Browser** → Library → Export | Yes (on PATH for node) | `npm run node:dev` process — **not** the browser |
| `vault-ipfs-fingerprint` CLI | Yes | Same node / shell as CLI |
| Library → Verify gateway | No (HTTP only) | Node |
| Discover → Published files (CID display) | No | Any client |
| Mobile app | No export | N/A |

**Implementation:** `kubo-ipfs-cli.ts`, `kubo-ipfs-engine.ts`, `kubo-ipfs-export.ts` (`KUBO_EXPORT_ADD_CLI_ARGS_V1`, `IPFSInteropRecipeV1Id`).
