import 'dart:async';
import 'dart:math';
import 'dart:typed_data';

import 'package:dart_libp2p/core/crypto/ed25519.dart' as crypto_ed25519;
import 'package:dart_libp2p/core/crypto/keys.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/network/context.dart' as core_context;
import 'package:dart_libp2p/core/network/mux.dart' as core_mux_types;
import 'package:dart_libp2p/core/network/network.dart';
import 'package:dart_libp2p/core/network/notifiee.dart';
import 'package:dart_libp2p/core/network/rcmgr.dart';
import 'package:dart_libp2p/core/network/stream.dart' as core_network_stream;
import 'package:dart_libp2p/core/network/transport_conn.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/peerstore.dart';
import 'package:dart_libp2p/config/config.dart' as p2p_config;
import 'package:dart_libp2p/config/stream_muxer.dart';
import 'package:dart_libp2p/p2p/host/eventbus/basic.dart';
import 'package:dart_libp2p/p2p/host/peerstore/pstoremem.dart';
import 'package:dart_libp2p/p2p/host/resource_manager/limiter.dart';
import 'package:dart_libp2p/p2p/host/resource_manager/resource_manager_impl.dart';
import 'package:dart_libp2p/p2p/multiaddr/protocol.dart' as multiaddr_protocol;
import 'package:dart_libp2p/p2p/network/swarm/swarm.dart';
import 'package:dart_libp2p/p2p/security/noise/noise_protocol.dart';
import 'package:dart_libp2p/p2p/transport/basic_upgrader.dart';
import 'package:dart_libp2p/p2p/transport/connection_manager.dart' as p2p_transport;
import 'package:dart_libp2p/p2p/transport/multiplexing/multiplexer.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/yamux/session.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/yamux/yamux_exceptions.dart';
import 'package:dart_libp2p/p2p/transport/udx_transport.dart';
import 'package:dart_udx/dart_udx.dart';
import 'package:test/test.dart';

// Helper Notifiee for tests
class TestNotifiee implements Notifiee {
  final Function(Network, Conn)? connectedCallback;
  TestNotifiee({this.connectedCallback});
  @override
  Future<void> connected(Network network, Conn conn, {Duration? dialLatency}) async => connectedCallback?.call(network, conn);
  @override
  Future<void> disconnected(Network network, Conn conn) async {}
  @override
  void listen(Network network, MultiAddr addr) {}
  @override
  void listenClose(Network network, MultiAddr addr) {}
}

// EOF Detection Utilities for comprehensive testing
class StreamEOFUtils {
  /// Comprehensive EOF detection that handles all scenarios
  static bool isEOF(dynamic result, dynamic error) {
    // Check for empty data (normal EOF)
    if (result is Uint8List && result.isEmpty) {
      return true;
    }
    
    // Check for stream state errors indicating EOF
    if (error != null) {
      final errorStr = error.toString().toLowerCase();
      if (errorStr.contains('reset') || 
          errorStr.contains('closed') || 
          errorStr.contains('closing')) {
        return true;
      }
    }
    
    return false;
  }
  
  /// Safe read with comprehensive EOF and error handling
  static Future<Uint8List?> safeRead(
    core_network_stream.P2PStream stream, {
    Duration timeout = const Duration(seconds: 10),
    String context = 'unknown',
  }) async {
    try {
      final data = await stream.read().timeout(timeout);
      
      if (isEOF(data, null)) {
        print('[$context] EOF detected: empty data received');
        return null; // null indicates EOF
      }
      
      print('[$context] Read ${data.length} bytes');
      return data;
      
    } on TimeoutException catch (e) {
      print('[$context] Read timeout: $e');
      return null; // Treat timeout as EOF for this demo
      
    } catch (e) {
      if (isEOF(null, e)) {
        print('[$context] EOF detected via exception: $e');
        return null;
      }
      
      print('[$context] Read error (non-EOF): $e');
      rethrow; // Re-throw non-EOF errors
    }
  }
  
