# EnvoyMesh QuickStart

This guide shows how to install, build, verify, run the node, use the CLI, validate relay discovery, and launch the desktop dashboard.

Requirements narrative: [docs/UserStory.md](docs/UserStory.md). Scenario backlog: [docs/scenarios.md](docs/scenarios.md). Design vs code: [docs/alignment-review.md](docs/alignment-review.md).

## Requirements

- macOS, Linux, or Windows with a recent terminal.
- Node.js 22+ recommended.
- npm, included with Node.js.

## Install

From the repository root:

```bash
npm install
```

## Build And Verify

Run the TypeScript build check:

```bash
npm run typecheck
```

Run the test suite:

```bash
npm test
```

Build the Electron dashboard:

```bash
npm run desktop:build
```

Build desktop installers/artifacts:

```bash
npm run desktop:dist
```

## Local Data Layout

EnvoyMesh defaults to:

- `./data/default` for local profile, audit, task, approval, and trust records.
- `./shared_vault` for owner-approved files the Envoy may index.

Create a shared vault:

```bash
mkdir -p shared_vault
printf "EnvoyMesh is a local-first P2P agent network.\n" > shared_vault/notes.md
```

Supported vault files are `.txt`, `.md`, and `.json`.

## Run An Envoy Node

Start a local Envoy node:

```bash
npm run node:dev
```

Use a custom profile directory:

```bash
npm run node:dev -- --profile ./data/alice
```

Disable local mDNS discovery:

```bash
npm run node:dev -- --no-mdns
```

Enable advanced P2P options:

```bash
npm run node:dev -- --dht-client --bootstrap "<bootstrap-multiaddr>" --relay --autonat --dcutr
```

Use managed WAN defaults (recommended for non-LAN testing):

```bash
npm run node:dev -- --profile ./data/primary --discovery-profile wan-default --bootstrap-preset public-libp2p --connectivity-strict --p2p-debug
```

Use a YAML config file instead of passing every flag or environment variable:

```bash
npm run node:dev -- --config ./envoymesh.node.yaml
```

Example `envoymesh.node.yaml`:

```yaml
profile: ./data/primary
listen:
  - /ip4/0.0.0.0/tcp/0
discovery:
  profile: wan-default
  connectivityStrict: true
  bootstrapPresets:
    - public-libp2p
    - public-libp2p-am6
    - public-libp2p-am7
  bootstrapPeers:
    - /dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN
  p2pDebug: true
```

Configuration precedence is: defaults, then YAML config file, then environment variables, then CLI flags.

Run a relay server:

```bash
npm run node:dev -- --profile ./data/relay --listen /ip4/0.0.0.0/tcp/4001 --discovery-profile wan-default --relay --relay-server --p2p-debug
```

Normal nodes can use that relay as a bootstrap/check-in target:

```bash
npm run node:dev -- --profile ./data/node-a --listen /ip4/0.0.0.0/tcp/0 --discovery-profile wan-default --bootstrap "<relay-multiaddr>" --relay --autonat --dcutr --p2p-debug
```

The relay stores short-lived `relay.checkin` rows, answers bounded `relay.lookup` requests, and can forward lookups across selected relay neighbors using summaries, `maxHops`, `maxFanout`, query IDs, and negative caching.

Correlate outbound probes and A2A sends (optional `correlationId` on the wire envelope):

```bash
npm run node:dev -- --ping "<peer-multiaddr>" --correlation-id "demo-corr-1"
```

After a peer sends verified `system.signal`, you can target by stable owner id (LAN identity match baseline):

```bash
npm run node:dev -- --ping "envoy:owner:alice" --correlation-id "demo-owner-1"
```

Send a signed **`knowledge.query`** (mock handler on the peer: validates payload, logs, writes audit — no vault RAG yet):

```bash
npm run node:dev -- --knowledge-query "<peer-multiaddr>" --knowledge-text "Summarize the vault README." --correlation-id "kq-1"
```

Send a signed **`bond.request`** (peer runs `evaluatePolicy` on the payload and writes audit):

```bash
npm run node:dev -- --bond-request "<peer-multiaddr>" --bond-message "Let's connect" --bond-proof "Met at meetup" --correlation-id "bond-1"
```

