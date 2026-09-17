import 'dart:async';
import 'dart:typed_data';
import 'dart:io';

import 'package:dart_libp2p/core/connmgr/conn_manager.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/network/common.dart';
import 'package:dart_libp2p/core/network/stream.dart';
import 'package:dart_libp2p/core/network/transport_conn.dart';
import 'package:dart_libp2p/core/network/context.dart';
import 'package:dart_libp2p/core/crypto/keys.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/p2p/transport/connection_state.dart' as transport_state;

import '../../../../core/network/rcmgr.dart';

/// CircuitConnection implements TransportConn for circuit relay connections
class CircuitConnection implements TransportConn {
  final P2PStream<Uint8List> _stream;
  final PeerId _localPeerId;
  final PeerId _remotePeerId;
  final MultiAddr _remoteAddr;
  final ConnManager _manager;
  final String _id;
  bool _closed = false;
  transport_state.ConnectionState _transportState = transport_state.ConnectionState.connecting;
  final List<P2PStream> _streams = [];
  Timer? _readTimeout;
  Timer? _writeTimeout;
  Duration? _currentReadTimeout;
  Duration? _currentWriteTimeout;

  CircuitConnection({
    required P2PStream<Uint8List> stream,
    required PeerId localPeerId,
    required PeerId remotePeerId,
    required MultiAddr remoteAddr,
    required ConnManager manager,
  }) : 
    _stream = stream,
    _localPeerId = localPeerId,
    _remotePeerId = remotePeerId,
    _remoteAddr = remoteAddr,
    _manager = manager,
    _id = 'circuit-${DateTime.now().millisecondsSinceEpoch}' {
    
    // Register with the manager
    _manager.registerConnection(this);

    // Monitor stream for closure
    _stream.incoming.read().then((data) {
      // Handle incoming data
      _manager.recordActivity(this);
    }).catchError(_handleError);
  }

  void _handleError(dynamic error) {
    if (!_closed) {
      _closed = true;
      _manager.updateState(this, transport_state.ConnectionState.error, error: error);
    }
  }

  void _handleDone() {
    if (!_closed) {
      _closed = true;
      final currentState = _manager.getState(this);
      if (currentState != null && currentState != transport_state.ConnectionState.error) {
        _manager.updateState(this, transport_state.ConnectionState.closed, error: null);
      }
    }
  }

  @override
  String get id => _id;

  @override
  PeerId get localPeer => _localPeerId;

  @override
  PeerId get remotePeer => _remotePeerId;

  @override
  Future<PublicKey?> get remotePublicKey => remotePeer.extractPublicKey();

  @override
  MultiAddr get localMultiaddr => MultiAddr('/p2p-circuit');

  @override
  MultiAddr get remoteMultiaddr => _remoteAddr;

  @override
  bool get isClosed => _closed;

  @override
  ConnState get state => ConnState(
    streamMultiplexer: 'yamux/1.0.0',
    security: 'noise',
    transport: 'p2p-circuit',
    usedEarlyMuxerNegotiation: false,
  );

  @override
  ConnStats get stat => _ConnStatsImpl(
    stats: Stats(
      direction: Direction.outbound,
      opened: DateTime.now(),
      limited: false,
    ),
    numStreams: _streams.length,
  );

  @override
  ConnScope get scope => _ConnScopeImpl();

  @override
  Future<P2PStream> newStream(Context context) async {
    if (_closed) {
      throw Exception('Connection is closed');
    }
    throw UnimplementedError('Stream multiplexing not implemented');
  }

  @override
  Future<List<P2PStream>> get streams async => _streams;

  @override
  Future<void> close() async {
    if (_closed) return;

    final currentState = _manager.getState(this);
    if (currentState == null || 
        currentState == transport_state.ConnectionState.closed || 
        currentState == transport_state.ConnectionState.error) {
      return;
    }

    _closed = true;
    _readTimeout?.cancel();
    _writeTimeout?.cancel();

    try {
      if (currentState != transport_state.ConnectionState.closing) {
        _manager.updateState(this, transport_state.ConnectionState.closing, error: null);
      }

      await _stream.close();

      if (_manager.getState(this) != null) {
        _manager.updateState(this, transport_state.ConnectionState.closed, error: null);
      }
    } catch (e) {
      if (_manager.getState(this) != null) {
        _manager.updateState(this, transport_state.ConnectionState.error, error: e);
      }
      rethrow;
    }
  }

