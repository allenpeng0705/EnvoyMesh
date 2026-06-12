# Flutter Thin Client Design — EnvoyGo

**Status:** Design + Implementation (2026-06-13)
**Phase:** 31 (31A–31D shipped)
**Phase:** 31
**Related:** [implementation-plan.md § Phase 31](./implementation-plan.md#phase-31--flutter-thin-client-envoygo-design) · [satellite-app-adr.md](./satellite-app-adr.md)

---

## 1. Overview

**EnvoyGo** is a Flutter mobile app (iOS + Android) that acts as a **remote client** to a home EnvoyMesh node. It connects to one home node at a time via secure WebSocket or libp2p circuit relay, calls JSON-RPC methods, and renders a minimal, chat-focused UI.

EnvoyGo runs a **full libp2p node** (`dart_libp2p` + `dart_libp2p_kad_dht`) as an additional transport. This enables direct P2P connections (LAN, circuit relay) when the home node is reachable, while retaining the relay WebSocket as a permanent fallback. It does not generate identity keys, store a vault, or participate in the mesh as a full node.

### 1.1 Design Principles

1. **Thin always.** Every feature delegates to the home node via RPC. No local mesh participation.
2. **Pair once, persist.** Pairing produces a session token stored in secure storage. Reconnection is automatic.
3. **Minimal UI.** Three tabs. No settings maze. Everything the user doesn't need on mobile stays on the home node.
4. **Multi-transport resilience.** Try LAN first, fall back to relay tunnel, add libp2p later. Transparent to the user.
5. **Zero server changes.** The thin client speaks the existing `ws-protocol.ts` JSON-RPC protocol — the home node already supports everything needed for core operation. Push notifications (Firebase FCM) is the one optional server-side addition, gated behind a config flag.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   FLUTTER COMPANION APP                      │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                    UI Layer (Flutter)                  │  │
│  │                                                       │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐    │  │
│  │  │ Chats    │  │ Contacts │  │ Me               │    │  │
│  │  │ Tab      │  │ Tab      │  │ Tab              │    │  │
│  │  │          │  │          │  │                  │    │  │
│  │  │ • Thread │  │ • Bonded │  │ • Profile view   │    │  │
│  │  │   list   │  │   list   │  │ • Active node    │    │  │
│  │  │ • AI     │  │ • Search │  │ • Node switcher  │    │  │
│  │  │   chats  │  │ • Status │  │ • Unpair         │    │  │
│  │  │ • Groups │  │          │  │ • Theme toggle   │    │  │
│  │  │ • Termi- │  │          │  │                  │    │  │
│  │  │   nals   │  │          │  │                  │    │  │
│  │  └────┬─────┘  └────┬─────┘  └────────┬─────────┘    │  │
│  │       │             │                 │              │  │
│  └───────┼─────────────┼─────────────────┼──────────────┘  │
│          │             │                 │                  │
│  ┌───────▼─────────────▼─────────────────▼──────────────┐  │
│  │                 State Layer (Riverpod)                │  │
│  │                                                       │  │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐  │  │
│  │  │ ChatProvider │ │ContactProv.  │ │ NodeProvider  │  │  │
│  │  │ • threads    │ │ • bonds      │ │ • session     │  │  │
│  │  │ • messages   │ │ • profiles   │ │ • transport   │  │  │
│  │  │ • rooms      │ │ • status     │ │ • nodes[]     │  │  │
│  │  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘  │  │
│  │         │                │                │          │  │
│  └─────────┼────────────────┼────────────────┼──────────┘  │
│            │                │                │              │
│  ┌─────────▼────────────────▼────────────────▼──────────┐  │
│  │              Service Layer                            │  │
│  │                                                       │  │
│  │  ┌──────────────────────────────────────────────────┐ │  │
│  │  │ HomeRemoteClient (Dart)                          │ │  │
│  │  │  • Multi-transport (LAN WS / relay WS)           │ │  │
│  │  │  • JSON-RPC call() with request/response         │ │  │
│  │  │  • Push event dispatch (chat:message, etc.)      │ │  │
│  │  │  • Auto-reconnect with backoff                   │ │  │
│  │  │  • Transport upgrade sweep (30s)                 │ │  │
│  │  └──────────────────────┬───────────────────────────┘ │  │
│  │                         │                             │  │
│  │  ┌──────────────────────▼───────────────────────────┐ │  │
│  │  │ NodeServiceClient (Dart)                         │ │  │
│  │  │  • Typed wrappers around JSON-RPC methods        │ │  │
│  │  │  • getBonds(), sendChat(), listChatRooms(), etc. │ │  │
│  │  └──────────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────┘  │
│                          │                                  │
│  ┌───────────────────────▼──────────────────────────────┐  │
│  │                 Storage Layer                         │  │
│  │                                                       │  │
│  │  ┌──────────────────┐ ┌────────────────────────────┐ │  │
│  │  │ SecureStorage    │ │ LocalDatabase (sqflite)     │ │  │
│  │  │ • session token  │ │ • chat cache                │ │  │
│  │  │ • node list      │ │ • contact cache             │ │  │
│  │  │ • pairing data   │ │ • room cache                │ │  │
│  │  └──────────────────┘ └────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          │ LAN ws://     │ relay tunnel  │
          │               │               │
┌─────────▼───────────────▼───────────────▼─────────────────┐
│                     HOME NODE                              │
│                                                            │
│  WsServer (port 3030)                                      │
│  ├─ /ws — JSON-RPC (all 281 methods)                       │
│  ├─ /ws?token=... — authenticated session                  │
│  ├─ client-proxy-handler — validates token, routes RPC     │
│  ├─ homeTerminalWs — PTY tunnel for terminal               │
│  └─ Push events: chat:message, hello:request,              │
│                  terminal:rx, bond:established, ...         │
└────────────────────────────────────────────────────────────┘
```

---

## 3. Transport Layer

### 3.1 `HomeRemoteClient` (Dart port of TypeScript `home-remote-client.ts`)

The `HomeRemoteClient` is the single connection point to the home node. It manages transport selection, reconnection, and JSON-RPC multiplexing.

**Transport candidates (priority order):**

| Priority | Name | URL pattern | When available |
|----------|------|------------|----------------|
| 1 | LAN WebSocket | `ws://<home-lan-ip>:3030/ws` | Same WiFi/LAN |
| 2 | Public IP WebSocket | `ws://<public-host>:<port>/ws` | Direct WAN access |
| 3 | Relay WebSocket (circuit relay) | `ws://<relay>:15432/ws?target=<homePeerId>&token=<token>` | Home node reachable via relay |
| 4 | libp2p circuit relay | `/p2p/<relayPeerId>/p2p-circuit/p2p/<homePeerId>` | Circuit relay v2 via community relay |
| 5 | Community relay (DHT bootstrap fallback) | `ws://47.93.11.212:15432/ws?target=<homePeerId>` | Community relay as last resort |

**Note:** Mobile/unknown network promotes relay candidates to the front to avoid 8s LAN timeouts. EnvoyGo runs a `dart_libp2p` node that connects to the community relay (`47.93.11.212:4001`) as a DHT bootstrap peer, enabling `findPeer(homePeerId)` queries when both peers have connected to the relay.

**Connection lifecycle:**

```
App Launch
    │
    ▼
Load stored session(s) from SecureStorage
    │
    ▼
Select active node (last-used, or manual switch)
    │
    ▼
Resolve candidates (in priority order)
    │
    ├─ Try LAN WS (timeout: 8s) [mobile: skipped — unreachable]
    │   ├─ connected → set active transport
    │   └─ failed → try next
    │
    ├─ Try relay WebSocket (timeout: 8s)
    │   ├─ connected → perform proxy-connect handshake → set active transport
    │   └─ failed → try next
    │
    ├─ Try libp2p circuit relay (via community relay)
    │   ├─ connect to community relay (TCP 4001)
    │   ├─ dial /p2p/<relay>/p2p-circuit/p2p/<home>
    │   ├─ perform proxy-connect handshake
    │   ├─ connected → set active transport
    │   └─ failed → try next
    │
    ├─ Try community relay WebSocket fallback
    │   ├─ connected → perform proxy-connect handshake → set active
    │   └─ failed → try next
    │
    └─ All failed: show "Home node offline"
    │
    ▼
Background upgrade sweep (every 30s):
    Try higher-priority candidates; switch if reachable
    │
    ▼
On disconnect:
    Exponential backoff (1s → 2s → 4s → ... → 30s max)
    Retry all candidates
```

**JSON-RPC wire format** (identical to `ws-protocol.ts`):

```json
// Request
{ "id": "msg_1", "method": "sendChat", "params": { "targetOwnerId": "...", "text": "hello" } }

// Response
{ "id": "msg_1", "result": { "messageId": "abc123" } }

// Push event
{ "event": "chat:message", "data": { "senderOwnerId": "...", "text": "hi", ... } }
```

**Terminal frames** (binary channel):

```
// Open terminal tunnel
{ "id": "term_1", "method": "homeTerminalWsOpen", "params": { "pathWithQuery": "/attach?sessionId=..." } }

// Send PTY input (base64-encoded binary)
{ "id": "term_2", "method": "homeTerminalWsSend", "params": { "dataBase64": "..." } }

// Receive PTY output (push event)
{ "event": "homeTerminalWs:rx", "data": { "dataBase64": "..." } }
```

### 3.2 Candidate Resolver

The candidate resolver builds transport URLs from stored pairing data. Candidates are ordered so LAN/relay are tried first; the community relay is a last-resort fallback. When `isOnWifi != true` (mobile/cellular), relay candidates are promoted to the front to avoid 8s LAN timeouts.

```dart
class CandidateResolver {
  // From stored node + pairing data:
  // homePeerId, lanIp, publicHost, publicPort,
  // relayWsUrl, sessionToken, bootstrapPeers[]

  List<HomeRemoteCandidate> resolve(StoredNode node, {
    String? sessionToken,
    bool? isOnWifi,
  }) {
    var candidates = <HomeRemoteCandidate>[];

    // 1. LAN WebSocket
    if (node.lanIp != null) { /* ... */ }

    // 2. Public IP WebSocket
    if (node.publicHost != null) { /* ... */ }

    // 3. User's relay WebSocket (circuit relay via ?target=)
    if (node.relayWsUrl != null && node.homePeerId != null) {
      candidates.add(HomeRemoteCandidate(
        name: 'relay',
        url: '$relayWsUrl?target=$homePeerId&token=$sessionToken',
      ));
    }

    // 4. Bootstrap peers from QR code (user's configured relays)
    for (final peer in node.bootstrapPeers) {
      if (peer.startsWith('/')) continue; // skip libp2p multiaddrs
      candidates.add(HomeRemoteCandidate(name: 'bootstrap', url: peer));
    }

    // 5. Community relay WebSocket (last resort)
    // ws://47.93.11.212:15432/ws?target=$homePeerId

    // 6. Community relay libp2p circuit relay candidate
    // /p2p/12D3KooWLNR4.../p2p-circuit/p2p/$homePeerId
    // (used by Libp2pNode.dial() → connect() → newStream())

    // Mobile/cellular: promote relay to front
    if (isOnWifi != true) {
      final relayFirst = candidates.where((c) => c.name == 'relay').toList();
      final rest = candidates.where((c) => c.name != 'relay').toList();
      candidates = [...relayFirst, ...rest];
    }

    return candidates;
  }
}
```

**Libp2pNode bootstrap flow:**
1. `start(bootstrapAddrs: ['/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWLNR4...'])` — connects to community relay as DHT bootstrap peer
2. `dial('/p2p/<relay>/p2p-circuit/p2p/<homePeerId>')` — opens stream through circuit relay
3. `performHandshake(token)` — sends `proxy-connect` → waits for `proxy-accept` (matches `client-proxy-handler.ts` on home node)

---

## 4. Pairing Flow

### 4.1 QR Code Pairing

The pairing flow mirrors the existing Phase 11 mechanism but simplified:

```
Mobile App                          Home Node (Social UI)
    │                                      │
    │  1. User taps "Pair with Node"       │
    │     → Opens QR scanner               │
    │                                      │
    │  2. Scans QR code                    │  3. User opens Social UI →
    │     envoy://pair?                     │     Settings → Devices →
    │       token=<pairingToken>&           │     "Show Pairing QR"
    │       peerId=<homePeerId>&            │
    │       wsPort=3030&                    │
    │       relayWsUrl=<relayUrl>&          │
    │       name=<nodeName>                 │
    │                                      │
    │  4. Parse URI, connect to home       │
    │     via best available transport     │
    │                                      │
    │  5. RPC: pairWithHomeNode({          │
    │       pairingToken,                  │
    │       deviceName: "iPhone 17",       │
    │     })                               │
    │                                      │
    │                                      │  6. Validate pairing token
    │                                      │     Create device certificate
    │                                      │     Generate session token
    │                                      │
    │  7. ← { sessionToken,                │
    │         ownerId,                      │
    │         deviceCertificate }           │
    │                                      │
    │  8. Store session token in           │
    │     flutter_secure_storage           │
    │                                      │
    │  9. Store node info in local DB:     │
    │     { nodeId, name, peerId,          │
    │       lanIp (if on LAN),             │
    │       relayWsUrl, ownerId }          │
    │                                      │
    │  10. RPC: getBonds() → sync contacts │
    │      RPC: listChatRooms() → sync rms │
    │      Subscribe: chat:message,        │
    │                bond:established, ... │
    │                                      │
    │  11. Show Chats tab (ready)          │
```

### 4.2 Pairing URI Format

```
envoy://pair?token=<pairingToken>&peerId=<peerId>&wsPort=3030&relayWsUrl=<url>&name=<name>&lanIp=<ip>
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `token` | Yes | Short-lived pairing token (home node generates) |
| `peerId` | Yes | Home node's libp2p peer ID |
| `wsPort` | No | WebSocket port (default 3030) |
| `relayWsUrl` | No | Relay WebSocket URL for WAN connectivity |
| `name` | No | Human-readable node name ("My Mac Mini") |
| `lanIp` | No | LAN IP if on same network at pairing time |

### 4.3 Reconnection (No Re-pair)

After pairing, the session token is stored in `flutter_secure_storage`. On every app launch:

1. Load stored nodes from local DB
2. Select active node (last-used or user-chosen)
3. Load session token for that node
4. Connect via best transport
5. Authenticate with session token
6. If token rejected (expired/revoked) → prompt re-pair for that node

The user **never** needs to re-scan a QR code unless the home node revokes the session or the secure storage is wiped.

### 4.4 Unpairing

**From mobile:** RPC `revokeAuthorizedDevice(deviceId)` → clear local node data.

**From home node:** Social UI → Settings → Devices → Revoke. The mobile app will discover this on next connect (token rejected) and clear the stale node.

---

## 5. RPC Surface

The thin client uses a **subset** of the 281 JSON-RPC methods. Grouped by feature:

### 5.1 Connection & Pairing

| Method | Purpose | Frequency |
|--------|---------|-----------|
| `getConnectionStatus` | Home node status, connectivity | On connect + periodic |
| `getNodeStatus` | Node health | On demand |
| `pairWithHomeNode` | Pair a new device | Once per pairing |
| `listAuthorizedDevices` | Show paired devices | Me tab |
| `revokeAuthorizedDevice` | Unpair this device | On unpair |
| `getPairingPayload` | (Optional) fetch pairing QR data | Rare |

### 5.2 Contacts & Bonds

| Method | Purpose | Frequency |
|--------|---------|-----------|
| `getBonds` | Bonded contacts list | On connect + push-driven refresh |
| `getPeerProfile` | Single contact profile | On thread open |
| `listPeerProfiles` | All cached profiles | On Contacts tab open |
| `getPeerConnectionInfo` | Contact online status | Periodic (contacts tab) |
| `listPendingSocialIntroProposals` | Pending intros | Inbox |

### 5.3 Chat — Direct Messages

| Method | Purpose | Frequency |
|--------|---------|-----------|
| `sendChat` | Send message to bonded contact | Per message |
| `listChatHistory` | Load chat thread | On thread open |
| `sendChatAttachment` | Send file/image | Per attachment |
| `markRead` | Mark thread read | On thread view |
| `deleteChatMessage` | Delete a message | Rare |

### 5.4 Chat — Group Rooms

| Method | Purpose | Frequency |
|--------|---------|-----------|
| `listChatRooms` | All chat rooms | On connect + push-driven |
| `createChatRoom` | Create new group | On user action |
| `sendChatRoomMessage` | Send to group | Per message |
| `inviteToChatRoom` | Add members | On user action |
| `leaveChatRoom` | Leave group | Rare |
| `renameChatRoom` | Rename group | Rare |

### 5.5 AI Chat — EnvoyAI / OpenClaw

| Method | Purpose | Frequency |
|--------|---------|-----------|
| `sendToOpenClaw` | Send message to built-in OpenClaw agent (EnvoyAI) | Per AI message |
| `getBridgeStatus` | Check agent bridge status | On connect |
| `sendAgentChat` | Send as agent to a contact | When user triggers |

### 5.6 AI Chat — External Agents

| Method | Purpose | Frequency |
|--------|---------|-----------|
| `getBridgeStatus` | Check external agent (HomeClaw) status | On connect |
| `sendToOpenClaw` | Chat with external agent via OpenClaw bridge | Per message |
| `listAgentCards` | List known agent cards | Rare |

### 5.7 Terminals

| Method | Purpose | Frequency |
|--------|---------|-----------|
| `listTerminalSessions` | Active terminal sessions | On Terminals view open |
| `createTerminalSession` | New terminal | On user action |
| `closeTerminalSession` | Close terminal | On user action |
| `renameTerminalSession` | Rename session | Rare |
| `homeTerminalWsOpen` | Attach to PTY (opens WS sub-channel) | Per terminal open |
| `homeTerminalWsSend` | Send keystrokes (base64) | Per keystroke/batch |
| `homeTerminalWsClose` | Detach from PTY | On terminal close |

### 5.8 Profile (Read-Only)

| Method | Purpose | Frequency |
|--------|---------|-----------|
| `getHumanProfile` | Owner's profile | On Me tab |
| `getAgentIdentity` | Agent identity doc | Rare |

### 5.9 Events (Push Subscriptions)

| Event | Purpose | Drives |
|-------|---------|--------|
| `chat:message` | New inbound direct message | Thread list + notification |
| `chat:room-message` | New group message | Room thread |
| `hello:request` | New bond request | Inbox badge |
| `bond:established` | New bond confirmed | Contacts refresh |
| `bridge:status` | Agent bridge status change | AI chat availability |
| `terminal:rx` | PTY output | Terminal display |
| `node:online` / `node:offline` | Home node up/down | Connection indicator |

---

## 6. UI Design

### 6.1 Tab Structure (3 tabs)

```
┌──────────────────────────────────────────┐
│  EnvoyGo                      ●●● (home) │  ← Status bar
├──────────────────────────────────────────┤
│                                          │
│  ┌──────────┬──────────┬──────────┐      │
│  │  Chats   │ Contacts │    Me    │      │  ← Tab bar
│  └──────────┴──────────┴──────────┘      │
│                                          │
│  [Tab content area]                      │
│                                          │
└──────────────────────────────────────────┘
```

### 6.2 Chats Tab

The main screen. A unified thread list:

```
┌──────────────────────────────────────────┐
│  Chats                            🔍  ✚  │
├──────────────────────────────────────────┤
│  ┌──────────────────────────────────────┐│
│  │ 💬 Alice                    10:32 AM ││
│  │    "Sure, let's meet up then"        ││
│  ├──────────────────────────────────────┤│
│  │ 👥 Book Club                 9:15 AM ││  ← Group chat
│  │    Bob: "Chapter 5 was great"        ││
│  ├──────────────────────────────────────┤│
│  │ 🧠 EnvoyAI                          ││  ← Built-in AI
│  │    "I found 3 documents matching..." ││
│  ├──────────────────────────────────────┤│
│  │ 🤖 HomeClaw                         ││  ← External agent
│  │    "Task completed: PR #342 merged"  ││
│  ├──────────────────────────────────────┤│
│  │ 🖥 Terminal: project                ││  ← Terminal session
│  │    $ npm run build                   ││
│  ├──────────────────────────────────────┤│
│  │ 💬 Charlie                   Yesterday││
│  │    "Thanks for the file!"            ││
│  └──────────────────────────────────────┘│
└──────────────────────────────────────────┘
```

**Thread types (identified by `senderOwnerId` prefixes or metadata):**

| Type | Icon | How identified |
|------|------|---------------|
| Direct contact | 💬 avatar | `senderOwnerId` matches a bonded contact |
| Group chat | 👥 group icon | `chatRoomId` present in message |
| EnvoyAI | 🧠 brain | `senderPeerId` matches bridge agent peer |
| External agent | 🤖 robot | `senderPeerId` matches external agent |
| Terminal session | 🖥 terminal | From `listTerminalSessions` |

### 6.3 Chat Detail View

Opened when tapping a thread:

```
┌──────────────────────────────────────────┐
│  ← Alice                            ⚙ ⋮  │
├──────────────────────────────────────────┤
│                                          │
│  ┌────────────────────────────────┐      │
│  │ Alice: Hey, are you free       │      │
│  │ tomorrow?                      │      │
│  └────────────────────────────────┘      │
│                                          │
│              ┌──────────────────────┐    │
│              │ Sure! What time?     │    │
│              └──────────────────────┘    │
│                                          │
│  ┌────────────────────────────────┐      │
│  │ Alice: How about 3pm?          │      │
│  └────────────────────────────────┘      │
│                                          │
│  ┌──────────────────────────────────────┐│
│  │ Type a message...               📎 📷││
│  └──────────────────────────────────────┘│
└──────────────────────────────────────────┘
```

### 6.4 AI Chat

Same chat UI, but with agent identity badge:

```
┌──────────────────────────────────────────┐
│  ← EnvoyAI 🧠                            │
│     "Online — powered by OpenClaw"       │
├──────────────────────────────────────────┤
│                                          │
│              ┌──────────────────────┐    │
│              │ Summarize the latest │    │
│              │ project updates      │    │
│              └──────────────────────┘    │
│                                          │
│  ┌────────────────────────────────┐      │
│  │ 🧠 EnvoyAI                     │      │
│  │ Here's what I found from the   │      │
│  │ recent activity:               │      │
│  │                                │      │
│  │ • PR #342 merged (2h ago)      │      │
│  │ • 3 new documents in vault     │      │
│  │ • Alice sent a message         │      │
│  └────────────────────────────────┘      │
└──────────────────────────────────────────┘
```

### 6.5 Terminal View

When tapping a terminal thread:

```
┌──────────────────────────────────────────┐
│  ← Terminal: project                      │
│     "home-node ~/projects/envoymesh"      │
├──────────────────────────────────────────┤
│  $ npm run build                         │
│                                          │
│  > envoymesh@1.0.0 build                 │
│  > tsc -b                                │
│                                          │
│  Build completed successfully.           │
│                                          │
│  $ npm test                              │
│  ...running...                           │
│  _                                       │  ← Cursor
│                                          │
├──────────────────────────────────────────┤
│  ┌──────────────────────────────────────┐│
│  │ $ _                          [Ctrl+C]││  ← Input bar
│  └──────────────────────────────────────┘│
└──────────────────────────────────────────┘
```

### 6.6 Contacts Tab

```
┌──────────────────────────────────────────┐
│  Contacts                         🔍     │
├──────────────────────────────────────────┤
│  ┌──────────────────────────────────────┐│
│  │ ● Alice                        Chat  ││  ← Green = online
│  │   "Software Engineer"                 ││
│  ├──────────────────────────────────────┤│
│  │ ○ Bob                          Chat  ││  ← Gray = offline
│  │   "Designer"                          ││
│  ├──────────────────────────────────────┤│
│  │ ● Charlie                      Chat  ││
│  │   "DevOps"                            ││
│  └──────────────────────────────────────┘│
└──────────────────────────────────────────┘
```

### 6.7 Me Tab

Minimal, read-only profile + node management:

```
┌──────────────────────────────────────────┐
│  Me                                      │
├──────────────────────────────────────────┤
│                                          │
│         ┌──────────┐                     │
│         │  Avatar  │                     │
│         └──────────┘                     │
│                                          │
│         Display Name                     │
│         ownerId (truncated)              │
│                                          │
│  ┌──────────────────────────────────────┐│
│  │ Connected Node                       ││
│  │ ● My Mac Mini                        ││
│  │   LAN · 3ms                          ││
│  │                            [Switch]  ││
│  ├──────────────────────────────────────┤│
│  │ Paired Devices                2 more ││
│  │   • iPhone 17 (this device)          ││
│  │   • iPad Pro                         ││
│  ├──────────────────────────────────────┤│
│  │ Theme                        🌙 Dark ││
│  ├──────────────────────────────────────┤│
│  │ Unpair This Device                   ││
│  │ (Disconnect and remove all data)     ││
│  └──────────────────────────────────────┘│
└──────────────────────────────────────────┘
```

---

## 7. Multi-Node Support

### 7.1 Design

The app can store pairing data for **multiple home nodes**. Only **one node is active** at a time. Switching nodes disconnects from the current node and connects to the selected one.

### 7.2 Data Model

```dart
class StoredNode {
  final String id;            // UUID v4, generated locally
  final String name;          // Human-readable ("My Mac Mini")
  final String ownerId;       // Home node's owner ID
  final String homePeerId;    // Home node's libp2p peer ID
  final String sessionToken;  // Stored in SecureStorage, keyed by id
  final String? lanIp;        // Last known LAN IP
  final int wsPort;           // WebSocket port
  final String? relayWsUrl;   // Relay URL for WAN fallback
  final DateTime pairedAt;
  final DateTime lastConnectedAt;
}
```

### 7.3 Node Switching Flow

```
1. User taps "Switch" on Me tab
2. Bottom sheet shows all paired nodes with last-connected time
3. Tap a node → disconnect current, connect to selected
4. On connect: load contacts/rooms from that node
5. On disconnect from old node: unsubscribe events, clear chat cache for that node
```

### 7.4 Why Only One Active Node?

- Chat context is node-specific (different contacts per owner)
- Push event subscriptions would conflict
- Simplifies the mental model: "I'm talking through my Mac Mini" vs "I'm talking through my Work PC"
- Terminal sessions are node-specific by definition

---

## 8. Local Storage

### 8.1 Secure Storage (`flutter_secure_storage`)

| Key | Value | Purpose |
|-----|-------|---------|
| `node.<id>.sessionToken` | JWT/opaque string | Authenticate with home node |
| `node.<id>.ownerId` | owner ID string | Identity verification |

### 8.2 Local Database (`sqflite`)

**Tables:**

```sql
-- Paired nodes
CREATE TABLE nodes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  home_peer_id TEXT NOT NULL,
  lan_ip TEXT,
  ws_port INTEGER DEFAULT 3030,
  relay_ws_url TEXT,
  paired_at TEXT NOT NULL,
  last_connected_at TEXT
);

