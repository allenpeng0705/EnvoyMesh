# EnvoyMesh QuickStart

This guide shows how to install, build, verify, run the node, use the CLI, and launch the desktop dashboard.

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

## Use The Developer CLI

Show profile summary:

```bash
npm run cli -w @envoymesh/node -- profile --profile ./data/default
```

Inspect audit events:

```bash
npm run cli -w @envoymesh/node -- audit --profile ./data/default --limit 20
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

## Run The Desktop Dashboard

Launch the Electron dashboard:

```bash
npm run desktop:dev
```

Use custom profile and vault paths:

```bash
ENVOYMESH_PROFILE=./data/alice ENVOYMESH_VAULT=./shared_vault npm run desktop:dev
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
