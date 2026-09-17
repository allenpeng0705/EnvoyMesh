import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:test/test.dart';
import 'package:logging/logging.dart';

import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/context.dart';
import 'package:dart_libp2p/core/crypto/ed25519.dart';
import 'package:dart_libp2p/p2p/security/secured_connection.dart';

// Import streamlined mocks for testing
import '../mocks/streamlined_mock_transport_conn.dart';
import '../mocks/streamlined_mock_multiplexer.dart' as mux;
import '../mocks/mock_security_protocol.dart';

void main() {
  // Set up logging for tests
  Logger.root.level = Level.INFO;
  Logger.root.onRecord.listen((record) {
    print('${record.level.name}: ${record.time}: ${record.message}');
  });

  group('Simple Multiplexer Tests', () {
    test('basic multiplexer stream creation', () async {
      print('\n=== Testing Basic Multiplexer Stream Creation ===');
      
      // Create a simple mock transport connection
      final localPeer = PeerId.fromPublicKey((await generateEd25519KeyPair()).publicKey);
      final remotePeer = PeerId.fromPublicKey((await generateEd25519KeyPair()).publicKey);
      
      final mockTransportConn = StreamlinedMockTransportConn(
        id: 'test-conn-1',
        localAddr: MultiAddr('/ip4/127.0.0.1/tcp/0'),
        remoteAddr: MultiAddr('/ip4/127.0.0.1/tcp/12345'),
        localPeer: localPeer,
        remotePeer: remotePeer,
      );
      
      print('Created mock transport connection: ${mockTransportConn.id}');
      
      // Create a mock secured connection
      final mockSecurityProtocol = MockSecurityProtocol();
      final securedConn = await mockSecurityProtocol.secureOutbound(mockTransportConn);
      
      print('Created secured connection: ${securedConn.id}');
      
      // Create the multiplexer factory and then a muxed connection
      final multiplexerFactory = mux.StreamlinedMockMultiplexerFactory();
      final muxedConn = await multiplexerFactory.newConnOnTransport(securedConn, false, mux.NullScope()) as mux.StreamlinedMockMuxedConn;
      final multiplexer = muxedConn.multiplexer;
      
      print('Created multiplexer with protocol: ${multiplexer.protocolId}');
      print('Initial stream count: ${multiplexer.totalStreamsCreated}');
      
      // Test creating a few streams manually
      print('\nTesting manual stream creation...');
      
      final stream1 = multiplexer.createStream(Context(), isOutbound: true);
      print('Created stream 1: ${stream1.id()}');
      print('Total streams after stream 1: ${multiplexer.totalStreamsCreated}');
      
      final stream2 = multiplexer.createStream(Context(), isOutbound: true);
      print('Created stream 2: ${stream2.id()}');
      print('Total streams after stream 2: ${multiplexer.totalStreamsCreated}');
      
      final stream3 = multiplexer.createStream(Context(), isOutbound: true);
      print('Created stream 3: ${stream3.id()}');
      print('Total streams after stream 3: ${multiplexer.totalStreamsCreated}');
      
      // Verify the streams work
      await stream1.write(utf8.encode('test data 1'));
      await stream2.write(utf8.encode('test data 2'));
      await stream3.write(utf8.encode('test data 3'));
      
      print('Successfully wrote data to all streams');
      
      // Test closing streams
      await stream1.close();
      print('Closed stream 1, active streams: ${multiplexer.activeStreams}');
      
      await stream2.close();
      print('Closed stream 2, active streams: ${multiplexer.activeStreams}');
      
      // Verify we can still create new streams
      final stream4 = multiplexer.createStream(Context(), isOutbound: true);
      print('Created stream 4: ${stream4.id()}');
      print('Total streams after stream 4: ${multiplexer.totalStreamsCreated}');
      print('Active streams: ${multiplexer.activeStreams}');
      
      // Clean up
      await stream3.close();
      await stream4.close();
      await multiplexer.close();
      
      print('✓ Basic multiplexer test completed successfully!');
      print('Final stats: Total created: ${multiplexer.totalStreamsCreated}, Final active: ${multiplexer.activeStreams}');
    });

    test('multiplexer with muxed connection', () async {
      print('\n=== Testing Multiplexer with MuxedConn ===');
      
      // Create a simple mock transport connection
      final localPeer = PeerId.fromPublicKey((await generateEd25519KeyPair()).publicKey);
      final remotePeer = PeerId.fromPublicKey((await generateEd25519KeyPair()).publicKey);
      
      final mockTransportConn = StreamlinedMockTransportConn(
        id: 'test-conn-2',
        localAddr: MultiAddr('/ip4/127.0.0.1/tcp/0'),
        remoteAddr: MultiAddr('/ip4/127.0.0.1/tcp/12345'),
        localPeer: localPeer,
        remotePeer: remotePeer,
      );
      
      // Create a mock secured connection
      final mockSecurityProtocol = MockSecurityProtocol();
      final securedConn = await mockSecurityProtocol.secureOutbound(mockTransportConn);
      
      // Create the multiplexer
      final multiplexer = mux.StreamlinedMockMultiplexer(securedConn, true);
      print('Created multiplexer, initial streams: ${multiplexer.totalStreamsCreated}');
      
      // Create a muxed connection
      final muxedConn = mux.StreamlinedMockMuxedConn(securedConn, false, multiplexer);
      print('Created muxed connection');
      
      // Test opening streams through the muxed connection
      print('\nTesting stream creation through muxed connection...');
      
      final stream1 = await muxedConn.openStream(Context()) as mux.StreamlinedMockStream;
      print('Opened stream 1 through muxed conn: ${stream1.id()}');
      print('Total streams: ${multiplexer.totalStreamsCreated}');
      
      final stream2 = await muxedConn.openStream(Context()) as mux.StreamlinedMockStream;
      print('Opened stream 2 through muxed conn: ${stream2.id()}');
      print('Total streams: ${multiplexer.totalStreamsCreated}');
      
      // Test writing data
      await stream1.write(utf8.encode('muxed stream data 1'));
      await stream2.write(utf8.encode('muxed stream data 2'));
      print('Successfully wrote data through muxed streams');
      
      // Clean up
      await stream1.close();
      await stream2.close();
      await muxedConn.close();
      
      print('✓ Muxed connection test completed successfully!');
      print('Final stats: Total created: ${multiplexer.totalStreamsCreated}, Final active: ${multiplexer.activeStreams}');
    });
  });
}
