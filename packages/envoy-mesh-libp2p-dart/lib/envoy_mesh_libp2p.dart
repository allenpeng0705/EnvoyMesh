/// Level-2 EnvoyMesh libp2p adapters (shared host + phone mesh + discovery).
///
/// Pair with [envoy_thin_client] for home JSON-RPC. Pure Dart (no Flutter SDK).
library;

export 'package:dart_libp2p/dart_libp2p.dart'
    show AddrInfo, MultiAddr, P2PStream, PeerId;
export 'package:envoy_mesh/envoy_mesh.dart';

export 'src/libp2p_mesh_envelope_transport.dart';
export 'src/libp2p_node.dart';
export 'src/phone_discovery_session.dart';
export 'src/phone_mesh_session.dart';
export 'src/seed_store.dart';
