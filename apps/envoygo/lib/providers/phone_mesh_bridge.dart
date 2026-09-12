import 'package:envoy_mesh/envoy_mesh_social.dart';
import 'package:envoy_mesh_libp2p/envoy_mesh_libp2p.dart';
import 'package:envoy_mesh_libp2p/envoy_mesh_libp2p_social.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../connection/phone_mesh_bridge.dart';
import 'social_context_provider.dart';

/// Product-side implementation of [PhoneMeshBackendBridge].
///
/// The phone-mesh runtime lives in the connection layer and must not import the
/// phone social backend (`PhoneSocialBackend`, `PhoneDiscoverySession`,
/// `Libp2pMeshEnvelopeTransport` — all product-bound). This adapter is the
/// other half of that inversion (Workstream A5): it binds the runtime's
/// transport/session/discovery calls to the live backend from
/// `social_context_provider.dart`.
class PhoneSocialMeshBridge implements PhoneMeshBackendBridge {
  PhoneSocialMeshBridge(this._ref);

  final Ref _ref;

  PhoneSocialBackend? get _backend => _ref.read(phoneSocialBackendProvider);

  PhoneBackendHolderNotifier get _holder =>
      _ref.read(phoneBackendHolderProvider.notifier);

  @override
  bool get isReady => _backend != null;

  @override
  Object? get lastLoadError => _holder.lastLoadError;

  @override
  void retryLoad() => _holder.retryEnsure();

  @override
  void attachTransport(Libp2pNode node) {
    _backend?.replaceTransport(Libp2pMeshEnvelopeTransport(node));
  }

  @override
  PhoneMeshDiscoveryBridge createDiscovery(Libp2pNode node) {
    return _PhoneDiscoveryBridge(
      PhoneDiscoverySession(node: node, backend: _backend!),
    );
  }

  @override
  Future<void> handleInboundStream({
    required P2PStream stream,
    required PeerId remotePeer,
    required String protocolId,
  }) async {
    final backend = _backend;
    if (backend == null) return;
    await handleInboundPhoneMeshStream(
      stream: stream,
      remotePeer: remotePeer,
      protocolId: protocolId,
      backend: backend,
    );
  }
}

class _PhoneDiscoveryBridge implements PhoneMeshDiscoveryBridge {
  _PhoneDiscoveryBridge(this._session);

  final PhoneDiscoverySession _session;

  @override
  bool get isActive => _session.isActive;

  @override
  bool get mdnsActive => _session.mdnsActive;

  @override
  Future<void> start() => _session.start();

  @override
  Future<bool> ensureMdns() => _session.ensureMdns();

  @override
  Future<void> stop() => _session.stop();
}

/// Installs the phone-mesh bridge for this container.
///
/// Read once at app start (`main.dart`), like `homeProductSyncProvider`.
final phoneMeshBridgeProvider = Provider<PhoneSocialMeshBridge>((ref) {
  final bridge = PhoneSocialMeshBridge(ref);
  ref.read(phoneMeshBridgeRegistryProvider).install(bridge);
  return bridge;
});
