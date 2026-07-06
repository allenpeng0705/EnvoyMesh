# Agent Network Fleet — Deployment Guide

> **Who this is for:** the person standing up EnvoyMesh for a company or team.
> **What it covers:** how to pick an onboarding path, a day-by-day rollout
> playbook, and the per-path quickstart. For the wire-protocol reference, see
> [`fleet-onboarding.md`](./fleet-onboarding.md); for the multi-agent *chains*
> feature, see [`agent_network.md`](./agent_network.md).

EnvoyMesh has no central account server. A "fleet" is just a set of nodes whose
owners have decided to trust each other. This guide shows the four ways to get
peers bonded so they can chat, share, and run multi-agent chains together.

---

## 1. Decision tree — which path should I use?

```
How many members are you onboarding?
│
├─ 1–5, right now, remote ───────────────► Company Invite (Path A)
│
├─ 5–20, mostly remote ─────────────────► Company Invite (A) + Bond Autonomy
│
├─ Everyone on the same office Wi-Fi ───► LAN Auto-Bond (Path C)
│
├─ 20+, pre-inventoried roster ─────────► Fleet Manifest (Path B)
│
└─ Walk-up visitors / kiosk ────────────► Pairing Kiosk (Path D)
```

| Path | Best for | Trust established by | Joiner action |
|------|----------|----------------------|---------------|
| **A — Company Invite** | Small/remote teams | Bearer token (single-use) | Paste `envoy://invite?token=…` |
| **B — Fleet Manifest** | 20+ pre-listed nodes | Operator-signed roster | None (recognized on first contact) |
| **C — LAN Auto-Bond** | Office Wi-Fi | Shared fleet token | None (auto on same LAN) |
| **D — Pairing Kiosk** | Walk-up visitors | Kiosk-minted invite | Click button → paste invite |

**Rule of thumb:** start with **Company Invites** for your first few members,
add **Bond Autonomy** so they don't have to manually accept each hello, switch
to **Fleet Manifest** once you have a full roster, and use the **Kiosk** for
ongoing visitors.

---

## 2. Company rollout playbook

A phased rollout that combines all four paths safely.

### Day 0 — Stand up the home node
1. Install EnvoyMesh on the machine that will act as the company home node
   (a desktop, server, or always-on laptop).
2. Run the setup wizard (display name, username, interests).
3. Open **Settings → Devices & Fleet → Bond Autonomy**:
   - Toggle **enabled** on.
   - Set a **sponsor proof token** (any shared secret — generate one with the
     "Generate" button).
   - Leave **require referral proof** off for now (turn it on once social
     intros are flowing).
4. *(Installer builds only)* Open **Setup Sponsor Friend** and confirm the
   bundled `proofOfContext` matches the sponsor token above. This is the
   contract that makes "install and you're on the fleet" work.

### Day 1 — First 5 members (Company Invites)
1. **Settings → Devices & Fleet → Company Invites → Mint invite**.
2. Send each new member their `envoy://invite?token=…` link (Slack, email).
3. Each member installs EnvoyMesh, runs setup, then pastes the link into
   **Discover → Paste a contact link**.
4. The home node auto-accepts the hello (bond autonomy + token match) and a
   `direct` trust record is created. They appear under **Contacts**.

### Day 7 — Office members (LAN Auto-Bond)
1. Generate a **fleet token** (`Settings → Devices & Fleet → LAN Auto-Bond → Generate`).
2. Share the token with office members out-of-band (password manager, 1Password).
3. Each office member toggles **LAN Auto-Bond** on and pastes the same token.
4. Nodes on the same Wi-Fi silently bond at `direct` trust — no clicks needed.

### Day 14 — Full fleet (Fleet Manifest)
1. Compile your member roster as JSON (see §4 below for the schema).
2. **Settings → Devices & Fleet → Fleet Manifest → Import** — the home node
   signs it with the owner key and pre-stages trust for every member.
3. New members who install and hello the home node are auto-accepted to their
   pre-staged tier — no manual approval, no token to match.

### Ongoing — Visitors (Pairing Kiosk)
1. **Settings → Devices & Fleet → Pairing Kiosk** — enable with an admin token
   (≥16 chars), bind to loopback (or LAN with the opt-in).
2. Point a kiosk browser at `http://<home-node>:3737`.
3. Visitor clicks "Pair this device", gets a one-shot invite, pastes it into
   their Social UI. Same redemption flow as Company Invites.

---

## 3. The sponsor-feature contract (read this once)

**Bond Autonomy** and **Setup Sponsor Friend** are a *paired* feature. They
only work together when the token matches:

| Side | Setting | What it does |
|------|---------|--------------|
| **Sponsor node** (home) | `bondAutonomySponsorProofToken` | Auto-accepts hellos whose `proofOfContext` equals this token |
| **Installer node** (joiner) | `setupSponsorFriendProofOfContext` | Sends a hello carrying this token after setup |

