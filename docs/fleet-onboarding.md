# Fleet Onboarding

EnvoyMesh ships four operator-facing paths for bringing a company fleet
online. They are layered: the simplest requires the most manual setup, the
most automated requires the most opt-in trust.

| Path | Where it lives | Operator experience | Default state |
|---|---|---|---|
| **A — Company invite link** | `Settings → Agent Network → Company Invites` (issuer) + URL paste (joiner) | Issuer mints a link in the UI; joiner pastes it in their own UI. No QR scan, no LAN. | **On** (a home node can always issue invites). |
| **B — Fleet Manifest import** | `Settings → Agent Network → Fleet Manifest` | Operator pastes a JSON roster, signs it with the home node's owner key, imports it. All members are pre-staged in one click. | **On** (operator-only action). |
| **C — LAN auto-bond** | `Settings → Agent Network → LAN auto-bond` | Two home nodes on the same LAN with matching `lanAutoBondFleetToken` automatically bond at `direct` trust. | **Off**. The toggle must be flipped on per node. |
| **D — Pairing Kiosk** | `Settings → Agent Network → Pairing Kiosk` | A tiny HTTP server on the home node mints one-shot invites via a one-button web page. Useful for office kiosks / AirDrop-style flows. | **Off**. Binds to `127.0.0.1` by default; opt-in LAN bind. |

All four paths now live under a single tab — `Settings → Agent Network` —
with a quick-reference intro that explains which path fits which team.
`Settings → Devices` is now just the authorized-devices list.

All four paths land in **Phase 35 (A → C → D → B)**. The first three were
shipped in earlier commits; this doc also covers B, which is the most
powerful and the most dangerous, so it lands last.

## Threat model

- The operator who runs the home node **trusts themselves**. They own the
  owner's signing key (Ed25519, derived from `envoy:owner:<sha256(pubkey)>`).
  Every onboarding path below eventually reduces to *the operator's word is
  authoritative about who is in this fleet*.
- Joiners prove their identity by holding a private key whose pubkey hashes
  to an `ownerId` the manifest / invite / kiosk payload names.
- A LAN peer (path C) is treated as a stranger until both sides have
  matching `lanAutoBondFleetToken` configured.
- The kiosk (path D) is bound to loopback by default; even when bound to a
  LAN address, the `kioskAdminToken` is the only way to ask the server to
  mint an invite, and the token is never written to the audit log.
- The fleet manifest (path B) is signed by the issuer's owner key. A
  receiver verifies the signature and `issuerOwnerId` match before doing
  anything; an attacker who steals only the manifest (without the owner's
  private key) cannot forge a new one.

## Shared primitives

All four paths reuse the same small set of building blocks.

### `CompanyInviteRecord` (A)

A long-lived, owner-issued bearer token. Issued by a home node, redeemed
once by a joiner. Lives in `LocalCompanyInviteStore` (`fleet-manifests.json`).
Schema: `packages/api/src/company-invite.ts`.

- The bearer token is a 32-byte random base64url string.
- The store enforces `expiresAt`, `usedAt`, `usedByDeviceId`, `revokedAt`.
- `validatePairingToken(token)` checks QR tokens, session tokens, and
  company invite tokens in that order.

### `FleetManifest` (B)

A signed JSON roster of every device in a fleet. Lives in
`LocalFleetManifestStore` (`fleet-manifests.json`). Schema:
`packages/api/src/fleet-manifest.ts`, Zod: `packages/protocol/src/index.ts`
(`FleetMemberSchema`, `UnsignedFleetManifestSchema`, `FleetManifestSchema`).

- Each `FleetMember` carries `ownerId`, `deviceId`, `devicePublicKeyPem`,
  `role`, `trustLevel`, optional `displayName`, optional `note`.
- The manifest is signed by the issuer's owner key. The receiver verifies:
  1. `verifyCanonicalPayload(manifest, issuerOwnerPublicKeyPem)` returns
     `true`.
  2. `deriveOwnerId(issuerOwnerPublicKeyPem) === manifest.issuerOwnerId`.
  3. `manifest.expiresAt` is null or in the future.
  4. The manifest does not include the local owner (self-bond guard).
