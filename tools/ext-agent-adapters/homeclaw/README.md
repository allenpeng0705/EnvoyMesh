# HomeClaw — EnvoyMesh sidecar (dev/CI echo)

Reference sidecar that mimics the HomeClaw channel HTTP contract for local testing. Production deployments use the real HomeClaw `channels/envoymesh` plugin.

## Run

```bash
cd tools/ext-agent-adapters/homeclaw
PORT=8010 node server.mjs
```

Registry entry:

```json
{
  "id": "homeclaw",
  "name": "HomeClaw",
  "adapter": "envoymesh-message",
  "url": "http://127.0.0.1:8010/message",
  "enabled": true
}
```

## Env

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | 8010 | Sidecar listen port |
| `BRIDGE_URL` | `http://127.0.0.1:3031/bridge/send` | EnvoyMesh bridge |
| `BRIDGE_SECRET` | (empty) | Bearer for `/bridge/send` |
| `HOMECLAW_CMD` | (empty) | Shell template with `{text}`, `{from}`, `{fromOwnerId}`; echo when unset |