  @override
  Future<Uint8List> read([int? length]) async {
    if (_closed) {
      throw Exception('Connection is closed');
    }

    try {
      final data = await _stream.read();
      if (data == null) {
        throw Exception('unexpected EOF');
      }

      if (length != null && data.length < length) {
        throw Exception('not enough data');
      }

      _manager.recordActivity(this);
      return data;
    } catch (e) {
      _handleError(e);
      rethrow;
    }
  }

  @override
  Future<void> write(Uint8List data) async {
    if (_closed) {
      throw Exception('Connection is closed');
    }

    try {
      await _stream.write(data);
      _manager.recordActivity(this);
    } catch (e) {
      _handleError(e);
      rethrow;
    }
  }

  @override
  void setReadTimeout(Duration timeout) {
    _currentReadTimeout = timeout;
    _readTimeout?.cancel();
    if (timeout != Duration.zero) {
      _readTimeout = Timer(timeout, () {
        _handleError(Exception('read timeout'));
      });
    }
  }

  @override
  void setWriteTimeout(Duration timeout) {
    _currentWriteTimeout = timeout;
    _writeTimeout?.cancel();
    if (timeout != Duration.zero) {
      _writeTimeout = Timer(timeout, () {
        _handleError(Exception('write timeout'));
      });
    }
  }

  @override
  Socket get socket => throw UnimplementedError('Circuit connections do not have a direct socket');

  @override
  void notifyActivity() {
    // TODO: Implement if activity on a circuit connection should
    // keep the underlying physical connection to the relay alive.
    // This might involve calling recordActivity on the _manager for the
    // actual physical connection to the relay, if this CircuitConnection
    // is directly managed or can influence that.
    // For now, providing an empty implementation.
    // It already calls _manager.recordActivity(this) on read/write.
  }
}

class _ConnStatsImpl implements ConnStats {
  final Stats stats;
  final int numStreams;

  _ConnStatsImpl({required this.stats, required this.numStreams});
}

class _ConnScopeImpl implements ConnScope { // ConnScope from rcmgr.dart
  // transient and limited are not part of the current ConnScope interface.
  // Removing them to align. If they are needed, ConnScope in rcmgr.dart should be updated.

  @override
  Future<ResourceScopeSpan> beginSpan() async { // ResourceScopeSpan from rcmgr.dart
    return _ResourceScopeSpanImpl();
  }

  @override
  void releaseMemory(int size) {
    // In a real implementation, we would release memory
  }

  @override
  Future<void> reserveMemory(int size, int priority) async {
    // In a real implementation, we would reserve memory
  }

  @override
  ScopeStat get stat => const ScopeStat( // Renamed scopeStat to stat. ScopeStat from rcmgr.dart
    numStreamsInbound: 0,
    numStreamsOutbound: 0,
    numConnsInbound: 0,
    numConnsOutbound: 0,
    numFD: 0,
    memory: 0,
  );
}



class _ResourceScopeSpanImpl implements ResourceScopeSpan {
  @override
  Future<ResourceScopeSpan> beginSpan() async {
    return this;
  }

  @override
  void done() {
    // In a real implementation, we would release resources
  }

  @override
  void releaseMemory(int size) {
    // In a real implementation, we would release memory
  }

  @override
  Future<void> reserveMemory(int size, int priority) async {
    // In a real implementation, we would reserve memory
  }

  @override
  ScopeStat get stat => const ScopeStat( // Renamed scopeStat to stat. ScopeStat from rcmgr.dart
    numStreamsInbound: 0,
    numStreamsOutbound: 0,
    numConnsInbound: 0,
    numConnsOutbound: 0,
    numFD: 0,
    memory: 0,
  );
}