Send a signed **`discovery.request`** (peer enforces trust tier + per-owner rate limit, then returns `discovery.response`):

```bash
npm run node:dev -- --discovery-request "<peer-multiaddr>" --discovery-tag-hash "hash:books" --discovery-capability "task.execute" --discovery-max-results 5 --correlation-id "disc-1"
```

Send a signed **`chat.message`**:

```bash
npm run node:dev -- --chat "<peer-multiaddr>" --chat-text "Hello from EnvoyMesh" --correlation-id "chat-1"
```

Emit libp2p connection/stream lifecycle telemetry into the local audit log as `p2p.trace` rows (no payload logging):

```bash
npm run node:dev -- --p2p-debug
```

## Use The Developer CLI

Show profile summary:

```bash
npm run cli -w @envoymesh/node -- profile --profile ./data/default
```

Inspect audit events:

```bash
npm run cli -w @envoymesh/node -- audit --profile ./data/default --limit 20
```

Filter audit rows by correlation/task id substring, and optionally include noisy `p2p.trace` rows:

```bash
npm run cli -w @envoymesh/node -- audit --profile ./data/default --audit-correlation task-1 --include-p2p-trace
```

Inspect task journal:

```bash
npm run cli -w @envoymesh/node -- tasks --profile ./data/default --limit 20
```

List pending approvals:

```bash
npm run cli -w @envoymesh/node -- approvals --profile ./data/default --status pending
```

Approve or reject an approval request:

```bash
npm run cli -w @envoymesh/node -- approvals approve approval_123 --profile ./data/default
npm run cli -w @envoymesh/node -- approvals reject approval_123 --profile ./data/default
```

Manage trust records:

```bash
npm run cli -w @envoymesh/node -- trust --profile ./data/default
npm run cli -w @envoymesh/node -- trust set envoy:owner:alice --level direct --name Alice --profile ./data/default
npm run cli -w @envoymesh/node -- trust remove envoy:owner:alice --profile ./data/default
```

Show ranked morning discovery digest:

```bash
npm run cli -w @envoymesh/node -- morning-report --profile ./data/default --limit 10
```

Inspect relay-node state:

```bash
npm run cli -w @envoymesh/node -- relay-status --profile ./data/relay
npm run cli -w @envoymesh/node -- relay-status --profile ./data/relay --format json
```

`relay-status` reads the local `relay.manager.snapshot` audit row and reports relay identity, roster freshness, relay-book neighbors, summaries, routing metrics, recent relay traces, and warnings.

Index and search the shared vault:

```bash
npm run cli -w @envoymesh/node -- vault-index --vault ./shared_vault
npm run cli -w @envoymesh/node -- vault-search --vault ./shared_vault --query "P2P agent"
npm run cli -w @envoymesh/node -- vault-manifest --vault ./shared_vault --output ./shared_vault/manifest.json
```

Send a pairing request from CLI:

```bash
npm run node:dev -- --pair-request "<primary-peer-multiaddr>" --pair-note "Pair my satellite device"
```

Pairing-specific queue commands from developer CLI:

```bash
npm run cli -w @envoymesh/node -- pairing list --profile ./data/default
npm run cli -w @envoymesh/node -- pairing approve <approval-id> --profile ./data/default
npm run cli -w @envoymesh/node -- pairing reject <approval-id> --profile ./data/default
npm run cli -w @envoymesh/node -- pairing retry <peer-id> --profile ./data/default
npm run cli -w @envoymesh/node -- pairing timeline --profile ./data/default --limit 50
npm run cli -w @envoymesh/node -- pairing timeline --profile ./data/default --format json --output ./pairing-timeline.json
npm run cli -w @envoymesh/node -- pairing timeline --profile ./data/default --status deferred --query "Primary unavailable"
```

Generate a machine-to-machine smoke checklist:

```bash
npm run cli -w @envoymesh/node -- smoke-checklist --machine-a primary --machine-b satellite
npm run cli -w @envoymesh/node -- smoke-checklist --output ./docs/generated-smoke-checklist.md
npm run smoke:multimachine:guide
npm run smoke:local
```

## Social challenge probe (untrusted peer)

