# Hermes Agent — EnvoyMesh sidecar

Reference adapter for [Nous Hermes Agent](https://github.com/NousResearch/hermes-agent) using profile **`envoymesh-message`**.

## For most users (automatic)

When the **External Agent Bridge** is enabled on your home node:

1. Install Hermes on the same computer as EnvoyMesh.
2. In **Settings → AI → AI Engine**, choose **Hermes** as the active backend.

EnvoyMesh **auto-starts** this sidecar — no Terminal commands required. If `hermes` is on your PATH, replies use the real CLI; otherwise you get `[Hermes echo] …` test replies.

## Manual run (developers / debugging)

```bash
cd tools/ext-agent-adapters/hermes
PORT=8020 node server.mjs
```

Add to `~/.envoymesh/<profile>/bridge-config.json` (usually not needed — defaults are merged automatically):

```json
{
  "activeExtAgent": "hermes",
  "extAgents": [
    {
      "id": "hermes",
      "name": "Hermes",
      "adapter": "envoymesh-message",
      "url": "http://127.0.0.1:8020/message",
      "enabled": true
    }
  ]
}
```

## Production: custom Hermes CLI command

Set `HERMES_CMD` to a shell one-liner that prints the assistant reply on stdout:

```bash
export HERMES_CMD='hermes chat --message "{text}"'
export BRIDGE_URL='http://127.0.0.1:3031/bridge/send'
export BRIDGE_SECRET='your-bridge-secret'
node server.mjs
```

Placeholders: `{text}`, `{fromOwnerId}`, `{from}` (mesh peer id for session keying).

When EnvoyMesh auto-starts the sidecar, it sets `HERMES_CMD` automatically if `hermes` is found on PATH.

## Health

EnvoyMesh probes `GET http://127.0.0.1:8020/status` → `{ "status": "OK" }` when switching backends.

## Long-term

Upstream Hermes **platform plugin** at `~/.hermes/plugins/envoymesh/` can replace this sidecar — same HTTP contract.
