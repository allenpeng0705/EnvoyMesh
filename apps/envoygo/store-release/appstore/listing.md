# EnvoyGo — Apple App Store listing

Paste these fields into [App Store Connect](https://appstoreconnect.apple.com). Character limits are noted.

Replace every `TODO:` before submit.

---

## App information

| Field | Value |
|-------|--------|
| Name (30) | EnvoyGo |
| Subtitle (30) | Your EnvoyMesh on the go |
| Bundle ID | `com.envoymesh.envoygo` |
| SKU (suggested) | `envoygo-ios` |
| Primary category | Productivity |
| Secondary category | Social Networking |
| Content rights | Does not contain third-party content |
| Price | Free |

### Subtitle alternatives (≤30)

- Chat your home mesh remotely
- Pair. Chat. Call. From anywhere.
- Private mesh access, mobile

---

## Promotional text (170) — editable anytime

```
Pair EnvoyGo to your home node with a QR code. Chat contacts, talk to your AI agent, get push alerts, and reconnect over Wi‑Fi or relay — no central account.
```

---

## Description (4000)

```
EnvoyGo is the mobile companion for EnvoyMesh — a decentralized, peer-to-peer mesh for private messaging and autonomous AI agents.

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

## Keywords (100 chars max, comma-separated, no spaces after commas preferred)

```
mesh,p2p,chat,secure,private,relay,AI,agent,home,node,pairing,QR,voip,decentralized,envoy
```

Count check: keep under 100 characters total (Apple counts commas).

Shorter backup if over limit:

```
mesh,p2p,chat,private,AI,agent,relay,home,QR,voip,envoy
```

---

## What’s New (1.0.0)

```
Initial public release of EnvoyGo.

• Pair to your EnvoyMesh home node with a QR code
• Chat with contacts, Ext Agent, and EnvoyAI
• Push notifications for new messages
• Voice calls
• Automatic reconnect over Wi‑Fi / P2P, with relay fallback
```

---

## Support & marketing URLs

| Field | Value |
|-------|--------|
| Support URL | `TODO: https://…` (required) |
| Marketing URL | `TODO: https://envoymesh…` (optional) |
| Privacy Policy URL | `TODO: https://…` (required) |

Suggested privacy policy topics to cover:

- Pairing / session tokens stored on device (Keychain)
- Camera for QR pairing
- Microphone for voice calls
- Push notification tokens (APNs) sent to the home node
- Chat content routed via the user’s home node / relays — not an EnvoyGo cloud inbox
- No central EnvoyMesh account

---

## App Privacy (nutrition labels) — draft answers

Use App Store Connect → App Privacy. Adjust if your home/push setup differs.

| Data type | Collected? | Linked to identity? | Used for tracking? | Purpose |
|-----------|------------|---------------------|--------------------|---------|
| Contact Info | No* | — | — | — |
| Identifiers (Device / User ID) | Yes (peer / owner IDs on device; push token) | Yes (your mesh identity) | No | App functionality |
| Usage Data | No (unless you add analytics) | — | — | — |
| Diagnostics | Optional (crash only if you enable) | — | — | — |
| Other User Content (messages) | Processed on device / via home | Yes | No | App functionality |
| Audio Data | Yes (during calls) | Yes | No | App functionality |
| Photos / Camera | Yes (QR scan; optional image attach) | No | No | App functionality |

\*Contacts are mesh peer profiles from the home node, not the iOS Contacts database — declare carefully.

**Data Not Collected** vs **Collected**: prefer declaring what you actually send to the home node and Apple/Google push services.

---

## Age rating

Suggested: **4+** (no unrestricted web, no mature themes). Confirm with Apple’s questionnaire (chat user-generated content may push toward 12+ depending on answers — answer honestly: UGC is between bonded peers on a private mesh).

---

## Review notes (for App Review team)

```
EnvoyGo requires an EnvoyMesh home node. Without pairing it shows onboarding / pair UI only.

Demo path for reviewers:
See **[apple_google_reviewing.md](./apple_google_reviewing.md)** (long-lived review pairing on a demo home only).

Terminal demo node (never enable on end-user DMG):

```
ENVOY_REVIEW_PAIRING=1
ENVOY_REVIEW_PAIRING_TOKEN=<secret>
ENVOY_REVIEW_PAIRING_DAYS=14
```

Then open Social → Pairing QR once and attach that URI / PNG to review notes.
TODO: paste the live URI for this submission.

Permissions:
• Camera — scan home-node pairing QR
• Microphone — voice calls only
• Notifications — chat / call alerts

No account creation on a central server. Identity lives on the user’s home node.
```

---

## Icons

| File | Spec | Path |
|------|------|------|
| App Store icon | 1024×1024 PNG, **RGB, no alpha, no rounded corners** | `icons/app-icon-1024.png` |
| Full-bleed approx | Same, corners filled (use if Connect complains about mask) | `icons/app-icon-1024-fullbleed-approx.png` |

### Icon checklist

- [ ] Upload **1024×1024** with **no transparency**
- [ ] Prefer artwork that fills the square; Apple applies the mask
- [ ] No text smaller than ~readable at ~60pt
- [ ] No competing logos / “beta” banners

If Connect rejects pre-rounded artwork, regenerate from the design source as a full square and replace `icons/app-icon-1024.png`.

---

## Screenshots checklist

Apple requires device-sized screenshots (at least one size class).

### iPhone (required) — capture on a recent device / simulator

Suggested set (6.7" or 6.9" primary):

1. **Chats** — thread list with connection badge
2. **Chat thread** — conversation with a contact
3. **Contacts** — bonded peers
4. **Me / Connected node** — Direct or P2P status (not only Relay)
5. **Pairing** — QR scan screen (optional sixth)

Optional: iPad if you enable iPad.

### Caption ideas (not uploaded as text fields — for your design overlays)

1. “Your mesh, in your pocket”
2. “Chat bonded contacts anywhere”
3. “Talk to your home AI agent”
4. “Wi‑Fi and P2P first — relay when needed”
5. “Pair once with a QR code”

Brand colors: deep purple, cyan, magenta (match the icon).

---

## Build & submit reminders

```bash
cd apps/envoygo
flutter build ipa   # after signing / certificates configured in Xcode
```

- Version: `CFBundleShortVersionString` = `1.0.0`
- Build: `CFBundleVersion` = `3` (bump each upload)
- Capabilities: Push Notifications, Background Modes (voip, audio, remote-notification) already in Info.plist
- Export compliance: uses encryption (HTTPS / TLS / libp2p) — usually **exempt** standard encryption; answer the questionnaire accordingly