This script dials a victim multiaddr and sends a small set of intentionally hostile (but non-secret-exfiltrating) frames to validate inbound guard and dispatcher reject paths:

```bash
npm run social:challenge -w @envoymesh/node -- --target "<victim-multiaddr>" --scenario all
```

## Run The Desktop Dashboard

Launch the Electron dashboard:

```bash
npm run desktop:dev
```

Use custom profile and vault paths:

```bash
ENVOYMESH_PROFILE=./data/alice ENVOYMESH_VAULT=./shared_vault npm run desktop:dev
```

Pin the repository root explicitly if needed:

```bash
ENVOYMESH_WORKSPACE=/path/to/EnvoyMesh npm run desktop:dev
```

The dashboard shows:

- Owner and device profile.
- Approval queue with approve/reject actions.
- Trust records with set/remove actions.
- Observed peers from audit events.
- Recent tasks and audit events.
- Shared vault summary and search.
- Pairing request composer and pairing queue (approve/reject + deferred-peer retry).
- Discovery Health and Relay Manager panels for WAN/relay diagnostics.

## Two-Machine End-To-End Walkthrough (CLI + Dashboard)

Use machine A as `primary`, machine B as `satellite`.

### Step 1: Start both nodes

Machine A:

```bash
npm run node:dev -- --profile ./data/primary --listen /ip4/0.0.0.0/tcp/0 --p2p-debug
```

Machine B:

```bash
npm run node:dev -- --profile ./data/satellite --listen /ip4/0.0.0.0/tcp/0 --p2p-debug
```

Copy each printed `Listening on:` multiaddr.

### Step 2: Pairing workflow

Machine B sends pairing request:

```bash
npm run node:dev -- --profile ./data/satellite --pair-request "<primary-multiaddr>" --pair-note "Request satellite pairing"
```

Machine A opens dashboard and approves:

```bash
ENVOYMESH_PROFILE=./data/primary ENVOYMESH_VAULT=./shared_vault npm run desktop:dev
```

In dashboard:
- Open **Pairing Queue**.
- Approve the pending `pairing:*` request.

Machine B verifies in audit:

```bash
npm run cli -w @envoymesh/node -- audit --profile ./data/satellite --limit 40
```

### Step 3: Chat + task + data transfer

Machine B:

```bash
npm run node:dev -- --profile ./data/satellite --chat "<primary-multiaddr>" --chat-text "Hello primary" --correlation-id "chat-e2e-1"
npm run node:dev -- --profile ./data/satellite --task-propose "<primary-multiaddr>" --task-id task-e2e-1 --objective "Summarize notes" --requested-result "One bullet summary" --correlation-id "task-e2e-1"
npm run node:dev -- --profile ./data/satellite --data-send "<primary-multiaddr>" --data-relative-path notes.md
```

Machine A verifies in both CLI and dashboard:

```bash
npm run cli -w @envoymesh/node -- audit --profile ./data/primary --limit 60 --include-p2p-trace
npm run cli -w @envoymesh/node -- tasks --profile ./data/primary --limit 40
```

## Cross-Network Relay Walkthrough (Mac Relay + Two Windows)

Use this flow when two Windows nodes can discover a Mac node but cannot discover each other directly. The Mac runs as the relay/address switcher; both Windows nodes check in, then use `relay.lookup` to learn `/p2p-circuit` addresses for each other.

### 1) Start the Mac relay

Mac:

```bash
npm run node:dev -- --profile "/Users/<you>/Documents/mygithub/EnvoyMesh/data/mac-relay" --listen /ip4/0.0.0.0/tcp/4001 --discovery-profile wan-default --relay --relay-server --p2p-debug
```

Copy the Mac `Listening on:` multiaddr that ends with `/p2p/<mac-peer-id>`.

### 2) Start both Windows nodes

Windows A:

```powershell
npm run node:dev -- --profile "$env:USERPROFILE\envoymesh\win_a" --listen /ip4/0.0.0.0/tcp/0 --discovery-profile wan-default --bootstrap "<mac-relay-multiaddr>" --relay --autonat --dcutr --p2p-debug
```

Windows B:

