import 'package:dart_libp2p/core/network/rcmgr.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart'; // Corrected for concrete PeerId
import 'package:dart_libp2p/core/protocol/protocol.dart';
import 'package:dart_libp2p/p2p/host/resource_manager/limit.dart';
import 'package:dart_libp2p/p2p/host/resource_manager/limiter.dart'; // Added for Limiter
import 'package:dart_libp2p/p2p/host/resource_manager/scope_impl.dart';

/// ProtocolScopeImpl is the concrete implementation for protocol-specific scopes.
class ProtocolScopeImpl extends ResourceScopeImpl implements ProtocolScope {
  @override
  final ProtocolID protocol;

  final Map<PeerId, ResourceScopeImpl> _peerSubScopes = {};

  // In Go, protocolScope also holds a map of peer sub-scopes: `peers map[peer.ID]*resourceScope`
  // and a reference to the resourceManager.
  // We might need to add similar functionality here if protocols have per-peer limits within them.

  ProtocolScopeImpl(Limit limit, this.protocol, {List<ResourceScopeImpl>? edges})
      : super(limit, 'protocol:$protocol', edges: edges); // Scope name is prefixed

  // The `protocol` getter is fulfilled by the final field.

  ResourceScopeImpl getPeerSubScope(PeerId peerId, Limiter limiter, ResourceScopeImpl systemScope) {
    return _peerSubScopes.putIfAbsent(peerId, () {
      final peerProtocolLimit = limiter.getProtocolPeerLimits(this.protocol, peerId);
      final scopeName = 'protocol:${protocol.toString()}-peer:${peerId.toString()}';
      
      final newPeerSubScope = ResourceScopeImpl(
        peerProtocolLimit,
        scopeName,
        edges: [this, systemScope], // Parent is this protocol scope and system scope
      );
      newPeerSubScope.incRef(); // This sub-scope is now in use
      return newPeerSubScope;
    });
  }
}
