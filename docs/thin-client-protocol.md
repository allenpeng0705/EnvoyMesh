# EnvoyMesh Thin-Client Protocol v0.1

A language-agnostic protocol for thin clients (mobile apps, web UIs, CLI tools) to
connect to an EnvoyMesh home node. The thin client does **not** run a libp2p node,
generate identity keys, or participate in the P2P mesh. It connects to one home node
at a time via secure WebSocket and speaks JSON-RPC 2.0.

---

## 1. Overview

```
┌──────────┐   WebSocket (JSON-RPC)    ┌──────────┐   libp2p    ┌──────────┐
│ Thin     │ ────────────────────────→ │  Home    │ ──────────→ │  P2P     │
│ Client   │ ←──────────────────────── │  Node    │ ←────────── │  Mesh    │
└──────────┘   + push events          └──────────┘             └──────────┘
     │                                      │
     │  (optional)                          │  (optional)
     │  relay tunnel                        │  relay registration
     ▼                                      ▼
┌──────────┐                          ┌──────────┐
│  Relay   │ ←──────────────────────→ │  Relay   │
│  Server  │   home-tunnel (libp2p)   │  Server  │
└──────────┘                          └──────────┘
```

The thin client connects to the home node either directly (LAN / public IP) or
through a relay server. The relay bridges the WebSocket connection to the home
node via an internal libp2p tunnel — the thin client never speaks libp2p.

---

## 2. Pairing

### 2.1 QR Code Format

The home node displays a pairing QR code as a URI:

```
envoy://pair?
  wsUrl=<url_encoded>&
  lanWsUrl=<url_encoded>&
  relayWsUrl=<url_encoded>&
  homeNodePeerId=<peer_id>&
  ownerId=<owner_id>&
  ownerPublicKey=<url_encoded>&
  token=<pairing_token>&
  agentPeerId=<agent_peer_id>&
  agentPubKey=<url_encoded>
```

| Parameter | Example | Purpose |
|-----------|---------|---------|
| `wsUrl` | `ws://47.93.11.212:15432/ws?target=12D3KooW…&token=<t>` | Primary relay URL (contains `target` for routing) |
| `lanWsUrl` | `ws://192.168.3.85:3030/ws` | Direct LAN URL (no relay needed) |
| `relayWsUrl` | `ws://47.93.11.212:15432/ws` | Clean relay endpoint (for reconnection) |
| `homeNodePeerId` | `12D3KooWQsD3ougr…` | Home node's libp2p peer ID |
| `ownerId` | `envoy:owner:diBymBI4…` | Owner DID |
| `ownerPublicKey` | PEM-encoded | Owner's Ed25519 public key |
| `token` | `e6170fe3-…` | Short-lived pairing token (UUID) |
| `agentPeerId` | `envoy_agent_hkHNrLl0…` | Built-in agent peer ID |
| `agentPubKey` | PEM-encoded | Built-in agent public key |

All URL values are percent-encoded. Query parameter values must be decoded before use.

### 2.2 Pairing Handshake

1. Thin client connects to the relay WebSocket URL from `wsUrl` (includes `target` and `token`)
2. Client sends `pairThinClient` RPC with the pairing token
3. Home node validates token → returns `sessionToken` + `ownerId`
4. Client stores session token securely
5. Client disconnects and reconnects with `?token=<sessionToken>` in the URL

> **Note**: During initial pairing, the only RPC the unauthenticated client may call
> is `pairThinClient`. All other RPCs reject with "Authentication required."

### 2.3 pairThinClient RPC

**Request:**
```json
{
  "id": "1",
  "method": "pairThinClient",
  "params": {
    "pairingToken": "<qr-token>",
    "deviceName": "EnvoyGo",
    "platform": "flutter"
  }
}
```

**Response:**
```json
{
  "id": "1",
  "result": {
    "sessionToken": "<uuid>",
    "ownerId": "envoy:owner:diBymBI4…"
  }
}
```

**Errors:**
- `Invalid or expired pairing token` — QR code has expired
- `deviceName required` — Missing device name

---

## 3. Authentication

### 3.1 Session Token

After pairing, the thin client passes the session token as a URL query parameter:

```
ws://<host>:<port>/ws?token=<sessionToken>
```

The home node's WS server validates the token against its session-token store.
If valid, the client is **authenticated** and may call any RPC.

### 3.2 Auth States

