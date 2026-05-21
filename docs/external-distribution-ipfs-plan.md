# External distribution — IPFS (primary)

**Status:** F1–F5 implemented on desktop (Kubo export, discovery CID, gateway verify, agent tools). BitTorrent deferred — see [§11 Backlog — BitTorrent (deferred)](#11-backlog--bittorrent-deferred).

**Why IPFS fits EnvoyMesh:** [IPFS](https://docs.ipfs.tech/concepts/what-is-ipfs/#defining-ipfs) gives **immutable, content-addressed references (CIDs)** and open protocols for moving data — ideal for **interop, integrity checks, and optional wide replication** once an owner **explicitly** exports vault bytes. It does **not** replace bonds, vouchers, or **`/envoymesh/data`** for private peer delivery.

**Interop target:** **maximum compatibility with Kubo-style tooling** (`ipfs` CLI, IPFS Desktop, pinning services speaking the same IPLD UnixFS conventions). Envoy’s canonical published CID MUST be the **UnixFS file DAG root** obtained by **`ipfs add`** on the exported bytes using a **versioned, fixed export recipe** ([§6](#6-maximum-interoperability-kubo--unixfs-root-cids)).

**Related:** [p2p-file-sharing-plan](./p2p-file-sharing-plan.md) · [roadmap](./roadmap.md) · [implementation plan](./implementation-plan.md) (Phase 5) · [protocol-standard](./protocol-standard.md) · **[envoymesh-with-kubo-helia](./envoymesh-with-kubo-helia.md)** (operational runbook + packaging)

---

## 1. Purpose

EnvoyMesh ships **bond-scoped negotiation** (`share.request` → `share.preview` → `share.accept`) and **voucher + chunked `/envoymesh/data`**. That stays the **primary** path for consent and verified transfer.

This plan adds an **optional layer**: after **owner-approved export**, record and optionally advertise **CIDs** peers can **`ipfs cat`**, **`ipfs dag get`**, **pin**, and **fetch via gateways** exactly like content from **any other Kubo node** — **not** Envoy-only fingerprints that disagree with **`ipfs add`**. **No silent publish**; relays still do not store vault payloads.

---

## 2. Design principles

| Principle | Implication |
|-----------|-------------|
| **CID ≠ authorization** | A CID proves **which DAG / content root** refers to exported data — **not** who may read private vault paths. Capability stays EMP + bonds + mandates. |
| **No silent external publish** | IPFS `add` / pinning / gateways only after **visible action**, policy, and **audit**. |
| **Relays stay lean** | No relay-side IPFS payload hosting in this plan. |
| **Kubo-aligned root CIDs first** | **`publishedExternal.cid`** MUST equal **`ipfs add`** output for the same tempfile under our pinned **CLI recipe**. Optional **later** embedded Helia/UnixFS importer only after **golden parity CI** versus that recipe. Don’t advertise “alternate” CIDs unless clearly labeled supplementary. |
| **Thin integration first** | **F1:** golden-vector tests invoking **`ipfs add`** where present; helpers may compare only when CLI available. **F2:** CID **from** Kubo **`ipfs add`** as source of truth. |
| **Gateways are untrusted transports** | CID-first UX; pinning services are external contracts ([IPFS clarification on providers vs protocol](https://docs.ipfs.tech/concepts/what-is-ipfs/#defining-ipfs)). |

---

## 3. Current state (baseline)

- Library + **published overlay** (`published-library.json`, `setLibraryItemPublished`) already expose metadata (`documentId`, paths, `contentHash`, sizes).
- **`discovery.request/response`** can return **`libraryMatches`** among bonded peers — metadata only.

**Gaps (closed):** canonical **CID** via F1–F2; **`publishedExternal`** persistence; optional **CID in discovery** (F3). **Remaining backlog:** pinning provider integrations, Helia dual-engine track ([helia-ipfs-integration-plan](./helia-ipfs-integration-plan.md)).

---

## 4. Goals and non-goals (IPFS track)

### Goals

1. **F1 —** **Kubo-aligned** CID via **`ipfs add`** (pinned CLI recipe); CLI/helper + parity tests where `PATH` has `ipfs`.
2. **F2 —** **Explicit IPFS export** (thin: e.g. local `ipfs add -Q`) + **`publishedExternal`** persistence + **audit**; Social/Settings entry when ready.
3. **F3 —** Optional **discovery** fields on `libraryMatches` (CID only in near term) with strict payload caps.

### Non-goals (IPFS track)

- Automatic export of the whole vault tree.
- Embedding a full IPFS node in **mobile** v1 (delegate to desktop or read-only CID display).
- **Filecoin** deals (separate roadmap item).
- **BitTorrent** artifacts, magnets, or swarm integration — **not in this document’s execution path**; see §11.

---

## 5. Layered architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Envoy — bonds, envelopes, audit, mandates                      │
└─────────────────────────────────────────────────────────────────┘
              │ voucher + chunked /envoymesh/data (primary)
              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Vault (authoritative local store)                               │
└─────────────────────────────────────────────────────────────────┘
      │ OPTIONAL: owner-approved export
      ▼
┌──────────────────────────────────────────────────────────────────┐
│  IPFS: CID + optional pinning / gateways (policy-gated)           │
└──────────────────────────────────────────────────────────────────┘
```

---

## 6. Maximum interoperability — Kubo / UnixFS root CIDs

Canonical **`publishedExternal.cid`** MUST be reproducible outside Envoy using **mainline Kubo** so every off-the-shelf tool works unchanged:

| Property | Requirement |
|-----------|---------------|
| **Root CID** | The **printed line** / JSON field from **`ipfs add`** (single-file add) wrapping the exported bytes — i.e. the **DAG root CID** peers run **`ipfs cat <cid>`** against, not only a standalone `code=raw` leaf unless we later add a distinct **supplementary** field. |
| **Fixed recipe** | Document and freeze the **exact** shell invocation (flags, order): e.g. `ipfs add --cid-version 1 …` plus any mandated `--chunker`; **`--nocopy`** usually **omitted** (export uses temp copy unless explicitly safe); **`--pin=false`** vs pin. **Bump `ipfsInteropRecipe`** when the invocation template changes. |
| **Version stamp** | Persist **`ipfsInteropRecipe`** (semver or monotonic id) plus **`ipfsExeVersion`** / Kubo semver (from **`ipfs version`**) on every export audit row so peers can reconcile **CID differences across Kubo majors**. |
| **Parity CI** | Golden tests **`ipfs add`** when `ipfs` is on `PATH`; **skip otherwise** until CI provides Kubo. **Do not** ship CID computation that contradicts **`ipfs add`** for the pinned recipe unless parity-tested. |

**Explicit non-goal:** IPLD **`raw`-codec-only** CID for the whole blob is simpler but **hurts interoperability** (`ipfs cat` / gateways expect **UnixFS file roots** for typical workflows). Reserve **`cidRaw`** (or similar) for **optional diagnostics**, never as the sole **`publishedExternal.cid`**.

Cross-system workflows this enables:

- **Pins:** common pinning APIs (NFT.Storage-style, Pinata, etc.) ingest the **same CID** Envoy persists.
- **Gateways:** `<gateway>/ipfs/<cid>` for any HTTP client (verify bytes vs expectation).
- **Desktop:** Recipient runs IPFS Companion / Kubo **`ipfs get <cid>`** without Envoy.

---

## 7. Data model (conceptual → Zod in `@envoymesh/protocol` when implementing)

Keep existing **`documentId`** rules. Add optional **`publishedExternal`** per export revision:

| Field | Description |
|-------|-------------|
| `exportRevision` | Monotonic per-document counter |
| `exportedAt` | ISO 8601 |
| `cid` | **Kubo `ipfs add` root CID** (see §6) — canonical interop identifier |
| `ipfsInteropRecipe` | Envoy recipe identifier (increment when CLI flags template changes) |
| `kuboVersion` | **`ipfs version`** output excerpt for forensic parity |

**Discovery (later F3):** optional **`cid`** on `libraryMatches[]` entries — truncate in UI only; payloads stay size-bounded per inbound guards.

---

## 8. Policy and audit

- **Config:** `externalPublish.allowIpfs` default **false**; optional `gatewayAllowlist` empty = deny automated gateway fetch helpers outside policy.
- **Audit:** `vault.ipfs_export.started|completed|failed` with **`cid`** (full), **`kuboVersion`**, **`ipfsInteropRecipe`** (summaries OK); never log pinning API secrets.
- **Revocation:** overlays can mark superseded revisions; cannot guarantee deletion from pinning providers or DHT (**protocol reality**).

---

## 9. Phased plan (execute in order)

### F1 — Kubo-parity fingerprints & CLI

Developer CLI **`vault-ipfs-fingerprint`** runs Kubo **`ipfs add`** on an absolute vault file path using the pinned argument template in **`apps/node/src/kubo-ipfs-export.ts`** (`KUBO_EXPORT_ADD_CLI_ARGS_V1`, recipe id **`kubo-ipfs-export-v1`**) and prints **quiet root CID**, recipe id, and **`ipfs version -n`** on stdout as labeled lines.

**Tests:** Integration run only when **`ENVOYMESH_IPFS_CLI_TEST=1`** in the environment (`docs/developer-cli.md`); CI remains fast without Kubo unless that flag is set with a reachable daemon/API.

### F2 — IPFS export MVP (desktop)

**Shipped:** `exportLibraryItemToIpfs` RPC on desktop node delegates to the same Kubo recipe as F1 (`vault-ipfs-export-service.ts` → `kuboIpfsAddFileInteropRecipeV1`). Persists latest export per document in `published-external.json` (`exportRevision`, `cid`, `ipfsInteropRecipe`, `kuboVersion`, `contentHash`). Audit rows: `vault.ipfs_export.started|completed|failed`. Policy gate: `node-config.json` → `externalPublish.allowIpfs` (default **false**). Social: Settings → Node toggle + Library export column when enabled.

**Not yet:** pinning provider APIs; embedded UnixFS importer.

### F3 — Discovery overlay

**Shipped:** Optional **`cid`** on `libraryMatches[]` in `discovery.response` (`LibraryFileMatchSchema`, max **128** chars via `LIBRARY_FILE_MATCH_CID_MAX_LENGTH`). Responders attach CID from `published-external.json` only when **`contentHash` matches** current vault bytes (stale exports omit `cid`). Client mapping: `discoverPublishedLibrary` → `PublishedLibraryFileHit.cid`; Social Discover → Published files shows truncated IPFS CID.

**Tests:** `discovery-library-match.test.ts`, `discovery-inbound.test.ts` (F3 cid), `protocol.test.ts` (cid max length).

### F4 — Gateway verify (policy-gated fetch)

**Shipped:** `externalPublish.gatewayAllowlist` UI (Settings → Node). RPC **`verifyLibraryItemIpfsGateway`** fetches `{gateway}/ipfs/{cid}` from an allowlisted base only, compares SHA-256 to vault `contentHash`, audit `vault.ipfs_gateway_verify.*`. Library **Copy CID** + **Verify gateway** when allowlist configured.

**Tests:** `ipfs-gateway.test.ts`, `vault-ipfs-gateway-verify.test.ts`.

### F5 — Agent tools (bridge)

**Shipped:** `mesh.library_export_ipfs` (requires approval) and `mesh.library_verify_ipfs_gateway` on the default tool registry; wired via `getMeshToolContext()` when bridge identity exists.

---

## 10. Mobile

Heavy Kubo/IPFS daemon **not** bundled v1.** **Display-only CIDs from discovery**, or **`export` delegates to bonded desktop node**.

---

## 11. Backlog — BitTorrent (deferred)

**Decision:** BitTorrent ([BEP 3](https://www.bittorrent.org/beps/bep_0003.html)) is **not prioritized**. We do **not** expect torrent sidecars, magnets, or swarm clients in the Envoy core for a **long time**, unless a future product need (e.g. mass public seeding) justifies the security/ops cost.

If revisited, `.torrent` generation and **`magnetUri`** in `publishedExternal` would be a **separate** phase with its own review — not F4 of this IPFS track.

---

## 12. Risks (IPFS)

| Risk | Mitigation |
|------|------------|
| **Kubo CID breaks across versions** | Store **`kuboVersion` + recipe** ; migration guide / re-export |
| Leakage via mis-click | Default deny exports; confirmations; audits |
| Gateway confusion | CID-first UX; optionally re-fetch locally and compare **`ipfs block stat`** |
| Dependency bloat | Thin **`ipfs add`** delegation before embedded importer |

---

## 13. Traceability

| Doc | Note |
|-----|------|
| [implementation-plan](./implementation-plan.md) Phase 5 | Content-addressing + owner-approved IPFS export |
| [roadmap](./roadmap.md) | Decentralized persistence; explicit owner approval |

---

## 14. References

- [What is IPFS?](https://docs.ipfs.tech/concepts/what-is-ipfs/#defining-ipfs)
