# SQLite adoption gate review — 2026-05-20

Phase **15D** gate review for desktop `local-store` audit persistence. Mobile already uses SQLite for audit/journal via `@envoymesh/mobile-storage`.

**Gate doc:** [sqlite-adoption.md](./sqlite-adoption.md) §2  
**Tooling:** `npm run cli -w @envoymesh/node -- storage-gate --profile <dir>`

---

## Decision

**Stay on JSONL + secondary index files** (`audit-query-index.jsonl`, `activity-query-index.jsonl`). **Do not** open a SQLite migration milestone yet.

| Signal | Threshold (§2) | Typical dev / CI profile | Outcome |
|--------|----------------|--------------------------|---------|
| Audit JSONL size | ≥ ~500 MB | ≪ 1 MB | Not met |
| Cold full-read latency | ≥ 2 s | ≪ 50 ms | Not met |
| Retention / concurrent readers / SQL aggregations | Product demand | Not requested | Not met |

---

## What shipped instead (15D)

1. **Secondary JSONL indexes** — append-only index rows on audit/activity write; lazy rebuild when index lags canonical JSONL.
2. **Indexed queries** — `queryAuditEvents()` / Activity `list()` use index for time range, correlationId, and taskId without scanning full audit JSONL.
3. **API parity** — `listAuditEvents` accepts `since` / `until`; mobile audit journal SQL filters match.
4. **Operator CLI** — `storage-gate` prints file sizes, full-read vs indexed-query timings, and trigger evaluation.

---

## When to revisit

Re-run `storage-gate` on a **production profile** (90+ days, heavy P2P trace enabled) or when:

- `audit-events.jsonl` routinely exceeds **500 MB**, or
- indexed tail queries exceed **500 ms** on a 90-day window, or
- product requires indexed retention deletion / cross-process readers / SQL aggregations.

If triggers fire, follow [sqlite-adoption.md](./sqlite-adoption.md) §3 — migrate **audit events first**, keep JSONL export path.

---

## Filecoin (optional 15D item)

**Deferred.** Long-term persistence remains IPFS pin / vault export (Phase 14D). Filecoin deals stay behind owner policy + approvals per [roadmap.md](./roadmap.md); no provider scope confirmed for Phase 15.
