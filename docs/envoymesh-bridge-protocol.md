# EnvoyMesh Bridge Protocol

**Version:** 1.0  
**Status:** Stable (core chat path shipped Phase 9K; registry extensions planned Phase 44)  
**Date:** 2026-06-24  

**Related:** [ext_agent_design.md](./ext_agent_design.md), [openclaw-agent-bridge-adr.md](./openclaw-agent-bridge-adr.md), [agent_bridge_guide.md](./agent_bridge_guide.md)

---

## 1. Overview

The **EnvoyMesh Bridge** lets a home node forward P2P `chat.message` traffic to a **local external agent** over HTTP and return replies as signed agent-role envelopes. External agents **must not** use libp2p directly; EnvoyMesh remains the network and policy boundary.

```
  Mesh peer                    Home node (bridge)              External agent
      |                              |                              |
      |  chat.message (libp2p)       |                              |
      |----------------------------->|  POST agentUrl (§3)          |
      |                              |----------------------------->|
      |                              |  POST /bridge/send (§4)      |
      |                              |<-----------------------------|
      |  chat.message (agent reply)  |                              |
      |<-----------------------------|                              |
```

**Implementation:** `apps/node/src/bridge/`  
**Default listen port:** `3031` (loopback only)

---

## 2. Terminology

| Term | Meaning |
|------|---------|
| **Bridge** | EnvoyMesh HTTP server + P2P handler on the home node |
| **Bridge agent peer id** | Libp2p peer id derived from owner + bridge keypair (`bridge-identity.json`) |
| **agentUrl** | URL the bridge POSTs to when forwarding inbound chat |
| **Adapter** | External software implementing inbound/outbound HTTP for a **profile** (§6) |
| **Profile** | Named contract subset (`envoymesh-message`, `openclaw-webhook`, …) — **open set**; new profiles documented in §6.3 |

---

## 3. Bridge → agent (inbound chat)

### 3.1 Request

```
POST {agentUrl}
Content-Type: application/json
Authorization: Bearer {secret}    # optional; when bridge-config secret or per-agent inboundSecret is set
```

**Body (chat message):**

