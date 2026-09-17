import 'dart:typed_data';
import 'package:test/test.dart';
import 'package:mockito/mockito.dart';
import 'package:mockito/annotations.dart';
import 'package:dart_libp2p/p2p/protocol/circuitv2/client/conn.dart';
import 'package:dart_libp2p/p2p/protocol/circuitv2/client/client.dart';
import 'package:dart_libp2p/core/network/stream.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/network/common.dart';
import 'package:dart_libp2p/core/crypto/ed25519.dart' as crypto_ed25519;

// Generate mocks
@GenerateMocks([P2PStream, CircuitV2Client, Conn])
import 'relay_half_close_test.mocks.dart';

void main() {
  group('RelayedConn Half-Close', () {
    late MockP2PStream<Uint8List> mockStream;
    late MockCircuitV2Client mockTransport;
    late MockConn mockParentConn;
    late PeerId localPeer;
    late PeerId remotePeer;
    late MultiAddr localAddr;
    late MultiAddr remoteAddr;

    setUpAll(() async {
      // Generate proper PeerIds using crypto
      final localKeyPair = await crypto_ed25519.generateEd25519KeyPair();
      localPeer = PeerId.fromPublicKey(localKeyPair.publicKey);
      
      final remoteKeyPair = await crypto_ed25519.generateEd25519KeyPair();
      remotePeer = PeerId.fromPublicKey(remoteKeyPair.publicKey);
      
      print('Local PeerId: ${localPeer.toString()}');
      print('Remote PeerId: ${remotePeer.toString()}');
    });

    setUp(() {
      mockStream = MockP2PStream<Uint8List>();
      mockTransport = MockCircuitV2Client();
      mockParentConn = MockConn();
      
      localAddr = MultiAddr('/ip4/127.0.0.1/tcp/0/p2p/${localPeer.toString()}/p2p-circuit');
      remoteAddr = MultiAddr('/ip4/127.0.0.1/tcp/0/p2p/${remotePeer.toString()}');

      // Set up default mocks
      when(mockStream.id()).thenReturn('test-stream-1');
      when(mockStream.isClosed).thenReturn(false);
      when(mockStream.stat()).thenReturn(StreamStats(
        direction: Direction.outbound,
        opened: DateTime.now(),
      ));
      when(mockStream.conn).thenReturn(mockParentConn);
    });

    test('closeWrite() delegates to underlying stream', () async {
      when(mockStream.closeWrite()).thenAnswer((_) async {});
      
      final relayedConn = RelayedConn(
        stream: mockStream,
        transport: mockTransport,
        localPeer: localPeer,
        remotePeer: remotePeer,
        localMultiaddr: localAddr,
        remoteMultiaddr: remoteAddr,
      );

      await relayedConn.closeWrite();
      
      verify(mockStream.closeWrite()).called(1);
    });

    test('closeRead() delegates to underlying stream', () async {
      when(mockStream.closeRead()).thenAnswer((_) async {});
      
      final relayedConn = RelayedConn(
        stream: mockStream,
        transport: mockTransport,
        localPeer: localPeer,
        remotePeer: remotePeer,
        localMultiaddr: localAddr,
        remoteMultiaddr: remoteAddr,
      );

      await relayedConn.closeRead();
      
      verify(mockStream.closeRead()).called(1);
    });

    test('closeWrite() allows continued reads', () async {
      when(mockStream.closeWrite()).thenAnswer((_) async {});
      when(mockStream.read(any)).thenAnswer((_) async => Uint8List.fromList([1, 2, 3]));
      
      final relayedConn = RelayedConn(
        stream: mockStream,
        transport: mockTransport,
        localPeer: localPeer,
        remotePeer: remotePeer,
        localMultiaddr: localAddr,
        remoteMultiaddr: remoteAddr,
      );

      await relayedConn.closeWrite();
      
      // Should still be able to read
      final data = await relayedConn.read();
      expect(data, equals(Uint8List.fromList([1, 2, 3])));
      
      verify(mockStream.closeWrite()).called(1);
      verify(mockStream.read(null)).called(1);
    });

    test('closeWrite() prevents further writes but allows reads', () async {
      when(mockStream.closeWrite()).thenAnswer((_) async {});
      when(mockStream.write(any)).thenThrow(StateError('Stream is closed for writing'));
      when(mockStream.read(any)).thenAnswer((_) async => Uint8List.fromList([4, 5, 6]));
      
      final relayedConn = RelayedConn(
        stream: mockStream,
        transport: mockTransport,
        localPeer: localPeer,
        remotePeer: remotePeer,
        localMultiaddr: localAddr,
        remoteMultiaddr: remoteAddr,
      );

      await relayedConn.closeWrite();
      
      // Writes should fail
      expect(
        () => relayedConn.write(Uint8List.fromList([7, 8, 9])),
        throwsStateError,
      );
      
      // But reads should still work
      final data = await relayedConn.read();
      expect(data, equals(Uint8List.fromList([4, 5, 6])));
    });

    test('full close() after closeWrite() works correctly', () async {
      when(mockStream.closeWrite()).thenAnswer((_) async {});
      when(mockStream.close()).thenAnswer((_) async {});
      when(mockStream.isClosed).thenReturn(true);
      
      final relayedConn = RelayedConn(
        stream: mockStream,
        transport: mockTransport,
        localPeer: localPeer,
        remotePeer: remotePeer,
        localMultiaddr: localAddr,
        remoteMultiaddr: remoteAddr,
      );

      await relayedConn.closeWrite();
      await relayedConn.close();
      
      expect(relayedConn.isClosed, isTrue);
      
      verify(mockStream.closeWrite()).called(1);
      verify(mockStream.close()).called(1);
    });

    test('bidirectional half-close with independent read/write closure', () async {
      when(mockStream.closeWrite()).thenAnswer((_) async {});
      when(mockStream.closeRead()).thenAnswer((_) async {});
      
      final relayedConn = RelayedConn(
        stream: mockStream,
        transport: mockTransport,
        localPeer: localPeer,
        remotePeer: remotePeer,
        localMultiaddr: localAddr,
        remoteMultiaddr: remoteAddr,
      );

      // Close write side
      await relayedConn.closeWrite();
      verify(mockStream.closeWrite()).called(1);
      
      // Close read side independently
      await relayedConn.closeRead();
      verify(mockStream.closeRead()).called(1);
    });
  });
}

