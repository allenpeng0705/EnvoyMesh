# Live Connectivity Testing

These checks prove the Phase 4 network behavior that cannot be reliably tested in the current runner. Run them on a real machine after disabling VPN/firewall rules that block LAN multicast or inbound TCP.

The smoke script is intentionally opt-in. It is not part of `npm test` because mDNS, DHT, relay, AutoNAT, and DCUtR depend on real network interfaces and peer reachability.

## 1. Prove Local mDNS Discovery

Run:

```bash
npm run connectivity:smoke -w @envoymesh/node -- --mode mdns --timeout-ms 20000
```

This starts two EnvoyMesh nodes on the same host with mDNS enabled. Success means both nodes discover each other and then exchange a signed `system.ping`.

Expected success line:

```text
[mdns] success: both local nodes discovered each other and exchanged a signed ping
```

If this fails, check that VPN is off, local network permissions are allowed, multicast DNS is not blocked, and the machine can bind to `0.0.0.0`.

## 2. Prove DHT And Bootstrap Discovery

Run advanced mode with at least one reachable libp2p bootstrap peer:

```bash
npm run connectivity:smoke -w @envoymesh/node -- --mode advanced --bootstrap "<bootstrap-multiaddr>" --timeout-ms 60000
```

This starts one EnvoyMesh node with bootstrap discovery, DHT client mode, relay transport, AutoNAT, and DCUtR enabled. Success means the node starts the advanced stack and discovers at least one real peer.

Expected success line:

```text
[advanced] success: advanced connectivity stack started and discovered at least one peer
```

## 3. Prove Relay Addressing

Use a bootstrap or relay peer that supports Circuit Relay v2, then require a relayed address:

```bash
npm run connectivity:smoke -w @envoymesh/node -- --mode advanced --bootstrap "<relay-multiaddr>" --expect-relay-address --timeout-ms 90000
```

Expected success line:

```text
[advanced] success: relay address observed
```

This proves the local node observed a `/p2p-circuit` relay address. It does not by itself prove end-to-end relay dialing from another network; that should be tested next with two machines.

## 4. Prove DCUtR Hole Punching

DCUtR needs two peers behind NAT plus a reachable relay. The practical proof is:

1. Start a reachable relay-capable peer or use a trusted relay multiaddr.
2. Run EnvoyMesh node A from network A with `--relay --autonat --dcutr --bootstrap <relay>`.
3. Run EnvoyMesh node B from network B with the same flags.
4. Send a signed ping from one node to the other's observed multiaddr.

The smoke script verifies that the local advanced stack starts correctly and can discover peers. A dedicated two-machine DCUtR proof should be added once we have a stable relay peer to target.

## Notes

- Use longer timeouts on slow networks, for example `--timeout-ms 120000`.
- Repeat `--bootstrap` to provide multiple bootstrap peers.
- Public bootstrap peers may change or reject unsupported protocols. Prefer a relay/bootstrap peer you control when validating EnvoyMesh releases.
