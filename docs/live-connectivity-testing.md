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

## 4. Prove EnvoyMesh Relay Address Switching

Use this procedure for the common non-LAN case where two Windows nodes can discover a Mac relay but cannot discover each other directly. The Mac runs as a relay server and address switcher. Both Windows nodes check in with `relay.checkin`, then query the relay with `relay.lookup` to learn `/p2p-circuit` addresses for each other.

### 4.1 Start the Mac relay

On the Mac:

```bash
npm run node:dev -- \
  --profile "$HOME/envoymesh/mac_relay" \
  --listen /ip4/0.0.0.0/tcp/4001 \
  --discovery-profile wan-default \
  --relay \
  --relay-server \
  --p2p-debug
```

Copy the printed `Listening on:` multiaddr that ends with `/p2p/<mac-peer-id>`, for example:

```text
/ip4/192.168.1.10/tcp/4001/p2p/12D3KooWMacRelayPeerId
```

For the commands below, replace `<mac-relay-multiaddr>` with that full multiaddr. If the Windows machines are not on the same LAN as the Mac, use the Mac's reachable IP/DNS address and make sure inbound TCP `4001` is allowed.

### 4.2 Start Windows normal node A

PowerShell:

```powershell
$env:ENVOYMESH_DISCOVERY_PROFILE = "wan-default"
$env:ENVOYMESH_BOOTSTRAP_PEERS = "<mac-relay-multiaddr>"
npm run node:dev -- `
  --profile "$env:USERPROFILE\envoymesh\win_a" `
  --listen /ip4/0.0.0.0/tcp/0 `
  --discovery-profile wan-default `
  --bootstrap "<mac-relay-multiaddr>" `
  --relay `
  --autonat `
  --dcutr `
  --p2p-debug
```

### 4.3 Start Windows normal node B

PowerShell:

```powershell
$env:ENVOYMESH_DISCOVERY_PROFILE = "wan-default"
$env:ENVOYMESH_BOOTSTRAP_PEERS = "<mac-relay-multiaddr>"
npm run node:dev -- `
  --profile "$env:USERPROFILE\envoymesh\win_b" `
  --listen /ip4/0.0.0.0/tcp/0 `
  --discovery-profile wan-default `
  --bootstrap "<mac-relay-multiaddr>" `
  --relay `
  --autonat `
  --dcutr `
  --p2p-debug
```

Keep all three processes running for 30-60 seconds so the periodic check-in and lookup cycles can run.

### 4.4 Confirm both Windows nodes checked in

On the Mac:

```bash
npm run cli -w @envoymesh/node -- relay-status --profile "$HOME/envoymesh/mac_relay"
```

Expected output should include:

```text
Relay manager status
roster total=2 fresh=2 stale=0
```

If `roster total=0` or only one peer appears, verify both Windows commands used:

- `--relay`
- `--bootstrap "<mac-relay-multiaddr>"`
- the intended profile directory
- a Mac relay multiaddr reachable from both Windows machines

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

### 4.6 Optional: open the Mac Relay Manager dashboard

On the Mac:

```bash
ENVOYMESH_PROFILE="$HOME/envoymesh/mac_relay" \
ENVOYMESH_VAULT="$PWD/shared_vault" \
npm run desktop:dev
```

Open the Relay Manager panel and confirm:

- roster peers: `2`
- relay neighbors/summaries as available
- recent relay traces for check-in, lookup, and manager snapshots

### 4.7 Troubleshooting this scenario

If both Windows nodes discover the Mac but not each other:

1. Run `relay-status` on the Mac and confirm the roster has both Windows nodes fresh.
2. If the roster is empty, the Windows nodes are not sending `relay.checkin`; check `--relay`, bootstrap address, profile paths, and Mac reachability.
3. If the roster has both nodes but Windows audit has no `relay.lookup.response`, check that the Windows processes stayed alive long enough for lookup cycles.
4. If lookup responses exist but dial fails, inspect the returned `/p2p-circuit` multiaddr and confirm the Mac relay process is still running and reachable.
5. If using dynamic Mac ports, recopy the latest `Listening on:` multiaddr after every Mac relay restart.

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
