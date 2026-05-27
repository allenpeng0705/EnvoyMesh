# ADR — Commerce receipt stub (Story E / Phase 15E)

**Status:** Accepted design stub — **receipt-only path shipped (2026-05-27)**; no payment rail.

---

## Scope for first implementation (when Story E un-parks)

1. **Receipt-only path** — signed `task.result` + vault CID attestation + Activity row; no money movement. **Shipped:** optional `deliveryAttestation` on `task.result`, local `commerce-receipts.json`, RPC `recordCommerceReceipt` / `listCommerceReceipts`, Activity kind `commerce_receipt`.
2. Optional **`payment.mandate`** schema extension behind feature flag (not in Phase 15E).
3. Commerce stays **off relay nodes**; settlement only on normal nodes with owner approval.

---

## Explicitly out of scope (Phase 15E)

- Stablecoin / fiat / escrow adapters
- Global reputation as commerce prerequisite
- `payment.*` EMP intents on the wire

**Related:** [parked-multihop-commerce-scope.md](./parked-multihop-commerce-scope.md)
