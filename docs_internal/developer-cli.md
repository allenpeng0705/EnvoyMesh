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

Prints recent audit events from `audit-events.jsonl` via the secondary `audit-query-index.jsonl` (rebuilt lazily when stale).

By default, `p2p.trace` rows are hidden (they can be very chatty). Include them with `--include-p2p-trace`, and optionally filter with `--audit-correlation <id>` (substring match against `correlationId` and `taskId`). Time bounds: `--since <iso>` and `--until <iso>`.

```bash
npm run cli -w @envoymesh/node -- audit --profile ./data/default --audit-correlation task-1 --include-p2p-trace
```

```bash
npm run cli -w @envoymesh/node -- storage-gate --profile ./data/default
```

Measures audit JSONL file size and full-read vs indexed-query latency against [sqlite-adoption.md](./sqlite-adoption.md) §2 triggers. Use `--format json` for machine-readable output; `--since <iso>` narrows the indexed benchmark window (default last 90 days).

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

Builds a transient index of all normal (non-dotfile) vault files and prints document/chunk counts. Binary files appear as documents with integrity hashes only; `.txt`/`.md`/`.json` are chunked for `vault-search`.

```bash
npm run cli -w @envoymesh/node -- vault-search --vault ./shared_vault --query "distributed systems"
```

Searches the transient shared vault index and prints matching document chunks.

```bash
npm run cli -w @envoymesh/node -- vault-ipfs-fingerprint --vault ./shared_vault --relative-path notes/export.md
# or fingerprint any arbitrary file snapshot:
npm run cli -w @envoymesh/node -- vault-ipfs-fingerprint --file ./build/release.tar.gz
# Helia in-process fingerprint (no Kubo daemon):
npm run cli -w @envoymesh/node -- vault-ipfs-fingerprint --file ./build/release.tar.gz --engine helia
```

**Kubo (default):** runs **`ipfs add`** with EnvoyMesh **interop recipe v1** (`--cid-version 1 --pin=false -Q`), printing the UnixFS-aligned root CID, recipe id (`kubo-ipfs-export-v1`), and Kubo CLI version (`ipfs version -n`). Kubo must be installed and reachable on `PATH`; a typical machine also needs `ipfs daemon` running for **`ipfs add`** to succeed. See [envoymesh-with-kubo-helia.md](./envoymesh-with-kubo-helia.md) for install, run, and packaging options.

**Helia (`--engine helia`):** runs `@helia/unixfs` **addBytes** in an in-memory blockstore (recipe `helia-unixfs-export-v1`). No Kubo install or daemon. Kubo vs Helia CID parity is validated in H3 golden CI — see [helia-ipfs-integration-plan.md](./helia-ipfs-integration-plan.md).

Automated tests skip real Kubo calls unless **`ENVOYMESH_IPFS_CLI_TEST=1`**. Helia/Kubo CID parity tests require **`ENVOYMESH_HELIA_PARITY_TEST=1`** (or the Kubo flag) plus Kubo on `PATH` with `ipfs daemon` running — see CI workflow `ci-ipfs-helia-parity.yml`.

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

```bash
npm run cli -w @envoymesh/node -- relay-status --profile ./data/relay
npm run cli -w @envoymesh/node -- relay-status --profile ./data/relay --format json
```

Reads the latest local `relay.manager.snapshot` audit row and prints relay identity, roster counts, relay-book neighbors, summary freshness, health status, recovery counters, routing metrics, recent relay traces, and warnings. This is a local operator view; it does not expose a public relay admin API.

## Options

- `--profile <dir>`: Profile directory. Default: `./data/default`.
- `--vault <dir>`: Shared vault directory. Default: `shared_vault`.
- `--file <path>`: File snapshot for `vault-ipfs-fingerprint`.
- `--relative-path <vaultRel>`: Vault-relative document path for `vault-ipfs-fingerprint` (`--vault`).
- `--query <text>`: Search query for `vault-search`.
- `--limit <n>`: Maximum rows to print. Default: `20`.
- `--audit-correlation <id>`: Substring filter for audit listings (matches `correlationId` and `taskId`).
- `--include-p2p-trace`: Include `p2p.trace` audit rows (hidden by default).
- `--status <pending|approved|rejected>`: Approval status filter.
- `--level <direct|referred|public|blocked>`: Trust level for `trust set`.
- `--name <text>`: Optional display name for a trust record.
- `--note <text>`: Optional note for a trust record.
- `--format <text|json>`: Output format for supported commands such as `relay-status` and pairing timeline export.
