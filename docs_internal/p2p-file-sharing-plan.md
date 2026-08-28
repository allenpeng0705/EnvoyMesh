# P2P file & document sharing — design and implementation plan

**Status:** **FS-A** · **FS-B** · **FS-C** · **FS-D** · **FS-E** all shipped (2026-05-21 IPFS/Helia ship completes ADB epic).

**Related:** [Implementation plan](./implementation-plan.md) (Scenario 5, Phase 5) · [Protocol standard](./protocol-standard.md) · [Live connectivity testing](./live-connectivity-testing.md) (data channel / vouchers) · [External distribution — IPFS plan](./external-distribution-ipfs-plan.md) · **[AI Document Backbone (detailed design)](./ai-document-backbone-plan.md)** · [User stories](./UserStory.md) · [Scenarios](./scenarios.md).

---

## 1. Purpose and scope

### Goals

- Let each node **see and manage its own library** (files/documents stored in the local vault or an approved import location).
- Support **directed P2P share** to bonded contacts: negotiate via **`share.request` → `share.preview` → `share.accept`**, then **verified transfer** (existing voucher + chunked `/envoymesh/data` path per project architecture).
- Support **optional discovery**: find who advertises a matching **manifest** (title, type, hash/CID, size), scoped by trust and policy—not anonymous firehose by default.
- Ship **Social UI** on **desktop (`apps/social`)** and **mobile (`apps/mobile` + `MobileNode`)** with the **same `NodeService` surface** (`DirectCallClient`).
- Allow an **on-node AI/agent** to help **search, request, and track** transfers using the **same APIs and intents** as the human UI (mandate and bond policy apply).

### Non-goals (initial phases)

- Global unauthenticated “torrent of everything” or clearinghouse reputation.
- Relays storing payloads or indexing user libraries (relays stay lean).
- Replacing copyright or licensing responsibility—product surfaces **license tagging** and **user attestation**, not legal enforcement.

---

## 2. Current state (codebase inventory)

Use this as a checklist so work does not duplicate or diverge.

| Area | Shipped / partial | Gap for this epic |
|------|-------------------|-------------------|
| EMP intents | `share.request`, `share.preview`, `share.accept` in `@envoymesh/protocol` | Wire consistently end-to-end from UI + agent; align payloads with manifests |
| Node inbound | `apps/node` handles inbound `share.*` and logs/audit | Complete outbound share from UI; correlate with data transfer completion |
| Data plane | Documented **voucher + verified chunk stream** (`/envoymesh/data`, see live connectivity doc) | Bind UI progress/cancel to stream lifecycle; resume semantics |
| Vault | `@envoymesh/vault` index/search, `listSupportedVaultFiles`; **library list** via `NodeService.listLibraryItems` (FS-A) | **published overlay:** `published-library.json` + `setLibraryItemPublished` (desktop) |
| `NodeService` | Desktop + mobile: library, share, pending offers, data voucher path | FS-D: **Social Discover UI**, outbound `discovery.request` helper, agent tools |
| Mobile | `MobileNode`: `shareFile`, `acceptShare`, `declineShare`, `listPendingShareOffers`, inbound `share.*`, `/envoymesh/data` receiver + send (libp2p); device keys cached from verified envelopes for voucher verify | **`setLibraryItemPublished`** not implemented (throws); optional Capacitor “pick file into vault” |
| Social UI | Library tab + **Share…** (bonded contact + sensitivity) | FS-D discover/search slice · transfer progress |
| Agent tools | e.g. `share.send` → `share.request` in tool registry | Add **library + discovery + transfer status** tools behind policy |

---

## 3. Design principles

1. **Same pipeline for UI and agent:** Diplomat → bond/policy → vault/brain. No alternate socket for agents.
2. **Explicit consent:** Preview before full payload; `share.accept` is the user/consent boundary unless a narrow **mandate** allows autonomy (still audited).
3. **Verify bytes:** Hash/CID verified after transfer; mismatch → surfaced in UI and audit.
4. **Trust-first discovery:** Default to **contacts and referred paths** before “whole network” discovery responses.
5. **One API, two shells:** Social web UI and mobile WebView call identical `NodeService` methods so behavior matches.

---

## 4. Conceptual model

### 4.1 Layers the UI should reflect

