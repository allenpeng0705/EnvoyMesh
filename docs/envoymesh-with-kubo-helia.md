# Running EnvoyMesh with Kubo and Helia (IPFS)

**Audience:** operators, desktop packagers, and developers enabling optional IPFS export.

**Related:** [external-distribution-ipfs-plan](./external-distribution-ipfs-plan.md) (design) · [helia-ipfs-integration-plan](./helia-ipfs-integration-plan.md) (Helia rollout) · [developer-cli](./developer-cli.md) (`vault-ipfs-fingerprint`) · [p2p-file-sharing-plan](./p2p-file-sharing-plan.md) (Library / discovery)

---

## 1. Summary

EnvoyMesh supports **two IPFS export engines** for vault → UnixFS CIDs:

| Engine | Where it runs | Kubo required? |
|--------|---------------|----------------|
| **Kubo** (default desktop) | Subprocess: `ipfs add …` → Kubo daemon (Go) | Yes (sidecar or PATH) |
| **Helia** (in-process) | `@helia/unixfs` inside Node.js or Capacitor WebView | **No** |

```
Desktop (Kubo)     EnvoyMesh (TS)  ──spawn──►  ipfs add …  ──►  Kubo daemon (Go)
Desktop / Mobile   EnvoyMesh (TS)  ──in-proc──►  @helia/unixfs  ──►  CID (same recipe)
     │                                           │
     │  policy, audit, vault, bonds              │  UnixFS DAG + CID
     └─ published-external.json, discovery cid ───┘
```

This dual-engine design is **intentional**: canonical CIDs must match what **IPFS Desktop**, **gateways**, and **pinning services** expect from `ipfs add` — not a separate Envoy-only hash. **Helia** uses the same frozen interop recipe (`kubo-ipfs-export-v1`) validated by CI parity tests.

**You need Kubo** when the export engine is **Kubo** or **Kubo + Helia shadow**. With **Helia (in-process)** selected, export runs entirely in the Node/WebView process and **does not require Kubo**. Gateway verify and CID display do **not** require Kubo on any platform.

