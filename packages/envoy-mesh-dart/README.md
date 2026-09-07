# envoy_mesh — EnvoyMesh Dart social-lite SDK

**Status:** S3 extraction (2026-09-07). Used by EnvoyGo; intended for reuse by
other Flutter/Dart apps (thin client + independent social node).

## Two complementary packages

| Package | Role |
|---------|------|
| [`envoy_thin_client`](../envoy-thin-client-dart) | Pair to a **home node**; JSON-RPC over WS / client-proxy. No mesh signing. |
| **`envoy_mesh`** (this package) | **On-device** Envoy owner/device identity, EMP sign/verify, phone social-lite backend (bonds, hello, 1:1 DM store). |

An app can depend on either or both:

```
OtherApp
  ├─ envoy_thin_client  → Home Social / terminals / vault (RPC)
  └─ envoy_mesh         → Independent “On this phone” social persona
```

Inject live dial via `MeshEnvelopeTransport` (EnvoyGo: `Libp2pMeshEnvelopeTransport`).
`PhoneSocialBackend.replaceTransport` swaps fake → live without dropping store state.

## What stays in the app

- UI (Riverpod, screens)
- `dart_libp2p` host wiring (`Libp2pNode`, relay reserve) — inject via `MeshEnvelopeTransport`
- SQLite / secure storage adapters
- Home-only features (Family, Knowledge, AI, Market seller)

## Public API

```dart
import 'package:envoy_mesh/envoy_mesh.dart';

final persona = await PhoneIdentityStore.memory().create();
final backend = PhoneSocialBackend(
  persona: persona,
  transport: myLibp2pTransport, // implement MeshEnvelopeTransport
);
await backend.updateHumanProfile({'displayName': 'Ada'});
await backend.rememberPeer(...);
await backend.sendHello(...);
```

See ADR-0002 and `docs/envoygo-social-lite-wire-compat.md`.
