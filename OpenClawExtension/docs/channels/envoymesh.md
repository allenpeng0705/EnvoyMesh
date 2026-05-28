---
summary: "EnvoyMesh P2P bridge webhook setup and OpenClaw config"
read_when:
  - Setting up EnvoyMesh with OpenClaw as the external agent
  - Debugging mesh chat or bridge tool routing
title: "EnvoyMesh"
---

Status: optional channel plugin (install from EnvoyMesh repo). Connects OpenClaw to an
[EnvoyMesh](https://github.com/envoymesh/envoymesh) home node **P2P bridge** — not to libp2p directly.

**HomeClaw** users should keep using `HomeClaw/channels/envoymesh` instead; default EnvoyMesh
`bridge-config.json` samples target HomeClaw (`http://localhost:8010/message`).

## Install the plugin

Canonical source lives in the EnvoyMesh repository:

```
EnvoyMesh/OpenClawExtension/
```

Copy into your OpenClaw checkout:

```bash
/path/to/EnvoyMesh/scripts/install-openclaw-extension.sh /path/to/openclaw --with-docs
cd /path/to/openclaw && pnpm install
```

Target path: `extensions/envoymesh/`

## Quick setup

1. Install the plugin (above) and run `pnpm install` in OpenClaw.
2. On the **EnvoyMesh node**, enable the bridge and point `agentUrl` at this Gateway webhook.
3. In OpenClaw, configure `channels.envoymesh` (wizard or JSON below).
4. Restart the OpenClaw Gateway and the EnvoyMesh node.
5. Send a bonded peer `chat.message` to your bridge agent peer id; replies return via `/bridge/send`.

Guided setup:

```bash
openclaw onboard
# or
openclaw channels add --channel envoymesh --bridge-url http://127.0.0.1:3031/bridge/send
```

(Flag names depend on your OpenClaw version; JSON config always works.)

## EnvoyMesh `bridge-config.json`

Use a **separate** config when switching from HomeClaw. Example (Gateway on port 18789):

```json
{
  "enabled": true,
  "agentUrl": "http://127.0.0.1:18789/webhook/envoymesh",
  "listenPort": 3031,
  "agentName": "OpenClaw",
  "secret": "your-shared-secret"
}
```

Copy from `EnvoyMesh/apps/node/data/default/bridge-config.openclaw.example.json`.

## OpenClaw config

```json5
{
  channels: {
    envoymesh: {
      enabled: true,
      bridgeUrl: "http://127.0.0.1:3031/bridge/send",
      bridgeSecret: "your-shared-secret",
      inboundSecret: "your-shared-secret",
      webhookPath: "/webhook/envoymesh",
      dmPolicy: "allowlist",
      allowedOwnerIds: ["envoy:owner:abc123…"],
    },
  },
}
```

| Field | Purpose |
|-------|---------|
| `bridgeUrl` | EnvoyMesh bridge `POST /bridge/send` (default port **3031**) |
| `bridgeSecret` | Bearer token for outbound replies |
| `inboundSecret` | Bearer token required on inbound webhook (match `bridge-config.json` `secret`) |
| `webhookPath` | Gateway route (default `/webhook/envoymesh`) |
| `allowedOwnerIds` | Mesh senders (`fromOwnerId` on inbound JSON) |

## Environment variables

- `ENVOYMESH_BRIDGE_URL`
- `ENVOYMESH_BRIDGE_SECRET`
- `ENVOYMESH_INBOUND_SECRET`
- `ENVOYMESH_ALLOWED_OWNER_IDS` (comma-separated)

Config file values override env vars.

## Mesh agent tools

When the node bridge exposes tools:

| OpenClaw tool | Bridge endpoint |
|---------------|-----------------|
| `envoymesh_list_mesh_tools` | `GET /bridge/list-tools` |
| `envoymesh_execute_mesh_tool` | `POST /bridge/execute-tool` |

## Async mesh replies

The bridge may `POST` `type: "mesh.async_reply"` (`discovery.response`, `knowledge.response`) to the same webhook. They appear as `[EnvoyMesh async …]` channel messages for the agent.

## Wire format (chat)

Inbound (`agentUrl`):

```json
{ "from": "<peerId>", "fromOwnerId": "<envoy:owner:…>", "fromName": "…", "text": "…" }
```

Outbound (`bridgeUrl`):

```json
{ "to": "<peerId>", "text": "…" }
```

Replies must use `to` = inbound `from` (peer id). Sync HTTP response bodies from the webhook are not used for P2P delivery.

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Route not registered | Gateway logs; `channels.envoymesh.enabled` |
| 401 inbound | `inboundSecret` vs bridge `Authorization` |
| 401 `/bridge/send` | `bridgeSecret` vs `bridge-config.json` `secret` |
| 403 sender | Add `fromOwnerId` to `allowedOwnerIds` |
| Duplicate P2P messages | Do not return chat text in webhook HTTP body |

## Related

- EnvoyMesh: `docs/openclaw-extension.md`, `docs/openclaw-agent-bridge-adr.md`
- Plugin source: `EnvoyMesh/OpenClawExtension/`
