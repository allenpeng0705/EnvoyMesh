import 'dart:async';
import 'dart:typed_data';
import 'dart:io';

import 'package:dart_libp2p/core/network/transport_conn.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/network/context.dart';
import 'package:dart_libp2p/core/network/stream.dart';
import 'package:dart_libp2p/core/network/rcmgr.dart';
import 'package:dart_libp2p/core/network/common.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/crypto/keys.dart';
import 'package:logging/logging.dart';

/// Streamlined mock transport connection that provides immediate responses
/// for multistream protocol negotiation without complex parsing
class StreamlinedMockTransportConn implements TransportConn {
  final Logger _logger = Logger('StreamlinedMockTransportConn');
  
  final String _id;
  final MultiAddr _localAddr;
  final MultiAddr _remoteAddr;
  final PeerId _localPeer;
  final PeerId _remotePeer;
  
  bool _isClosed = false;
  final List<Uint8List> _responseQueue = [];
  int _responseIndex = 0;
  
  // Track connection usage for diagnostics
  int _streamCount = 0;
  int _writeCount = 0;
  int _readCount = 0;
  final DateTime _createdAt = DateTime.now();
  
  // Track negotiation state
  bool _negotiationComplete = false;
  final List<Uint8List> _pendingWrites = [];
  
  StreamlinedMockTransportConn({
    required String id,
    required MultiAddr localAddr,
    required MultiAddr remoteAddr,
    required PeerId localPeer,
    required PeerId remotePeer,
  }) : _id = id,
       _localAddr = localAddr,
       _remoteAddr = remoteAddr,
       _localPeer = localPeer,
       _remotePeer = remotePeer {
    _logger.fine('Created StreamlinedMockTransportConn: $_id');
    _prepareNegotiationResponses();
  }

  /// Pre-compute all expected negotiation responses
  void _prepareNegotiationResponses() {
    // Response sequence for typical multistream + security + muxer negotiation
    // Phase 1: Security protocol negotiation
    final responses = [
      // 1. Multistream handshake response (for security negotiation)
      _createDelimitedResponse('/multistream/1.0.0'),
      // 2. Security protocol acceptance
      _createDelimitedResponse('/noise'),
      // 3. Multistream handshake response (for muxer negotiation)
      _createDelimitedResponse('/multistream/1.0.0'),
      // 4. Muxer protocol acceptance  
      _createDelimitedResponse('/yamux/1.0.0'),
    ];
    
    _responseQueue.addAll(responses);
    _logger.fine('Prepared ${_responseQueue.length} negotiation responses for $_id');
  }

  Uint8List _createDelimitedResponse(String message) {
    final messageBytes = message.codeUnits;
    final lengthBytes = _encodeVarint(messageBytes.length + 1); // +1 for newline
    
    final response = Uint8List(lengthBytes.length + messageBytes.length + 1);
    response.setRange(0, lengthBytes.length, lengthBytes);
    response.setRange(lengthBytes.length, lengthBytes.length + messageBytes.length, messageBytes);
    response[lengthBytes.length + messageBytes.length] = 10; // '\n'
    
    return response;
  }

  List<int> _encodeVarint(int value) {
    final result = <int>[];
    while (value >= 0x80) {
      result.add((value & 0x7F) | 0x80);
      value >>= 7;
    }
    result.add(value & 0x7F);
    return result;
  }

  @override
  String get id => _id;

  @override
  MultiAddr get localMultiaddr => _localAddr;

  @override
  MultiAddr get remoteMultiaddr => _remoteAddr;

  @override
  PeerId get localPeer => _localPeer;

  @override
  PeerId get remotePeer => _remotePeer;

  @override
  bool get isClosed => _isClosed;

  @override
  Future<List<P2PStream>> get streams async => [];

  @override
  Future<PublicKey?> get remotePublicKey async => null;

  @override
  ConnState get state => ConnState(
    streamMultiplexer: 'mock',
    security: 'mock',
    transport: 'mock',
    usedEarlyMuxerNegotiation: false,
  );

  @override
  ConnStats get stat => MockConnStats();

  @override
  ConnScope get scope => NullScope();

  @override
  Socket get socket => throw UnimplementedError('Mock socket not available');

