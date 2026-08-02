# Desktop OTA (Over-the-Air) Updates

**Status:** App + CI wired; Steps 1–3 done; workspace version bumped to **0.2.2** — commit OTA + version, then tag `v0.2.2` (Step 4)  
**Scope:** Full EnvoyMesh **desktop** app (Tauri) — Node + Social + OpenClaw + Pi in one update  
**Out of scope:** EnvoyGo store listing process, sidecar-only OpenClaw/Pi swaps, `npm run node:dev` installs

Related: [VERSIONING.md](../VERSIONING.md) (bump SemVer / `v*` tags), [packaging.md](./packaging.md), CI [`.github/workflows/tauri-release.yml`](../.github/workflows/tauri-release.yml), helper [`scripts/generate-tauri-updater-keys.sh`](../scripts/generate-tauri-updater-keys.sh).

---

## Checklist

| Step | What | Status |
|------|------|--------|
| **1** | Generate password-protected updater keypair | **Done** — `~/.tauri/envoymesh.key` + `.pub` + `.password` |
| **2** | Put **public** key in the app | **Done** — `plugins.updater.pubkey` in all three `tauri.conf*.json` |
| **3** | Put **private** key + password in GitHub Secrets | **Done** (re-check with `gh secret list` if unsure) |
| **4a** | Bump package / code version to match the release | **Done for 0.2.2** — see [Before GitHub release](#before-github-release--bump-version-then-tag) |
| **4b** | Commit, tag `v0.2.2`, push, attach mobile, dogfood OTA | **You** — see [Step 4](#step-4--first-ota-release) |

### Already in the repo

| Piece | Location |
|-------|----------|
| Rust plugins | `tauri-plugin-updater`, `tauri-plugin-process`; registered in `main.rs` |
| Stop node before install | `stop_node_process` + `allow-stop-node-process` |
| JS (dynamic import) | `apps/social/src/lib/tauri-updater.ts` — plugins loaded only in Tauri shell |
| Settings UI | Settings → App → **Check for updates** (manual; no silent auto-install) |
| Endpoints | GitHub `…/releases/latest/download/latest.json` |
| Release overlay | `tauri.conf.release.json` → `createUpdaterArtifacts: true` (CI only) |
| CI | Tag `v0.2.2` (etc.) → signed desktop assets + `latest.json` on that Release; attach iOS/Android yourself; macOS aarch64+x86_64, Windows, Linux. Full builds must stage **OpenClaw + Pi** (`stage-tauri-*-bundle.sh`) — Pi is gitignored and was previously omitted from CI, which left Ext Agent Pi silent in release DMGs. |

**Feed URL:**

```text
https://github.com/allenpeng0705/EnvoyMesh/releases/latest/download/latest.json
```

---

## Step 1 — Keypair (local)

Paths on a release machine (also used by CI via GitHub Secrets):

```text
~/.tauri/envoymesh.key           ← private — GitHub Secret + offline backup
~/.tauri/envoymesh.key.pub       ← public — embedded in tauri.conf*.json
~/.tauri/envoymesh.key.password  ← password — GitHub Secret + offline backup
```

### Why back them up?

You do **not** need these files to *run* the app day to day. You need them whenever you (or CI) **sign a new desktop release**, or when recreating GitHub Secrets after a wipe/move.

- Installs that already ship the current **pubkey** will only accept updates signed with this **same** private key + password.
- GitHub Secrets hold working copies for CI.
- An **offline backup** is so you can restore that identity if Secrets are deleted or this machine is lost.
- If you lose **both** Secrets and the backup, you cannot sign trusted updates for existing users — they need a **manual reinstall** of a build with a new pubkey.

### Offline backup folder (recommended)

Keep a copy **outside** the EnvoyMesh git repo (never commit these files):

```text
~/Documents/mygithub/EnvoyMesh_push_cert/
  envoymesh.key
  envoymesh.key.password
  envoymesh.key.pub
```

Copy (or refresh) from `~/.tauri`:

```bash
mkdir -p ~/Documents/mygithub/EnvoyMesh_push_cert
cp -p ~/.tauri/envoymesh.key \
      ~/.tauri/envoymesh.key.pub \
      ~/.tauri/envoymesh.key.password \
      ~/Documents/mygithub/EnvoyMesh_push_cert/
chmod 600 ~/Documents/mygithub/EnvoyMesh_push_cert/envoymesh.key \
          ~/Documents/mygithub/EnvoyMesh_push_cert/envoymesh.key.password
```

That folder may also hold push certs (`AuthKey_*.p8`, `serviceAccountKey.json`, etc.) — keep the whole directory private and out of git.

Rotate (invalidates old pubkey — users must reinstall):

```bash
TAURI_UPDATER_FORCE=1 bash scripts/generate-tauri-updater-keys.sh
# Then paste the new pubkey into the three tauri.conf*.json files,
# re-run Step 3, and refresh EnvoyMesh_push_cert from ~/.tauri.
```

---

## Step 2 — Public key in the app

`plugins.updater.pubkey` must be the **contents** of `envoymesh.key.pub` (not a path) in:

- `apps/tauri/src-tauri/tauri.conf.json`
- `apps/tauri/src-tauri/tauri.conf.full.json`
- `apps/tauri/src-tauri/tauri.conf.slim.json`

Local `build:full` / `build-desktop.sh` does **not** require the private key. CI merges `tauri.conf.release.json` and signs with secrets.

---

## Step 3 — GitHub Secrets

```bash
gh secret set TAURI_SIGNING_PRIVATE_KEY --repo allenpeng0705/EnvoyMesh < ~/.tauri/envoymesh.key
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --repo allenpeng0705/EnvoyMesh < ~/.tauri/envoymesh.key.password
gh secret list --repo allenpeng0705/EnvoyMesh | grep TAURI_SIGNING
```

You must see both `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

---

## Step 4 — First OTA release

### One GitHub Release for everything (`v0.2.2`)

Use a single SemVer tag **`v0.2.2`** (not `desktop-v…`) for the release that holds:

| Asset | Who adds it |
|--------|-------------|
| DMG / NSIS EXE (+ updater `.sig` / `.app.tar.gz`) + **`latest.json`** | `tauri-release.yml` on tag push |
| iOS / Android / EnvoyGo packages | You (upload to the **same** Release) |

Desktop OTA only reads `latest.json` and the desktop updater files. Mobile packages on the same Release are ignored by Tauri. Keep that Release marked **Latest**.

Legacy tags `desktop-v*` / `tauri-v*` still trigger CI if you ever use them; prefer **`v*`** going forward.

### Chicken-and-egg (read this)

Only installs that **already contain the current pubkey** can verify signed updates. Plan:

1. Commit OTA work + version bump, ship / install build **N** (manual DMG/NSIS from Release `vN`).  
2. Later bump to **N+1**, tag `vN+1`, let CI publish desktop assets + `latest.json`; attach mobile builds to that Release.  
3. On the machine with build **N**, use Settings → App → Check for updates → install **N+1**.

Builds from before the pubkey was embedded cannot OTA onto the signed channel — they need a one-time manual install of an OTA-capable build.

---

### Before GitHub release — bump version, then tag

**Canonical steps:** [VERSIONING.md](../VERSIONING.md) (source of truth = root `VERSION`, sync via `npm version` / `scripts/sync-version.mjs`).

OTA-specific rules:

| Rule | Detail |
|------|--------|
| SemVer in code | `0.2.2` (from `VERSION`) |
| Git / GitHub tag | `v0.2.2` — must match; triggers `tauri-release.yml` |
| When to bump | **After** feature work is ready, **before** pushing the release tag |
| EnvoyGo | Not in sync-version — bump `apps/envoygo/pubspec.yaml` yourself if this Release includes EnvoyGo |
| Cargo.lock | Ensure `envoymesh` package version matches `Cargo.toml` after bump |

Short path (sync only, then you commit/tag — typical when other changes are in the same release):

```bash
cd ~/Documents/mygithub/EnvoyMesh
npm version 0.2.2 --no-git-tag-version   # runs sync-version.mjs
# verify: cat VERSION  →  0.2.2
git add VERSION package.json package-lock.json apps packages \
  apps/tauri/src-tauri/Cargo.toml apps/tauri/src-tauri/Cargo.lock \
  apps/tauri/src-tauri/tauri.conf*.json \
  apps/mobile/android/app/build.gradle
git commit -m "$(cat <<'EOF'
chore: bump version to 0.2.2

EOF
)"
```

Or, on a clean tree, `npm version 0.2.2` alone commits and creates tag `v0.2.2` (see VERSIONING.md).

For the **next** release: `0.2.3` / `v0.2.3`, same process.

---

### Tag, push, attach mobile, verify

If the tag does not exist yet:

```bash
git tag v0.2.2
git push origin HEAD
git push origin v0.2.2
```

Pushing **`v0.2.2`** starts `.github/workflows/tauri-release.yml`, which creates/updates GitHub Release **`v0.2.2`**, signs desktop installers, and publishes `latest.json`.

**Then:**

1. Attach iOS / Android / EnvoyGo packages to that same Release (`gh release upload v0.2.2 …` or GitHub UI).  
2. Watch CI:

```bash
gh run list --repo allenpeng0705/EnvoyMesh --workflow=tauri-release.yml --limit 5
```

3. Confirm the Release is **Latest** (not draft/prerelease) and includes `latest.json` + desktop updater assets, plus your mobile packages:

```bash
gh release view v0.2.2 --repo allenpeng0705/EnvoyMesh
curl -fsSL https://github.com/allenpeng0705/EnvoyMesh/releases/latest/download/latest.json
```

4. Dogfood: older OTA-capable install → Settings → App → Check for updates → confirm new version + profile data under identifier `dev.envoymesh.desktop` + EnvoyAI/Pi still start.

### Manual CI (`workflow_dispatch`)

Builds signed bundles and uploads **Actions artifacts** only. It does **not** create or overwrite a GitHub Release (avoids publishing a release named `main`).

---

## Architecture

```
┌──────────────────┐     HTTPS GET latest.json      ┌─────────────────────────┐
│ EnvoyMesh.app    │ ─────────────────────────────► │ GitHub Releases         │
│ (Tauri updater)  │ ◄───────────────────────────── │  latest.json + .sig     │
│ verify pubkey → stop node → install → relaunch    └─────────────────────────┘
└──────────────────┘
```

| Piece | Role |
|--------|------|
| `tauri-plugin-updater` | Check / download / verify / install |
| Keypair | Public in app; private + password in CI secrets |
| `latest.json` | SemVer + platform URL + signature |
| `createUpdaterArtifacts` | CI release overlay only |
| OS code signing | Apple / Authenticode — separate from updater signatures |

Official: [Tauri v2 Updater](https://v2.tauri.app/plugin/updater/).

---

## Distribution options

**A — GitHub Releases (current)** — least ops; needs public release assets.  
**B — CDN** — host your own `latest.json` + binaries; change `endpoints`.  
**C — Hybrid** — CDN first, GitHub second in `endpoints` (next URL only on non-2xx).

---

## `latest.json` shape

```json
{
  "version": "0.3.0",
  "notes": "…",
  "pub_date": "2026-08-01T12:00:00Z",
  "platforms": {
    "darwin-aarch64": { "signature": "<.sig contents>", "url": "https://…" },
    "darwin-x86_64": { "signature": "…", "url": "https://…" },
    "windows-x86_64": { "signature": "…", "url": "https://…" },
    "linux-x86_64": { "signature": "…", "url": "https://…" }
  }
}
```

`signature` = file contents of `.sig`, not a path. CI merges platform rows as matrix jobs finish.

---

## User data across updates

| Data | Survives OTA? |
|------|----------------|
| Profile / vault / bonds / family under `dev.envoymesh.desktop` | Yes if identifier unchanged |
| Bundled OpenClaw / Pi / skills | Replaced |
| Generated OpenClaw workspace under profile | Yes |

Do **not** change `identifier` in `tauri.conf.json`.

---

## Security

1. Updater private key ≠ Apple/Windows cert.  
2. HTTPS endpoints only in production.  
3. Only packages verifying the baked-in `pubkey` install.  
4. Prefer immutable versioned artifact URLs; overwrite only `latest.json`.  
5. Key leak → new keypair + **manual** reinstall with new pubkey.  
6. Never commit `envoymesh.key` / `.password` or paste them into issues/chat.

---

## Repo map

| Path | Role |
|------|------|
| `apps/tauri/src-tauri/tauri.conf*.json` | Pubkey + endpoints |
| `apps/tauri/src-tauri/tauri.conf.release.json` | `createUpdaterArtifacts` for CI |
| `apps/tauri/src-tauri/src/main.rs` | Plugins + `stop_node_process` |
| `apps/social/src/lib/tauri-updater.ts` | Dynamic check / install / relaunch |
| `apps/social/src/components/views/SettingsAppTab.tsx` | UI |
| `.github/workflows/tauri-release.yml` | Kubo + multi-arch Mac + tag-only Release |
| `scripts/generate-tauri-updater-keys.sh` | Keygen / rotate |

OpenClaw / Pi upgrade only via a new desktop SemVer (no separate sidecar OTA).

---

## FAQ

**Does OTA update EnvoyGo?** No.  
**Re-pair Mom/Dad after OTA?** No, if the home profile dir is unchanged.  
**Why didn’t an old install update?** Its baked-in pubkey must match the signing key — pre-pubkey builds need a one-time manual install.  
**Silent auto-update on launch?** Not enabled — user confirms in Settings (safer for a home node mid-task).

---

## References

- [Tauri v2 Updater](https://v2.tauri.app/plugin/updater/)  
- [tauri-apps/tauri-action](https://github.com/tauri-apps/tauri-action) (`includeUpdaterJson`)  
- [packaging.md](./packaging.md)  
- Repo: `https://github.com/allenpeng0705/EnvoyMesh`
