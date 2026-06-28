# OpenHuman — EnvoyMesh sidecar (spike)

OpenHuman runs as a **Tauri desktop app** with internal `agent.chat` / `agent.chat_simple` JSON-RPC — not a loopback HTTP chat gateway.

## What this sidecar does

- Implements Bridge Protocol v1 **`envoymesh-message`** on port **8021** (default).
- **Echo mode** (default): replies with `[OpenHuman echo] {text}` for dev/CI.
- With `OPENHUMAN_RPC_URL` set to a local helper endpoint, forwards prompts to OpenHuman via `agent.chat_simple`.

## Run

```bash
cd tools/ext-agent-adapters/openhuman
PORT=8021 node server.mjs
```

Registry entry:

```json
{
  "id": "openhuman",
  "name": "OpenHuman",
  "adapter": "envoymesh-message",
  "url": "http://127.0.0.1:8021/message",
  "enabled": true
}
```

## Limitations

- OpenHuman must be **running** on the same machine as the home node.
- Cloud webhook tunnels are **not** used — local loopback only.
- Long-term: upstream `envoymesh` channel in OpenHuman (same pattern as HomeClaw).
