import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:dart_libp2p/core/crypto/keys.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/common.dart';
// Conn, ConnState, ConnStats, Stats are used from conn.dart
// ConnScope will come from rcmgr.dart
import 'package:dart_libp2p/core/network/conn.dart' show Conn, ConnState, ConnStats, Stats; 
import 'package:dart_libp2p/core/network/context.dart';
import 'package:dart_libp2p/core/network/stream.dart'; // For P2PStream
import 'package:dart_libp2p/core/network/rcmgr.dart' show ConnScope, ScopeStat, ResourceScopeSpan, ResourceScope;
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:meta/meta.dart';

/// Message types for isolate communication
enum MessageType {
  data,
  close,
  error,
}

/// Message wrapper for isolate communication
class ConnectionMessage {
  final MessageType type;
  final Uint8List? data;
  final String? error;

  ConnectionMessage({
    required this.type,
    this.data,
    this.error,
  });
}

/// A mock connection that simulates TCP-like stream behavior
class MockConnection implements Conn {
  final String _id;
  bool _closed = false;

  // Stream controllers for bidirectional communication
  final _incomingData = StreamController<List<int>>.broadcast();
  final _outgoingData = StreamController<List<int>>.broadcast();

  // Single continuous buffer for incoming data (TCP-like)
  final _buffer = <int>[];

  // Stream subscriptions for cleanup
  StreamSubscription<List<int>>? _subscription;

  /// For test verification only
  final writes = <Uint8List>[];

  MockConnection(String id) : _id = id;

  /// Creates a pair of connected mock connections
  static (MockConnection, MockConnection) createPair({
    String id1 = 'conn1',
    String id2 = 'conn2',
  }) {
    final conn1 = MockConnection(id1);
    final conn2 = MockConnection(id2);

    // Wire up the connections to simulate TCP streaming
    conn1._subscription = conn2._outgoingData.stream.listen((data) {
      print('${conn1.id} received data: ${data.length} bytes');
      if (!conn1.isClosed) {
        conn1._buffer.addAll(data);  // Add to continuous buffer
        conn1._incomingData.add(data);
        print('${conn1.id} buffered data, total buffer size: ${conn1._buffer.length}');
      }
    });

    conn2._subscription = conn1._outgoingData.stream.listen((data) {
      print('${conn2.id} received data: ${data.length} bytes');
      if (!conn2.isClosed) {
        conn2._buffer.addAll(data);  // Add to continuous buffer
        conn2._incomingData.add(data);
        print('${conn2.id} buffered data, total buffer size: ${conn2._buffer.length}');
      }
    });

    return (conn1, conn2);
  }

  @override
  Future<void> close() async {
    if (_closed) return;
    print('$id closing connection');
    _closed = true;

    // Ensure all buffered data is processed before closing
    if (_buffer.isNotEmpty) {
      print('$id has ${_buffer.length} bytes in buffer during close');
      _incomingData.add(_buffer);
    }

    await _subscription?.cancel();
    await _incomingData.close();
    await _outgoingData.close();
    _buffer.clear();
    print('$id connection closed');
  }

  @override
  String get id => _id;

  @override
  bool get isClosed => _closed;

  @override
  MultiAddr get localMultiaddr => MultiAddr('/ip4/127.0.0.1/tcp/1234');

  @override
  MultiAddr get remoteMultiaddr => MultiAddr('/ip4/127.0.0.1/tcp/5678');

  // Deprecated methods for backward compatibility
  MultiAddr get localAddr => localMultiaddr;
  MultiAddr get remoteAddr => remoteMultiaddr;

  @override
  PeerId get localPeer => throw UnimplementedError('localPeer not implemented in IsolatedMockConnection');

  @override
  PeerId get remotePeer => throw UnimplementedError('remotePeer not implemented in IsolatedMockConnection');

  @override
  Future<PublicKey?> get remotePublicKey async => null;

  @override
  ConnState get state => ConnState(
    streamMultiplexer: 'mock-muxer/1.0.0',
    security: 'mock-security/1.0.0',
    transport: 'mock',
    usedEarlyMuxerNegotiation: false,
  );

  @override
  ConnStats get stat => _MockConnStats(
    stats: Stats(
      direction: Direction.outbound,
      opened: DateTime.now(),
    ),
    numStreams: 0,
  );

  @override
  ConnScope get scope => _MockConnScope();

  @override
  Future<P2PStream> newStream(Context context) async {
    throw UnimplementedError('Stream multiplexing not implemented in IsolatedMockConnection');
  }

  @override
  Future<List<P2PStream>> get streams async => [];