```powershell
npm run node:dev -- --profile "$env:USERPROFILE\envoymesh\win_b" --listen /ip4/0.0.0.0/tcp/0 --discovery-profile wan-default --bootstrap "<mac-relay-multiaddr>" --relay --autonat --dcutr --p2p-debug
```

Wait 30-60 seconds for check-in and lookup cycles.

### 3) Verify relay health before app traffic

Run on Mac:

```bash
npm run cli -w @envoymesh/node -- relay-status --profile "/Users/<you>/Documents/mygithub/EnvoyMesh/data/mac-relay"
```

Expected:

```text
roster total=2 fresh=2 stale=0
```

Run on both Windows machines:

```powershell
npm run cli -w @envoymesh/node -- connectivity-status --profile "<profile-path>"
```

Optional: append **`--rich`** for an ASCII snapshot panel. The desktop dashboard shows the same heuristic as a colored banner above Discovery Health metrics and includes the Relay Manager panel for the Mac relay profile.

Expect relay traces such as `relay.checkin.ok`, `relay.lookup.ok`, `relay.lookup.response`, and relay peer candidates using `/p2p-circuit/p2p/<other-windows-peer-id>`.

### 4) Exercise signal / ping / chat / task / data

After a Windows node learns the other Windows node's relay candidate address, use that address as the target for ping/chat/task/data. You can also first validate Windows -> Mac:

```powershell
npm run node:dev -- --profile "$env:USERPROFILE\envoymesh\win_a" --ping "<win-b-relay-circuit-multiaddr>" --correlation-id "ping-wina-winb-1"
npm run node:dev -- --profile "$env:USERPROFILE\envoymesh\win_a" --chat "<win-b-relay-circuit-multiaddr>" --chat-text "hello through mac relay" --correlation-id "chat-wina-winb-1"
```

### 5) Verify in CLI + Dashboard

Mac CLI:

```bash
npm run cli -w @envoymesh/node -- audit --profile "/Users/<you>/Documents/mygithub/EnvoyMesh/data/mac-relay" --limit 80 --include-p2p-trace
npm run cli -w @envoymesh/node -- relay-status --profile "/Users/<you>/Documents/mygithub/EnvoyMesh/data/mac-relay"
```

Mac dashboard:

```bash
ENVOYMESH_PROFILE="/Users/<you>/Documents/mygithub/EnvoyMesh/data/mac-relay" ENVOYMESH_VAULT="/Users/<you>/Documents/mygithub/EnvoyMesh/shared_vault" npm run desktop:dev
```

## WAN Discovery Troubleshooting (Short)

If non-LAN discovery is unstable, check these first:

1. **Bootstrap availability**
   - Run `connectivity-status` and confirm bootstrap peer count is non-zero.
   - Add at least one known-good relay/bootstrap with `--bootstrap "<multiaddr>"` in addition to `--bootstrap-preset public-libp2p`.
   - For the Mac relay flow, both Windows nodes should bootstrap to the Mac relay's current printed multiaddr.

2. **Strict mode startup failures**
   - `--connectivity-strict` intentionally fails startup when all bootstrap probes fail.
   - For diagnosis, temporarily remove `--connectivity-strict`, collect `p2p.trace`, then restore it.

3. **Firewall/NAT restrictions**
   - Ensure outbound TCP is allowed on both machines.
   - If possible, allow inbound on the selected node port or retry with a fixed listen port.

4. **Wrong profile path / split state**
   - Verify the same absolute profile path is used for node, CLI, and dashboard commands.
   - Mismatched paths make dashboard and CLI appear empty even when traffic exists.

5. **Stale peer address**
   - If a node restarts, recopy the latest printed `Listening on:` multiaddr.
   - Dynamic ports change; old multiaddrs will fail.

6. **Relay roster is empty**
   - Run `relay-status` on the relay profile.
   - If `roster total=0`, verify the Windows nodes were started with `--relay`, `--bootstrap "<mac-relay-multiaddr>"`, and are using the intended profile paths.

## End-to-End Verification Checklist (Line By Line)

Run in order. Replace placeholders before executing.

1) Start Mac primary node:

```bash
npm run node:dev -- --profile "/Users/<you>/Documents/mygithub/EnvoyMesh/data/primary" --listen /ip4/0.0.0.0/tcp/0 --discovery-profile wan-default --bootstrap-preset public-libp2p --connectivity-strict --p2p-debug
```

