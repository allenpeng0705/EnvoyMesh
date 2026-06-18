# Parked scope — EnvoyGo as a full EnvoyMesh node

**Status:** Parked (2026-06-19) — explicitly deferred. EnvoyGo continues to ship as a **Flutter thin client** ([Phase 31](./implementation-plan.md#phase-31--flutter-thin-client-envoygo-design)); the "full mobile node" direction is tracked here for future reactivation.

**Owns (today):** [flutter-thin-client-design.md](./flutter-thin-client-design.md) · [Phase 31](./implementation-plan.md#phase-31--flutter-thin-client-envoygo-design) · EnvoyGo (`apps/envoygo/`)
**Built on:** `packages/mobile-identity` · `packages/mobile-storage` · `packages/mobile-vault` · `packages/mobile-node` (all four packages exist, ship 7,932 LOC, currently unused on-device — only the abandoned `apps/mobile/` Capacitor app consumed them).

---

## Why parked

The user explored whether EnvoyGo can be promoted from "thin client" to "full node" (the role originally held by the deprecated Capacitor app) and decided to defer:

1. **Scope is large.** Promoting a thin client to a full node touches identity ownership, vault semantics, chat history merge, chain store, audit log, AI delegation, and the entire thin-client transport layer. The 240-method `NodeService` interface (`packages/api/src/node-service.ts`) currently maps to ~30 methods in `apps/envoygo/lib/services/node_service_client.dart`; the other ~210 are home-only and would need either a local implementation or a remote call through the home — both of which have design trade-offs.
2. **AI value is limited on mobile today.** Phase 32 already gave the home node a first-class agent (`openclawEnabled` boot-time gate, `getOpenClawStatus` RPC, `AiEngineSection` mobile mirror). Running a second AI on the phone doesn't unlock a new product surface yet.
3. **No clear user need yet.** The thin-client mode already covers the "control my home from my phone" use case end-to-end. The "phone is its own node" use case is technically interesting but doesn't have a story that can't be told better with the current thin client + a desktop home.

## Technical feasibility (audit 2026-06-19)

A full audit of the `dart_libp2p` library (v1.0.3, single-maintainer `stephanfeb`) and the current EnvoyGo usage was completed before parking. Key findings:

- **Library can back a TCP-based full libp2p node.** Identify, Identify-Push, Ping, AutoNAT v2, Circuit Relay v2 (HOP + STOP), DCUtR hole punching, Kademlia DHT, GossipSub, Noise XX, Yamux, custom protocol registration via `Host.setStreamHandler`, signed peer records, observed-addr manager, AutoRelay — all present and go-libp2p interop-tested.
- **EnvoyGo already has a real libp2p stack.** `apps/envoygo/lib/services/libp2p_node.dart` (440 lines) builds a `BasicHost` with TCP + Noise + Yamux + Kademlia DHT client + persisted Ed25519 identity. Used today only as an outbound dialer for `HomeRemoteClient`.
- **Mobile cannot be a browser-peer libp2p node.** Library has no WebSocket, no WebRTC-direct, no WebTransport, no QUIC. The README at `~/.pub-cache/hosted/pub.dev/dart_libp2p-1.0.3/README.md:126` is explicit: *"This implementation does not support QUIC. Instead, we've opted for a custom `dart-udx` implementation."* WebTransport is **fundamentally blocked** in Dart (no HTTP/3 client in the SDK). Multiaddr codes for `/ws` and `/wss` are not even in the parser registry.
- **Mobile-as-server has OS-level blockers.** No `INTERNET` permission in `android/app/src/main/AndroidManifest.xml` (only in `debug`/`profile`); no `NSLocalNetworkUsageDescription` or Bonjour services in `ios/Runner/Info.plist`; no Android `Service` / iOS `WKBackgroundModes` to keep the host alive in background. When the OS suspends the app, the Dart isolate stops and the libp2p host dies.
- **No inbound stream handlers are registered today.** Zero hits for `setStreamHandler` / `host.handle(...)` in `apps/envoygo/lib/`. The mobile is a pure dialer.
- **No peerstore persistence in the library.** The Dart libp2p peerstore is in-memory only. EnvoyGo's `SecureStorage` already holds the Ed25519 seed; peer metadata is lost on every restart.
- **Library bus factor is 1.** `stephanfeb` is the sole publisher of `dart_libp2p`, `dart_libp2p_kad_dht`, `dart_libp2p_pubsub`, `dart_udx`, and `mdns_dart`. Feb 17–22, 2026 saw 4 releases (1.0.0–1.0.3) — aggressive stabilization, not abandonment, but no community fallback if the maintainer stops. BSD/MIT license permits forking.

**Verdict:** dart_libp2p is sufficient for a TCP/Noise/Yamux/DHT/Relay/Identify full node. It is **not** sufficient for a browser-interop node. The mobile cannot be reached by js-libp2p / Helia without a bridge. The mobile is also not a "always online" node — the OS kills it on background, same as every other Flutter app.

## Product shapes considered (UX pass 2026-06-19)

Three shapes were designed; each is a real option for the day someone unparks this:

| Shape | Description | Pros | Cons |
|---|---|---|---|
| **A. Per-pairing mode** | When you pair, choose "Connect to my home" (thin) or "Set up as a node" (full). Each pairing remembers its role. | Zero risk to the working thin mode. Both modes coexist. Each role has its own key material, vault, audit log. | "Unpair to switch" feels heavy. Two QR formats or a role dropdown in `PairingConfirmScreen`. Every screen needs a "this feature works differently in self mode" branch. |
| **B. Single identity, role per launch** | One pairing per device. A `Role: Home / Node` toggle in Me tab. In `self` mode, mobile imports the home's owner identity (`MobileNode.importOwnerIdentity`, Phase 11B). | One identity, one mental model. Migration is a one-time identity import, not a re-pair. | The bigger change. Chat history, vault, chain state, and audit log all need a **merge story** that doesn't exist. Identity-sharing flips the entire product posture (mobile becomes the trust root, home becomes a peer). |
| **C. Two separate apps** | EnvoyGo stays thin; new `EnvoyNode` app ships the full-node case. | Zero risk to the existing app. Independent iteration. | Two App Store listings, two binaries, two update cadences. User has to pick at install time. |

## Open design questions (decide when un-parking)

1. **Same identity as home, or separate?** Phase 11B's `MobileNode.importOwnerIdentity` allows sharing the home's `envoy:owner:...` ID with the phone. Sharing simplifies the user mental model but requires a merge story for chat history, vault, audit log, and chain state. Separate identities are simpler to ship but mean the user has two `envoy:owner:...` IDs.
2. **What's the v1 "self" feature set?** Options: (a) identity + receive-only chat (lowest risk), (b) identity + vault + signed envelopes (no AI), (c) full parity with all 240 `NodeService` methods, (d) just identity + presence (proof of concept).
3. **Where does AI run?** Today, AI runs on the home. If the mobile becomes a self node, does the mobile run its own AI (e.g., a local LLM plugin for OpenClaw), or does it still delegate to the home when reachable and degrade gracefully when not?
4. **Does the home still receive inbound from the mobile when the phone is offline?** Today, no — the home is the source of truth, the mobile is a viewer. In self mode, the home could be a peer that the mobile notifies of changes asynchronously (with conflict resolution).
5. **How does the Me tab signal the role?** A simple "Mode: Home / Node" pill, a separate tab, or a different app icon entirely? The Me tab is currently the only place a user sees the home-node dependency.

## When to un-park

Suggested triggers:
- A concrete user need surfaces (e.g., "I want to author chains from my phone while offline on a plane")
- `dart_libp2p` gains WebSocket or WebRTC-direct transport support (or a community fork appears)
- A second device class (watch, desktop-on-iPad) makes the thin-client model a worse fit
- Phase 11B's `importOwnerIdentity` lands a real merge story for chat history + vault

## Related

- [flutter-thin-client-design.md](./flutter-thin-client-design.md) — EnvoyGo's current thin-client design
- [satellite-app-adr.md](./satellite-app-adr.md) — Why the original Capacitor full-node mobile app was abandoned
- [parked-satellite-app-scope.md](./parked-satellite-app-scope.md) — The corresponding parking doc for the Capacitor app
- [Phase 31](./implementation-plan.md#phase-31--flutter-thin-client-envoygo-design) — Active thin-client work
- [Phase 11](./implementation-plan.md#phase-11--mobile-social-app--mobile-node-capacitor) — The deprecated Capacitor full-node phase
- [Phase 11B (`mobile-identity`)](./implementation-plan.md#phase-11b--mobile-identity--pure-js-ed25519) — Pure-JS Ed25519 + identity import
- [Phase 11C (`mobile-node`)](./implementation-plan.md#phase-11c--mobile-node--in-process-nodeservice--relay-only-transport) — In-process `NodeService` for the Capacitor app
