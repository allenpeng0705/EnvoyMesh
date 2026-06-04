# Parked scope — DID as first-class product identity (Scenario 1)

**Status:** First slice shipped (2026-05-20) — `did:key` presentation + Profile UI + **bonded Search lookup**. **Local import** (did:key + JSON DID document → cache for lookup) shipped 2026-05-27; WAN gateway resolver remains parked.

**Scenario:** Identity birth — stable cryptographic identity visible to users as a portable DID, not only `envoy:owner:<hash>`.

**Implementation:** `@envoymesh/api` [`owner-did-presentation.ts`](../packages/api/src/owner-did-presentation.ts) · RPC `getOwnerDidPresentation` · Social Profile **Identity** section.

---

## Current baseline

| Layer | Today |
|-------|--------|
| Signing | Ed25519 via `@envoymesh/identity` / `@envoymesh/mobile-identity` |
| Stable IDs | `envoy:owner:*`, `envoy:device:*`, `envoy:agent:*`, runtime `envoy_*` peer IDs |
| Verification | Canonical JSON signatures on envelopes, mandates, device certs |
| DID docs | Directional mentions in [protocol-standard.md](./protocol-standard.md); no DIDKit integration |

LAN “find by owner id” (Story F) works via peer directory + `system.signal` without W3C DID resolution.

---

## Product gaps

- **User-visible DID** — QR / profile shows `did:…` string importers recognize
- **DID document** — maps verification keys, service endpoints (relay, agent), optional human profile
- **Resolution** — local cache + optional DHT/Web gateway; no central resolver dependency
- **Interoperability** — import/export with other DID wallets (Phase 10 interop golden files are envelope-level, not DID-level)

---

## Proposed mapping (draft)

```
envoy:owner:<sha256(pubkey)>  ←→  did:envoy:<method-specific-id>  (method TBD)
```

Requirements for method selection:

- Self-sovereign creation (no issuer)
- Ed25519 verification relationship
- Revocation via owner-signed device revocation records (already shipped)

---

## First slice (when un-parked)

1. ~~Choose DID method (`did:key` bridge vs custom `did:envoy`)~~ **`did:key` chosen (2026-05-20).**
2. ~~Export DID document JSON from existing owner key (read-only, no migration required)~~ **Shipped via `getOwnerDidPresentation`.**
3. ~~Social Profile shows copyable DID + `envoy:owner:*` alias~~ **Shipped in Profile → Identity.**
4. ~~**Optional (still open):** resolve `did:…` in Search for bonded contacts only.~~ **Shipped:** Search **By DID** tab + `searchPeers({ did })` + `contact-owner-keys.json`.
5. ~~**Optional (still open):** resolve `did:…` in Search for bonded contacts only.~~ **Shipped:** Search **By DID** tab + `searchPeers({ did })` + `contact-owner-keys.json`.
6. **Shipped (local import):** Search → By DID → paste `did:key` or JSON DID document → `resolveDidImport` + `cacheDidContactKey` (2026-05-27).
7. **Still open:** WAN gateway resolver (HTTP/DHT) for strangers without prior key material.

## Second slice (2026-06-03) — Service endpoints + portable export/import

- **Service endpoints in the DID document.** `buildOwnerDidPresentation` now accepts a `services` array. Each entry is `{ id, type, serviceEndpoint, description? }` with `type` being one of `EnvoyMeshRelay` / `EnvoyMeshAgent` / `EnvoyMeshProfile` (extensible).
- **Auto-population at runtime.** `NodeServiceImpl.exportDidDocument()` auto-fills `services` with the active relay URL (`#envoy-relay`) and the local agent peer id (`#envoy-agent`) when no explicit services are passed.
- **Portable export envelope.** `exportDidDocumentJson` returns an envelope `{ envelope: "envoymesh-did-export-v1", exportedAt, did, ownerId, publicKeyPem, document }` so an importer can detect EnvoyMesh exports and refuse tampered ones.
- **Strict resolve.** `resolveDidExportInput` validates: envelope version, JSON shape, `did` / `ownerId` / `publicKeyPem` / `document` / `exportedAt` field presence, and re-resolves the document to confirm `did` and `ownerId` match.
- **Service validation.** `validateDidServices` rejects non-array, missing `id` (must start with `#`), missing `type`, or missing `serviceEndpoint`.
- **15 new tests** in `packages/api/test/did-import.test.ts` cover: service-endpoint inclusion/omission, envelope shape, full export → resolve round-trip, envelope-version rejection, JSON syntax rejection, did/ownerId mismatch rejection, service validation (accepts, rejects non-array, rejects missing fields, rejects id without `#`, rejects missing endpoint).

## Decision

**Partially un-parked (presentation slice + portable-export slice).** Cryptographic identity path remains `envoy:owner:*` + Ed25519 PEM. Full DID product (resolver, import, custom method) stays parked until partner integration requires it.
