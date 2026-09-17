import 'dart:async';
import 'dart:typed_data';

import 'package:dart_libp2p/core/crypto/keys.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/network/connection_context.dart';
import 'package:dart_libp2p/core/network/context.dart';
import 'package:dart_libp2p/core/network/stream.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/protocol/protocol.dart';
import 'package:logging/logging.dart';
import 'package:synchronized/synchronized.dart';

import '../../../core/network/common.dart';
import '../../../core/network/mux.dart' as core_mux; // ADDED for MuxedConn
import '../../../core/network/rcmgr.dart' show ConnScope, ScopeStat, ResourceScopeSpan, ResourceScope, ConnManagementScope;
import '../../transport/basic_upgrader.dart'; // For UpgradedConnectionImpl
import '../../transport/multiplexing/yamux/session.dart'; // For YamuxSession
import 'connection_health.dart'; // For event-driven health monitoring
import 'swarm.dart';
import 'swarm_stream.dart';

/// SwarmConn is a connection to a remote peer in the Swarm network.
class SwarmConn implements Conn {
  final Logger _logger = Logger('SwarmConn');

  /// The connection ID
  @override
  final String id;

  /// The underlying transport connection
  final Conn conn;

  /// The local peer ID
  final PeerId _localPeerId;

  /// The remote peer ID
  final PeerId _remotePeerId;

  /// The direction of the connection (inbound or outbound)
  final Direction direction;

  /// The swarm that owns this connection
  final Swarm swarm;

  /// Whether the connection is closed
  bool _isClosed = false;

  /// Map of streams by ID
  final Map<int, SwarmStream> _streams = {};

  /// Lock for streams map
  final Lock _streamsLock = Lock();

  /// Handler for incoming streams
  void Function(P2PStream stream)? streamHandler;

  /// Resource management scope for this connection
  final ConnManagementScope _managementScope;

  /// Timestamp when this SwarmConn was established
  final DateTime _openedTime;

  final _closeLock = Lock();

  /// Event-driven health monitor for this connection
  late final ConnectionHealthMonitor _healthMonitor;

  /// Connection context for event correlation across layers
  ConnectionContext? _context;

  /// Creates a new SwarmConn
  SwarmConn({
    required this.id,
    required this.conn,
    required PeerId localPeer,
    required PeerId remotePeer,
    required this.direction,
    required this.swarm,
    required ConnManagementScope managementScope,
  }) : 
    _localPeerId = localPeer,
    _remotePeerId = remotePeer,
    _managementScope = managementScope,
    _openedTime = DateTime.now() { // Initialize openedTime when SwarmConn is created
    
    // Initialize health monitoring
    _healthMonitor = ConnectionHealthMonitor();
    _setupHealthMonitoring();
  }

  /// Sets up event-driven health monitoring for this connection
  void _setupHealthMonitoring() {
    try {
      _logger.fine('SwarmConn ($id): Setting up health monitoring for connection to $remotePeer');
      
      // Monitor health state changes and notify swarm
      _healthMonitor.metrics.healthStateChanges.listen((newState) {
        _logger.info('SwarmConn ($id): Health state changed to $newState for peer $remotePeer');
        swarm.onConnectionHealthChanged(this, newState);
      });

      // Access the underlying UDX components for monitoring
      _setupUDXMonitoring();
      
    } catch (e) {
      _logger.warning('SwarmConn ($id): Error setting up health monitoring: $e');
    }
  }
  
  /// Sets up monitoring of underlying UDX components
  void _setupUDXMonitoring() {
    try {
      // Navigate the connection hierarchy to find UDX components
      if (conn is UpgradedConnectionImpl) {
        final upgraded = conn as UpgradedConnectionImpl;
        
        // Access the muxed connection through reflection or a getter
        // Since _muxedConn is private, we need to find another way to access it
        // For now, we'll monitor at the Yamux level through the public interface
        _setupYamuxMonitoring(upgraded);
      }
    } catch (e) {
      _logger.warning('SwarmConn ($id): Error setting up UDX monitoring: $e');
    }
  }
  
  /// Sets up monitoring of upgraded connection
  void _setupYamuxMonitoring(UpgradedConnectionImpl upgraded) {
    try {
      // Monitor the upgraded connection state
      // We'll monitor stream creation failures and connection state changes
      
      _logger.fine('SwarmConn ($id): Connection monitoring setup for ${upgraded.runtimeType}');
      
      // For now, we'll rely on the existing error detection in newStream()
      // and the health metrics to track connection health
      
    } catch (e) {
      _logger.warning('SwarmConn ($id): Error setting up connection monitoring: $e');
    }
  }
  
