import 'dart:async';

import 'package:dart_libp2p/core/network/common.dart';
import 'package:dart_libp2p/core/network/rcmgr.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart'; // For concrete PeerId
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/p2p/host/resource_manager/limit.dart';
import 'package:dart_libp2p/p2p/host/resource_manager/resource_manager_impl.dart';
import 'package:dart_libp2p/p2p/host/resource_manager/scope_impl.dart';
import 'package:dart_libp2p/p2p/host/resource_manager/scopes/peer_scope_impl.dart';
import 'package:dart_libp2p/p2p/host/resource_manager/scopes/transient_scope_impl.dart'; // Added import
import 'package:dart_libp2p/p2p/host/resource_manager/scopes/system_scope_impl.dart';   // Added import
import 'package:dart_libp2p/core/network/errors.dart' as network_errors; // Added import

// Debug logging removed to reduce console noise

class ConnectionScopeImpl extends ResourceScopeImpl implements ConnManagementScope {
  final Direction direction;
  final bool useFd;
  final MultiAddr remoteEndpoint;
  final ResourceManagerImpl _rcmgr; // Added ResourceManagerImpl reference

  PeerScopeImpl? _peerScopeImpl; // Concrete type for internal use

  // TODO: Add isAllowlisted field and logic if allowlisting is implemented.

  ConnectionScopeImpl(
    this._rcmgr, // Added rcmgr parameter
    Limit limit,
    String name,
    this.direction,
    this.useFd,
    this.remoteEndpoint, {
    List<ResourceScopeImpl>? edges, // Typically transient and system scopes
  }) : super(limit, name, edges: edges);

  @override
  PeerScope? get peerScope => _peerScopeImpl;

  @override
  Future<void> setPeer(PeerId peerId) async {
    if (_peerScopeImpl != null) {
      throw Exception('$name: connection scope already attached to a peer: ${_peerScopeImpl!.name}');
    }



    // 1. Get PeerScope from the ResourceManager.
    // Note: _rcmgr._getPeerScope is not public, but ConnectionScopeImpl is in the same library.
    // A cleaner way might be for ResourceManagerImpl to expose a method like `internalGetPeerScope`.
    // For now, direct access is assumed as they are tightly coupled.
    final newPeerScope = _rcmgr.getPeerScopeInternal(peerId); 

    // 2. Identify original transient scope and get the global system scope.
    // ConnectionScopeImpl is initially parented only by the transient scope.
    if (edges.isEmpty || edges[0] is! TransientScopeImpl) {

        throw StateError('$name: Expected initial parent to be TransientScopeImpl.');
    }
    final transientScope = edges[0] as TransientScopeImpl;
    // Get the system scope from the resource manager.
    // This assumes _rcmgr.systemScope provides the correct SystemScopeImpl instance.
    final systemScope = _rcmgr.systemScope;


    // 3. Resource Juggling
    // Get current stats of this connection scope.
    // These resources were initially reserved against the transient scope (and system).
    // final currentStats = stat; // Not directly needed if addConn/removeConn handle their own accounting.

    network_errors.ResourceLimitExceededException? reservationError;
    try {
      // Reserve in the new peer scope.
      // addConn will attempt to reserve resources and propagate to its parents (system).
      try {
        newPeerScope.addConn(direction, useFd);
      } on network_errors.ResourceLimitExceededException catch (e) {
        reservationError = e;
      }
      // Other exceptions will propagate up and be caught by the outer try-catch

      if (reservationError == null) {
        // If reservation in peer scope is successful, release from transient scope.
        // removeConn will release resources and propagate to its parents (system).
        transientScope.removeConn(direction, useFd); 
        // Note: Memory associated with the connection is handled by addConn/removeConn internally.

        // Update internal state and edges
        _peerScopeImpl = newPeerScope;
        // The connection scope is now parented by the specific peer scope and the global system scope.
        // The peer scope itself is parented by the system scope.
        this.edges = [newPeerScope, systemScope]; 

        // Decrement ref count of transient scope as this connection is no longer its direct child for these resources.
        // This is tricky: the transient scope itself is a long-lived scope.
        // The resources are moved, not the scope itself being "done".
        // The original `addConn` on `this` (ConnectionScopeImpl) during `ResourceManagerImpl.openConnection`
        // reserved against its initial parents (transient, system).
        // Calling `transientScope.removeConn` correctly decrements the counts on the transient scope
        // and its parent (system).
        // The ref counts on transient/system scopes are managed by their lifecycle, not per-resource juggling.


      }
    } on network_errors.ResourceLimitExceededException catch (e) {
      reservationError = e;
    }

    if (reservationError != null) {
      // Failed to reserve in peer scope.
      // Rollback is tricky. The connection is already open.
      // The Go version might close the connection here or mark it as unmanaged.
      // For now, we'll throw, indicating failure to associate with peer.
      // The caller (likely network layer) would then decide to close the connection.

      throw reservationError;
    }
  }

  // ConnManagementScope also implements ResourceScopeSpan, so done() is inherited from ResourceScopeImpl.
  // No need to override `done()` unless connection-specific cleanup is needed beyond base scope.
}
