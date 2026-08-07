# Phase 42 — Native WebRTC Voice Calls on EnvoyGo

**Status:** `[x]` shipped (design doc retained for history)
**Date:** 2026-06-19
**Author:** EnvoyMesh core team
**Related:** [implementation-plan.md#phase-42](./implementation-plan.md#phase-42--native-webrtc-voice-calls-on-envoygo-), [Phase 38](./implementation-plan.md#phase-38--real-time-voicevideo-calls), [voice-video-call-support.md](./voice-video-call-support.md), [parked-envoygo-full-node-scope.md](./parked-envoygo-full-node-scope.md), [Phase 31 (EnvoyGo thin client)](./implementation-plan.md#phase-31--flutter-thin-client-envoygo), [push-notification-config.md](./push-notification-config.md)

> **2026-08 update — CallKit / PushKit removed.** China App Store review
> requires CallKit off when China is a territory. EnvoyGo no longer uses
> VoIP push, PushKit, or CallKit. Incoming calls use a standard alert push
> (`data.type = "incomingCall"`, iOS `aps.content-available: 1`) and the
> in-app call UI. Sections below that describe 42I VoIP/CallKit are
> historical; follow [push-notification-config.md](./push-notification-config.md)
> for the current wake path.

---

## 1. Problem

EnvoyGo is a Flutter thin client for EnvoyMesh (Phase 31). Phase 38 shipped real-time voice calls on the **desktop** side — Social UI can place and receive WebRTC calls end-to-end. **EnvoyGo cannot.** The call UI exists (`VoiceCallScreen`, `IncomingCallOverlay`, `CallProvider`), the `flutter_webrtc` dependency is declared in `pubspec.yaml:28`, and the home side already emits the `call:*` events on the WebSocket event bus, but every concrete piece of the call pipeline is stubbed or broken:

| Layer | What exists | What is missing |
|---|---|---|
| **Home `sendCallInvite`** | Stub at `apps/node/src/node-service-impl.ts:11913-11945` | Passes *owner ID* (not device peer ID) to `mesh.send`; embeds empty `sdpOffer: ""` (schema-violating); does not inject `iceServers` from node config; does not call `_resolvePeerTransportForOwner` like chat does |
| **Home `acceptCallInvite` / `declineCallInvite` / `endCall` / `setCallMuted`** | Stubs at `node-service-impl.ts:11947-11961` | Just call `CallManager`; never send the response envelope back to the peer |
| **EnvoyGo `NodeServiceClient` call methods** | Stubs at `apps/envoygo/lib/services/node_service_client.dart:376-408` | All five throw `UnimplementedError` — no JSON-RPC payload, no reply, no error |
| **EnvoyGo `flutter_webrtc` integration** | `pubspec.yaml:28` dep | Zero references in `lib/`; no `RTCPeerConnection`, no `createOffer`, no SDP generation, no audio track, no peer connection lifecycle |
| **`iceServers` config flow** | Defined at `apps/node/src/node-config-store.ts:188-192`; loaded into NodeService at `node-service-impl.ts:7813` | Never read by `sendCallInvite`; never read by `createWebRtcCallTransport`; never sent to EnvoyGo |
| **Social UI `createWebRtcCallTransport` caller** | Defined at `apps/social/src/lib/webrtc-call-transport.ts:57-251` | Zero callers in `apps/social/src` — the file is dead code until something wires it up (42G §3) |
| **iOS backgrounded calling** | none | No `voip` UIBackgroundMode in `Info.plist`; no PushKit/CallKit integration; no VoIP push token registration. The home has APNs **standard** push (`apps/node/src/push-notification.ts`) and the `registerPushToken` RPC, but no VoIP variant. Phone cannot wake the app for an incoming call after the user swipes it away. |
| **TURN credentials for symmetric NAT** | none | `iceServers` schema at `node-config-store.ts:192` already supports `{ urls, username?, credential? }` entries (TURN-compatible), but no UI exposes TURN config; no doc covers TURN provider acquisition. The default list is also incomplete (42A ships with 3 STUN servers, TURN is user-added). |

Net effect: tapping the call button in EnvoyGo today throws; an incoming `call.invite` envelope would arrive at the home, get processed, the home would emit `call:incoming` on the WebSocket, EnvoyGo's `CallProvider` would see it and switch state — but there is no SDP, no peer connection, no audio. The call is unidirectional signaling only.

This phase lands the missing pieces so a Flutter phone and a desktop browser can place and receive real WebRTC voice calls with the home in the signaling path. The home stays the gatekeeper (trust check, identity binding, CallManager state machine); the media path is peer-to-peer between the phone and the desktop (Path 1: libp2p data channel when on LAN / direct libp2p; Path 2: standard ICE with `iceServers` when cross-NAT).

---

## 2. Goals & Non-Goals

### Goals

- **G1.** An EnvoyGo phone can place a voice call to a bonded contact that is on either a Social/desktop browser or another EnvoyGo phone.
- **G2.** An EnvoyGo phone can receive a voice call placed from a Social/desktop browser or another EnvoyGo phone.
- **G3.** The home node remains in the call signaling path — it performs trust checks, identity binding, and CallManager state machine. Removing the home from the call path is explicitly out of scope (see [parked-envoygo-full-node-scope.md](./parked-envoygo-full-node-scope.md)).
- **G4.** The media path is peer-to-peer. The home does not see SRTP media bytes.
- **G5.** `iceServers` configured on the home node reaches EnvoyGo via the call envelope (not via a new RPC) so the phone can build an `RTCPeerConnection` with the right ICE config.
- **G6.** All Phase 38 protocol rules continue to hold — `callId` generation/dedup, identity binding, ring timeout, role policy (`HUMAN_HUMAN_ONLY`, `friends` sensitivity), and `agentCredential` handling.
- **G7.** An EnvoyGo phone on iOS can surface an incoming call when backgrounded (and best-effort when terminated). Home sends a standard APNs alert with `data.type = "incomingCall"` + `aps.content-available: 1`; the phone shows the **in-app** call screen (CallKit/PushKit removed for China App Store compliance).
- **G8.** Symmetric-NAT phone↔phone calls connect when the home has TURN credentials configured. The home injects user-configured TURN into the call envelope alongside the default 3-STUN list; phone uses whichever the envelope provides.

### Non-Goals

- **NG1.** Video calls (`callType: "video"`) — defer to a Phase 42B extension.
- **NG2.** Group calls — defer.
- **NG3.** Server-side SFU, media recording, or in-call messaging.
- **NG4.** Path 1 implementation on the **Flutter** side. Path 1 (libp2p data channel via `@libp2p/webrtc`) is not available in `flutter_webrtc`; the phone is a Path-2-only endpoint. Path 1 still works for the desktop↔desktop case and for desktop↔phone when the desktop is the caller's side; phone↔phone and phone↔desktop-when-phone-is-caller use Path 2 only.
- **NG5.** Removing the home from the call path or making the phone a full mesh node.
- **NG6.** Provisioning or bundling a TURN server in the EnvoyMesh relay binary (`apps/relay/`). TURN is a *user-configured* concern, not an EnvoyMesh service. The recommended providers (Twilio Network Traversal Service, Cloudflare TURN, self-hosted coturn) are documented in §7.7.
- **NG7.** AI agent as a call participant (already a Phase 39 / Phase 38 open question).
- **NG8.** Guaranteed force-killed ring parity with the old iOS VoIP+CallKit path. Both platforms now use alert/FCM wake + in-app UI (best-effort under OS throttling).

---

## 3. Architecture (delta to Phase 38)

### 3.1 Component map

```
┌─────────────────────────────────────────────────────────────────────┐
│  Phase 42 delta — highlighted                                       │
│                                                                     │
│   apps/envoygo/                  apps/node/                apps/social/
│   ┌──────────────────┐           ┌────────────┐           ┌────────────┐
│   │  CallProvider    │           │ CallManager│           │  useCall*  │
│   │  (existing)      │           │ (existing) │           │  (new hook)│
│   └────────┬─────────┘           └─────┬──────┘           └─────┬──────┘
│            │                           │                        │
│   ┌────────▼─────────┐                 │                ┌───────▼──────┐
│   │ WebRtcCallTrans- │                 │                │ createWebRtc- │
│   │ port (Dart)      │  SDP answer     │                │ CallTransport│
│   │  [NEW, 42D]      │ ───────►        │                │ (existing,   │
│   │  flutter_webrtc  │  via call.accept│                │  no caller)  │
│   │  RTCPeerConnection                 │                │ [NEW caller  │
│   │  getUserMedia    │  ◄──────  call.invite            │  in 42G]     │
│   │  audio tracks    │  with sdpOffer  │                └──────────────┘
│   └────────┬─────────┘                 │                        │
│            │                           │                        │
│   ┌────────▼─────────┐                 │                        │
│   │ NodeServiceClient│   JSON-RPC      │                        │
│   │  sendCallInvite  │ ─────────────►  │  sendCallInvite (42A)  │
│   │  acceptCallInvite│                 │  acceptCallInvite (42B)│
│   │  declineCallInvite│                │  declineCallInvite (42B)
│   │  endCall         │                 │  endCall (42B)         │
│   │  setCallMuted    │                 │  setCallMuted (42B)    │
│   │  [REPLACE STUBS, │                 │                        │
│   │   42C]           │                 │                        │
│   └────────┬─────────┘                 │                        │
│            │                           │                        │
│   ┌────────▼─────────┐                 │                        │
│   │ HomeRemoteClient │   WebSocket     │                        │
│   │ (existing)       │ ─────────────►  │  ws-server             │
│   └──────────────────┘                 │  ─► callManager events  │
│                                         │  ─► call-inbound       │
│                                         │  ─► mesh.send (envelope)│
│                                         └────────────┬───────────┘
│                                                      │
│                                            ┌─────────▼──────────┐
│                                            │ remote peer        │
│                                            │ (Social/EnvoyGo)   │
│                                            │ media: SRTP p2p    │
│                                            └────────────────────┘
```

### 3.2 Signaling round-trip — phone caller, desktop callee

```
1. User taps call button in EnvoyGo
2. CallProvider.startCall(targetOwnerId) creates a uuid callId
3. Creates flutter_webrtc RTCPeerConnection with iceServers from node config
4. Calls WebRtcCallTransport.startOffer() → getUserMedia + addTrack + createOffer
5. After pc.setLocalDescription, the local SDP offer is captured
6. CallProvider calls _nodeService.sendCallInvite(targetOwnerId, callId, sdpOffer, iceServers)
7. NodeServiceClient sends a JSON-RPC message to the home
8. Home: sendCallInvite (42A) resolves targetOwnerId → device peer ID + dial hints,
   embeds the SDP offer and iceServers into call.invite, signs and sends via mesh
9. Callee (desktop): call-inbound.ts routes call.invite → CallManager.inboundCallReceived
   → emits call:incoming on the ws event bus
10. Social UI useCallSession hook sees the event, opens IncomingCallModal,
    constructs createWebRtcCallTransport, calls startAnswer(remoteSdp) → SDP answer
11. User clicks Accept → Social sends JSON-RPC acceptCallInvite(callId) to home
12. Home: acceptCallInvite (42B) sends call.accept with sdpAnswer back to caller
13. Caller: call-inbound.ts routes call.accept → CallManager.outboundCallAccepted
    → emits call:answered on the ws event bus
14. EnvoyGo sees call:answered, sets the remote description on its RTCPeerConnection
15. Path 2: ICE candidates trickle both ways via call.ice-candidate envelopes
16. RTCPeerConnection transitions to "connected" → audio flows
```

### 3.3 Path selection

| Caller side | Callee side | Path used |
|---|---|---|
| Social desktop | Social desktop (LAN / direct libp2p) | Path 1 (libp2p data channel) |
| Social desktop | Social desktop (cross-NAT) | Path 2 (ICE) |
| EnvoyGo phone | Social desktop (LAN) | Path 2 only — `flutter_webrtc` cannot bind to a libp2p stream |
| EnvoyGo phone | Social desktop (cross-NAT) | Path 2 |
| EnvoyGo phone | EnvoyGo phone (LAN) | Path 2 only — same reason |
| EnvoyGo phone | EnvoyGo phone (cross-NAT) | Path 2 |

Practical implication: a phone-to-phone call needs `iceServers` configured (at minimum Google STUN) to have any reasonable chance of connecting when both phones are on different networks. The Phase 38 default `iceServers: [{ urls: "stun:stun.l.google.com:19302" }]` from `webrtc-call-transport.ts:75-78` covers LAN and most non-symmetric-NAT setups; TURN credentials are needed only for symmetric NAT, and remain a Phase 38 open question.

---

## 4. Protocol (no new wire changes)

This phase is **strictly a wiring phase** at the protocol level. Every `call.*` envelope already defined in Phase 38 is used as-is. The deltas are:

- The home **embeds the SDP offer** in `call.invite` (was empty string in the stub) and includes `iceServers` from node config. Both are already optional/required fields in `CallInvitePayloadSchema` (`packages/protocol/src/index.ts:2052-2066`).
- The home **embeds the SDP answer** in `call.accept` (was also stubbed). Same schema fields.
- The home **sends `call.reject` / `call.hangup` / `call.mute` envelopes** back to the peer when the user performs those actions. Today these are local-only state changes in `CallManager`; 42B wires the envelope send.
- EnvoyGo's `node_service_client.dart` call methods **carry the new arguments** (`callId`, `sdpOffer`, `iceServers`) to the home. No new RPC method names — the same five methods get full implementations.

No new intents, no new payload schemas, no new role-policy entries.

> **API-level breaking changes (separate from wire):** the `NodeService` interface in `packages/api/src/node-service.ts:2084-2100` gets **3 signature changes** that flow through to every client wrapper (`apps/social/src/lib/direct-call-client.ts`, the home's JSON-RPC handler, and `apps/envoygo/lib/services/node_service_client.dart`):
>
> | Method | Before | After | Phase |
> |---|---|---|---|
> | `sendCallInvite` | `(targetOwnerId: string)` | `(targetOwnerId, sdpOffer: string, iceServers?: IceServer[])` | 42A / 42C |
> | `acceptCallInvite` | `(callId: string)` | `(callId, sdpAnswer: string, iceServers?: IceServer[])` | 42B / 42C |
> | `registerPushToken` | `{ platform, token, ownerId, deviceId? }` | `{ platform, token, ownerId, deviceId?, tokenType: "standard" \| "voip" }` | 42I |
>
> `declineCallInvite`, `endCall`, `setCallMuted`, `getActiveCall`, `onCallEvent` are unchanged. These are **coordinated breaking changes** — the home and EnvoyGo (and Social UI) all ship from the same release; no version-skew deployment is supported. The reason this is safe:
>
> 1. The home ↔ EnvoyGo channel is private and version-coupled (the user installs both from the same release).
> 2. The current `sendCallInvite` signature is already a **runtime schema violation** — `node-service-impl.ts:11928` passes `sdpOffer: ""` which fails `z.string().min(1)`. Today's interface is broken at runtime; the new interface fixes it.
> 3. No third-party consumers of `NodeService` exist outside the home, Social, and EnvoyGo.
>
> When 42A/42B/42C/42I land, the change set is: `packages/api/src/node-service.ts` (interface update) + the three client wrappers (signature updates) + a coordinated test pass. There is no migration / backward-compat code path.

> **Note on the VoIP push transport (42I):** 42I adds a *transport* (APNs VoIP push) and a phone-side runtime dependency (`flutter_callkit_incoming` or equivalent). It does **not** add wire intents — the `call.invite` envelope still flows over the existing P2P layer; the VoIP push is a wake signal that prompts the phone to reconnect via WebSocket and pick up the call.

> **Note on the VoIP push transport (42I):** 42I adds a *transport* (APNs VoIP push) and a phone-side runtime dependency (`flutter_callkit_incoming` or equivalent). It does **not** add wire intents — the `call.invite` envelope still flows over the existing P2P layer; the VoIP push is a wake signal that prompts the phone to reconnect via WebSocket and pick up the call.

---

## 5. iceServers propagation

`iceServers` lives on the home in `node-config.json` (`apps/node/src/node-config-store.ts:192`) and is already loaded into the `NodeServiceImpl` config snapshot at `node-service-impl.ts:7813`. It needs to reach two consumers:

1. **The home's `sendCallInvite` (42A)** — embed in `call.invite` payload. Read from `this._nodeConfig?.iceServers ?? defaultIceServers` (the **3-server default** in §5.1).
2. **The EnvoyGo `WebRtcCallTransport` (42D)** — use to construct the `RTCPeerConnection`. Two paths:
   - From the envelope: the `call.invite` payload already carries `iceServers` (the home put them there in step 1), and `call.accept` carries them from the callee too. Phone uses the *envelope* `iceServers`, which is what the design says.
   - As a local fallback if the envelope is empty: read from `homeRemote.nodeConfig.iceServers`. The home exposes `nodeConfig` to EnvoyGo today via the existing `getNodeConfig` RPC.

This means the user configures `iceServers` **once on the home** in the Social Settings UI (`apps/social/src/components/views/SettingsNodeTab.tsx`), and it propagates to the phone via the call envelope automatically. No new UI on the phone.

### 5.1 Default `iceServers` list (3 servers)

The home injects a 3-server default when `node-config.iceServers` is unset. All three are public STUN servers with no TURN:

```ts
const defaultIceServers: IceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },          // Google
  { urls: "stun:stun.cloudflare.com:3478" },         // Cloudflare
  { urls: "stun:global.stun.twilio.com:3478" },      // Twilio (STUN-only; TURN is user-added)
];
```

STUN servers only resolve public IP discovery; they do **not** relay media. For symmetric NAT (where both peers are behind NATs that don't allow direct UDP hole-punching), the user must add a TURN server (see §5.2). The default list is STUN-only so the home works out-of-the-box for the common non-symmetric-NAT case without requiring a TURN account.

### 5.2 User-configured TURN (42H)

For symmetric NAT, the user adds TURN entries to `node-config.json`:

```json
{
  "iceServers": [
    { "urls": "stun:stun.l.google.com:19302" },
    { "urls": "stun:stun.cloudflare.com:3478" },
    { "urls": "stun:global.stun.twilio.com:3478" },
    {
      "urls": "turn:global.turn.twilio.com:3478?transport=udp",
      "username": "<twilio-username>",
      "credential": "<twilio-credential>"
    }
  ]
}
```

The schema at `node-config-store.ts:192` already accepts `{ urls, username?, credential? }` — no schema change is needed. 42H adds:

1. A Social UI editor in `SettingsNodeTab` for the user's TURN credentials (URL / username / credential rows).
2. Optional presets for the three recommended TURN providers (Twilio, Cloudflare, self-hosted coturn) — selecting a preset pre-fills the URL and prompts for credentials only.
3. The 3-server default above is applied if the user clears all entries.
4. A test that injects a TURN entry and asserts it shows up in the `call.invite` payload (this verifies the env→envelope path 42A sets up).

Recommended TURN providers (in order of operational ease for a single user):

| Provider | Setup | Cost |
|---|---|---|
| **Twilio Network Traversal Service** | Programmable Video / Voice account; generate credentials via the Twilio console or the Auth Token API | Pay-as-you-go (~$0.0004/GB) |
| **Cloudflare TURN** | Cloudflare account with Calls API enabled; use the Cloudflare SDK to mint short-lived credentials | Free during beta; pay-as-you-go after |
| **Self-hosted coturn** | Run `coturn` on a VPS with a public IP; configure `use-auth-secret` + a shared secret for ephemeral credentials | VPS cost only |

TURN credentials are sensitive (anyone with credentials can relay media through the user's TURN server). The home stores them in `node-config.json` with `0o600` file mode (existing convention) and never logs them.

---

## 6. Security

The Phase 38 security model is unchanged and re-asserted here:

- **Trust gate** at `call-inbound.ts:86-91` runs on the home before the callee's `CallManager` ever sees the invite. Blocked/public peers are dropped.
- **Identity binding** at `call-inbound.ts:78-84, 125-129, 156-161, 183-188, 210-215, 237-242` — `envelope.senderOwnerId === payload.callerOwnerId` for `call.invite`; `envelope.senderOwnerId === payload.calleeOwnerId` for `call.accept` / `call.reject`; participant check for the rest.
- **Role policy** at `packages/protocol/src/role-policy-table.ts:67-73` — `HUMAN_HUMAN_ONLY` with `sensitivity: "friends"`.
- **Envelope signature** — every `call.*` envelope is Ed25519-signed with the sender's device key. The home is the signature verifier; the phone is the signer.

**New surface introduced by Phase 42:**

- A malicious phone could send a malformed SDP offer that crashes the callee's `setRemoteDescription` (memory pressure, OOM on huge SDP, etc.). The SDP size cap in the existing envelope size limit (1 MB) bounds this, but the home should add a defensive check: validate `sdpOffer.length <= MAX_SDP_BYTES` (proposed 64 KB) and `sdpAnswer.length <= MAX_SDP_BYTES` in `call-inbound.ts` before passing to the callee's transport.
- A malicious callee could send a malformed SDP answer that crashes the caller's `setRemoteDescription`. Same defense.
- A phone could send `call.ice-candidate` envelopes with junk candidates that exhaust the caller's `addIceCandidate` queue. The Phase 38 design already rate-limits at the libp2p layer; 42A adds an additional check that `call.ice-candidate.candidate.candidate` matches the SDP candidate grammar regex `^candidate:[a-zA-Z0-9+/=.,_-]+( typ [a-z]+)?( raddr [0-9.]+)?( rport [0-9]+)?( generation [0-9]+)?( network-cost [0-9]+)?$` before forwarding to the transport.

These three defensive checks land in 42A as a single `validateSdpString` / `validateIceCandidate` helper pair. ~30 LoC.

---

## 7. Implementation Phases

### Phase 42A — Home `sendCallInvite` correctness + envelope injection

**Scope:** Fix the existing stub at `apps/node/src/node-service-impl.ts:11913-11945` to:
1. Accept `sdpOffer: string` and `iceServers: { urls; username?; credential? }[]` as arguments (was `targetOwnerId: string` only).
2. Resolve `targetOwnerId → { transportPeerId, recipientEnvelopePeerId, listenAddrs }` via `_resolvePeerTransportForOwner` (already exists at `node-service-impl.ts:2835-2945`).
3. Embed the SDP offer in the `call.invite` payload (replacing the empty string).
4. Read `iceServers` from `this._nodeConfig.iceServers` if not provided by the caller.
5. Set `recipientPeerId` to the resolved device peer ID (not the owner ID).
6. Sign and send via `this._mesh.send(transportPeerId, envelope, { dialHints })` (not `mesh.send(targetOwnerId, envelope)`).
7. Mirror the chat retry pattern (`_deliverChatEnvelope`) for delivery confirmation.
8. Add the defensive SDP / ICE-candidate validators in `call-inbound.ts`.

**Exit criteria:**
- Unit test: `sendCallInvite` with a mock `_resolvePeerTransportForOwner` returns `callId`, embeds the SDP, sets `recipientPeerId` to the device peer ID.
- Unit test: when `iceServers` is empty, the home injects the default STUN set.
- Unit test: when `_resolvePeerTransportForOwner` returns no peer, returns `null` and emits an audit event.

### Phase 42B — Home response envelopes (accept / decline / hangup / mute)

**Scope:** Wire the existing stubs at `node-service-impl.ts:11947-11961` to send the corresponding envelopes back to the peer:
1. `acceptCallInvite(callId, sdpAnswer, iceServers)` — look up the call session, build a `call.accept` envelope with the SDP answer, resolve the caller back to its device peer ID, sign and send.
2. `declineCallInvite(callId, reason)` — build a `call.reject` envelope.
3. `endCall(callId, reason)` — build a `call.hangup` envelope.
4. `setCallMuted(callId, muted)` — build a `call.mute` envelope.

All four share a small helper `_sendCallResponseEnvelope(callId, payload, intent)` that:
- Looks up the session in `CallManager` to get `peerOwnerId`.
- Resolves `peerOwnerId → transportPeerId` via `_resolvePeerTransportForOwner`.
- Signs and sends via `this._mesh.send`.
- If no session or no peer, no-ops (the call is already ended).

**Exit criteria:**
- Unit tests for each of the four methods, with a mock `CallManager` and a mock `_resolvePeerTransportForOwner` — verify the right intent and payload are sent.
- Identity binding check stays in `call-inbound.ts` on the *receiving* end; the *sending* end just constructs the envelope.

### Phase 42C — EnvoyGo `NodeServiceClient` call RPC implementations

**Scope:** Replace the five `UnimplementedError` stubs at `apps/envoygo/lib/services/node_service_client.dart:376-408` with real JSON-RPC calls over the existing `HomeRemoteClient`:
1. `sendCallInvite(targetOwnerId, sdpOffer, iceServers)` → JSON-RPC `sendCallInvite` with `{ targetOwnerId, sdpOffer, iceServers }`. Returns the call ID.
2. `acceptCallInvite(callId, sdpAnswer, iceServers)` → JSON-RPC `acceptCallInvite`.
3. `declineCallInvite(callId, reason)` → JSON-RPC `declineCallInvite`.
4. `endCall(callId)` → JSON-RPC `endCall`.
5. `setCallMuted(callId, muted)` → JSON-RPC `setCallMuted`.

The JSON-RPC envelope shape follows the existing pattern in `node_service_client.dart` (look at `sendChat` for the model).

**Exit criteria:**
- `node_service_client_test.dart` covers each method, mocking `HomeRemoteClient` to verify the right JSON-RPC payload and parse the response.
- The pre-existing `UnimplementedError` blocks are removed.

### Phase 42D — Native `WebRtcCallTransport` for Flutter

**Scope:** Create `apps/envoygo/lib/webrtc_call_transport.dart` mirroring `apps/social/src/lib/webrtc-call-transport.ts:57-251` using `flutter_webrtc`. Public surface:

```dart
class WebRtcCallTransport {
  WebRtcCallTransport({
    required this.callId,
    required this.iceServers,
    required this.onRemoteStream,         // (MediaStream) -> void
    required this.onConnectionStateChange, // (RTCPeerConnectionState) -> void
    required this.onSdpGenerated,         // (sdp: String, type: "offer" | "answer") -> void
    required this.onIceCandidate,         // (CallIceCandidate) -> void
    required this.onMutePayload,          // (CallMutePayload) -> void
  });

  Future<String> startOffer();           // getUserMedia + addTrack + createOffer + setLocalDescription
  Future<String> startAnswer(String remoteSdp);  // setRemoteDescription + createAnswer
  Future<void> addIceCandidate(CallIceCandidate candidate);
  void setMute(bool muted);
  Future<void> close();
}
```

`flutter_webrtc` API used:
- `RTCPeerConnection({iceServers, ...})` for the connection.
- `navigator.mediaDevices.getUserMedia({audio: true})` (via `flutter_webrtc` helper) for the mic.
- `MediaStreamTrack.enabled = !muted` for mute.
- `await pc.close()` for cleanup.
- `pc.onIceCandidate`, `pc.onAddStream`, `pc.onConnectionState` for events.

**Path support:** Path 2 only (NG4). Path 1 (libp2p data channel) is not available in `flutter_webrtc`; this is documented in the file's docstring.

**Exit criteria:**
- Unit tests with a fake `RTCPeerConnection` and `getUserMedia` (or run in a real device-only test that requires a mic — most tests will be integration).
- The class compiles under `flutter analyze` with zero errors.
- The `voice_call_screen.dart` is wired to use it (in 42E).

### Phase 42E — Wire `CallProvider` to drive the transport

**Scope:** Update `apps/envoygo/lib/providers/call_provider.dart:99-156` to:
1. `startCall` — build a `WebRtcCallTransport`, await `startOffer()`, then call `_nodeService.sendCallInvite(targetOwnerId, sdpOffer, iceServers)` with the generated SDP.
2. `acceptCall` — when state is `call:incoming`, build a `WebRtcCallTransport` with the remote SDP from the event payload, await `startAnswer()`, then call `_nodeService.acceptCallInvite(callId, sdpAnswer, iceServers)`.
3. `endCall` / `declineCall` — close the transport before calling the RPC.
4. `toggleMute` — call `transport.setMute` and then the RPC.
5. The `CallState` gains two new fields: `MediaStream? remoteStream` (for the `<audio>` element) and `WebRtcCallTransport? transport` (for cleanup).

**Exit criteria:**
- `call_provider_test.dart` covers: `startCall` builds the transport, generates SDP, sends the RPC, sets state. `acceptCall` does the inverse.
- The provider's lifecycle correctly closes the transport on every end-state transition.

### Phase 42F — UI + platform config

**Scope:**
1. Update `apps/envoygo/lib/screens/call/voice_call_screen.dart` to render the active call (peer name, duration timer, mute/end buttons) and bind to the new `CallState.remoteStream` via `RTCVideoRenderer` (or just play audio if no video in v1).
2. Update `apps/envoygo/lib/widgets/incoming_call_overlay.dart` to be the entry point on `call:incoming` (already exists; just needs to wire the Accept button to `CallProvider.acceptCall` with the SDP plumbing).
3. iOS `Info.plist`: add `NSMicrophoneUsageDescription`.
4. Android `AndroidManifest.xml`: add `RECORD_AUDIO` permission (and `INTERNET` is already present in the Capacitor manifest per Phase 31).
5. iOS `AVAudioSession` configuration: `AVAudioSessionCategory.playAndRecord` with `.voiceChat` mode, `.allowBluetooth` option. Set on `startCall` and `acceptCall`, reset on `endCall`.
6. Add `permission_handler` calls for `Permission.microphone.request()` before `getUserMedia` if not already granted.

**Exit criteria:**
- `flutter analyze` is clean.
- iOS and Android permission flows work; mic prompt appears on first call.
- The call screen plays/ends audio correctly on a real device (manual smoke).

### Phase 42G — Tests + E2E

**Scope:**
1. **Unit tests** (vitest for the home side, flutter_test for the phone side):
   - `apps/node/test/call-send-invite.test.ts` (42A)
   - `apps/node/test/call-response-envelopes.test.ts` (42B)
   - `apps/node/test/call-sdp-validation.test.ts` (42A defensive checks)
   - `apps/envoygo/test/services/node_service_client_test.dart` extensions (42C)
   - `apps/envoygo/test/providers/call_provider_test.dart` (42E)
2. **Integration test (vitest, jsdom, two-callManager instances):**
   - One home is the caller, one home is the callee. Send a `call.invite` envelope between them, assert the SDP offer round-trips in the envelope, assert the home's `sendCallInvite` sets the right `recipientPeerId`, assert `acceptCallInvite` produces a `call.accept` envelope with the SDP answer.
3. **Playwright E2E (browser-Social ↔ browser-Social):**
   - This re-validates that the Social UI side still works after the home-side changes. Two browser contexts, place a call, assert audio connection state. Already covered by the existing Phase 38 manual smoke deferred item; 42G automates it.
4. **Real-device manual smoke (deferred to 42J, same shape as Phase 38H):**
   - Two iOS devices on the same LAN, place a call via EnvoyGo, verify audio.

**Exit criteria:**
- 42G is green. 42J (manual device smoke) is optional and tracked the same way as Phase 38H.

### Phase 42H — TURN credentials for symmetric NAT

**Scope:** Solve the symmetric-NAT phone↔phone case without provisioning a TURN server in `apps/relay/`. The home injects a 3-STUN default and accepts user-configured TURN entries; the Social UI exposes a TURN editor with provider presets.

**1. Default 3-server list** (lives in `apps/node/src/node-config-defaults.ts` or inline at `node-service-impl.ts:7813`):
```ts
const defaultIceServers: IceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
  { urls: "stun:global.stun.twilio.com:3478" },
];
```
This is what `sendCallInvite` (42A) embeds in the `call.invite` payload when `node-config.iceServers` is empty.

**2. TURN schema** — already supported at `node-config-store.ts:192` (`{ urls, username?, credential? }` is TURN-compatible). No schema change.

**3. Social UI editor** (`apps/social/src/components/views/SettingsNodeTab.tsx`): add a section under the existing Network/ICE panel with:
- A list editor for ICE server entries (URL + optional username + optional credential).
- A preset selector that pre-fills the URL when the user picks "Twilio" / "Cloudflare" / "Self-hosted (coturn)".
- A "Reset to defaults" button.
- Inline validation: `urls` must start with `stun:` or `turn:`; TURN entries must include both `username` and `credential`.
- Test that the home's `node-config.iceServers` value is reflected in the editor on load and saved correctly on change.

**4. Documentation** — extend the existing `docs/voice-video-call-support.md` (or this doc, §5.2) with a "TURN provider setup" subsection: where to get Twilio/Cloudflare credentials, how to spin up coturn, security notes (TURN credentials are sensitive — file mode `0o600`, never logged).

**5. Tests:**
   - `apps/node/test/call-send-invite.test.ts` (already in 42A): add a test that injects a TURN entry into `node-config.iceServers` and asserts the entry (including `username`/`credential`) round-trips into the `call.invite` payload.
   - `apps/social/test/components/SettingsNodeTab.test.tsx` (new): test the TURN editor renders, accepts input, validates, and saves.
   - `flutter analyze` clean.

**Exit criteria:**
- The 3-server default is in the home's `sendCallInvite` path.
- The Social UI TURN editor works (regression-tested in `SettingsNodeTab.test.tsx`).
- A TURN credential added via the editor appears in the next `call.invite` payload (verified end-to-end with a mock RPC).
- The TURN provider acquisition subsection is documented in `docs/voice-video-call-support.md` §6.3 or here §5.2.

### Phase 42I — iOS backgrounded calling (VoIP + PushKit + CallKit)

**Scope:** Wake the iOS EnvoyGo app for an incoming call even when the user has swiped the app away. The home sends an APNs VoIP push on `call.invite` arrival (when the recipient is offline); the phone receives the push via PushKit, shows a native CallKit incoming-call screen, and starts the WebRTC session.

This phase **extends the existing APNs push infrastructure** at `apps/node/src/push-notification.ts` (which today handles standard APNs alerts only). VoIP push is a separate APNs endpoint and topic, but uses the same `.p8` key, JWT auth, and `http2` client.

**1. Home: extend push-notification module**
   - Add a `tokenType: "standard" | "voip"` discriminator to `PushTokenRecord` (`push-notification.ts:28`). The existing `registerPushToken` RPC (`node-service-impl.ts:11441`) gains a `tokenType` parameter.
   - Add a new `sendVoipPush(deviceId, callId, callerName)` function in `push-notification.ts` mirroring `sendApns` (line 135) but:
     - Uses the APNs VoIP endpoint: `api.push.apple.com/3/device/{voip-token}` (note: no `/topic` suffix in the path).
     - Sets `apns-topic: {BUNDLE_ID}.voip` (e.g. `com.envoymesh.EnvoyGo.voip`).
     - Sets `apns-push-type: voip` (different from `alert`).
     - Sends a minimal payload: `{"aps": {"content-available": 1}, "callId": "...", "callerName": "..."}`.
   - Add a hook in `call-inbound.ts:handleCallInvite` (after `inboundCallReceived`) that looks up the callee's VoIP push token (via `pushNotificationService.listForOwner` filtered by `tokenType === "voip"`) and sends a VoIP push if the WebSocket to the phone is **not** connected (i.e. the phone is offline).

**2. Phone: iOS native config**
   - `Info.plist`:
     - Add `UIBackgroundModes` array containing `voip` and `audio` (the latter for in-call survival).
     - The existing `NSMicrophoneUsageDescription` (42F) stays.
   - `ios/Runner/AppDelegate.swift`:
     - Register for VoIP pushes via `PKPushRegistry` (PushKit).
     - On `didRegisterForPushToken`, send the VoIP token to the home via the existing `registerPushToken` RPC with `tokenType: "voip"`.
     - On `didReceiveIncomingPushWithPayload`, hand off to `flutter_callkit_incoming` to show the native call screen.

**3. Phone: Dart-side**
   - Add `flutter_callkit_incoming` dependency to `pubspec.yaml` (CallKit wrapper). This is a **new pubspec dependency** — see exit criteria discussion in §9.
   - In `lib/services/push_service.dart` (new), wire PushKit + CallKit events to `CallProvider`:
     - On incoming CallKit event → call `CallProvider.handleIncomingCall(callId, callerName, sdpOffer)` (new method, mirrors the existing `call:incoming` event handler).
     - On CallKit "Accept" → call `CallProvider.acceptCall()` (42E plumbing).
     - On CallKit "Decline" → call `CallProvider.declineCall()`.
   - `CallProvider` gains a `handleIncomingCall({callId, callerOwnerId, sdpOffer, iceServers})` method that constructs the transport, calls `startAnswer(sdpOffer)`, then `acceptCallInvite(callId, sdpAnswer, iceServers)` (existing 42E flow).

**4. Phone: Android coverage (best-effort)**
   - Add `android.permission.RECORD_AUDIO` (already in 42F).
   - Add `FCM` `data` message handling on the home: when `call.invite` arrives and the callee has an Android FCM token but no live WebSocket, send a `data` message with `{ "type": "call_invite", "callId": "..." }`. The phone's `firebase_messaging` plugin handles backgrounded `data` messages and routes them to the Dart side.
   - Android CallUI: rely on Flutter's foreground UI; no equivalent of CallKit exists. Best-effort means the call screen only shows when the user manually opens the app after the FCM wake. This is consistent with NG8 (Android is not full-parity with iOS VoIP).

**5. Tests:**
   - **Unit tests on the home side:**
     - `apps/node/test/voip-push-dispatch.test.ts`: home receives `call.invite`, looks up the callee's VoIP token, sends a VoIP push (mocked `sendApns`-style). Asserts the APNs request has `apns-push-type: voip` and the correct topic suffix.
     - Extend `apps/node/test/push-notification.test.ts` (if it exists) to cover `tokenType: "voip"` persistence.
   - **Phone-side:** mostly manual — VoIP push requires a real iOS device with a real APNs VoIP certificate. Unit-test the Dart wiring (CallProvider integration with PushKit/CallKit events) with a fake `PushService`.
   - **Real-device smoke (deferred to 42J):** two iOS devices with a configured APNs VoIP push certificate, phone swiped away, place a call from the other phone, verify the call screen appears.

**6. Docs:**
   - Extend `docs/push-notification-config.md` with an APNs **VoIP** subsection (separate `.p8` use, `voip` topic suffix, VoIP push certificate in Apple Developer portal, `PKPushRegistry` setup).
   - Add a "Backgrounded calling on iOS" subsection to `docs/voice-video-call-support.md` covering the user-facing flow.

**Exit criteria:**
- The home dispatches a VoIP push on `call.invite` when the phone is offline (regression-tested in `voip-push-dispatch.test.ts`).
- `registerPushToken` accepts `tokenType: "voip" | "standard"`; the token is persisted to `push-tokens.json` with the discriminator.
- `Info.plist` declares `voip` and `audio` UIBackgroundModes; `AppDelegate` registers for `PKPushRegistry` and forwards the token to the home.
- `CallProvider.handleIncomingCall` works end-to-end on a real device (verified in 42J manual smoke).
- The existing standard APNs push (chat messages, bond requests) is unaffected.
- TURN credentials configured on the home reach a wake-from-terminated phone (since the phone rebuilds the `RTCPeerConnection` from the `call.invite` envelope on wake).

---

## 8. Files to Change

### New files

| File | Purpose |
|---|---|
| `apps/envoygo/lib/webrtc_call_transport.dart` | Native `flutter_webrtc` transport (42D) |
| `apps/envoygo/lib/models/call_event.dart` | Typed `CallEvent` mirror of `packages/api/src/node-service.ts` (small, but EnvoyGo lacks a typed layer for this today) |
| `apps/envoygo/lib/services/push_service.dart` | PushKit + CallKit integration (42I) |
| `apps/envoygo/test/providers/call_provider_test.dart` | (42E) |
| `apps/envoygo/test/webrtc_call_transport_test.dart` | (42D, fake `RTCPeerConnection`) |
| `apps/envoygo/test/services/push_service_test.dart` | (42I, fake PushKit/CallKit) |
| `apps/node/test/call-send-invite.test.ts` | (42A) |
| `apps/node/test/call-response-envelopes.test.ts` | (42B) |
| `apps/node/test/call-sdp-validation.test.ts` | (42A defensive checks) |
| `apps/node/test/voip-push-dispatch.test.ts` | (42I — VoIP push on `call.invite`) |
| `apps/social/test/components/SettingsNodeTab.test.tsx` | (42H — TURN editor) |

### Modified files

| File | Change |
|---|---|
| `apps/node/src/node-service-impl.ts:11913-11961` | Rewrite `sendCallInvite` (42A) and the four response methods (42B). Add the `iceServers` default helper (3-server default per §5.1). Add `validateSdpString` / `validateIceCandidate` helpers used by 42A. |
| `apps/node/src/node-service-impl.ts:11441-11446` | Extend `registerPushToken` to accept `tokenType: "standard" | "voip"` (42I). |
| `apps/node/src/call-inbound.ts` | Add the defensive SDP / ICE candidate validation in `handleCallInvite` / `handleCallAccept` / `handleCallIceCandidate` (42A). Add the VoIP-push dispatch hook after `inboundCallReceived` (42I). |
| `apps/node/src/push-notification.ts` | Extend `PushTokenRecord` with `tokenType`; add `sendVoipPush` mirroring `sendApns` with the `voip` topic suffix and `apns-push-type: voip` (42I). |
| `apps/envoygo/lib/services/node_service_client.dart:376-408` | Replace `UnimplementedError` stubs with real JSON-RPC implementations (42C). Extend `registerPushToken` to accept `tokenType`. |
| `apps/envoygo/lib/providers/call_provider.dart` | Add `WebRtcCallTransport` plumbing (42E). Add `handleIncomingCall(callId, callerName, sdpOffer)` for CallKit-driven incoming calls (42I). Extend `CallState` with `remoteStream` and `transport`. |
| `apps/envoygo/lib/screens/call/voice_call_screen.dart` | Bind to new `CallState` fields, render active call UI (42F). |
| `apps/envoygo/lib/widgets/incoming_call_overlay.dart` | Wire Accept button to `CallProvider.acceptCall` with SDP (42F). |
| `apps/social/src/components/views/SettingsNodeTab.tsx` | Add the TURN credentials editor with provider presets (42H). |
| `apps/envoygo/ios/Runner/Info.plist` | Add `NSMicrophoneUsageDescription` (42F); add `UIBackgroundModes` with `voip` and `audio` (42I). |
| `apps/envoygo/ios/Runner/AppDelegate.swift` | Register for VoIP pushes via `PKPushRegistry`, forward token to home (42I). |
| `apps/envoygo/android/app/src/main/AndroidManifest.xml` | Add `RECORD_AUDIO` permission (42F). |
| `apps/envoygo/lib/main.dart` | Configure `AVAudioSession` on iOS, request mic permission (42F). |
| `apps/envoygo/pubspec.yaml` | Bump `flutter_webrtc` to `^0.14.0`; add `flutter_callkit_incoming` (42I). |
| `docs/push-notification-config.md` | Add APNs **VoIP** subsection (42I). |
| `docs/voice-video-call-support.md` | Add TURN provider setup subsection (42H); add "Backgrounded calling on iOS" subsection (42I). |

### Untouched (verified)

- `packages/protocol/src/index.ts` call schemas — no changes.
- `packages/protocol/src/role-policy-table.ts` — no changes.
- `packages/api/src/node-service.ts` — `getActiveCall` / `onCallEvent` already exposed; `CallSession` / `CallEvent` already typed.
- `apps/social/src/lib/webrtc-call-transport.ts` — unchanged; Phase 38 already shipped the desktop side. (42G §3 confirms a Social UI caller is added so the file is no longer dead code.)
- The standalone `apps/relay/` — no TURN server is in scope (NG6).

---

## 9. Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Path 1 (libp2p data channel) on the phone | Not in Phase 42 | `flutter_webrtc` does not support binding to a libp2p stream; documented as NG4 |
| `iceServers` config location | Home `node-config.json` (existing) | Single source of truth; phone gets it via the call envelope |
| New wire intents | None | Phase 38 protocol is sufficient; this is a wiring phase |
| Home stays in the call path | Yes | User decision; explicit in [parked-envoygo-full-node-scope.md](./parked-envoygo-full-node-scope.md) |
| SDP size cap | 64 KB | Well above any normal SDP (10–50 KB) but bounds memory abuse; defended in `call-inbound.ts` |
| `flutter_webrtc` version | `^0.14.0` | Resolved (Q1). Bump from current `^0.12.0` for the API surface used (see 42D notes). |
| Default `iceServers` count | 3 servers (STUN-only) | Resolved (Q2). Google STUN + Cloudflare STUN + Twilio STUN. TURN is user-added in 42H. |
| TURN provisioning | User-configured, not EnvoyMesh-hosted | Resolved (Q3). Home stores user's TURN credentials in `node-config.json`; recommended providers (Twilio, Cloudflare, coturn) documented in §5.2. No TURN server in `apps/relay/` (NG6). |
| iOS backgrounded calling | VoIP push + PushKit + CallKit | Resolved (Q4). 42I extends the existing APNs push module (`push-notification.ts`) with a `tokenType: "voip"` discriminator and a VoIP-push sender. Phone uses `flutter_callkit_incoming` for the native call screen. Android is best-effort via FCM `data` (NG8). |
| Background audio on iOS (in-call) | `AVAudioSession` `playAndRecord` + `voiceChat` mode + `UIBackgroundModes: audio` | Standard config; complements the `voip` UIBackgroundMode for in-call survival |
| SDP exchange embedding | Keep as in Phase 38 (offer in `call.invite`, answer in `call.accept`) | Saves one RTT; 10–50 KB SDP fits under the 64 KB cap |
| New pubspec dependencies | `flutter_callkit_incoming` (42I) | Required for CallKit integration. `permission_handler` is **not** added — `flutter_webrtc`'s own permission prompts are used. `flutter_webrtc` is bumped (not added). |
| Push notification module extension | `tokenType: "standard" | "voip"` on `PushTokenRecord` | Reuses the existing `.p8` key, JWT auth, and `http2` client; only the APNs endpoint (`/3/device/{token}`), topic (`{BUNDLE_ID}.voip`), and `apns-push-type` differ |
| TURN credential storage | `node-config.json` with `0o600` file mode (existing convention) | TURN credentials are sensitive (anyone with credentials can relay media through the user's TURN server); never logged |

---

## 10. Verification

| Test | Scope | Phase |
|---|---|---|
| `sendCallInvite` resolves owner ID → device peer ID + embeds SDP + injects `iceServers` (3-server default) | apps/node | 42A |
| Defensive SDP/ICE-candidate validation in `call-inbound.ts` | apps/node | 42A |
| `acceptCallInvite` / `declineCallInvite` / `endCall` / `setCallMuted` send response envelopes | apps/node | 42B |
| `NodeServiceClient` call methods do real JSON-RPC, not throw | apps/envoygo | 42C |
| `WebRtcCallTransport` compiles, lifecycle correct, muting works (using `^0.14.0`) | apps/envoygo | 42D |
| `CallProvider` drives the transport end-to-end | apps/envoygo | 42E |
| Mic permission + `AVAudioSession` config on iOS / Android | apps/envoygo | 42F |
| Two browser contexts (existing Phase 38 setup) still connect | apps/social | 42G |
| User-configured TURN round-trips into `call.invite` payload | apps/node + apps/social | 42H |
| Social UI TURN editor renders, accepts input, validates, saves | apps/social | 42H |
| Home dispatches APNs VoIP push on `call.invite` when phone offline | apps/node | 42I |
| `registerPushToken(tokenType: "voip")` persists and dispatches | apps/node | 42I |
| Phone `PKPushRegistry` registers token and `flutter_callkit_incoming` shows native UI | apps/envoygo | 42I (real device) |
| Two iOS devices on the same LAN can place a call (manual) | device | 42J (deferred) |

---

## 11. Open Questions

| Question | Status | Notes |
|---|---|---|
| `flutter_webrtc` version on EnvoyGo | **Resolved** | `^0.14.0`. Bump in 42D. |
| Default `iceServers` count | **Resolved** | 3 STUN servers (Google, Cloudflare, Twilio). TURN is user-added in 42H. |
| Should `acceptCallInvite` accept `sdpAnswer` and `iceServers` from the caller side (the phone), or generate the SDP answer on the home and pass it back? | **Resolved** — phone generates | The Phase 38 design places SDP generation on the endpoint with the mic; the home is not in the SDP path. Phone generates, sends via RPC, home stamps it in the `call.accept` envelope. |
| TURN server for symmetric NAT | **Resolved** | User-configured in `node-config.json` (42H). No EnvoyMesh-hosted TURN server. Recommended providers: Twilio, Cloudflare, self-hosted coturn — documented in §5.2. |
| Persistent backgrounded calling on iOS | **Resolved** | VoIP push + PushKit + CallKit (42I). Home extends the existing APNs module with a `voip` `tokenType`. Phone uses `flutter_callkit_incoming`. |

---

## 12. Estimated effort

| Sub-phase | Approx. new LoC | Test LoC | Notes |
|---|---|---|---|
| 42A | ~120 (home fix) + ~30 (validators) | ~250 | Surgical; one function per file |
| 42B | ~80 (one helper + 4 thin methods) | ~200 | |
| 42C | ~80 (5 method bodies) | ~150 | Mirrors existing `sendChat` test pattern |
| 42D | ~250 (Dart transport) | ~150 (mostly fake-`RTCPeerConnection`) | Requires `flutter_webrtc ^0.14.0` |
| 42E | ~150 (`CallProvider` rewiring) | ~200 | |
| 42F | ~100 (UI binding + iOS/Android config) | ~50 | Manual smoke deferred to 42J |
| 42G | ~80 (Playwright) + ~100 (jsdom two-callManager) | covered above | Reuses existing Phase 38 Playwright setup; also wires the missing Social-UI caller for `createWebRtcCallTransport` |
| 42H | ~200 (TURN editor + 3-server default + tests + docs) | ~150 | New SettingsNodeTab editor; default list inline at `node-service-impl.ts:7813`; TURN provider docs in §5.2 |
| 42I | ~400 (home push ext + iOS native + Dart + Android best-effort + docs) | ~200 | `tokenType` discriminator on `PushTokenRecord`; new `sendVoipPush`; `PKPushRegistry` in `AppDelegate.swift`; `flutter_callkit_incoming` wiring; `FCM` data fallback for Android |
| **Total** | **~1,490 + ~1,500 tests** | | Roughly 1.5× the original Phase 42 scope due to 42H and 42I |

---

## 13. Out-of-scope (parked until scoped)

- **TURN server in the relay binary** — explicit NG6. TURN is user-provisioned. If a future need arises for an EnvoyMesh-hosted TURN (e.g. for users who can't or won't get a TURN account), this becomes its own phase.
- **Path 1 on the phone** — would require `flutter_webrtc` to expose libp2p data channel binding, or a separate Dart-side WebRTC stack. Defer until a real use case appears.
- **Group calls** — separate scope.
- **Video** — separate scope (Phase 38E originally).
- **AI agent as a call participant** — Phase 39.
- **Android call-UI parity with iOS CallKit** — explicit NG8. FCM `data` messages can wake the app, but Android lacks a CallKit-equivalent for native in-call UI. Tracked separately if user demand appears.

---

## 14. References

- [voice-video-call-support.md](./voice-video-call-support.md) — Phase 38 design (this phase is the mobile-wiring follow-on)
- [parked-envoygo-full-node-scope.md](./parked-envoygo-full-node-scope.md) — the explicit "home stays in the call path" decision
- [push-notification-config.md](./push-notification-config.md) — existing APNs/FCM setup that 42I extends with a `voip` `tokenType`
- [Phase 38 in implementation-plan.md](./implementation-plan.md#phase-38--real-time-voicevideo-calls) — the foundation phase
- [Phase 31 in implementation-plan.md](./implementation-plan.md#phase-31--flutter-thin-client-envoygo) — EnvoyGo thin-client context
- `apps/social/src/lib/webrtc-call-transport.ts` — desktop reference implementation that 42D mirrors
- `apps/node/src/push-notification.ts` — existing APNs/FCM push module that 42I extends
- `apps/envoygo/lib/providers/call_provider.dart` — existing provider that 42E/42I extend
- `apps/node/src/call-manager.ts` — the home-side state machine
- `apps/node/src/call-inbound.ts` — the home-side trust + identity gate that 42A/42I extend
- `apps/node/src/node-config-store.ts:192` — `iceServers` schema (TURN-compatible already)
