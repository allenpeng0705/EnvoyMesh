import 'dart:async';
import 'dart:typed_data';

import 'package:dart_libp2p/core/network/common.dart';
import 'package:dart_libp2p/core/network/stream.dart';
import 'package:logging/logging.dart';
import 'package:synchronized/synchronized.dart';

import '../../../core/network/conn.dart';
import '../../../core/network/rcmgr.dart' show StreamScope, ScopeStat, ResourceScopeSpan, ResourceScope, StreamManagementScope;
import 'swarm_conn.dart';

/// SwarmStream is a stream over a SwarmConn.
class SwarmStream implements P2PStream<Uint8List> {
  final Logger _logger = Logger('SwarmStream');

  /// The stream ID (Swarm's logical ID for this wrapper)
  final String _id;

  /// The connection this stream is part of
  final SwarmConn _conn;

  /// The underlying multiplexed stream
  final P2PStream<Uint8List> _underlyingMuxedStream;

  /// The resource management scope for this stream
  final StreamManagementScope _managementScope;

  /// The protocol ID associated with this stream
  String _protocol = '';

  /// The direction of the stream (inbound or outbound)
  final Direction _direction;

  /// The timestamp when this stream was opened
  final DateTime _opened;

  /// Whether the stream is closed
  bool _isClosed = false;

  /// Whether the scope has been cleaned up (to prevent double cleanup)
  bool _scopeCleanedUp = false;

  /// Lock for closed state
  final Lock _closedLock = Lock();

  /// Creates a new SwarmStream
  SwarmStream({
    required String id,
    required SwarmConn conn,
    required Direction direction,
    required DateTime opened,
    required P2PStream<Uint8List> underlyingMuxedStream,
    required StreamManagementScope managementScope,
  }) : 
    _id = id,
    _conn = conn,
    _direction = direction,
    _opened = opened,
    _underlyingMuxedStream = underlyingMuxedStream,
    _managementScope = managementScope;

  @override
  String id() => _id;

  @override
  String protocol() => _protocol;

  @override
  Future<void> setProtocol(String id) async {
    _protocol = id;
    // The management scope's protocol should be set by the component
    // that definitively finalizes protocol negotiation (e.g., MultistreamMuxer.handle for incoming,
    // or the initiator of an outgoing stream after successful selection).
  }

  @override
  StreamStats stat() {
    final underlyingStats = _underlyingMuxedStream.stat();
    return StreamStats(
      direction: _direction,
      opened: _opened,
      limited: underlyingStats.limited,
      // protocol is handled by P2PStream.protocol()
    );
  }

  @override
  Conn get conn => _conn;

  @override
  StreamManagementScope scope() { // Changed return type
    return _managementScope; // Return the full management scope directly
  }

  @override
  Future<Uint8List> read([int? maxLength]) async {
    if (_isClosed) {
      throw Exception('Stream $_id is closed');
    }
    return _underlyingMuxedStream.read(maxLength);
  }

  @override
  Future<void> write(Uint8List data) async {
    if (_isClosed) {
      throw Exception('Stream $_id is closed');
    }
    return _underlyingMuxedStream.write(data);
  }

  @override
  P2PStream<Uint8List> get incoming => _underlyingMuxedStream; // Return the underlying stream directly

  @override
  Future<void> close() async {
    await _closedLock.synchronized(() async {
      if (_isClosed) return;
      _isClosed = true;
      _logger.fine('Closing stream $_id');
      
      try {
        await _underlyingMuxedStream.close();
      } catch (e, s) {
        _logger.warning('Error closing underlying muxed stream for stream $_id: $e\n$s');
      }
      
      // Only clean up scope once to prevent double cleanup
      if (!_scopeCleanedUp) {
        _logger.fine('Stream $_id: Cleaning up management scope');
        _managementScope.done();
        _scopeCleanedUp = true;
      } else {
        _logger.fine('Stream $_id: Scope already cleaned up, skipping');
      }
      
      // NOTE: We intentionally do NOT call _conn.removeStream(this) here.
      // This caused a deadlock when called from SwarmConn.close() because:
      // 1. SwarmConn.close() holds _streamsLock
      // 2. This close() method would call removeStream()
      // 3. removeStream() tries to acquire _streamsLock again
      // 4. The Lock is not reentrant -> DEADLOCK
      // 
      // SwarmConn.close() already clears its _streams map after closing all streams,
      // so removeStream() is not needed when closing as part of parent close.
      // For individual stream closes, the stream is marked closed and will be
      // cleaned up when SwarmConn is closed later.
      _logger.fine('Stream $_id closed');
    });
  }

  @override
  Future<void> closeWrite() async {
    if (_isClosed) {
      _logger.finer('Stream $_id closeWrite called, but stream is already fully closed.');
    }
    return _underlyingMuxedStream.closeWrite();
  }

  @override
  Future<void> closeRead() async {
     if (_isClosed) {
      _logger.finer('Stream $_id closeRead called, but stream is already fully closed.');
    }
    return _underlyingMuxedStream.closeRead();
  }

  @override
  Future<void> reset() async {
    await _closedLock.synchronized(() async {
      if (_isClosed) return;
      _isClosed = true; // Mark as closed immediately
      _logger.fine('Resetting stream $_id');
      
      try {
        await _underlyingMuxedStream.reset();
      } catch (e, s) {
        _logger.warning('Error resetting underlying muxed stream for stream $_id: $e\n$s');
      }
      
      // Only clean up scope once to prevent double cleanup
      if (!_scopeCleanedUp) {
        _logger.fine('Stream $_id: Cleaning up management scope during reset');
        _managementScope.done();
        _scopeCleanedUp = true;
      } else {
        _logger.fine('Stream $_id: Scope already cleaned up, skipping during reset');
      }
      
      // Let SwarmConn handle its own cleanup without additional scope cleanup
      await _conn.removeStream(this);
      _logger.fine('Stream $_id reset and removed from connection');
    });
  }

  @override
  Future<void> setDeadline(DateTime? time) async {
    return _underlyingMuxedStream.setDeadline(time);
  }

  @override
  Future<void> setReadDeadline(DateTime time) async {
    return _underlyingMuxedStream.setReadDeadline(time);
  }

  @override
  Future<void> setWriteDeadline(DateTime time) async {
    return _underlyingMuxedStream.setWriteDeadline(time);
  }

  @override
  bool get isClosed => _isClosed;

  @override
  bool get isWritable => !_isClosed && _underlyingMuxedStream.isWritable;

  /// Checks if this stream is available for reuse by other protocols
  /// A stream is NOT available for reuse if it's closed but scope cleanup is still pending
  bool get isAvailableForReuse => _isClosed && _scopeCleanedUp;

  /// Allows external cleanup of the scope (called by SwarmConn if needed)
  /// Returns true if cleanup was performed, false if already cleaned up
  bool cleanupScope() {
    if (!_scopeCleanedUp) {
      _logger.fine('Stream $_id: External scope cleanup requested');
      _managementScope.done();
      _scopeCleanedUp = true;
      return true;
    }
    return false;
  }
}

/// Implementation of StreamScope, wrapping a StreamManagementScope
class _StreamScopeImpl implements StreamScope {
  final StreamManagementScope _managementScope;

  _StreamScopeImpl({required StreamManagementScope managementScope})
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

  @override
  Future<void> setService(String service) async {
    await _managementScope.setService(service);
  }
}

/// Implementation of ResourceScopeSpan, wrapping an underlying ResourceScopeSpan
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
