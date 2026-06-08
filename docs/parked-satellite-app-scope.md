# Parked scope — Thin satellite mobile app (Story A)

**Status:** Unparked (2026-06-09) — **Phase 31 active.** Two-app strategy: Capacitor stays as standalone full node; new Flutter app "EnvoyGo" as thin-client remote access. See [satellite-app-adr.md](./satellite-app-adr.md) and [implementation-plan.md § Phase 31](./implementation-plan.md#phase-31--flutter-thin-client-envoygo-design).

**Story:** [UserStory.md § Story A](./UserStory.md) · Protocol baseline: Phase 4A primary/satellite device profiles

---

## What shipped (Phase 11 — now deprecated)

The **Capacitor mobile app** was a **full EnvoyMesh node** — not a thin client:

- In-process `MobileNode` + Social UI
- Own peer identity, relay-only transport, full intent support
- QR pairing with home node; shared owner identity

This is now being replaced by the Flutter thin client (Phase 31).

---

## What the Flutter thin client becomes (Phase 31)

A **pure thin client** — no local mesh participation:

| Capability | Phase 11 (Capacitor) | Phase 31 (Flutter) |
|------------|---------------------|-------------------|
| libp2p mesh participation | Yes (relay WS) | No — WebSocket to home node only |
| Vault RAG on device | Mobile vault (SQLite) | None — remote via home RPC |
| Identity | Own owner/device keys | None — session token auth |
| UI surface | Full Social (27+ components, 7 settings tabs) | 3-tab minimal: Chats, People, Me |
| Binary size / battery | Higher | Lower |
| Multi-node | No | Yes — pair with multiple home nodes, switch between them |

---

## Decision

**Closed (Option A) → Superseded.** [satellite-app-adr.md](./satellite-app-adr.md) was reversed on 2026-06-09. Two-app strategy: Phase 11 Capacitor stays as standalone full node; Phase 31 EnvoyGo is the thin-client remote access app.

**Related:** [satellite-app-adr.md](./satellite-app-adr.md) · [Phase 31](./implementation-plan.md#phase-31--flutter-thin-client-envoygo-design) · [Flutter Thin Client Design](./flutter-thin-client-design.md)
