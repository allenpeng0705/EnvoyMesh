# SQLite adoption (audit, journal, and query-at-scale)

EnvoyMesh today persists **JSONL append-only** logs (audit, journals, approval queues, etc.) and **atomic JSON** snapshots for smaller state files. This document defines **when** introducing **SQLite** (or another embedded DB) is justified, **what** would migrate first, and what stays on JSONL.

**Related:** [Implementation plan — SQLite key decision](./implementation-plan.md) · [Detailed design](./detailed-design.md)

---

## 1. Current baseline (no SQLite)

- **Audit / journal:** sequential JSONL append with serialization guards (`local-store`). Good for **forensics**, simple tooling (`grep` / `jq`), and low write contention on single-writer nodes.
- **Peer directory / trust store:** JSON files; sufficient for modest peer counts.

---

## 2. Triggers that justify SQLite (or similar)

Adopt SQLite when **one or more** of these hold:

| Signal | Rationale |
|--------|-----------|
| **Audit JSONL growth** | Single `audit.jsonl` (or shard) routinely exceeds **~500 MB–1 GB** on disk *or* rotation/archival becomes painful. |
| **Query latency** | Dashboard / CLI **`audit --limit`**, time-range filters, or correlation-id joins are **noticeably slow** (>1–2 s) on cold starts due to full scans. |
| **Retention policy** | Product requires **indexed time-range deletion**, **per-intent retention**, or **compliance export** beyond “tail/grep”. |
| **Concurrent readers** | Multiple processes (e.g. separate **reporting** daemon + node) need **consistent read** views without copying whole files. |
| **Operational reporting** | Routine **SQL-style aggregations** (counts by intent/outcome/remote peer over months) are demanded without ETL to an external warehouse first. |

Until these appear, **JSONL + optional external log shipping** (e.g. forward to an analytics pipeline) is usually simpler.

---

## 3. Suggested migration order

1. **Audit events** — highest volume and query value; map existing rows to a table with indexes on `createdAt`, `intent`, `correlationId`, `remotePeerId`, `outcome`.
2. **Task journal / approval queue** — if present at volume; transactional updates benefit from SQLite.
3. **Peer directory** — optional second phase if listing/sorting by last-seen becomes hot.

**Non-goals for v1 SQLite slice:** replacing **canonical JSON** vault metadata in SQLite unless a separate driver is justified.

---

## 4. Compatibility and exports

- Keep **JSONL export** or **one-shot dump** for releases and incident response (many operators expect file-based artifacts).
- WAL mode + single writer matches typical **one node process** model; multi-writer same DB is **out of scope** unless explicitly designed.

---

## 5. Decision record

| Status | Action |
|--------|--------|
| **2026-05-20 gate review** | Triggers **not met** on typical profiles — stay on JSONL + secondary index files. See [sqlite-gate-review-2026-05-20.md](./sqlite-gate-review-2026-05-20.md). Operator metric: `storage-gate` CLI. |
| **Before triggers in §2** | Stay on JSONL; monitor file sizes and query times via `storage-gate` / operator tooling. |
| **Triggers met** | Open a phased implementation: schema in `local-store`, migration from existing JSONL, tests for idempotent migration, and documentation for backup paths. |

No SQLite migration is **normative** in the repo until a milestone explicitly ships it; this file is the **gate** for that work.
