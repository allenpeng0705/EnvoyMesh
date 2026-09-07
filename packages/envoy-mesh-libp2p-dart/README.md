# envoy_mesh_libp2p — Level-2 mobile mesh adapters

**Pure Dart** (no Flutter SDK). Shared `dart_libp2p` host + phone Social
session + WAN/LAN discovery for apps that want **both** a home thin client
and an independent on-device social node.

## Two-tier SDK (third-party apps)

| Level | Packages | What the app is |
|------:|----------|-----------------|
| **1** | [`envoy_thin_client`](../envoy-thin-client-dart) only | Thin client like classic EnvoyGo: pair to a **home node**, JSON-RPC only |
| **2** | `envoy_thin_client` + [`envoy_mesh`](../envoy-mesh-dart) + **this package** | Dual persona like current EnvoyGo: Home RPC **and** on-phone social-lite mesh |

```
Level 1                          Level 2
────────                         ────────
App                              App
 └─ envoy_thin_client             ├─ envoy_thin_client  → Home JSON-RPC
      → Home Node                      └─ envoy_mesh         → phone EMP / SocialBackend
                                           └─ envoy_mesh_libp2p → libp2p host + discovery
```

### Level 1 rules
- No `envoy_mesh` / `envoy_mesh_libp2p` required.
- Phone never signs Home-persona envelopes.
- Optional: use libp2p **only** as `client-proxy` transport to home (still L1).

### Level 2 rules
- Separate Envoy owner/device PEMs for the phone persona (`PhoneIdentityStore`).
- Shared libp2p PeerId (seed in [Libp2pSeedStore]) for home dial + phone mesh.
- Never auto-merge Home ↔ phone bonds/chats (suggestions only).
- Discovery (DHT / relay.checkin / mDNS) is **foreground + phone-context** only.

## What this package provides

| Type | Role |
|------|------|
| [Libp2pNode] | Shared host: TCP listen, DHT client, circuit reserve, mDNS |
| [PhoneMeshSession] | Register `/envoymesh/message|chat` handlers + relay reserve |
| [PhoneDiscoverySession] | Topic provide, relay checkin/lookup, LAN mDNS → `wanSearch` |
| [Libp2pMeshEnvelopeTransport] | `MeshEnvelopeTransport` over libp2p streams |
| [Libp2pSeedStore] | Inject secure storage (Keychain) or [MemoryLibp2pSeedStore] |

Social policy / EMP / `PhoneSocialBackend` live in **`envoy_mesh`**.
Pairing + `HomeRemoteClient` live in **`envoy_thin_client`**.

## Minimal Level-2 wiring

```dart
import 'package:envoy_mesh/envoy_mesh.dart';
import 'package:envoy_mesh_libp2p/envoy_mesh_libp2p.dart';
import 'package:envoy_thin_client/envoy_thin_client.dart';

// 1) Shared host (persist seed via your secure storage adapter)
final node = Libp2pNode(seedStore: MemoryLibp2pSeedStore());
await node.ensureTcpListen(
  bootstrapAddrs: defaultEnvoyCommunityRelayBootstrapAddrs,
);

// 2) Phone persona + backend
final persona = await PhoneIdentityStore.memory().loadOrCreate();
final backend = PhoneSocialBackend(
  persona: persona,
  transport: Libp2pMeshEnvelopeTransport(node),
);

// 3) Mesh listen + discovery while "phone Social" is foreground
final mesh = PhoneMeshSession(node);
await mesh.enable(
  onStream: (stream, peer, protocol) async {
    await handleInboundPhoneMeshStream(
      stream: stream,
      remotePeer: peer,
      protocolId: protocol,
      backend: backend,
    );
  },
);

final discovery = PhoneDiscoverySession(node: node, backend: backend);
await discovery.start(); // wires backend.replaceWanSearch

// 4) Tear down on Home switch / background
await discovery.stop();
await mesh.disable();
```

Home path stays ordinary thin-client:

```dart
final home = HomeRemoteClient(/* candidates, token */);
await home.connect();
// JSON-RPC: searchPeers, sendHello, … on the home node
```

## What stays in the app (EnvoyGo / your product)

- UI, navigation, Riverpod / state
- Secure storage adapter implementing [Libp2pSeedStore]
- SQLite / prefs for phone-local social snapshots
- Home-only features (Family, Knowledge, Market seller, …)
- iOS `NSLocalNetworkUsageDescription` + `NSBonjourServices` (`_p2p._udp`) for mDNS

## Dependency graph

```
envoy_thin_client     (L1 — pairing, HomeRemoteClient)
envoy_mesh            (L2 core — identity, EMP, PhoneSocialBackend)
envoy_mesh_libp2p     (L2 adapters — dart_libp2p; depends on both above)
```

## Status

Extracted from EnvoyGo (S6/S7) so third-party Flutter apps can take Level 2
without copying `apps/envoygo/lib/services/libp2p_node.dart`.
