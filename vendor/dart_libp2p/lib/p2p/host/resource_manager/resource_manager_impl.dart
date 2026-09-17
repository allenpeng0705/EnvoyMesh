import 'dart:async';

import 'package:dart_libp2p/core/network/rcmgr.dart';
import 'package:dart_libp2p/core/network/common.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart'; // Provides concrete PeerId
import 'package:dart_libp2p/core/protocol/protocol.dart';
import 'package:dart_libp2p/core/multiaddr.dart'; // Corrected import
import 'package:dart_libp2p/p2p/host/resource_manager/limiter.dart';
import 'package:dart_libp2p/p2p/host/resource_manager/scope_impl.dart';
import 'package:dart_libp2p/p2p/host/resource_manager/scopes/system_scope_impl.dart';
import 'package:dart_libp2p/p2p/host/resource_manager/scopes/transient_scope_impl.dart';
import 'package:dart_libp2p/p2p/host/resource_manager/scopes/service_scope_impl.dart';
import 'package:dart_libp2p/p2p/host/resource_manager/scopes/protocol_scope_impl.dart';
import 'package:dart_libp2p/p2p/host/resource_manager/scopes/peer_scope_impl.dart';
import 'package:dart_libp2p/p2p/host/resource_manager/scopes/connection_scope_impl.dart'; // Added import
import 'package:dart_libp2p/p2p/host/resource_manager/scopes/stream_scope_impl.dart'; // Added import
import 'package:dart_libp2p/core/network/errors.dart' as network_errors;
import 'package:logging/logging.dart';

// A simple logger placeholder


class ResourceManagerImpl implements ResourceManager {

  final Logger _logger = Logger('ResourceManagerImpl');

  final Limiter _limiter;
  Limiter get limiter => _limiter; // Public getter

  late final SystemScopeImpl _systemScope;
  SystemScopeImpl get systemScope => _systemScope; // Public getter

  late final TransientScopeImpl _transientScope;
  // TODO: Add allowlisted scopes later
  // late final SystemScopeImpl _allowlistedSystemScope;
  // late final ResourceScopeImpl _allowlistedTransientScope;

  final Map<String, ServiceScopeImpl> _serviceScopes = {}; // Use ServiceScopeImpl
  final Map<ProtocolID, ProtocolScopeImpl> _protocolScopes = {}; // Use ProtocolScopeImpl
  final Map<PeerId, PeerScopeImpl> _peerScopes = {}; // Use PeerScopeImpl

  // For managing "sticky" scopes that shouldn't be GC'd
  final Set<ProtocolID> _stickyProtocols = {};
  final Set<PeerId> _stickyPeers = {};
  // Services are typically sticky by nature of being long-lived

  Timer? _gcTimer;

  // TODO: Add connLimiter, trace, metrics later

  ResourceManagerImpl({Limiter? limiter}) : _limiter = limiter ?? FixedLimiter() {
    _systemScope = SystemScopeImpl(_limiter.getSystemLimits(), 'system');
    _systemScope.incRef(); // System scope is always active

    _transientScope = TransientScopeImpl(
      _limiter.getTransientLimits(),
      'transient',
      edges: [_systemScope], // Transient is a child of System
    );
    _transientScope.incRef(); // Transient scope is always active

    // TODO: Initialize allowlisted scopes
    // _allowlistedSystemScope = ResourceScopeImpl(_limiter.getAllowlistedSystemLimits(), 'allowlistedSystem');
    // _allowlistedSystemScope.incRef();
    // _allowlistedTransientScope = ResourceScopeImpl(
    //   _limiter.getAllowlistedTransientLimits(),
    //   'allowlistedTransient',
    //   edges: [_allowlistedSystemScope],
    // );
    // _allowlistedTransientScope.incRef();

    _startGarbageCollector();
    _logger.fine('ResourceManager initialized.');
  }

  void _startGarbageCollector() {
    _gcTimer = Timer.periodic(const Duration(minutes: 1), (timer) {
      _gc();
    });
  }

  void _gc() {
    _logger.fine('Running GC...');
    // GC Protocol Scopes
    _protocolScopes.removeWhere((id, scope) {
      if (_stickyProtocols.contains(id)) return false;
      if (scope.isUnused()) {
        scope.done();
        _logger.fine('GC: Removed unused protocol scope: $id');
        return true;
      }
      return false;
    });

    // GC Peer Scopes
    final deadPeers = <PeerId>[];
    _peerScopes.removeWhere((id, scope) {
      if (_stickyPeers.contains(id)) return false;
      if (scope.isUnused()) {
        scope.done();
        _logger.fine('GC: Removed unused peer scope: $id');
        deadPeers.add(id);
        return true;
      }
      return false;
    });

    // TODO: In Go, GC also cleans up peer entries within service/protocol scopes.
    // This requires more complex logic if ServiceScopeImpl/ProtocolScopeImpl manage their own peer sub-scopes.
    // For now, this basic GC handles top-level peer and protocol scopes.
    _logger.fine('GC finished.');
  }

  @override
  Future<ConnManagementScope> openConnection(Direction direction, bool useFd, MultiAddr remoteAddr) async {
    // TODO: Implement IP-based connection limiting (connLimiter from Go)
    // TODO: Handle allowlisted connections
    // TODO: Determine correct limit (system/transient or allowlisted)

    final connLimit = _limiter.getConnLimits();
    final connName = 'conn-${DateTime.now().millisecondsSinceEpoch}-${remoteAddr.toString().hashCode % 10000}';
    final concreteConnScope = ConnectionScopeImpl(
      this, // Pass ResourceManagerImpl instance
      connLimit,
      connName,
      direction,
      useFd,
      remoteAddr,
      edges: [_transientScope], // TransientScope will propagate to SystemScope
    );

    // Attempt to reserve resources for the connection itself
    // addConn is an internal method of ResourceScopeImpl, ConnectionScopeImpl inherits it.
    try {
      concreteConnScope.addConn(direction, useFd);
    } catch (e) {
      _logger.severe('$e');
      concreteConnScope.done();
      // TODO: metrics.BlockConn(dir, usefd);
      rethrow; // Rethrow the exception caught from addConn
    }

    // TODO: metrics.AllowConn(dir, usefd);
    _logger.fine('Opened connection scope: ${concreteConnScope.name}');
    return concreteConnScope;
  }

