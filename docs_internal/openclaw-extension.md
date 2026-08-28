# OpenClaw + EnvoyMesh bridge setup

**Overview:** [agent_bridge_guide.md](./agent_bridge_guide.md) (external agents) · [profile-photos.md](./profile-photos.md) (thumbnails & gallery)

Use this when your **external agent is OpenClaw**. For **HomeClaw**, keep using `channels/envoymesh` in the HomeClaw repo — no changes required on the EnvoyMesh node beyond `agentUrl` pointing at HomeClaw (default `http://localhost:8010/message`).

## What stays the same

| Component | HomeClaw (unchanged) | OpenClaw (this guide) |
|-----------|----------------------|------------------------|
| EnvoyMesh bridge module | `apps/node/src/bridge/` | Same |
| Default `bridge-config.json` | `agentUrl` → HomeClaw `:8010/message` | Use a **separate** config file or override `agentUrl` only when switching |
| Wire format | `{ from, fromOwnerId, fromName, text }` → agent; `{ to, text }` → `/bridge/send` | Identical |
| P2P / libp2p | Only on EnvoyMesh node | OpenClaw never gets mesh keys |

**One bridge = one `agentUrl`.** Do not point the same bridge at HomeClaw and OpenClaw at once. Use different config files or profiles if you A/B test.

## 1. Install the channel plugin

Canonical source in this repo:

```
EnvoyMesh/OpenClawExtension/
```

**Copy** (recommended) into your OpenClaw checkout:

```bash
# From EnvoyMesh repo root (copies plugin + OpenClaw docs page)
./scripts/install-openclaw-extension.sh ~/path/to/openclaw --with-docs
```

Target directory in OpenClaw:

```
openclaw/extensions/envoymesh/
```

OpenClaw discovers extensions under `extensions/*` via each folder’s `openclaw.plugin.json` (same as `extensions/synology-chat`).

**Symlink** (for development):

```bash
ln -sf /path/to/EnvoyMesh/OpenClawExtension /path/to/openclaw/extensions/envoymesh
cd /path/to/openclaw && pnpm install
```

**Docker / mounted fork:** mount `OpenClawExtension` read-only at `/app/extensions/envoymesh` (see OpenClaw `docs/install/docker.md` — same pattern as Synology Chat).

## 2. Configure OpenClaw

Add to your OpenClaw config (e.g. `~/.openclaw/config.json`):

```json
{
  "channels": {
    "envoymesh": {
      "enabled": true,
      "bridgeUrl": "http://127.0.0.1:3031/bridge/send",
      "bridgeSecret": "your-shared-secret",
      "inboundSecret": "your-shared-secret",
      "webhookPath": "/webhook/envoymesh",
      "dmPolicy": "allowlist",
      "allowedOwnerIds": [
        "envoy:owner:abc123…"
      ]
    }
  }
}
```

| Field | Purpose |
|-------|---------|
| `bridgeUrl` | Where the plugin POSTs replies (`EnvoyMesh` bridge `listenPort`, default **3031**) |
| `bridgeSecret` | Bearer token for `/bridge/send` (must match EnvoyMesh `bridge-config.json` `secret`) |
| `inboundSecret` | Bearer token the bridge must send to the webhook (same value if you use one secret) |
| `webhookPath` | Gateway route the bridge calls (default `/webhook/envoymesh`) |
| `allowedOwnerIds` | Mesh senders allowed to DM the bot (`envoy:owner:…` from inbound `fromOwnerId`) |

Restart the **OpenClaw Gateway** so the HTTP route is registered.

Find your Gateway port in OpenClaw logs or config (often `18789`).

**Guided setup:** `openclaw onboard` and select EnvoyMesh, or merge `OpenClawExtension/examples/openclaw-channels.envoymesh.json5` into your config.

## 3. Configure EnvoyMesh (OpenClaw profile)

Copy the example and edit — **do not** overwrite a working HomeClaw `bridge-config.json` unless you intend to switch agents:

```bash
cp apps/node/data/default/bridge-config.openclaw.example.json \
   ~/.envoymesh/my-node/bridge-config.json
```

Example:

```json
{
  "enabled": true,
  "agentUrl": "http://127.0.0.1:18789/webhook/envoymesh",
  "listenPort": 3031,
  "agentName": "OpenClaw",
  "secret": "your-shared-secret"
}
```

| Field | Purpose |
|-------|---------|
| `agentUrl` | `http://<gateway-host>:<port><webhookPath>` — must match OpenClaw `webhookPath` |
| `listenPort` | Bridge HTTP server for `/bridge/send` (default **3031**) |
| `secret` | Optional; must match OpenClaw `bridgeSecret` / `inboundSecret` |

