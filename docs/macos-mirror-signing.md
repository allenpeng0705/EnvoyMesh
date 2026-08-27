# macOS mirror DMG — Developer ID signing + notarization

**Purpose:** Ship a Gatekeeper-friendly macOS installer for the public mirror  
(`https://gpt4people.online/EnvoyMesh/envoymesh-desktop.dmg`).

**Not this doc:**
- Mac App Store (`MAC_APP_STORE=1`) — separate experimental pipeline
- EnvoyGo iOS review home (`APPLE_REVIEW=1`) — family-only, do not ship
- GitHub Release OTA — see [ota.md](./ota.md)
- Windows `.exe` — build with `scripts/build-desktop.ps1` on a Windows host

Related: [packaging.md](./packaging.md), `scripts/build-desktop.sh`,  
`scripts/sign-macos-release.env.example`.

---

## What you get

| Output | Purpose |
|--------|---------|
| `release/envoymesh-desktop.dmg` | **Upload this** to the mirror (stable filename) |
| `release/envoymesh-desktop-{version}-macos-{arch}.dmg` | Versioned archive (optional backup / GitHub) |

Sites already link to the **stable** URL. Overwrite the file on the server each release — no HTML change when `VERSION` bumps.

| File on server | Public URL |
|----------------|------------|
| `envoymesh-desktop.dmg` | https://gpt4people.online/EnvoyMesh/envoymesh-desktop.dmg |

---

## Two pipelines (do not mix)

| Goal | Command |
|------|---------|
| **Mirror / direct download** (this doc) | `./scripts/build-desktop.sh macos` |
| Mac App Store trial | `MAC_APP_STORE=1 ./scripts/build-desktop.sh macos` |

Developer ID + notarization ≠ App Store. The mirror path signs with **Developer ID Application** and notarizes for Gatekeeper. App Store needs **Apple Distribution**, sandbox entitlements, and a `.pkg`.

---

## Part 1 — Apple Developer (one-time)

### 1. Enroll