-- Cached contacts (synced from getBonds)
CREATE TABLE contacts (
  owner_id TEXT NOT NULL,
  node_id TEXT NOT NULL,          -- which node this contact belongs to
  display_name TEXT,
  bond_level TEXT,
  avatar_base64 TEXT,
  last_seen TEXT,
  PRIMARY KEY (owner_id, node_id)
);

-- Cached chat threads (synced from listChatHistory)
CREATE TABLE chat_threads (
  id TEXT PRIMARY KEY,            -- composite: nodeId:contactOwnerId
  node_id TEXT NOT NULL,
  contact_owner_id TEXT,          -- null for group/AI chats
  chat_room_id TEXT,              -- null for direct chats
  agent_type TEXT,                -- 'envoyai', 'external', or null
  last_message_text TEXT,
  last_message_at TEXT,
  unread_count INTEGER DEFAULT 0
);

-- Cached messages
CREATE TABLE messages (
  id TEXT PRIMARY KEY,            -- messageId from server
  thread_id TEXT NOT NULL,
  sender_owner_id TEXT,
  sender_display_name TEXT,
  text TEXT,
  created_at TEXT,
  is_outbound INTEGER DEFAULT 0,
  FOREIGN KEY (thread_id) REFERENCES chat_threads(id)
);

