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
6. **Fill ledger row** in [wan-connectivity-signoff.md](./wan-connectivity-signoff.md) — or copy from Social Settings → WAN diagnostics → **Copy physical two-NAT sign-off evidence**, or CLI:

   ```bash
   npm run cli -w @envoymesh/node -- connectivity-signoff --physical-two-nat --relay-addr /ip4/…/tcp/4001/p2p/…
   ```

   ```text
   2026-05-20 | main @ <sha> | NAT A + NAT B + public relay | [x] circuit dial + chat | [~] DCUtR | [~] QUIC | @operator | wan-relay-signoff-e2e + manual two-NAT chat
   ```

## Helper scripts

From repo root (relay addr required):

```bash
./scripts/wan-relay-signoff-staging.sh /ip4/127.0.0.1/tcp/4001/p2p/12D3KooW...
```

Runs typecheck, relay sign-off e2e, and prints ledger template text.

**Physical two-NAT operator flow** (automated baseline + checklist + optional completed ledger row):

```bash
WAN_SIGNOFF_COMPLETE=1 \
WAN_SIGNOFF_AUTOMATED_OK=1 \
WAN_SIGNOFF_CHAT_VERIFIED=1 \
WAN_NAT_A_PEER=12D3A... \
WAN_NAT_B_PEER=12D3B... \
WAN_SIGNOFF_OPERATOR=@you \
./scripts/wan-two-nat-signoff.sh /ip4/<relay-host>/tcp/4001/p2p/<relay-id>
```

Or print checklist only:

```bash
npm run cli -w @envoymesh/node -- connectivity-signoff --physical-two-nat --checklist \
  --relay-addr /ip4/…/tcp/4001/p2p/…
```

Social Settings → **Physical two-NAT sign-off** mirrors the same checklist with local progress + copy buttons.

## CI (optional secret)

Add repository secret `TEST_RELAY_ADDR` to enable automated relay sign-off on PRs. See `.github/workflows/ci-smoke-connectivity.yml` advanced job pattern.
