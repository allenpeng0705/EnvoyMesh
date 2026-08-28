# Phase 38 — Real-Time Voice/Video Calls

**Status:** `[x]` shipped (38A–38G complete; 38H manual smoke deferred)
**Date:** 2026-06-17
**Author:** EnvoyMesh core team
**Related:** [implementation-plan.md#phase-38](./implementation-plan.md#phase-38--real-time-voicevideo-calls), Phase 37 (Audio Messages), Phase 32 (Agent Network Membership)

---

## 1. Problem

EnvoyMesh chat supports text and async voice notes (Phase 37). Users cannot make real-time interactive voice or video calls — a fundamental communication primitive. When peers are online simultaneously, a live call should be possible without leaving the EnvoyMesh mesh.

The OpenClaw package already has a real-time voice system (`packages/openclaw/ui/src/ui/chat/realtime-talk*.ts`) — but this is **agent-to-LLM** real-time voice (OpenAI Realtime API, Google Live API), not peer-to-peer user calls. EnvoyMesh has no `call.*` intents, no call signaling, and no peer-to-peer WebRTC transport.

---

## 2. Goals & Non-Goals

### Goals

- **G1.** Two bonded peers can initiate a real-time voice call from the Social UI or EnvoyGo
- **G2.** Call signaling (invite → accept → SDP/ICE exchange → hangup) flows over the existing P2P envelope layer — no new ports, no new servers
- **G3.** **LAN / direct P2P path**: when peers are on the same LAN (mDNS) or have an established libp2p connection, WebRTC audio runs **on top of the existing libp2p connection** — no STUN/TURN needed
- **G4.** **Cross-network path**: when direct libp2p is unavailable, standard WebRTC ICE with STUN/TURN takes over — same `RTCPeerConnection`, same audio
- **G5.** Call state (ringing / active / ended) is surfaced in the UI
- **G6.** Mute/unmute controls work
- **G7.** Video calls are architecturally planned (v2), not built in v1

### Non-Goals

- **NG1.** Video calls in v1 (defer to Phase 38B — adds VP8/VP9 codec negotiation, camera track management, PiP layout)
- **NG2.** Group calls (multiple participants) in v1
- **NG3.** Server-side SFU or media recording
- **NG4.** In-call messaging (chat is a separate channel)
- **NG5.** Integration with OpenClaw's agent real-time talk — OpenClaw uses OpenAI Realtime API / Google Live API for agentic voice; bridging AI as a call participant is a future phase (see open questions)

---

## 3. Architecture

### 3.1 Dual-Transport Design

```
┌──────────────────────────────────────────────────────────────────┐
│   Caller A                              Callee B                    │
│                                                                  │
│  ┌─ Path 1: libp2p data channel (LAN / direct P2P) ──────────┐  │
│  │  When peers have a direct libp2p connection (mDNS, same    │  │
│  │  LAN, or established relayed connection):                    │  │
│  │  RTCPeerConnection created ON the existing libp2p stream     │  │
│  │  via @libp2p/webrtc data channel.                          │  │
│  │  No STUN/TURN servers needed. Lowest latency.               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─ Path 2: Standard ICE (cross-NAT fallback) ─────────────────┐  │
│  │  When no direct libp2p connection is available:             │  │
│  │  Standard WebRTC ICE negotiation. STUN resolves public IPs.  │  │
│  │  TURN (via libp2p circuit relay) handles symmetric NATs.     │  │
│  │  iceServers included in call.invite / call.accept payloads.  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                  │
│   ─── Signaling (all paths share this) ────────────────────────── │
│                                                                  │
│    │ call.invite { callId, sdpOffer, iceServers? } ─────────────►│
│    │                                                        │
│    │ ◄──────── call.accept { sdpAnswer, iceServers? } ──────────│
│    │                                                        │
│    │ call.ice-candidate { candidate } ◄──────────────────────► │
│    │                                                        │
│    ├─────────────────────────────────────────────────────────► │
│    │         Active RTCPeerConnection (Opus audio)             │
│    │         Path 1: libp2p stream data channel               │
│    │         Path 2: direct UDP or TURN relay                 │
│    │                                                        │
│    │ call.hangup ────────────────────────────────────────────►│
└──────────────────────────────────────────────────────────────────┘
```

**Path selection:** Caller tries Path 1 (libp2p stream data channel) first. If no live libp2p connection exists, or if ICE candidate gathering fails within 5 seconds, caller falls back to Path 2 (standard ICE). The callee responds on whatever path the caller used.

**ICE candidate gathering is always performed** even on Path 1 — the libp2p connection itself may be NATed, so gathered candidates are sent via `call.ice-candidate` envelopes and the callee tries them all.

### 3.2 Signaling Design

Call signaling uses the **existing P2P envelope system** — no new transport, no new ports, no new servers. All `call.*` intents are standard `EnvoyEnvelope` payloads carried over the existing libp2p mesh.

This works because:
- The node already handles inbound `chat.message` envelopes and routes them
- `DirectCallClient` on mobile already routes all intents through `NodeService`
- `CallManager` (new, per-node) manages call state and correlates `callId` to peer connections

### 3.3 Node Service API

For v1, **no new RPC methods** are needed for call setup. The signaling intents flow through the existing envelope system.

New node-internal types (not RPC-exposed):

```typescript
// packages/api/src/node-service.ts

export type CallSessionStatus = "ringing" | "active" | "ended";

export interface CallSession {
  callId: string;
  peerOwnerId: string;
  callType: "audio";           // "video" in Phase 38B
  status: CallSessionStatus;
  startedAt?: string;
  muted: boolean;
}

export type CallEvent =
  | { type: "call:incoming"; callId: string; peerOwnerId: string; peerDisplayName: string; callType: "audio"; sdpOffer?: string }
  | { type: "call:answered"; callId: string }
  | { type: "call:rejected"; callId: string; reason: "busy" | "declined" | "no_answer" | "offline" | "error" }
  | { type: "call:remote-mute"; callId: string; muted: boolean }
  | { type: "call:ended"; callId: string; reason: "normal" | "error" | "no_answer" }
  | { type: "call:error"; callId: string; error: string };

export interface NodeService {
  // Call session management
  getActiveCall(): CallSession | null;
  /** Subscribe to call events (incoming, answered, ended, etc.) */
  onCallEvent(handler: (event: CallEvent) => void): () => void;
}
```

On mobile, `DirectCallClient.on("call:*", ...)` wires directly to `NodeService.on("call:*", ...)` — no WebSocket or RPC changes needed.

---

## 4. Protocol Design

### 4.0 Protocol Rules (All Implementations Must Follow)

#### `callId` Generation and Lifecycle

- **`callId` is a UUID v4**, generated by the caller at call initiation time. It is stable — if the caller must retransmit `call.invite` (e.g., the first attempt timed out at the transport layer), the same `callId` MUST be reused. This allows the callee to deduplicate.

**Retransmission policy:** If no response is received within **15 seconds** of sending `call.invite`, the caller MAY retransmit once with the same `callId`. After the retransmit, if still no `call.accept` or `call.reject` is received within a further **15 seconds**, the caller SHOULD treat the call as failed and move to `ENDED` state. Maximum total attempts: 2 (initial + one retry). The caller MUST NOT retry with a new `callId` — a new `callId` would create a duplicate inbound call on the callee side instead of updating the existing `RINGING_INBOUND` entry.
- **Deduplication (callee):** The callee deduplicates incoming `call.invite` envelopes by the tuple `(callId, callerOwnerId)`. If an identical `call.invite` arrives for a call already in `RINGING_INBOUND`, it is silently ignored (no UI shown again, no new state transition).

#### `callId` Validation Rules

Every inbound `call.*` envelope with a `callId` field MUST be validated against the active call state before any state transition:

| Intent | Required callId state |
|--------|----------------------|
| `call.accept` | Must match an active `RINGING_INBOUND` call from `payload.callerOwnerId` |
| `call.reject` | Must match an active `RINGING_INBOUND` call from `payload.callerOwnerId` |
| `call.hangup` | Must match an `ACTIVE` call where the sender is a participant |
| `call.ice-candidate` | Must match an `ACTIVE` call where the sender is a participant |
| `call.mute` | Must match an `ACTIVE` call where the sender is a participant |

**Invalid `callId`:** The envelope is rejected with an error audit event logged, and no state change occurs. The error is silently dropped to the sender (no error response is sent back — this prevents amplification attacks).

#### Identity Binding

The envelope signer (`envelope.senderOwnerId`) MUST match the identity claimed in the payload:

| Intent | Binding rule |
|--------|-------------|
| `call.invite` | `envelope.senderOwnerId === payload.callerOwnerId` |
| `call.accept` | `envelope.senderOwnerId === payload.calleeOwnerId` |
| `call.reject` | `envelope.senderOwnerId === payload.calleeOwnerId` (the sender is the callee; the calleeOwnerId is confirmed against the inbound `call.invite` session state stored for that `callId`) |
| `call.hangup` | Sender must be a participant in `payload.callId` |
| `call.ice-candidate` | Sender must be a participant in `payload.callId` |
| `call.mute` | Sender must be a participant in `payload.callId` |

**Rationale:** Without this check, a malicious bonded peer could impersonate another contact by crafting a payload with a different `callerOwnerId` while signing with their own key.

#### Timeouts

| State | Timeout | Action on expiry |
|-------|---------|-----------------|
| `RINGING_INBOUND` (callee) | `CALL_RING_TIMEOUT_MS = 60_000` (60 s) | Auto-reject: `call.reject(reason: "no_answer")` |
| `RINGING_OUTBOUND` (caller) | No node-level timeout | UI-level timeout recommended (e.g., 30 s); then send `call.hangup` |

#### `call.mute` Is Best-Effort

`call.mute { muted: boolean }` is an **informational notification only**. It is sent to update the remote party's UI indicator. Delivery is not guaranteed — if the envelope is lost in transit, the remote UI retains its stale mute indicator. No acknowledgement or retry is performed.

The sender's **local mute state is always authoritative**. A party that has muted locally is muted regardless of whether the remote `call.mute` notification was received.

#### Path 2 ICE Timing

On Path 2, ICE gathering begins **immediately after `pc.setLocalDescription(offer)` is called** (step 4 for the caller, step 8 for the callee). This happens **before** the `call.invite` or `call.accept` envelope is sent or received over the network.

Consequently, `call.ice-candidate` envelopes may arrive at the remote party **before** the `call.accept` or even the `call.invite` envelope is received. The remote `WebRtcCallTransport` must queue any early candidates and apply them once the `RTCPeerConnection` is in the correct state (`have-remote-offer` for the callee, `stable` for the caller after setting the answer).

This is standard WebRTC trickle ICE behavior and is intentional — it minimizes call setup latency.

---

### 4.1 New Intent Family: `call.*`

Added to `EnvoyIntentSchema` in `packages/protocol/src/index.ts`:

```
call.invite          — Caller → Callee: I want to start a call
call.accept          — Callee → Caller: I accept the call
call.reject          — Callee → Caller: I declined (reason: declined | busy | no_answer | offline | error)
call.hangup          — Either → Other: Call ended
call.ice-candidate   — Caller ↔ Callee: Trickle ICE candidates (Path 2 only)
call.mute            — Either → Other: Mute status changed (informational)
```

**Notes:**
- `call.busybusy` is removed — use `call.reject { reason: "busy" }` instead.
- `call.sdp` is removed — SDP offer is embedded in `call.invite` and SDP answer in `call.accept`, so no separate exchange is needed.
- `call.ice-candidate` is used for Path 2 only (trickle ICE). Path 1 does not use trickle ICE — ICE gathering against a direct libp2p stream completes in milliseconds, so `call.invite` is sent only after `pc.setLocalDescription(offer)` is set.

### 4.2 Payload Schemas

```typescript
// packages/protocol/src/index.ts

// --- call.invite ---
// The SDP offer is embedded to minimize round-trips.
// sdpOffer is REQUIRED — omitting it would require a separate call.sdp exchange (removed).
// iceServers (TURN) are included for Path 2 (cross-NAT).
export const CallInvitePayloadSchema = z.object({
  callId: z.string().uuid(),
  callerOwnerId: z.string(),
  callerPeerId: z.string(),
  callType: z.enum(["audio"]).default("audio"),  // "video" in Phase 38B
  timestamp: z.string().datetime(),
  sdpOffer: z.string().min(1),   // REQUIRED — SDP embedded to save one RTT
  iceServers: z.array(z.object({
    urls: z.string(),
    username: z.string().optional(),
    credential: z.string().optional(),
  })).optional(),
  sdpMid: z.string().optional(),
  sdpMLineIndex: z.number().int().optional(),
});
export type CallInvitePayload = z.infer<typeof CallInvitePayloadSchema>;

// --- call.accept ---
export const CallAcceptPayloadSchema = z.object({
  callId: z.string().uuid(),
  calleeOwnerId: z.string(),
  calleePeerId: z.string(),
  timestamp: z.string().datetime(),
  sdpAnswer: z.string().min(1),   // required — SDP embedded to save one RTT
  iceServers: z.array(z.object({
    urls: z.string(),
    username: z.string().optional(),
    credential: z.string().optional(),
  })).optional(),
  sdpMid: z.string().optional(),
  sdpMLineIndex: z.number().int().optional(),
});
export type CallAcceptPayload = z.infer<typeof CallAcceptPayloadSchema>;

// --- call.reject ---
// reason: "busy" = I'm on another call (send this when already in an active call)
// reason: "declined" = user chose to decline
// reason: "no_answer" = ringing timeout expired (60 s on the callee side)
// reason: "offline" = callee node is unreachable (rare — usually caught at the transport layer)
// reason: "error" = unexpected error
export const CallRejectPayloadSchema = z.object({
  callId: z.string().uuid(),
  calleeOwnerId: z.string(),    // required for identity binding: envelope.senderOwnerId === payload.calleeOwnerId
  calleePeerId: z.string(),     // required for identity binding
  reason: z.enum(["busy", "declined", "no_answer", "offline", "error"]).default("declined"),
  timestamp: z.string().datetime(),
});
export type CallRejectPayload = z.infer<typeof CallRejectPayloadSchema>;

// --- call.ice-candidate ---
export const CallIceCandidatePayloadSchema = z.object({
  callId: z.string().uuid(),
  candidate: z.object({
    candidate: z.string(),
    sdpMid: z.string().nullable(),
    sdpMLineIndex: z.number().int().nullable(),
    usernameFragment: z.string().nullable().optional(),
  }),
  timestamp: z.string().datetime(),
});
export type CallIceCandidatePayload = z.infer<typeof CallIceCandidatePayloadSchema>;

// --- call.hangup ---
export const CallHangupPayloadSchema = z.object({
  callId: z.string().uuid(),
  reason: z.enum(["normal", "error", "no_answer"]).default("normal"),
  timestamp: z.string().datetime(),
});
export type CallHangupPayload = z.infer<typeof CallHangupPayloadSchema>;

// --- call.mute ---
export const CallMutePayloadSchema = z.object({
  callId: z.string().uuid(),
  muted: z.boolean(),
  timestamp: z.string().datetime(),
});
export type CallMutePayload = z.infer<typeof CallMutePayloadSchema>;
```

### 4.3 Role Policy

`call.*` intents require `senderRole: "human"` and `recipientRole: "human"`. Agents cannot initiate or receive peer calls on behalf of humans — the human must be present.

Trust requirement: `sensitivity: "friends"` — the bond must be at least in the `referred` or `direct` trust tier. `blocked` and `public` (stranger) peers cannot place or receive calls.

```typescript
// packages/protocol/src/role-policy-table.ts
"call.invite":        { sender: ["human"], recipient: ["human"], sensitivity: "friends" },
"call.accept":        { sender: ["human"], recipient: ["human"], sensitivity: "friends" },
"call.reject":        { sender: ["human"], recipient: ["human"], sensitivity: "friends" },
"call.hangup":       { sender: ["human"], recipient: ["human"], sensitivity: "friends" },
"call.ice-candidate": { sender: ["human"], recipient: ["human"], sensitivity: "friends" },
"call.mute":          { sender: ["human"], recipient: ["human"], sensitivity: "friends" },
```

---

## 5. Call Signaling Flow

```
Caller A                                      Callee B
   │                                               │
   │  1. getUserMedia({ audio: true })            │
   │                                               │
   │  2. Check: live libp2p conn?                  │
   │     Path 1: create data channel over libp2p stream
   │     Path 2: use standard ICE                   │
   │                                               │
   │  3. pc.createOffer()                          │
   │  4. pc.setLocalDescription(offer)             │
   │     [Path 1: ICE resolves against libp2p addresses — instant]
   │     [Path 2: ICE gathering begins; trickle candidates sent via step 11]
   │                                               │
   │  5. call.invite { callId, sdpOffer } ───────►│
   │     [iceServers only for Path 2]              │
   │                                               │
   │                                         6. pc.setRemoteDescription(offer)
   │                                         7. pc.createAnswer()
   │                                         8. pc.setLocalDescription(answer)
   │                                         9. Show "incoming call" UI
   │                                        10. User accepts / declines
   │                                               │
   │  ◄──────── call.accept { sdpAnswer } ─────────│
   │  ◄──────── call.reject { reason } ────────────│  (if declined/busy)
   │                                               │
   │ 11. pc.setRemoteDescription(answer)         │
   │     [Path 2 only: trickle ICE candidates sent as gathered]
   │                                               │
   │ 12. call.ice-candidate { candidate } ───────►│  (Path 2 trickle, multiple)
   │  ◄──────── call.ice-candidate { candidate } ──│
   │                                               │
   │ 13. P2P audio stream established             │
   │      Path 1: libp2p stream data channel      │
   │      Path 2: direct UDP or TURN relay        │
   │      [Opus audio, bidirectional]             │
   │                                               │
   │  [call active — envelopes only for call.mute / call.hangup] │
   │                                               │
   │ 14. user taps mute → transport.setMute(true) │
   │     call.mute { muted: true } ────────────►│  (informational only)
   │                                               │
   │ 15. user taps end → call.hangup ───────────►│
   │ 16. pc.close()                               │
```

**Offer embedded in invite:** The SDP offer is included in `call.invite` to avoid an extra round-trip. `call.accept` includes the SDP answer. Total setup: 2 round-trips (invite+offer → accept+answer). Standard WebRTC without embedded SDP takes 3 (offer → answer → ICE), so embedding saves one RTT.

**Path 1 vs Path 2 ICE:** On Path 1, ICE resolves against the already-known libp2p peer addresses (LAN IP from mDNS or relay multiaddr) — this completes in milliseconds and no trickle exchange is needed. On Path 2, standard ICE candidate gathering runs and candidates are sent via `call.ice-candidate` (trickle ICE) after `call.accept` is exchanged.

**Timeout / fallback:** If Path 1 fails to produce a connection within 5 seconds, the caller falls back to Path 2. The `call.invite` includes `iceServers` for Path 2, so the callee can use them on receipt.

---

## 6. WebRTC Transport Details

### 6.1 Path 1 — libp2p Stream Data Channel (LAN / direct P2P)

When the caller has an active libp2p connection to the callee (same LAN via mDNS, or an established relayed connection), WebRTC audio runs **on top of the existing libp2p connection**.

**How it works:**
1. Caller creates `RTCPeerConnection` with an empty `iceServers` config (no STUN/TURN needed)
2. Uses `@libp2p/webrtc` to wrap the existing libp2p `Connection` as a WebRTC data channel transport
3. ICE resolves against the already-known libp2p peer addresses (local LAN IP or relay multiaddr) — this completes in milliseconds, no trickle exchange needed
4. Audio tracks are added via `peerConnection.addTrack(track, stream)`
5. The remote peer's audio arrives via `peer.ontrack`

**No trickle ICE on Path 1:** Because the peer addresses are already known from the established libp2p connection, ICE candidate gathering resolves instantly. The `call.invite` is sent only after `pc.setLocalDescription(offer)` is set. No `call.ice-candidate` exchange is needed.

**Trickle ICE on Path 1 — exception:** If the libp2p connection itself is NATed (e.g., the relay connection is still being established), ICE may gather additional candidates. The `call.ice-candidate` envelope is still available for this case, but it is not required for the normal Path 1 flow.

**Implementation:** `@libp2p/webrtc` provides APIs for creating WebRTC data channels over a libp2p `Connection`. The `packages/network/src/` already has WebRTC support in the dep tree (`@libp2p/webrtc@6.0.23` as a transitive dep). The actual WebRTC-over-libp2p API surface needs to be confirmed against the current version.

**Advantages:**
- Works on LANs where STUN/TURN servers are unavailable
- Lower latency (no TURN relay in the media path)
- No dependency on external infrastructure

### 6.2 Path 2 — Standard ICE (cross-NAT)

When no direct libp2p connection exists (e.g., both peers are behind symmetric NATs), standard WebRTC ICE is used.

**How it works:**
1. Caller creates `RTCPeerConnection` with `iceServers` from the `call.invite` payload (or from the node's relay config if not present)
2. `pc.createOffer()` triggers ICE candidate gathering automatically
3. ICE candidates are gathered and sent via `call.ice-candidate` envelopes as they arrive (trickle ICE)
4. Callee creates `RTCPeerConnection` with `iceServers` from the `call.invite` payload and runs `pc.setRemoteDescription(offer)` then `pc.createAnswer()`
5. Once both sides have set remote description and have connectivity candidates, the media path is established

**ICE Candidate types (in priority order):**
1. **Host candidate** — direct interface IP (works on same LAN)
2. **srflx candidate** — public IP discovered via STUN (NATed but not symmetric)
3. **prflx candidate** — discovered during peer-to-peer connectivity check
4. **relay candidate** — TURN relay (only way through symmetric NAT)

### 6.3 STUN/TURN Server Provisioning

**STUN servers:**
Public STUN servers are used for NAT type discovery and srflx candidate gathering:

| Server | URL | Notes |
|--------|-----|-------|
| Google STUN | `stun:stun.l.google.com:19302` | Most reliable, widely deployed |
| Twilio STUN | `stun:global.stun.twilio.com:3478` | Good fallback |
| Cloudflare STUN | `stun:stun.cloudflare.com:3478` | Good fallback |

Each node SHOULD include at least two STUN servers in its `iceServers` configuration to avoid single-point-of-failure. STUN requires no authentication.

**TURN servers:**
TURN (relay) is required when both peers are behind symmetric NATs (the most restrictive NAT type). The libp2p relay node that both peers are connected to can act as a TURN server.

**TURN credential format:**
```typescript
interface TurnServer {
  urls: "turn:<relay-host>:<port>";  // e.g., "turn:relay.envoymesh.io:3478"
  username: string;    // ephemeral credential (timestamp, format: "<unix-timestamp>:<nonce>")
  credential: string;  // HMAC-SHA256 of username with relay shared secret
}
```

- **Username**: a timestamp with a nonce, format `<unix-timestamp-in-seconds>:<random-nonce>`. Valid for 1 hour.
- **Credential**: HMAC-SHA1 or HMAC-SHA256 of the username using a shared secret known to both the relay and the client.

**TURN provisioning via relay:**

When a node connects to a relay (as part of the normal relay check-in flow), the relay issues short-lived TURN credentials alongside the relay service. The node then includes these credentials in `iceServers` in `call.invite` (and `call.accept`):

```json
"iceServers": [
  { "urls": "stun:stun.l.google.com:19302" },
  { "urls": "stun:stun.cloudflare.com:3478" },
  {
    "urls": "turn:relay.envoymesh.io:3478",
    "username": "1718630400:abc123nonce",
    "credential": "base64-hmac-sha256..."
  }
]
```

**Both parties may have TURN access.** Either peer may include `iceServers` in their `call.invite`/`call.accept`. The caller includes their own `iceServers`; the callee includes their own in `call.accept`. The initiating peer may not know whether the callee has TURN access, which is why both sides include their own.

**TURN over TCP (fallback):** For networks that block UDP (common in corporate firewalls), include a TCP TURN URL:

```json
{ "urls": "turn:relay.envoymesh.io:443?transport=tcp" }
```

**TURN over TLS (last resort):** For networks that block TCP port 443, use TURN over TLS on port 443:

```json
{ "urls": "turns:relay.envoymesh.io:443?transport=tcp" }
```

**When `iceServers` is absent from `call.invite`:**
If the caller has no TURN credentials (not connected to a relay, or relay doesn't support TURN), `iceServers` may be absent. The callee then uses their own `iceServers` from `call.accept` to attempt the connection. If neither party has TURN access and both are behind symmetric NATs, the call will fail — this is an expected failure case, not a protocol error.

**Relay as TURN server — open question:** The existing libp2p relay infrastructure must be extended to act as a TURN server. This requires: (a) a TURN server implementation (e.g., using `coturn` or a pure-Go TURN library like `gortr`/`pion/turn`), (b) short-lived credential generation, and (c) exposing TURN credentials in the relay check-in or registration response. This is an open implementation question — the protocol specifies that TURN credentials are included in `iceServers`, but the mechanism for obtaining them from the relay is deferred to the relay implementation.

### 6.3.1 Phase 42H — 3-Server STUN Default and TURN Editor

The home node ships a **3-server STUN default** when neither the caller nor `node-config.iceServers` provides a list. The default is sourced from well-known public providers and covers the majority of home networks (cone NATs and most carrier-grade NATs):

| Provider  | URL                                  | Reason                          |
| --------- | ------------------------------------ | ------------------------------- |
| Google    | `stun:stun.l.google.com:19302`       | Most reliable, widely deployed  |
| Cloudflare| `stun:stun.cloudflare.com:3478`      | Privacy-friendly, no Google dep |
| Twilio    | `stun:global.stun.twilio.com:3478`   | Independent third fallback      |

The home injects this default inside `_effectiveCallIceServers()` in `apps/node/src/node-service-impl.ts` (Phase 42A). The precedence order is: **caller-supplied > node-config > 3-server STUN default**. An empty `node-config.iceServers` (set explicitly by the operator) disables the default and forces a LAN-only call — that is the documented escape hatch for hostile networks.

#### Structured TURN editor (Settings → Network → TURN servers)

Operators behind a symmetric NAT (corporate firewall, some mobile carriers) need a TURN relay. The structured editor in `SettingsNodeTab` (`apps/social/src/components/views/SettingsNodeTab.tsx`) lets an operator add TURN entries with explicit fields — **URL, username, credential, credential TTL** — instead of editing raw JSON. The editor is backed by the pure helper module `apps/social/src/lib/turn-credentials.ts`, which:

- extracts only the TURN entries from `node-config.iceServers` (STUN entries are owned by the existing JSON editor and stay untouched),
- validates each row (URL must start with `turn:` or `turns:`, TTL must be ≥ 0),
- replaces stale TURN entries on save so the file never accumulates orphans.

The TURN entries are stored on disk as part of `node-config.iceServers` alongside any STUN entries. The home then ships the merged list verbatim inside `call.invite` (see test `6b. node-config STUN+TURN entries are shipped verbatim` in `apps/node/test/call-send-invite.test.ts`).

#### Credential TTL

The TTL field is a **client-only** annotation — the wire format (`{ urls, username?, credential? }`) does not carry it yet, so the editor strips it before persistence. The displayed value is a hint to the operator: "rotate these credentials within N seconds." Setting TTL to `0` means "rotate on every call." Operators are expected to wire their TURN provider's REST API to a cron job that updates the credentials and re-saves `node-config.iceServers`.

#### When to add TURN

| Network shape                                  | STUN-only works? | Add TURN? |
| ---------------------------------------------- | ---------------- | --------- |
| Same LAN (mDNS)                                | n/a (libp2p)     | No        |
| Both peers on cone NAT                         | Yes              | No        |
| One peer on symmetric NAT, other cone          | Usually          | Optional  |
| **Both peers on symmetric NAT**                | **No**           | **Yes**   |
| Corporate firewall blocking UDP                | No               | Yes (TCP) |

The pre-flight rule: try the 3-server STUN default first. If calls fail with `IceConnectionState: failed` after 10s and `getStats()` shows no `srflx` candidates, add a TURN entry.

### 6.4 WebRTC Transport Class

```typescript
// apps/social/src/lib/webrtc-call-transport.ts

interface WebRtcCallTransport {
  // Start as caller — attempts Path 1 first, falls back to Path 2
  // Returns only after pc.setLocalDescription(offer) is done (Path 1: instant; Path 2: after ICE)
  startOffer(): Promise<void>;

  // Called by callee after receiving call.invite and user accepts:
  // 1. Sets remote offer (from call.invite payload)
  // 2. Creates answer, sets local description
  // 3. Returns the SDP answer string to send via call.accept
  acceptAndCreateAnswer(sdpOffer: string): Promise<string>;

  // Handle incoming answer (caller side) — after receiving call.accept
  setRemoteAnswer(sdpAnswer: string): void;

  // Handle trickle ICE from remote peer (Path 2 only)
  addIceCandidate(candidate: RTCIceCandidateInit): void;

  // Mute/unmute local audio track (local only — notifies remote via call.mute)
  setMute(muted: boolean): void;

  // Close the call — pc.close(), stop all tracks
  close(): void;

  // Events
  onRemoteTrack(handler: (stream: MediaStream) => void): void;
  onConnectionState(handler: (state: RTCPeerConnectionState) => void): void;
}
```

### 6.5 Codec and Media Parameters

For a third-party implementation, the following media parameters are specified:

**Audio codec:** Opus is the only required codec (bidirectional).
- SDP codec ID: `96` (dynamic)
- Sample rate: 48 kHz (Opus default)
- Channels: mono (1)
- Bitrate: 32 kbps for voice (negotiable up to 64 kbps; v1 uses 32 kbps fixed)
- FEC (forward error correction): enabled — `useinbandfec=1`
- Channel mapping: `0,1,0,1` (mono, standard)
- SDP `fmtp` line: `97 0 160 2 ; 96 0 160 2` (Opus / telephone-event)

**Jitter buffer:** WebRTC default (adaptive). No specification required — each platform's WebRTC stack handles this.

**DTMF:** Not specified (out of scope for v1). Future extension would use `RTCDTMFSender` and a new `call.dtmf` intent.

**Max call duration:** No node-enforced limit. The owner ends the call via `call.hangup`. Nodes may enforce a local maximum (e.g., 8 hours) as a resource limit.

**Connection quality monitoring:** The UI monitors `RTCPeerConnection.connectionState` and `RTCIceConnectionState` directly — no protocol element needed. Recommended mappings:
- `connected` → green indicator
- `connecting` → yellow indicator
- `disconnected` → orange indicator, attempt reconnect
- `failed` → red indicator, show "connection lost"

### 6.6 OpenClaw Reuse

The `RealtimeTalkTransport` interface from OpenClaw (`start()`/`stop()` + `RealtimeTalkCallbacks`) can be extended with a P2P transport variant. Key reuse:
- `getUserMedia` audio constraints — already proven
- `RTCPeerConnection` lifecycle — same pattern
- `ontrack` handling — same pattern
- Opus codec — same codec stack

The new code is primarily the **signaling layer** (`call.*` envelope handling) and the **transport path selection** (Path 1 vs Path 2).

---

## 7. Call Manager (Node Service)

### 7.1 Responsibilities

`CallManager` is a per-node singleton that manages call session state:

1. **Tracks active calls** — `callId ↔ { peerOwnerId, transport, status, startedAt }`
2. **Correlates envelopes to call sessions** — routes `call.*` payloads to the right `CallSession`
3. **Emits `CallEvent`s** — `call:incoming`, `call:answered`, `call:ended`, etc.
4. **Manages ICE timeout** — if Path 1 doesn't connect within 5s, marks as using Path 2
5. **Enforces one active call per node** — rejecting incoming calls with `call.busybusy` when already in a call

### 7.2 State Machine

```
IDLE
  │
  │ outboundCallInitiated(callId, peerOwnerId)
  ▼
RINGING_OUTBOUND
  │
  │ ──[call.accept]───────────────────────► ACTIVE ──[call.hangup]──► ENDED
  │ ──[call.reject(reason=declined)]──────► ENDED
  │ ──[call.reject(reason=busy)]───────────► ENDED
  │ ──[call.hangup received]──────────────► ENDED   (callee ended before answer)
  │ ──[transport timeout / network error]► ENDED   (callee unreachable)
  │
  │ inboundCallReceived(callId, peerOwnerId)
  ▼
RINGING_INBOUND
  │
  │ ──[user accepts]────────────────────► ACTIVE ──[call.hangup]──► ENDED
  │ ──[user declines: call.reject(reason=declined)]─────► ENDED
  │ ──[CALL_RING_TIMEOUT_MS elapses]──────► ENDED   (auto-reject: no_answer)
  │ ──[transport error]──────────────────► ENDED

ACTIVE (mutual state)
  │ ──[user ends: call.hangup sent]────────────────────► ENDED
  │ ──[remote ends: call.hangup received]──────────────► ENDED
  │ ──[transport error / connection failed]─────────────► ENDED
  │ ──[call.invite received from same peer] ──────────► busy: send call.reject(reason=busy)
```

**Simultaneous call race:** If Peer A calls Peer B, and Peer B has also called Peer A (both in `RINGING_OUTBOUND` state), the second `call.invite` received transitions the node to `RINGING_INBOUND` (coexisting with `RINGING_OUTBOUND`). The UI shows both "outgoing calling..." and "incoming call" simultaneously. The user resolves one; the other is ended with `call.reject(reason=busy)`.

**One active call enforcement:** If a node in `ACTIVE` receives a `call.invite`, it replies `call.reject(reason=busy)`.

**Note on `CALL_RING_TIMEOUT_MS`:** `RINGING_INBOUND` (callee) has a 60-second timeout. If the user does not accept or decline within 60 seconds, the node auto-rejects with `call.reject(reason: "no_answer")`. `RINGING_OUTBOUND` (caller) has no node-level timeout; the UI should implement a caller-side timeout (recommended 30 seconds) and trigger `call.hangup` locally to end the call.

### 7.3 Interface

```typescript
// apps/node/src/call-manager.ts

interface CallManager {
  // Initiate an outbound call
  initiateCall(peerOwnerId: string): Promise<{ callId: string }>;

  // Accept an incoming call (user clicked Accept)
  acceptCall(callId: string): Promise<void>;

  // Reject an incoming call (user clicked Decline, or auto-reject when busy)
  rejectCall(callId: string, reason: "declined" | "busy"): Promise<void>;

  // End an active call (user clicked End, or remote ended)
  endCall(callId: string, reason: "normal" | "error" | "no_answer"): Promise<void>;

  // Mute/unmute locally (informational — notifies remote via call.mute)
  setMute(callId: string, muted: boolean): Promise<void>;

  // Get current active call (if any)
  getActiveCall(): CallSession | null;

  // Subscribe to call events
  onEvent(handler: (event: CallEvent) => void): () => void;

  // Handle inbound call.* intent envelopes
  handleInboundEnvelope(envelope: EnvoyEnvelope): void;
}
```

---

## 8. UI Design

### 8.1 Social UI (Browser)

**Call button:** Phone icon in the `ContactChatPanel` header, next to the message composer. Only visible when the contact has `direct` or `referred` trust. Hidden when already in a call.

**Incoming call modal:** Slides up when a `call.invite` is received. Shows caller name, avatar (from peer profile), call type (audio). Accept (green) and Decline (red) buttons. Ringtone sound plays (HTML5 audio, bundled).

**Active call panel:** Replaces the chat composer while a call is active. Shows:
- Remote peer name and avatar
- Call duration timer (MM:SS format)
- Mute toggle button (microphone icon, toggles `transport.setMute()`)
- End call button (red, triggers `call.hangup`)
- Network quality indicator (based on `RTCPeerConnection.connectionState`)

**Calling state:** After initiating a call, the composer area shows "Calling [Name]..." with an animated pulse and a Cancel button. *(Calling state UI is deferred — the active call panel handles the accepted call state.)*

### 8.2 EnvoyGo (Mobile / Flutter)

**Native Flutter implementation** (not WebView) — better performance and works when app is backgrounded.

- `VoiceCallScreen` widget: incoming call modal, active call screen with mute/end/call timer
- `flutter_webrtc` for `RTCPeerConnection` on both iOS and Android (EnvoyGo is Flutter, not React Native)
- Subscribes to `NodeService.on("call:*")` events via the existing event bus
- `RECORD_AUDIO` permission handled by `permission_handler` (already present per Phase 37)

### 8.3 i18n Keys

New keys needed in `apps/social/src/i18n/messages/en-chat.ts`:
- `call.initiate` — "Calling..."
- `call.incoming` — "Incoming call from {name}"
- `call.accept` — "Accept"
- `call.decline` — "Decline"
- `call.end` — "End call"
- `call.mute` / `call.unmute` — "Mute" / "Unmute"
- `call.busy` — "{name} is on another call"
- `call.ended` — "Call ended"
- `call.no_answer` — "No answer"

---

## 9. Files to Change

### New files

| File | Purpose |
|------|---------|
| `packages/protocol/src/call-schemas.ts` | All `call.*` payload schemas, parser helpers, `create*` constructors |
| `packages/protocol/src/call-role-policies.ts` | Role policy entries for `call.*` intents |
| `apps/node/src/call-manager.ts` | Call session state machine, correlates call IDs to transports |
| `apps/node/src/call-inbound.ts` | Inbound handler: routes `call.*` envelopes to `CallManager` |
| `apps/social/src/lib/webrtc-call-transport.ts` | WebRTC transport: Path 1 (libp2p data channel) + Path 2 (ICE) |
| `apps/social/src/components/IncomingCallModal.tsx` | Incoming call UI |
| `apps/social/src/components/ActiveCallPanel.tsx` | In-call UI: mute/end/timer |
| `apps/social/src/hooks/useCallSession.ts` | Hook: wires `CallManager` events to React state |
| `apps/envoygo/lib/widgets/voice_call_screen.dart` | Native Flutter voice call screen |
| `apps/envoygo/lib/call_manager.dart` | Flutter call manager mirroring `CallManager` |

### Modified files

| File | Change |
|------|--------|
| `packages/protocol/src/index.ts` | Add `call.*` intents to `EnvoyIntentSchema`; import and re-export call schemas |
| `packages/protocol/src/role-policy-table.ts` | Import and add `call.*` role policy entries |
| `packages/api/src/node-service.ts` | Add `CallSession`, `CallEvent` types; add `getActiveCall`, `onCallEvent` to `NodeService` interface |
| `apps/node/src/index.ts` | Import `call-inbound.ts`; route `call.*` intents in `mesh.onMessage` switch |
| `apps/node/src/node-service-impl.ts` | Implement `getActiveCall` / `onCallEvent` from `CallManager` |
| `apps/social/src/components/views/ContactChatPanel.tsx` | Call button in header; integrate `useCallSession` to show modals/panels |
| `apps/social/src/i18n/messages/en-chat.ts` | Add call-related i18n keys |
| `apps/social/src/styles.css` | Call UI styles |
| `apps/mobile/src/main.tsx` | Wire `CallManager` events to mobile node via `DirectCallClient` |
| `apps/envoygo/pubspec.yaml` | Add `flutter_webrtc` dependency |

---

## 10. Implementation Phases

### Phase 38A — Protocol + Node Signaling (no media)
1. Add `call.*` intent strings to `EnvoyIntentSchema`
2. Add all `Call*Payload` schemas
3. Add `call.*` role policy entries (`sensitivity: "friends"`)
4. Add `createUnsignedEnvelope` defaults for `call.*`
5. Create `CallManager` class (state machine, emits `CallEvent`)
6. Create `call-inbound.ts` (parse `call.*` payloads, update `CallManager`, send `CallEvent`)
7. Route `call.*` in `mesh.onMessage` switch in `index.ts`
8. Add `getActiveCall` / `onCallEvent` to `NodeServiceImpl`
9. **Test:** send `call.invite` envelope → verify `CallEvent` emitted → verify response flows

### Phase 38B — WebRTC Transport (media)
1. Create `webrtc-call-transport.ts` — `RTCPeerConnection` lifecycle, Path 1 + Path 2 selection, `setMute`, `close`
2. Wire `CallManager` → `WebRtcCallTransport` → `CallEvent` output
3. Implement Path 1: libp2p stream data channel via `@libp2p/webrtc`
4. Implement Path 2: standard ICE with `iceServers` from relay config
5. On `call.invite` received: create transport, set remote offer, show incoming UI
6. On user accepts: send `call.accept` with SDP answer
7. On `call.ice-candidate` received: `transport.addIceCandidate()`
8. When remote track arrives: pipe to `<audio>` element
9. **Test:** two tabs on same LAN (Path 1) — audio plays without STUN/TURN. Two tabs on separate networks (Path 2) — audio via TURN relay.

### Phase 38C — Social UI
1. Phone icon button in `ContactChatPanel` header
2. `IncomingCallModal`: caller name, accept/decline, ringtone
3. `ActiveCallPanel`: mute toggle, end call, duration timer
4. Wire `useCallSession` to show correct surface
5. Add call events to `NodeServiceEvents`
6. Calling state UI (animated pulse + Cancel button) — *deferred to follow-on*

### Phase 38D — EnvoyGo Mobile
1. Add `flutter_webrtc` to `pubspec.yaml`
2. Create native `VoiceCallScreen` widget
3. Handle `call.*` intents via `NodeService` event bus
4. Native `RTCPeerConnection` via `flutter_webrtc`

### Phase 38E — Video (future, Phase 38B extension)
- Add `callType: "video"` to `CallInvitePayload`
- Camera track via `getUserMedia({ video: true })`
- SDP negotiation for VP8/VP9/H264
- Picture-in-picture layout
- Video on/off toggle during call

---

## 11. Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|------------|
| SDP offer embedded in `call.invite` | Yes | Saves one RTT. SDP is 10–50 KB — well under 1 MB envelope cap. |
| Trickle ICE | Yes | Faster connection. Candidates sent as gathered via `call.ice-candidate`. |
| Path 1 (libp2p data channel) tried first | Yes | Best for LAN / direct P2P. No STUN/TURN dependency. |
| Path 2 (standard ICE) fallback | Yes, 5s timeout | Covers cross-NAT scenarios. TURN via existing relay. |
| Trust level for calls | `friends` (≥ referred) | Accessible to all bonded contacts; blocks strangers. |
| Mobile UI implementation | Native Flutter | Better performance; works when backgrounded. |
| Video in v1 | No | Defer to Phase 38E. Audio-only keeps v1 scope manageable. |

---

## 12. Verification

| Test | Scope |
|------|-------|
| All Zod schemas parse valid/invalid payloads | packages/protocol |
| `call.*` role policy rejects strangers | apps/node |
| `CallManager` state transitions | apps/node |
| Two browser tabs on same LAN (Path 1) — audio both ways | apps/social |
| Two browser tabs on separate networks (Path 2) — audio via TURN | apps/social |
| Incoming call modal appears, accept/decline works | apps/social |
| Mute toggle sends `call.mute`, remote UI updates | apps/social |
| Mobile (EnvoyGo) receives call, native screen appears | apps/envoygo |
| Missed call when app is backgrounded | apps/envoygo |

---

## 13. Open Questions

| Question | Status | Notes |
|----------|--------|-------|
| `@libp2p/webrtc` API for Path 1 | **Open** — needs verification | Need to confirm the exact API for creating a WebRTC data channel over an existing libp2p `Connection`. The dep tree has `@libp2p/webrtc@6.0.23` as a transitive dep. |
| Trickle ICE on Path 1 | **Resolved** | Not needed — ICE resolves against known libp2p addresses in milliseconds. `call.ice-candidate` is Path 2 only. |
| TURN credential provision from relay | **Open** | The protocol specifies that TURN credentials are included in `iceServers` (username/credential format, HMAC-SHA256, 1-hour TTL). The relay must implement a TURN server and issue short-lived credentials. The relay check-in/registration flow must be extended to return TURN credentials alongside relay service. |
| Relay TURN server implementation | **Open** | The libp2p relay node must act as a TURN server. Options: coturn (well-known, production-tested), pion/turn (pure Go), or go-to-rfc5766-turn-server. |
| iOS background audio | **Open** | When EnvoyGo is backgrounded, iOS may suspend the WebView. Need `flutter_webrtc` background audio entitlement + proper audio session configuration. |
| In-call audio routing | **Open** | Default to speaker for voice calls. Add a speaker/earpiece toggle in the UI. |
| AI agent as call participant | **Open** | OpenClaw already supports OpenAI Realtime API / Google Live API for agentic voice. A future bridge could allow the AI agent to join a human↔human call as a silent observer or active participant (e.g., real-time transcription, suggestions). This requires extending the `call.*` intent family to support an optional `observer` role, or handling it as a separate parallel channel. Out of scope for Phase 38 v1. |
