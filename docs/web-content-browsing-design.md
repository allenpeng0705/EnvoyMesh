# EnvoyMesh — Web Content Browsing (Phase 45)

**Status:** Phase 45A + 45B implemented (2026-07-20). Layers 1–3 green; Layer 4 Playwright wired (`npm run smoke:web-content`). 45C–45F still future.
**Owner:** peng
**Roadmap:** [Phase 45 in implementation-plan.md](./implementation-plan.md#phase-45--web-content-browsing--future)
**Related:** [agent_network.md](./agent_network.md), [knowledge-base-and-rag.md](./knowledge-base-and-rag.md), [p2p-discovery.md](./p2p-discovery.md)

---

## 1. Problem

EnvoyMesh is a decentralized P2P mesh where bonded nodes can already reach each other through firewalls (circuit relay), exchange signed envelopes, share files via Data Transfer Vouchers, and run trust-gated knowledge queries. What it cannot do today is **serve URL-addressable content** from one node to another in a way that feels like browsing a website.

Concretely, a user wants to:

1. Publish content on their home machine — a blog, profile site, photo wall, knowledge base, or just individual Markdown files and PDFs.
2. Have bonded contacts (and, depending on settings, the wider mesh) browse that content from inside the EnvoyMesh social app or the EnvoyGo mobile app — typing a URL, clicking links, navigating back, seeing rendered pages.
3. Eventually, after the mesh-native experience is solid, let outside non-mesh users access the same content via a regular web browser through an HTTP gateway.

The user articulated this as a deliberate two-step split:

> **Step 1** — Support EnvoyMesh nodes accessing each other's content easily, the behavior like using a browser to access a web server. The browser is the EnvoyMesh social app and EnvoyGo.
>
> **Step 2** — Investigate letting other users access EnvoyMesh node content (profile site, knowledge site, blogs) where all data is stored on the home machine. If the owner publishes it, bonded contacts and other EnvoyMesh nodes can access based on settings. Content can be pushed to followers by topic/interest and used to match friends.
>
> After the above — investigate allowing outside users to access content if they are web format.

This document specifies Step 1 fully, sketches Step 2, and forward-references the external HTTP gateway as Step 3.

## 2. Goals & non-goals

### Goals

- A URL scheme (`envoy://`) that is stable, self-sovereign, and feels like the web.
- A pull-based mesh intent (`library.read` / `library.read.response`) that lets a bonded node fetch content by path from a remote node's published content directory.
- A "Browser" view in both the Social desktop UI and the EnvoyGo mobile app that renders served content (Markdown, images, PDFs, raw files) like a web browser.
- Per-item visibility controls (public-to-mesh / bonded-contacts-only / specific-contacts / private) that reuse the existing Bonds Engine sensitivity tiers.
- Templated site types (Profile, Blog, PhotoWall, Feeds) and freeform Markdown authoring.
- A verification scenario that proves the architecture end-to-end before building out the full feature set.

### Non-goals

- **No external HTTP gateway in Step 1.** Outside non-mesh access is Step 3, forward-referenced in §7.6 but not designed here.
- **No GossipSub / push-based pubsub in v1.** Push notifications and topic-based replication are Step 2 (§7.5). v1 is pull-on-demand.
- **No handle registry.** URLs use permanent cryptographic owner IDs in v1. Pretty `@handle` URLs are reserved syntax (parser accepts, runtime rejects) for a future registry.
- **No replacement of existing transports.** Mesh-native protocols remain the transport; we add one intent, not a parallel HTTP stack.
- **No new auth model.** Visibility reuses Bonds sensitivity tiers; no URL tokens, no per-reader credentials.
- **No content versioning beyond content-hash integrity.** A path is the permanent identifier; the node may serve different bytes over time, but old `contentHash` values are not preserved as a version history.

## 3. Current state (verified 2026-07-20)

EnvoyMesh already has most of the primitives this feature needs. The design's job is to assemble them, not invent them. Every claim below was verified against the current codebase.

### 3.1 Published library — the closest existing analog

A node can already mark vault documents as "published" and let bonded contacts discover them via `discovery.request`.

- **Store format:** `apps/node/src/published-library-store.ts:16,32` — a simple `{ documentIds: string[] }` JSON file, mode `0o600`. No per-entry metadata; title/path/hash/size come from the vault index at query time.
- **Publish/unpublish API:** `setLibraryItemPublishedViaRuntime` at `apps/node/src/node-service-fileshare.ts:189-198`, exposed as `NodeService.setLibraryItemPublished(documentId, published)` at `apps/node/src/node-service-impl.ts:4858`. Also writes a sensitivity override (`public` when published) via `writeSensitivityOverride` (lines 207-225).
- **Discovery capability string:** `PUBLISHED_LIB_CAPABILITY = "envoymesh.published-library"` at `apps/node/src/discovery-inbound.ts:35`.
- **Public-stranger gate:** `allowsPublicPublishedLibraryQuery` at `apps/node/src/discovery-inbound.ts:74-90` — strangers may query only this capability, only with title/content-hash selectors.
- **Match logic:** `matchPublishedLibraryDocuments` at `apps/node/src/discovery-library-match.ts:5-44` — case-insensitive substring on title/path; prefix match on `contentHash`; returns `LibraryFileMatch[]` with `sensitivity: "public"` and optional `cid`.
- **Mobile mirror:** `MOBILE_PUBLISHED_LIB_CAPABILITY` at `packages/mobile-node/src/index.ts:315`, same string.

**Gap:** discovery returns *metadata*, never *bytes*. There is no mesh intent that pulls raw content by path or documentId from a remote peer. (Local `readLibraryItemContent` at `apps/social/src/lib/direct-call-client.ts:338-340` exists but is in-process only.) This is the single most important missing primitive — §5.4 adds it.

### 3.2 `discovery.request` / `discovery.response` payload

Defined at `packages/protocol/src/index.ts:994-1067`. The fields we will extend:

- `LibraryFileMatchSchema` (lines 1027-1038): `{ documentId, title, relativePath, contentHash, byteLength?, sensitivity?, cid? }`.
- `DiscoveryRequestPayloadSchema` (lines 994-1024): supports `fileTitleQuery`, `requestedContentHashPrefixes`, `requestedCapabilities`, `maxHops`/`currentHop` for multi-hop.

Both are additive-extension candidates — new optional fields, backward compatible.

### 3.3 `knowledge.query` — and why we do not extend it

The closest RPC intent today is `knowledge.query` → `knowledge.response`, handled at `apps/node/src/knowledge-query-inbound.ts:69-416`. We deliberately do not extend it for content serving because:

- **It is LLM-coupled.** The handler routes through `routeModelRequestWithCostTracking` (line 364-374) to synthesize a natural-language answer. Serving raw bytes is the wrong shape.
- **It has no path selector.** `KnowledgeQueryPayloadSchema` exposes only `query` (a natural-language string) and `requestedSensitivity`. There is no `path` or `documentId` field.
- **Its trust gate is tuned for search, not file serving.** The sensitivity resolution at lines 245-251 takes the tightest of three ceilings (`allowedSensitivity`, `knowledgeSyndicationMaxSensitivity`, `contactSyndicationMaxSensitivity`). File serving needs the same gating but a different response builder.

The Bonds gate *pattern* (`evaluatePolicy` at `packages/bonds/src/index.ts:110`, `resolveKnowledgeSyndicationSensitivity` at `knowledge-query-inbound.ts:247-251`) is exactly what we want to reuse — just in a new intent with a path-based selector and a raw-bytes response.

### 3.4 Capability advertisement via DHT

`provideCapabilityTopic` at `packages/network/src/index.ts:1654-1761` lets a node advertise a topic string on the DHT. The signed record wire format is `SignedCapabilityTopicRecordSchema` at `packages/protocol/src/index.ts:377-380`. The existing call site is `apps/node/src/capability-discovery.ts:160-166` (reprovide pattern).

We will reuse this to advertise `"envoymesh.web-content"` for nodes that serve web content, alongside the existing `"envoymesh.published-library"`.

### 3.5 Data Transfer Voucher — push, not pull

The Data Transfer Voucher pipe (`packages/protocol/src/index.ts:1726`, wire protocol `/envoymesh/data/0.1.0`, inbound receiver `apps/node/src/data-transfer-inbound.ts`) is a complete, signed, content-addressed file-push mechanism. It is push-only: the issuer sends bytes to the receiver's vault.

We do not reuse it for `library.read` because Step 1 is pull-on-demand (the reader requests content by URL when they open it). Push remains useful for Step 2 (pre-cache to subscribers) and is forward-referenced there.

### 3.6 Mobile architecture — two modes

The mobile app operates in two modes, both of which must work for browsing:

- **Paired/thin mode:** `HomeRemoteClient` at `packages/mobile-node/src/home-remote-client.ts:116-616` is a JSON-RPC-over-WebSocket (or libp2p-stream) client to the paired home node. The home's `routeRpcMethod` at `apps/node/src/client-proxy-handler.ts:121` executes requests on the mobile's behalf using the home's identity and bonds. Request path: mobile → home → mesh → third node.
- **Browser/standalone mode:** `packages/mobile-node/src/index.ts:597, 1700-1704` — the mobile runs its own libp2p instance (WebSocket transport + DHT + circuit relay) and sends envelopes directly from its own peer identity via `_sendExpectReplyViaMesh` (line 7443). Requires its own bond with the remote owner.

Both modes already have `discoverPublishedLibrary` (mobile line 3483) and `requestMultiHopDiscovery` (line 4309). The new `library.read` will mirror this dual-mode pattern.

### 3.7 UI rendering

`apps/social/src/components/Markdown.tsx` (33 lines) renders GFM Markdown via `marked` + `DOMPurify` sanitization. Reusable as-is for blog posts and Markdown pages.

## 4. Proposed design

### 4.1 URL scheme — `envoy://{owner}/{path}`

This is the keystone decision. URLs appear in chat messages, Markdown links, share sheets, bookmarks, and (eventually) external gateway paths. They must be stable forever. Once content is shared with a URL, that URL must keep working.

#### 4.1.1 Grammar

```
envoy-URL = "envoy://" owner "/" [ path ]
owner     = owner-id | handle
owner-id  = "envoy:owner:" base64url    ; the permanent cryptographic owner ID
handle    = "@" handle-char+             ; reserved in v1, parser accepts, runtime rejects
path      = pct-encoded-segment *( "/" pct-encoded-segment )
```

`base64url` is the existing owner ID format used everywhere else in the system (e.g. `envoy:owner:diBymBI4fBdIe0V_bhwFXhEijf4FVd0uDvyIh_X1E9I`). Owner IDs are derived from `sha256(owner-public-key)` and never change.

#### 4.1.2 Examples

```
# Owner-id form (v1 — the only form the runtime resolves)
envoy://envoy:owner:diBymBI4fBdIe0V_bhwFXhEijf4FVd0uDvyIh_X1E9I/
envoy://envoy:owner:diBymBI4fBdIe0V_bhwFXhEijf4FVd0uDvyIh_X1E9I/blog/posts/hello-world
envoy://envoy:owner:diBymBI4.../photos/summer-2026/cover.jpg
envoy://envoy:owner:diBymBI4.../files/resume.pdf

# Handle form (v2 — reserved, parser accepts, runtime rejects in v1)
envoy://@allen/blog/posts/hello-world
```

#### 4.1.3 Disambiguation from pairing URIs

The existing `envoy://contact?v=1&peerId=...&join=...` URI (used for QR-code pairing) has authority `contact` and a query string. The content URL has authority `envoy:owner:...` or `@handle` and a path. The parser distinguishes by shape:

- If authority == `contact` and a query string is present → pairing URI (existing handler).
- If authority starts with `envoy:owner:` or `@` → content URL (new handler).
- Otherwise → error.

No migration needed; both URI families coexist.

#### 4.1.4 Encoding

Paths use standard RFC 3986 percent-encoding. CJK and spaces work transparently:

```
envoy://envoy:owner:abc.../blog/posts/我的旅行          # raw (display form)
envoy://envoy:owner:abc.../blog/posts/%E6%88%91%E7%9A%84%E6%97%85%E8%A1%8C  # encoded (wire form)
```

The renderer shows the decoded form in the address bar; the wire request uses the encoded form. Same behavior as a web browser.

#### 4.1.5 Why this scheme is right

1. **Owner ID is permanent and self-sovereign.** Matches the DID philosophy. URLs never break when someone changes a display name or moves between relays.
2. **Path is opaque to the scheme.** The node decides what `/blog/posts/hello-world` means. We can introduce new site types (Wiki, Bookmarks, Recipe collection) without changing the URL format.
3. **Handles are a pure addition.** When we add a registry in v2, every old `envoy://envoy:owner:...` URL still works unchanged. New URLs can use `envoy://@allen/...` for prettiness. Both resolve to the same content.
4. **Visibility is server-side, not in the URL.** No `?token=...`, no `/private/...` path prefix. A single URL works for both a bonded friend (sees content) and a stranger (sees a 403 or redacted version). Critical for the "share the link in chat" UX.
5. **Maps cleanly to a future HTTP gateway (Step 3).** `https://gateway.example.com/envoy:owner:abc123/blog/posts/hello-world` is a trivial transform (prepend gateway host, keep path). No URL redesign when gateways arrive.
6. **Owner-id URLs are ugly but honest.** They expose no personal information and cannot be guessed. This is a feature: a stranger cannot enumerate content by trying handles.

#### 4.1.6 What we deliberately do not bake in

- ❌ No content-type in the URL (MIME detected by the node, like a real web server).
- ❌ No version in the URL (versioning is server-side; the path is the permanent identifier).
- ❌ No visibility or token in the URL (server-enforced).
- ❌ No hardcoded site slugs (`blog`, `profile` are conventions, not schema — a node can serve whatever paths it wants).

### 4.2 Content model

#### 4.2.1 Content directory

Each node has a content directory at `<profileDir>/web/` (default `~/EnvoyMesh/web/` on desktop; app-sandboxed equivalent on mobile). Files placed here are URL-addressable. The directory structure mirrors the URL path space:

```
~/EnvoyMesh/web/
├── index.md                  → envoy://<owner>/
├── blog/
│   ├── index.md              → envoy://<owner>/blog/
│   └── posts/
│       ├── hello-world.md    → envoy://<owner>/blog/posts/hello-world
│       └── my-trip.md        → envoy://<owner>/blog/posts/my-trip
├── photos/
│   └── summer-2026/
│       ├── index.md          → envoy://<owner>/photos/summer-2026/
│       └── cover.jpg         → envoy://<owner>/photos/summer-2026/cover.jpg
└── files/
    └── resume.pdf            → envoy://<owner>/files/resume.pdf
```

Path resolution is straightforward: strip the leading `/`, append to `<profileDir>/web/`, normalize. Path-safety is enforced via the existing `assertPathInsideVault` from `packages/vault/src/index.ts:328` (re-used as-is).

#### 4.2.2 Manifest

A manifest at `<profileDir>/web/web-content.json` declares metadata for published items: title, summary, kind, visibility, updatedAt. Extends the existing `VaultContentManifest` shape (`packages/vault/src/index.ts:76-105`):

```typescript
// New: WebContentEntry (additive — reuses VaultContentManifest fields where possible)
interface WebContentEntry {
  // Identity (matches VaultContentManifest)
  path: string;                 // e.g. "blog/posts/hello-world" (no leading slash)
  contentHash: string;          // sha256 of bytes, for integrity + dedup
  byteLength: number;

  // New fields (additive)
  title: string;                // human-readable, for listings
  summary?: string;             // first paragraph or manual excerpt, for listings
  kind: "article" | "note" | "photo" | "gallery" | "file" | "profile";
  mimeType: string;             // "text/markdown", "image/jpeg", "application/pdf", ...
  visibility: Visibility;       // see §4.3
  updatedAt: string;            // ISO 8601
  publishedAt?: string;         // ISO 8601, when the item was first published
  urlSlug?: string;             // optional pretty slug, e.g. "hello-world" (defaults to filename)
  tags?: string[];              // for Step 2 topic matching
}
```

Items without a manifest entry are **owner-only** (default `visibility: "private"`) — they can be previewed locally but are not served to remote peers and are not listed in discovery. The manifest is the *publishing* layer; the directory is the *storage* layer.

#### 4.2.3 Templated site types

Templates are conventions on directory layout + `kind` values — not new protocol schemas. A node can serve any paths it wants; templates just give users a starting structure.

| Template | Directory | Index behavior | Listing behavior |
|---|---|---|---|
| **Profile** | `profile/index.md` | Rendered at the root URL | Static, single page |
| **Blog** | `blog/posts/*.md` | `blog/index.md` lists posts by `publishedAt` desc | Clickable list of posts |
| **PhotoWall** | `photos/<gallery>/` | Gallery cover image + thumbnails | Grid of images |
| **Feeds** | `feeds/*.md` (or RSS/JSON imports) | Reverse-chronological list | Subscribe-able in Step 2 |

A CLI command `envoy init blog` (and the equivalent in-app action in Phase 45D) scaffolds the template. Templates are user-editable — drop new files, edit the manifest, republish.

#### 4.2.4 Manual Markdown support

Users can author Markdown by hand and drop it into `~/EnvoyMesh/web/`. As long as the path is reachable from the directory root and the file extension is `.md`, the file is readable as `text/markdown` **by the owner** (local self-read / preview).

**Remote reads require a manifest entry.** Files without a `web-content.json` entry default to `visibility: "private"` (§4.4.4 step 5) — bonded contacts and strangers receive `not_found`. To publish a dropped file, add a manifest entry with the desired visibility (`public` / `bonded` / `contacts`). Manifest entry is also required for discovery listings.

#### 4.2.5 Raw file serving

Non-Markdown files (PDF, JPG, PNG, DOCX, etc.) are served with their MIME type detected from extension (mirroring a static web server). The Browser view renders:

- Images (`image/*`) as `<img>` with the envoy URL as src.
- PDFs (`application/pdf`) in an `<iframe>`.
- Audio/video in native HTML5 players.
- Unknown types as a download link.

Binary response chunking and size caps are specified in §4.4.

### 4.3 Visibility model — per-item, mapped to Bonds tiers

#### 4.3.1 Visibility values

Each manifest entry carries a `visibility` field:

```typescript
type Visibility =
  | "public"           // anyone on the mesh can read (subject to rate limits)
  | "bonded"           // any direct or referred bonded contact can read
  | "contacts"         // only specific listed contacts can read (ManifestEntry.contactIds)
  | "private";         // only the owner (local reads still work for previewing)
```

The `contacts` tier adds an optional `contactIds: string[]` field to the manifest entry listing the owner IDs permitted to read.

#### 4.3.2 Mapping to Bonds sensitivity tiers

The Bonds Engine (`packages/bonds/src/index.ts:110` `evaluatePolicy`) already understands sensitivity tiers `public` / `friends` / `private` and bond levels `self` / `direct` / `referred` / `public` / `blocked`. The mapping:

| Manifest `visibility` | Bonds sensitivity | Who can read |
|---|---|---|
| `public` | `public` | Any peer, including strangers (rate-limited) |
| `bonded` | `friends` | Any `direct` or `referred` bond |
| `contacts` | `friends` + contact-id ACL | Only `direct` bonds in `contactIds[]` |
| `private` | `private` | Only `self` (the owner) |

The handler (§4.4) calls `evaluatePolicy({ peerId, bondLevel, intent: "library.read", requestedSensitivity: mappedSensitivity })` and accepts the result. For `contacts` visibility, the handler additionally checks the requester's owner ID against `contactIds[]`.

#### 4.3.3 What the URL does NOT carry

- No `?token=...` — visibility is server-enforced based on requester identity.
- No `/private/...` path prefix — the path is the permanent identifier; visibility can change without breaking URLs.
- No per-reader credentials — the requester's Ed25519-signed envelope is the credential.

A single URL works for both a bonded friend (sees content) and a stranger (sees a 403 or the public-tier redacted version if one exists). This is critical for sharing links in chat.

### 4.4 Protocol — `library.read` / `library.read.response`

#### 4.4.1 Why a new intent (and why not reuse existing ones)

| Candidate | Why not |
|---|---|
| Extend `knowledge.query` | LLM-coupled; no path selector; tuned for search, not file serving |
| Reuse `share.request` | Push-based handshake (`fileOrigin: "responder"`), not pull-by-path |
| Reuse Data Transfer Voucher | Push-only (`/envoymesh/data/0.1.0`); issuer pushes bytes to receiver |
| Add `web.proxy.*` (Gemini's suggestion) | Duplicates `knowledge.query` semantics; splits the codebase into two content-retrieval paths |

The right move is one new intent pair that mirrors `discovery.request`'s shape but returns bytes instead of metadata, and reuses the Bonds gate from `knowledge-query-inbound.ts`.

#### 4.4.2 `LibraryReadPayloadSchema` (request)

```typescript
const LibraryReadPayloadSchema = z.object({
  requesterOwnerId: z.string().min(1),
  targetOwnerId: z.string().min(1),             // who we're asking
  path: z.string().max(512),                    // URL path, percent-decoded; empty → index.md
  requestedSensitivity: z.enum(["public", "friends", "private"]).optional(),
  range: z.object({                              // optional byte range, like HTTP Range
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
  }).optional(),
});
```

- `targetOwnerId` is the `envoy:owner:...` from the URL.
- `path` is the URL path (leading slash stripped, percent-decoded). Empty string means the site root and resolves to `index.md`.
- `range` supports partial content requests for large files (PDFs, videos).

#### 4.4.3 `LibraryReadResponsePayloadSchema` (response)

```typescript
const LibraryReadResponsePayloadSchema = z.object({
  inReplyTo: z.string().min(1),
  status: z.enum(["ok", "not_found", "forbidden", "too_large"]),
  // When status === "ok":
  body: z.string().optional(),                  // base64-encoded bytes (for binary) OR UTF-8 text
  contentType: z.string().optional(),           // MIME type
  contentHash: z.string().optional(),           // sha256 of body, for integrity
  byteLength: z.number().int().nonnegative().optional(),
  etag: z.string().optional(),                  // for caching
  range: z.object({ start: z.number().int(), end: z.number().int(), total: z.number().int() }).optional(),
  // When status === "forbidden":
  publicRedirection: z.string().optional(),     // alt path with public-tier content, if any
});
```

The response is a single envelope. Large files (over the envelope size cap, §6.3) require `range` requests and multiple round-trips. A future streaming variant over `/envoymesh/data/0.1.0` is forward-referenced for Phase 45B.

#### 4.4.4 Handler flow

The handler `library-read-inbound.ts` mirrors `knowledge-query-inbound.ts:69-416`:

1. **Payload parse** (Zod). Failure → `{ ok: false, reason }`.
2. **Audit `message.verified`.**
3. **Resolve sender owner + bond level** via peer directory / device certificate (same as `knowledge-query-inbound.ts:40-53, 164-168`).
4. **Rate limit** for public-tier callers (reuse `checkPublicKnowledgeRateLimit` pattern at `knowledge-query-inbound.ts:175-194`).
5. **Resolve visibility for the requested path** from the manifest. Default to `private` if no manifest entry exists.
6. **Map visibility → sensitivity** (§4.3.2 table).
7. **Policy gate** — `evaluatePolicy({ peerId, bondLevel, intent: "library.read", requestedSensitivity })`. `deny` / `approval_required` → `{ status: "not_found" }` for non-`contacts` visibility (anti-enumeration); `contacts` ACL misses → `{ status: "forbidden" }`; `allow` → proceed (then compare bond maxSensitivity vs file tier).
8. **For `contacts` visibility** — additional `contactIds` ACL check.
9. **Path safety** — `assertPathInsideVault(resolvedPath, webContentDir)`. Reject on traversal attempt.
10. **Read file** from `<profileDir>/web/<path>` (empty path / trailing slash resolves to `index.md`).
11. **Range handling** — if `range` requested, slice; else full content subject to size cap.
12. **Build response** with `contentType` (MIME sniffed from extension), `contentHash` (sha256), `byteLength`, `etag` (hash prefix).
13. **Sign and deliver** the `library.read.response` envelope.
14. **Audit** the read.

#### 4.4.5 Wire registration

Add to `EnvoyIntentSchema` in `packages/protocol/src/index.ts:4-92`:

```typescript
"library.read"          // Request content by path (senderRole: any → recipientRole: any)
"library.read.response" // Response with content or status
```

Capability requirements (extend `capabilityRequirements` near the existing `knowledge.query` entry):

```typescript
"library.read":          [["vault.retrieve"]],  // closest existing capability; no new `web.serve` token in 45A
"library.read.response": [],
```

### 4.5 Discovery — extending the existing primitives

#### 4.5.1 Extended `LibraryFileMatchSchema`

Add optional fields (backward compatible — old responders omit them, old requesters ignore them):

```typescript
const LibraryFileMatchSchema = z.object({
  // Existing
  documentId: z.string().min(1),
  title: z.string(),
  relativePath: z.string(),
  contentHash: z.string(),
  byteLength: z.number().int().nonnegative().optional(),
  sensitivity: z.enum(["public", "friends", "private"]).optional(),
  cid: z.string().min(1).max(128).optional(),
  // New (Phase 45)
  kind: z.enum(["article", "note", "photo", "gallery", "file", "profile"]).optional(),
  mimeType: z.string().optional(),
  summary: z.string().optional(),
  visibility: z.enum(["public", "bonded", "contacts", "private"]).optional(),
  urlSlug: z.string().optional(),
  updatedAt: z.string().datetime().optional(),
});
```

#### 4.5.2 New capability string

`WEBCONTENT_CAPABILITY = "envoymesh.web-content"` alongside `PUBLISHED_LIB_CAPABILITY`. A node that serves web content advertises both. Discovery queries can request either or both.

#### 4.5.3 Discovery matching extension

Extend `matchPublishedLibraryDocuments` at `apps/node/src/discovery-library-match.ts:5-44` to also match against the new `urlSlug`, `kind`, and `tags` fields. Existing title/content-hash matching is unchanged.

### 4.6 Mobile architecture

Both mobile modes get the new `library.read` method, mirroring the existing `discoverPublishedLibrary` dual-mode pattern:

- **Paired/thin mode:** `HomeRemoteClient.libraryRead({ targetOwnerId, path, range })` → JSON-RPC to home → home executes `library.read` over the mesh using the home's identity and bonds. New method on `MobileNodeService` at `packages/mobile-node/src/index.ts` mirroring `discoverPublishedLibrary` (line 3483).
- **Browser/standalone mode:** `MobileNodeService.libraryRead(...)` builds and signs the `library.read` envelope with `this._state.device.publicKeyPem` and sends via `_sendExpectReplyViaMesh` (line 7443). Requires the mobile to have its own bond with the remote owner (same constraint as direct-mode discovery today).

The Social desktop UI uses the in-process `NodeServiceImpl.libraryRead(...)` (new method on `apps/node/src/node-service-impl.ts`, mirroring `discoverPublishedLibrary`).

### 4.7 Client (browser) UX

#### 4.7.1 Browser view

A new top-level view in both the Social desktop UI and the EnvoyGo mobile app: **"Browser"** (icon: 🌐). Layout:

- **Address bar** at top — accepts `envoy://` URLs (or owner IDs, resolved to `envoy://<owner>/`). Auto-completes from history and bookmarks.
- **Back / Forward / Reload** buttons — standard browser semantics.
- **Bookmark** star — saves the current URL with a user-edited title.
- **Render area** — renders the response based on `contentType`:
  - `text/markdown` → `<Markdown>` component (reuses `apps/social/src/components/Markdown.tsx`).
  - `text/html` → sanitized iframe (DOMPurify).
  - `image/*` → `<img>` with the envoy URL as src (the Browser view intercepts the request and routes through `library.read`).
  - `application/pdf` → `<iframe>` with the envoy URL.
  - `audio/*` / `video/*` → HTML5 `<audio>` / `<video>`.
  - Unknown → download link.
- **Status bar** — loading spinner, "Access denied" (red), "Not found" (yellow), "Offline — content unavailable" (gray).

#### 4.7.2 Link handling

Markdown and HTML served by other nodes can contain `envoy://` links. The Browser view intercepts clicks on `envoy://` URLs and navigates internally (no external browser launch). Links to `https://` URLs in served content are opened in the system browser (the mesh is not a general-purpose web proxy).

#### 4.7.3 Contact integration

A contact's profile panel gains a **"Browse Site"** button (visible when the contact advertises `envoymesh.web-content`). Clicking it opens the Browser at `envoy://<contact's owner>/`. The contact's Agent Card (existing `AgentCardSchema`) gains an optional `webContentRoot: string` field carrying their canonical root URL.

### 4.8 Authoring UX

Phase 45D adds in-app authoring:

- **New item dialog** — pick a template (Profile / Blog post / Photo / Note / File upload), enter title/body, set visibility, click Publish.
- **Markdown editor** — simple textarea with live preview (reuse `Markdown.tsx`). No rich-text editor in v1.
- **Per-item visibility selector** — dropdown mapped to the §4.3 visibility values.
- **File upload** — drag-and-drop a PDF/image into the editor; stored in `<profileDir>/web/files/` and served.
- **Manifest auto-update** — authoring actions write to `web-content.json` automatically; users can also edit it by hand.

Phase 45A (the spike) skips authoring — content is created by manually dropping files into `~/EnvoyMesh/web/` and (optionally) editing the manifest. This keeps the spike small.

## 5. Security model

### 5.1 Trust gating per tier

| Requester bond level | `public` visibility | `bonded` visibility | `contacts` visibility | `private` visibility |
|---|---|---|---|---|
| `self` (owner) | ✅ | ✅ | ✅ | ✅ |
| `direct` | ✅ | ✅ | ✅ if in `contactIds[]` | ❌ `not_found` |
| `referred` | ✅ | ✅ | ❌ unless in `contactIds[]` | ❌ `not_found` |
| `public` (stranger) | ✅ (rate-limited) | ❌ `not_found` | ❌ `not_found` | ❌ `not_found` |
| `blocked` | ❌ `not_found` | ❌ `not_found` | ❌ `not_found` | ❌ `not_found` |

**Anti-enumeration:** Denied reads return `status: "not_found"` (identical to a missing path) on every policy deny — including blocked peers and strangers hitting `contacts`-visibility paths. The only case that returns `forbidden` is when a **bonded** peer (`direct` / `referred`) fails a `contacts` ACL check, so they know to request access. Rate-limited strangers get no response envelope (`ok: false` on the handler) with a rate-limit audit.

Rate limits (reuse existing): public-tier callers are capped at 5 reads/minute/peer (mirrors `checkPublicKnowledgeRateLimit` at `packages/bonds/src/index.ts:326`).

### 5.2 Path safety

All paths are resolved against `<profileDir>/web/` and validated via `assertPathInsideVault` from `packages/vault/src/index.ts:328`. Traversal attempts (`../../../etc/passwd`, absolute paths, symlink escapes) are rejected with `status: "not_found"` (not `forbidden` — the existence of a path outside the web directory should not leak).

### 5.3 Abuse prevention

- **Envelope size cap:** responses are capped at 48 KiB (`MAX_RESPONSE_BYTES` in `library-read-inbound.ts`). Larger files require `range` requests.
- **Rate limiting:** public-tier callers rate-limited per peer.
- **Replay protection:** existing envelope replay suppression in `apps/node/src/inbound-guard.ts` applies.
- **Signature verification:** existing `verifyInboundEnvelope` from `@envoymesh/identity` applies — sender's public key must hash to claimed `senderPeerId`.

### 5.4 Content integrity

Every response carries a `contentHash` (sha256 of body). The Browser view verifies the hash on receipt and refuses to render on mismatch (defense against in-transit tampering by a malicious relay). This mirrors the Data Transfer Voucher's content-hash verification at `apps/node/src/data-transfer-inbound.ts:149`.

## 6. Threat model

| Threat | Mitigation |
|---|---|
| **Malicious publisher** serves malware-laden content | Served content is rendered with `DOMPurify` sanitization (`Markdown.tsx`); HTML is iframe-sandboxed. No script execution escapes the render area. |
| **Malicious reader** enumerates content by guessing paths | Path enumeration is possible (like any web server) but rate-limited for strangers, and `not_found` is returned identically for missing-vs-forbidden to avoid leaking path existence. |
| **Relay tampering** modifies content in transit | Response envelope is signed by the serving node's device key; `contentHash` is verified by the Browser view. Tampered envelopes fail signature verification in `inbound-guard.ts`. |
| **Content leakage** to non-bonded peers | Bonds gate every read (§5.1). Strangers see only `public`-visibility items. |
| **Path traversal** (`../../etc/passwd`) | `assertPathInsideVault` rejects; `not_found` returned (no leakage). |
| **Denial of service** (many large reads) | Per-peer rate limits; envelope size cap; `range` requests only for first chunk. |
| **Stale cached content** after a publish update | `etag` (hash prefix) on responses; Browser view revalidates on Reload. |

## 7. Phased rollout

### 7.1 Phase 45A — Thin vertical slice (architecture spike)

**Goal:** prove the architecture end-to-end with the smallest possible surface. Manual file drop only — no authoring UX, no templates, no bookmarks.

**Scope:**
- URL parser (`packages/api/src/envoy-url.ts`).
- `library.read` / `library.read.response` intent + Zod schemas (`packages/protocol/src/index.ts`).
- Inbound handler `apps/node/src/library-read-inbound.ts` mirroring `knowledge-query-inbound.ts`.
- Content directory at `<profileDir>/web/` + manifest loader.
- Basic Browser view in Social desktop UI (`apps/social/src/components/views/BrowserView.tsx`).
- `NodeServiceImpl.libraryRead(...)` method.
- Discovery capability `"envoymesh.web-content"` advertised.
- **All test layers** per §8.1–§8.4 (URL parser unit, handler trust, two-node vitest E2E, Playwright comprehensive matrix).

**Exit criterion:** Phase 45A Scenario (§9.1) passes — write `~/EnvoyMesh/web/hello.md` **and** a matching `web-content.json` entry on Node A; on Node B (bonded), open Browser, type `envoy://<A's owner>/hello.md`, see `<h1>Hello</h1>` rendered. Plus the Playwright matrix (§8.4) scenarios 1–5 and 7 green; scenario 6 skipped until 45B; scenario 8 asserts bookmark star affordance only (persistence in 45B).

### 7.2 Phase 45B — Browser polish `[x]`

**Scope (shipped 2026-07-20):**
- Back / Forward / Reload navigation history (`browser-history-store.ts` — in-session stack + persisted recent for autocomplete).
- Bookmarks (localStorage per owner + star toggle UI).
- Address-bar autocomplete from history + bookmarks.
- Range requests for large files — server returns `byteLength` on `too_large`; client `fetchLibraryContent` auto-chunks; range bodies always base64.
- ETag-based cache revalidation — request `ifNoneMatch` → response `not_modified`.
- Loading spinner + idle/error states polished.

**Exit criterion:** Back/forward/reload/bookmarks work; large files assemble via ranges; Reload revalidates against `etag`. Playwright scenarios 6 & 8 green.

### 7.3 Phase 45C — EnvoyGo mobile Browser

**Scope:**
- Browser view in EnvoyGo Flutter app.
- `MobileNodeService.libraryRead(...)` in both modes (paired/thin + standalone).
- Mobile → home → mesh request path tested on real devices.
- Mobile bookmark sync via existing owner-device sync.

### 7.4 Phase 45D — Authoring UX (full Step 1)

**Scope:**
- New-item dialog with template picker (Profile / Blog post / Photo / Note / File upload).
- Markdown editor with live preview.
- Per-item visibility selector.
- Manifest auto-update on author actions.
- Templated site types (Blog listing, PhotoWall grid).
- Contact profile "Browse Site" button.
- `envoy init <template>` CLI scaffolding.
- **Exit criterion:** Phase 45D Scenario (§10.2) passes — author → publish → browse.

### 7.5 Phase 45E — Step 2: push, topics, friend discovery

**Scope (sketch — full design TBD at 45E start):**
- New intent `feed.notify` — push a small notification envelope to bonded contacts on publish. Rides existing `/envoymesh/message` stream using `tagContactForPersistentReachability` (`packages/network/src/index.ts:789`). No GossipSub in v1 of 45E.
- Topic-based subscription — declare interests in profile; receive `feed.notify` only for matching topics.
- Friend discovery via published topics — `discovery.request` extended with topic matching; surfaces "people who publish about X".
- **GossipSub decision deferred** — evaluate whether notification-fanout suffices or whether true pubsub is needed, after 45E v1 ships.

### 7.6 Phase 45F — Step 3: external HTTP gateway (future, forward reference)

**Scope (sketch only):**
- `--web-relay` node mode that starts an HTTP server translating `https://relay/<ownerId>/<path>` ↔ `library.read` over the mesh.
- Any node can opt into being a relay.
- Auth model for non-mesh readers TBD (likely: public-tier content only without auth; bearer token in URL for friends-tier).
- **Out of scope for this design doc.** Will be a separate design when ready.

## 8. Test plan

The test plan is the most important part of this design — it is what lets us ship with confidence and what gives reviewers something concrete to validate. Four mandated layers for Phase 45A, per the project's existing conventions.

### 8.1 Layer 1 — URL parser unit tests

**Mirror:** `packages/api/test/` pattern (exhaustive input coverage).
**File:** `packages/api/test/envoy-url.test.ts` (new).
**Run under:** `npm test` (default vitest).

Test cases (~20):

- Valid owner-id URLs (root, single segment, nested, trailing slash).
- `envoy://contact?...` pairing URI correctly classified as pairing, not content URL.
- Percent-encoding: CJK paths, spaces, reserved chars (`%20`, `%E6%88%91`, `%2F`).
- Handle form (`envoy://@allen/...`) parses successfully but `resolve()` throws `HandleRegistryNotImplemented` in v1.
- Malformed inputs (missing owner, empty path, bad scheme, double slashes, missing `//`).
- Round-trip: encode → decode → original path.
- Owner ID normalization (case, padding).
- Path normalization (collapse `//`, strip leading `/`, preserve trailing).
- Disambiguation edge cases: `envoy://contact` (no query string), `envoy://envoymesh/...` (unknown authority).

### 8.2 Layer 2 — Inbound handler trust tests

**Mirror:** `apps/node/test/knowledge-query-inbound.test.ts` (per-tier behavior + audit events).
**File:** `apps/node/test/library-read-inbound.test.ts` (new).
**Run under:** `npm test`.

Test cases (~12):

- Stranger (`public` bond) requests `public`-visibility item → `ok`, bytes returned.
- Stranger requests `bonded`-visibility item → `not_found` (anti-enumeration; not `forbidden`).
- Stranger requests `private`-visibility item → `not_found` (same response shape — no leakage).
- `direct` bond requests `bonded`-visibility item → `ok`.
- `direct` bond requests `contacts`-visibility item where they are in `contactIds[]` → `ok`.
- `direct` bond requests `contacts`-visibility item where they are NOT in `contactIds[]` → `forbidden`.
- `referred` bond requests `bonded`-visibility item → `ok`.
- `blocked` peer requests anything → `not_found`.
- Rate limit exceeded (6th request in a minute from a stranger) → handler `ok: false` with rate-limit reason.
- Path traversal (`../../../etc/passwd`) → `not_found` (no leakage of path existence).
- Path outside web dir (symlink escape) → `not_found`.
- Oversized response (file > envelope cap without `range`) → `too_large`.
- Empty path resolves to `index.md`.
- Audit events emitted correctly: `message.verified`, `library.read.served` / `policy.decided` deny.

### 8.3 Layer 3 — Two-node vitest E2E

**Mirror:** `apps/node/test/library-publish-export-multi-node-e2e.test.ts` (the canonical two-real-mesh-node pattern). Copy the scaffolding verbatim — `createTestNode`, `registerBondedPeer`, `wireXxxHandler`, `connectPeers`.
**File:** `apps/node/test/library-read-multi-node-e2e.test.ts` (new).
**Run under:** `npm run smoke:local` (add to `apps/node/src/local-two-node-smoke.ts:16-57` list).

Test cases (~5):

- `LIBREAD-01`: Bonded A↔B; A has `web/hello.md`; B calls `libraryRead({ targetOwnerId: A, path: "hello.md" })`; assert `status: "ok"`, `body` matches file content, `contentType: "text/markdown"`.
- `LIBREAD-02`: Bonded A↔B; A has `web/photos/cover.jpg`; B reads it; assert binary body round-trips (compare base64 + sha256).
- `LIBREAD-03`: A and B NOT bonded; B attempts read of bonded-visibility item; assert `status: "not_found"`.
- `LIBREAD-04`: Bonded A↔B; A has `web/owner-only.md` with `visibility: "private"`; B attempts read; assert `not_found`.
- `LIBREAD-05`: Bonded A↔B; A updates `web/changelog.md` content; B re-reads; assert response is the updated full content (Reload may send `ifNoneMatch` and receive `not_modified` when unchanged — 45B).

### 8.4 Layer 4 — Playwright full-stack E2E (comprehensive matrix)

**Mirror:** `apps/social/test/e2e/webrtc-call.smoke.ts` (the Phase 38H Playwright pattern) + `apps/social/test/e2e/helpers/node-spawner.ts` (real OS processes) + `apps/social/test/e2e/helpers/social-page.ts` (page object).
**File:** `apps/social/test/e2e/web-content-browse.smoke.ts` (new — matches the `*.smoke.ts` Playwright glob at `playwright.config.ts:16`).
**Run under:** `npm run smoke:web-content` (new script, mirrors `smoke:webrtc-call`).

**Node spawning:** Use `NodeSpawner` to start two real EnvoyMesh OS child processes (Alice, Bob), bonded to each other, plus optionally a third (Carol, unbonded stranger) for the access-denied scenario. Writes config to `data/test-e2e-node{alice,bob,carol}/`.

**Helper extensions:** Extend `SocialPage` page object with:
- `browseToUrl(envoyUrl: string)` — types into Browser address bar, submits.
- `expectRenderedMarkdown(expectedHtml: string)` — asserts on rendered DOM.
- `expectImageRendered(altText: string)` — asserts `<img>` present.
- `expectPdfRendered()` — asserts `<iframe>` present.
- `expectAccessDenied()` — asserts "Access denied" status.
- `expectNotFound()` — asserts "Not found" status.
- `goBack()` / `goForward()` / `reload()`.
- `bookmarkCurrent(title: string)` / `openBookmark(title: string)`.

**Test cases (8 — the comprehensive matrix):**

1. **Fetch markdown → render** — Alice has `web/hello.md` (`# Hello`); Bob opens Browser, types `envoy://<Alice's owner>/hello.md`, asserts heading text appears in render area.
2. **Fetch image → render** — Alice has `web/cover.jpg`; Bob navigates to it; asserts `<img>` with a `blob:` src.
3. **Fetch PDF → render** — Alice has `web/resume.pdf`; Bob navigates to it; asserts `<iframe>` with a `blob:` src.
4. **Stranger denied** — Bob unbonded to Alice attempts to read Alice's `web/hello.md` (bonded visibility); asserts error region (anti-leakage `not_found`).
5. **Bonded allowed** — Bob (bonded to Alice) reads the same item; asserts content renders.
6. **Back button** — navigates to previous page in history stack (45B).
7. **Malformed URL** — Bob types `envoy:///posts/hello`; asserts Go disabled + parse-error region.
8. **Bookmark** — star toggles and persists in localStorage (45B).

**Per-test timeouts:** 60s (Playwright config default), with `page.waitForTimeout` polling for async renders.

### 8.5 CI integration

| Test layer | Command | When |
|---|---|---|
| URL parser unit | `npm test` (default vitest, no env var) | Every PR |
| Handler trust unit | `npm test` | Every PR |
| Two-node vitest E2E | `npm run smoke:local` | Every PR (the curated regression set) |
| Playwright full-stack | `npm run smoke:web-content` | Manual trigger initially; promoted to CI gate after 45A ships green 3× |

The Playwright matrix is initially opt-in (heavy — spawns 2-3 node processes + Chromium). Once it passes reliably on CI, it joins `ci-smoke-local.yml` like the WebRTC smoke.

## 9. Verification scenarios

These are the concrete demos that prove the architecture works. They double as the exit criteria for Phase 45A and Phase 45D.

### 9.1 Scenario 1 — Single-doc drop (Phase 45A exit gate)

**Setup:** Two real EnvoyMesh nodes (Alice on desktop, Bob on desktop or mobile), bonded to each other.

**Steps:**
1. On Alice's machine, create `~/EnvoyMesh/web/hello.md` with content:
   ```markdown
   # Hello from Alice

   This is my first published page on EnvoyMesh.
   ```
2. On Alice's machine, add to `~/EnvoyMesh/web/web-content.json` (required for remote reads — without a manifest entry the file defaults to `private` and bonded peers get `not_found`):
   ```json
   {
     "version": "0.1",
     "entries": [
       {
         "path": "hello.md",
         "title": "Hello from Alice",
         "kind": "article",
         "mimeType": "text/markdown",
         "visibility": "bonded",
         "contentHash": "<sha256>",
         "byteLength": 73,
         "updatedAt": "2026-07-20T12:00:00Z"
       }
     ]
   }
   ```
3. On Bob's machine, open the EnvoyMesh Social app or EnvoyGo mobile app.
4. Navigate to the new **Browser** view.
5. In the address bar, type: `envoy://envoy:owner:<Alice's owner ID>/hello.md`
6. Press Enter.

**Expected result:**
- Loading spinner appears briefly.
- The render area shows:
  ```
  # Hello from Alice

  This is my first published page on EnvoyMesh.
  ```
  rendered as an `<h1>` heading and a paragraph.
- The address bar shows the decoded URL.
- Status bar shows "Loaded" with content type `text/markdown` and byte count.

**Failure modes this scenario catches:**
- URL parser rejects owner-id form → URL parser bug.
- `library.read` envelope not delivered → mesh transport or bonding issue.
- Handler denies bonded peer → Bonds gating misconfiguration.
- File not found → content directory layout wrong.
- Markdown not rendered → renderer integration issue.

**Backed by:** Layer 4 Playwright test #1 (fetch markdown → render) + Layer 3 vitest LIBREAD-01.

### 9.2 Scenario 2 — Full author → publish → browse (Phase 45D exit gate)

**Setup:** Same as Scenario 1, but with the authoring UX shipped.

**Steps:**
1. On Alice's machine, open the Browser view's authoring panel.
2. Click **"New Blog Post"**.
3. Enter title: "My First Post".
4. Enter body:
   ```markdown
   Hello world! This is my first post on my EnvoyMesh blog.
   ```
5. Set visibility to **"Bonded contacts"**.
6. Click **Publish**.
7. On Bob's machine, open Browser.
8. In the address bar, type: `envoy://envoy:owner:<Alice's owner ID>/blog/`
9. See the Blog index with "My First Post" listed.
10. Click "My First Post".

**Expected result:**
- Step 6: Alice sees a "Published" confirmation. The file `~/EnvoyMesh/web/blog/posts/my-first-post.md` exists; `web-content.json` has a new entry.
- Step 9: Bob sees a Blog index page listing "My First Post" with summary and date.
- Step 10: The post renders as Markdown with `<h1>My First Post</h1>` and the body paragraph.

**Failure modes:** authoring UX bugs, manifest write bugs, listing query bugs, click-through navigation bugs.

**Backed by:** A second Playwright spec added in Phase 45D (`web-content-author-browse.smoke.ts`).

## 10. Alternatives considered

### 10.1 Extend `knowledge.query` instead of adding `library.read`

**Rejected.** `knowledge.query` is LLM-coupled — its handler routes through `routeModelRequestWithCostTracking` to synthesize a natural-language answer. Serving raw bytes is the wrong shape. Extending its schema with a path selector would also bifurcate the handler into two code paths (search vs. file-read), making it harder to maintain. See §3.3 for the full rationale.

### 10.2 Reuse Data Transfer Voucher for pull

**Rejected.** The Data Transfer Voucher pipe is push-only (`/envoymesh/data/0.1.0`, issuer pushes bytes to receiver). Step 1 is pull-on-demand — the reader requests content by URL when they open it. Push remains the right tool for Step 2 pre-caching and is forward-referenced there.

### 10.3 Add GossipSub for v1 push notifications

**Rejected for v1.** GossipSub (`@libp2p/gossipsub`) is a significant new dependency — topic management, message ordering, dedup, subscription lifecycle. For v1 pull-on-demand, it is overkill. Step 2 (§7.5) starts with a notification-fanout over the existing message stream; GossipSub is evaluated only if that proves insufficient.

### 10.4 Direct HTTP from the home node

**Rejected.** Running an HTTP listener on the home node gives up everything EnvoyMesh is for — it becomes a public attack surface requiring port forwarding, public IP, DNS, HTTPS certs, and reinvented auth. The mesh already handles NAT traversal, identity, signing, and trust gating. The user experience can feel exactly like browsing a website (URL paths, links, instant load) while the transport stays mesh-native. External HTTP is Step 3 (gateway), not a property of the home node.

### 10.5 Handle URLs in v1

**Rejected for v1, reserved for v2.** `envoy://@allen/...` is appealing but requires a handle registry (who owns `@allen`?), collision handling, and a resolution mechanism. The owner-id form is stable, self-sovereign, and works today. The parser accepts the handle form so v2 URLs work without a parser change, but v1 rejects them at resolve time with a clear error.

### 10.6 Gemini's `web.proxy.*` / `web.request` / `web.response` / `feed.publish` intent family

**Rejected as duplicating existing machinery.** Gemini's proposal (from the user's discussion) suggested parallel `web.*` intents that mirror what `knowledge.query` and `discovery.request` already do. Adding parallel intents would split the codebase into two content-retrieval paths with separate trust policies. The right move is one new intent (`library.read`) that reuses the existing Bonds gate, plus small additive extensions to `LibraryFileMatchSchema` and the discovery capability set.

## 11. Open questions for owner review

These are decisions that need the owner's input before or during implementation. The design is complete enough to start Phase 45A without resolving most of them.

| # | Question | Default if unresolved | Phase that needs it |
|---|---|---|---|
| 1 | Handle registry mechanics (centralized? per-node? web-of-trust?) | Defer to v2; owner-id only in v1 | Post-45E |
| 2 | GossipSub vs. notification-fanout for Step 2 push | Notification-fanout first; evaluate GossipSub if insufficient | 45E |
| 3 | HTTP gateway auth model for non-mesh readers (bearer token? invite link?) | TBD at 45F design time | 45F |
| 4 | Content versioning strategy (preserve old `contentHash` history?) | No version history in v1; `etag` for cache revalidation only | Post-45D |
| 5 | Image gallery specifics (thumbnail generation? EXIF? captions file format?) | Manual thumbnails in v1; auto-generation post-45D | 45D |
| 6 | Mobile direct-mode bond requirements (must mobile have its own bond with every contact whose content it browses?) | Yes — same constraint as direct-mode discovery today | 45C |
| 7 | Should `library.read` support directory listing (render `index.md` automatically on path `/`)? | **Resolved 45A:** yes — empty path / trailing slash → `index.md` via `resolveWebContentPath` | 45A |
| 8 | Streaming large files over `/envoymesh/data/0.1.0` instead of envelope chunking? | Range requests in 45B; streaming protocol variant post-45B | 45B+ |
| 9 | Should the Browser view render remote `<form>` POSTs (interactive sites)? | No in v1 — read-only browsing; forms post-45E | Post-45E |
| 10 | Content moderation / abuse reporting flow? | Reuse existing block/bond-revoke; reporting flow post-45E | Post-45E |

## 12. File-by-file change map

Per sub-phase. New files marked `(new)`; modified files show the nature of the change.

### Phase 45A

| File | Change |
|---|---|
| `packages/api/src/envoy-url.ts` (new) | URL parser: `parseEnvoyUrl`, `buildEnvoyUrl`, `resolveEnvoyUrl`, `tryParseEnvoyUrl`, `isEnvoyContentUrl` |
| `packages/api/src/index.ts` | Re-export envoy-url helpers |
| `packages/api/test/envoy-url.test.ts` (new) | Layer 1 unit tests |
| `packages/protocol/src/index.ts` | Add `"library.read"` / `"library.read.response"`; schemas; extend `LibraryFileMatchSchema`; capability requirement `vault.retrieve` |
| `packages/protocol/test/library-read-payload.test.ts` (new) | Schema parse/build/round-trip tests |
| `packages/bonds/src/index.ts` | Public-tier allow + referred-tier friends maxSensitivity for `library.read` |
| `apps/node/src/library-read-inbound.ts` (new) | Inbound handler; anti-enumeration `not_found` on policy deny; `forbidden` only on contacts ACL miss |
| `apps/node/src/cli-mesh-inbound-library-read.ts` (new) | CLI dispatcher arm |
| `apps/node/src/web-content-store.ts` (new) | Loads `web-content.json`; `resolveWebContentPath`; default visibility `private` |
| `apps/node/src/node-service-impl.ts` | `libraryRead` RPC; web-content DHT topic when manifest has entries |
| `apps/node/src/node-service-fileshare.ts` | `libraryReadViaRuntime` helper |
| `apps/node/src/node-service-capability-discovery.ts` | Reprovide `capability:envoymesh.web-content` when web content exists |
| `apps/node/src/capability-discovery.ts` | `WEB_CONTENT_DHT_TOPIC` + `withWebContentDiscoveryTopic` |
| `apps/node/src/discovery-inbound.ts` | `WEB_CONTENT_CAPABILITY`; merge web-content matches; stranger gate accepts capability |
| `apps/node/src/discovery-library-match.ts` | `matchWebContentEntries` (title / path / urlSlug / kind / tags) |
| `apps/node/src/json-rpc-router.ts` | Register `libraryRead` RPC |
| `apps/node/test/library-read-inbound.test.ts` (new) | Layer 2 trust tests |
| `apps/node/test/library-read-multi-node-e2e.test.ts` (new) | Layer 3 two-node vitest E2E |
| `apps/node/src/local-two-node-smoke.ts` | Add Layer 3 test to smoke list |
| `packages/api/src/node-service.ts` | Add `libraryRead` to `NodeService` |
| `packages/mobile-node/src/index.ts` | `libraryRead` (paired mode; standalone stubbed until 45C) |
| `apps/social/src/lib/direct-call-client.ts` | `libraryRead` passthrough |
| `apps/social/src/components/views/BrowserView.tsx` (new) | Browser view (address bar, render area, status, bookmark star affordance — inlined; no separate AddressBar/RenderArea components in 45A) |
| `apps/social/src/App.tsx` + `Header.tsx` | Browser route/tab |
| `apps/social/src/i18n/` | Browser strings (en + zh-CN) |
| `apps/social/test/components/BrowserView.test.tsx` (new) | Component test |
| `apps/social/test/e2e/web-content-browse.smoke.ts` (new) | Layer 4 Playwright matrix |
| `apps/social/test/e2e/helpers/` | `NodeSpawner` + `SocialPage` browser helpers |
| `package.json` (root) | `smoke:web-content` script |

Note: Social imports URL helpers from `@envoymesh/api` (no separate `apps/social/src/lib/envoy-url.ts`).

### Phase 45B (shipped)

| File | Change |
|---|---|
| `apps/social/src/lib/browser-history-store.ts` (new) | Nav stack + persisted recent for autocomplete |
| `apps/social/src/lib/browser-bookmark-store.ts` (new) | Bookmark persistence (localStorage per owner) |
| `apps/social/src/lib/library-read-fetch.ts` (new) | Range auto-chunk + `ifNoneMatch` client |
| `apps/social/src/components/views/BrowserView.tsx` | History / bookmarks / autocomplete / reload |
| `apps/node/src/library-read-inbound.ts` | `too_large` metadata, `not_modified`, range base64 |
| `packages/protocol` + `packages/api` | `ifNoneMatch` request field; `not_modified` status |

### Phase 45C

| File | Change |
|---|---|
| `apps/mobile/` (Flutter) | New Browser screen mirroring Social desktop BrowserView |
| `packages/mobile-node/src/index.ts` | `libraryRead` already added in 45A — wire to Flutter RPC |
| `apps/mobile/test/...` | Mobile browser smoke tests |

### Phase 45D

| File | Change |
|---|---|
| `apps/social/src/components/views/BrowserAuthorView.tsx` (new) | Authoring dialog |
| `apps/social/src/components/MarkdownEditor.tsx` (new) | Textarea + live preview |
| `apps/social/src/components/VisibilitySelector.tsx` (new) | Per-item visibility dropdown |
| `apps/node/src/web-content-store.ts` | Manifest write on author actions |
| `apps/node/src/node-service-impl.ts` | `publishWebContentEntry`, `updateWebContentEntry`, `unpublishWebContentEntry` |
| `apps/cli/src/index.ts` | `envoy init <template>` scaffolding |
| `apps/social/src/components/views/ContactProfilePanel.tsx` | "Browse Site" button |
| `packages/api/src/agent-card.ts` (or protocol schema) | Optional `webContentRoot` field on AgentCard |

## 13. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| URL scheme needs to change after launch | Low | Catastrophic (breaks all shared links) | Owner-id form is permanent by design; handle form is additive only. See §4.1.5. |
| Envelope size cap blocks large files | High | Medium | Range requests in 45B; streaming variant post-45B. Most blog posts / images fit in 48 KiB. |
| Path enumeration leaks content existence | Medium | Low | Rate-limit strangers; return `not_found` identically for missing-vs-forbidden. |
| Malicious content (XSS in served Markdown) | Medium | High | `DOMPurify` sanitization (existing in `Markdown.tsx`); HTML iframe-sandboxed; no script escapes render area. |
| Mobile direct-mode bond requirement surprises users | Medium | Medium | Document clearly; mobile paired-mode (via home) is the default and requires no per-contact bond. |
| Playwright E2E flaky on CI | High | Low | Start as manual trigger; promote to CI gate after 3 green runs; generous timeouts. |
| Discovery query volume overload | Low | Medium | Existing rate limits apply; capability-topic reprovide cadence unchanged. |

## 14. Out-of-scope (forward references)

Explicitly NOT in this design (separate future work):

- External HTTP gateway (Phase 45F).
- GossipSub / true pubsub (Phase 45E evaluation).
- Handle registry / pretty URLs (post-v2).
- Content versioning / edit history.
- Rich-text editor (textarea + Markdown only in v1).
- Interactive forms / POST handling.
- Search engine / full-text search across mesh content.
- Monetization / paid content.
- Content moderation tooling beyond block/bond-revoke.

## 15. Decision log

| Date | Decision | Rationale |
|---|---|---|
| 2026-07-20 | URL scheme is `envoy://{owner}/{path}` with owner-id form in v1, `@handle` reserved for v2 | Owner IDs are permanent and self-sovereign; handles need a registry. The parser accepts both forms so v2 URLs work without parser changes. See §4.1. |
| 2026-07-20 | One new intent pair `library.read` / `library.read.response`, not extending `knowledge.query` | `knowledge.query` is LLM-coupled and has no path selector. The new intent reuses the Bonds gate pattern but has a path selector and raw-bytes response. See §4.4.1, §10.1. |
| 2026-07-20 | Visibility is per-item, mapped to Bonds sensitivity tiers; no URL tokens | Reuses existing trust model; single URL works for bonded (sees content) and stranger (sees 403). See §4.3. |
| 2026-07-20 | Templated site types are conventions, not new schemas | Lets users add new types without protocol changes. See §4.2.3. |
| 2026-07-20 | Four test layers in Phase 45A, including Playwright comprehensive matrix with real OS processes | Matches the project's strongest verification convention (Phase 38H). Catches integration bugs that unit tests miss. See §8. |
| 2026-07-20 | GossipSub deferred to Phase 45E evaluation | v1 is pull-on-demand; push notifications can ride the existing message stream. See §7.5, §10.3. |
| 2026-07-20 | Denied reads return `not_found` (not `forbidden`) except `contacts` ACL misses | Anti-enumeration; matches threat model. See §5.1. |
| 2026-07-20 | Capability requirement is `vault.retrieve` (not a new `web.serve` token) | Reuses existing device capability; DHT still advertises `envoymesh.web-content`. |
| 2026-07-20 | Empty path / trailing slash → `index.md` | Resolves open question #7 for 45A. |

## 16. References

### Source files

- `apps/node/src/published-library-store.ts` — published library storage format
- `apps/node/src/node-service-fileshare.ts:189-198` — `setLibraryItemPublishedViaRuntime`
- `apps/node/src/discovery-inbound.ts:35,74-90,99-162` — discovery handler, capability gate, published-library matching
- `apps/node/src/discovery-library-match.ts:5-44` — match logic
- `apps/node/src/knowledge-query-inbound.ts:69-416` — knowledge.query handler (the pattern to mirror)
- `apps/node/src/cli-mesh-inbound-knowledge-query.ts:55-141` — dispatcher arm (the pattern to mirror)
- `packages/bonds/src/index.ts:110,326` — `evaluatePolicy`, public rate limiter
- `packages/vault/src/index.ts:76-105,328` — `VaultContentManifest`, `assertPathInsideVault`
- `packages/network/src/index.ts:1654-1761,789` — `provideCapabilityTopic`, `tagContactForPersistentReachability`
- `packages/protocol/src/index.ts:994-1067,1027-1038,377-380` — discovery payloads, `LibraryFileMatchSchema`, capability topic record
- `packages/mobile-node/src/home-remote-client.ts:116-616` — `HomeRemoteClient` (thin mode)
- `packages/mobile-node/src/index.ts:597,1700-1704,3483,7443` — mobile standalone mode, `discoverPublishedLibrary`, `_sendExpectReplyViaMesh`
- `apps/node/src/client-proxy-handler.ts:121` — `routeRpcMethod` (home-side mobile RPC dispatch)
- `apps/social/src/components/Markdown.tsx` — Markdown renderer (reused as-is)
- `apps/social/test/e2e/helpers/node-spawner.ts` — Playwright node spawner
- `apps/social/test/e2e/helpers/social-page.ts` — Playwright page object
- `apps/social/test/e2e/webrtc-call.smoke.ts` — Phase 38H Playwright pattern (the template for §8.4)
- `apps/node/test/library-publish-export-multi-node-e2e.test.ts` — canonical two-node mesh E2E pattern (the template for §8.3)
- `apps/node/test/knowledge-query-inbound.test.ts` — handler trust test pattern (the template for §8.2)
- `apps/node/src/local-two-node-smoke.ts:16-57` — smoke test list (where to register the new E2E file)

### Related design docs

- [agent_network.md](./agent_network.md) — Agent Network Collaboration Layer (template for this doc's structure)
- [knowledge-base-and-rag.md](./knowledge-base-and-rag.md) — Knowledge Base design (closest feature analog)
- [p2p-discovery.md](./p2p-discovery.md) — Discovery design
- [implementation-plan.md → Phase 45](./implementation-plan.md#phase-45--web-content-browsing--future) — roadmap entry
- [high-level-design.md](./high-level-design.md) — system overview
- [security.md](./security.md) — security model

### External references

- The user's discussion with Gemini on serving content over the mesh (informed §10.6).
- RFC 3986 — URI generic syntax (path percent-encoding rules).
- Secure Scuttlebot / Manyverse — prior art on decentralized social content over a mesh (informed the phased approach).
- Tor Onion Services — prior art on URL-addressable content from a hidden server via relay (informed Step 3 gateway thinking).
