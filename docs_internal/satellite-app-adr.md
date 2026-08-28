# ADR — Mobile app strategy (Phase 11 + Phase 31)

**Status:** Revised (2026-06-09)

---

## Original ADR (2026-05-20)

**Decision:** No separate thin satellite app. Phase 11 Capacitor full mobile node remains the single mobile product surface.

---

## Revised ADR (2026-06-09)

**New decision:** **Two mobile apps, two purposes.** The Phase 11 Capacitor app is repositioned as a **standalone full EnvoyMesh node** (no pairing — the phone IS the node). A new Flutter app ("EnvoyGo") is the **thin client** for remote access to a home EnvoyMesh node (pairing required).

| | Phase 11 Capacitor | Phase 31 EnvoyGo (Flutter) |
|---|---|---|
| **Role** | Standalone full node | Thin client to home node |
| **Pairing** | None — it IS the node | Pair with home node via QR |
| **Identity** | Own owner/device/agent keys | None — session token from home node |
| **libp2p** | Relay-only browser libp2p | WebSocket to home node (v1) |
| **Storage** | SQLite + Capacitor vault | flutter_secure_storage + sqflite cache |
| **UI** | Full Social (27+ components) | 3-tab minimal (Chats, People, Me) |
| **Best for** | Using EnvoyMesh without a home computer | Accessing your home node remotely |
| **Codebase** | TypeScript/React in monorepo (`apps/mobile`) | Dart/Flutter in monorepo (`apps/envoygo`) |

**Rationale:**

1. **Capacitor full node has its place.** Users without a always-on home computer still need EnvoyMesh on their phone. The Capacitor app already works as a full node — let it own that role exclusively. No pairing complexity, no thin-client mode to maintain.

2. **Flutter for thin client — better UX.** For the "access my home node" use case, a dedicated thin client with simple UI, persistent pairing, and multi-transport resilience is the right product. Flutter delivers native-quality UI that Capacitor+React cannot match.

3. **Clean separation of concerns.** Each app does one thing well. No feature-flagging "full node vs thin client" in a single codebase, no compromised UX for either use case.

**Consequences:**

- `apps/mobile` and `packages/mobile-*` remain active for the standalone full-node use case.
- Phase 31 EnvoyGo lives in `apps/envoygo/` within the monorepo, focused solely on thin-client remote access.
- `deviceProfile: "satellite"` remains a protocol value.
- Home node requires zero changes for EnvoyGo operation (push notifications are the only optional server addition).

**Related:** [Phase 31 — Flutter Thin Client](../implementation-plan.md#phase-31--flutter-thin-client-envoygo-design) · [Flutter Thin Client Design](./flutter-thin-client-design.md)
