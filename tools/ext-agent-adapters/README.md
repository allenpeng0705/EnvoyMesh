# Ext Agent reference adapters (Phase 44)

Sidecars that speak [EnvoyMesh Bridge Protocol v1](../../docs/envoymesh-bridge-protocol.md) profile **`envoymesh-message`**.

| Adapter | Port (default) | Status |
|---------|----------------|--------|
| [homeclaw/](./homeclaw/) | 8010 | Echo sidecar (dev/CI); production uses HomeClaw channel |
| [hermes/](./hermes/) | 8020 | Runnable sidecar (`echo` or `HERMES_CMD`) |
| [openhuman/](./openhuman/) | 8021 | Echo by default; `OPENHUMAN_RPC_URL` for Tauri RPC |
| [pi/](./pi/) | 8022 | `PI_ECHO=1` or spawns `pi --mode rpc` when installed |

**Operators:** see [docs/ext-agent-getting-started.md](../../docs/ext-agent-getting-started.md) or **Settings → AI → AI Engine** in Social.

Register in `bridge-config.json`:

```json
{
  "activeExtAgent": "hermes",
  "extAgents": [
    { "id": "hermes", "name": "Hermes", "adapter": "envoymesh-message", "url": "http://127.0.0.1:8020/message", "enabled": true }
  ]
}
```

Switch active backend in **Settings → AI → AI Engine** (Social) or edit `activeExtAgent`.
