# ADR — Thin satellite mobile app (Story A / Phase 15E)

**Status:** Accepted (2026-05-20)  
**Decision:** **No separate thin satellite app.** Phase 11 Capacitor full mobile node remains the single mobile product surface.

---

## Context

Phase 4A defined a **primary / satellite** device profile in EMP. Story A imagined a minimal phone client that defers mesh work to a home **primary** node. Phase 11 shipped a **full EnvoyMesh node** in Capacitor instead.

---

## Decision

| Option | Outcome |
|--------|---------|
| **A — Single Capacitor app (Phase 11)** | **Selected** |
| B — Dual apps (full node + satellite lite) | Rejected for Phase 15E |

**Rationale:**

- Phase 11 already delivers pairing, shared owner identity, relay mesh, and Social UI on mobile.
- A second binary adds store, security review, and UX fragmentation without a committed product requirement.
- Primary-offline defer baseline (`device.pair.deferred`, approval queue) exists for protocol-level satellite behavior without a separate app.

---

## Consequences

- `deviceProfile: "satellite"` remains a **protocol** value for future constrained clients; no new app ID is scheduled.
- If battery/size constraints become blocking, reopen with explicit acceptance criteria (offline queue UX, RPC surface to primary only).

**Related:** [parked-satellite-app-scope.md](./parked-satellite-app-scope.md)
