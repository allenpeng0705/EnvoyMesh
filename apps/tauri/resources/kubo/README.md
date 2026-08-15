# Kubo sidecar (legacy pointer)

**Canonical install path** (what `tauri.conf.full.json` bundles):

```text
apps/tauri/src-tauri/resources/kubo/ipfs        # macOS / Linux
apps/tauri/src-tauri/resources/kubo/ipfs.exe    # Windows
```

Fetch with:

```bash
./scripts/fetch-kubo-sidecar.sh
```

This directory (`apps/tauri/resources/kubo/`) is **not** the Tauri bundle root.
Keep it only for older docs/links; binaries staged here are ignored by
`resources/kubo/**/*` in `src-tauri/tauri.conf.full.json`.

**Default local build** (`npm run build -w @envoymesh/tauri` / `build-desktop.sh`)
does **not** bundle Kubo — use ipfs on PATH or Helia in Settings. For Kubo:

```bash
npm run build:full -w @envoymesh/tauri
# or: .\scripts\build-desktop.ps1 -Full
```

**Helia-only slim builds** — `npm run build:slim` / `build-desktop.ps1 -SkipPi`.
