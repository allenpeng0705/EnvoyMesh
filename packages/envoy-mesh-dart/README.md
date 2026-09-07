# envoy_mesh — Level-2 social-lite core (pure Dart)

Ed25519 identity/signing, EMP envelopes, and an in-process **phone** social
backend. No Flutter and no dart_libp2p — inject transport via
[MeshEnvelopeTransport].

## Two-tier SDK

| Level | Packages |
|------:|----------|
| **1** Thin client only | [`envoy_thin_client`](../envoy-thin-client-dart) |
| **2** Thin client + mobile node | L1 + **this package** + [`envoy_mesh_libp2p`](../envoy-mesh-libp2p-dart) |

```
Level 2 app
  ├─ envoy_thin_client   → Home persona (JSON-RPC)
  ├─ envoy_mesh          → Phone persona (EMP, PhoneSocialBackend)  ← you are here
  └─ envoy_mesh_libp2p   → libp2p host, discovery, live dial
```

## What this package provides

- `PhoneIdentityStore` / `PhonePersona` (Envoy owner + device PEMs)
- `signEnvoyEnvelope` / `verifyEnvoyEnvelope` (TS golden parity)
- `PhoneSocialBackend` implementing `SocialBackend` (profile, hello, bonds, 1:1 chat, local store)
- Discovery helpers: capability-topic CIDs, relay checkin/lookup payloads, `PhoneDiscoveryRuntime`
- Cross-persona suggestion matcher (ownerId equality; no auto-merge)

## What it does **not** provide

- libp2p host / DHT / mDNS → **`envoy_mesh_libp2p`**
- Home JSON-RPC → **`envoy_thin_client`**
- UI / Riverpod / SQLite adapters → your app (see EnvoyGo)

## Quick start (fake transport)

```dart
import 'package:envoy_mesh/envoy_mesh.dart';

final persona = await PhoneIdentityStore.memory().loadOrCreate();
final backend = PhoneSocialBackend(
  persona: persona,
  transport: FakeMeshEnvelopeTransport(),
);
await backend.updateHumanProfile({'displayName': 'Ada'});
```

Swap in live dial without dropping store state:

```dart
backend.replaceTransport(Libp2pMeshEnvelopeTransport(node)); // from envoy_mesh_libp2p
```

## Encapsulation rules

1. Home actions stay on the thin-client path; phone actions use this backend.
2. Never sign Home-owner envelopes on the phone.
3. Never auto-merge Home and phone contact/chat indexes.
4. WAN/LAN advertise only while phone Social is active and the app is foregrounded
   (wired by `PhoneDiscoverySession` in `envoy_mesh_libp2p`).
