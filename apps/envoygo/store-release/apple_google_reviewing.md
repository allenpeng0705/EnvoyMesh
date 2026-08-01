# Apple / Google store review — EnvoyGo demo home

How reviewers try EnvoyGo, and how to run a **dedicated demo home node** with a long-lived pairing / family-invite URI without affecting normal end users (DMG / Tauri / production homes).

**Recommended for App Store / Play review:** send reviewers the **family invite** URI so they pair as a **family member** (Mom / Dad / “Reviewer”) and exercise the limited non-owner feature set. Use a **15-day** (or similar) TTL so the same URI survives the whole review window.

---

## Recommended review flow (family member)

This is the path you should use when Apple or Google needs to pair and test limited features.

### What you do (operator)

1. Start a **dedicated demo home** with review pairing enabled and a long TTL (example: **15 days**).
2. On that home, open the **Family invite** QR once in Social.
3. **Copy the full `envoy://invite?…` URI** (and optionally save a QR PNG).
4. Paste that URI into App Store Connect / Play Console review notes (or email it to the reviewer).
5. Keep the demo home **online** for the whole review window, with a working **relay** so cellular pairing works.

### What the reviewer does

1. Install EnvoyGo from TestFlight / Play internal testing / store build.
2. Open EnvoyGo → Pair → scan the QR **or paste** the `envoy://invite?…` URI.
3. Create a family profile (e.g. name it **Reviewer**) — or, on a second device / re-install, choose **I'm back** and select the existing profile.
4. Use Chats / EnvoyAI / family features available to a **non-owner** member.
5. They do **not** get owner-only controls (home settings that require the Owner profile).

### Why family invite (not owner QR)

| | Owner QR (`envoy://pair`) | Family invite (`envoy://invite`) |
|--|---------------------------|----------------------------------|
| Profile after pair | **Owner** | Non-owner (Mom / Dad / Reviewer) |
| Feature surface | Full home-owner UX | **Limited** family-member UX (what most phone users see) |
| Best for store review | Only if you explicitly want owner testing | **Yes — preferred** |

Both QRs share the same `ENVOY_REVIEW_PAIRING_*` TTL when review mode is on. Family invite stays **multi-device** for that window so Apple and Google can share one URI.

---

## Why a special mode exists

EnvoyGo has **no username/password**. Pairing uses a QR / URI:

```text
# Owner pairing (compressed)
envoy://pair?pairing=<base64url-gzip-json>

# Family / company invite
envoy://invite?token=…&wsUrl=…&…
```

### Normal homes (review mode off)

| QR | TTL | Reuse |
|----|-----|--------|
| Owner pairing | ~**30 minutes**, new random token each open | Single session window |
| Family invite | ~**72 hours**, random token | **Single-use** (one device; same device may re-pair) |

Correct for real users, but **too short / too strict** for App Store / Play review (often several days; Apple + Google may both need the same link).

### Review pairing (opt-in on demo home only)

One stable secret stays valid for **N days** (default **14**; use **15** if that matches your review notes). The same env vars control:

- **Owner** pairing QR token
- **Family invite** QR token + expiry
- Multi-device reuse of the family invite (no “already used by another device” while review mode is active)

| Audience | Review pairing |
|----------|----------------|
| End-user DMG / Tauri / normal `node:dev` | **Off** (default) — no env, no config flags |
| Your terminal **demo** node for Apple/Google | **On** only if you set env or `node-config.json` |
| EnvoyGo app binary | **Unchanged** — same QR decode / pair / reconnect |

EnvoyGo does **not** contain a special “review build.” It just pairs with whatever valid token the home accepts.

---

## Safety: will this affect normal users?

**No**, as long as you do not enable it on end-user installs.

1. **Default off** — `resolveReviewPairing()` returns `null` unless:
   - `ENVOY_REVIEW_PAIRING=1` (or `true` / `yes` / `on`), **or**
   - `node-config.json` has `"reviewPairingEnabled": true`
2. **Token required** — enabled without `ENVOY_REVIEW_PAIRING_TOKEN` / `reviewPairingToken` is ignored (treated as off).
3. **DMG / Tauri defaults** — `createDefaultPersistedNodeConfig()` does **not** set review fields; installers should not ship those env vars.
4. **Validation order** (home node):
   1. Review token — owner `tok` **or** derived family bearer `family.<tok>` (if resolved settings are non-null and not expired)
   2. Normal in-memory QR token (30 minutes)
   3. Persisted session token (reconnect after pair)
   4. Company / family invite records in the invite store
5. **EnvoyGo after pair** uses the **session token**, not the QR token. Review mode only matters for the **first** pair (and any new device using the same invite URI).

Do **not** turn review pairing on for customer homes or production profiles.

---

## Run a demo home for review (terminal)

Use a **separate profile / machine** if possible (no real contacts / vault).