| State | URL has `?token=` | Token valid | Allowed RPCs |
|-------|-------------------|-------------|-------------|
| Legacy client | ❌ No | N/A | All (no gate) |
| Authenticated | ✅ Yes | ✅ Yes | All |
| Unauthenticated | ✅ Yes | ❌ No | `pairThinClient` only |

> Legacy clients (Social UI, Capacitor app) connect without a token and are
> unrestricted. This ensures backward compatibility.

### 3.3 Token Lifecycle

- Pairing token: UUID, short-lived (~5 min), single-use
- Session token: UUID, persists across connections, survives home node restart
- Session tokens are stored in `session-tokens.json` on the home node
- Re-pairing the same device reuses the existing token (keyed by `deviceId`)

---

## 4. Transport

### 4.1 Connection Candidates

The thin client resolves transport candidates in priority order:

| Priority | Transport | URL Format | When Used |
|----------|-----------|-----------|-----------|
| 1 | LAN | `ws://<lanIp>:3030/ws?token=<t>` | Same WiFi |
| 2 | Public IP | `ws://<publicHost>:<port>/ws?token=<t>` | Direct WAN |
| 3 | Relay | `ws://<relay>:15432/ws?target=<peerId>&token=<t>` | Cellular/WAN |

The relay URL uses the clean `relayWsUrl` from the QR code (without routing parameters).
The client appends `?token=<sessionToken>` for authentication.

### 4.2 WebSocket Protocol

- **Scheme**: `ws://` (plain) or `wss://` (TLS — future)
- **Subprotocol**: None
- **Heartbeat**: The home node may send WebSocket ping frames; the client must respond with pong (handled by most WebSocket libraries)
- **Reconnect**: If the connection drops, exponential backoff (1s → 2s → 4s → … 30s cap)

### 4.3 Relay Architecture

The relay server bridges thin-client WebSocket connections to home nodes:

```
Thin Client ──ws──→ Relay (port 15432) ──tunnel──→ Home Node (port 3030)
```

1. Thin client connects to `ws://<relay>:15432/ws?target=<homePeerId>&token=<t>`
2. Relay looks up the home node by `target` peer ID
3. If the home node has a registered tunnel, the relay bridges the connection
4. The home node's WS server receives the connection as if it were local

---

## 5. JSON-RPC Methods

All RPCs are JSON-RPC 2.0 request/response over the WebSocket. The `id` field
is a client-generated string (e.g. `rpc_1712345678_1`). The server echoes the
same `id` in the response.

### 5.1 Connection & Pairing

#### `pairThinClient`
Pair with the home node. See §2.3.

#### `getConnectionStatus`
```json
{"method": "getConnectionStatus"}
→ {"result": {"authenticated": true, "peerId": "12D3KooW…"}}
```

### 5.2 Contacts & Bonds

#### `getBonds`
Returns the owner's bonded contacts.
```json
{"method": "getBonds"}
→ {"result": [{"peerOwnerId": "envoy:owner:…", "level": "direct", "displayName": "Alice"}, …]}
```

#### `getPeerProfile`
```json
{"method": "getPeerProfile", "params": {"ownerId": "envoy:owner:…"}}
→ {"result": {"ownerId": "…", "displayName": "Alice", "avatarUrl": "…"}}
```

### 5.3 Chat — Direct Messages

#### `sendChat`
```json
{"method": "sendChat", "params": {"targetOwnerId": "envoy:owner:…", "text": "Hello"}}
→ {"result": {"ok": true, "messageId": "…"}}
```

#### `listChatHistory`
```json
{"method": "listChatHistory", "params": {"targetOwnerId": "envoy:owner:…", "limit": 50}}
→ {"result": [{"messageId": "…", "sender": {"ownerId": "…", "displayName": "…"}, "content": {"text": "…"}, "metadata": {"timestamp": "2026-…"}}, …]}
```

#### `markRead`
```json
{"method": "markRead", "params": {"targetOwnerId": "envoy:owner:…"}}
→ {"result": {"ok": true}}
```

### 5.4 Chat — Group Rooms

#### `listChatRooms`
```json
{"method": "listChatRooms"}
→ {"result": [{"roomId": "…", "title": "Project Chat", "memberCount": 3}, …]}
```

#### `sendChatRoomMessage`
```json
{"method": "sendChatRoomMessage", "params": {"roomId": "…", "text": "Hello"}}
→ {"result": {"ok": true, "messageId": "…"}}
```

