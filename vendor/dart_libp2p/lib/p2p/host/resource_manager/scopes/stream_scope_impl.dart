import 'dart:async';

import 'package:dart_libp2p/core/network/common.dart';
import 'package:dart_libp2p/core/network/rcmgr.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart' as concrete_peer_id; // For concrete PeerId type
import 'package:dart_libp2p/core/protocol/protocol.dart';
import 'package:dart_libp2p/p2p/host/resource_manager/limit.dart';
import 'package:dart_libp2p/p2p/host/resource_manager/resource_manager_impl.dart';
import 'package:dart_libp2p/p2p/host/resource_manager/scope_impl.dart';
import 'package:dart_libp2p/p2p/host/resource_manager/scopes/peer_scope_impl.dart';
import 'package:dart_libp2p/p2p/host/resource_manager/scopes/protocol_scope_impl.dart';
import 'package:dart_libp2p/p2p/host/resource_manager/scopes/service_scope_impl.dart';
import 'package:dart_libp2p/p2p/host/resource_manager/scopes/transient_scope_impl.dart'; // Added
import 'package:dart_libp2p/p2p/host/resource_manager/scopes/system_scope_impl.dart';   // Added
import 'package:dart_libp2p/core/network/errors.dart' as network_errors;
import 'package:logging/logging.dart'; // Added



class StreamScopeImpl extends ResourceScopeImpl implements StreamManagementScope {
  final Direction direction;
  
  final Logger _logger = Logger('StreamScopeImpl'); // Added logger
  
  // References to associated scopes. These are set via setProtocol/setService.
  ProtocolScopeImpl? _protocolScopeImpl;
  ServiceScopeImpl? _serviceScopeImpl;
  PeerScopeImpl _peerScopeImpl; // Should be set at creation or early on.

  // In Go, streamScope also holds references to peerProtoScope and peerSvcScope,
  // which are sub-scopes under protocol/service for that specific peer.
  // This adds another layer of granularity.
  ResourceScopeImpl? _peerProtoScope;
  ResourceScopeImpl? _peerSvcScope;

  final ResourceManagerImpl _rcmgr; // Added ResourceManagerImpl reference

  StreamScopeImpl(
    this._rcmgr, // Added rcmgr parameter
    Limit limit,
    String name,
    this.direction,
    this._peerScopeImpl, // PeerScope is fundamental to a stream
    {List<ResourceScopeImpl>? edges} // Initial edges: peer, transient, system
  ) : super(limit, name, edges: edges);

  @override
  ProtocolScope? get protocolScope => _protocolScopeImpl;

  @override
  ServiceScope? get serviceScope => _serviceScopeImpl;

  @override
  PeerScope get peerScope => _peerScopeImpl; // Already a PeerScopeImpl

  @override
  Future<void> setProtocol(ProtocolID protocol) async {
    if (_protocolScopeImpl != null) {
      _logger.severe('$name: stream scope already attached to a protocol: ${_protocolScopeImpl!.protocol}');
      throw Exception('$name: stream scope already attached to a protocol: ${_protocolScopeImpl!.protocol}');
    }
    _logger.fine('$name: Setting protocol to $protocol for peer ${_peerScopeImpl.peer}');

    // 1. Get necessary scopes from ResourceManager
    final newProtocolScope = _rcmgr.getProtocolScopeInternal(protocol);
    final systemScope = _rcmgr.systemScope; 
    final limiter = _rcmgr.limiter;
    
    // Explicitly cast to the concrete PeerId type
    final newPeerProtoScope = newProtocolScope.getPeerSubScope(
      _peerScopeImpl.peer as concrete_peer_id.PeerId, 
      limiter, 
      systemScope
    );

    // 2. Identify original transient scope
    // Initial edges for a stream are [peerScope, transientScope, systemScope]
    ResourceScopeImpl? transientScope;
    for (final edge in edges) {
      if (edge.name == 'transient' && edge is TransientScopeImpl) {
        transientScope = edge;
        break;
      }
    }
    if (transientScope == null) {
      _logger.fine('$name: Edges: ${edges.map((e) => e.name).join(', ')}');
      throw StateError('$name: Transient scope not found in initial edges for juggling.');
    }

    // 3. Resource Juggling
    network_errors.ResourceLimitExceededException? reservationError;
    // bool reservedInProto = false; // Removed: Direct reservation on protocolScope is removed.
    bool reservedInPeerProto = false;

    try {
      // Reserve in PeerProtoScope (this will also reserve in its parent ProtocolScope and SystemScope)
      try {
        newPeerProtoScope.addStream(direction);
        reservedInPeerProto = true;
      } on network_errors.ResourceLimitExceededException catch (e) {
       _logger.severe('Failed to add stream - $direction - $e') ;
        reservationError = e;
      } 
      // Other exceptions will propagate up and be caught by the outer try-catch

      if (reservationError == null) {
        // Reservation successful, release from original TransientScope
        // No need to check for errors here as removeStream is void and shouldn't fail in a way that needs rollback here
        (transientScope as TransientScopeImpl).removeStream(direction);

        // Update internal state
        _protocolScopeImpl = newProtocolScope; // Still useful to store this reference
        _peerProtoScope = newPeerProtoScope;
        
        // New edges for the stream scope: its peer and the specific peer-protocol scope.
        // Resource accounting will flow up from peerProtoScope to protocolScope and systemScope.
        
        // Manage ref counts for edge changes
        List<ResourceScopeImpl> oldEdges = List.from(this.edges);
        List<ResourceScopeImpl> newEdges = [_peerScopeImpl, newPeerProtoScope];

        for (var oldEdge in oldEdges) {
          if (!newEdges.contains(oldEdge)) {
            oldEdge.decRef();
          }
        }
        for (var newEdge in newEdges) {
          if (!oldEdges.contains(newEdge)) {
            newEdge.incRef();
          }
        }
        this.edges = newEdges;
        
        _logger.fine('$name: Successfully set protocol to $protocol. Resources transferred, edges updated.');
      }
    } on network_errors.ResourceLimitExceededException catch (e) {
      reservationError = e;
    } catch (e) { // Catch other exceptions during reservation attempts
      _logger.severe('$name: Unexpected error during setProtocol resource juggling: $e');
      // Ensure reservationError is set if it's a limit issue, otherwise rethrow or handle.
      if (e is Exception && reservationError == null) { // Avoid overwriting a specific limit error
         // Wrap it or handle as a generic failure
        throw Exception('$name: Failed to set protocol due to an unexpected error: $e');
      }
      // If it was a limit error, reservationError should already be set.
      // If it's another type of error that wasn't caught by the specific `else { throw err; }`
      // it will be caught here. If reservationError is still null, it means it's not a limit error.
      if (reservationError == null && e is! network_errors.ResourceLimitExceededException) {
          throw e; // Rethrow if not a limit error and not already handled
      }
    }


    if (reservationError != null) {
      // Rollback successful reservations
      if (reservedInPeerProto) {
        // This will also trigger release from its parents (protocolScope, systemScope)
        newPeerProtoScope.removeStream(direction);
      }
      // No direct reservation on newProtocolScope, so no direct rollback needed for it.
      _logger.fine('$name: Failed to reserve resources for protocol $protocol: $reservationError.');
      throw reservationError;
    }
  }

