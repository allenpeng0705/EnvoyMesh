# Apple / Google store review — EnvoyGo demo home

How reviewers try EnvoyGo, and how to run a **dedicated demo home node** with a long-lived pairing QR without affecting normal end users (DMG / Tauri / production homes).

---

## Why a special mode exists

EnvoyGo has **no username/password**. Pairing uses a QR / URI:

```text
envoy://pair?pairing=<base64url-gzip-json>
```

Normal homes mint a **new random token every time** the pairing QR is opened, valid for **~30 minutes**. That is correct for real users, but **too short** for App Store / Play review (often several days).

**Review pairing** is an **opt-in** home-node setting: one stable token stays valid for N days (default 14) so you can paste a single URI into review notes at submit time.

| Audience | Review pairing |
|----------|----------------|
| End-user DMG / Tauri / normal `node:dev` | **Off** (default) — no env, no config flags |
| Your terminal **demo** node for Apple/Google | **On** only if you set env or `node-config.json` |
| EnvoyGo app binary | **Unchanged** — same QR decode / pair / reconnect |

EnvoyGo does not contain a special “review build.” It just pairs with whatever valid token the home accepts.

---

## Safety: will this affect normal users?

**No**, as long as you do not enable it on end-user installs.

1. **Default off** — `resolveReviewPairing()` returns `null` unless:
   - `ENVOY_REVIEW_PAIRING=1` (or `true` / `yes` / `on`), **or**
   - `node-config.json` has `"reviewPairingEnabled": true`
2. **Token required** — enabled without `ENVOY_REVIEW_PAIRING_TOKEN` / `reviewPairingToken` is ignored (treated as off).
3. **DMG / Tauri defaults** — `createDefaultPersistedNodeConfig()` does **not** set review fields; installers should not ship those env vars.
4. **Validation order** (home node):
   1. Review token (only if resolved settings are non-null and not expired)
   2. Normal in-memory QR token (30 minutes)
   3. Persisted session token (reconnect after pair)
   4. Company invite tokens
5. **EnvoyGo after pair** uses the **session token**, not the QR token. Review mode only matters for the **first** pair during review.

Do **not** turn review pairing on for customer homes or production profiles.

---

## Run a demo home for review (terminal)

Use a **separate profile / machine** if possible (no real contacts / vault).

```bash
# 1) Enable long-lived pairing (demo node only)
export ENVOY_REVIEW_PAIRING=1
export ENVOY_REVIEW_PAIRING_TOKEN="$(openssl rand -hex 32)"
export ENVOY_REVIEW_PAIRING_DAYS=14
# Optional hard stop instead of DAYS:
# export ENVOY_REVIEW_PAIRING_EXPIRES_AT=2026-08-20T00:00:00.000Z

# 2) Start home as usual (example)
npm run node:dev
# or your usual CLI with a dedicated --profileDir for review
```

On startup you should see:

```text
[review-pairing] ENABLED until <ISO> — long-lived QR token for store review only. …
```

### Generate the pairing URI once

1. Open Social (or your pairing UI) against that demo home.
2. Open the **Pairing QR** modal once.
3. Copy the full `envoy://pair?pairing=…` string (and/or save the QR PNG).
4. Paste that URI into App Store Connect / Play Console review notes.

Re-opening the QR on a review-enabled node keeps the **same** `tok` (stable). Relays / LAN fields still refresh as usual.

### Keep the demo reachable

Reviewers are rarely on your LAN. Ensure:

- Demo home is online for the whole review window  
- At least one **relay** (or public WS) is configured so cellular pairing works  
- EnvoyGo can fall back to the built-in community relay if needed  

---

## Config reference

### Environment (preferred for throwaway demo)

| Variable | Meaning |
|----------|---------|
| `ENVOY_REVIEW_PAIRING` | `1` / `true` / `yes` / `on` to enable |
| `ENVOY_REVIEW_PAIRING_TOKEN` | Stable secret embedded in QR `tok` |
| `ENVOY_REVIEW_PAIRING_DAYS` | TTL days from process anchor (default **14**) |
| `ENVOY_REVIEW_PAIRING_EXPIRES_AT` | Absolute ISO expiry (overrides DAYS) |

Env wins over file when both set.

**Note on DAYS:** the expiry is anchored at first resolve in the **process**. Restarting the node re-anchors and can extend the window. Prefer `ENVOY_REVIEW_PAIRING_EXPIRES_AT` if you need a fixed end date.

### `node-config.json` (optional)

```json
{
  "reviewPairingEnabled": true,
  "reviewPairingToken": "replace-with-long-secret",
  "reviewPairingTtlDays": 14,
  "reviewPairingExpiresAt": "2026-08-20T00:00:00.000Z"
}
```

Omit these keys entirely on end-user profiles.

---

## What to put in store review notes

```text
EnvoyGo has no login/password. Pairing is QR-only.

Demo instructions:
1. Open EnvoyGo → Pair / Scan QR (or paste URI if your build supports it).
2. Pairing URI: envoy://pair?pairing=<PASTE_STABLE_URI>
3. After pair: open Chats → send “hello” to EnvoyAI (or named bot) and wait for a reply.
4. Demo home is online 24/7 during review. Contact: you@example.com

Note: The pairing token is a long-lived review token (valid ~14 days). Normal user homes use 30-minute QR tokens.
```

Also attach a QR PNG if the console allows attachments.

---

## After review

1. Stop the demo node **or** unset `ENVOY_REVIEW_*` and restart.  
2. Rotate / discard `ENVOY_REVIEW_PAIRING_TOKEN`.  
3. Do not leave review pairing enabled on any shared production profile.

---

## EnvoyGo compatibility checklist

| Step | Expected |
|------|----------|
| Scan / open review URI | Decodes `pairing` gzip token (`rel`, optional `rels`, `tok`, …) |
| Pair RPC | Home accepts review `tok` until expiry |
| Session | EnvoyGo stores session token; reconnect works without QR |
| Normal home (review off) | Fresh UUID QR, 30‑minute TTL — unchanged |
| Multi-relay QR | Operator relays in `rels`; community relay stays built into EnvoyGo |

No EnvoyGo code path requires review mode to be on. Shipping EnvoyGo to the stores does **not** enable review pairing on anyone’s home node.

---

## Related files

| Path | Role |
|------|------|
| `apps/node/src/review-pairing.ts` | Resolve env/config |
| `apps/node/src/node-service-handlers-validate-pairing-token.ts` | Accept review token |
| `apps/node/src/node-service-handlers-pairing-payload.ts` | Embed stable `tok` in QR payload |
| `apps/envoygo/store-release/appstore/listing.md` | App Store listing + short review notes |
| `apps/envoygo/store-release/googleplay/listing.md` | Play listing + app access notes |

Implementation tests: `apps/node/test/review-pairing.test.ts`.
