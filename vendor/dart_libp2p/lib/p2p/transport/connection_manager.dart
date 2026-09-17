import 'dart:async';

import 'package:dart_libp2p/core/connmgr/conn_manager.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/network/notifiee.dart';
import 'package:dart_libp2p/core/network/transport_conn.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/p2p/transport/connection_state.dart';

/// Manages the lifecycle of connections
class ConnectionManager implements ConnManager {
  final _connections = <TransportConn, ConnectionState>{};
  final _stateControllers = <TransportConn, StreamController<ConnectionStateChange>>{};
  final _lastActivity = <TransportConn, DateTime>{};
  final _connectionTimeouts = <TransportConn, Timer>{};

  // Data structures for ConnManager interface
  final _tagInfo = <PeerId, TagInfo>{};
  final _protections = <PeerId, Set<String>>{};

  /// Custom notifiee for connection events
  final _notifiee = NotifyBundle();

  /// Duration after which an idle connection is considered stale
  final Duration idleTimeout;

  /// Duration to wait for graceful shutdown before forcing closure
  final Duration shutdownTimeout;

  int get activeConnections => _connections.values.where((state) => state == ConnectionState.active).length;

  /// Creates a new connection manager
  ConnectionManager({
    this.idleTimeout = const Duration(minutes: 5),
    this.shutdownTimeout = const Duration(seconds: 30),
  });

  /// Registers a new connection with the manager
  void registerConnection(TransportConn connection) {
    if (_connections.containsKey(connection)) {
      return;
    }

    final stateController = StreamController<ConnectionStateChange>.broadcast();
    _connections[connection] = ConnectionState.connecting;
    _stateControllers[connection] = stateController;
    _lastActivity[connection] = DateTime.now();

    // Start monitoring the connection and set initial state
    _monitorConnection(connection);
    updateState(connection, ConnectionState.ready);
  }

  /// Updates the state of a connection
  void updateState(TransportConn connection, ConnectionState newState, {Object? error}) {
    final currentState = _connections[connection];
    if (currentState == null) {
      // Connection not yet registered (e.g., constructor threw before registration).
      // Nothing to update — silently return.
      return;
    }

    if (currentState == newState) {
      return;
    }

    final stateChange = ConnectionStateChange(
      previousState: currentState,
      newState: newState,
      error: error,
    );

    _connections[connection] = newState;
    _stateControllers[connection]?.add(stateChange);

    // Update last activity timestamp for state changes
    if (newState == ConnectionState.active) {
      _updateActivityTimestamp(connection);
    }

    // Handle terminal states
    if (newState == ConnectionState.closed || newState == ConnectionState.error) {
      _cleanupConnection(connection);
    }
  }

  /// Records activity on a connection
  void recordActivity(TransportConn connection) {
    if (!_connections.containsKey(connection)) {
      throw StateError('Connection not registered with manager');
    }

    _updateActivityTimestamp(connection);

    // If connection was idle or ready, mark it as active
    final state = _connections[connection];
    if (state == ConnectionState.idle || state == ConnectionState.ready) {
      updateState(connection, ConnectionState.active);
    }
  }

  /// Gets the current state of a connection
  ConnectionState? getState(TransportConn connection) => _connections[connection];

  /// Gets the stream of state changes for a connection
  Stream<ConnectionStateChange>? getStateStream(TransportConn connection) {
    return _stateControllers[connection]?.stream;
  }

  /// Initiates graceful shutdown of a connection
  Future<void> closeConnection(TransportConn connection) async {
    final state = _connections[connection];
    if (state == null) {
      // Connection is already removed from manager, nothing to do
      return;
    }

    if (state == ConnectionState.closed || state == ConnectionState.error) {
      return;
    }

    // Start graceful shutdown
    updateState(connection, ConnectionState.closing);

    try {
      // Set up shutdown timeout
      final completer = Completer<void>();
      final timeout = Timer(shutdownTimeout, () {
        if (!completer.isCompleted) {
          completer.completeError(
            TimeoutException('Connection shutdown timed out after ${shutdownTimeout.inSeconds} seconds'),
          );
        }
      });

      try {
        // Attempt graceful shutdown
        await connection.close().timeout(shutdownTimeout);
        completer.complete();
      } catch (e) {
        if (!completer.isCompleted) {
          completer.completeError(e);
        }
      }

      // Wait for completion or timeout
      await completer.future;
      timeout.cancel();

      // Only update state if connection is still registered
      if (_connections.containsKey(connection)) {
        updateState(connection, ConnectionState.closed);
      }
    } catch (e) {
      // Only update state if connection is still registered
      if (_connections.containsKey(connection)) {
        updateState(connection, ConnectionState.error, error: e);
      }
      rethrow;
    }
  }

  /// Closes all managed connections
  Future<void> closeAll() async {
    final connections = List<TransportConn>.from(_connections.keys);
    await Future.wait(
      connections.map((conn) => closeConnection(conn)),
    );
  }

  /// Updates the last activity timestamp for a connection
  void _updateActivityTimestamp(TransportConn connection) {
    _lastActivity[connection] = DateTime.now();
    _resetIdleTimer(connection);
  }

