# QUIC on WAN — validation and degrade paths (Phase 15B / 4F.C)

EnvoyMesh ships additive QUIC transport alongside TCP (`--quic`, `discovery.quic`, `ENVOYMESH_QUIC`). Dial hint sorting prefers `/quic-v1` multiaddrs when both QUIC and TCP paths exist (`sortDialHints` in `@envoymesh/network`).

## What same-machine CI proves

| Test | Location | Proves |
|------|----------|--------|
| QUIC signed ping | `packages/network/test/quic-transport.test.ts` | `system.ping` over QUIC when UDP is allowed |
| Dial hint sorting | `packages/network/test/dial-hint-sorting.test.ts` | QUIC before TCP; loopback filtered first |

## WAN operator validation

On two **wan-default** nodes with QUIC enabled:

1. Confirm profile trace includes `quic=true` in audit `connectivity.profile` or enable via node config.
2. Run `connectivity-status --rich --profile <dir>` on each node after bootstrap succeeds.
3. From a bonded or discovered peer, inspect dial hints — QUIC addrs should sort before TCP when both are advertised.
4. Send signed `system.ping` across NAT (relay circuit or DCUtR direct path).

Record results in [wan-connectivity-signoff.md](./wan-connectivity-signoff.md).

## Expected degrade paths

| Environment | Expected behavior |
|-------------|-------------------|
| **Corporate VPN (UDP blocked)** | TCP + relay circuit remain primary; QUIC dials fail fast; no hang. Prefer-QUIC sorting still safe — TCP fallback used. |
| **Symmetric NAT, no UDP** | Same as VPN case; relay.checkin / relay.lookup / `/p2p-circuit` paths carry traffic. |
| **QUIC disabled** | TCP-only; vitest default; no `/quic-v1` listeners. |
| **Mobile (Capacitor)** | Relay-only WebSocket transport — QUIC N/A on phone; desktop home node may still use QUIC to other desktop peers. |

## Debugging “why not QUIC”

1. Check peer advertised multiaddrs include `/udp/.../quic-v1`.
2. Confirm `enableQuic` on both sides (listener + dial).
3. Review audit `peer.discovery` addrs — if only `/p2p-circuit`, QUIC direct path was never offered.
4. Use `connectivity-status` WAN axes — bootstrap must be `ok` before transport selection matters on cold start.

## Sign-off criterion (Phase 4F.C WAN)

Mark complete when an operator row in [wan-connectivity-signoff.md](./wan-connectivity-signoff.md) notes QUIC prefer-dial attempted on real hardware **or** documents UDP-blocked degrade (VPN case) with successful TCP/relay fallback.