2) Start Windows satellite node:

```bash
npm run node:dev -- --profile "D:\\mygithub\\EnvoyMesh\\data\\satellite" --listen /ip4/0.0.0.0/tcp/0 --discovery-profile wan-default --bootstrap-preset public-libp2p --connectivity-strict --p2p-debug
```

3) Health check on Mac:

```bash
npm run cli -w @envoymesh/node -- connectivity-status --profile "/Users/<you>/Documents/mygithub/EnvoyMesh/data/primary"
```

4) Health check on Windows:

```bash
npm run cli -w @envoymesh/node -- connectivity-status --profile "D:\\mygithub\\EnvoyMesh\\data\\satellite"
```

5) Windows send signed signal to Mac:

```bash
npm run node:dev -- --profile "D:\\mygithub\\EnvoyMesh\\data\\satellite" --signal "<mac-multiaddr>" --correlation-id "sig-w2m-1"
```

6) Windows send ping/chat/task/data to Mac:

```bash
npm run node:dev -- --profile "D:\\mygithub\\EnvoyMesh\\data\\satellite" --ping "<mac-multiaddr>" --correlation-id "ping-w2m-1"
npm run node:dev -- --profile "D:\\mygithub\\EnvoyMesh\\data\\satellite" --chat "<mac-multiaddr>" --chat-text "hello from windows" --correlation-id "chat-w2m-1"
npm run node:dev -- --profile "D:\\mygithub\\EnvoyMesh\\data\\satellite" --task-propose "<mac-multiaddr>" --task-id task-w2m-1 --objective "Summarize notes" --requested-result "One bullet summary" --correlation-id "task-w2m-1"
npm run node:dev -- --profile "D:\\mygithub\\EnvoyMesh\\data\\satellite" --data-send "<mac-multiaddr>" --data-relative-path notes.md
```

7) Verify Mac audit + tasks:

```bash
npm run cli -w @envoymesh/node -- audit --profile "/Users/<you>/Documents/mygithub/EnvoyMesh/data/primary" --limit 100 --include-p2p-trace
npm run cli -w @envoymesh/node -- tasks --profile "/Users/<you>/Documents/mygithub/EnvoyMesh/data/primary" --limit 40
```

8) Open Mac dashboard on same profile:

```bash
ENVOYMESH_PROFILE="/Users/<you>/Documents/mygithub/EnvoyMesh/data/primary" ENVOYMESH_VAULT="/Users/<you>/Documents/mygithub/EnvoyMesh/shared_vault" npm run desktop:dev
```

9) Confirm dashboard shows:
- Recent Audit rows for `system.signal`, `system.ping`, `chat.message`, `task.propose`, and data transfer events.
- Chat thread entries and task updates for `task-w2m-1`.
- Discovery Health metrics with bootstrap counts and warnings.

## Live Connectivity Smoke Tests

Ordered POC steps (LAN → WAN bootstrap → relay) are summarized in [docs/poc-discovery-connectivity.md](./docs/poc-discovery-connectivity.md). You can use `npm run poc:discovery -w @envoymesh/node` as an alias for the smoke script (if `poc:discovery` is missing, use `npm run connectivity:smoke -w @envoymesh/node`). **On Windows**, if `--mode`/`--timeout-ms` get dropped by npm, use `npm run poc:discovery:mdns -w @envoymesh/node` or run `npx tsx src/connectivity-smoke.ts --mode mdns --timeout-ms 20000` from `apps/node`.

Prove local mDNS discovery on a real machine:

```bash
npm run poc:discovery -w @envoymesh/node -- --mode mdns --timeout-ms 20000
```

Prove advanced connectivity against a reachable bootstrap or relay peer:

```bash
npm run poc:discovery -w @envoymesh/node -- --mode advanced --bootstrap "<bootstrap-multiaddr>" --timeout-ms 60000
```

## Useful Commands

```bash
npm run typecheck
npm test
npm run node:dev
npm run desktop:dev
npm run desktop:build
npm run cli -w @envoymesh/node -- --help
npm run cli -w @envoymesh/node -- relay-status --profile ./data/relay
```
