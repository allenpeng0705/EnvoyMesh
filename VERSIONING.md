# Version Management

EnvoyMesh uses a **single source of truth** for versioning — the plain text `VERSION` file at the repo root. A sync script propagates the version to all package manifests, build configs, and source code constants automatically.

Desktop OTA and the unified GitHub Release (`DMG` + `EXE` + mobile) use the **same** SemVer. See [docs/ota.md](./docs/ota.md) for signing keys, CI, and attaching iOS/Android.

## Quick Reference

```bash
# Bump to a new version (syncs all manifests; by default also commits + tags):
npm version 0.2.2

# Sync only (no git commit / no tag) — useful when you will commit yourself:
npm version 0.2.2 --no-git-tag-version
# or:
echo "0.2.2" > VERSION
node scripts/sync-version.mjs
```

That's it for workspace packages — every `package.json`, Tauri config, Cargo.toml, Android `versionName`, and runtime constant is updated in one shot.

## Source of Truth

```
VERSION              ← SemVer only, e.g. 0.2.2  (no leading "v")
```

| Form | Example | Used for |
|------|---------|----------|
| SemVer in files | `0.2.2` | `VERSION`, `package.json`, Tauri, Cargo, OTA `latest.json` |
| Git / GitHub tag | `v0.2.2` | Unified Release (desktop + mobile assets); triggers `tauri-release.yml` |

They must match: tag `v` + contents of `VERSION`.

## What Gets Synced

Running `node scripts/sync-version.mjs` (also via `npm version`) updates:

| Target | Field Updated |
|--------|--------------|
| Root + workspace `package.json` files | `"version"` + `@envoymesh/*` dependency pins |
| `apps/tauri/src-tauri/tauri.conf.json` | `"version"` |
| `apps/tauri/src-tauri/tauri.conf.slim.json` | `"version"` |
| `apps/tauri/src-tauri/tauri.conf.full.json` | `"version"` |
| `apps/tauri/src-tauri/Cargo.toml` | `version = "..."` |
| `apps/mobile/android/app/build.gradle` | `versionName "..."` |
| `packages/api/src/version.ts` | Auto-generated `ENVOYMESH_VERSION` constant |
| `packages/openclaw-runtime/src/index.ts` | `envoyVersion` in hello handshake |
| `packages/local-store/src/capability-manifest-store.ts` | `versionTag` in capability manifest |
| `packages/openclaw-runtime/test/index.test.ts` | `envoyVersion` in test fixture |

After a bump, also confirm `apps/tauri/src-tauri/Cargo.lock` lists `name = "envoymesh"` at the same version (update if still stale — `cargo check` in `apps/tauri/src-tauri` refreshes it).

### What is NOT synced (intentionally)

| Path | Reason |
|------|--------|
| `apps/tauri/src-tauri/resources/openclaw/` | Vendored OpenClaw copy — has its own version |
| `packages/openclaw/` | Vendored OpenClaw npm package — has its own version |
| `apps/tauri/src-tauri/resources/node/package.json` | Bundled Node runtime — versioned separately |
| `apps/tauri/src-tauri/resources/pi/` | Pi sidecar pin (`ENVOYMESH_PI_VERSION` / `.pi-version`) — separate |
| `apps/envoygo/pubspec.yaml` | Flutter EnvoyGo — own `x.y.z+build` scheme; bump manually when shipping EnvoyGo in the same GitHub Release |

## How `npm version` Works

The root `package.json` defines a **version lifecycle script**:

```json
{
  "scripts": {
    "version": "node scripts/sync-version.mjs"
  }
}
```

When you run `npm version <semver>` **without** `--no-git-tag-version`, npm:

1. Validates the new version  
2. Updates root `package.json` `"version"`  
3. Runs `version` → `sync-version.mjs` propagates everywhere (including writing `VERSION`)  
4. Creates a git **commit** and a git **tag** `v<semver>` (e.g. `v0.2.2`)

That tag shape matches CI: `.github/workflows/tauri-release.yml` runs on `v[0-9]*`.

### Common commands

```bash
npm version 0.2.2        # Set exact version + commit + tag v0.2.2
npm version patch        # 0.2.1 → 0.2.2 (+ commit + tag)
npm version minor        # 0.2.2 → 0.3.0
npm version major        # 0.3.0 → 1.0.0

# Sync files only — you commit/tag yourself (recommended when bundling OTA + other changes):
npm version 0.2.2 --no-git-tag-version
```

## Release checklist (version → GitHub)

Use this whenever you cut a unified Release (desktop DMG/EXE + optional mobile):

1. Finish feature work on the release branch.  
2. Bump version (pick one):

   ```bash
   # A) Sync only, then commit with your other changes:
   npm version 0.2.2 --no-git-tag-version
   git add VERSION package.json package-lock.json apps packages \
     apps/tauri/src-tauri/Cargo.toml apps/tauri/src-tauri/Cargo.lock \
     apps/tauri/src-tauri/tauri.conf*.json \
     apps/mobile/android/app/build.gradle
   git commit -m "chore: bump version to 0.2.2"
   git tag v0.2.2

   # B) Or let npm commit + tag in one step (clean tree required):
   npm version 0.2.2
   ```

3. Push branch **and** tag:

   ```bash
   git push origin HEAD
   git push origin v0.2.2
   ```

4. CI publishes signed desktop assets + `latest.json` onto GitHub Release `v0.2.2`.  
5. Upload iOS / Android / EnvoyGo artifacts to that **same** Release.  
6. Keep the Release as **Latest** so desktop OTA can fetch `…/releases/latest/download/latest.json`.

Full OTA / signing details: [docs/ota.md](./docs/ota.md).

## Using the Version Constant in Code

Import `ENVOYMESH_VERSION` from `@envoymesh/api` in any package that depends on it:

```typescript
import { ENVOYMESH_VERSION } from "@envoymesh/api"

console.log(`EnvoyMesh v${ENVOYMESH_VERSION}`)
```

The constant is auto-generated in `packages/api/src/version.ts` — do not edit it manually.

For packages that don't depend on `@envoymesh/api` (e.g., `openclaw-runtime`), the sync script updates the version string directly in the source code.
