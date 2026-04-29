# Live Connectivity Testing

For the **stages A–D POC** (what each step tests — single reference), see [poc-discovery-connectivity](./poc-discovery-connectivity.md). This page keeps **additional** procedures (desktop smoke, DCUtR notes, data-path checks).

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

## 5. Desktop Distribution And Data-Path Smoke

After building the desktop app for your platform, launch it once with a fresh profile directory and confirm the dashboard loads approvals, trust, vault search, and the chat/task panels without errors.

For a two-machine check of the `/envoymesh/data/0.1.0` path (voucher + chunked file):

1. Exchange `system.signal` between nodes so each peer directory record includes the sender device public key (required for voucher verification).
2. Place a small file under `ENVOYMESH_VAULT` (or `./shared_vault`) on the sender.
3. On the sender, run the node with outbound flags, for example `--data-send <remote-peer-id> --data-relative-path <file-relative-to-vault>`.
4. On the receiver, confirm the file appears under the same relative path in its vault directory and that an inbound audit row references the data transfer.

For `task.cancel` relay fan-out, send `--task-cancel` with `--cancel-forward-peer` (repeatable) and `--cancel-relay-hops` from the developer or packaged CLI, then confirm each listed peer receives a handled cancel and optional downstream relay while hops remain.

## 6. Non-LAN Fallback (WAN-First Profile)

When mDNS is unreliable or unavailable, use `wan-default` profile defaults and bootstrap peers:

```bash
npm run node:dev -- --profile ./data/primary --discovery-profile wan-default --bootstrap-preset public-libp2p --bootstrap "<bootstrap-multiaddr>" --p2p-debug
```

On Windows use a dedicated profile folder, for example **`%USERPROFILE%\envoymesh\win_profile`** (PowerShell: `"$env:USERPROFILE\envoymesh\win_profile"`).

`wan-default` enables DHT client mode, relay transport, AutoNAT, and DCUtR. `--bootstrap-preset public-libp2p` adds a managed public bootstrap set, and `--bootstrap` can append your own peers. If no bootstrap peers are configured, node startup continues but emits a connectivity warning in logs/audit.

For stricter rollout environments, require successful bootstrap probes at startup:

```bash
npm run node:dev -- --profile ./data/primary --discovery-profile wan-default --bootstrap-preset public-libp2p --bootstrap "<bootstrap-multiaddr>" --connectivity-strict
```

With `--connectivity-strict`, startup fails when all bootstrap probes fail.

Inspect connectivity diagnostics:

```bash
npm run cli -w @envoymesh/node -- connectivity-status --profile ./data/primary
```

Expected output includes:

- active discovery profile (`lan-fast` or `wan-default`)
- bootstrap peer count
- discovered peer count
- relay-discovery count
- recent connectivity warnings and checkpoint hints

If discovered peers stay at zero:

1. verify at least one reachable bootstrap peer is configured;
2. check local firewall and NAT restrictions;
3. retry with direct `system.signal` once to seed peer directory mapping;
4. confirm `connectivity-status` warnings clear after configuration fixes.

## Notes

- Use longer timeouts on slow networks, for example `--timeout-ms 120000`.
- Repeat `--bootstrap` to provide multiple bootstrap peers.
- Public bootstrap peers may change or reject unsupported protocols. Prefer a relay/bootstrap peer you control when validating EnvoyMesh releases.
