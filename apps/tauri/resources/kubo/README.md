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

Tauri release CI runs the same script on all matrix OSes before bundling.

Tauri passes `ENVOYMESH_IPFS_EXE` to the node child when this file exists.
The node manages `ipfs daemon` automatically (Option C) under `{profile}/ipfs-kubo`.