  /// Gets the current health state of this connection
  ConnectionHealthState get healthState => _healthMonitor.metrics.state;
  
  /// Gets the health metrics for this connection
  ConnectionHealthMetrics get healthMetrics => _healthMonitor.metrics;
  
  /// Checks if the connection is healthy using event-driven state
  bool get isHealthy => _healthMonitor.metrics.isHealthy;
  
  /// Records a successful operation for health tracking
  void _recordHealthSuccess() {
    _healthMonitor.metrics.recordSuccess();
  }
  
  /// Records an error for health tracking
  void _recordHealthError(dynamic error) {
    _healthMonitor.metrics.recordError(error);
  }

  /// Gets the connection context for event correlation
  ConnectionContext? get context => _context;

  /// Sets the connection context (typically called after upgrade)
  void setContext(ConnectionContext ctx) {
    _context = ctx;
    _logger.fine('SwarmConn ($id): Context set: ${ctx.connectionId}');
  }

  @override
  Future<void> close() async {
    // Dispose of health monitoring
    _healthMonitor.dispose();

    // Close all streams
    await _streamsLock.synchronized(() async {
      for (final stream in _streams.values) {
        await stream.close(); // This will also call done() on stream's scope
      }
      _streams.clear();

      if (_isClosed) return;
      _isClosed = true;

      // Signal that the connection scope is done
      _managementScope.done();

      // Close the underlying connection
      await conn.close();

    });
  }


  /// Creates a new stream
  Future<P2PStream> newStream(Context context) async {
    _logger.fine('SwarmConn.newStream ($id): Entered to peer $remotePeer. Context HashCode: ${context.hashCode}');
    if (_isClosed) {
      _logger.fine('SwarmConn.newStream ($id): Connection is closed. Throwing exception.');
      throw Exception('Connection is closed');
    }
    _logger.fine('SwarmConn.newStream ($id): Connection is open.');
    _logger.fine('SwarmConn.newStream ($id): Type of this.conn (the UpgradedConnectionImpl): ${conn.runtimeType}');
    _logger.fine('SwarmConn.newStream ($id): About to call this.conn.newStream(context). This will call UpgradedConnectionImpl.newStream.');
    
    P2PStream underlyingMuxedStreamResult;
    try {
      // this.conn is an UpgradedConnectionImpl, which implements Conn.
      // Its newStream method will internally call _muxedConn.openStream(context).
      // We let Yamux manage its own stream IDs directly.
      underlyingMuxedStreamResult = await conn.newStream(context); 
    } catch (e, st) {
      _logger.severe('SwarmConn.newStream ($id): Error calling this.conn.newStream(context): $e\n$st');
      
      // Record error for health tracking with context
      _healthMonitor.recordError(e, 'newStream');
      
      // Check if this is a "Session is closed" error, which indicates the underlying
      // multiplexer session has been closed but the SwarmConn hasn't been cleaned up yet
      final errorMessage = e.toString().toLowerCase();
      if (errorMessage.contains('session is closed') || 
          errorMessage.contains('closed session') ||
          errorMessage.contains('bad state: session is closed')) {
        _logger.warning('SwarmConn.newStream ($id): Detected closed session error. Marking connection as closed and notifying swarm.');
        
        // Mark this connection as closed
        _isClosed = true;
        
        // Notify the swarm to remove this stale connection
        // Use Future.microtask to avoid blocking the current operation
        Future.microtask(() async {
          try {
            await swarm.removeConnection(this);
            _logger.fine('SwarmConn.newStream ($id): Successfully removed stale connection from swarm.');
          } catch (removeError) {
            _logger.warning('SwarmConn.newStream ($id): Error removing stale connection from swarm: $removeError');
          }
        });
        
        // Rethrow with a more descriptive error message
        throw Exception('Connection to ${remotePeer} has a closed session and has been marked for cleanup. Please retry the operation.');
      }
      
      rethrow;
    }
    
    _logger.fine('SwarmConn.newStream ($id): Returned from this.conn.newStream(). Result type: ${underlyingMuxedStreamResult.runtimeType}, Stream ID: ${underlyingMuxedStreamResult.id()}');

    // Obtain a StreamManagementScope from the ResourceManager
    _logger.fine('SwarmConn.newStream ($id): Obtaining StreamManagementScope for SwarmStream using underlying muxed stream id: ${underlyingMuxedStreamResult.id()}.');
    final streamManagementScope = await swarm.resourceManager.openStream(
      remotePeer, // The peer this stream is being opened to
      Direction.outbound, // Streams created via newStream are outbound
    );

    // Use the underlying Yamux stream ID directly
    final yamuxStreamId = int.parse(underlyingMuxedStreamResult.id());

    // Create the SwarmStream wrapper
    final stream = SwarmStream(
      id: underlyingMuxedStreamResult.id(), // Use Yamux stream ID directly
      conn: this,              
      direction: Direction.outbound, 
      opened: DateTime.now(),
      underlyingMuxedStream: underlyingMuxedStreamResult as P2PStream<Uint8List>, 
      managementScope: streamManagementScope,
    );

    // Add to our streams map using the Yamux stream ID
    await _streamsLock.synchronized(() async {
      _streams[yamuxStreamId] = stream;
    });

    // Record successful stream creation for health tracking
    _healthMonitor.recordSuccess('Stream created successfully');

    return stream;
  }