-- Cached chat rooms
CREATE TABLE chat_rooms (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL,
  name TEXT NOT NULL,
  member_count INTEGER DEFAULT 0,
  last_message_text TEXT,
  last_message_at TEXT
);
```

### 8.3 Cache Strategy

- **Contacts:** Synced on connect, refreshed on `bond:established` / `bond:revoked` events
- **Threads:** Built from `listChatHistory` on first open, updated via push events
- **Messages:** Last 50 per thread cached locally; scroll-to-top triggers `listChatHistory(before: oldestCachedId)`
- **Rooms:** Synced on connect, updated on `chat:room-message` events
- **Terminals:** Session list from `listTerminalSessions` on Terminals view open; no local PTY buffer cache (streamed live)

---

## 9. Security Model

### 9.1 Authentication

- **Session token** (from `pairWithHomeNode`) is the sole credential
- Stored in `flutter_secure_storage` (iOS Keychain / Android EncryptedSharedPreferences)
- Sent as `?token=...` query param on WebSocket connect
- Home node validates via `validatePairingToken()` → `lookupSessionToken()`
- Token never leaves the device in plaintext

### 9.2 Transport Security

| Transport | Encryption |
|-----------|-----------|
| LAN WebSocket (`ws://`) | **No encryption** — only used on trusted LAN. Future: `wss://` with self-signed cert from pairing QR. |
| Relay tunnel (`wss://`) | **TLS** — relay provides HTTPS/WSS |
| libp2p stream | **Noise** — inherent to libp2p |

