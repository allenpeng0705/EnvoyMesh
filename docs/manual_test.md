# Manual testing — WebRTC voice calls & agent network

Operator guide for verifying voice calls and agent-network chains on **real hardware**. Automated E2E tests cover libp2p signaling and UI surfaces; **audio and cross-NAT media** still require manual runs (Phase 38H / 42J).

Related docs:

- [voice-video-call-support.md](./voice-video-call-support.md) — call design
- [agent_network.md](./agent_network.md) — chain design
- [live-connectivity-testing.md](./live-connectivity-testing.md) — relay / WAN connectivity
- [wan-two-nat-staging-runbook.md](./wan-two-nat-staging-runbook.md) — two NAT clients + relay

---

## Automated E2E (run before manual smoke)

From repo root:

```bash
# WebRTC signaling over real libp2p (two in-process homes)
npm run test:e2e:call-two-home

# Agent network: orchestrator + two worker homes
npm run test:e2e:chain-three-home

# Playwright call UI + useCallSession hook
npm run test:e2e:webrtc

# Broad bundle (long — includes the above)
npm run smoke:local
```

Individual suites:

```bash
npx vitest run apps/node/test/call-two-home-e2e.test.ts
npx vitest run apps/node/test/chain-two-home-smoke.test.ts
npx vitest run apps/node/test/chain-three-home-smoke.test.ts
npx vitest run apps/node/test/webrtc-call-e2e.test.ts
npx vitest run apps/node/test/call-*.test.ts apps/social/test/hooks/useCallSession.test.ts
```

Relay-backed agent tests (optional, needs live relay):

```bash
TEST_RELAY_ADDR=/ip4/<host>/tcp/4001/p2p/<peer-id> \
  npx vitest run apps/node/test/agent-e2e-real.test.ts
```

---

## Prerequisites

1. Build once: `npx tsc -b packages/protocol packages/api apps/node apps/social`
2. Each participant needs a **separate profile directory** (separate owner identity).
3. Peers must be **bonded** (`direct` or `referred` trust) before calls or chains.
4. For cross-network calls, configure **TURN** on both homes: Social → Settings → Network → TURN servers.

---

## Two-node manual setup (WebRTC)

Best layout: **two machines on the same LAN** (Path 1 direct, Path 2 fallback after ~5s if media does not connect).

### Machine A (caller)

```bash
ENVOYMESH_PROFILE=./data/alice npm run node:dev
# separate terminal
npm run social:dev
```

Open `http://localhost:5173`, connect WS to `ws://localhost:3030/ws` (default).

### Machine B (callee)

```bash
ENVOYMESH_PROFILE=./data/bob npm run node:dev
npm run social:dev   # use a different machine, or another browser profile pointing at B's IP
```

On B's browser, set WS URL to `ws://<machine-b-lan-ip>:3030/ws`.

### Bond A ↔ B

Use Trust mode intro, QR pairing, or fleet invite — any flow that establishes bonded trust on **both** sides.

### WebRTC checklist

| Step | Action | Pass criteria |
|------|--------|---------------|
| 1 | A opens chat with B, taps **phone** icon | B sees incoming-call modal |
| 2 | B **Accept** | Both show active-call panel |
| 3 | Speak on both sides | Audible two-way audio |
| 4 | A toggles **mute** | Local mute; remote may see mute state |
| 5 | Either party **End call** | Both return to idle |
| 6 | B in another call; A calls again | Busy / rejected |
| 7 | Outbound call while ringing | Caller sees **Calling…** banner; cancel works |
| 8 | Callee with no microphone (Windows listen-only) | Accept succeeds; dock shows **No microphone — listen only** |
| 9 | Same LAN, wait ≥5s without Path 1 media | Caller falls back via `call.reinvite`; call still completes on Path 2 |
| 10 | A on Wi‑Fi, B on mobile hotspot + TURN configured | Audio via ICE/TURN (Path 2) |

### Mac ↔ Windows cross-platform audio (release smoke)

Use this when validating desktop Social on **macOS (caller)** and **Windows (callee)** over the internet or LAN. Rebuild Social on **both** sides after any call-related change (`npm run social:build` or restart dev server).

**Setup**

| Machine | Role | Notes |
|---------|------|-------|
| Mac | Caller (has mic) | Home node + Social UI |
| Windows | Callee (may have no mic) | Separate profile; bonded to Mac |

1. Bond Mac ↔ Windows (Trust intro or QR).
2. Confirm chat works both directions before calling.
3. On both homes: Settings → Network → add **STUN** (default) and **TURN** if either side is behind symmetric NAT.

**Checklist**

| Step | Action | Pass criteria |
|------|--------|---------------|
| 1 | Mac opens chat, taps **phone** | Mac shows **Calling {name}…** banner; Windows shows incoming overlay |
| 2 | Windows **Accept** | Both show active-call dock (not just signaling) |
| 3 | Wait for **Connected** on both docks | May take 5–20s cross-NAT; do not hang up early |
| 4 | Mac speaks | Windows hears audio on speakers |
| 5 | Windows speaks (if mic present) | Mac hears audio |
| 6 | Windows without mic | Accept still works; dock shows listen-only hint; Mac audio still audible on Windows |
| 7 | Mac **End call** | Both return to idle |
| 8 | Windows calls Mac (reverse direction) | Same pass criteria |

**Browser console traces (DevTools → Console, filter `webrtc-call`)**

| Trace | Meaning |
|-------|---------|
| `ui:invite-sent` | Outbound signaling left Mac |
| `transport:remote-track` | Remote audio track received |
| `ui:remote-audio-play` | `<audio>` playback started |
| `ui:remote-audio-play-failed` | Autoplay blocked — click page once and retry |
| `transport:ice-candidate-added` | ICE trickle working |

