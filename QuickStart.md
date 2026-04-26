# EnvoyMesh QuickStart

This guide shows how to install, build, verify, run the node, use the CLI, and launch the desktop dashboard.

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

Correlate outbound probes and A2A sends (optional `correlationId` on the wire envelope):

```bash
npm run node:dev -- --ping "<peer-multiaddr>" --correlation-id "demo-corr-1"
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

Index and search the shared vault:

```bash
npm run cli -w @envoymesh/node -- vault-index --vault ./shared_vault
npm run cli -w @envoymesh/node -- vault-search --vault ./shared_vault --query "P2P agent"
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

## Live Connectivity Smoke Tests

Prove local mDNS discovery on a real machine:

```bash
npm run connectivity:smoke -w @envoymesh/node -- --mode mdns --timeout-ms 20000
```

Prove advanced connectivity against a reachable bootstrap or relay peer:

```bash
npm run connectivity:smoke -w @envoymesh/node -- --mode advanced --bootstrap "<bootstrap-multiaddr>" --timeout-ms 60000
```

## Useful Commands

```bash
npm run typecheck
npm test
npm run node:dev
npm run desktop:dev
npm run desktop:build
npm run cli -w @envoymesh/node -- --help
```