**The two values must be identical strings.** If they don't match, the sponsor
rejects the auto-hello and the joiner gets no first friend. This is by design —
the token is the proof that the joiner is authorized to auto-bond.

For manual Company Invite flows, the invite's bearer token plays this role
instead — no sponsor token needed.

---

## 4. Per-path quickstart

### Path A — Company Invite
**Issuer (home node):**
```
Settings → Devices & Fleet → Company Invites → Mint invite
  expiresInHours: 168 (7 days)
  note: "Q3 new hires"
→ Copy envoy://invite?token=…  → send to joiner
```

**Joiner:**
```
Install EnvoyMesh → run setup
Discover → Paste a contact link → paste envoy://invite?token=…
→ "Fleet invite redeemed — we said hello to the issuer."
```
**What gets created:** bootstrap seed (so the joiner can reach the issuer) +
outbound hello carrying the token. The issuer's bond autonomy accepts it.

### Path B — Fleet Manifest
**Schema** (paste into the textarea):
```json
[
  {
    "ownerId": "envoy:owner:abc123",
    "deviceId": "envoy:device:def456",
    "devicePublicKeyPem": "-----BEGIN PUBLIC KEY-----\n…\n-----END PUBLIC KEY-----",
    "role": "engineer",
    "trustLevel": "direct",
    "displayName": "Alice"
  }
]
```
**Flow:**
```
Settings → Devices & Fleet → Fleet Manifest → paste JSON → Sign & import
```
**What gets created:** a signed manifest + one `TrustRecord` per member at the
specified `trustLevel`. Revoking the manifest resets those records to `public`.

### Path C — LAN Auto-Bond
**Both sides:**
```
Settings → Devices & Fleet → LAN Auto-Bond
  enabled: on
  token: <shared secret, min 8 chars>
```
**What gets created:** on first mDNS discovery, a signed `device.pair.request`
carrying the token → recipient verifies → `direct` trust, no prompts. Token is
never logged (only its SHA-256 fingerprint).

### Path D — Pairing Kiosk
**Operator (home node):**
```
Settings → Devices & Fleet → Pairing Kiosk
  enabled: on
  adminToken: <≥16 chars>
  bindPort: 3737 (default loopback; opt in to LAN)
```
**Visitor:** opens `http://<home-node>:3737` → clicks "Pair this device" →
gets a one-shot `envoy://invite?token=…` (1h expiry) → pastes into Social UI.

---

## 5. Security notes

- **Owner key is authoritative.** Every path reduces to "the operator's owner
  key says who is in this fleet." Protect the home node's owner key.
- **Tokens are bearer secrets.** Company invite tokens, fleet tokens, and
  kiosk admin tokens grant trust — distribute them out-of-band and revoke
  compromised ones immediately.
- **Bond autonomy policy gates** (now fully wired):
  - **Sponsor proof token** — exact match required (always enforced).
  - **Daily cap** — `maxAutoBondsPerDay` bounds auto-accepts per UTC day.
  - **Referral proof** — when on, a hello must carry `proofOfContext` *or*
    match a pending social-intro proposal (intro correlation).
  - **Trust overlap score** — when `minTrustOverlapScore > 0`, the requester's
    profile interests must overlap with the owner's by that fraction.
  - **Max tier** — caps the trust level auto-accepted (`direct` permits all;
    `referred` blocks upgrades to `direct`).
- **Revocation:** Company invites (revoke), Fleet Manifests (revoke resets
  trust), LAN Auto-Bond (rotate the token), Kiosk (disable or let it expire).
- **No mobile fleet management.** The Devices & Fleet tab is desktop-only by
  design — manage the fleet from a laptop or server.

---

## 6. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Joiner pastes invite → "invalid" | Wrong URI scheme or stale invite | Re-mint; ensure `envoy://invite?token=…` |
| Auto-hello never accepted | Sponsor token mismatch | Confirm `bondAutonomySponsorProofToken` === `setupSponsorFriendProofOfContext` |
| LAN Auto-Bond silent | Token mismatch or not same LAN | Verify identical tokens; check mDNS reachable |
| `requireReferralProof` rejects everything | No matching intro proposal | Either turn it off, or run a social intro first |
| `minTrustOverlapScore` rejects everything | Requester has no cached profile | Lower the threshold or wait for profile sync |

---

## Related
- [`fleet-onboarding.md`](./fleet-onboarding.md) — wire-protocol reference for all four paths
- [`agent_network.md`](./agent_network.md) — multi-agent chains (what bonded peers can *do* together)
- [`README.md`](../README.md#fleet-onboarding) — fleet onboarding overview
