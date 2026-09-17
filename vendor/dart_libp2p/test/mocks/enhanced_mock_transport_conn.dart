import 'dart:async';
import 'dart:convert';
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
import 'package:dart_libp2p/p2p/multiaddr/codec.dart';
import 'package:logging/logging.dart';

/// Enhanced mock transport connection that can simulate multistream protocol negotiation
class EnhancedMockTransportConn implements TransportConn {
  final Logger _logger = Logger('EnhancedMockTransportConn');
  
  final String _id;
  final MultiAddr _localAddr;
  final MultiAddr _remoteAddr;
  final PeerId _localPeer;
  final PeerId _remotePeer;
  
  bool _isClosed = false;
  final List<Uint8List> _writeBuffer = [];
  final List<Uint8List> _readBuffer = [];
  int _readIndex = 0;
  
  // Protocol negotiation state
  bool _multistreamHandshakeComplete = false;
  bool _securityNegotiationComplete = false;
  bool _muxerNegotiationComplete = false;
  String? _negotiatedSecurityProtocol;
  String? _negotiatedMuxerProtocol;
  
  // Supported protocols
  static const String multistreamProtocol = '/multistream/1.0.0';
  static const List<String> supportedSecurityProtocols = ['/noise'];
  static const List<String> supportedMuxerProtocols = ['/yamux/1.0.0'];
  
  EnhancedMockTransportConn({
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
    _logger.fine('Created EnhancedMockTransportConn: $_id');
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
    streamMultiplexer: _negotiatedMuxerProtocol ?? 'unknown',
    security: _negotiatedSecurityProtocol ?? 'unknown',
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

    // Process any pending writes to generate appropriate responses
    await _processProtocolNegotiation();

    // Return data from read buffer
    if (_readIndex < _readBuffer.length) {
      final data = _readBuffer[_readIndex];
      _readIndex++;
      _logger.fine('Mock read: ${utf8.decode(data, allowMalformed: true)}');
      return data;
    }

    // If no data available, return empty (simulating EOF)
    return Uint8List(0);
  }

  @override
  Future<void> write(Uint8List data) async {
    if (_isClosed) {
      throw StateError('Connection is closed');
    }

    _writeBuffer.add(data);
    _logger.fine('Mock write: ${utf8.decode(data, allowMalformed: true)}');
    
    // Process the write immediately to generate responses
    await _processProtocolNegotiation();
  }

  /// Processes protocol negotiation based on written data
  Future<void> _processProtocolNegotiation() async {
    if (_writeBuffer.isEmpty) return;

    for (final data in _writeBuffer) {
      final message = _parseDelimitedMessage(data);
      if (message != null) {
        await _handleProtocolMessage(message);
      }
    }
    _writeBuffer.clear();
  }

  /// Parses a delimited message from raw bytes
  String? _parseDelimitedMessage(Uint8List data) {
    try {
      // Try to decode varint length
      final (length, consumed) = MultiAddrCodec.decodeVarint(data);
      if (consumed > 0 && data.length >= consumed + length - 1) {
        // Extract message without trailing newline
        final messageBytes = data.sublist(consumed, consumed + length - 1);
        return utf8.decode(messageBytes);
      }
    } catch (e) {
      _logger.warning('Failed to parse delimited message: $e');
    }
    return null;
  }

  /// Handles incoming protocol messages and generates appropriate responses
  Future<void> _handleProtocolMessage(String message) async {
    _logger.fine('Handling protocol message: "$message"');

    if (!_multistreamHandshakeComplete) {
      if (message == multistreamProtocol) {
        // Respond with multistream protocol acknowledgment
        await _sendDelimitedMessage(multistreamProtocol);
        _multistreamHandshakeComplete = true;
        _logger.fine('Multistream handshake complete');
      }
      return;
    }

    if (!_securityNegotiationComplete) {
      if (supportedSecurityProtocols.contains(message)) {
        // Accept the security protocol
        await _sendDelimitedMessage(message);
        _negotiatedSecurityProtocol = message;
        _securityNegotiationComplete = true;
        _logger.fine('Security protocol negotiated: $message');
      } else {
        // Reject unsupported protocol
        await _sendDelimitedMessage('na');
      }
      return;
    }

    if (!_muxerNegotiationComplete) {
      if (supportedMuxerProtocols.contains(message)) {
        // Accept the muxer protocol
        await _sendDelimitedMessage(message);
        _negotiatedMuxerProtocol = message;
        _muxerNegotiationComplete = true;
        _logger.fine('Muxer protocol negotiated: $message');
      } else {
        // Reject unsupported protocol
        await _sendDelimitedMessage('na');
      }
      return;
    }
  }

  /// Sends a delimited message as a response
  Future<void> _sendDelimitedMessage(String message) async {
    final messageBytes = utf8.encode(message);
    final lengthBytes = MultiAddrCodec.encodeVarint(messageBytes.length + 1);
    
    final fullMessage = Uint8List(lengthBytes.length + messageBytes.length + 1);
    fullMessage.setRange(0, lengthBytes.length, lengthBytes);
    fullMessage.setRange(lengthBytes.length, lengthBytes.length + messageBytes.length, messageBytes);
    fullMessage[lengthBytes.length + messageBytes.length] = 10; // '\n'
    
    _readBuffer.add(fullMessage);
    _logger.fine('Queued response: "$message"');
  }

  @override
  Future<void> close() async {
    if (!_isClosed) {
      _isClosed = true;
      _writeBuffer.clear();
      _readBuffer.clear();
      _logger.fine('Mock connection closed: $_id');
    }
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
    throw UnimplementedError('newStream should be handled by upgraded connection');
  }
}

/// Mock secured connection that wraps the transport connection
class MockSecuredConnection implements TransportConn {
  final EnhancedMockTransportConn _transportConn;
  final String _securityProtocol;

  MockSecuredConnection(this._transportConn, this._securityProtocol);

  @override
  String get id => '${_transportConn.id}-secured';

  @override
  MultiAddr get localMultiaddr => _transportConn.localMultiaddr;

  @override
  MultiAddr get remoteMultiaddr => _transportConn.remoteMultiaddr;

  @override
  PeerId get localPeer => _transportConn.localPeer;

  @override
  PeerId get remotePeer => _transportConn.remotePeer;

  @override
  bool get isClosed => _transportConn.isClosed;

  @override
  Future<List<P2PStream>> get streams => _transportConn.streams;

  @override
  Future<PublicKey?> get remotePublicKey => _transportConn.remotePublicKey;

  @override
  ConnState get state => ConnState(
    streamMultiplexer: _transportConn.state.streamMultiplexer,
    security: _securityProtocol,
    transport: 'mock',
    usedEarlyMuxerNegotiation: false,
  );

  @override
  ConnStats get stat => _transportConn.stat;

  @override
  ConnScope get scope => _transportConn.scope;

  @override
  Socket get socket => _transportConn.socket;

  @override
  Future<Uint8List> read([int? length]) => _transportConn.read(length);

  @override
  Future<void> write(Uint8List data) => _transportConn.write(data);

  @override
  Future<void> close() => _transportConn.close();

  @override
  void setReadTimeout(Duration timeout) => _transportConn.setReadTimeout(timeout);

  @override
  void setWriteTimeout(Duration timeout) => _transportConn.setWriteTimeout(timeout);

  @override
  void notifyActivity() => _transportConn.notifyActivity();

  @override
  Future<P2PStream> newStream(Context context) => _transportConn.newStream(context);
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
