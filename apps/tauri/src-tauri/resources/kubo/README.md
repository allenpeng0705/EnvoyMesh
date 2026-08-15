# Kubo sidecar (Option B) — staged by scripts/fetch-kubo-sidecar.sh

Canonical path for `tauri.conf.full.json` (`resources/kubo/**/*`).

```text
ipfs        # macOS / Linux
ipfs.exe    # Windows
```

Do not commit binaries here. CI and `build-desktop.ps1 -Full` /
`STAGE_KUBO_BUNDLE=1 ./scripts/build-desktop.sh` fetch them.
