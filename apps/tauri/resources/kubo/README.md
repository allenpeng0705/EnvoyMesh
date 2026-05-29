# Kubo sidecar (Option B)

Place the Kubo `ipfs` binary here for Tauri desktop bundles:

```bash
./scripts/fetch-kubo-sidecar.sh
```

Expected layout after fetch:

```
resources/kubo/ipfs        # macOS / Linux
resources/kubo/ipfs.exe    # Windows
```

Tauri release CI runs the same script on all matrix OSes before bundling (**`npm run build:full -w @envoymesh/tauri`**).

**Default local build** (`npm run build -w @envoymesh/tauri`) does **not** bundle Kubo — use ipfs on PATH or Helia in Settings. For a Kubo-included installer locally:

```bash
npm run build:full -w @envoymesh/tauri
```

**Helia-only slim builds** — `npm run build:slim -w @envoymesh/tauri` or CI workflow_dispatch with **build_slim** enabled. Set Settings → Export engine → **Helia** when using slim bundles.

Tauri passes `ENVOYMESH_IPFS_EXE` to the node child when this file exists.
The node manages `ipfs daemon` automatically (Option C) under `{profile}/ipfs-kubo`.