### 15-day family review (recommended)

```bash
# 1) Enable long-lived pairing (demo node only)
export ENVOY_REVIEW_PAIRING=1
export ENVOY_REVIEW_PAIRING_TOKEN="$(openssl rand -hex 32)"
export ENVOY_REVIEW_PAIRING_DAYS=15

# Optional: fixed calendar end instead of DAYS (overrides DAYS)
# export ENVOY_REVIEW_PAIRING_EXPIRES_AT=2026-08-20T00:00:00.000Z

# 2) Start home as usual (example — use a dedicated profileDir)
npm run node:dev
# or: your CLI with --profileDir pointing at a throwaway review profile
```

Save `ENVOY_REVIEW_PAIRING_TOKEN` somewhere safe for this review cycle (password manager / notes). You need the **same** token if you restart the process without regenerating — regenerating a new token invalidates URIs already sent to reviewers.

On startup you should see:

```text
[review-pairing] ENABLED until <ISO> — long-lived owner + family invite QR for store review only. …
```

Confirm `<ISO>` is ~15 days out (or matches `EXPIRES_AT`).

### Mint and copy the family invite URI

1. Connect Social (desktop UI) to that demo home as owner.
2. Open **Family invite** QR (Settings → Family, or the family-invite control next to pairing).
3. Wait until the QR / URI appears (server upserts a family invite with review TTL).
4. Click **Copy** (or copy the `envoy://invite?token=…&wsUrl=…` string from the UI).
5. Paste into:
   - App Store Connect → App Review Information → Notes
   - Google Play Console → App access / review notes
   - Or send directly to a human reviewer

Re-opening the Family invite QR on the same review-enabled node keeps the **same** bearer token and refreshes expiry to the current review window. Relays / LAN / `wsUrl` fields in the URI still refresh to current reachability.

### Optional: owner pairing URI

Only if you also want a reviewer (or yourself) to pair as **Owner**:

1. Open the top-bar **Pairing QR** modal once.
2. Copy `envoy://pair?pairing=…`.
3. Do **not** mix this up with the family URI in store notes unless you intend owner access.

### Token shapes (under the hood)

| QR | URI scheme | Bearer while review mode is on |
|----|------------|--------------------------------|
| Owner pairing | `envoy://pair?…` | `ENVOY_REVIEW_PAIRING_TOKEN` (field `tok` inside compressed payload) |
| Family invite | `envoy://invite?…` | `family.<ENVOY_REVIEW_PAIRING_TOKEN>` (query `token=`) |

Same TTL from `ENVOY_REVIEW_PAIRING_DAYS` / `EXPIRES_AT`. Different bearer strings so owner pair and family pair never collide in `pairThinClient`.

### Multi-reviewer / multi-device

While review mode is active:

- Family invite is **not** single-use.
- Apple can pair, then Google can pair with the **same** URI.
- Second device should prefer **I'm back** → select the existing “Reviewer” / Mom / Dad profile so both phones share one family member identity.
- Creating a **new** profile name on the second device creates a **second** family member (usually not what you want for review).

### Keep the demo reachable

Reviewers are rarely on your LAN. Ensure:

- Demo home is online for the **entire** review window (15 days if that is your TTL)
- At least one **relay** (or public WS) is configured so cellular pairing works
- EnvoyGo can fall back to the built-in community relay if needed
- After you change relays / ports, re-open Family invite QR once and **re-copy** the URI before sending (reachability fields update; token stays stable)

---

## Config reference

### Environment (preferred for throwaway demo)

| Variable | Meaning |
|----------|---------|
| `ENVOY_REVIEW_PAIRING` | `1` / `true` / `yes` / `on` to enable |
| `ENVOY_REVIEW_PAIRING_TOKEN` | Stable secret; owner QR `tok` and basis for family bearer `family.<token>` |
| `ENVOY_REVIEW_PAIRING_DAYS` | TTL days from process anchor (default **14**; use **15** for a two-week+ review buffer) |
| `ENVOY_REVIEW_PAIRING_EXPIRES_AT` | Absolute ISO expiry (overrides DAYS) |

Env wins over file when both set.

**Note on DAYS:** expiry is anchored at first resolve in the **process**. Restarting the node re-anchors and can **extend** the window. Prefer `ENVOY_REVIEW_PAIRING_EXPIRES_AT` if reviewers must stop on a fixed calendar date.

**Max invite hours:** the invite store clamps expiry to at most **365 days**; 15 days is well within range.

### `node-config.json` (optional)

```json
{
  "reviewPairingEnabled": true,
  "reviewPairingToken": "replace-with-long-secret",
  "reviewPairingTtlDays": 15,
  "reviewPairingExpiresAt": "2026-08-20T00:00:00.000Z"
}
```

Omit these keys entirely on end-user profiles.

---

## What to put in store review notes

### Family-member demo (recommended)