  @override
  Future<StreamManagementScope> openStream(PeerId peer, Direction direction) async {
    final concretePeerId = peer ;
    final peerScope = getPeerScopeInternal(concretePeerId); // Corrected method name

    final streamLimit = _limiter.getStreamLimits(concretePeerId);
    final streamName = 'stream-${DateTime.now().millisecondsSinceEpoch}-${peer.toString().hashCode % 10000}';
    final concreteStreamScope = StreamScopeImpl(
      this, // Pass ResourceManagerImpl instance
      streamLimit,
      streamName,
      direction,
      peerScope, // Pass the concrete PeerScopeImpl
      edges: [peerScope, _transientScope], // Reverted: PeerScope and TransientScope will propagate to SystemScope
    );

    try {
      concreteStreamScope.addStream(direction);
    } catch (e) {
      _logger.severe('$e');
      concreteStreamScope.done();
      // TODO: metrics.BlockStream(p, dir);
      rethrow; // Rethrow the exception caught from addStream
    }

    // TODO: metrics.AllowStream(p, dir);
    _logger.fine('Opened stream scope: ${concreteStreamScope.name} for peer ${peer.toString()}');
    return concreteStreamScope;
  }

  // Renamed from _getServiceScope
  ServiceScopeImpl getServiceScopeInternal(String service) { 
    return _serviceScopes.putIfAbsent(service, () {
      _logger.fine('Creating new service scope: $service');
      // Use ServiceScopeImpl constructor
      final scope = ServiceScopeImpl( 
        _limiter.getServiceLimits(service),
        service, // Pass the service name directly for the 'name' field in ServiceScopeImpl
        edges: [_systemScope],
      );
      scope.incRef(); // Service scopes are generally long-lived
      return scope;
    });
  }

  // Renamed from _getProtocolScope
  ProtocolScopeImpl getProtocolScopeInternal(ProtocolID protocol) { 
    return _protocolScopes.putIfAbsent(protocol, () {
      _logger.fine('Creating new protocol scope: $protocol');
      // Use ProtocolScopeImpl constructor
      final scope = ProtocolScopeImpl(
        _limiter.getProtocolLimits(protocol),
        protocol, // Pass the protocol ID directly
        edges: [_systemScope],
      );
      scope.incRef();
      return scope;
    });
  }

  // Renamed from _getPeerScope to be accessible within the library for ConnectionScopeImpl etc.
  PeerScopeImpl getPeerScopeInternal(PeerId peer) { 
    return _peerScopes.putIfAbsent(peer, () {
      _logger.fine('Creating new peer scope: $peer');
      // Use PeerScopeImpl constructor
      final scope = PeerScopeImpl(
        _limiter.getPeerLimits(peer),
        peer, // Pass the PeerId directly
        edges: [_systemScope],
      );
      scope.incRef();
      return scope;
    });
  }


  @override
  Future<T> viewSystem<T>(Future<T> Function(ResourceScope scope) f) async {
    return await f(_systemScope);
  }

  @override
  Future<T> viewTransient<T>(Future<T> Function(ResourceScope scope) f) async {
    return await f(_transientScope);
  }

  @override
  Future<T> viewService<T>(String serviceName, Future<T> Function(ServiceScope scope) f) async {
    final scope = getServiceScopeInternal(serviceName);
    // This requires ServiceScopeImpl to implement ServiceScope and extend ResourceScopeImpl
    try {
      // The cast is now valid as getServiceScopeInternal returns ServiceScopeImpl
      return await f(scope);
    } finally {
      // Ref counting considerations remain.
    }
  }

  @override
  Future<T> viewProtocol<T>(ProtocolID protocol, Future<T> Function(ProtocolScope scope) f) async {
    final scope = getProtocolScopeInternal(protocol);
    // The cast is now valid as getProtocolScopeInternal returns ProtocolScopeImpl
    return await f(scope);
  }

  @override
  Future<T> viewPeer<T>(PeerId peer, Future<T> Function(PeerScope scope) f) async {
    // Assuming PeerId can be used where PeerId is expected
    final scope = getPeerScopeInternal(peer);
    // The cast is now valid as getPeerScopeInternal returns PeerScopeImpl
    return await f(scope);
  }

  @override
  Future<void> close() async {
    _logger.fine('Closing ResourceManager...');
    _gcTimer?.cancel();
    // TODO: Clean up all scopes properly.
    // For now, just mark system and transient as done.
    // This doesn't release resources from children correctly, needs full teardown.
    _transientScope.done();
    _systemScope.done();
    _logger.fine('ResourceManager closed.');
  }

  // Methods for managing sticky scopes (not part of public ResourceManager interface yet)
  void setStickyProtocol(ProtocolID proto) {
    _stickyProtocols.add(proto);
    getProtocolScopeInternal(proto); // Ensure it exists
  }

  void clearStickyProtocol(ProtocolID proto) {
    _stickyProtocols.remove(proto);
  }

  void setStickyPeer(PeerId peer) {
    _stickyPeers.add(peer);
    getPeerScopeInternal(peer); // Ensure it exists
  }

  void clearStickyPeer(PeerId peer) {
    _stickyPeers.remove(peer);
  }
}
