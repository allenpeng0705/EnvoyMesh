# Developer CLI

The developer CLI is the first Product Surface for EnvoyMesh. It exposes local profile, audit, task, approval, peer, and vault state without requiring a dashboard.

Run commands with:

```bash
npm run cli -w @envoymesh/node -- <command> [options]
```

## Commands

```bash
npm run cli -w @envoymesh/node -- profile --profile ./data/default
```

Shows the owner ID, device ID, device profile, and local device capabilities.

```bash
npm run cli -w @envoymesh/node -- audit --profile ./data/default --limit 20
```

Prints recent audit events from `audit-events.jsonl`.

By default, `p2p.trace` rows are hidden (they can be very chatty). Include them with `--include-p2p-trace`, and optionally filter with `--audit-correlation <id>` (substring match against `correlationId` and `taskId`).

```bash
npm run cli -w @envoymesh/node -- audit --profile ./data/default --audit-correlation task-1 --include-p2p-trace
```

```bash
npm run cli -w @envoymesh/node -- tasks --profile ./data/default --limit 20
```

Prints recent task journal entries from `task-journal.jsonl`.

```bash
npm run cli -w @envoymesh/node -- approvals --profile ./data/default --status pending
```

Prints owner approval requests from `approval-queue.jsonl`.

```bash
npm run cli -w @envoymesh/node -- approvals approve approval_123 --profile ./data/default
npm run cli -w @envoymesh/node -- approvals reject approval_123 --profile ./data/default
```

Updates a local approval request to `approved` or `rejected`.

```bash
npm run cli -w @envoymesh/node -- peer-list --profile ./data/default
```

Lists remote libp2p peer IDs observed in audit events. This is a developer view, not yet a full social graph.

`peer-list` applies the same default audit filtering as `audit` (it ignores `p2p.trace` unless `--include-p2p-trace` is set).

```bash
npm run cli -w @envoymesh/node -- vault-index --vault ./shared_vault
```

Builds a transient index of supported shared vault files and prints document/chunk counts.

```bash
npm run cli -w @envoymesh/node -- vault-search --vault ./shared_vault --query "distributed systems"
```

Searches the transient shared vault index and prints matching document chunks.

```bash
npm run cli -w @envoymesh/node -- trust
npm run cli -w @envoymesh/node -- trust set envoy:owner:alice --level direct --name Alice
npm run cli -w @envoymesh/node -- trust remove envoy:owner:alice
```

Lists, sets, or removes local trust records from `trust-records.json`. Supported levels are `direct`, `referred`, `public`, and `blocked`.

```bash
npm run cli -w @envoymesh/node -- morning-report --profile ./data/default --limit 10
```

Builds a ranked discovery digest from structured discovery events, trust levels, and owner-to-peer LAN directory recency.

## Options

- `--profile <dir>`: Profile directory. Default: `./data/default`.
- `--vault <dir>`: Shared vault directory. Default: `shared_vault`.
- `--query <text>`: Search query for `vault-search`.
- `--limit <n>`: Maximum rows to print. Default: `20`.
- `--audit-correlation <id>`: Substring filter for audit listings (matches `correlationId` and `taskId`).
- `--include-p2p-trace`: Include `p2p.trace` audit rows (hidden by default).
- `--status <pending|approved|rejected>`: Approval status filter.
- `--level <direct|referred|public|blocked>`: Trust level for `trust set`.
- `--name <text>`: Optional display name for a trust record.
- `--note <text>`: Optional note for a trust record.