| Concept | Meaning |
|---------|---------|
| **Vault library** | Files the node actually has on disk under the vault root; indexable for RAG. |
| **Published catalog (optional)** | Small signed **manifests** the owner chooses to **advertise** (metadata + pointer to vault path or CID); revocable. |
| **Incoming offers** | Peers’ `share.request` / preview flow; not yet in vault until accepted and verified. |
| **Transfers** | Active/completed/failed byte movement with correlation IDs tying to chat or discovery context. |

### 4.2 Manifest (published item)

Minimum fields (exact Zod schemas belong in `@envoymesh/protocol` when implemented):

- `manifestId`, `ownerId`, `createdAt`, `updatedAt`
- `title`, `mimeType`, `sizeBytes`, `contentHash` (SHA-256 or CID string)
- `sensitivity` ceiling for discovery replies
- Optional: `language`, `license`, `description` (short), `topics[]`
- Optional: **preview text** policy (what `share.preview` may include)

Manifests are **signed** (canonical JSON pattern used elsewhere) and stored locally; **gossip/discovery** responses carry only manifest-sized data, not bulk files.

---

## 5. User and AI workflows

### 5.1 Browse my library

1. User opens **Library** tab.
2. UI calls `NodeService.listLibraryItems` (name TBD)—returns vault-backed rows + optional “published” flag.
3. Actions: open metadata, **share to contact**, **publish/unpublish**, **remove from vault** (policy allowing).

**AI:** `mesh.library.list` (or equivalent) returns the same structured list; agent summarizes (“You have 3 PDFs matching ‘contract’”).

### 5.2 Share file to a contact

1. From Library or attachment picker: choose file + sensitivity + recipient (bonded peer).
2. Node sends **`share.request`** (existing intent); recipient policy returns **`share.preview`**.
3. Recipient UI shows preview card → Accept → **`share.accept`** → **data channel transfer** → verify hash → save to recipient vault path → audit event **completed**.

**AI:** Under mandate, agent proposes recipient + file id; human approves unless policy allows auto-send to tier.

### 5.3 Receive from peer

1. Inbox/pending offers list (from `share:offered` event or polled state).
2. Accept/decline; on accept pick save location (desktop path / mobile Filesystem URI).
3. Progress UI; failure shows retry/cancel consistent with stream semantics.

### 5.4 Discovery-assisted find

1. User or agent issues **scoped `discovery.request`** with structured query (hash, title fuzzy, topic).
2. Responses ranked by bond tier + match; UI shows **candidate manifests only**.
3. User selects source → flows like **5.2** (may skip re-preview if policy allows—decision needed).

**AI:** Natural language “find book X” → structured discovery query + presents **options with peer identity and trust badge**; does not silently download.

---

## 6. Technical design

### 6.1 Protocol (`@envoymesh/protocol`)

- Reuse **`share.request` / `share.preview` / `share.accept`**; extend payloads if needed for **manifest references** and **transfer session ids** (avoid breaking existing tests).
- Add **manifest** and optional **`file.discovery`/`file.catalog`** intents *only if* `discovery.request` payloads prove too ambiguous—prefer extending **`discovery.request/response`** with typed **attachment descriptors** first (single discovery channel).
- Align **`knowledge.response`** usage where preview/full text is already specified for shares.

**Exit criterion:** every new field has Zod schema + parse + `create*` helper.

### 6.2 `NodeService` (`packages/api`)

Add (names indicative):

| Method | Purpose |
|--------|---------|
| `listLibraryItems(filter?)` | Vault files + optional publish metadata; stable sort; pagination optional |
| `getLibraryItem(id)` | Detail for one row |
| `importToLibrary(...)` | Optional: copy into vault from user-selected path |
| `publishManifest(itemId, fields)` / `unpublishManifest(itemId)` | Advertise or revoke |
| Implement `shareFile` | End-to-end with existing envelope pipeline |
| `listPendingShares()` / `getTransferStatus(correlationId)` | UI + agent; maps to events |

Update **`ws-protocol`** RPC union + desktop WS handler + **MobileNode** stubs → real impl.

### 6.3 Node runtime (`apps/node`)

- Implement **`shareFile`** using same path as tool registry’s `share.send`.
- Library: call **`listSupportedVaultFiles`** + index metadata store (new small JSONL or SQLite per [sqlite-adoption.md](./sqlite-adoption.md) criteria).
- After **`share.accept`**, orchestrate **data transfer** and emit **audit** with `correlationId`.
- Bond checks: reuse `@envoymesh/bonds` for intent + sensitivity.

