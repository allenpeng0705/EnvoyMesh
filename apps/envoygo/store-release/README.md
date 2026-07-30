# EnvoyGo — Store Release Pack

Ready-to-paste listing copy and icon assets for **Apple App Store** and **Google Play**.

```
store-release/
├── README.md                 ← this summary
├── apple_google_reviewing.md ← App Review / Play demo home + long-lived QR
├── appstore/
│   ├── listing.md            ← all App Store Connect text
│   └── icons/                ← App Store icon assets
├── googleplay/
│   ├── listing.md            ← all Play Console text
│   └── icons/                ← Play icon + feature graphic
└── shared/                   ← master logo references
```

## Quick facts

| Field | Value |
|-------|--------|
| App name | **EnvoyGo** |
| Version (current) | `1.0.0+3` (`pubspec.yaml`) |
| iOS bundle ID | `com.envoymesh.envoygo` |
| Android application ID | `com.envoymesh.envoygo` |
| Category (suggested) | Productivity / Social Networking |
| Price | Free |
| Age rating (suggested) | 4+ / Everyone |

## What EnvoyGo is (one line)

Remote chat, contacts, AI agent, and voice access to your **EnvoyMesh home node** — pair with a QR code, no central account.

## Icons — status

| Asset | Status | Notes |
|-------|--------|--------|
| App Store `1024×1024` | ✅ present | Prefer **full-bleed square** (no rounded corners). See `appstore/listing.md` → Icons. |
| Play Store `512×512` | ✅ present | Flattened to opaque RGB (Play rejects transparency). |
| Play feature graphic `1024×500` | ✅ present | Ready to upload. |
| Screenshots | ❌ TODO | Capture on device; checklist in each `listing.md`. |
| Privacy Policy URL | ❌ TODO | Required by both stores — fill placeholders. |
| Support URL | ❌ TODO | Fill placeholders. |

## Suggested next steps

1. Fill **Privacy Policy** + **Support** URLs in both `listing.md` files.
2. Capture **screenshots** (phone + optional tablet) per checklists.
3. Fix App Store icon to a true full-bleed square if Connect warns about rounded corners.
4. Configure **release signing** for Android (currently debug keys in `build.gradle.kts`).
5. Spin up a **demo home** with review pairing — see `apple_google_reviewing.md` — and paste the stable pairing URI into store review notes.
6. Upload builds via App Store Connect / Play Console and paste text from the listing files.