  @override
  Future<List<P2PStream>> get streams async {
    return await _streamsLock.synchronized(() async {
      return _streams.values.toList();
    });
  }

  @override
  bool get isClosed => _isClosed;

  @override
  PeerId get localPeer => _localPeerId;

  @override
  PeerId get remotePeer => _remotePeerId;

  @override
  Future<PublicKey?> get remotePublicKey => conn.remotePeer.extractPublicKey();

  @override
  ConnState get state => conn.state; // Delegate to the underlying connection's state

  @override
  MultiAddr get localMultiaddr => conn.localMultiaddr;

  @override
  MultiAddr get remoteMultiaddr => conn.remoteMultiaddr;

  @override
  ConnStats get stat {
    // Potentially, the underlying `conn.stat.stats.limited` could be used if available and more accurate.
    // For now, SwarmConn itself doesn't explicitly track 'limited' status beyond what ResourceManager might impose.
    // The `opened` time is now from SwarmConn's perspective.
    return _ConnStatsImpl(
      stats: Stats(
        direction: direction,
        opened: _openedTime, // Use the stored opened time
        limited: conn.stat.stats.limited, // Delegate 'limited' to underlying conn's stat
      ),
      numStreams: _streams.length,
    );
  }

  @override
  ConnScope get scope {
    return _ConnScopeImpl(managementScope: _managementScope);
  }

  /// Removes a stream from this connection
  Future<void> removeStream(SwarmStream stream) async {
    await _streamsLock.synchronized(() {
      _streams.remove(int.parse(stream.id()));
    });
  }

  /// Handles an incoming stream
  void handleIncomingStream(SwarmStream stream) {
    final handler = streamHandler;
    if (handler != null) {
      handler(stream);
    } else {
      // No handler, reset the stream
      stream.reset();
    }
  }
}

/// Implementation of ConnStats
class _ConnStatsImpl implements ConnStats {
  @override
  final Stats stats;

  @override
  final int numStreams;

  _ConnStatsImpl({
    required this.stats,
    required this.numStreams,
  });
}

/// Implementation of ConnScope, wrapping a ConnManagementScope
class _ConnScopeImpl implements ConnScope {
  final ConnManagementScope _managementScope;

  _ConnScopeImpl({required ConnManagementScope managementScope})
      : _managementScope = managementScope;

  @override
  Future<ResourceScopeSpan> beginSpan() async {
    final span = await _managementScope.beginSpan(); 
    return _ResourceScopeSpanImpl(span: span);
  }

  @override
  void releaseMemory(int size) {
    _managementScope.releaseMemory(size);
  }

  @override
  Future<void> reserveMemory(int size, int priority) async {
    await _managementScope.reserveMemory(size, priority);
  }

  @override
  ScopeStat get stat {
    return _managementScope.stat;
  }
}

/// Implementation of ResourceScopeSpan (generic wrapper)
class _ResourceScopeSpanImpl implements ResourceScopeSpan {
  final ResourceScopeSpan _underlyingSpan;

  _ResourceScopeSpanImpl({required ResourceScopeSpan span}) : _underlyingSpan = span;

  @override
  Future<ResourceScopeSpan> beginSpan() async {
    final newSpan = await _underlyingSpan.beginSpan();
    return _ResourceScopeSpanImpl(span: newSpan); 
  }

  @override
  void done() {
    _underlyingSpan.done();
  }

  @override
  void releaseMemory(int size) {
    _underlyingSpan.releaseMemory(size);
  }

  @override
  Future<void> reserveMemory(int size, int priority) async {
    await _underlyingSpan.reserveMemory(size, priority);
  }

  @override
  ScopeStat get stat {
    return _underlyingSpan.stat;
  }
}