- The walker is idempotent. Re-importing the same `manifestId` is a no-op
  unless `force: true`.
- Each pre-staged trust record carries `note: "fleet-manifest:<id>:<role>"`
  so revocation can target the right records.

### `lanAutoBondFleetToken` (C)

A long-lived shared secret stored in `PersistedNodeConfig`. Two home nodes
auto-bond when **both** have `lanAutoBondEnabled: true` **and** the same
`lanAutoBondFleetToken`. The token is never written to the audit log;
its `fingerprint` (first 8 chars of `sha256(token)`) is logged instead.

### `pairingKiosk*` (D)

A small HTTP server that lives on the home node. Off by default. The
operator can bind it to `0.0.0.0` only after flipping a
`pairingKioskAllowLanBind` toggle; the `kioskAdminToken` is a Bearer
secret required to mint invites via `POST /pair`. The kiosk never
exposes the owner's private key or any other secret.

## Path A — Company invite link (shipped)

The home node mints a `CompanyInviteRecord`. The joiner pastes the
`envoy://invite?token=...` URI into their own Social UI; their node calls
`acceptFleetInvite`-style logic that calls `pairDevice` with the
issuer's bearer token. The issuer's `validatePairingToken` accepts the
token, the joiner proves ownership of their own device key, and the
issuer sets a `direct` trust record on the joiner.

Best for: small teams (1–20 members) where the operator can hand out
links in person or via Slack.

## Path B — Fleet Manifest import (shipped)

The operator already has the public keys of every member (perhaps
provisioned out of band, perhaps gathered from a deployment pipeline).
They construct a `FleetManifest` and either:

- **paste the member JSON into the home node's UI and click Sign**, which
  calls `createFleetManifest` (the home node signs with its own owner
  key) and then `importFleetManifest`; or
- **import an already-signed manifest from a file or curl body**, which
  calls `importFleetManifest` directly.

The walker applies the manifest:

1. Verifies the signature and `issuerOwnerId`.
2. Walks each member and pre-stages:
   - `TrustRecord { level: trustLevel, displayName, note: "fleet-manifest:<id>:<role>" }`
   - `PeerDirectory` placeholder row with the libp2p peer id derived from
     `devicePublicKeyPem`.
3. Stores the `FleetManifestRecord` for later revocation.
4. Emits a `message.verified` audit event with the manifest id and the
   `+added / +updated / +skipped` summary.

The joiners don't need to do anything special. When their first
`bond.request` arrives, the home node's `acceptHello` short-circuits
because there's already a trust record.

**Revocation** drops the trust record back to `public` and marks the
manifest as revoked. Trust records that have been *upgraded* since
import (e.g. the user shared a library item with the joiner) are
preserved — only the manifest-prefixed ones are reset.

Best for: medium-to-large teams (20+ members) where the operator has a
canonical roster. Also useful for fleet rollouts where every member is
pre-inventoried.

## Path C — LAN auto-bond (shipped, opt-in)

Two home nodes on the same LAN with `lanAutoBondEnabled: true` and a
matching `lanAutoBondFleetToken` will:

1. The first node to discover the second via mDNS calls
   `buildLanAutoBondRequest` and sends a signed `device.pair.request`
   carrying `lanFleetToken`.
2. The second node receives the request. The dispatcher checks
   `lanAutoBondEnabled` and `lanAutoBondFleetToken`. If both sides agree
   on the token, it auto-accepts at `direct` and sends back a
   `device.pair.response`.
3. Both sides pre-stage trust records and continue normally.

The token never appears in the audit log; only the fingerprint does.

**Why opt-in?** The default case is *I do not want my home node to
silently trust everyone on this coffee-shop Wi-Fi*. The toggle is in
`Settings → Agent Network → LAN auto-bond`, off by default. The token
field is empty by default — the operator must paste a long random
string and propagate it (out of band) to other nodes.

Best for: office LANs where every member is in a known physical
location and the operator is comfortable with the trust implications.

## Path D — Pairing Kiosk (shipped, opt-in)

A minimal HTTP server bound to the home node. When the kiosk is on
(`pairingKioskEnabled: true`), it serves:

