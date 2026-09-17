import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/transport_conn.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/network/stream.dart';
import 'package:dart_libp2p/core/network/context.dart';
import 'package:dart_libp2p/core/network/rcmgr.dart';
import 'package:dart_libp2p/core/network/common.dart';
import 'package:dart_libp2p/core/crypto/keys.dart';

import 'yamux_mock_connection.dart';

/// Mock implementation of ConnStats for testing
class MockConnStats extends ConnStats {
  MockConnStats({
    required Direction direction,
    required DateTime opened,
    bool limited = false,
    Map<dynamic, dynamic> extra = const {},
    int numStreams = 0,
  }) : super(
    stats: Stats(
      direction: direction,
      opened: opened,
      limited: limited,
      extra: extra,
    ),
    numStreams: numStreams,
  );
}

/// Enhanced YamuxMockConnection that can be used as a TransportConn in swarm tests
/// Provides proper Yamux frame-level communication with auto-responses
class EnhancedYamuxTransportConn implements TransportConn {
  final YamuxMockConnection _yamuxConn;
  final PeerId _localPeer;
  final PeerId _remotePeer;
  final MultiAddr _localAddr;
  final MultiAddr _remoteAddr;
  final ConnScope _scope;

  EnhancedYamuxTransportConn._({
    required YamuxMockConnection yamuxConn,
    required PeerId localPeer,
    required PeerId remotePeer,
    required MultiAddr localAddr,
    required MultiAddr remoteAddr,
    required ConnScope scope,
  }) : _yamuxConn = yamuxConn,
       _localPeer = localPeer,
       _remotePeer = remotePeer,
       _localAddr = localAddr,
       _remoteAddr = remoteAddr,
       _scope = scope;

  /// Creates a pair of connected enhanced Yamux transport connections
  static (EnhancedYamuxTransportConn, EnhancedYamuxTransportConn) createConnectedPair({
    required PeerId peer1,
    required PeerId peer2,
    required MultiAddr addr1,
    required MultiAddr addr2,
    required ConnScope scope1,
    required ConnScope scope2,
    String id1 = 'enhanced-yamux-1',
    String id2 = 'enhanced-yamux-2',
    bool enableFrameLogging = false,
  }) {
    // Create the underlying Yamux mock connection pair
    final (yamuxConn1, yamuxConn2) = YamuxMockConnection.createPair(
      id1: id1,
      id2: id2,
      enableFrameLogging: enableFrameLogging,
      autoRespondToSyn: true,
      autoRespondToPing: true,
    );

    final conn1 = EnhancedYamuxTransportConn._(
      yamuxConn: yamuxConn1,
      localPeer: peer1,
      remotePeer: peer2,
      localAddr: addr1,
      remoteAddr: addr2,
      scope: scope1,
    );

    final conn2 = EnhancedYamuxTransportConn._(
      yamuxConn: yamuxConn2,
      localPeer: peer2,
      remotePeer: peer1,
      localAddr: addr2,
      remoteAddr: addr1,
      scope: scope2,
    );

    return (conn1, conn2);
  }

  // TransportConn interface implementation
  @override
  Future<Uint8List> read([int? length]) => _yamuxConn.read(length);

  @override
  Future<void> write(Uint8List data) => _yamuxConn.write(data);

  @override
  Socket get socket => throw UnimplementedError('Socket not available in mock connection');

  @override
  void setReadTimeout(Duration timeout) => _yamuxConn.setReadTimeout(timeout);

  @override
  void setWriteTimeout(Duration timeout) => _yamuxConn.setWriteTimeout(timeout);

  @override
  void notifyActivity() => _yamuxConn.notifyActivity();

  // Conn interface implementation
  @override
  Future<void> close() => _yamuxConn.close();

  @override
  String get id => _yamuxConn.id;

  @override
  Future<P2PStream> newStream(Context context) {
    throw UnimplementedError('newStream should be handled by multiplexer');
  }

  @override
  Future<List<P2PStream>> get streams async => [];

  @override
  bool get isClosed => _yamuxConn.isClosed;

  @override
  PeerId get localPeer => _localPeer;

  @override
  PeerId get remotePeer => _remotePeer;

  @override
  Future<PublicKey?> get remotePublicKey async => null; // Mock implementation

  @override
  MultiAddr get localMultiaddr => _localAddr;

  @override
  MultiAddr get remoteMultiaddr => _remoteAddr;

  @override
  ConnScope get scope => _scope;

  @override
  ConnStats get stat => MockConnStats(
    direction: Direction.outbound,
    opened: DateTime.now(),
    numStreams: 0,
  );

  @override
  ConnState get state => ConnState(
    streamMultiplexer: '/yamux/1.0.0',
    security: '/noise',
    transport: '/tcp',
    usedEarlyMuxerNegotiation: false,
  );

  @override
  String toString() => 'EnhancedYamuxTransportConn($id: ${_localPeer.toString().substring(0, 8)}...→${_remotePeer.toString().substring(0, 8)}...)';
}