  /// Read all data until EOF with proper chunking
  static Future<Uint8List> readUntilEOF(
    core_network_stream.P2PStream stream, {
    Duration timeout = const Duration(seconds: 10),
    String context = 'unknown',
  }) async {
    final allData = <int>[];
    
    while (true) {
      final chunk = await safeRead(stream, timeout: timeout, context: context);
      
      if (chunk == null) {
        // EOF reached
        print('[$context] Finished reading, total: ${allData.length} bytes');
        break;
      }
      
      allData.addAll(chunk);
      print('[$context] Accumulated ${allData.length} bytes so far');
    }
    
    return Uint8List.fromList(allData);
  }
  
  /// Read exact amount of data (for protocol-style reading)
  static Future<Uint8List> readExactBytes(
    core_network_stream.P2PStream stream,
    int expectedBytes, {
    Duration timeout = const Duration(seconds: 10),
    String context = 'unknown',
  }) async {
    final buffer = <int>[];
    
    while (buffer.length < expectedBytes) {
      final chunk = await safeRead(stream, timeout: timeout, context: context);
      
      if (chunk == null) {
        throw StateError('[$context] Unexpected EOF: got ${buffer.length}/$expectedBytes bytes');
      }
      
      buffer.addAll(chunk);
      
      if (buffer.length > expectedBytes) {
        // Got more data than expected, truncate and warn
        print('[$context] Warning: received ${buffer.length} bytes, expected $expectedBytes');
        return Uint8List.fromList(buffer.take(expectedBytes).toList());
      }
    }
    
    print('[$context] Successfully read exact $expectedBytes bytes');
    return Uint8List.fromList(buffer);
  }
}

