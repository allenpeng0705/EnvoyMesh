# envoy_thin_client — Level-1 thin-client SDK

Pure-Dart pairing + JSON-RPC client for talking to an **Envoy home node**.

This is **Level 1** of the Envoy mobile SDK: your app is a remote UI; the home
computer runs the full mesh.

## When to use Level 1 only

- You want terminals, vault, Family, Knowledge, Home Social via the paired node
- You do **not** need an independent “On this phone” social identity
- You want the smallest dependency surface (no dart_libp2p / EMP signing)

```
YourApp ── envoy_thin_client ──► Home Node (mesh, vault, Social, …)
```

## Level 2 (optional)

If you also want a separate on-device social persona (bonds/chat/discover while
the app is open), add:

| Package | Role |
|---------|------|
| [`envoy_mesh`](../envoy-mesh-dart) | Phone identity + EMP + `PhoneSocialBackend` |
| [`envoy_mesh_libp2p`](../envoy-mesh-libp2p-dart) | Shared libp2p host, mesh session, WAN/LAN discovery |

See the Level-2 README for encapsulation rules (no auto-merge of Home↔phone).

## Public API (summary)

```dart
import 'package:envoy_thin_client/envoy_thin_client.dart';

final pairing = parsePairingUri(qrText);
final client = HomeRemoteClient(/* … */);
await client.connect();
// JSON-RPC methods + push events
```

Exports: `HomeRemoteClient`, `CandidateResolver`, `ReconnectSupervisor`,
`ClientProxyTransport`, `parsePairingUri`, JSON-RPC models, `WebSocketLike`.

`PlatformWebSocket` is **not** barrel-exported (keeps web-safe imports); use
`package:envoy_thin_client/services/platform_web_socket.dart` on IO.