For **user stories and when to pick each engine**, see [§1.2–§1.4](#12-what-problem-ipfs-export-solves).

---

## 1.1 Export engine switching (Kubo + Helia dual-engine)

**Settings → Node → External distribution → Export engine** selects which engine produces the canonical `publishedExternal.cid`:

| Engine | Canonical CID from | Kubo required? |
|--------|-------------------|----------------|
| **Kubo** (default) | `ipfs add` subprocess | Yes (sidecar or PATH) |
| **Kubo + Helia shadow** | Kubo; Helia runs after for parity audit | Yes |
| **Helia (in-process)** | `@helia/unixfs` in the node | **No** |

Switching engines takes effect on the **next Export** — existing stored CIDs are unchanged until you re-export.

**Mobile:** Helia only (no Kubo). **Desktop:** all three options after parity CI (H3) and Helia primary enablement (H6).

**Slim Tauri build (no Kubo bundle):** for Helia-only deployments, build without the sidecar:

```bash
npm run build:slim -w @envoymesh/tauri
# uses apps/tauri/src-tauri/tauri.conf.slim.json (empty bundle resources)
```

CI: run the **tauri-release** workflow manually with **Also build Helia-only slim bundles** enabled to upload `*-bundle-slim` artifacts alongside the default Kubo-inclusive builds.

---

## 1.2 What problem IPFS export solves

EnvoyMesh’s **primary** way to move files is still **bond-scoped sharing**: `share.request` → `share.preview` → `share.accept`, then a **signed voucher + chunked stream** on `/envoymesh/data/0.1.0`. That path is private, consent-based, and auditable — see [User stories — Scenario 5](./UserStory.md#scenario-5--intent-based-file-and-data-sharing).

**IPFS export is an optional second layer** on top of your local vault. After you explicitly click **Export** in Library, EnvoyMesh computes a **CID** (content identifier) for that file using standard **UnixFS** rules — the same kind of hash tree that Kubo, IPFS Desktop, public gateways, and pinning services understand.

What a CID gives you that raw P2P bytes alone do not:

| Capability | What it means in practice |
|------------|---------------------------|
| **Stable public reference** | “This exact file version” has one global ID (`bafy…`) you can copy, bookmark, or paste into tools. |
| **Integrity check** | Anyone who fetches by CID can verify the bytes match the hash tree — tampering is detectable. |
| **Interop outside EnvoyMesh** | Recipients can use `ipfs cat`, gateways, or pinning APIs without running EnvoyMesh. |
| **Discovery metadata** | Bonded peers can see a **CID in Discover → Published files** when you toggle **Published** (metadata only — not automatic wide broadcast). |

**Important:** A CID is **not permission**. Publishing or exporting does not bypass bonds, mandates, or vault policy. It only names **which bytes** you chose to export.

---

## 1.3 User scenarios

These stories map to shipped features (Library, Discover, Settings) and show where **Kubo** vs **Helia** matters.

### Scenario A — “Send a contract to one bonded contact” (P2P first)

**Story:** Alex keeps `contracts/q3-msa.pdf` in the vault and wants **only** their lawyer (a direct bond) to receive it.

**Flow:**

1. Alex opens **Library → Share…**, picks the contact, negotiates via `share.preview` / `share.accept`.
2. Bytes move over **encrypted P2P** with a **signed data-transfer voucher** (`/envoymesh/data`).
3. **IPFS export is not required** for this story.

**Kubo / Helia role:** None for delivery. Optional: Alex could **also** Export to IPFS if they later want a CID for archiving — engine choice affects **how** the CID is produced, not **who** can read the P2P stream.

---

### Scenario B — “Give my study group a linkable copy of lecture notes”

**Story:** Jordan exports `notes/lecture-04.md` and toggles **Published** so bonded classmates see it under **Discover → Published files**.

**Flow:**

1. **Settings → Node → External distribution** — enable **Allow IPFS export**.
2. **Library → Export** on the file → CID stored in `published-external.json`.
3. Toggle **Published** on the row → peers running Discover see filename, size, content hash, and **CID** (when export hash still matches vault bytes).

**Kubo / Helia role:** Both engines produce a **Kubo-compatible UnixFS root CID** (same recipe, CI parity). Jordan on **desktop** might use **Kubo** (default, matches `ipfs add` in terminal) or **Helia** (no daemon). Classmates only see the CID in discovery — they fetch via their own tools or ask Jordan over chat.

**Why export helps:** Discovery carries a **verifiable pointer** (`bafy…`) peers can resolve independently of a live P2P session, while still staying within **bond-scoped metadata** (not a public DHT dump of the vault).

---

### Scenario C — “Check that ipfs.io still serves the same bytes I exported”

**Story:** Sam exported a research dataset last month and wants confidence a public gateway has not served stale or swapped content.

**Flow:**

1. Sam adds `https://ipfs.io` to **Settings → Gateway allowlist**.
2. **Library → Verify gateway** on the row → desktop node HTTP-fetches `{gateway}/ipfs/{cid}` and compares SHA-256 to the vault file’s `contentHash`.
3. Audit logs record allow/deny.

**Kubo / Helia role:** **Neither required for verify** — only HTTP + local vault hash. Kubo/Helia were needed only at **Export** time to mint the CID.

---

### Scenario D — “Pin this CID with Pinata for my portfolio site”

**Story:** Riley exports `portfolio/demo reel.mp4`, gets CID `bafybei…`, and pins it with a hosting provider so a static site can embed `https://gateway.pinata.cloud/ipfs/bafybei…`.

**Flow:**

1. **Library → Export** (desktop: Kubo or Helia engine).
2. Copy CID from Library or `published-external.json`.
3. Paste into Pinata (or NFT.Storage, etc.) — providers expect **standard UnixFS CIDs** from Kubo-style `add`.

**Kubo / Helia role:**

- **Kubo (default):** CID is literally the output of `ipfs add` — drop-in for any Kubo-era tooling and docs.
- **Helia:** Same CID **when parity CI passes** — useful if Riley uses **slim Tauri** or **Helia engine** without installing Go/Kubo locally.

EnvoyMesh does **not** upload to Pinata for you in v1; it gives you a **correct CID** to pin elsewhere.

---

### Scenario E — “Export a photo from my phone without a desktop Kubo install”

**Story:** Morgan captures `photos/site-visit.jpg` on the **Capacitor mobile app** (full mesh node in the WebView) and wants a CID for a field report.

**Flow:**

1. Mobile **Settings → Allow IPFS export** (Helia is the only engine on mobile).
2. **Library → Export** → Helia runs **in-process** in MobileNode (no `child_process`, no Go binary).
3. CID is stored locally; Morgan can paste it into chat or sync metadata when paired with home node.

**Kubo / Helia role:** **Helia only** on mobile — Kubo cannot run inside iOS/Android WebView constraints. Home **desktop** can still **Verify gateway** or re-export the same file with Kubo for ops comparison.

---

### Scenario F — “Ops team standardizes on `ipfs add` receipts”

**Story:** A small org wants export audit rows to include **`kuboVersion`** and a CLI recipe id for compliance, and developers run `vault-ipfs-fingerprint` in CI.

**Flow:**

1. Desktop export engine = **Kubo** (or **Kubo + Helia shadow**).
2. Every export audit event records engine, recipe id (`kubo-ipfs-export-v1`), and version string.
3. **Shadow mode:** Kubo produces the canonical CID; Helia runs immediately after and logs **parity match/mismatch** without changing the stored CID.

**Kubo / Helia role:**

- **Kubo:** Source of truth aligned with shell `ipfs add` and golden tests.
- **Helia shadow:** Safety net proving the in-process path still matches Kubo before switching primary engine to Helia org-wide.

---

## 1.4 Kubo vs Helia — when to choose which

Both engines answer: *“What is the standard IPFS CID for this vault file?”* They differ in **runtime**, **packaging**, and **operator workflow** — not in EnvoyMesh policy or discovery semantics.

| Choose **Kubo** when… | Choose **Helia** when… |
|------------------------|-------------------------|
| You want the CID to come straight from **`ipfs add`** (shell scripts, IPFS Desktop users, compliance receipts). | You want **no Go binary** (slim Tauri build, locked-down laptops, mobile). |
| You already run **IPFS Desktop** or a fleet Kubo daemon. | You develop **browser + node** locally and don’t want Kubo on PATH. |
| You use **Kubo + Helia shadow** to audit parity before migrating. | You ship **Capacitor mobile** export (Helia is the only option). |
| You may use Kubo’s **local repo / pinning / DHT** alongside export (optional; Envoy uses an isolated `{profile}/ipfs-kubo` repo by default). | First export should be **fast** — no daemon startup wait. |

**What neither engine replaces:**

- **Private delivery to a contact** → still `/envoymesh/data` + vouchers after share accept.
- **Access control** → bonds, mandates, Settings policy (`allowIpfs` default off).
- **Automatic cloud upload** → you pin or gateway-fetch explicitly.

```text
                    ┌─────────────────────────────────────┐
                    │  Owner action: Library → Export       │
                    └─────────────────┬───────────────────┘
                                      │
              ┌───────────────────────┴───────────────────────┐
              ▼                                               ▼
     ┌─────────────────┐                           ┌─────────────────┐
     │ Kubo engine     │                           │ Helia engine    │
     │ ipfs add (Go)   │                           │ @helia/unixfs   │
     └────────┬────────┘                           └────────┬────────┘
              │                                               │
              └───────────────────────┬───────────────────────┘
                                      ▼
                    ┌─────────────────────────────────────┐
                    │ Same UnixFS root CID (parity CI)     │
                    │ published-external.json + audit      │
                    └─────────────────┬───────────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          ▼                           ▼                           ▼
   Discover metadata            Gateway verify              External pin
   (bond-scoped)               (HTTP, desktop)            (Pinata, etc.)
```

---

## 2. Two runtimes, one workflow

| Component | Language | Role in IPFS track |
|-----------|----------|-------------------|
| **EnvoyMesh node** (`apps/node`) | TypeScript (Node.js) | Policy gate, vault read, Kubo subprocess **or** Helia in-process, persist CID, audit, discovery metadata |
| **Kubo** | Go | UnixFS import via CLI, local IPFS repo, DHT/pinning (if daemon running) — **desktop Kubo engine only** |
| **Helia** (`@envoymesh/ipfs-helia`) | TypeScript | In-process UnixFS import — **desktop Helia engine + mobile export** |
| **EnvoyMesh Social / Tauri** | Rust shell + web UI | Settings toggles, engine selector, Library Export, gateway verify RPC |
| **Mobile** | TypeScript (Capacitor) | **Helia in-process** for export; no Kubo |

EnvoyMesh and Kubo communicate via:

- **`ENVOYMESH_IPFS_EXE`** — path to the `ipfs` binary (Tauri sidecar or `ipfs` on PATH).
- **`ENVOYMESH_IPFS_PATH`** — isolated Kubo repo (default `{profile}/ipfs-kubo`; not `~/.ipfs`).
- **Managed daemon** — the node starts `ipfs daemon` on first export ([§3](#3-how-to-use-kubo-by-runtime) · [§9.3](#93-option-c--envoy-managed-kubo-daemon)).
- **Fixed CLI recipe** — see [§5](#5-interop-recipe-frozen-in-code).
- **Optional HTTP** — gateway verify uses `fetch()` to allowlisted gateways (no Kubo required).

There is **no in-process Go↔TypeScript FFI** for Kubo. Kubo stays a subprocess when selected; Helia runs in-process when selected. Packaging and lifecycle are handled by the node ([§9](#9-packaging-envoymesh--kubo-together)).

---

## 3. How to use Kubo and Helia by runtime

The **Social UI never runs Kubo directly** — whether you open it in a **browser** or inside **Tauri**, IPFS export always happens in the **Node.js node process** (`apps/node`) or **MobileNode** (Capacitor). The UI only sends RPC (`exportLibraryItemToIpfs`).

| Runtime | Export engine | Where IPFS runs | User runs `ipfs init` / `ipfs daemon`? |
|---------|---------------|-----------------|----------------------------------------|
| **Tauri desktop app** | Kubo (default) or Helia | Bundled sidecar + managed engine, or in-process Helia | **No** for Kubo (automatic); N/A for Helia |
| **Social in browser** | Kubo (default) or Helia | System Kubo on PATH + managed engine, or in-process Helia | **No** for Kubo (automatic repo + daemon) |
| **Mobile / in-browser node** | Helia only | In-process in Capacitor WebView | N/A — enable IPFS export in Settings |

---

### 3.1 Tauri desktop app (recommended for end users)

**Architecture (Kubo engine — default):**

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

**Architecture (Helia engine — no sidecar):**

```text
┌──────────────────────────────────────────────────────────────┐
│  Tauri window (Social UI)                                     │
│       WebSocket RPC → localhost:3030                          │
└───────────────────────────┬──────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────┐
│  EnvoyMesh node (spawned by Tauri)                            │
│  • ipfs-export-router → Helia in-process (@helia/unixfs)      │
│  • No Kubo binary or daemon required                          │
└──────────────────────────────────────────────────────────────┘
```

**Build / packager steps (once per release):**

1. Fetch the Kubo sidecar for your platform (Kubo engine / default bundle only):

   ```bash
   ./scripts/fetch-kubo-sidecar.sh          # default Kubo 0.32.1
   ./scripts/fetch-kubo-sidecar.sh 0.32.1   # pin a version
   ```

   This installs `apps/tauri/resources/kubo/ipfs` (macOS/Linux). On Windows, copy `ipfs.exe` from a [Kubo release](https://github.com/ipfs/kubo/releases) into `apps/tauri/resources/kubo/ipfs.exe`.

   Skip this step for **slim Helia-only** builds (`npm run build:slim -w @envoymesh/tauri`).

2. Build the node, Social UI, and Tauri app as usual (see [packaging.md](./packaging.md)).

Tauri bundles `resources/kubo/**` and, at startup, sets on the node child process:

- `ENVOYMESH_IPFS_EXE` — bundled binary when present
- `ENVOYMESH_IPFS_PATH` — `{app_data}/profile/ipfs-kubo`

**End-user steps (no terminal, no separate Kubo install):**

1. Open the **EnvoyMesh** desktop app.
2. **Settings → Node → External distribution** — turn on **Allow IPFS export**.
   - Choose **Export engine**: Kubo (default), Kubo + Helia shadow, or Helia (in-process).
   - Check **IPFS engine** status: Kubo line shows *Available* / *Ready* when Kubo is selected; Helia line shows in-process status when Helia is selected.
3. **Library** — click **Export** on a vault file.
   - **Kubo:** first export initializes the local IPFS repo and starts the managed daemon (may take a few seconds).
   - **Helia:** export runs immediately in-process (no daemon).
4. Optional: add gateway URLs and use **Verify gateway**; toggle **Published** so bonded peers can see the CID in discovery.

You do **not** need IPFS Desktop, `ipfs init`, or a separate `ipfs daemon` terminal when using the **Helia** engine or the managed **Kubo** engine.

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
│  Export engine: Kubo (PATH) or Helia (in-process)               │
│  • Kubo: kubo-ipfs-engine init repo + start daemon on export  │
│  • Helia: @helia/unixfs in Node.js — no Kubo on PATH needed   │
└───────────────────────────┬──────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │ Kubo on PATH (if Kubo     │
              │ engine selected)          │
              └───────────────────────────┘
```

**Setup (one time):**

1. **If using Kubo engine:** install Kubo so the **same shell that runs the node** can execute `ipfs`:

   ```bash
   ipfs version -n   # must succeed in the terminal you use for node:dev
   ```

   Download from [github.com/ipfs/kubo/releases](https://github.com/ipfs/kubo/releases) or use IPFS Desktop (if `ipfs` is on PATH).

   Optional: point at a specific binary instead of PATH:

   ```bash
   export ENVOYMESH_IPFS_EXE=/path/to/ipfs
   ```

   **If using Helia engine:** skip Kubo install — select **Helia (in-process)** in Settings.

2. Install dependencies and start **both** processes:

   ```bash
   npm install

   # Terminal 1 — node (this process runs export, not the browser)
   npm run node:dev

   # Terminal 2 — Social UI in browser
   npm run dev -w @envoymesh/social
   ```

3. Open the URL Vite prints (typically `http://localhost:5173`). The UI connects to the node WebSocket on port **3030**.

**Using IPFS export:**

1. In the browser UI: **Settings → Node → External distribution** → enable **Allow IPFS export** and choose export engine.
2. **Library → Export** on a file.

   The **node** (terminal 1), not the browser:

   - **Kubo:** creates `{profile}/ipfs-kubo` if needed, starts `ipfs daemon` on port **5017**, runs `ipfs add`
   - **Helia:** reads vault bytes and imports via `@helia/unixfs` in-process

You do **not** need to run `ipfs init` or `ipfs daemon` manually unless you prefer your own `~/.ipfs` setup — EnvoyMesh uses an **isolated repo** under the profile by default for Kubo.

**Optional env vars (node process only — Kubo engine):**

| Variable | Default | Purpose |
|----------|---------|---------|
| `ENVOYMESH_IPFS_EXE` | `ipfs` on PATH | Kubo binary path |
| `ENVOYMESH_IPFS_PATH` | `{ENVOYMESH_PROFILE}/ipfs-kubo` | Isolated repo (not `~/.ipfs`) |
| `ENVOYMESH_IPFS_API_PORT` | `5017` | API port (avoids IPFS Desktop on 5001) |

**Verify from CLI (Kubo engine — same managed engine):**

```bash
npm run cli -w @envoymesh/node -- vault-ipfs-fingerprint \
  --profile ./data/default --vault ./shared_vault --relative-path notes/export.md
```

---

### 3.3 Mobile (Helia in-process — no Kubo)

**Capacitor mobile** runs **MobileNode** inside the WebView — there is no `child_process`, so **no Kubo export**.

- **Settings → Node → External distribution** — enable **Allow IPFS export** (Helia is the only engine on mobile).
- **Library → Export** runs `@helia/unixfs` in-process via `@envoymesh/ipfs-helia/browser`.
- CIDs match the desktop interop recipe when vault bytes are identical (CI parity gate).
- **Verify gateway** is not available on mobile — use your **home desktop node** for HTTP gateway checks.
- Use **Discover** to view/copy CIDs that bonded peers published from desktop or mobile.

---

## 4. Prerequisites (platforms)

### 4.1 Platforms

| OS | Tauri desktop | Browser + node:dev | Mobile | Kubo source |
|----|---------------|-------------------|--------|-------------|
| **macOS** | Tauri app + bundled sidecar (Kubo engine) or slim Helia build | Browser UI + `node:dev` | Helia in-process | Sidecar or [Kubo release](https://github.com/ipfs/kubo/releases) on PATH |
| **Linux** | Same | Same | Helia in-process | Same |
| **Windows** | Same (`ipfs.exe` in bundle) | Same | Helia in-process | Same |

Mobile (iOS/Android) does **not** run Kubo; export uses **Helia in-process** when enabled in Settings.

### 4.2 Manual Kubo (optional — Kubo engine only)

Power users may still use a global `~/.ipfs` repo with IPFS Desktop. EnvoyMesh **defaults to an isolated repo** under the profile so it does not touch `~/.ipfs` unless you set:

```bash
export ENVOYMESH_IPFS_PATH=$HOME/.ipfs
```

If you use **Helia** or EnvoyMesh’s managed Kubo engine, skip manual steps. To confirm Kubo is visible to the node (Kubo engine):

```bash
ipfs version -n
```

---

## 5. Interop recipe (frozen in code)

Canonical export uses **recipe id** `kubo-ipfs-export-v1`:

**Kubo engine** (`apps/node/src/kubo-ipfs-export.ts`):

```text
ipfs add --cid-version 1 --pin=false -Q <absoluteFilePath>
```

**Helia engine** (`packages/ipfs-helia`) — same UnixFS parameters:

- CIDv1, raw leaves, 256 KiB chunker, `--pin=false` semantics (no local pin in Helia blockstore by default)
- Parity validated in CI (`ci-ipfs-helia-parity.yml`)

Every successful export stores **`kuboVersion`** or **`heliaVersion`**, plus **`ipfsInteropRecipe`** on audit rows and in `published-external.json`.

**Developer CLI fingerprint** (Kubo engine — same recipe):

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

All steps are **opt-in** (default off). Same flow in **browser**, **Tauri**, and **mobile** — only the backend engine differs ([§3](#3-how-to-use-kubo-and-helia-by-runtime)).

### 6.1 Policy (Settings → Node → External distribution)

1. **Allow IPFS export** — sets `externalPublish.allowIpfs` in `node-config.json`.
2. **Export engine** (desktop) — Kubo, Kubo + Helia shadow, or Helia (in-process).
3. **IPFS engine** — status lines for Kubo and/or Helia from `getIpfsEngineStatus`.
4. **Gateway allowlist** (optional) — one HTTPS base URL per line, e.g. `https://ipfs.io`. Required for **Verify gateway** in Library (desktop only).

### 6.2 Export a vault file (Library)

1. Open **Library**.
2. **Export** / **Re-export** on a row.
3. **Kubo engine:** node starts managed Kubo daemon on first export if needed ([§9.3](#93-option-c--envoy-managed-kubo-daemon)).
4. **Helia engine:** in-process import — no daemon step.
5. On success, CID is stored in `published-external.json` under the profile dir and shown in the UI.

Audit events: `vault.ipfs_export.started|completed|failed`.

### 6.3 Publish metadata to bonded peers (optional)

1. Toggle **Published** on the library row (`published-library.json`).
2. Peers using **Discover → Published files** may see metadata; if export hash matches vault bytes, **`cid`** is included (F3).

### 6.4 Verify via gateway (no Kubo)

1. Configure gateway allowlist (above).
2. Library → **Verify gateway** — node HTTP-fetches `{gateway}/ipfs/{cid}` and compares SHA-256 to vault `contentHash`.

Audit: `vault.ipfs_gateway_verify.*`.

**Desktop only** — mobile delegates gateway verify to the home node.

### 6.5 Agent tools (Envoy AI + optional bridge)

When the node LLM runs document tools (primary — see [AI Document Backbone plan](./ai-document-backbone-plan.md)):

- `mesh.library_list`, `mesh.library_discover`, `mesh.library_publish`, `mesh.share_propose` — wired via native tool-calling loop (ADB).
- `mesh.library_export_ipfs` — requires owner approval; respects selected export engine.
- `mesh.library_verify_ipfs_gateway` — allowlisted HTTP verify.

Optional **bridge** HTTP exposes the same `ToolRegistry` to external agents (HomeClaw/OpenClaw) without replacing Settings → Node model configuration.

---

## 7. Process layout (reference)

**Tauri (bundled Kubo + managed repo — Kubo engine):**

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
└── ipfs-kubo/              ← Kubo engine only; Helia uses in-memory blockstore
```

EnvoyMesh profile data and Kubo repo live **under the same profile tree** by default. They are **not** merged into `~/.ipfs` unless you override `ENVOYMESH_IPFS_PATH`.

---

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| **Browser UI:** Export fails / WebSocket error | Node not running | Start `npm run node:dev`; confirm port 3030 |
| **Browser UI:** “IPFS engine is not available” (Kubo) | Kubo not on PATH for **node** process | Install Kubo; run `ipfs version -n` in the **same terminal** as `node:dev`, or set `ENVOYMESH_IPFS_EXE`, or switch to **Helia** engine |
| **Browser UI:** Helia unavailable | Helia deps failed to load | Check node logs; confirm `@envoymesh/ipfs-helia` build |
| **Tauri:** “IPFS engine is not available” (Kubo) | Sidecar missing from bundle | Run `./scripts/fetch-kubo-sidecar.sh` before Tauri build; or use Helia engine / slim build |
| `IPFS engine did not start in time` | Kubo daemon failed or port busy | Retry export; set `ENVOYMESH_IPFS_API_PORT` if 5017 is taken; or switch to Helia |
| Export disabled error | Policy off | Settings → Allow IPFS export |
| Verify gateway: no allowlist | Empty `gatewayAllowlist` | Add `https://…` bases in Settings |
| CID on discovery missing | Stale export or file changed | Re-export; discovery only sends `cid` when export `contentHash` matches current vault bytes |
| Mobile export fails | Policy off or Helia error | Settings → Allow IPFS export; check mobile audit logs |
| Windows path issues | Rare; uses Node `path.resolve` + absolute path to Kubo | Test `vault-ipfs-fingerprint --file C:\…` from CLI |

---

## 9. Packaging EnvoyMesh + Kubo together

Tauri can bundle the Kubo sidecar (Option B); the node manages the daemon (Option C). **Helia-only slim builds** omit the sidecar entirely. **Browser Social always requires a separate Node.js process** — Kubo is never loaded in the browser tab; Helia runs in the node process.

Release CI (`tauri-release.yml`) builds EnvoyMesh (Social + spawned Node). **Run `fetch-kubo-sidecar.sh` before release builds** to include Kubo in the default installer.

The **Go vs TypeScript split** is stable at runtime (Kubo subprocess + HTTP for verify; Helia in-process when selected). Packaging covers version skew, PATH, and installer size.

### 9.1 Option A — Separate Kubo install (browser + node:dev)

**How:** Install Kubo on PATH for the machine running `npm run node:dev`. Managed engine handles repo + daemon ([§3.2](#32-social-app-in-browser--nodejs-dev--power-users)).

| Pros | Cons |
|------|------|
| No sidecar in repo; Kubo upgrades independent | Two terminals (node + Vite); PATH must work for node process |
| Works with IPFS Desktop if `ipfs` is on PATH | macOS GUI PATH issues do not apply (node runs from your shell) |

**Recommendation:** Default for **local development** with Social in browser and **Kubo** engine. Use **Helia** engine to skip Kubo install entirely.

### 9.2 Option B — Sidecar binary in Tauri bundle

**How:** Ship a **pinned Kubo binary** next to the app (e.g. `resources/kubo/ipfs` or `ipfs.exe`). Tauri sets **`ENVOYMESH_IPFS_EXE`** on the node child when the sidecar exists.

| Pros | Cons |
|------|------|
| One installer; known Kubo version matches CI golden tests | +30–50MB per platform; three binaries to build/cache |
| Reproducible CIDs across Envoy versions | Security updates require Envoy redeploy |
| Works when system PATH is empty (common on Windows/macOS GUI) | Must respect Kubo license (MIT/Apache — verify release notes) |

**Recommendation:** Best path for **Tauri end users** on the **Kubo** engine — no separate Kubo install ([§3.1](#31-tauri-desktop-app-recommended-for-end-users)). Use **slim build** for Helia-only.

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

**Recommendation:** Shipped for **Kubo engine** on both Tauri and browser+node; Settings → Node shows **IPFS engine** status via `getIpfsEngineStatus`.

### 9.4 Option D — Coexist with IPFS Desktop

**How:** Document “install IPFS Desktop” instead of raw Kubo; Envoy calls the same `ipfs` CLI.

| Pros | Cons |
|------|------|
| Familiar UX for IPFS users | Desktop must be running; shared `~/.ipfs` |
| No duplicate repo if user already uses IPFS | Enterprise users may forbid Desktop |

**Recommendation:** Supported if `ipfs` on PATH; EnvoyMesh still prefers `{profile}/ipfs-kubo` unless you set `ENVOYMESH_IPFS_PATH`.

### 9.5 Option E — Embedded TypeScript IPFS (Helia / UnixFS) — shipped

**Status:** **Shipped** — `@envoymesh/ipfs-helia`, export router (`apps/node/src/ipfs-export-router.ts`), mobile export (H5), Helia primary enablement (H6).

**How:** UnixFS import in TypeScript via `@helia/unixfs`; Kubo CLI optional when Helia engine is selected.

| Pros | Cons |
|------|------|
| Single language artifact; works on mobile | Larger JS dependency tree in mobile bundle |
| No Go binary required (slim Tauri build) | Kubo still recommended for operators who want CLI parity tooling |
| CID parity with Kubo recipe (CI gate) | Shadow mode adds export latency when auditing |

**Recommendation:** Default for **mobile**; optional on **desktop** via Settings → Export engine. See [helia-ipfs-integration-plan](./helia-ipfs-integration-plan.md).

---

## 10. Packaging decision matrix

| Goal | Suggested approach |
|------|-------------------|
| **Social in browser (dev)** | [§3.2](#32-social-app-in-browser--nodejs-dev--power-users) — Kubo on PATH + managed engine, or Helia in-process |
| **Tauri desktop “it just works” (Kubo)** | [§3.1](#31-tauri-desktop-app-recommended-for-end-users) — Option B + C |
| **Tauri Helia-only (no Go binary)** | Slim build + Helia engine ([§1.1](#11-export-engine-switching-kubo--helia-dual-engine)) |
| **Minimal installer, IPFS rare** | Option A or Helia engine — document Kubo install for node only if using Kubo |
| **Mobile** | Helia in-process ([§3.3](#33-mobile-helia-in-process--no-kubo)) |

---

## 11. Versioning and CI

- Record **`kuboVersion`** or **`heliaVersion`** on every export for forensic parity.
- When bundling Kubo (Option B), **pin Kubo semver** in release notes and run `ENVOYMESH_IPFS_CLI_TEST=1` in release CI for that pinned binary.
- **Helia parity CI** (`ci-ipfs-helia-parity.yml`) compares Kubo vs Helia CIDs on fixture files.
- **Mobile build CI** (`ci-smoke-local.yml`) runs `npm run build -w @envoymesh/mobile` to catch browser bundling regressions.
- Envoy **libp2p** stack (`@envoymesh/network`) is **separate** from Kubo’s libp2p — they do not share a swarm connection unless you explicitly bridge workflows (not required for export).

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
| **Tauri** → Library → Export (Kubo engine) | Yes (bundled sidecar) | Node child spawned by Tauri |
| **Tauri** → Library → Export (Helia engine) | No | Node child — in-process Helia |
| **Browser** → Library → Export (Kubo) | Yes (on PATH for node) | `npm run node:dev` process — **not** the browser |
| **Browser** → Library → Export (Helia) | No | `npm run node:dev` — in-process Helia |
| **Mobile** → Library → Export | No | MobileNode in Capacitor WebView — Helia |
| `vault-ipfs-fingerprint` CLI | Yes (Kubo engine) | Same node / shell as CLI |
| Library → Verify gateway | No (HTTP only) | Desktop node |
| Discover → Published files (CID display) | No | Any client |

**Implementation:**

- Kubo: `kubo-ipfs-cli.ts`, `kubo-ipfs-engine.ts`, `kubo-ipfs-export.ts`
- Router: `ipfs-export-router.ts`, `vault-ipfs-export-service.ts`
- Helia: `packages/ipfs-helia`, `packages/mobile-node/src/mobile-ipfs-export.ts`
- Recipes: `KUBO_EXPORT_ADD_CLI_ARGS_V1`, `IPFSInteropRecipeV1Id`
