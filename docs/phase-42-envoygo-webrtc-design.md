# Phase 42 — EnvoyGo Native WebRTC Voice Calls (Design Memory)

**Saved:** 2026-06-19
**Purpose:** Quick reference for future sessions implementing Phase 42.
**Normative design:** [voice-video-call-envoygo.md](../voice-video-call-envoygo.md)

---

## Protocol distinction (read this first)

| Layer | Changes in Phase 42? |
|---|---|
| **Wire (libp2p envelopes)** | **NO changes.** All 6 `call.*` intents from Phase 38 remain unchanged. No new wire intents. |
| **NodeService API (home ↔ thin-client)** | **3 breaking signature changes.** `sendCallInvite`, `acceptCallInvite`, and `registerPushToken` gain new parameters. |

**Why these breaks are safe:**
1. The current `sendCallInvite` signature is already broken at runtime (`sdpOffer: ""` violates the Zod schema requiring `z.string().min(1)`)
2. The home ↔ EnvoyGo channel is version-coupled (both are released together)
3. There are no third-party consumers of the `NodeService` interface

**Unchanged:**
- `declineCallInvite(callId, reason)`
- `endCall(callId)`
- `setCallMuted(callId, muted)`
- `getActiveCall()`
- `onCallEvent(handler)`
- `CallSession` / `CallEvent` types

---

## 4 key design decisions

### 1. EnvoyGo is Path 2 only
`flutter_webrtc` does not support binding to libp2p streams (Path 1 uses `@libp2p/webrtc` data channel). Phone always uses standard ICE with `iceServers` from the home node config. Desktop ↔ desktop still works with Path 1.

### 2. `iceServers` flows via call envelope, not a new RPC
The home injects `iceServers` (from `node-config.json`) directly into `call.invite` / `call.accept` payloads. EnvoyGo never queries config separately. Single source of truth.

### 3. SDP generated on the endpoint with the mic
Phone generates SDP offer/answer via `flutter_webrtc`'s `RTCPeerConnection.createOffer()` / `createAnswer()`, then sends it to the home via JSON-RPC. The home stamps it into the `call.*` envelope and forwards. Home never sees SRTP media bytes.

### 4. Home stays in the signaling path
Trust gate, identity binding, CallManager state machine all run on the home. Removing the home from the call path requires Phase 10B (full mobile P2P) and is tracked in `parked-envoygo-full-node-scope.md`.

---

## Sub-phase cheat sheet

| Phase | What | LoC |
|-------|------|-----|
| 42A | Fix home `sendCallInvite` — resolve owner→device, embed SDP, inject `iceServers` | ~60 |
| 42B | Home response envelopes (`acceptCallInvite` / `declineCallInvite` / `endCall` / `setCallMuted`) | ~40 |
| 42C | Replace EnvoyGo stubs with real JSON-RPC implementations | ~80 |
| 42D | `WebRtcCallTransport` in Dart — `RTCPeerConnection`, audio tracks, ICE lifecycle | ~150 |
| 42E | `CallProvider` integration — transport creation, remote stream → UI | ~60 |
| 42F | Permissions + UI wiring (`voice_call_screen.dart`, mic, `AVAudioSession`) | ~50 |
| 42G | Social UI caller for `createWebRtcCallTransport` (connects the dead code) | ~30 |
| 42H | TURN editor in Social UI + TURN round-trip test | ~80 |
| 42I | iOS VoIP push + CallKit + PushKit (backgrounded calling) | ~120 |

---

## API-breaking changes detail

### 1. `sendCallInvite(targetOwnerId)` → `sendCallInvite(targetOwnerId, sdpOffer, iceServers?)`
- **Why:** Current signature sends `sdpOffer: ""` (violates Zod schema). Phone must provide the SDP offer it generated.
- **Files:** `node-service-impl.ts`, `node-service.ts` (API types), `node-service.d.ts`, `json-rpc-router.ts`, `node-service-client.dart`

### 2. `acceptCallInvite(callId)` → `acceptCallInvite(callId, sdpAnswer, iceServers?)`
- **Why:** Callee's phone generates the SDP answer; it must be sent back to the caller.
- **Files:** Same as above

### 3. `registerPushToken` gains a `tokenType: "standard" | "voip"` discriminator
- **Why:** iOS VoIP pushes use a different APNs topic (`{BUNDLE_ID}.voip`) and `apns-push-type: voip`. The existing `registerPushToken` only handles standard pushes.
- **Files:** `push-notification.ts`, `node-service-impl.ts`, `node-service.ts`, `json-rpc-router.ts`

---

## 3-server ICE default (42A)

```json
[
  { "urls": "stun:stun.l.google.com:19302" },
  { "urls": "stun:stun.cloudflare.com:3478" },
  { "urls": "stun:global.stun.twilio.com:3478" }
]
```

STUN only. TURN is user-added (42H). Recommended providers: Twilio Network Traversal Service, Cloudflare Calls API, self-hosted coturn.

---

## Cross-references

| Doc | Purpose |
|-----|---------|
| [voice-video-call-envoygo.md](../voice-video-call-envoygo.md) | Normative design — read this first |
| [implementation-plan.md#phase-42](../implementation-plan.md#phase-42--native-webrtc-voice-calls-on-envoygo-) | Implementation checklist |
| [voice-video-call-support.md](../voice-video-call-support.md) | Phase 38 desktop WebRTC design |
| [parked-envoygo-full-node-scope.md](../parked-envoygo-full-node-scope.md) | Why home stays in the path |