### 6.4 Mobile (`packages/mobile-node`, `@envoymesh/mobile-vault`)

- Implement **`shareFile`** / **`listLibraryItems`** using **mobile vault** and relay-capable transport only.
- Parity tests: same `NodeService` contract as desktop where feasible; document **temporary gaps** (e.g. no background transfer) in this doc’s changelog section when known.

### 6.5 Agent / bridge tools

- **List library**, **publish/unpublish**, **send share**, **discovery query**, **transfer status**—registered in tool registry with **explicit intents** and **policy gates**.
- Bridge (`apps/node` bridge) exposes only what `NodeService` already allows—**no new secret paths**.

---

## 7. UI/UX — Social (desktop + mobile)

### 7.1 Navigation

- Add **Library** entry (sidebar/header) next to Chat/Search/Settings patterns already in Social.

### 7.2 Library screen (required)

- **My files** table/cards: name, size, type, sensitivity, indexed?, published?
- **Actions:** Share, Publish, Delete (confirm), Open (where platform allows)
- **Incoming** sub-tab or filter: pending offers + status
- **Transfers:** thin progress rows (active done/failed)

### 7.3 Chat integration

- Message type: **file offer card** showing preview snippet + **Accept / Decline** + trust context (peer name, bond tier).

### 7.4 Mobile-specific

- Use **native pickers** for import; **Share sheet** for export-open; respect **relay-only** constraints (clear error if upload path unsupported).

### 7.5 Accessibility & clarity

- Always show **which peer** and **what hash** before irreversible actions where policy requires.

---

## 8. Phased roadmap

### Phase FS-A — Library visibility (foundation)

**Deliverables:** `NodeService.listLibraryItems` (+ types), desktop node impl, `DirectCallClient` passthrough, **Library** view listing vault contents, tests for API + empty vault.

**Shipped:** `@envoymesh/api` types + RPC `listLibraryItems`; `NodeServiceImpl` via `buildVaultIndex` and configurable `vaultDir` (wired from `index.ts`); `MobileNode.listLibraryItems` (supported extensions); Social **Library** tab + `WsClient` / `DirectCallClient` / `NodeServiceProvider` client; tests `apps/node/test/library-list.test.ts`.

**Exit:** User sees their vault files on desktop Social; unit tests pass.

### Phase FS-B — Outbound + inbound share (1:1)

**Deliverables:** Real **`shareFile`** / **`acceptShare`** / **`declineShare`** on desktop; chat/library integration; transfer + verify; audit trail; minimal **Incoming** UI.

**Shipped (desktop):** Protocol `fileOrigin` (`responder` | `sender`) on `share.request`; inbound handlers validate pull vs push paths; **`NodeServiceImpl.shareFile`** sends `share.request` (push) and records pending send; **`linkOutboundSharePreviewFromInbound`** maps preview id after `share.preview`; **`registerResponderFileSendAfterPreview`** for pull (responder holds file); **`maybeSendShareFileForInboundAccept`** issues **`sendVaultFileViaDataTransfer`** after accepted `share.accept` (voucher + `/envoymesh/data`); **`recordInboundPushShareOffer`** + **`listPendingShareOffers`**; CLI **`bindCliTaskStore`**. RPC **`listPendingShareOffers`**; Social **Settings → Node → Incoming file shares** (accept/decline). **`createUnsignedDataTransferVoucher`** import from `@envoymesh/protocol` in `node-file-share.ts`.

**Exit:** Two bonded nodes: sender `shareFile` → recipient preview → recipient `acceptShare` → verified data transfer (hash in voucher). Desktop wiring + unit tests for share inbound; **`npm run smoke:local` runs `file-share-e2e.test.ts`** (bytes + hash integration checks).

### Phase FS-C — Mobile parity

**Deliverables:** `MobileNode` implementations; mobile Library screen; file picking.

**Shipped:** **`MobileNode.shareFile` / `acceptShare` / `declineShare` / `listPendingShareOffers`**; inbound **`share.request` → `share.preview` → `share.accept`** (file-only knowledge path stub); **`/envoymesh/data/0.1.0`** register on libp2p + verified inbound write to `MobileVault`; outbound file send after accepted **`share.accept`**; device/TLS keys for voucher verify cached from verified envelopes + transport peer mapping. Social **Library → Share…** (pick bonded contact + sensitivity). Relay fallback for envelopes when mesh send fails.

