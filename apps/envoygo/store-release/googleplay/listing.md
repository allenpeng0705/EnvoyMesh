# EnvoyGo — Google Play listing

Paste these fields into [Google Play Console](https://play.google.com/console). Character limits are noted.

Replace every `TODO:` before submit.

---

## Store listing

| Field | Value |
|-------|--------|
| App name (30) | EnvoyGo |
| Package name | `envoymesh.envoygo` |
| Default language | English (United States) — or your locale |
| Application type | App |
| Category | Productivity |
| Tags (optional) | Communication, Tools |
| Free / paid | Free |

### App name alternatives (≤30)

- EnvoyGo
- EnvoyGo Mesh Chat

---

## Short description (80)

```
Remote chat & AI for your EnvoyMesh home. Pair by QR — no central account.
```

Alternatives (≤80):

```
Pair to your EnvoyMesh home. Chat, AI agent, voice — private mesh on the go.
```

```
EnvoyMesh companion: QR pair, chat contacts, talk to your home AI agent.
```

---

## Full description (4000)

```
EnvoyGo is the Android companion for EnvoyMesh — a decentralized, peer-to-peer mesh for private messaging and autonomous AI agents.

Connect to your home node once, then chat, call, and manage your mesh from your phone.

PAIR IN SECONDS
• Scan the pairing QR code shown on your EnvoyMesh home node
• Secure session — no central login or cloud account
• Reconnect automatically over LAN, P2P, or relay

CHAT & CONTACTS
• Message bonded contacts from your home peer directory
• Stay in sync with your home node’s chat threads
• Push notifications when you’re away

AI ON YOUR MESH
• Talk to your home Ext Agent and EnvoyAI from the phone
• Keep agent conversations separate from human contacts
• Your models and policy stay on the home node

VOICE CALLS
• Place and receive voice calls through your mesh
• Microphone access only when you are on a call

BUILT FOR PRIVACY
• Identity is cryptographic — no EnvoyMesh account server
• Messages are signed; policy stays with your home node
• You choose when the phone may reach your home over the network

REQUIREMENTS
• An EnvoyMesh home node up and reachable (LAN or relay)
• Pairing QR / invite from that home node

EnvoyGo is a thin client: your home node remains the intelligent edge. The phone is your remote window into the mesh.
```

---

## What’s new (release notes)

```
Initial public release of EnvoyGo.

• Pair to your EnvoyMesh home node with a QR code
• Chat with contacts, Ext Agent, and EnvoyAI
• Push notifications for new messages
• Voice calls
• Automatic reconnect over Wi‑Fi / P2P, with relay fallback
```

---

## Contact details

| Field | Value |
|-------|--------|
| Email | `TODO: support@…` (required) |
| Phone | optional |
| Website | `TODO: https://…` |
| Privacy policy | `TODO: https://…` (required) |

---

## Graphics

| Asset | Spec | Path |
|-------|------|------|
| App icon | 512×512 PNG, **32-bit, opaque** | `icons/app-icon-512.png` |
| Feature graphic | 1024×500 PNG/JPEG | `icons/feature-graphic-1024x500.png` |

### Icon / graphic checklist

- [ ] App icon uploaded (512×512, no transparency — this pack is flattened)
- [ ] Feature graphic uploaded (1024×500)
- [ ] Phone screenshots (min 2; max 8) — see below
- [ ] Optional: 7" / 10" tablet screenshots
- [ ] Optional: promo video

---

## Screenshots checklist

Minimum **2** phone screenshots. Recommended **5**:

1. Chats — thread list + connection status
2. Open chat — conversation bubbles
3. Contacts list
4. Me — connected home node (prefer Direct / P2P badge)
5. Pairing / QR screen

Use a recent phone resolution (e.g. 1080×1920 or device native). Avoid status-bar secrets.

Overlay caption ideas:

1. Your mesh, in your pocket
2. Chat bonded contacts anywhere
3. Talk to your home AI agent
4. Wi‑Fi and P2P first — relay when needed
5. Pair once with a QR code

---

## Data safety form — draft answers

Play Console → App content → Data safety. Align with your real backend.

| Data type | Collected? | Shared? | Purpose | Optional? | Encrypted in transit? |
|-----------|------------|---------|---------|-----------|------------------------|
| User IDs (mesh peer / owner) | Yes | With your home node / relays you configure | App functionality | No | Yes |
| Device or other IDs (FCM token) | Yes | With your home node (for push) | App functionality, notifications | No | Yes |
| Messages / chat | Yes (via home) | Via home / mesh peers | App functionality | No | Yes |
| Photos (attachments / QR) | Yes | Via home when sending | App functionality | Yes | Yes |
| Audio (calls) | Yes | Via call peers / home signaling | App functionality | Yes | Yes |
| Approx location | No* | — | — | — | — |
| Crash logs | Only if you enable Play / Firebase Crashlytics | — | — | — | — |

\*Do not declare location unless you add geo features.

**Data deletion**: users can unpair / uninstall; home-node data retention is controlled by the home owner — state that clearly in the privacy policy.

**Security practices**:

- [x] Data encrypted in transit (TLS / secure WebSocket / mesh crypto)
- [ ] Users can request deletion — `TODO` document how (unpair + home wipe)
- [ ] Committed to Play Families Policy — N/A unless targeting kids

---

## App access / restricted features

If reviewers cannot pair without a home node:

```
EnvoyGo requires an EnvoyMesh home node.

Demo credentials / QR for Google review:

Full guide: **[apple_google_reviewing.md](./apple_google_reviewing.md)**.

Use a **dedicated demo home node** with review pairing enabled (long-lived QR).

Terminal example (do **not** enable on end-user DMG installs):

```bash
export ENVOY_REVIEW_PAIRING=1
export ENVOY_REVIEW_PAIRING_TOKEN="$(openssl rand -hex 32)"
export ENVOY_REVIEW_PAIRING_DAYS=14
# then start your demo home node as usual
```

Open Social → Pairing QR once, copy `envoy://pair?pairing=…` into Play Console
“App access” notes. The same URI stays valid for `ENVOY_REVIEW_PAIRING_DAYS`
(default 14). Keep the demo node + relays online during review.

Or paste instructions here:
TODO: live pairing URI for this submission.
```

Play Console → App content → App access.

---

## Permissions justification (for review / declarations)

| Permission | Why |
|------------|-----|
| INTERNET | Connect to home node / relays |
| RECORD_AUDIO | Voice calls |
| MODIFY_AUDIO_SETTINGS | Call audio routing |
| POST_NOTIFICATIONS | Chat / call alerts (Android 13+) |
| CAMERA | (via scanner plugin) Pairing QR — declare if prompted |

Camera usage string suggestion (if you add to manifest):

> Scan the pairing QR code from your home node to connect.

---

## Content rating

Complete the IARC questionnaire in Play Console. Expected result roughly **Everyone** / **PEGI 3**, depending on UGC answers (private mesh chat between bonded peers).

---

## Target audience & news

- Target age: 18+ or 13+ as appropriate (not a kids app)
- Not a news app

---

## Ads

Does this app contain ads? **No**

---

## Build & submit reminders

```bash
cd apps/envoygo
# Configure upload keystore first — release currently uses debug signing!
flutter build appbundle --release
```

Critical before production:

1. Replace debug `signingConfig` in `android/app/build.gradle.kts` with a release keystore
2. Bump `version: 1.0.0+N` in `pubspec.yaml` for each Play upload (`versionCode` = N)
3. Enable Play App Signing
4. Complete Data safety + Privacy policy URL

Current IDs:

- `applicationId` / namespace: `envoymesh.envoygo`
- versionName / versionCode: from Flutter `1.0.0` / `3`
