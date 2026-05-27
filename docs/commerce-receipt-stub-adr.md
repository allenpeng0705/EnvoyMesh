# ADR — Commerce receipt stub (Story E / Phase 15E)

**Status:** Accepted design stub (2026-05-20) — **no payment rail shipped**

---

## Scope for first implementation (when Story E un-parks)

1. **Receipt-only path** — signed `task.result` + vault CID attestation + Activity row; no money movement.
2. Optional **`payment.mandate`** schema extension behind feature flag (not in Phase 15E).
3. Commerce stays **off relay nodes**; settlement only on normal nodes with owner approval.

---

## Explicitly out of scope (Phase 15E)

- Stablecoin / fiat / escrow adapters
- Global reputation as commerce prerequisite
- `payment.*` EMP intents on the wire

**Related:** [parked-multihop-commerce-scope.md](./parked-multihop-commerce-scope.md)
