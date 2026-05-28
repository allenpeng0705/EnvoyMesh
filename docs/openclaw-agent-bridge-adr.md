# ADR: OpenClaw external agent bridge (Phase 9K)

**Status:** Accepted  
**Date:** 2026-05-28  
**Context:** EnvoyMesh ships an HTTP **P2P bridge** (`apps/node/src/bridge/`) so one home node can pipe `chat.message` traffic to an external agent. HomeClaw integrates via `channels/envoymesh`. OpenClaw needs the same wire contract without libp2p access.

**Operator guide:** [agent_bridge_guide.md](./agent_bridge_guide.md)

## Decision

1. **Reuse the HomeClaw HTTP contract** — No new protocol version. The bridge `POST`s JSON to `agentUrl`; the agent returns chat to the mesh only via `POST /bridge/send` on the node (async path). Sync HTTP response bodies from `agentUrl` are **not** used for P2P delivery (duplicate-safe with HomeClaw).

2. **OpenClaw integration** — Ship the channel plugin as **`OpenClawExtension/`** in the EnvoyMesh repo (canonical source). Operators copy or symlink it to `openclaw/extensions/envoymesh/` (Synology Chat pattern). Gateway HTTP route receives bridge inbound; agent replies call `bridgeUrl` with Bearer `bridgeSecret` when configured. **HomeClaw’s** `channels/envoymesh` is unchanged and remains the default `agentUrl` in sample `bridge-config.json`.

3. **Identity & sessions** — Inbound session peer id = `fromOwnerId` (owner DID). Reply routing `to` on `/bridge/send` = P2P `from` (peer id). The plugin remembers `ownerId → peerId` from the latest inbound message per owner.

4. **Security** — Optional shared secret: bridge may send `Authorization: Bearer <secret>` to `agentUrl`; plugin may require the same on inbound. Outbound `/bridge/send` uses the same secret. DM policy uses `allowedOwnerIds` (owner DIDs), not peer ids.

5. **Phased scope**
   - **A (MVP):** `chat.message` ↔ agent text; config-only on EnvoyMesh (`agentUrl` → Gateway webhook). **Done** in `OpenClawExtension/`.
   - **B:** Proxy `GET /bridge/list-tools` and `POST /bridge/execute-tool` via OpenClaw tools `envoymesh_list_mesh_tools` / `envoymesh_execute_mesh_tool`. **Done**.
   - **C:** `mesh.async_reply` POST body to `agentUrl` (discovery/knowledge responses). **Done** (inbound only; agent may reply via tools or chat).
   - **D:** Product docs + setup wizard — **Done** (`OpenClawExtension/docs/channels/envoymesh.md`, `openclaw onboard` wizard, `--with-docs` install).

## Wire contract

### Bridge → agent (`POST agentUrl`)

```json
{
  "from": "<senderPeerId>",
  "fromOwnerId": "<envoy:owner:…>",
  "fromName": "<display name>",
  "text": "<message body>"
}
```

Optional header: `Authorization: Bearer <secret>` when `bridge-config.json` sets `secret`.

### Agent → bridge (`POST http://127.0.0.1:<listenPort>/bridge/send`)

```json
{
  "to": "<recipientPeerId>",
  "text": "<reply body>"
}
```

`to` must be the mesh peer id from inbound `from` (not owner id). Optional same Bearer secret.

### Async mesh (phase C)

`POST agentUrl` with:

```json
{
  "type": "mesh.async_reply",
  "intent": "discovery.response | knowledge.response",
  "correlationId": "…",
  "fromPeerId": "…",
  "messageId": "…",
  "payload": { }
}
```

## Configuration mapping

| EnvoyMesh `bridge-config.json` | OpenClaw `channels.envoymesh` |
|-------------------------------|-------------------------------|
| `agentUrl` | Gateway base + `webhookPath` (e.g. `http://127.0.0.1:18789/webhook/envoymesh`) |
| `secret` | `bridgeSecret` (outbound) + optional `inboundSecret` |
| `listenPort` | `bridgeUrl` default `http://127.0.0.1:3031/bridge/send` |

Example EnvoyMesh: `apps/node/data/default/bridge-config.openclaw.example.json`.

## Differences vs HomeClaw channel

| Topic | HomeClaw | OpenClaw |
|-------|----------|----------|
| Runtime | FastAPI channel → Core `/inbound` | OpenClaw `channel.inbound.run` |
| Reply path | Channel POSTs `/bridge/send` after Core response | Plugin `delivery.deliver` POSTs `/bridge/send` (no sync P2P from HTTP response) |
| Dedup | SHA256(ownerId:text) LRU 200 | Same algorithm in plugin |
| User id | Fixed `user_id` in config | Per-sender session from `fromOwnerId` |

## Consequences

- OpenClaw never holds libp2p keys; EnvoyMesh remains the only network face.
- One bridge per node; one `agentUrl` per bridge (documented in bridge module).
- Phase 9I gateway (`ExternalAgentGateway`) remains orthogonal — bridge auth can still check `isAuthorized(agentId)` on `/bridge/send`.

## CI smokes

| Script | CI | What it proves |
|--------|-----|----------------|
| `npm run smoke:openclaw-bridge` | `ci-smoke-local` (PR) | Mock webhook + real bridge round-trip |
| `npm run smoke:openclaw-bridge:live` | `ci-smoke-openclaw-live` (nightly) | Built OpenClaw Gateway + extension + bridge (`ENVOYMESH_SMOKE_ECHO=1`) |

## References

- `apps/node/src/bridge/pipe.ts`, `apps/node/src/bridge/index.ts`
- `../HomeClaw/channels/envoymesh/channel.py`
- [OpenClawExtension/](../OpenClawExtension/) (canonical plugin source) · [openclaw-extension.md](./openclaw-extension.md) (install & config)
- [implementation-plan.md](./implementation-plan.md) Phase 9K, 9I
