# WAN §4 two-NAT staging runbook (Phase 15B / 15E)

Operator procedure for **full** [wan-connectivity-signoff.md](./wan-connectivity-signoff.md) §4 row `[x]`. Requires **two NAT clients** and a **public relay**.

## Hardware topology

```
[NAT Client A] ──WAN──► [Public relay] ◄──WAN── [NAT Client B]
     │                                              │
  Envoy node                                   Envoy node
  (Tauri or CLI)                               (Tauri or CLI)
```

## Prerequisites

| Item | Notes |
|------|--------|
| Relay | Community relay or self-hosted; note `/ip4/…/tcp/…/p2p/…` multiaddr |
| Two NAT networks | Different upstream routers (home + phone hotspot, or two locations) |
| Same repo commit | Record `git rev-parse HEAD` in sign-off ledger |

## Steps

1. **Bootstrap both nodes** to the relay (Settings → WAN diagnostics or `connectivity:smoke --mode advanced --bootstrap <relay>`).
2. **Verify axes** on each machine: `connectivity-status --rich` — bootstrap, relay, punch, policy lines green or documented.
3. **Run automated relay e2e** (single-host baseline):

   ```bash
   TEST_RELAY_ADDR=/ip4/<relay-host>/tcp/4001/p2p/<relay-id> \
     npm test -- apps/node/test/wan-relay-signoff-e2e.test.ts
   ```

4. **Two-NAT manual §4** (both clients):
   - Node A: note `peerId` from `connectivity-status`
   - Node B: `relay.lookup` or Social WAN diagnostics until B sees A via relay circuit
   - Exchange signed `chat.message` or run `npm test -- apps/node/test/relay-chat-e2e.test.ts` from a machine that can reach the relay
5. **Capture evidence**: audit lines with `relay.checkin`, `p2p.trace`, correlation id; paste into sign-off ledger Notes.
6. **Fill ledger row** in [wan-connectivity-signoff.md](./wan-connectivity-signoff.md):

   ```text
   2026-05-20 | main @ <sha> | NAT A + NAT B + public relay | [x] circuit dial + chat | [~] DCUtR | [~] QUIC | @operator | wan-relay-signoff-e2e + manual two-NAT chat
   ```

## Helper script

From repo root (relay addr required):

```bash
./scripts/wan-relay-signoff-staging.sh /ip4/127.0.0.1/tcp/4001/p2p/12D3KooW...
```

Runs typecheck, relay sign-off e2e, and prints ledger template text.

## CI (optional secret)

Add repository secret `TEST_RELAY_ADDR` to enable automated relay sign-off on PRs. See `.github/workflows/ci-smoke-connectivity.yml` advanced job pattern.
