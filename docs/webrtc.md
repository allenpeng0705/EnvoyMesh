# WebRTC Integration in EnvoyMesh

**Status:** reference
**Related:** [voice-video-call-support.md](./voice-video-call-support.md) (signaling design), [implementation-plan.md](./implementation-plan.md#phase-38--real-time-voicevideo-calls) (build phases)

---

## 1. Overview

EnvoyMesh uses WebRTC for real-time audio calls with a **dual-path transport** design:

| | Path 1 | Path 2 |
|--|--------|--------|
| **When** | Direct libp2p connection exists (LAN, mDNS, or established relay) | No direct libp2p connection, or Path 1 fails within 5s |
| **Transport** | WebRTC data channel over libp2p stream | Standard ICE (UDP/TCP with STUN/TURN) |
| **STUN needed** | No | Yes |
| **TURN needed** | No | Yes (symmetric NAT fallback) |
| **Trickle ICE** | No | Yes |
| **Latency** | Lowest (no relay) | Higher (relay in media path) |

Path 1 is tried first. If it fails to produce a connection within **5 seconds**, Path 2 is activated. Both paths use the same `RTCPeerConnection` API — the difference is only the `iceServers` configuration and whether a libp2p data channel transport is used.

---

## 2. Path 1 — libp2p Data Channel (LAN / Direct P2P)

**Applies when:** Both peers have an active libp2p connection — same LAN via mDNS discovery, or an already-established relayed connection.

**How it works:**

1. Caller creates `RTCPeerConnection` with an **empty `iceServers`** config
2. Uses `@libp2p/webrtc` to wrap the existing libp2p `Connection` as a WebRTC data channel transport
3. ICE resolves against the already-known libp2p peer addresses (local LAN IP or relay multiaddr) — **milliseconds, no trickle needed**
4. Audio tracks are added via `pc.addTrack(track, stream)`, remote audio arrives via `pc.ontrack`

**No trickle ICE on Path 1.** The peer addresses are already known from the established libp2p connection. ICE candidate gathering resolves instantly against those known addresses. The `call.invite` is sent only after `pc.setLocalDescription(offer)` is set.

**Exception:** If the libp2p connection itself is NATed, ICE may gather additional candidates. `call.ice-candidate` is available for this case but is not required for the normal Path 1 flow.

**Advantages:**
- Works on LANs where STUN/TURN servers are unavailable
- Lowest latency (no relay in media path)
- No dependency on external infrastructure

---

## 3. Path 2 — Standard ICE (Cross-NAT)

**Applies when:** No direct libp2p connection exists, or Path 1 fails to connect within 5 seconds.

**How it works:**

1. Caller creates `RTCPeerConnection` with `iceServers` from the `call.invite` payload (STUN + TURN credentials)
2. `pc.createOffer()` triggers ICE candidate gathering automatically
3. ICE candidates are gathered and sent via `call.ice-candidate` envelopes as they arrive (trickle ICE)
4. Callee creates `RTCPeerConnection` with `iceServers` from the `call.invite` payload
5. Callee runs `pc.setRemoteDescription(offer)` → `pc.createAnswer()` → `pc.setLocalDescription(answer)`
6. Once both sides have set remote description and have connectivity candidates, the media path is established

**ICE gathering begins immediately after `setLocalDescription(offer)`** — before the `call.invite` envelope is even sent over the network. `call.ice-candidate` envelopes may arrive at the remote peer before `call.accept` arrives. This is standard trickle ICE behavior and minimizes call setup latency.

**Trickle ICE is Path 2 only.** Path 1 does not use it.

---

## 4. STUN — NAT Type Discovery

STUN (Session Traversal Utilities for NAT) asks the STUN server: *"What IP:port does the internet see me as?"*

```
Local peer  --[STUN binding request]-->  STUN server
Local peer  <--[STUN binding response:   --[your public IP:port]
                your public IP:port]------
```

This produces the **srflx (server reflexive) candidate** — the public IP:port other peers can try to reach. STUN only works if at least one peer is not behind a symmetric NAT.

**STUN servers used (public, no authentication):**

| Provider | URL | Notes |
|----------|-----|-------|
| Google | `stun:stun.l.google.com:19302` | Most reliable, widely deployed |
| Cloudflare | `stun:stun.cloudflare.com:3478` | Good fallback |
| Twilio | `stun:global.stun.twilio.com:3478` | Good fallback |

Each node SHOULD configure at least two STUN servers to avoid single-point-of-failure.

---

## 5. TURN — Relay When Direct Paths Fail

TURN (Traversal Using Relays around NAT) is required when both peers are behind **symmetric NATs** (the most restrictive NAT type). When symmetric NATs are in use, no direct path can be discovered — the srflx address is also blocked. TURN uses a relay server in the middle to forward all media between peers.

The **libp2p relay node** that both peers are already connected to for messaging also acts as the TURN server — no separate infrastructure is needed.

### TURN Credential Format (HMAC-SHA256 Short-Lived Credentials)

```
iceServers: [
  { "urls": "stun:stun.l.google.com:19302" },
  { "urls": "stun:stun.cloudflare.com:3478" },
  {
    "urls": "turn:<relay-host>:3478",
    "username": "<unix-timestamp>:<random-nonce>",
    "credential": "<HMAC-SHA256 of username with relay shared secret>"
  }
]
```

| Field | Format | Notes |
|-------|--------|-------|
| `urls` | `turn:<host>:<port>` | Relay's public TURN endpoint |
| `username` | `<unix-timestamp>:<random-nonce>` | e.g. `1718630400:abc123xyz`. Valid for 1 hour. |
| `credential` | HMAC-SHA256(username, shared-secret) | Proves the client is authorized to use the relay |

**TTL:** Credentials are valid for 1 hour. Nodes must fetch fresh credentials from the relay before placing a call if existing credentials are expired.

**TURN provisioning:** When a node checks in with its relay (the same check-in that establishes the relay connection for messaging), the relay issues short-lived TURN credentials alongside the relay service. These credentials are included in `call.invite` and `call.accept` payloads.

### TURN Fallbacks for Restricted Networks

Some networks block all UDP traffic. TURN supports TCP and TLS as transports:

| Transport | URL scheme | Port | Use case |
|-----------|-----------|------|---------|
| UDP | `turn:` | 3478 | Default |
| TCP | `turn:` | 3478 | Corporate firewalls that block UDP |
| TLS | `turns:` | 443 | Heavily restricted networks that block TCP |

All three SHOULD be provisioned when TURN credentials are issued, so the WebRTC stack can try them in order of preference.

---

## 6. ICE Candidate Priority

ICE discovers all possible paths to the remote peer and selects the best one. Candidates are gathered in this priority order:

| Priority | Candidate type | How discovered | Works through NAT? |
|----------|---------------|----------------|-------------------|
| Highest | **host** | Direct network interface | Same LAN only |
| ... | **srflx** (server reflexive) | STUN binding response | Simple NAT only |
| ... | **prflx** (peer reflexive) | ICE connectivity check | During negotiation |
| Lowest | **relay** (TURN) | TURN allocate response | Symmetric NAT only |

The WebRTC stack automatically selects the best candidate pair that produces a working connection. Path 1 typically uses a host or srflx candidate on the libp2p address. Path 2 may end up using the relay (TURN) candidate when symmetric NATs are in use.

---

## 7. Codec — Opus

Audio in v1 is Opus-only. All WebRTC stacks support Opus — no codec negotiation is needed for audio.

| Parameter | Value | Notes |
|-----------|-------|-------|
| Codec | Opus | Dynamic payload type 96 |
| Sample rate | 48,000 Hz | |
| Channels | 1 (mono) | |
| Bitrate | 32 kbps | Negotiable up to 64 kbps |
| FEC | Enabled | `useinbandfec=1` |
| Channel mapping | `0,1,0,1` | Standard mono mapping |

**SDP `fmtp` line:**
```
a=fmtp:96 useinbandfec=1;channel_mapping=0,1,0,1
```

**Jitter buffer:** WebRTC default (adaptive). No node-level jitter buffer configuration.

**DTMF:** Out of scope for v1.

---

## 8. Connection Quality Monitoring

WebRTC connection quality is monitored via `RTCPeerConnection` state objects — no protocol element is needed:

| Observable | API | What it tells you |
|------------|-----|-------------------|
| Overall connection state | `pc.connectionState` | `"new" \| "connecting" \| "connected" \| "failed" \| "closed"` |
| ICE connection state | `pc.iceConnectionState` | `"new" \| "checking" \| "connected" \| "completed" \| "failed" \| "disconnected" \| "closed"` |
| ICE gathering state | `pc.iceGatheringState` | `"new" \| "gathering" \| "complete"` |

The UI reads these directly from the `WebRtcCallTransport` object. No `call.*` intent carries connection quality information.

---

## 9. Key Constants

| Constant | Value | Usage |
|----------|-------|-------|
| `CALL_RING_TIMEOUT_MS` | `60_000` (60 seconds) | Callee's inbound call ringing timeout. Auto-rejects with `call.reject(reason: "no_answer")` if user doesn't respond. |
| `PATH_1_TIMEOUT_MS` | `5_000` (5 seconds) | How long the caller waits for Path 1 (libp2p data channel) to connect before falling back to Path 2 (standard ICE). |
| `CALLER_RINGBACK_TIMEOUT_MS` | `30_000` (30 seconds, UI-level) | Recommended caller-side UI timeout while waiting for `call.accept`. Sends `call.hangup(reason: "no_answer")` if UI times out. Not enforced at the node level. |

---

## 10. Relationship to Call Signaling

This document covers WebRTC transport mechanics only. The call **signaling** (how `call.invite`, `call.accept`, `call.reject`, `call.hangup`, `call.ice-candidate`, and `call.mute` intents flow over the P2P envelope layer) is documented in [voice-video-call-support.md](./voice-video-call-support.md).

Key points connecting the two:

- `call.invite` carries the **SDP offer** (embedded to save one RTT) and **`iceServers`** (TURN credentials from the relay) for Path 2
- `call.accept` carries the **SDP answer** and optionally additional `iceServers`
- `call.ice-candidate` carries trickle ICE candidates (Path 2 only; Path 1 does not use it)
- The `WebRtcCallTransport` interface wraps `RTCPeerConnection` and is called by `CallManager` which correlates `callId` to active peer connections
