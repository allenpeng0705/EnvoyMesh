# Desktop Dashboard

The desktop dashboard is the first graphical Product Surface for EnvoyMesh. It is an Electron app with a React renderer and a narrow IPC bridge to local Envoy state.

Run it with:

```bash
npm run desktop:dev
```

Build it with:

```bash
npm run desktop:build
```

## Local State

By default, the dashboard reads:

- Profile data from `./data/default`.
- Shared vault data from `./shared_vault`.

Override these paths with environment variables:

```bash
ENVOYMESH_PROFILE=./data/alice ENVOYMESH_VAULT=./shared_vault npm run desktop:dev
```

If you run the dashboard from an npm workspace, the process working directory may be `apps/desktop`. The dashboard tries to locate the repository root automatically so `./data/default` resolves consistently with `npm run node:dev` from the repo root.

You can also pin the workspace explicitly:

```bash
ENVOYMESH_WORKSPACE=/path/to/EnvoyMesh npm run desktop:dev
```

## First Operator Console

The first dashboard slice includes:

- Owner and device profile summary.
- Pending and historical owner approvals, with approve/reject actions.
- Local trust records, with set/remove actions.
- Observed peers derived from audit events.
- Recent task journal and audit event panels (audit supports correlation/task id filtering and optional `p2p.trace` visibility).
- Shared vault document summary and search.

`p2p.trace` audit rows are only produced when the Envoy node is started with `--p2p-debug`.

## Security Shape

The renderer does not receive direct filesystem or Node access. Electron main owns local file access and exposes specific methods through the preload bridge with `contextIsolation` enabled and `nodeIntegration` disabled.

The dashboard is local-only. It does not expose a public HTTP server or replace the P2P node runtime.
