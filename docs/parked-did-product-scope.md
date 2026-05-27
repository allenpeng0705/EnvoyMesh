# Parked scope — DID as first-class product identity (Scenario 1)

**Status:** First slice shipped (2026-05-20) — `did:key` presentation + Profile UI + **bonded Search lookup**. WAN resolver/import UX remains parked.

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
5. **Still open:** WAN resolver / import from external wallets.

---

## Decision

**Partially un-parked (presentation slice).** Cryptographic identity path remains `envoy:owner:*` + Ed25519 PEM. Full DID product (resolver, import, custom method) stays parked until partner integration requires it.