- `GET /` — a one-button HTML page. Click the button, the kiosk asks the
  home node to mint a fresh `CompanyInviteRecord`, and the page displays
  the resulting `envoy://invite?token=...` URI for the operator to scan
  or copy.
- `GET /health` — `200 ok`.
- `POST /pair` — programmatic, requires `Authorization: Bearer <admin-token>`.
  Body: `{ "expiresInHours": 24 }`. Response: the invite JSON.

The kiosk never exposes the owner's private key, the admin token, the
fleet token, or any other secret. The HTML page does not embed the
admin token; the button calls the server with the token the operator
configured.

**Security knobs**:

- `pairingKioskEnabled: false` by default.
- `pairingKioskBindAddress: 127.0.0.1` by default. The kiosk refuses to
  bind to `0.0.0.0` / `::` / a LAN address unless
  `pairingKioskAllowLanBind: true`.
- `pairingKioskAdminToken` is required, must be ≥ 16 characters, is never
  written to the audit log, and is checked via `crypto.timingSafeEqual`.
- Optional `pairingKioskExpiresAt` is honored at request time. After
  expiry, the kiosk returns `410 Gone` for every route.

Best for: office kiosks / "AirDrop-style" flows where an operator can
walk up to a screen and click a button.

## Path interaction

The four paths are not mutually exclusive. A typical company rollout
might use all four:

1. **Day 0 (the operator)**: stand up the company home node. Mint a
   `lanAutoBondFleetToken` and a `pairingKioskAdminToken`.
2. **Day 1 (first 5 members)**: operator pastes a `CompanyInvite` link
   in Slack; the five members paste it into their own UIs.
3. **Day 7 (10 more members, all in the office)**: operator turns on
   `lanAutoBondEnabled` on every node with the same
   `lanAutoBondFleetToken`. New joiners walk into the office and bond
   automatically.
4. **Day 14 (a 30-person fleet, including remote members)**: operator
   composes a `FleetManifest` from the company's directory, signs it,
   and imports it on every home node. New joiners don't have to do
   anything — they're recognized on first contact.
5. **Office visitors**: the kiosk stays on with `kioskAdminToken`
   rotating weekly; visitors can click the button and get a one-shot
   invite that expires in 24 hours.

Each path can be turned on or off independently. Revoking a manifest
doesn't disable the kiosk. Disabling LAN auto-bond doesn't invalidate
existing company invites. The store files (`fleet-manifests.json`,
`fleet-tokens.json`, `company-invites.json`, `pairing-kiosk.json`) are
intentionally separate so the operator can audit each one.

## Audit and observability

Every action on every path emits a JSONL audit event:

- `createCompanyInvite` / `listCompanyInvites` / `revokeCompanyInvite` →
  audit `summary: "Company invite created; fingerprint=<fp>"`.
- `importFleetManifest` / `revokeFleetManifest` → audit
  `summary: "Fleet manifest <id> applied; +N new, M updated, K skipped"`.
- LAN auto-bond send / receive → audit `summary: "lan-auto-bond request
  sent; fp=<fp>"` and matching receive event.
- Kiosk `POST /pair` → audit `summary: "Kiosk minted invite;
  fingerprint=<fp>"`.

`fp` is the **first 8 chars of `sha256(token | signature | pem)`** —
never the secret itself. The full secret lives only in
`0o600` JSON files under `profileDir` and in the manifest's signature
field (where the operator chose to put it).

## Future work (not in this milestone)

- **Fleet Manifest with role templates**: today each `FleetMember` carries
  its own `role` and `trustLevel`. A future iteration could let the
  manifest reference a `RoleTemplate` (also signed) so the operator
  doesn't have to repeat role names across hundreds of members.
- **Multi-issuer manifests**: today one manifest is signed by one owner
  key. A future iteration could allow a manifest to be co-signed by
  multiple owners for high-trust rollouts.
- **Kiosk QR generation**: today the kiosk returns the URI as text. A
  future iteration could embed a QR code in the HTML page so a phone
  can scan it directly.
- **Out-of-band kiosk auth (TOTP)**: the kiosk currently uses a static
  Bearer token. A future iteration could rotate it via TOTP for
  scenarios where the operator doesn't want to type a long token every
  time.
