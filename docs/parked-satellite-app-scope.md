# Parked scope — Thin satellite mobile app (Story A)

**Status:** Scoping closed (2026-05-20) — **ADR accepted:** single Capacitor app. See [satellite-app-adr.md](./satellite-app-adr.md).

**Story:** [UserStory.md § Story A](./UserStory.md) · Protocol baseline: Phase 4A primary/satellite device profiles

---

## What already ships (Phase 11)

The **Capacitor mobile app** is a **full EnvoyMesh node** — not a thin client:

- In-process `MobileNode` + Social UI
- Own peer identity, relay-only transport, full intent support
- QR pairing with home node; shared owner identity

This satisfies most Story A **protocol** requirements (pairing, P2P, vault-backed tasks on home node).

---

## What “thin satellite” meant in Phase 4A

A **separate** minimal app profile:

| Capability | Full mobile node (11) | Thin satellite (parked) |
|------------|----------------------|-------------------------|
| libp2p mesh participation | Yes (relay WS) | No — talks only to primary |
| Vault RAG on device | Mobile vault (SQLite) | Remote via primary RPC |
| Offline queue | Partial (local stores) | Explicit defer to primary |
| UI surface | Full Social | Chat + approvals + status only |
| Binary size / battery | Higher | Lower |

---

## Open product question

**Is a second mobile binary justified?** Phase 11 may be sufficient if:

- Home node stays always-on on desktop/Tauri
- Phone uses full node only when owner needs mesh participation away from home

If product confirms **yes, thin satellite**, un-park with:

1. `deviceProfile: "satellite"` UX spec (already in protocol-standard)
2. WebSocket-only channel to primary (no relay mesh on phone)
3. Explicit `device.pair.deferred` + approval surfacing (Phase 4A baseline exists)

---

## Decision

**Closed (Option A).** [satellite-app-adr.md](./satellite-app-adr.md) — Phase 11 Capacitor full node remains the single mobile product. Reopen only if battery/size constraints require a constrained satellite binary.