### 5.5 AI Agents

#### `sendToOpenClaw`
Send a message to the built-in EnvoyAI (OpenClaw) agent.
```json
{"method": "sendToOpenClaw", "params": {"text": "Summarize this document"}}
→ {"result": {"ok": true}}
```
The agent response arrives as a `chat:message` push event with `sender.ownerId = "__envoy_ai__"` and `sender.actorRole = "agent"`.

#### `getBridgeStatus`
Returns the external agent bridge status (HomeClaw / OpenClaw bridge).
```json
{"method": "getBridgeStatus"}
→ {"result": {"enabled": true, "agentName": "OpenClaw", "agentPeerId": "…", "agentUrl": "…", "listenPort": 0}}
```

### 5.6 Terminals

#### `listTerminalSessions`
```json
{"method": "listTerminalSessions"}
→ {"result": [{"sessionId": "…", "title": "zsh", "runningProcess": "zsh", "cwd": "~"}, …]}
```

#### `createTerminalSession`
```json
{"method": "createTerminalSession", "params": {"command": "zsh", "cwd": "~"}}
→ {"result": {"sessionId": "…"}}
```

#### `closeTerminalSession`
```json
{"method": "closeTerminalSession", "params": {"sessionId": "…"}}
→ {"result": {"ok": true}}
```

#### Terminal PTY I/O (WebSocket sub-channel)
```json
{"method": "homeTerminalWsOpen", "params": {"pathWithQuery": "/pty?sessionId=…"}}
→ opens a separate binary WebSocket for PTY I/O
```

```json
{"method": "homeTerminalWsSend", "params": {"dataBase64": "…"}}
→ sends base64-encoded keystrokes
```

### 5.7 Inbox

#### `listPendingSocialIntroProposals`
```json
{"method": "listPendingSocialIntroProposals"}
→ {"result": [{"fromOwnerId": "…", "fromDisplayName": "…"}, …]}
```

### 5.8 Profile

#### `getHumanProfile`
```json
{"method": "getHumanProfile"}
→ {"result": {"ownerId": "…", "displayName": "…"}}
```

---

## 6. Push Events

The home node pushes events to **all** connected WebSocket clients without the
client needing to subscribe. Events are JSON-RPC notifications (no `id` field).

### 6.1 Event Format

```json
{"event": "<event_name>", "data": {…}}
```

### 6.2 Event Types

| Event | Data Format | Purpose |
|-------|------------|---------|
| `chat:message` | `ChatMessage` (nested) | Direct chat message |
| `chat:room-message` | `ChatMessage` (nested) | Group chat message |
| `bond:established` | `{peerOwnerId: "…"}` | New bond created |
| `bond:revoked` | `{peerOwnerId: "…"}` | Bond removed |
| `bridge:status` | `BridgeStatus` | Agent bridge status change |
| `agent:activity` | `ChatMessage` (nested) | Agent response/activity |
| `terminal:session-updated` | `{}` | Terminal session list changed |
| `terminal:rx` | `{sessionId: "…", text: "…"}` | Terminal PTY output |
| `connected` | `{}` | Connection established |

### 6.3 ChatMessage Structure (Nested Format)

The `chat:message`, `chat:room-message`, and `agent:activity` events carry a
`ChatMessage` object with **nested** structure:

```json
{
  "messageId": "<uuid>",
  "sender": {
    "nodeId": "<peerId>",
    "ownerId": "<ownerId or __envoy_ai__>",
    "displayName": "Display Name",
    "actorRole": "human" | "agent" | "system"
  },
  "recipient": {
    "nodeId": "<peerId>",
    "ownerId": "<ownerId>",
    "displayName": "Display Name"
  },
  "content": {
    "text": "Message content"
  },
  "metadata": {
    "timestamp": "2026-06-10T12:00:00.000Z",
    "deliveryReceipt": "sent",
    "deliveryChannel": "p2p"
  },
  "signature": ""
}
```

**Field notes:**
- `sender.ownerId`: For agent responses, this is `"__envoy_ai__"` (EnvoyAI) or the agent peer ID. For human messages, it's the sender's owner DID.
- `sender.actorRole`: `"human"` for people, `"agent"` for AI responses. Use this to route messages.
- `content.text`: The message body.
- `metadata.timestamp`: ISO 8601 UTC string.

### 6.4 Routing Logic

When a `chat:message` event arrives, the thin client must determine which thread
to place the message in:

| Condition | Thread | Example |
|-----------|--------|---------|
| `sender.ownerId == "__envoy_ai__"` | EnvoyAI thread | Agent response |
| `sender.actorRole == "agent"` | EnvoyAI thread | Any agent |
| `sender.ownerId == selfOwnerId && sender.actorRole == "human"` | `recipient.ownerId` thread | Outbound from home node |
| Otherwise | `sender.ownerId` thread | Inbound from contact |

Thread IDs follow the pattern: `<nodeId>:<contactOwnerId>` (direct), `<nodeId>:envoyai` (agent), `<nodeId>:external` (ext agent), `<nodeId>:term:<sessionId>` (terminal).

---

## 7. Data Models

### 7.1 Contact (Bond)

```json
{
  "peerOwnerId": "envoy:owner:abc123…",
  "displayName": "Alice",
  "level": "direct",
  "avatarUrl": "https://…"
}
```

Field aliases: `owner_id` = `peerOwnerId`, `display_name` = `displayName`, `bond_level` = `level`.

### 7.2 ChatRoom

```json
{
  "roomId": "uuid",
  "title": "Project Chat",
  "memberCount": 3
}
```

Field aliases: `id` = `roomId`, `name` = `title`, `member_count` = `memberCount`.

### 7.3 TerminalSession

```json
{
  "sessionId": "uuid",
  "title": "zsh",
  "runningProcess": "zsh",
  "cwd": "~/projects"
}
```

Field aliases: `id` = `sessionId`, `name` = `title`.

### 7.4 BridgeStatus

```json
{
  "enabled": true,
  "agentName": "OpenClaw",
  "agentPeerId": "envoy_agent_…",
  "agentUrl": "http://…",
  "listenPort": 0
}
```

---

## 8. Error Handling

### 8.1 JSON-RPC Errors

Standard JSON-RPC error response format:
```json
{
  "id": "<request_id>",
  "error": {
    "code": -32000,
    "message": "Human-readable error"
  }
}
```

### 8.2 Common Errors

| Error | Cause | Recovery |
|-------|-------|----------|
| `Authentication required` | Invalid/expired session token | Re-pair |
| `Invalid or expired pairing token` | QR code expired | Re-scan QR |
| `homeRemote.connectTimeout` | Relay unreachable | Retry or check network |
| `homeRemote.notConnected` | WebSocket dropped | Auto-reconnect |
| `Session token not found` | Token deleted from Keychain | Re-pair |

### 8.3 Reconnection

1. On WebSocket close: exponential backoff (1s, 2s, 4s, …, 30s cap)
2. On successful reconnect: re-sync all data (contacts, rooms, terminals, bridge status)
3. Re-subscribe to push events (if auto-subscribe not enabled on server)

---

## 9. Implementation Notes

### 9.1 WebSocket Framing

- All frames sent **from the client must be masked** (RFC 6455 §5.3)
- Standard WebSocket libraries handle this automatically
- The home node's WS server rejects unmasked frames (RFC 6455 requirement)

### 9.2 Connection Lifecycle

```
App Launch → load paired nodes from local DB → auto-connect with session token
  → authenticate → sync data → subscribe to push events → ready

User sends message → optimistic UI update → RPC call → server echoes via push event
  → replace optimistic message with server version (match by text content)

Push event arrives → parse nested ChatMessage → route to correct thread → update UI
```

### 9.3 Local Storage

Implementations should cache:
- **Session token**: In platform keychain (iOS Keychain, Android EncryptedSharedPreferences)
- **Paired nodes**: In local SQLite/IndexedDB (homePeerId, relay URL, public IP)
- **Contacts, threads, messages**: In local SQLite for offline display

### 9.4 Thread Display Names

Threads should show the contact's `displayName`, not the raw `ownerId`. Implementations should:
1. After bonds sync, iterate all direct threads and replace raw owner IDs with display names
2. When creating new threads, look up the contact's display name from the bonds list
3. Fall back to `sender.displayName` from push events if available

---

## 10. Reference Implementation

The EnvoyGo Flutter app (`apps/envoygo/`) is the reference thin-client implementation.
Key files for implementors:

| File | Purpose |
|------|---------|
| `lib/services/home_remote_client.dart` | Transport-agnostic WebSocket client, JSON-RPC, push events, reconnection |
| `lib/services/node_service_client.dart` | Typed RPC wrappers for all methods |
| `lib/services/candidate_resolver.dart` | Transport URL building (LAN → public → relay) |
| `lib/providers/node_provider.dart` | Pairing, authentication, data sync orchestration |
| `lib/providers/chat_provider.dart` | Thread management, message routing, display name resolution |

The reference implementation is ~7000 lines of Dart across 50+ files.

---

## 12. Home-Tunnel Re-Claim (I4)

The relay bridges thin-client WebSockets to a home node through the home
node's persistent `/ws/home` tunnel. Before the I4 fix, if that tunnel
dropped (e.g. home restart, network blip), the mobile's WebSocket was
closed and any subsequent frames were silently lost.

Starting with the I4 fix, the relay now keeps the mobile's WebSocket
open across a tunnel drop and **transparently re-attaches** the channel
when a new tunnel is registered.

### State machine

Per-channel state lives in the relay in a module-level map keyed by
`<homePeerId>|<channelId>`. On every home tunnel close, entries for
that peer are marked `orphaned = true` (the mobile ws is **not**
closed). On every home tunnel open, the relay walks the map for
`orphaned` entries belonging to that peer and:

1. Re-issues the `open` frame on the new tunnel with the same
   `channelId` and `token`.
2. Sends a `tunnel-up` event to the mobile so the UI can show a
   "reconnecting…" indicator.
3. When the home returns `open-ack`, the relay flushes the mobile's
   buffered frames (anything sent during the down period) through the
   new tunnel and sends a fresh `connected` event to the mobile.

### Tunnel events

| Event | Direction | When | Payload |
|-------|-----------|------|---------|
| `tunnel-down` | relay → mobile | Home's `/ws/home` socket closed | `{ peerId }` |
| `tunnel-up` | relay → mobile | New home tunnel opened, channels being re-claimed | `{ peerId }` |
| `connected` | relay → mobile | First `open-ack` (and every re-claim `open-ack`) | `{ relayProxied: true }` |

The mobile's `HomeRemoteClient` surfaces these via its standard
`client.on('tunnel-down', handler)` and `client.on('tunnel-up', handler)`
API — no special wiring needed.

### Wire-level invariants

- **Channel id is stable across a re-claim.** The mobile's
  `homeTerminalWsOpen` / `homeTerminalWsSend` calls reference the same
  `sessionId` (which is the same as the relay's `channelId` for the
  tunnel proxy) before, during, and after a re-claim. No re-Open
  required on the mobile.
- **Frames are never silently lost.** During a tunnel-down window, the
  mobile's JSON-RPC and PTY frames are buffered in the relay (capped
  by `MAX_HOME_TUNNEL_DATA_BYTES` per outbound frame on the home side;
  no cap on buffered inbound frames in the relay, since the relay
  already discards anything exceeding the cap on the data-forward
  path). On re-claim, the buffer is forwarded to the new tunnel
  in-order.
- **Mobile ws is never closed by a tunnel drop.** Only the home
  explicitly closing the channel (`{ type: "close", channelId }` on the
  tunnel) terminates the mobile side. The mobile's own `ws.on("close")`
  also terminates the proxy.

### Tests

`apps/relay/test/home-tunnel-recovery.test.ts` is an end-to-end test
that drives the production state machine (mirrored in the test
harness) through:

1. Stable tunnel: open → ack → connected → bidirectional RPC.
2. Tunnel drop: mobile stays open, receives `tunnel-down`.
3. Re-claim: new tunnel → mobile receives `tunnel-up` and
   `connected` → buffered RPC frames arrive on the new home in order.
4. Mid-drop RPCs: frames sent during the drop are flushed to the new
   home, and the new home's response is delivered to the mobile.
5. Mobile never closes when the home tunnel closes between RPCs.

### Code locations

| File | Purpose |
|------|---------|
| `apps/relay/src/index.ts` | `proxyChannels` map, `reclaimOrphans` closure, `tunnel-down`/`tunnel-up` emit |
| `apps/relay/test/home-tunnel-recovery.test.ts` | End-to-end recovery test (5 cases) |
| `apps/node/src/home-terminal-ws.ts` | Per-`(companion, sessionId)` ownership check in `terminal.on("message"/"close")` — closes a window where a replaced session's events could leak to the companion |
| `apps/envoygo/lib/screens/terminals/terminal_detail_screen.dart` | "Reconnecting…" chip in the AppBar while `_tunnelUp == false` |