```text
EnvoyGo has no login/password. Pairing is QR-only (family invite).

Demo home for App Review / Play review — pair as a family member (limited features):

1. Open EnvoyGo → Pair / Scan QR (or paste the URI below).
2. Family invite URI:
   envoy://invite?token=<PASTE_FULL_URI_FROM_FAMILY_INVITE_QR>
3. When prompted, create a profile named “Reviewer” (or any name).
   If you already paired on another device: choose “I'm back” and select that profile.
4. After pair: open Chats → send “hello” to EnvoyAI (or the named bot) and wait for a reply.
   You can also try family chat threads available to a non-owner member.
5. Demo home is online 24/7 during review (~15 days). Contact: you@example.com

Notes for reviewers:
- This URI is a long-lived store-review family invite (valid ~15 days).
- Normal user homes use ~72-hour single-use family invites; this demo home is special for review only.
- You will NOT be the home Owner — that is intentional so you can test member-limited features.
```

Also attach a **QR PNG** of the family invite if the console allows attachments.

### Owner demo (only if you need owner UX)

```text
EnvoyGo has no login/password. Pairing is QR-only.

Demo instructions (Owner profile):
1. Open EnvoyGo → Pair / Scan QR (or paste URI).
2. Pairing URI: envoy://pair?pairing=<PASTE_STABLE_OWNER_URI>
3. After pair: open Chats → send “hello” to EnvoyAI and wait for a reply.
4. Demo home is online 24/7 during review. Contact: you@example.com

Note: Long-lived review token (~15 days). Normal user homes use 30-minute owner QR tokens.
```

---

## Operator checklist (before submit)

- [ ] Demo home uses a **throwaway** `--profileDir` / machine
- [ ] `ENVOY_REVIEW_PAIRING=1` and a long random `ENVOY_REVIEW_PAIRING_TOKEN`
- [ ] `ENVOY_REVIEW_PAIRING_DAYS=15` (or fixed `EXPIRES_AT`)
- [ ] Startup banner shows ENABLED until the expected date
- [ ] Relay / public WS works from a phone on cellular
- [ ] Opened **Family invite** QR once and copied the **full** `envoy://invite?…` string
- [ ] Pasted URI (+ optional QR PNG) into App Store / Play review notes
- [ ] Decided profile name guidance (“Reviewer”) for multi-device **I'm back**
- [ ] Contact email in the notes is monitored

---

## After review

1. Stop the demo node **or** unset all `ENVOY_REVIEW_*` vars and restart.  
2. Rotate / discard `ENVOY_REVIEW_PAIRING_TOKEN` (old family URIs become invalid once the invite expires or review mode is off and the invite is consumed/expired).  
3. Do not leave review pairing enabled on any shared production profile.  
4. Optionally wipe the throwaway `profileDir`.

---

## EnvoyGo compatibility checklist

| Step | Expected |
|------|----------|
| Scan / paste family `envoy://invite?…` | Parses invite query (`token`, `wsUrl`, relays, …) |
| Scan / paste owner `envoy://pair?…` | Decodes compressed `pairing` (`tok`, `rel`, optional `rels`, …) |
| `previewFamilyInvite` | Lists non-owner profiles when family invite is valid |
| `pairThinClient` (family) | Creates or binds non-owner profile; review invite reusable across devices |
| Session | EnvoyGo stores session token; reconnect works without QR |
| Normal home (review off) | Owner QR ~30 min; family invite ~72 h single-use — unchanged |
| Multi-relay QR | Operator relays in URI / `rels`; community relay stays built into EnvoyGo |

No EnvoyGo code path requires review mode to be on. Shipping EnvoyGo to the stores does **not** enable review pairing on anyone’s home node.

---

## Related files

| Path | Role |
|------|------|
| `apps/node/src/review-pairing.ts` | Resolve env/config; `family.<tok>` helper; multi-use detection |
| `apps/node/src/node-service-handlers-validate-pairing-token.ts` | Accept owner + family review tokens |
| `apps/node/src/node-service-handlers-pairing-payload.ts` | Embed stable `tok` in owner QR payload |
| `apps/node/src/node-service-family.ts` | Family invite mint uses review TTL + derived token |
| `apps/node/src/node-service-company-invite.ts` | `fixedToken` upsert + `clearUsed` for review reuse |
| `apps/node/src/node-service-impl.ts` | `previewFamilyInvite` / `pairThinClient` skip single-use for review |
| `apps/social/src/components/FamilyInviteQRModal.tsx` | UI that mints / shows family invite QR |
| `apps/envoygo/store-release/appstore/listing.md` | App Store listing + short review notes |
| `apps/envoygo/store-release/googleplay/listing.md` | Play listing + app access notes |

Implementation tests: `apps/node/test/review-pairing.test.ts`, `apps/node/test/node-service-company-invite.test.ts`.
