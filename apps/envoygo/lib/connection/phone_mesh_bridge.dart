/// The seam between the phone-mesh runtime and the phone-plane social backend.
///
/// ## Why this exists (Workstream A5, dependency inversion)
///
/// `PhoneMeshRuntimeNotifier` drives the on-device mesh: it boots the libp2p
/// host, enables the mesh session, runs WAN/LAN discovery and routes inbound
/// streams. Every one of those steps needs the *social backend* that owns the
/// phone persona — a product type — so the runtime used to import
/// `providers/social_context_provider.dart` and
/// `package:envoy_mesh_libp2p/envoy_mesh_libp2p_social.dart`, which made the
/// whole connection layer transitively product-bound.
///
/// This file declares what the runtime needs, using only reusable libp2p types
/// ([Libp2pNode], [P2PStream], [PeerId]). The product layer implements it in
/// `lib/providers/phone_mesh_bridge.dart` and installs it into
/// [PhoneMeshBridgeRegistry] at app start.
library;

import 'package:envoy_mesh_libp2p/envoy_mesh_libp2p.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// The phone-plane backend the mesh runtime drives.
abstract class PhoneMeshBackendBridge {
  /// True once the persona + store are loaded and the backend exists. While
  /// false the runtime nudges [retryLoad] and keeps retrying.
  bool get isReady;

  /// Last persona/store load error, for diagnostics only (`null` when fine).
  Object? get lastLoadError;

  /// Nudge a failed persona/store load (the loader retries on its own too).
  void retryLoad();

  /// Attach the live libp2p transport so phone DMs route over the mesh
  /// instead of the local fake transport.
  void attachTransport(Libp2pNode node);

  /// Create a discovery session (WAN advertise/lookup + mDNS) bound to this
  /// backend. Not started; the runtime starts it.
  PhoneMeshDiscoveryBridge createDiscovery(Libp2pNode node);

  /// Route one inbound mesh stream through the backend.
  Future<void> handleInboundStream({
    required P2PStream stream,
    required PeerId remotePeer,
    required String protocolId,
  });
}

/// A phone-plane discovery session (reusable surface for
/// `PhoneDiscoverySession`, which is product-bound because it signs discovery
/// envelopes with the phone persona).
abstract class PhoneMeshDiscoveryBridge {
  /// True while the runtime is running and bound to the current host epoch.
  bool get isActive;

  /// True when the mDNS/LAN plane is up.
  bool get mdnsActive;

  Future<void> start();

  /// (Re)try the mDNS plane; false when it is still not up.
  Future<bool> ensureMdns();

  Future<void> stop();
}

/// Holds the installed phone-mesh bridge for this container.
///
/// Same inversion as [HomeConnectionHooksRegistry]: the product layer installs
/// its implementation at app start (`main.dart` reads
/// `phoneMeshBridgeProvider`).
class PhoneMeshBridgeRegistry {
  PhoneMeshBackendBridge? _bridge;

  /// The installed bridge, or `null` when no product layer is present.
  PhoneMeshBackendBridge? get bridge => _bridge;

  void install(PhoneMeshBackendBridge bridge) {
    _bridge = bridge;
  }
}

/// Registry provider — see [PhoneMeshBridgeRegistry].
final phoneMeshBridgeRegistryProvider =
    Provider<PhoneMeshBridgeRegistry>((ref) {
  return PhoneMeshBridgeRegistry();
});
