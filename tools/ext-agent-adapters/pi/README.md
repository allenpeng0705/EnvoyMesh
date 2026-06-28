# Pi — EnvoyMesh sidecar (coding assistant)

[Pi](https://github.com/badlogic/pi-mono) is a **coding harness**, not a general chat gateway. Use this backend when you want P2P messages routed to a local Pi RPC session.

## Run

```bash
# Requires `pi` on PATH (pi-mono CLI)
cd tools/ext-agent-adapters/pi
PORT=8022 node server.mjs
```

Registry:

```json
{
  "id": "pi",
  "name": "Pi (coding)",
  "adapter": "envoymesh-message",
  "url": "http://127.0.0.1:8022/message",
  "enabled": true
}
```

## Env

| Variable | Default | Purpose |
|----------|---------|---------|
| `PI_BIN` | `pi` | Pi CLI binary |
| `PI_ECHO` | (unset) | Set to `1` for echo mode without `pi` CLI (dev/CI) |
| `PORT` | 8022 | Sidecar listen port |
| `BRIDGE_URL` | `http://127.0.0.1:3031/bridge/send` | EnvoyMesh bridge |
| `BRIDGE_SECRET` | (empty) | Bearer for `/bridge/send` |

## Note

Pi RPC event shapes vary by version; this sidecar accepts `assistant_text`, `message`, or returns a helpful error if `pi` is missing.