  @override
  Future<Uint8List> read([int? length]) async {
    if (_isClosed) {
      throw StateError('Connection is closed');
    }

    _readCount++;
    
    // During negotiation phase, return pre-computed responses
    if (!_negotiationComplete && _responseIndex < _responseQueue.length) {
      final response = _responseQueue[_responseIndex];
      _responseIndex++;
      _logger.fine('Mock read $_readCount: returning negotiation response ${_responseIndex}/${_responseQueue.length}');
      
      // Mark negotiation complete after all responses are sent
      if (_responseIndex >= _responseQueue.length) {
        _negotiationComplete = true;
        _logger.fine('Mock negotiation completed for connection $_id');
      }
      
      return response;
    }

    // After negotiation, handle encrypted communication
    if (_negotiationComplete) {
      // For encrypted communication, we need to return data that looks like encrypted messages
      // For testing purposes, return empty data to simulate no pending encrypted messages
      if (length != null && length > 0) {
        _logger.fine('Mock read $_readCount: post-negotiation read request for $length bytes, returning empty (EOF)');
        return Uint8List(0);
      }
    }

    // Default case - no more data
    _logger.fine('Mock read $_readCount: no more responses, returning empty');
    return Uint8List(0);
  }

  @override
  Future<void> write(Uint8List data) async {
    if (_isClosed) {
      throw StateError('Connection is closed');
    }

    _writeCount++;
    _logger.fine('Mock write $_writeCount: ${data.length} bytes (negotiation complete: $_negotiationComplete)');
    
    if (!_negotiationComplete) {
      // During negotiation, just log the write
      _logger.fine('Mock write during negotiation: ${String.fromCharCodes(data.where((b) => b >= 32 && b <= 126))}');
    } else {
      // After negotiation, this would be encrypted data
      _pendingWrites.add(Uint8List.fromList(data));
      _logger.fine('Mock write post-negotiation: stored ${data.length} bytes of encrypted data');
    }
  }

  @override
  Future<void> close() async {
    if (!_isClosed) {
      _isClosed = true;
      _logger.fine('Mock connection closed: $_id (age: ${DateTime.now().difference(_createdAt)})');
      _logConnectionStats();
    }
  }

  void _logConnectionStats() {
    _logger.info('Connection $_id stats: streams=$_streamCount, writes=$_writeCount, reads=$_readCount, age=${DateTime.now().difference(_createdAt)}');
  }

  @override
  void setReadTimeout(Duration timeout) {
    // Mock implementation - no-op
  }

  @override
  void setWriteTimeout(Duration timeout) {
    // Mock implementation - no-op
  }

  @override
  void notifyActivity() {
    // Mock implementation - no-op
  }

  @override
  Future<P2PStream> newStream(Context context) async {
    _streamCount++;
    throw UnimplementedError('newStream should be handled by upgraded connection');
  }

  // Diagnostic methods for testing
  int get streamCount => _streamCount;
  int get writeCount => _writeCount;
  int get readCount => _readCount;
  DateTime get createdAt => _createdAt;
  Duration get age => DateTime.now().difference(_createdAt);
}

/// Mock implementation of ConnStats for testing
class MockConnStats extends ConnStats {
  MockConnStats() : super(
    stats: MockStats(),
    numStreams: 0,
  );
}

/// Mock implementation of Stats for testing
class MockStats extends Stats {
  MockStats() : super(
    direction: Direction.outbound,
    opened: DateTime.now(),
    limited: false,
    extra: const {},
  );
}

/// Null implementation of ConnScope for testing
class NullScope implements ConnScope {
  @override
  ScopeStat get stat => const ScopeStat();

  @override
  Future<void> reserveMemory(int size, int priority) async {}

  @override
  void releaseMemory(int size) {}

  @override
  Future<ResourceScopeSpan> beginSpan() async => NullResourceScopeSpan();
}

/// Null implementation of ResourceScopeSpan for testing
class NullResourceScopeSpan implements ResourceScopeSpan {
  @override
  void done() {}

  @override
  Future<void> reserveMemory(int size, int priority) async {}

  @override
  void releaseMemory(int size) {}

  @override
  ScopeStat get stat => const ScopeStat();

  @override
  Future<ResourceScopeSpan> beginSpan() async => this;
}
