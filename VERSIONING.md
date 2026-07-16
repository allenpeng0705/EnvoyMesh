# Version Management

EnvoyMesh uses a **single source of truth** for versioning — the plain text `VERSION` file at the repo root. A sync script propagates the version to all package manifests, build configs, and source code constants automatically.

## Quick Reference

```bash
# Bump to a new version (one command does everything):
npm version 0.2.0

# Or manually:
echo "0.2.0" > VERSION
node scripts/sync-version.mjs
```

That's it — every `package.json`, Tauri config, Cargo.toml, Android gradle, and runtime constant is updated in one shot.

## Source of Truth

```
VERSION              ← Edit this one file (plain text, semver e.g. "0.1.0")
```

## What Gets Synced

Running `node scripts/sync-version.mjs` updates **32 files**:

| Target | Field Updated |
|--------|--------------|
| Root + 23 workspace `package.json` files | `"version"` |
| `apps/tauri/src-tauri/tauri.conf.json` | `"version"` |
| `apps/tauri/src-tauri/tauri.conf.slim.json` | `"version"` |
| `apps/tauri/src-tauri/tauri.conf.full.json` | `"version"` |
| `apps/tauri/src-tauri/Cargo.toml` | `version = "..."` |
| `apps/mobile/android/app/build.gradle` | `versionName "..."` |
| `packages/api/src/version.ts` | Auto-generated `ENVOYMESH_VERSION` constant |
| `packages/openclaw-runtime/src/index.ts` | `envoyVersion` in hello handshake |
| `packages/local-store/src/capability-manifest-store.ts` | `versionTag` in capability manifest |
| `packages/openclaw-runtime/test/index.test.ts` | `envoyVersion` in test fixture |

### What is NOT synced (intentionally)

| Path | Reason |
|------|--------|
| `apps/tauri/src-tauri/resources/openclaw/` | Vendored OpenClaw copy — has its own version |
| `packages/openclaw/` | Vendored OpenClaw npm package — has its own version |
| `apps/tauri/src-tauri/resources/node/package.json` | Bundled Node runtime — versioned separately |

## How `npm version` Works

The root `package.json` defines a **version lifecycle script**:

```json
{
  "scripts": {
    "version": "node scripts/sync-version.mjs"
  }
}
```

When you run `npm version <semver>`, npm:
1. Reads and validates the new version
2. Updates `package.json` `"version"` field
3. Runs the `version` script → `sync-version.mjs` propagates everywhere
4. Creates a git commit and tag

### Common commands

```bash
npm version 0.2.0        # Set exact version
npm version patch       # 0.1.0 → 0.1.1
npm version minor       # 0.1.0 → 0.2.0
npm version major       # 0.1.0 → 1.0.0

# Dry run (don't commit):
npm version 0.2.0 --no-git-tag-version
```

## Using the Version Constant in Code

Import `ENVOYMESH_VERSION` from `@envoymesh/api` in any package that depends on it:

```typescript
import { ENVOYMESH_VERSION } from "@envoymesh/api"

console.log(`EnvoyMesh v${ENVOYMESH_VERSION}`)
```

The constant is auto-generated in `packages/api/src/version.ts` — do not edit it manually.

For packages that don't depend on `@envoymesh/api` (e.g., `openclaw-runtime`), the sync script updates the version string directly in the source code.
