# Live Connectivity Testing

For the **stages A–D POC** (what each step tests — single reference), see [poc-discovery-connectivity](./poc-discovery-connectivity.md). **Operator bootstrap / relay defaults** (preset names, community relay, org-owned path) are summarized in **[operator-relay-fleet.md](./operator-relay-fleet.md)**.

These checks prove Phase 4 network behavior that cannot be reliably tested in the current runner. Run them on a real machine after disabling VPN/firewall rules that block LAN multicast or inbound TCP.

The smoke script is intentionally opt-in. It is not part of `npm test` because mDNS, DHT, relay, AutoNAT, and DCUtR depend on real network interfaces and peer reachability.

## WAN / relay proving track (overview)

| § | What it proves | Primary command / procedure |
|---|----------------|------------------------------|
| [§1](#1-prove-local-mdns-discovery) | LAN mDNS + signed `system.ping` | `connectivity:smoke --mode mdns` |
| [§2](#2-prove-dht-and-bootstrap-discovery) | DHT + bootstrap stack + ≥1 remote peer | `--mode advanced --bootstrap …` |
| [§3](#3-prove-relay-addressing) | Relay-style `/p2p-circuit` address observed locally | `--expect-relay-address` |
| [§4](#4-prove-envoymesh-relay-address-switching) | **Full** `relay.checkin` / `relay.lookup` / circuit dial (two NAT clients + relay) | Manual multi-machine + `relay-status`, `connectivity-status`, audit `p2p.trace` |
| [§5](#5-prove-dcutr-hole-punching) | DCUtR / punch (needs two NATs + relay) | Procedure notes + same smoke prerequisites |
| [§6](#6-desktop-distribution-and-data-path-smoke) | Desktop / data path | App + voucher smoke |
| [§7](#7-non-lan-fallback-wan-first-profile) | **Shipped defaults:** `wan-default`, `--bootstrap-preset`, strict probes | `node:dev` + `connectivity-status` |

**Completion:** Exit criteria for “WAN proof captured” in [implementation-plan.md](./implementation-plan.md) are satisfied when an operator runs **§2–§4** (as applicable to their topology) on target OSes, captures **`relay.checkin` / `relay.lookup`** success lines from audit (`--include-p2p-trace`), and records date + software version. Cross-NAT **§4.5** is the gold standard for relay-mediated NAT ↔ NAT.

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

## 4. Prove EnvoyMesh Relay Address Switching

Use this procedure for the common non-LAN case where two Windows nodes can reach a **relay** but cannot discover each other directly. The relay runs with **`--relay-server`** (address switcher). Both Windows nodes check in with **`relay.checkin`**, then query with **`relay.lookup`** to learn **`/p2p-circuit`** paths to each other.

Background and failure modes (advertised addresses, signing, libp2p vs Envoy peer ids): [p2p-discovery](./p2p-discovery.md#relay-server-dialable-addresses-for-relaylookup-circuit-paths).

### 4.1 Start the relay (Mac, Linux, or cloud VM)

Use a dedicated profile for the relay. Enable **`--relay-server`** so the node accepts **`relay.checkin`** and answers **`relay.lookup`** from its local roster.

**Same LAN as all clients (typical Mac / home lab):**

```bash
npm run node:dev -- \
  --profile "$HOME/envoymesh/mac_relay" \
  --listen /ip4/0.0.0.0/tcp/4001 \
  --discovery-profile wan-default \
  --relay \
  --relay-server \
  --p2p-debug
```

**Linux service or cloud VM (clients reach you on a public IP or DNS name):** the relay must **advertise** a dialable base address for **`relay.lookup`** circuit paths. Otherwise `getMultiaddrs()` may list only loopback and private VPC IPs (for example `172.16.x.x`), and remote clients can connect to the relay but **cannot** complete `/p2p-circuit/` dials to each other. Set **`--advertise-addr`** to the same TCP port clients use (and open that port in the security group / firewall):

```bash
npm run node:dev -- \
  --profile /var/lib/envoymesh/relay \
  --listen /ip4/0.0.0.0/tcp/4001 \
  --discovery-profile wan-default \
  --relay \
  --relay-server \
  --p2p-debug \
  --advertise-addr /ip4/<YOUR_PUBLIC_IP>/tcp/4001
```

Or DNS:

```bash
  --advertise-addr /dns4/relay.example.com/tcp/4001
```

Or environment:

```bash
export ENVOYMESH_ADVERTISE_ADDRS=/ip4/<YOUR_PUBLIC_IP>/tcp/4001
```

See [p2p-discovery: Relay server dialable addresses](./p2p-discovery.md#relay-server-dialable-addresses-for-relaylookup-circuit-paths) for details.

See [p2p-discovery](./p2p-discovery.md#stable-libp2p-peer-id) for **stable libp2p Peer ID**: the node keeps `<profileDir>/libp2p-private.key` so restarts reuse the same `12D3Koo…` and your bootstrap / `--advertise-addr` lines stay valid.

Copy the printed `Listening on:` multiaddr that ends with `/p2p/<relay-peer-id>`, for example:

```text
/ip4/192.168.1.10/tcp/4001/p2p/12D3KooWMacRelayPeerId
```

For the commands below, replace `<relay-multiaddr>` with a multiaddr **each client can dial** (for cross-network, use public IP/DNS + port, not an unreachable private VPC address).

If the Windows machines are not on the same LAN as the relay, use the relay's reachable IP/DNS address and make sure inbound TCP `4001` is allowed.

### 4.2 Start Windows normal node A

PowerShell:

```powershell
$env:ENVOYMESH_DISCOVERY_PROFILE = "wan-default"
$env:ENVOYMESH_BOOTSTRAP_PEERS = "<relay-multiaddr>"
npm run node:dev -- `
  --profile "$env:USERPROFILE\envoymesh\win_a" `
  --listen /ip4/0.0.0.0/tcp/0 `
  --discovery-profile wan-default `
  --bootstrap "<relay-multiaddr>" `
  --relay `
  --autonat `
  --dcutr `
  --p2p-debug
```

### 4.3 Start Windows normal node B

PowerShell:

```powershell
$env:ENVOYMESH_DISCOVERY_PROFILE = "wan-default"
$env:ENVOYMESH_BOOTSTRAP_PEERS = "<relay-multiaddr>"
npm run node:dev -- `
  --profile "$env:USERPROFILE\envoymesh\win_b" `
  --listen /ip4/0.0.0.0/tcp/0 `
  --discovery-profile wan-default `
  --bootstrap "<relay-multiaddr>" `
  --relay `
  --autonat `
  --dcutr `
  --p2p-debug
```

Keep all three processes running for 30-60 seconds so the periodic check-in and lookup cycles can run.

### 4.4 Confirm both Windows nodes checked in

On the **relay** host:

```bash
npm run cli -w @envoymesh/node -- relay-status --profile "$HOME/envoymesh/mac_relay"
```

Expected output should include:

```text
Relay manager status
roster total=2 fresh=2 stale=0
```

If `roster total=0` or only one peer appears, verify both Windows commands used:

- **`--relay`**
- **`--bootstrap` with a `<relay-multiaddr>` reachable from that Windows host** (LAN IP vs public/DNS + port as appropriate)
- **`ENVOYMESH_BOOTSTRAP_PEERS`** matches if you set it
- the intended **`--profile`** directory
- On **cloud / cross-network relays**, the relay runs with **`--advertise-addr`** (or **`ENVOYMESH_ADVERTISE_ADDRS`**) so **`relay.lookup`** returns circuit paths clients can dial (see [p2p-discovery](./p2p-discovery.md#relay-server-dialable-addresses-for-relaylookup-circuit-paths)).

### 4.5 Confirm relay lookup traces on Windows

On Windows A:

```powershell
npm run cli -w @envoymesh/node -- connectivity-status --profile "$env:USERPROFILE\envoymesh\win_a"
npm run cli -w @envoymesh/node -- audit --profile "$env:USERPROFILE\envoymesh\win_a" --limit 80 --include-p2p-trace
```

On Windows B:

```powershell
npm run cli -w @envoymesh/node -- connectivity-status --profile "$env:USERPROFILE\envoymesh\win_b"
npm run cli -w @envoymesh/node -- audit --profile "$env:USERPROFILE\envoymesh\win_b" --limit 80 --include-p2p-trace
```

Expected traces include:

```text
relay.checkin.ok
relay.lookup.ok
relay.lookup.response
relay lookup candidate dial ok
```

You should also see discovered or persisted relay peer candidates that contain `/p2p-circuit/p2p/<other-windows-peer-id>`.

### 4.6 Optional: use the discovery dashboard command on Windows

If you want a live terminal dashboard instead of the full node command, run `discovery-dashboard.ts` from `apps/node`. It now uses the current EnvoyMesh relay control flow: periodic `relay.checkin` plus periodic `relay.lookup`.

PowerShell for Windows B:

```powershell
$env:ENVOYMESH_DISCOVERY_PROFILE = "wan-default"
$env:ENVOYMESH_BOOTSTRAP_PEERS = "<relay-multiaddr>"
npx tsx src/discovery-dashboard.ts `
  --profile "$env:USERPROFILE\envoymesh\win_b" `
  --no-mdns `
  --auto-relay-peers-query
```

PowerShell one-line form:

```powershell
$env:ENVOYMESH_DISCOVERY_PROFILE="wan-default";$env:ENVOYMESH_BOOTSTRAP_PEERS="<relay-multiaddr>"; npx tsx src/discovery-dashboard.ts --profile "$env:USERPROFILE\envoymesh\win_b" --no-mdns --auto-relay-peers-query
```

Expected dashboard **Relay API** line includes successful sends and responses (names may vary slightly by build):

```text
lookupOk>0 responses>0 candidates>0 dialOk>0   # ideal
```

If **`lookupOk>0`** but **`responses` stays `0`**, the relay accepted lookups but the client never received a **`relay.lookup.response`** (confirm relay runs a build that replies on the **libp2p `remotePeerId`**, not the Envoy `senderPeerId`).

If **`responses>0`** and **`candidates>0`** but **`dialFail`** climbs, inspect circuit multiaddrs: cloud relays usually need **`--advertise-addr`** / **`ENVOYMESH_ADVERTISE_ADDRS`** so bases are **public or DNS**, not only VPC-private **`getMultiaddrs()`** values.

If **`checkinFail`** or **`lookupFail`** increase, check relay logs for **`invalid signature`**: envelopes must use **`senderPeerId: derivePeerId(devicePublicKeyPem)`**, not **`mesh.peerId`**. See [p2p-discovery](./p2p-discovery.md#envoy-logical-peer-id-vs-libp2p-peer-id-signing-and-delivery).

If the roster on the relay is healthy but responses stay zero, verify both Windows clients use the **same reachable `<relay-multiaddr>`** and **`--auto-relay-peers-query`** (dashboard) or the full node’s relay client timers.

### 4.7 Optional: inspect relay state in **Social** + CLI

On the **relay** machine (node already running for the relay profile), open the UI:

```bash
npm run social:dev
```

Use Social for high-level visibility; use **`relay-status`** and audit/trace flags on the CLI for definitive relay roster and snapshots.

### 4.8 Troubleshooting this scenario

If both Windows nodes only see the **relay** at the libp2p layer and not each other:

1. **`relay-status` on the relay** — confirm **`roster total≥2`** and entries are fresh. If not, clients are not **`relay.checkin`** successfully: **`--relay`**, bootstrap multiaddr, profile path, and reachability.
2. **`invalid signature`** on the relay for **`relay.checkin`** / **`relay.lookup`** — tooling must sign with the device key and set **`senderPeerId`** to **`derivePeerId(devicePublicKeyPem)`**, not **`mesh.peerId`**. See [p2p-discovery](./p2p-discovery.md#envoy-logical-peer-id-vs-libp2p-peer-id-signing-and-delivery).
3. **Roster OK but no `relay.lookup.response` on clients** — use a relay build that sends control replies with **`mesh.send(<libp2p-remote-peer-id>, …)`** (connection peer), not the Envoy logical id.
4. **Responses arrive but `relay lookup candidate dial fail`** — circuit multiaddrs probably use **unreachable** relay bases (loopback or VPC-only IP). On the relay, set **`--advertise-addr`** / **`ENVOYMESH_ADVERTISE_ADDRS`** to the **public or DNS** address and port clients use. See [p2p-discovery: Relay server dialable addresses](./p2p-discovery.md#relay-server-dialable-addresses-for-relaylookup-circuit-paths).
5. **Dynamic listen ports** — if the relay used ephemeral ports, recopy the current **`Listening on:`** multiaddr after every restart (fixed **`--listen …/tcp/4001`** is easier).

## 5. Prove DCUtR Hole Punching

DCUtR needs two peers behind NAT plus a reachable relay. The practical proof is:

1. Start a reachable relay-capable peer or use a trusted relay multiaddr.
2. Run EnvoyMesh node A from network A with `--relay --autonat --dcutr --bootstrap <relay>`.
3. Run EnvoyMesh node B from network B with the same flags.
4. Send a signed ping from one node to the other's observed multiaddr.

The smoke script verifies that the local advanced stack starts correctly and can discover peers. A dedicated two-machine DCUtR proof should be added once we have a stable relay peer to target.

## 6. Desktop Distribution And Data-Path Smoke

After building the desktop app for your platform, launch it once with a fresh profile directory and confirm the dashboard loads approvals, trust, vault search, and the chat/task panels without errors.

For a two-machine check of the `/envoymesh/data/0.1.0` path (voucher + chunked file):

1. Exchange `system.signal` between nodes so each peer directory record includes the sender device public key (required for voucher verification).
2. Place a small file under `ENVOYMESH_VAULT` (or `./shared_vault`) on the sender.
3. On the sender, run the node with outbound flags, for example `--data-send <remote-peer-id> --data-relative-path <file-relative-to-vault>`.
4. On the receiver, confirm the file appears under the same relative path in its vault directory and that an inbound audit row references the data transfer.

For `task.cancel` relay fan-out, send `--task-cancel` with `--cancel-forward-peer` (repeatable) and `--cancel-relay-hops` from the developer or packaged CLI, then confirm each listed peer receives a handled cancel and optional downstream relay while hops remain.

## 7. Non-LAN Fallback (WAN-First Profile)

When mDNS is unreliable or unavailable, use `wan-default` profile defaults and bootstrap peers:

```bash
npm run node:dev -- --profile ./data/primary --discovery-profile wan-default --bootstrap-preset public-libp2p --bootstrap "<bootstrap-multiaddr>" --p2p-debug
```

On Windows use a dedicated profile folder, for example **`%USERPROFILE%\envoymesh\win_profile`** (PowerShell: `"$env:USERPROFILE\envoymesh\win_profile"`).

`wan-default` enables DHT client mode, relay transport, AutoNAT, and DCUtR. `--bootstrap-preset public-libp2p` adds the managed public preset set (see **[operator-relay-fleet.md](./operator-relay-fleet.md)** for all shipped preset ids and the **`cn-relay`** community relay), and `--bootstrap` can append your own peers. If no bootstrap peers are configured, node startup continues but emits a connectivity warning in logs/audit.

For stricter rollout environments, require successful bootstrap probes at startup:

```bash
npm run node:dev -- --profile ./data/primary --discovery-profile wan-default --bootstrap-preset public-libp2p --bootstrap "<bootstrap-multiaddr>" --connectivity-strict
```

With `--connectivity-strict`, startup fails when all bootstrap probes fail.

Inspect connectivity diagnostics:

```bash
npm run cli -w @envoymesh/node -- connectivity-status --profile ./data/primary
```

The command prints **persisted `node-config.json` discovery fields** (profile, `bootstrapPresets`, explicit bootstrap peer count, relay flags) when the file exists, then audit-derived counts (same source the node uses for traces). Expected output includes:

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
