# Mobile app smoke checklist (Capacitor + `MobileNode`)

Use this before a release or after changing `packages/mobile-node`, `apps/mobile`, or relay wiring.

## Environment

- [ ] Real device or simulator with network access
- [ ] At least one **fleet relay** URL configured (same host your nodes can reach)
- [ ] For shared identity: home node reachable for QR / pairing if testing import

## Boot & connectivity

- [ ] App launches without a blank screen; no unhandled bootstrap throw from SQLite vs SecureStorage mismatch (see `bootstrapMobileApp` identity restore path)
- [ ] `getConnectionStatus()` shows `online: true` after `startNode()`; relay sockets attempted (or relay-only mode still running)
- [ ] If something failed: check optional **`lastError`** / **`lastErrorAt`** on `ConnectionStatus` (mobile node records best-effort transport/parse failures)

## Bond / referral (`bond.challenge` path)

- [ ] From a **second peer**, send a `bond.challenge` addressed to this device’s owner as target
- [ ] This node **auto-sends** `bond.challenge.response` (accept when policy allows; reject when denied or expired)
- [ ] As **challenger**, receiving an **accept** `bond.challenge.response` creates a **direct** trust row + `bond:established` (verify in Contacts / bonds list)

## Bond request / hello queue (`bond.request` path)

- [ ] Inbound **`bond.request`** from a public stranger queues **`hello:request`** in Social; **Accept** creates bond + outbound **`bond.accept`**
- [ ] **Decline** clears the pending row without trust row

## Chat

- [ ] Outbound **`sendChat`** to a bonded owner resolves **`libp2pPeerId`** from trust store or **`peer_directory`** after hello/challenge
- [ ] Inbound **`chat.message`** appears in thread and **`chat:message`** event fires

## DHT topics (browser libp2p)

- [ ] **`advertiseTopic("topic")`** runs without throw when mesh is up
- [ ] **`stopAdvertiseTopic("topic")`** calls DHT **`cancelReprovide`** when the libp2p build exposes it (falls back to local cache remove + warn if not)

## Storage

- [ ] SQLite **`peer_directory.libp2pPeerId`** migration applied on upgrade (Capacitor DB open + `migrateMobileStorageSchema`)
- [ ] Identity restore: pairing / shared identity still loads after kill + relaunch

## Optional: desktop parity spot-checks

- [ ] Same owner can use **desktop Social** and **mobile** with consistent `ownerId` after shared identity import
- [ ] **`forwardEnvelope`** rejects tampered payloads; relay forward path still works for bridge/device flows

---

**Notes**

- **`lastError`** is cleared on each successful **`startNode()`**; it is diagnostic only, not a full audit log.
- Full **owner-in-the-loop** UI for every policy “record” tier is **not** implemented on mobile; challenge accept/reject follows the optimistic mobile policy described in `packages/mobile-node` bond handlers.
