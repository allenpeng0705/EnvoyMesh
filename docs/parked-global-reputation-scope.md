# Parked scope — Global reputation ledger

**Status:** Scoping (Phase 15E) — **read-only slice shipped** (anchor bundle + RPC + Contacts UI). Federation write path not scheduled.

**Distinction:** Local peer reputation (shipped) vs **global/federated** ledger (parked).

---

## What ships today (local)

| Component | Location | Behavior |
|-----------|----------|----------|
| `PeerReputationStore` | `@envoymesh/local-store` | Per-owner JSON store; scores from direct observations |
| `task.feedback` inbound | `apps/node/src/reputation-inbound.ts` | Updates local score from bonded/task peers |
| `official.credential` | protocol + reputation-inbound | Anchor verification stub |
| Trust tiers | `@envoymesh/bonds` | **Policy** input — not a global score |

Local reputation informs **this node's** policy hints only. It is **not** broadcast or synced globally.

---

## What “global ledger” would mean (parked)

- **Federated anchors** — orgs publish signed reputation attestations about owner IDs
- **Gossip or DHT replication** — optional sync of attestations (high Sybil risk)
- **Cross-node aggregation** — morning report / Search shows third-party scores
- **Commerce dependency** — Story E may want escrow + reputation; must not centralize

---

## Design constraints

1. **Opt-in consumption** — owners choose anchor sets (similar to TLS trust stores)
2. **No relay writes** — relays never store or merge reputation
3. **Signed attestations only** — no opaque numeric scores without provenance
4. **Appeal / dispute** — human override always wins over ledger entry locally

---

## Relationship to Story E

Payment/commerce (parked) must **not** require global reputation on day one. Local `task.feedback` + bond tier is sufficient for MVP deals.

---

## First slice (when un-parked)

1. ~~Document anchor trust bundle format (JSON file in profile dir)~~ **Shipped:** `reputation-anchors.json` + [example fixture](./fixtures/reputation-anchors.example.json).
2. ~~Read-only display in Social contact detail (“attestations from X”)~~ **Shipped:** Contacts list reputation meta via `getPeerReputationSummary`.
3. No write path to global DHT until abuse model reviewed

---

## Decision

**Partially un-parked (read-only).** Expand local reputation UX before any federated write path. See [parked-multihop-commerce-scope.md](./parked-multihop-commerce-scope.md) for commerce ordering.