**Recommendation:** For v1, LAN uses `ws://` with a warning that it's only secure on trusted networks. For v2, add `wss://` with a certificate fingerprint exchanged during pairing.

### 9.3 Data at Rest

- Session token: iOS Keychain / Android EncryptedSharedPreferences
- Chat cache: SQLite in app sandbox (not encrypted — messages are already end-to-end encrypted at the mesh layer; the local cache is plaintext within the app sandbox, same as any messaging app)

### 9.4 Remote Revocation

- Home node can revoke a device session at any time (Social UI → Devices → Revoke)
- On next connect, token is rejected → app clears node data, shows "Device revoked"
- Local unpair also calls `revokeAuthorizedDevice` RPC

---

## 10. Flutter Package Dependencies

```yaml
dependencies:
  flutter:
    sdk: flutter
  # Transport
  web_socket_channel: ^3.0.0
  # State
  flutter_riverpod: ^2.6.0
  riverpod_annotation: ^2.6.0
  # Storage
  flutter_secure_storage: ^9.2.0
  sqflite: ^2.4.0
  path: ^1.9.0
  # QR scanning
  mobile_scanner: ^6.0.0
  # URI parsing
  uri: ^1.0.0
  # JSON
  json_annotation: ^4.9.0
  # Crypto (for verifying signatures on pairing payload)
  pinenacl: ^0.6.0
  # Push notifications
  firebase_core: ^3.0.0
  firebase_messaging: ^15.0.0
  # Terminal (custom or flutter_terminal)
  # flutter_terminal: ^0.1.0   # evaluate vs custom widget
  # UI
  google_fonts: ^6.2.0
  cached_network_image: ^3.4.0
  intl: ^0.19.0

dev_dependencies:
  flutter_test:
    sdk: flutter
  build_runner: ^2.4.0
  json_serializable: ^6.8.0
  riverpod_generator: ^2.6.0
  mockito: ^5.4.0
```

