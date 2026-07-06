# Node.js runtime sidecar

The Tauri desktop app bundles a platform Node.js binary so end users do not need a separate Node install.

```bash
./scripts/fetch-node-sidecar.sh            # auto: latest nodejs.org release >= OpenClaw minimum
./scripts/fetch-node-sidecar.sh 22.19.0  # pin an exact version
```

Expected layout after fetch:

```
src-tauri/resources/node-runtime/node        # macOS / Linux
src-tauri/resources/node-runtime/node.exe  # Windows
```

`npm run build -w @envoymesh/tauri` runs this script automatically before bundling.

Tauri spawns the bundled runtime to execute `resources/node/src/index.js` (EnvoyMesh node + WebSocket API).