**Exit:** Same core file-share story on Capacitor; documented limitations (no full JSONL audit parity; peer directory does not persist device PEM — runtime cache only).

### Phase FS-D — Publish + discovery

**Shipped:** `published-library.json` (desktop + **mobile** Data directory); `NodeService.setLibraryItemPublished` / `listLibraryItems.published`; inbound `discovery.request` **`libraryMatches`** (optional **`cid`** when peer has IPFS export); **`NodeService.discoverPublishedLibrary`** (bond-ordered, `sendExpectReply` + same-stream **`replyWithEnvelope`** on the node); **Social → Discover → “Published files”** tab; RPC / **`NodeServiceClient`** / **`DirectCallClient`**; agent tools **`mesh.library_list`**, **`mesh.library_discover`**, **`mesh.library_export_ipfs`**, **`mesh.library_verify_ipfs_gateway`**, **`discovery.search`** fixed (targeted RPC); **`bondTrustRank`** helper.

**Mobile:** **`discoverPublishedLibrary`** uses same-stream **`/envoymesh/message`** request/response (parity with desktop `sendExpectReply`); publish manifest via Capacitor Filesystem at `envoymesh_profile/published-library.json`.

**Smoke:** `npm run smoke:local` runs trust-mode + file-share e2e + **`agent-share-proposal-store.test.ts`**.

**Exit:** Third peer can answer discovery without transferring bytes until the accept path runs.

### Phase FS-E — Agent-assisted flows

**Shipped:** **`agent-share-proposals.json`** (desktop profile dir) + **`envoymesh_profile/agent-share-proposals.json`** (mobile Data); **`submitAgentShareProposal`** (RPC + **`DirectCallClient`**); event **`share:agent-proposed`**; bridge **`POST /bridge/agent-share-proposal`**; **Inbox** + **Settings → Node** lists for agent-proposed shares; **`NodeServiceImpl.getMeshToolContext()`** supplies **`listLibraryItems` / `discoverPublishedLibrary`** to **`executeTool`** when bridge identity exists.

**Exit:** Owner sees agent-proposed shares, can send or dismiss; agent tools can use library hooks with a loaded tool context.

**Next (ADB epic):** Full AI Document Backbone — native **Envoy AI** tool-calling (Settings → Node/AI), publish/find/share orchestration, transfer status. Bridge optional. See **[AI Document Backbone plan](./ai-document-backbone-plan.md)** (phases **ADB-A–F**).

---

## 9. Testing strategy

- **Unit:** protocol parse/roundtrip; bond evaluation for new intents; vault list edge cases (empty root, ENOENT).
- **Integration:** two-node share roundtrip (extend or follow `npm run smoke:local` patterns).
- **UI:** component tests for Library list + empty state; offer card actions (vitest + testing-library).
- **Regression:** ensure relays still **do not** gain payload storage in tests and code review checklist.

---

## 10. Open questions (resolve before or during FS-D)

1. **Discovery payload shape:** extend `discovery.request/response` vs new intent—preference for **one discovery channel** with typed optional `fileQuery`.
2. **Resume:** mandatory for large files on mobile networks or v2?
3. **Auto-accept** for `direct` bonds: product toggle vs always manual for v1?
4. **SQLite** for manifests vs JSONL until scale demands (see [sqlite-adoption.md](./sqlite-adoption.md)).

---

## Document history

| Date | Change |
|------|--------|
| 2026-05-20 | Linked **[AI Document Backbone plan](./ai-document-backbone-plan.md)** — detailed agent publish/find/share design and **ADB-A–F** roadmap. |
| 2026-05-21 | **FS-D/E:** Mobile `discoverPublishedLibrary`; published-library **`published-library-discovery`** smoke; agent share persistence + Inbox/Settings + bridge **`/bridge/agent-share-proposal`**; Library publish toggle; Discover hash prefix + hash snippet; **`getMeshToolContext`**. |
| 2026-05-20 | **FS-D:** Discover “Published files” tab, `discoverPublishedLibrary`, `replyWithEnvelope` discovery, `sendExpectReply` dial hints, mobile published manifest, tools **`mesh.library_*`**, FS-E stubs. |
| 2026-05-20 | **FS-A implemented:** library list API, desktop + mobile `NodeService`, Social Library view, tests (`library-list.test.ts`). |
| 2026-05-19 | Initial design and phased plan |
