# WAN connectivity sign-off (Phase 15B)

Operators capture **live multi-machine** relay / DCUtR / QUIC proof per [live-connectivity-testing.md](./live-connectivity-testing.md) §4–§5 and [quic-wan-validation.md](./quic-wan-validation.md). CI runs **single-host** mDNS + optional advanced bootstrap smoke; this document is the **release sign-off ledger** for cross-NAT validation.

## Sign-off checklist

Complete on target OSes before marking Phase 15B exit criteria done:

| Step | Procedure | Evidence |
|------|-----------|----------|
| 1 | §2 DHT/bootstrap — `connectivity:smoke --mode advanced --bootstrap …` | CI log or local success line |
| 2 | §4 Two NAT clients + relay — `relay.checkin` / `relay.lookup` / circuit dial | Audit `p2p.trace` + `connectivity-status` output |
| 3 | §5 DCUtR (optional) — two NATs + relay, signed ping across punch | Manual notes + audit correlation id |
| 4 | QUIC WAN (optional) — prefer-QUIC dial or VPN UDP-blocked degrade | Notes per [quic-wan-validation.md](./quic-wan-validation.md) |
| 5 | WAN axes — Social Settings → **Run WAN diagnostics** or CLI `connectivity-status` | bootstrap/relay/punch/policy lines |
| 6 | Record software version + date below | This table updated |

## Sign-off ledger

| Date | Version / commit | Topology | §4 relay | §5 DCUtR | QUIC WAN | Operator | Notes |
|------|------------------|----------|----------|----------|----------|----------|-------|
| 2026-05-20 | main @ `5e2cbc3` | macOS dev (192.168.x LAN) + cn-relay bootstrap `47.93.11.212` | `[~]` §2 advanced stack + bootstrap peer; full §4 two-NAT `relay.checkin`/`relay.lookup` circuit dial pending staging | `[~]` not tested | `[~]` TCP default; QUIC prefer-dial unit-tested ([quic-wan-validation.md](./quic-wan-validation.md)) | EnvoyMesh maintainer | `connectivity:smoke --mode advanced --bootstrap /ip4/47.93.11.212/tcp/4001/p2p/12D3KooW…` success on operator Mac; WAN axes tooling + join-invite RPC shipped; CI `ci-smoke-connectivity.yml` advanced job green |
| 2026-05-20 | main (15E) | Automated relay-bootstrap e2e | `[~]` `wan-relay-signoff-e2e.test.ts` passes when `TEST_RELAY_ADDR` set; not two-NAT staging | — | — | CI / operator | Complements `relay-chat-e2e.test.ts`; full §4 still requires two NAT clients + operator row `[x]` |
| 2026-05-27 | main @ `5e2cbc3` | macOS dev — 2× relay-bootstrap clients via cn-relay `47.93.11.212` | `[x]` §4 automated baseline — `wan-relay-signoff-e2e` green (`./scripts/wan-relay-signoff-staging.sh …`) | `[~]` not tested | `[~]` TCP default | EnvoyMesh maintainer | Signed `chat.message` across relay-bootstrap dial; **physical** two-NAT LANs (separate home routers) remain optional operator row |
| _pending_ | _release tag_ | **Physical two-NAT** — NAT Client A + NAT Client B on separate home routers + public relay | `[ ]` manual §4 per [wan-two-nat-staging-runbook.md](./wan-two-nat-staging-runbook.md) | `[ ]` optional | `[ ]` optional | _operator_ | Fill when two real NAT networks complete circuit dial + signed chat; automated baseline alone does not satisfy this row |

**Template row (fill when complete):**

```text
2026-05-20 | tauri-v0.x / abc1234 | Mac relay + 2× Windows NAT | [x] relay.lookup circuit dial | [~] not tested | [~] TCP fallback on VPN | @you | connectivity-status WAN axes all ok; audit includes p2p.trace relay.checkin
```

## Automated helpers (Phase 15B)

| Surface | What it shows |
|---------|----------------|
| CLI `connectivity-status --rich` | Stage D panel + **WAN connectivity axes** (bootstrap, relay, punch, policy) |
| Social Settings → WAN connectivity diagnostics | Same axes + sign-off checklist links |
| `createWanJoinInvite` / `applyWanJoinInvite` | Cold-start bootstrap without manual multiaddr paste |

Multi-machine §4–§5 remains **operator-driven** until a stable public relay fleet is available for automated cross-NAT CI. **Automated baseline:** `apps/node/test/wan-relay-signoff-e2e.test.ts` (skipped without `TEST_RELAY_ADDR`). **Staging procedure:** [wan-two-nat-staging-runbook.md](./wan-two-nat-staging-runbook.md) + `./scripts/wan-relay-signoff-staging.sh`.

## CI signal (automated)

| Workflow | Command | Proves |
|----------|---------|--------|
| `ci-smoke-connectivity.yml` | `connectivity:smoke --mode mdns` | LAN mDNS + signed ping (§1) |
| `ci-smoke-connectivity.yml` (advanced job) | `connectivity:smoke --mode advanced --bootstrap <community-relay>` | Advanced stack + ≥1 peer (§2 baseline) |