  /// Resets the idle timer for a connection
  void _resetIdleTimer(TransportConn connection) {
    _connectionTimeouts[connection]?.cancel();
    _connectionTimeouts[connection] = Timer(idleTimeout, () {
      final state = _connections[connection];
      if (state == ConnectionState.active) {
        updateState(connection, ConnectionState.idle);
      }
    });
  }

  /// Monitors a connection for changes and manages its lifecycle
  void _monitorConnection(TransportConn connection) {
    // Monitor connection status
    Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!_connections.containsKey(connection)) {
        timer.cancel();
        return;
      }

      final state = _connections[connection];
      if (state == ConnectionState.closed || state == ConnectionState.error) {
        timer.cancel();
        return;
      }

      // Check if connection is still valid
      if (connection.isClosed) {
        updateState(connection, ConnectionState.closed);
        timer.cancel();
      }
    });
  }

  /// Cleans up resources associated with a connection
  void _cleanupConnection(TransportConn connection) {
    _connectionTimeouts[connection]?.cancel();
    _connectionTimeouts.remove(connection);
    _lastActivity.remove(connection);
    _stateControllers[connection]?.close();
    _stateControllers.remove(connection);
    _connections.remove(connection);
  }

  /// Disposes of the connection manager and releases all resources
  Future<void> dispose() async {
    await closeAll();
    for (final controller in _stateControllers.values) {
      await controller.close();
    }
    _stateControllers.clear();
    _connections.clear();
    _lastActivity.clear();
    for (final timer in _connectionTimeouts.values) {
      timer.cancel();
    }
    _connectionTimeouts.clear();
  }

  // ConnManager interface implementation

  @override
  void tagPeer(PeerId peerId, String tag, int value) {
    final info = _tagInfo[peerId];
    if (info != null) {
      // Create a new TagInfo with updated tags
      final updatedTags = Map<String, int>.from(info.tags);
      updatedTags[tag] = value;

      _tagInfo[peerId] = TagInfo(
        firstSeen: info.firstSeen,
        value: info.value,
        tags: updatedTags,
        conns: info.conns,
      );
    } else {
      // Create a new TagInfo
      final tags = <String, int>{tag: value};
      _tagInfo[peerId] = TagInfo(tags: tags);
    }
  }

  @override
  void untagPeer(PeerId peerId, String tag) {
    final info = _tagInfo[peerId];
    if (info != null) {
      final updatedTags = Map<String, int>.from(info.tags);
      updatedTags.remove(tag);

      _tagInfo[peerId] = TagInfo(
        firstSeen: info.firstSeen,
        value: info.value,
        tags: updatedTags,
        conns: info.conns,
      );
    }
  }

  @override
  void upsertTag(PeerId peerId, String tag, int Function(int) upsert) {
    final info = _tagInfo[peerId];
    if (info != null) {
      final updatedTags = Map<String, int>.from(info.tags);
      final currentValue = updatedTags[tag] ?? 0;
      final newValue = upsert(currentValue);
      updatedTags[tag] = newValue;

      _tagInfo[peerId] = TagInfo(
        firstSeen: info.firstSeen,
        value: info.value,
        tags: updatedTags,
        conns: info.conns,
      );
    } else {
      final tags = <String, int>{tag: upsert(0)};
      _tagInfo[peerId] = TagInfo(tags: tags);
    }
  }

  @override
  TagInfo? getTagInfo(PeerId peerId) {
    return _tagInfo[peerId];
  }

  @override
  Future<void> trimOpenConns() async {
    // This is a simple implementation that closes idle connections
    final now = DateTime.now();
    final idleConnections = _lastActivity.entries
        .where((entry) => now.difference(entry.value) > idleTimeout)
        .map((entry) => entry.key)
        .toList();

    for (final conn in idleConnections) {
      if (!isProtectedConnection(conn)) {
        await closeConnection(conn);
      }
    }
  }

  // Helper method to check if a connection is protected
  bool isProtectedConnection(TransportConn conn) {
    // Get peer ID from connection and check if it's protected
    final peerId = conn.remotePeer;
    final protections = _protections[peerId];
    return protections != null && protections.isNotEmpty;
  }

  /// Check if a peer is protected (by PeerId directly)
  /// Used by Swarm to check protection before closing connections
  bool isPeerProtected(PeerId peerId) {
    final protections = _protections[peerId];
    return protections != null && protections.isNotEmpty;
  }

  @override
  Notifiee get notifiee => _notifiee;

  @override
  void protect(PeerId peerId, String tag) {
    final protections = _protections[peerId] ?? <String>{};
    protections.add(tag);
    _protections[peerId] = protections;
  }

  @override
  bool unprotect(PeerId peerId, String tag) {
    final protections = _protections[peerId];
    if (protections != null) {
      protections.remove(tag);
      return protections.isNotEmpty;
    }
    return false;
  }

  @override
  bool isProtected(PeerId peerId, String tag) {
    final protections = _protections[peerId];
    if (protections == null) {
      return false;
    }

    if (tag.isEmpty) {
      return protections.isNotEmpty;
    }

    return protections.contains(tag);
  }

  @override
  String? checkLimit(GetConnLimiter limiter) {
    final limit = limiter.getConnLimit();
    final currentConnections = _connections.length;

    if (currentConnections > limit) {
      return 'Connection limit exceeded: $currentConnections connections, limit is $limit';
    }

    return null;
  }

  @override
  Future<void> close() async {
    await dispose();
  }
}
