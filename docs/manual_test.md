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
| 7 | Same LAN, wait ≥5s without Path 1 media | Caller falls back via `call.reinvite`; call still completes on Path 2 |
| 8 | A on Wi‑Fi, B on mobile hotspot + TURN configured | Audio via ICE/TURN (Path 2) |

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
| Call UI (Playwright) | `webrtc-call-e2e.test.ts` (mock WS) | Real browser + two homes |
| WebRTC media / audio | Hook unit tests only | Two devices, mic + speakers |
| Path 2 cross-NAT + TURN | ICE injection tests | Hotspot + TURN server |
| Chains (2 homes) | `chain-two-home-smoke.test.ts` | — |
| Chains (3 homes) | `chain-three-home-smoke.test.ts` | Optional live 3-machine run |
| EnvoyGo native calls | Flutter unit tests | Two iOS devices (42J) |