  @override
  Future<Uint8List> read([int? length]) async {
    if (_closed) throw StateError('Connection is closed');
    print('$_id reading' + (length != null ? ' $length bytes' : ''));

    try {
      // If no length specified, return whatever is in buffer or wait for more data
      if (length == null) {
        if (_buffer.isEmpty) {
          final data = await _incomingData.stream.first.timeout(
            Duration(seconds: 5),
            onTimeout: () => throw TimeoutException('Read timed out'),
          );
          print('$_id read ${data.length} bytes from stream (no length specified)');
          return Uint8List.fromList(data);
        }
        final result = Uint8List.fromList(_buffer);
        _buffer.clear();
        print('$_id returning ${result.length} bytes from buffer (no length specified)');
        return result;
      }

      // If we already have enough data in the buffer, return it immediately
      if (_buffer.length >= length) {
        final result = Uint8List.fromList(_buffer.take(length).toList());
        _buffer.removeRange(0, length);
        print('$_id returning ${result.length} bytes from buffer, ${_buffer.length} bytes remaining');
        return result;
      }

      // Wait until we have enough data
      while (_buffer.length < length) {
        print('$_id buffer has ${_buffer.length} bytes, waiting for more data to reach $length bytes');
        final data = await _incomingData.stream.first.timeout(
          Duration(seconds: 5),
          onTimeout: () => throw TimeoutException('Read timed out waiting for more data'),
        );
        print('$_id received ${data.length} additional bytes');
        _buffer.addAll(data);
      }

      // Return exactly the requested number of bytes
      final result = Uint8List.fromList(_buffer.take(length).toList());
      _buffer.removeRange(0, length);
      print('$_id returning ${result.length} bytes, ${_buffer.length} bytes remaining in buffer');
      return result;
    } catch (e) {
      print('$_id error during read: $e');
      rethrow;
    }
  }

  @override
  Future<void> write(Uint8List data) async {
    if (_closed) throw StateError('Connection is closed');
    print('$_id writing ${data.length} bytes');

    writes.add(data);  // For test verification only
    _outgoingData.add(data);
    print('$_id wrote ${data.length} bytes to outgoing stream');
  }

  @override
  Socket get socket => throw UnimplementedError('Socket is not implemented in IsolatedMockConnection');

  @override
  void setReadTimeout(Duration timeout) {}

  @override
  void setWriteTimeout(Duration timeout) {}

  /// For testing: get current buffer size
  @visibleForTesting
  int get debugBufferSize => _buffer.length;

  /// For testing: get buffer contents
  @visibleForTesting
  List<int> debugGetBufferContents() => List<int>.from(_buffer);

  /// Read a length-prefixed message
  Future<Uint8List> readWithLengthPrefix() async {
    // Read 2-byte length prefix
    final lengthBytes = await read(2);
    final length = (lengthBytes[0] << 8) | lengthBytes[1];

    // Read message body
    return read(length);
  }

  /// Write a length-prefixed message
  Future<void> writeWithLengthPrefix(Uint8List data) async {
    // Write 2-byte length prefix
    final lengthBytes = Uint8List(2);
    lengthBytes[0] = (data.length >> 8) & 0xFF;
    lengthBytes[1] = data.length & 0xFF;
    await write(lengthBytes);

    // Write message body
    await write(data);
  }
}

/// Mock implementation of ConnStats
class _MockConnStats implements ConnStats {
  @override
  final Stats stats;

  @override
  final int numStreams;

  const _MockConnStats({
    required this.stats,
    required this.numStreams,
  });
}

/// Mock implementation of ConnScope
class _MockConnScope implements ConnScope {
  @override
  Future<ResourceScopeSpan> beginSpan() async { // ResourceScopeSpan from rcmgr.dart
    return _MockResourceScopeSpan();
  }

  @override
  void releaseMemory(int size) {}

  @override
  Future<void> reserveMemory(int size, int priority) async {}

  @override
  ScopeStat get stat => const ScopeStat(); // Renamed scopeStat to stat. ScopeStat from rcmgr.dart
}

/// Mock implementation of ResourceScopeSpan
class _MockResourceScopeSpan implements ResourceScopeSpan { // ResourceScopeSpan from rcmgr.dart
  @override
  Future<ResourceScopeSpan> beginSpan() async { // ResourceScopeSpan from rcmgr.dart
    return this;
  }

  @override
  void done() {}

  @override
  void releaseMemory(int size) {}

  @override
  Future<void> reserveMemory(int size, int priority) async {}

  @override
  ScopeStat get stat => const ScopeStat(); // Renamed scopeStat to stat. ScopeStat from rcmgr.dart
}