**If signaling works but no audio**

1. Confirm both UIs show **Connected** (not stuck on Connecting).
2. Add **TURN** on both nodes and retry.
3. Check Windows mic permission only if Windows should speak; listen-only is OK for one-way verify.
4. Capture `[webrtc-call]` logs from both browsers + `[sendCallInvite]` from both home nodes.

Automated coverage (no real audio): `npm run test:e2e:webrtc` — includes Playwright tests for **Calling…** banner and listen-only active dock when `getUserMedia` fails (`webrtc-call-e2e.test.ts` tests 8–9), plus **video call UI** (tests 10–13: incoming video modal, video dock, outbound `callType`, camera-denied hint).

### Mac ↔ Windows cross-platform video (release smoke)

Same setup as audio smoke above. Use the **camera icon** (not the phone icon) in the chat header.

| Step | Action | Pass criteria |
|------|--------|---------------|
| 1 | Mac opens chat, taps **video camera** | Mac shows **Calling {name}…**; Windows shows **Incoming video call** |
| 2 | Windows **Accept** | Both show video active dock (`.active-call-panel--video`) |
| 3 | Wait for **Connected** | Remote video visible; local PiP preview on side with camera |
| 4 | Mac speaks | Windows hears audio |
| 5 | Windows without camera | Accept works; dock shows **No camera — audio only**; Mac video still visible on Windows if Windows receives remote track |
| 6 | Either party **End call** | Both return to idle |
| 7 | Windows starts video call to Mac | Same pass criteria (reverse direction) |

**Traces:** filter `webrtc-call` for `ui:start-call` with `callType:"video"`, `transport:remote-track` with `kind:"video"`.

### EnvoyGo (mobile)

Pair EnvoyGo to one home, place call to/from desktop Social. Verify CallKit ring, accept, audio, hangup. See [voice-video-call-envoygo.md](./voice-video-call-envoygo.md).

### Debugging

- Home logs: `[call-inbound]`, `[sendCallInvite]`, `[sendCallReinvite]`
- Browser devtools → WS events: `call:incoming`, `call:reinvite`, `call:answered`, `call:ice-candidate`
- Signaling OK but no audio: mic permission, remote `<audio>` element, TURN credentials

---

## Two-node manual setup (agent network)

**Topology:** Home A = orchestrator, Home B = worker.

### Setup

1. Start two nodes with separate profiles (as above).
2. Bond A ↔ B.
3. On **B**: Settings → enable **Capability provider**; ensure agent card lists `task.execute` / `research.web`.
4. On **A**: open **Chains** or chat → **Run as chain**; refresh capability index if workers do not appear.

### Chain checklist

| Step | Action | Pass criteria |
|------|--------|---------------|
| 1 | A starts goal e.g. “summarize the Q3 report” | Plan preview shows subtasks |
| 2 | Launch chain | B receives propose; bid appears on A |
| 3 | Evaluate bids (or wait for auto-evaluate) | Subtask awarded to B |
| 4 | Wait for execution | Partials / progress in Chains UI |
| 5 | Chain completes | Report published; visible in Chains + Recent chains (EnvoyGo read-only) |

Automated equivalent: `npx vitest run apps/node/test/chain-two-home-smoke.test.ts`

---

## Three-node manual setup (agent network)

**Topology:**

```
        [Orchestrator A]
         /            \
   [Worker B]    [Worker C]
```

1. Three profiles on three machines (or two machines + VM).
2. Bond A↔B and A↔C (workers need not bond to each other).
3. Enable capability provider on **both** B and C.
4. Launch a chain from A; confirm **two bids** before evaluate.
5. Confirm chain completes to a single merged report.

Automated equivalent: `npm run test:e2e:chain-three-home`

---

## Three-node WAN / relay (optional)

When LAN discovery is unavailable, bootstrap both nodes to a public relay and follow [wan-two-nat-staging-runbook.md](./wan-two-nat-staging-runbook.md).

Quick relay chat proof:

```bash
TEST_RELAY_ADDR=/ip4/<relay>/tcp/4001/p2p/<id> \
  npx vitest run apps/node/test/relay-chat-e2e.test.ts
```

Multi-machine operator checklist:

```bash
npm run smoke:multimachine:guide
```

---

## Sign-off template

Record date, `git rev-parse HEAD`, topology, and results:

```text
Date: YYYY-MM-DD
Commit: <sha>
Topology: 2× LAN desktop | 2× NAT + relay | orchestrator + 2 workers
WebRTC: incoming / accept / audio / mute / hangup / Path2 fallback — PASS/FAIL
Chains: bid → award → report — PASS/FAIL
Notes: ...
```

---

## Known gaps (automated vs manual)

| Area | Automated today | Manual still required |
|------|-----------------|----------------------|
| Call signaling (libp2p) | `call-two-home-e2e.test.ts` | — |
| Call UI (Playwright) | `webrtc-call-e2e.test.ts` (audio + video: tests 10–13) | Real browser + two homes |
| WebRTC media / audio | Hook + transport unit tests | Two devices, mic + speakers |
| WebRTC video | Playwright video UI + signaling E2E (`call-signaling-video-e2e`) | Two devices, camera + display |
| Path 2 cross-NAT + TURN | ICE injection tests | Hotspot + TURN server |
| Chains (2 homes) | `chain-two-home-smoke.test.ts` | — |
| Chains (3 homes) | `chain-three-home-smoke.test.ts` | Optional live 3-machine run |
| EnvoyGo native calls | Flutter unit tests | Two iOS devices (42J) |