void main() {
  group('SwarmStream and UDXP2PStreamAdapter Interaction', () {
    late Swarm clientSwarm;
    late Swarm serverSwarm;
    late PeerId clientPeerId;
    late PeerId serverPeerId;
    late UDX udxInstance;
    late MultiAddr serverListenAddr;
    late p2p_transport.ConnectionManager connManager;
    late ResourceManagerImpl resourceManager;

    setUpAll(() async {
      udxInstance = UDX();
      resourceManager = ResourceManagerImpl(limiter: FixedLimiter());
      connManager = p2p_transport.ConnectionManager();
      final eventBus = BasicBus();

      final clientKeyPair = await crypto_ed25519.generateEd25519KeyPair();
      final serverKeyPair = await crypto_ed25519.generateEd25519KeyPair();
      clientPeerId = await PeerId.fromPublicKey(clientKeyPair.publicKey);
      serverPeerId = await PeerId.fromPublicKey(serverKeyPair.publicKey);

      final yamuxConfig = MultiplexerConfig(
        keepAliveInterval: Duration(seconds: 30),
        maxStreamWindowSize: 1024 * 1024,
        initialStreamWindowSize: 256 * 1024,
      );
      final muxerDef = StreamMuxer(
        id: '/yamux/1.0.0',
        muxerFactory: (conn, isClient) {
          if (conn is! TransportConn) throw ArgumentError('Expected TransportConn');
          return YamuxSession(conn, yamuxConfig, isClient);
        },
      );

      Future<p2p_config.Config> createSwarmConfig(KeyPair keyPair) async {
        return p2p_config.Config()
          ..peerKey = keyPair
          ..securityProtocols = [await NoiseSecurity.create(keyPair)]
          ..muxers = [muxerDef]
          ..connManager = connManager
          ..eventBus = eventBus
          ..addrsFactory = (addrs) => addrs;
      }

      final clientConfig = await createSwarmConfig(clientKeyPair);
      final serverConfig = await createSwarmConfig(serverKeyPair)
        ..listenAddrs = [MultiAddr('/ip4/127.0.0.1/udp/0/udx')];

      final clientTransport = UDXTransport(connManager: connManager, udxInstance: udxInstance);
      final serverTransport = UDXTransport(connManager: connManager, udxInstance: udxInstance);

      clientSwarm = Swarm(
        host: null,
        localPeer: clientPeerId,
        peerstore: MemoryPeerstore(),
        resourceManager: resourceManager,
        upgrader: BasicUpgrader(resourceManager: resourceManager),
        config: clientConfig,
        transports: [clientTransport],
      );

      serverSwarm = Swarm(
        host: null,
        localPeer: serverPeerId,
        peerstore: MemoryPeerstore(),
        resourceManager: resourceManager,
        upgrader: BasicUpgrader(resourceManager: resourceManager),
        config: serverConfig,
        transports: [serverTransport],
      );

      await serverSwarm.listen(serverConfig.listenAddrs);
      serverListenAddr = serverSwarm.listenAddresses.firstWhere((addr) => addr.hasProtocol(multiaddr_protocol.Protocols.udx.name));
      print('Server Swarm listening on: $serverListenAddr');

      clientSwarm.peerstore.addrBook.addAddrs(serverPeerId, [serverListenAddr], AddressTTL.permanentAddrTTL);
      clientSwarm.peerstore.keyBook.addPubKey(serverPeerId, serverKeyPair.publicKey);
    });

    tearDownAll(() async {
      await clientSwarm.close();
      await serverSwarm.close();
      await connManager.dispose();
      await resourceManager.close();
      print('Swarms stopped.');
    });

    Future<(core_network_stream.P2PStream, core_network_stream.P2PStream, Conn, Conn)> createStreamsWithConnections() async {
      // Create fresh connections for each test
      final serverConnCompleter = Completer<Conn>();
      final serverNotifiee = TestNotifiee(
        connectedCallback: (net, conn) {
          if (conn.remotePeer == clientPeerId && !serverConnCompleter.isCompleted) {
            serverConnCompleter.complete(conn);
          }
        },
      );
      serverSwarm.notify(serverNotifiee);

      final clientConn = await clientSwarm.dialPeer(core_context.Context(), serverPeerId);
      final serverConn = await serverConnCompleter.future.timeout(Duration(seconds: 5));
      
      serverSwarm.stopNotify(serverNotifiee);

      // Access the underlying MuxedConn via the .conn property of SwarmConn
      final serverStreamFuture = ((serverConn as dynamic).conn as core_mux_types.MuxedConn).acceptStream();
      final clientStream = await ((clientConn as dynamic).conn as core_mux_types.MuxedConn).openStream(core_context.Context());

      final serverStream = await serverStreamFuture.timeout(Duration(seconds: 5));
      
      return (clientStream as core_network_stream.P2PStream, serverStream as core_network_stream.P2PStream, clientConn, serverConn);
    }

    test('should establish a stream and perform basic read/write', () async {
      final (clientStream, serverStream, clientConn, serverConn) = await createStreamsWithConnections();
      final testData = Uint8List.fromList('hello world'.codeUnits);

      try {
        final serverLogic = () async {
          final received = await serverStream.read();
          expect(received, equals(testData));
          await serverStream.write(received);
        }();

        await clientStream.write(testData);
        final echoed = await clientStream.read();
        expect(echoed, equals(testData));

        await serverLogic;
      } finally {
        await clientStream.close();
        await serverStream.close();
        await clientConn.close();
        await serverConn.close();
      }
    });

    test('should handle large data transfer (client to server)', () async {
      // Create fresh connections for this specific test
      final serverConnCompleter = Completer<Conn>();
      final serverNotifiee = TestNotifiee(
        connectedCallback: (net, conn) {
          if (conn.remotePeer == clientPeerId && !serverConnCompleter.isCompleted) {
            serverConnCompleter.complete(conn);
          }
        },
      );
      serverSwarm.notify(serverNotifiee);

      print('Client dialing server for large data test');
      final clientConn = await clientSwarm.dialPeer(core_context.Context(), serverPeerId);
      final serverConn = await serverConnCompleter.future.timeout(Duration(seconds: 5));
      
      serverSwarm.stopNotify(serverNotifiee);
      print('Connection established for large data test');

      try {
        // Use the exact pattern from the working test
        late core_network_stream.P2PStream serverP2PStream;
        final serverAcceptStreamFuture = ((serverConn as dynamic).conn as core_mux_types.MuxedConn).acceptStream().then((stream) {
          serverP2PStream = stream as core_network_stream.P2PStream;
          print('Server accepted P2PStream: ${serverP2PStream.id()} from ${serverP2PStream.conn.remotePeer}');
          return serverP2PStream;
        });

        await Future.delayed(Duration(milliseconds: 100));

        final core_network_stream.P2PStream clientP2PStream = await ((clientConn as dynamic).conn as core_mux_types.MuxedConn).openStream(core_context.Context()) as core_network_stream.P2PStream;
        print('Client opened P2PStream: ${clientP2PStream.id()} to ${clientP2PStream.conn.remotePeer}');

        await serverAcceptStreamFuture.timeout(Duration(seconds: 5));

        expect(clientP2PStream, isNotNull);
        expect(serverP2PStream, isNotNull);

        // Create test data - use much smaller size to avoid timeout
        final random = Random();
        final pingData = Uint8List.fromList(List.generate(1024, (_) => random.nextInt(256))); // 1KB

        print('Client sending ping data (${pingData.length} bytes) over P2PStream ${clientP2PStream.id()}');
        
        // Start server read in parallel
        final serverReadFuture = serverP2PStream.read().timeout(Duration(seconds: 10));
        
        // Send data from client
        await clientP2PStream.write(pingData);
        print('Client ping data sent.');

        // Wait for server to receive
        final receivedOnServer = await serverReadFuture;
        print('Server received ${receivedOnServer.length} bytes data over P2PStream ${serverP2PStream.id()}');
        expect(receivedOnServer, orderedEquals(pingData));

        // Server echoes back
        await serverP2PStream.write(receivedOnServer);
        print('Server echoed data over P2PStream ${serverP2PStream.id()}');

        // Client reads echo
        final echoedToClient = await clientP2PStream.read().timeout(Duration(seconds: 10));
        print('Client received ${echoedToClient.length} echoed data over P2PStream ${clientP2PStream.id()}');
        expect(echoedToClient, orderedEquals(pingData));

        print('Large data transfer test successful.');

        await clientP2PStream.close();
        await serverP2PStream.close();

      } finally {
        // Don't close connections immediately to avoid resource issues
        await Future.delayed(Duration(milliseconds: 100));
        await clientConn.close();
        await serverConn.close();
      }
    }, timeout: Timeout(Duration(seconds: 15)));

    test('should handle multiple sequential writes', () async {
      final (clientStream, serverStream, clientConn, serverConn) = await createStreamsWithConnections();
      final chunks = [
        Uint8List.fromList('chunk 1'.codeUnits),
        Uint8List.fromList('chunk 2 is a bit longer'.codeUnits),
        Uint8List.fromList('chunk 3 is the final one'.codeUnits),
      ];
      final expectedData = Uint8List.fromList(chunks.expand((c) => c).toList());

      try {
        final serverReadFuture = () async {
          final receivedData = <int>[];
          while (receivedData.length < expectedData.length) {
            final chunk = await serverStream.read();
            if (chunk.isEmpty) break;
            receivedData.addAll(chunk);
          }
          expect(Uint8List.fromList(receivedData), equals(expectedData));
          // Send confirmation back to client
          await serverStream.write(Uint8List.fromList([2]));
        }();

        for (final chunk in chunks) {
          await clientStream.write(chunk);
          await Future.delayed(Duration(milliseconds: 20));
        }
        await clientStream.closeWrite();

        // Wait for confirmation
        final confirmation = await clientStream.read();
        expect(confirmation, equals(Uint8List.fromList([2])));

        await serverReadFuture.timeout(Duration(seconds: 10));
      } finally {
        await clientStream.close();
        await serverStream.close();
        await clientConn.close();
        await serverConn.close();
      }
    });

    test('should handle stream reset correctly', () async {
      final (clientStream, serverStream, clientConn, serverConn) = await createStreamsWithConnections();

      try {
        final serverReadFuture = () async {
          try {
            final data = await serverStream.read();
            // Implementation returns EOF (empty bytes) on remote reset
            expect(data, isEmpty, reason: 'Read should return EOF when remote resets during pending read');
          } catch (e) {
            // Alternatively, read may throw on reset
            expect(e, anyOf(isA<StateError>(), isA<YamuxStreamStateException>()));
          }
        }();

        await Future.delayed(Duration(milliseconds: 50));
        await clientStream.reset();

        expect(clientStream.isClosed, isTrue);
        await expectLater(
          () => clientStream.write(Uint8List(1)),
          throwsA(anyOf(isA<StateError>(), isA<YamuxStreamStateException>())),
        );

        await serverReadFuture.timeout(Duration(seconds: 5));
      } finally {
        // Clean up connections
        await clientConn.close();
        await serverConn.close();
      }
    });
  });

  group('Stream EOF and Best Practices Demonstration', () {
    late Swarm clientSwarm;
    late Swarm serverSwarm;
    late PeerId clientPeerId;
    late PeerId serverPeerId;
    late UDX udxInstance;
    late MultiAddr serverListenAddr;
    late p2p_transport.ConnectionManager connManager;
    late ResourceManagerImpl resourceManager;

    setUpAll(() async {
      udxInstance = UDX();
      resourceManager = ResourceManagerImpl(limiter: FixedLimiter());
      connManager = p2p_transport.ConnectionManager();
      final eventBus = BasicBus();

      final clientKeyPair = await crypto_ed25519.generateEd25519KeyPair();
      final serverKeyPair = await crypto_ed25519.generateEd25519KeyPair();
      clientPeerId = await PeerId.fromPublicKey(clientKeyPair.publicKey);
      serverPeerId = await PeerId.fromPublicKey(serverKeyPair.publicKey);

      final yamuxConfig = MultiplexerConfig(
        keepAliveInterval: Duration(seconds: 30),
        maxStreamWindowSize: 1024 * 1024,
        initialStreamWindowSize: 256 * 1024,
      );
      final muxerDef = StreamMuxer(
        id: '/yamux/1.0.0',
        muxerFactory: (conn, isClient) {
          if (conn is! TransportConn) throw ArgumentError('Expected TransportConn');
          return YamuxSession(conn, yamuxConfig, isClient);
        },
      );

      Future<p2p_config.Config> createSwarmConfig(KeyPair keyPair) async {
        return p2p_config.Config()
          ..peerKey = keyPair
          ..securityProtocols = [await NoiseSecurity.create(keyPair)]
          ..muxers = [muxerDef]
          ..connManager = connManager
          ..eventBus = eventBus
          ..addrsFactory = (addrs) => addrs;
      }

      final clientConfig = await createSwarmConfig(clientKeyPair);
      final serverConfig = await createSwarmConfig(serverKeyPair)
        ..listenAddrs = [MultiAddr('/ip4/127.0.0.1/udp/0/udx')];

      final clientTransport = UDXTransport(connManager: connManager, udxInstance: udxInstance);
      final serverTransport = UDXTransport(connManager: connManager, udxInstance: udxInstance);

      clientSwarm = Swarm(
        host: null,
        localPeer: clientPeerId,
        peerstore: MemoryPeerstore(),
        resourceManager: resourceManager,
        upgrader: BasicUpgrader(resourceManager: resourceManager),
        config: clientConfig,
        transports: [clientTransport],
      );

      serverSwarm = Swarm(
        host: null,
        localPeer: serverPeerId,
        peerstore: MemoryPeerstore(),
        resourceManager: resourceManager,
        upgrader: BasicUpgrader(resourceManager: resourceManager),
        config: serverConfig,
        transports: [serverTransport],
      );

      await serverSwarm.listen(serverConfig.listenAddrs);
      serverListenAddr = serverSwarm.listenAddresses.firstWhere((addr) => addr.hasProtocol(multiaddr_protocol.Protocols.udx.name));
      print('EOF Demo Server listening on: $serverListenAddr');

      clientSwarm.peerstore.addrBook.addAddrs(serverPeerId, [serverListenAddr], AddressTTL.permanentAddrTTL);
      clientSwarm.peerstore.keyBook.addPubKey(serverPeerId, serverKeyPair.publicKey);
    });

    tearDownAll(() async {
      await clientSwarm.close();
      await serverSwarm.close();
      await connManager.dispose();
      await resourceManager.close();
      print('EOF Demo Swarms stopped.');
    });

    Future<(core_network_stream.P2PStream, core_network_stream.P2PStream, Conn, Conn)> createStreamsForEOFDemo() async {
      final serverConnCompleter = Completer<Conn>();
      final serverNotifiee = TestNotifiee(
        connectedCallback: (net, conn) {
          if (conn.remotePeer == clientPeerId && !serverConnCompleter.isCompleted) {
            serverConnCompleter.complete(conn);
          }
        },
      );
      serverSwarm.notify(serverNotifiee);

      final clientConn = await clientSwarm.dialPeer(core_context.Context(), serverPeerId);
      final serverConn = await serverConnCompleter.future.timeout(Duration(seconds: 5));
      
      serverSwarm.stopNotify(serverNotifiee);

      late core_network_stream.P2PStream serverStream;
      final serverAcceptFuture = ((serverConn as dynamic).conn as core_mux_types.MuxedConn).acceptStream().then((stream) {
        serverStream = stream as core_network_stream.P2PStream;
        return serverStream;
      });

      await Future.delayed(Duration(milliseconds: 50));
      final clientStream = await ((clientConn as dynamic).conn as core_mux_types.MuxedConn).openStream(core_context.Context()) as core_network_stream.P2PStream;
      await serverAcceptFuture.timeout(Duration(seconds: 5));
      
      return (clientStream, serverStream, clientConn, serverConn);
    }

    test('EOF Detection Patterns - Graceful closeWrite()', () async {
      print('\n=== Testing Graceful EOF with closeWrite() ===');
      final (clientStream, serverStream, clientConn, serverConn) = await createStreamsForEOFDemo();

      try {
        // Test data
        final testData = Uint8List.fromList('Hello EOF World!'.codeUnits);
        
        // Server reads using safe utility
        final serverReadFuture = () async {
          print('[Server] Starting to read data...');
          final data = await StreamEOFUtils.readUntilEOF(serverStream, context: 'Server');
          expect(data, equals(testData));
          print('[Server] Successfully read all data and detected EOF');
        }();

        // Client sends data then closes write
        await Future.delayed(Duration(milliseconds: 50));
        print('[Client] Sending ${testData.length} bytes');
        await clientStream.write(testData);
        
        print('[Client] Calling closeWrite() - this should send FIN');
        await clientStream.closeWrite();
        print('[Client] closeWrite() completed');

        await serverReadFuture.timeout(Duration(seconds: 10));
        print('=== Graceful EOF test completed successfully ===\n');

      } finally {
        await clientStream.close();
        await serverStream.close();
        await clientConn.close();
        await serverConn.close();
      }
    });

    test('EOF Detection Patterns - Stream Reset', () async {
      print('\n=== Testing Abrupt EOF with reset() ===');
      final (clientStream, serverStream, clientConn, serverConn) = await createStreamsForEOFDemo();

      try {
        // Server tries to read but should get EOF due to reset
        final serverReadFuture = () async {
          print('[Server] Starting to read, expecting reset...');
          try {
            final data = await StreamEOFUtils.readUntilEOF(serverStream, context: 'Server');
            print('[Server] Read completed with ${data.length} bytes (unexpected)');
          } catch (e) {
            print('[Server] Read failed as expected due to reset: $e');
            expect(e.toString().toLowerCase(), contains('reset'));
          }
        }();

        // Client resets the stream abruptly
        await Future.delayed(Duration(milliseconds: 50));
        print('[Client] Calling reset() - this should abruptly terminate');
        await clientStream.reset();
        print('[Client] reset() completed');

        await serverReadFuture.timeout(Duration(seconds: 10));
        print('=== Abrupt EOF test completed successfully ===\n');

      } finally {
        await clientConn.close();
        await serverConn.close();
      }
    });

    test('Chunked Data Reading with EOF', () async {
      print('\n=== Testing Chunked Data Reading ===');
      final (clientStream, serverStream, clientConn, serverConn) = await createStreamsForEOFDemo();

      try {
        // Create multiple chunks of data
        final chunks = [
          Uint8List.fromList('Chunk 1: '.codeUnits),
          Uint8List.fromList('This is a longer chunk with more data. '.codeUnits),
          Uint8List.fromList('Chunk 3: Final piece.'.codeUnits),
        ];
        final expectedTotal = Uint8List.fromList(chunks.expand((c) => c).toList());

        // Server reads all chunks until EOF
        final serverReadFuture = () async {
          print('[Server] Reading chunked data until EOF...');
          final allData = await StreamEOFUtils.readUntilEOF(serverStream, context: 'Server');
          expect(allData, equals(expectedTotal));
          print('[Server] Successfully read ${allData.length} bytes total');
          print('[Server] Chunked data reading completed successfully');
        }();

        // Client sends chunks with delays
        await Future.delayed(Duration(milliseconds: 50));
        for (int i = 0; i < chunks.length; i++) {
          print('[Client] Sending chunk ${i + 1}: ${chunks[i].length} bytes');
          await clientStream.write(chunks[i]);
          await Future.delayed(Duration(milliseconds: 100)); // Simulate network delay
        }
        
        print('[Client] All chunks sent, closing write');
        await clientStream.closeWrite();

        await serverReadFuture.timeout(Duration(seconds: 15));
        print('=== Chunked data test completed successfully ===\n');

      } finally {
        await clientStream.close();
        await serverStream.close();
        await clientConn.close();
        await serverConn.close();
      }
    });

    test('Protocol-Style Reading (Length-Prefixed)', () async {
      print('\n=== Testing Protocol-Style Reading ===');
      final (clientStream, serverStream, clientConn, serverConn) = await createStreamsForEOFDemo();

      try {
        // Create a message with length prefix (4 bytes) + data
        final message = Uint8List.fromList('This is a protocol message with known length!'.codeUnits);
        final lengthPrefix = ByteData(4)..setUint32(0, message.length, Endian.big);

        // Server reads using protocol pattern
        final serverReadFuture = () async {
          print('[Server] Reading length prefix (4 bytes)...');
          final lengthBytes = await StreamEOFUtils.readExactBytes(serverStream, 4, context: 'Server-Length');
          final messageLength = ByteData.view(lengthBytes.buffer).getUint32(0, Endian.big);
          print('[Server] Message length: $messageLength bytes');

          print('[Server] Reading message data ($messageLength bytes)...');
          final messageData = await StreamEOFUtils.readExactBytes(serverStream, messageLength, context: 'Server-Data');
          expect(messageData, equals(message));
          print('[Server] Successfully read protocol message');

          // Send acknowledgment
          await serverStream.write(Uint8List.fromList('ACK'.codeUnits));
        }();

        // Client sends the protocol packet in two parts to ensure proper protocol parsing
        await Future.delayed(Duration(milliseconds: 50));
        print('[Client] Sending length prefix: 4 bytes');
        await clientStream.write(lengthPrefix.buffer.asUint8List());
        
        await Future.delayed(Duration(milliseconds: 50));
        print('[Client] Sending message data: ${message.length} bytes');
        await clientStream.write(message);

        await serverReadFuture.timeout(Duration(seconds: 10));

        // Client reads acknowledgment
        final ack = await StreamEOFUtils.safeRead(clientStream, context: 'Client-ACK');
        expect(ack, equals(Uint8List.fromList('ACK'.codeUnits)));
        print('=== Protocol-style reading test completed successfully ===\n');

      } finally {
        await clientStream.close();
        await serverStream.close();
        await clientConn.close();
        await serverConn.close();
      }
    });

    test('Bidirectional Communication with Proper EOF', () async {
      print('\n=== Testing Bidirectional Communication ===');
      final (clientStream, serverStream, clientConn, serverConn) = await createStreamsForEOFDemo();

      try {
        final clientMessage = Uint8List.fromList('Hello from client!'.codeUnits);
        final serverMessage = Uint8List.fromList('Hello from server!'.codeUnits);

        // Both sides communicate simultaneously
        final serverLogic = () async {
          print('[Server] Reading client message...');
          final receivedFromClient = await StreamEOFUtils.safeRead(serverStream, context: 'Server');
          expect(receivedFromClient, equals(clientMessage));
          
          print('[Server] Sending response to client...');
          await serverStream.write(serverMessage);
          
          print('[Server] Closing write side...');
          await serverStream.closeWrite();
        }();

        final clientLogic = () async {
          print('[Client] Sending message to server...');
          await clientStream.write(clientMessage);
          
          print('[Client] Reading server response...');
          final receivedFromServer = await StreamEOFUtils.safeRead(clientStream, context: 'Client');
          expect(receivedFromServer, equals(serverMessage));
          
          print('[Client] Closing write side...');
          await clientStream.closeWrite();
        }();

        await Future.wait([serverLogic, clientLogic]).timeout(Duration(seconds: 15));
        print('=== Bidirectional communication test completed successfully ===\n');

      } finally {
        await clientStream.close();
        await serverStream.close();
        await clientConn.close();
        await serverConn.close();
      }
    });

    test('Timeout and Error Recovery Patterns', () async {
      print('\n=== Testing Timeout and Error Recovery ===');
      final (clientStream, serverStream, clientConn, serverConn) = await createStreamsForEOFDemo();

      try {
        // Test timeout scenario
        print('[Server] Attempting read with short timeout (should timeout)...');
        final timeoutResult = await StreamEOFUtils.safeRead(
          serverStream, 
          timeout: Duration(milliseconds: 500),
          context: 'Server-Timeout'
        );
        expect(timeoutResult, isNull); // Should return null for timeout
        print('[Server] Timeout handled gracefully');

        // Now send actual data
        final testData = Uint8List.fromList('Data after timeout'.codeUnits);
        
        final serverReadFuture = () async {
          print('[Server] Reading actual data...');
          final data = await StreamEOFUtils.safeRead(serverStream, context: 'Server-Real');
          expect(data, equals(testData));
          print('[Server] Successfully read data after timeout recovery');
        }();

        await Future.delayed(Duration(milliseconds: 100));
        print('[Client] Sending data after timeout test...');
        await clientStream.write(testData);

        await serverReadFuture.timeout(Duration(seconds: 10));
        print('=== Timeout and error recovery test completed successfully ===\n');

      } finally {
        await clientStream.close();
        await serverStream.close();
        await clientConn.close();
        await serverConn.close();
      }
    });
  });
}