Paid Apple Developer Program ($99/year): [developer.apple.com](https://developer.apple.com)

### 2. Create a Developer ID Application certificate

1. **Keychain Access → Certificate Assistant → Request a Certificate From a Certificate Authority…**
   - Email: your Apple ID  
   - Common Name: e.g. `EnvoyMesh Release`  
   - Save to disk → `.certSigningRequest`
2. [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/certificates/list)  
   → **+** → **Developer ID Application** → upload CSR → download `.cer`
3. Double-click the `.cer` to install in Keychain

Verify:

```bash
security find-identity -v -p codesigning
```

You want a line like:

```text
Developer ID Application: Your Name (TEAMID)
```

Copy the **full string** — that is `APPLE_SIGNING_IDENTITY`.  
Note your **Team ID** (10 characters) under Membership in the Developer portal.

### 3. App-specific password (notarization)

Notarization needs an **app-specific password**, not your Apple ID login password:

1. [appleid.apple.com](https://appleid.apple.com) → **Sign-In and Security** → **App-Specific Passwords**
2. Generate one (label e.g. `EnvoyMesh Notarize`)
3. Save it (`xxxx-xxxx-xxxx-xxxx`)

---

## Part 2 — Signing config in the repo

```bash
cd /path/to/EnvoyMesh
cp scripts/sign-macos-release.env.example scripts/sign-macos-release.env
```

Edit `scripts/sign-macos-release.env` (**gitignored — never commit**):

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
export APPLE_ID="you@example.com"
export APPLE_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="XXXXXXXXXX"
```

All four must be real. If any stay as placeholders (`…` / example text), `build-desktop.sh` prints `Apple signing: skipped` and produces an **unsigned** DMG.

Alternatively, the same four exports can live in `apply_apple_signing_env()` inside `scripts/build-desktop.sh` — prefer the `.env` file so secrets stay out of the script.

---

## Part 3 — Build machine setup

### Toolchain

```bash
xcode-select --install
rustup target add aarch64-apple-darwin x86_64-apple-darwin
cd /path/to/EnvoyMesh
npm install
```

### Sibling repo: envoy-harness

Default path: `../envoy-harness` (next to EnvoyMesh). Override with:

```bash
export ENVOY_HARNESS_DIR=/path/to/envoy-harness
```

That repo must be buildable with `pnpm` (harness staging step).

### Push credentials

If `push-config.json` exists at the repo root, the build expects the referenced secrets there too (typically `AuthKey_*.p8` + `serviceAccountKey.json`). Default `REQUIRE_PUSH_CREDENTIALS=1` fails the build when they are missing.

Without push for this release:

```bash
export REQUIRE_PUSH_CREDENTIALS=0
```

---

## Part 4 — Build

```bash
cd /path/to/EnvoyMesh
# optional: export REQUIRE_PUSH_CREDENTIALS=0
./scripts/build-desktop.sh macos
```

Do **not** set `MAC_APP_STORE=1` or `APPLE_REVIEW=1`.

Expected log line:

```text
Apple signing: Developer ID + notarization enabled
```

What the script does (high level):

1. Typecheck / stage Node, OpenClaw, Pi, envoy-harness, push credentials  
2. Discovery E2E smoke  
3. Social UI build  
4. Load `sign-macos-release.env`  
5. `tauri build` — codesign + notarize (often several minutes waiting on Apple)  
6. Recompress DMG (default UDBZ — smaller download)  
7. Publish `release/envoymesh-desktop.dmg` (+ versioned copy)

**Time:** often 15–45+ minutes depending on cold compile and notarization queue.

---

## Part 5 — Verify before upload

```bash
ls -lh release/envoymesh-desktop.dmg
ls -lh release/envoymesh-desktop-*-macos-*.dmg
```

Mount and check signature / Gatekeeper:

```bash
hdiutil attach release/envoymesh-desktop.dmg -nobrowse
codesign -dv --verbose=4 /Volumes/EnvoyMesh/EnvoyMesh.app
spctl -a -vv /Volumes/EnvoyMesh/EnvoyMesh.app
hdiutil detach /Volumes/EnvoyMesh
```

Good signs:

- `Authority=Developer ID Application: …`
- `spctl` → **accepted** / notarized

Optional staple check:

```bash
xcrun stapler validate release/envoymesh-desktop.dmg
```

If stapling failed but notarization succeeded, Gatekeeper may still pass with an online check on first launch; stapling is better for offline installs.

---

## Part 6 — Upload to mirror

Upload **only** the stable filename (overwrite the previous release):

```text
release/envoymesh-desktop.dmg  →  gpt4people.online/EnvoyMesh/envoymesh-desktop.dmg
```

Example:

```bash
scp release/envoymesh-desktop.dmg user@host:/path/to/EnvoyMesh/envoymesh-desktop.dmg
```

Site HTML does not need a version bump for the download URL.

Smoke-test on a clean Mac (download from the public URL, not a local copy): open DMG → Applications → first launch should not show “damaged” / “unidentified developer” when signing + notarization succeeded.

---

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| `Apple signing: skipped` | Placeholders or missing `scripts/sign-macos-release.env` |
| Notarization fails | Wrong app-specific password, or Apple ID not on the Developer team |
| Build fails on push | Missing `.p8` / FCM JSON → `REQUIRE_PUSH_CREDENTIALS=0` or add secrets |
| Build fails on harness | Missing `../envoy-harness` or set `ENVOY_HARNESS_DIR` |
| Friend sees “damaged” | Unsigned DMG still on mirror, or upload missed the stable file |
| “M1 works, M2 doesn’t” (or reverse) | Usually **not** CPU gen — unsigned vs signed, Intel vs Apple Silicon, or stale mirror file. Script prefers `universal-apple-darwin`, then `aarch64-apple-darwin` |

---

## Windows mirror (separate)

Sites also link:

`https://gpt4people.online/EnvoyMesh/envoymesh-desktop.exe`

Build on Windows with `scripts/build-desktop.ps1` → `release/envoymesh-desktop.exe`. Authenticode signing for SmartScreen is a separate step; the macOS script does not produce the Windows installer.

---

## Quick reference

```bash
# One-time
cp scripts/sign-macos-release.env.example scripts/sign-macos-release.env
# edit four exports; install Developer ID cert in Keychain

# Every mirror release
./scripts/build-desktop.sh macos
# verify codesign / spctl
# upload release/envoymesh-desktop.dmg → gpt4people.online/EnvoyMesh/
```