---

## 11. Project Structure

```
apps/envoygo/
├── lib/
│   ├── main.dart                    # App entry, Riverpod ProviderScope
│   ├── app.dart                     # MaterialApp, theme, routing
│   │
│   ├── models/                      # Data classes
│   │   ├── stored_node.dart
│   │   ├── contact.dart
│   │   ├── chat_thread.dart
│   │   ├── chat_message.dart
│   │   ├── chat_room.dart
│   │   ├── terminal_session.dart
│   │   └── json_rpc.dart            # JsonRpcRequest, JsonRpcResponse, JsonRpcEvent
│   │
│   ├── services/                    # Business logic
│   │   ├── home_remote_client.dart  # Transport-agnostic WS client
│   │   ├── candidate_resolver.dart  # Build transport URLs
│   │   ├── node_service_client.dart # Typed RPC wrappers
│   │   ├── pairing_service.dart     # QR scan → pairWithHomeNode
│   │   └── terminal_service.dart    # WS tunnel for PTY
│   │
│   ├── storage/                     # Persistence
│   │   ├── secure_storage.dart      # flutter_secure_storage wrapper
│   │   └── local_database.dart      # sqflite wrapper
│   │
│   ├── providers/                   # Riverpod providers
│   │   ├── node_provider.dart       # Active node, node list, connection state
│   │   ├── chat_provider.dart       # Threads, messages, rooms
│   │   ├── contact_provider.dart    # Bonds, profiles, online status
│   │   └── terminal_provider.dart   # Terminal sessions
│   │
│   ├── screens/                     # Full-screen views
│   │   ├── home_screen.dart         # Scaffold with BottomNavigationBar
│   │   ├── pairing/
│   │   │   ├── pairing_scan_screen.dart    # QR scanner
│   │   │   └── pairing_confirm_screen.dart # Post-scan confirmation
│   │   ├── chat/
│   │   │   ├── chat_list_screen.dart       # Thread list (Chats tab)
│   │   │   └── chat_detail_screen.dart     # Message view
│   │   ├── contacts/
│   │   │   └── contacts_screen.dart        # Contacts tab
│   │   ├── terminals/
│   │   │   ├── terminal_list_screen.dart   # Terminal sessions list
│   │   │   └── terminal_detail_screen.dart # PTY view
│   │   └── me/
│   │       ├── me_screen.dart              # Profile + node management
│   │       └── node_switcher_sheet.dart    # Multi-node selector
│   │
│   └── widgets/                     # Reusable components
│       ├── chat_bubble.dart
│       ├── contact_tile.dart
│       ├── thread_tile.dart
│       ├── terminal_widget.dart      # Custom PTY renderer
│       ├── connection_indicator.dart
│       └── node_status_badge.dart
│
├── test/
│   ├── services/
│   │   ├── home_remote_client_test.dart
│   │   ├── node_service_client_test.dart
│   │   └── pairing_service_test.dart
│   ├── storage/
│   │   └── local_database_test.dart
│   ├── providers/
│   │   ├── node_provider_test.dart
│   │   └── chat_provider_test.dart
│   └── widgets/
│       └── terminal_widget_test.dart
│
├── pubspec.yaml
├── analysis_options.yaml
└── README.md
```

---

## 12. Phase 31 Task Breakdown

See [implementation-plan.md § Phase 31](./implementation-plan.md#phase-31--flutter-thin-client-envoygo-design) for the detailed task breakdown with checkboxes and exit criteria. Summary:

| Sub-phase | Name | Description |
|-----------|------|-------------|
| 31A | Project scaffold | Flutter project, deps, folder structure, CI |
| 31B | Transport layer | HomeRemoteClient, candidate resolver, JSON-RPC |
| 31C | Pairing & auth | QR scan, pairWithHomeNode, session persistence |
| 31D | Contacts & chat | getBonds, sendChat, chat threads, UI |
| 31E | Group chat | listChatRooms, sendChatRoomMessage, room UI |
| 31F | AI chat | EnvoyAI + external agent chat integration |
| 31G | Terminals | PTY tunnel, terminal widget, session management |
| 31H | Multi-node & polish | Multi-node switching, unpair |
| 31I | Push notifications | FCM/APNs push when app is backgrounded |