Restart the **EnvoyMesh node** with bridge enabled.

## 4. End-to-end flow

```
Mesh peer --chat.message--> EnvoyMesh node (bridge)
                              |
                              POST agentUrl
                              { from, fromOwnerId, fromName, text }
                              v
                         OpenClaw Gateway
                         /webhook/envoymesh
                              |
                         Agent (inbound.run)
                              |
                         POST bridgeUrl
                         { to: <peerId>, text }
                              v
                         EnvoyMesh /bridge/send
                              |
                         P2P chat.message --> Mesh peer
```

Replies **must** use async `/bridge/send` with `to` = inbound `from` (peer id `envoy_…`). The bridge ignores sync HTTP response bodies from `agentUrl` (same as HomeClaw) to avoid duplicate messages.

## 5. Mesh tools (OpenClaw agent)

When the EnvoyMesh node bridge is running with tool registry wired (default on desktop node), OpenClaw registers:

| Tool | Purpose |
|------|---------|
| `envoymesh_list_mesh_tools` | `GET /bridge/list-tools` on the node |
| `envoymesh_execute_mesh_tool` | `POST /bridge/execute-tool` (`mesh_sendChat`, `mesh_listContacts`, etc.) |

These call the **same** bridge HTTP API as Phase 9I external-agent tools. HomeClaw is unaffected.

## 6. Async mesh replies

`discovery.response` and `knowledge.response` forwarded by the bridge arrive as:

```json
{
  "type": "mesh.async_reply",
  "intent": "knowledge.response",
  "fromPeerId": "envoy_…",
  "messageId": "…",
  "correlationId": "…",
  "payload": { }
}
```

The plugin surfaces them to the agent as `[EnvoyMesh async …]` channel messages (no automatic P2P reply unless the agent sends chat via tools or `/bridge/send`).

## 7. Verify

**Manual E2E:** [openclaw-bridge-e2e-checklist.md](./openclaw-bridge-e2e-checklist.md)

**Automated tests (EnvoyMesh, no OpenClaw binary required):**

```bash
# In-process contract test
npx vitest run apps/node/test/bridge-openclaw-agent-mock.test.ts

# Two-process smoke (mock gateway child + bridge child; runs in ci-smoke-local)
npm run smoke:openclaw-bridge

# Live Gateway smoke (requires built OpenClaw checkout)
export OPENCLAW_ROOT=~/path/to/openclaw   # pnpm build first
npm run smoke:openclaw-bridge:live
```

1. Gateway log: `Registered EnvoyMesh HTTP route: /webhook/envoymesh`
2. Node log: `[bridge] HTTP on http://127.0.0.1:3031/bridge/send`
3. Send a bonded peer `chat.message` to your bridge agent peer id; OpenClaw should receive it; reply should return on mesh.

Run plugin tests after install:

```bash
cd /path/to/openclaw
node scripts/run-vitest.mjs run extensions/envoymesh/src
```

## 8. HomeClaw side-by-side (optional)

| | HomeClaw | OpenClaw |
|---|----------|----------|
| Agent channel | `HomeClaw/channels/envoymesh/` | `EnvoyMesh/OpenClawExtension/` → `openclaw/extensions/envoymesh/` |
| Typical `agentUrl` | `http://localhost:8010/message` | `http://127.0.0.1:<gateway>/webhook/envoymesh` |
| Config file | HomeClaw `config.yml` + EnvoyMesh `bridge-config.json` | OpenClaw `channels.envoymesh` + EnvoyMesh `bridge-config.json` |

Switching agents: change only `agentUrl` (and secrets) in `bridge-config.json`; leave the other product’s channel installed but unused.

## 9. Troubleshooting

| Symptom | Check |
|---------|--------|
| 401 on webhook | `inboundSecret` vs bridge `Authorization: Bearer` |
| 401 on `/bridge/send` | `bridgeSecret` vs `bridge-config.json` `secret` |
| 403 sender not allowed | Add peer’s `fromOwnerId` to `allowedOwnerIds` |
| Reply fails “missing peer id” | Inbound must include `from`; replies use that peer id |
| Duplicate messages | Do not return chat text in webhook HTTP body; use `/bridge/send` only |

## References

- [openclaw-agent-bridge-adr.md](./openclaw-agent-bridge-adr.md) — wire contract and phases B–C
- [implementation-plan.md](./implementation-plan.md) — Phase 9K / 9I
- `apps/node/src/bridge/` — bridge implementation (unchanged for OpenClaw)
- `OpenClawExtension/` — plugin source
