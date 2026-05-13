# Phase 10A.7 — Manual end-to-end checklist

Use this when validating the **HomeClawApp** thin P2P client against a real **EnvoyMesh home node** on a LAN. It complements automated tests (`vitest`, `flutter test`) and golden fixtures.

## Preconditions

- EnvoyMesh repo builds: `npm install && npm run typecheck`.
- Home node and (if applicable) **HomeClaw Core** run on a machine reachable from the phone/emulator **without tunneling** for LAN scenarios.
- Phone/emulator and home PC are on the **same subnet** (or use a path you intentionally test, e.g. VPN).
- Optional: note the home machine’s LAN IP for debugging WebSocket URLs.

## 1. Start the stack

1. Start EnvoyMesh node with WebSocket server enabled (default dev profile is fine unless you need bridge).
2. If testing the bridge agent: enable bridge in node config and confirm **HomeClaw Core** (or your bridge target) is listening where the node expects.
3. Open **Social → Settings → Node** and confirm the pairing QR renders (`envoy://pair?...`).

## 2. Pairing

1. Open HomeClawApp’s Envoy pairing / scan screen.
2. Scan the QR (or paste **Copy URI** from Social).
3. Confirm the app saves `wsUrl`, `relayPeerId`, and optional `agentPeerId` / `agentPubKey` (Settings may show the saved URL).
4. **Optional auto-accept path:** on the node, set `companionPairingAutoAcceptWithToken` so that when the QR **`token`** is sent as `pairingToken` on `device.pair.request`, the home node grants direct trust without the approval queue. Without this, complete owner approval in Social/approval flow as designed.

## 3. WebSocket and bridge

1. After connect, confirm **`getBridgeStatus`** (or UI that reflects it) shows bridge state you expect.
2. Confirm **Friend list** loads P2P contacts (`fetchP2PContacts` path); bridge agent should appear when bridge is enabled and bonded.

## 4. Chat round-trip

1. Open chat with the bridge agent (or a bonded P2P contact).
2. Send a short `chat.message` and confirm a reply within a few seconds on LAN.
3. Put the app in background and return; confirm history still shows messages (Hive / store path).

## 5. Resilience

1. Kill and restart only the **node process**; confirm the app reconnects or surfaces error state, then recovers after restart (see `RelayClient` backoff — optional: watch logs for delay steps 500 ms, 1 s, … up to cap).
2. Toggle airplane mode briefly on device; confirm reconnect or clear error when back online.

## 6. Record results

Capture: node version / commit, app version, LAN vs emulator, whether bridge was on, and any protocol or approval anomalies. File issues with **correlation IDs** from audit logs when possible.