```json
{
  "from": "<senderPeerId>",
  "fromOwnerId": "<envoy:owner:…>",
  "fromName": "<display name>",
  "text": "<message body>"
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `from` | Recommended | Sender **peer id** (`envoy_…`). Required for reply routing via `/bridge/send`. |
| `fromOwnerId` | **Yes** | Owner DID (`envoy:owner:…`). Used for session identity and allowlists. |
| `fromName` | No | Display name; defaults to `fromOwnerId` in adapters. |
| `text` | **Yes** | Message body (UTF-8). Max enforced at bridge ingress (~64 KiB related limits). |

**Optional extensions (OpenClaw webhook profile):**

| Field | Purpose |
|-------|---------|
| `correlationId` | Sync H2A / ask() correlation (OpenClaw only) |
| `policyPrompt` | Bond/policy context for trusted append |
| `retrievedContext` | RAG or memory context |
| `systemPrompt` | System override |

### 3.2 Response

| Profile | Sync body used for P2P? |
|---------|-------------------------|
| `envoymesh-message` | **No** — agent must call `/bridge/send`. Body may echo `{ "text": "…", "status": "ok" }` for logging only. |
| `openclaw-webhook` | **No** — same rule; plugin delivers via `/bridge/send`. |

**Timeout:** bridge uses long timeout for agent processing (up to ~300s on forward path).

### 3.3 Async mesh reply (OpenClaw profile)

When the mesh delivers `discovery.response` or `knowledge.response` to the bridge agent peer, the bridge may POST:

```json
{
  "type": "mesh.async_reply",
  "intent": "discovery.response",
  "correlationId": "…",
  "fromPeerId": "…",
  "remotePeerId": "…",
  "messageId": "…",
  "payload": { }
}
```

Rate-limited on the bridge (~60/min). Agent handles asynchronously (tools or follow-up chat).

---

## 4. Agent → bridge (outbound chat)

### 4.1 Send message

```
POST http://127.0.0.1:{listenPort}/bridge/send
Content-Type: application/json
Authorization: Bearer {secret}    # optional; must match bridge-config secret when set
```

**Body:**

```json
{
  "to": "<recipientPeerId>",
  "text": "<reply body>"
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `to` | **Yes** | Recipient **peer id** from inbound `from` — **not** `envoy:owner:…`. |
| `text` | **Yes** | Reply text. Bridge truncates beyond protocol max with marker. |
| `correlationId` | No | If set, bridge resolves OpenClaw sync ask() instead of P2P send. |

**Success response:**

```json
{ "ok": true, "messageId": "bridge-…" }
```

**Sync reply mode (OpenClaw):**

```json
{ "ok": true, "mode": "sync-reply" }
```

### 4.2 Mesh tools (OpenClaw profile)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/bridge/list-tools` | GET | List EnvoyMesh agent tools |
| `/bridge/execute-tool` | POST | `{ toolName, params }` → tool result |
| `/bridge/agent-share-proposal` | POST | Agent-proposed vault share (FS-E) |

All require same Bearer auth when `secret` is configured. Subject to Phase 9I gateway authorization.

---

## 5. Identity & routing

1. **Inbound session key:** prefer `fromOwnerId` for agent-side session/conversation identity.
2. **Outbound routing key:** always `to` = peer id from latest inbound `from` for that conversation.
3. **Bridge agent peer id:** stable across adapter switches (Phase 44) — peers do not re-bond when switching HomeClaw → Hermes.
4. **Envelope signing:** bridge signs outbound replies with bridge agent credential (`senderRole: "agent"`).

---

## 6. Adapter profiles

Implement **one** profile per external agent deployment.

### 6.1 `envoymesh-message` (minimal)

**Use for:** HomeClaw, Hermes sidecar, OpenHuman sidecar, Pi sidecar.

| Direction | Contract |
|-----------|----------|
| Inbound | `POST {url}` with §3.1 chat body |
| Outbound | `POST /bridge/send` with §4.1 |
| Async mesh | Not required |
| Mesh tools | Not required |

**Reference implementation:** `HomeClaw/channels/envoymesh/channel.py` — listens on `/message`, replies via configured `bridge_url`.

**Health (recommended):**

```
GET {baseUrl}/status  →  { "status": "OK" }
```

### 6.2 `openclaw-webhook` (full)

**Use for:** OpenClaw Gateway + `OpenClawExtension` (EnvoyMesh plugin).

| Direction | Contract |
|-----------|----------|
| Inbound | `POST {gateway}{webhookPath}` — default `/webhook/envoymesh`, §3.1 + §3.3 |
| Outbound | Plugin `sendBridgeMessage()` → `/bridge/send` |
| Async mesh | §3.3 |
| Mesh tools | §4.2 |

**Reference implementation:** `OpenClawExtension/src/webhook-handler.ts`, `bridge-client.ts`.

**Config mapping:**

| Bridge `bridge-config.json` | OpenClaw `channels.envoymesh` |
|-----------------------------|-------------------------------|
| `agentUrl` | Gateway host + `webhookPath` |
| `secret` | `bridgeSecret` + `inboundSecret` |
| `listenPort` | `bridgeUrl` → `http://127.0.0.1:3031/bridge/send` |

### 6.3 Adding a new adapter profile

Third-party agents and future EnvoyMesh releases should follow this order:

1. **Prefer existing profiles** — if the agent can accept §3.1 and reply via §4.1, use `envoymesh-message` with no protocol change.
2. **Document the profile** — add a §6.x subsection here with direction table, health probe, and reference path.
3. **Keep `pipe.ts` generic** — profile-specific HTTP paths live in `apps/node/src/bridge/adapters/<profile>.ts`, not inline vendor checks.
4. **Register only** — operators add `extAgents[]` rows; the home node does not need a release per vendor.
5. **Version bump only when breaking** — new optional JSON fields are v1-compatible; reserve v2 for incompatible wire changes.

Unknown `adapter` values at runtime: bridge logs a warning and attempts §3.1 minimal POST (best-effort); UI shows the raw profile string.

---

## 7. Security

| Control | Requirement |
|---------|-------------|
| Listen bind | `127.0.0.1` only |
| Bearer secret | Optional but recommended for production |
| OpenClaw DM policy | `allowedOwnerIds` / `dmPolicy` on webhook |
| Gateway auth | Phase 9I `isAuthorized(agentId)` on bridge HTTP |
| Body size | 64 KiB cap on bridge HTTP bodies |
| No libp2p in agent | Agents use HTTP only |

---

## 8. Configuration (single agent — current)

`bridge-config.json`:

```json
{
  "enabled": true,
  "agentUrl": "http://127.0.0.1:8010/message",
  "listenPort": 3031,
  "agentName": "HomeClaw",
  "secret": ""
}
```

`assistantAgentUrl` (EnvoyAI built-in) is separate — see Phase 32.

---

## 9. Configuration (multi-agent — Phase 44)

See [ext_agent_design.md §6](./ext_agent_design.md#6-configuration-design).

Summary:

- `extAgents[]` — registry of backends (any agent implementing a profile)
- `activeExtAgent` — id of active entry
- Optional `vendor` / `notes` on registry rows (UI/docs only)
- Resolved `agentUrl` = active entry’s `url`

Legacy configs with only `agentUrl` remain valid.

---

## 10. Companion clients (Social / EnvoyGo)

Ext Agent is reached on the **mesh face** (bridge agent peer id), not by talking to Hermes/Pi URLs from the client.

| Client | Ext Agent chat today | Phase 44 delta |
|--------|----------------------|----------------|
| **Social (desktop)** | `sendToBridge` + bridge agent thread | Active-agent picker + registry UI (44C) |
| **EnvoyGo (Flutter thin client)** | `sendToBridge` RPC → home forwards to `agentUrl` | Read-only `activeExtAgentId` + `adapter` in `BridgeStatus`; `bridge:status` push on switch (44D) |
| **Remote mesh peer** | `chat.message` to bridge agent peer id | No wire change — same peer id when backend switches |

**EnvoyGo path (unchanged wire):**

```
EnvoyGo → WebSocket JSON-RPC sendToBridge(text)
       → home NodeServiceImpl.sendToBridge → forwardToAgent(resolved agentUrl)
       → agent POST /bridge/send → home → chat:message push → EnvoyGo
```

EnvoyGo does **not** need libp2p, direct HTTP to local agents, or per-agent URLs. Switching `activeExtAgent` on the home node changes which backend receives forwards; EnvoyGo only needs updated status metadata for labels.

Relevant code: `apps/envoygo/lib/providers/chat_provider.dart`, `apps/envoygo/lib/widgets/ai_engine_section.dart`, `apps/node/src/node-service-impl.ts` (`sendToBridge`, `setBridgeStatus`).

---

## 11. Version history

| Version | Date | Change |
|---------|------|--------|
| **1.0** | 2026-05-28 | Initial ADR: chat path + OpenClaw webhook + async mesh + tools |
| **1.0** | 2026-06-24 | Canonical protocol doc; adapter profiles; multi-agent registry (planned 44A) |

---

## 12. References

| Resource | Path |
|----------|------|
| ADR (decision record) | [openclaw-agent-bridge-adr.md](./openclaw-agent-bridge-adr.md) |
| Operator guide | [agent_bridge_guide.md](./agent_bridge_guide.md) |
| Ext Agent design | [ext_agent_design.md](./ext_agent_design.md) |
| Bridge code | `apps/node/src/bridge/pipe.ts`, `index.ts`, `async-mesh-reply.ts` |
| OpenClaw plugin tests | `apps/node/test/bridge-openclaw-agent-mock.test.ts` |