  @override
  Future<void> setService(String serviceName) async {
    if (_serviceScopeImpl != null) {
      throw Exception('$name: stream scope already attached to a service: ${_serviceScopeImpl!.name}');
    }
    if (_protocolScopeImpl == null || _peerProtoScope == null) {
      throw StateError('$name: stream scope not attached to a protocol before setting service');
    }
    _logger.fine('$name: Setting service to $serviceName for peer ${_peerScopeImpl.peer}, protocol ${_protocolScopeImpl!.protocol}');

    // 1. Get necessary scopes
    final newServiceScope = _rcmgr.getServiceScopeInternal(serviceName);
    final systemScope = _rcmgr.systemScope;
    final limiter = _rcmgr.limiter;

    // Explicitly cast to the concrete PeerId type
    final newPeerSvcScope = newServiceScope.getPeerSubScope(
      _peerScopeImpl.peer,
      limiter, 
      systemScope
    );

    // 2. Resource Juggling (Reserve in new scopes, no release from prior scopes like transient)
    // Streams are typically additive to service scopes on top of protocol scopes.
    network_errors.ResourceLimitExceededException? reservationError;
    bool reservedInSvc = false;
    bool reservedInPeerSvc = false;

    try {
      try {
        newServiceScope.addStream(direction);
        reservedInSvc = true;
      } on network_errors.ResourceLimitExceededException catch (e) {
        _logger.severe('Failed to add stream to new service scope - $direction - $e') ;
        reservationError = e;
      }
      // Other exceptions will propagate up

      if (reservationError == null) {
        try {
          newPeerSvcScope.addStream(direction);
          reservedInPeerSvc = true;
        } on network_errors.ResourceLimitExceededException catch (e) {
          _logger.severe('Failed to add stream to new peer service scope - $direction - $e') ;
          reservationError = e;
        }
        // Other exceptions will propagate up
      }

      if (reservationError == null) {
        _serviceScopeImpl = newServiceScope;
        _peerSvcScope = newPeerSvcScope;
        // Update edges: Stream is now primarily parented by its peer, its peer-protocol scope, and its peer-service scope.
        // Propagation to global protocol, global service, and system scopes will occur from these.
        List<ResourceScopeImpl> oldEdges = List.from(this.edges);
        List<ResourceScopeImpl> newEdges = [
          _peerScopeImpl,
          _peerProtoScope!, // Known to be non-null from check above
          newPeerSvcScope
        ];

        for (var oldEdge in oldEdges) {
          if (!newEdges.contains(oldEdge)) {
            oldEdge.decRef();
          }
        }
        for (var newEdge in newEdges) {
          if (!oldEdges.contains(newEdge)) {
            newEdge.incRef();
          }
        }
        this.edges = newEdges;
        
        _logger.fine('$name: Successfully set service to $serviceName. Edges updated.');
      }
    } on network_errors.ResourceLimitExceededException catch (e) {
      _logger.severe('Resource limits exceeded - $e') ;
      reservationError = e;
    } catch (e) {
       _logger.severe('$name: Unexpected error during setService resource juggling: $e');
       if (e is Exception && reservationError == null) {
        throw Exception('$name: Failed to set service due to an unexpected error: $e');
      }
    }

    if (reservationError != null) {
      if (reservedInPeerSvc) newPeerSvcScope.removeStream(direction);
      if (reservedInSvc) newServiceScope.removeStream(direction);
      _logger.fine('$name: Failed to reserve resources for service $serviceName: $reservationError.');
      throw reservationError;
    }
  }

  // Inherits done() from ResourceScopeImpl.
}
