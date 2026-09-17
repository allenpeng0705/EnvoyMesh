import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:dart_libp2p/core/crypto/ed25519.dart' as crypto_ed25519;
import 'package:dart_libp2p/core/crypto/keys.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/context.dart';
import 'package:dart_libp2p/core/network/stream.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/network/transport_conn.dart';
import 'package:dart_libp2p/core/network/common.dart';
import 'package:dart_libp2p/core/peerstore.dart';
import 'package:dart_libp2p/core/network/rcmgr.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/peer/addr_info.dart';
import 'package:dart_libp2p/core/network/network.dart';
import 'package:dart_libp2p/core/network/notifiee.dart';
import 'package:dart_libp2p/core/network/mux.dart' as core_mux_types;
import 'package:dart_libp2p/p2p/network/swarm/swarm.dart';
import 'package:dart_libp2p/p2p/transport/basic_upgrader.dart';
import 'package:dart_libp2p/p2p/transport/udx_transport.dart';
import 'package:dart_libp2p/p2p/security/noise/noise_protocol.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/yamux/session.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/multiplexer.dart';
import 'package:dart_libp2p/p2p/host/resource_manager/resource_manager_impl.dart';
import 'package:dart_libp2p/p2p/host/resource_manager/limiter.dart';
import 'package:dart_libp2p/p2p/transport/connection_manager.dart';
import 'package:dart_libp2p/p2p/host/peerstore/pstoremem.dart';
import 'package:dart_libp2p/config/config.dart';
import 'package:dart_libp2p/config/stream_muxer.dart';
import 'package:dart_libp2p/p2p/multiaddr/protocol.dart' as multiaddr_protocol;
import 'package:dart_udx/dart_udx.dart';
import 'package:test/test.dart';
import 'package:logging/logging.dart';

// Custom AddrsFactory for testing that doesn't filter loopback
List<MultiAddr> passThroughAddrsFactory(List<MultiAddr> addrs) {
  return addrs;
}

// Helper class for providing YamuxMuxer to the config
class _TestYamuxMuxerProvider extends StreamMuxer {
  final MultiplexerConfig yamuxConfig;

  _TestYamuxMuxerProvider({required this.yamuxConfig})
      : super(
    id: '/yamux/1.0.0', // Matches YamuxSession.protocolId
    muxerFactory: (Conn secureConn, bool isClient) {
      if (secureConn is! TransportConn) {
        throw ArgumentError(
            'YamuxMuxer factory expects a TransportConn, got ${secureConn.runtimeType}');
      }
      return YamuxSession(secureConn, yamuxConfig, isClient);
    },
  );
}

// Helper Notifiee for tests
class TestNotifiee implements Notifiee {
  final Function(Network, Conn)? connectedCallback;
  final Function(Network, Conn)? disconnectedCallback;
  final Function(Network, MultiAddr)? listenCallback;
  final Function(Network, MultiAddr)? listenCloseCallback;

  TestNotifiee({
    this.connectedCallback,
    this.disconnectedCallback,
    this.listenCallback,
    this.listenCloseCallback,
  });

  @override
  Future<void> connected(Network network, Conn conn, {Duration? dialLatency}) async {
    connectedCallback?.call(network, conn);
  }

  @override
  Future<void> disconnected(Network network, Conn conn) async {
    disconnectedCallback?.call(network, conn);
  }

  @override
  void listen(Network network, MultiAddr addr) {
    listenCallback?.call(network, addr);
  }

  @override
  void listenClose(Network network, MultiAddr addr) {
    listenCloseCallback?.call(network, addr);
  }
}

void main() {
  // Set up logging for tests
  Logger.root.level = Level.ALL;
  Logger.root.onRecord.listen((record) {
    print('${record.level.name}: ${record.time}: ${record.message}');
  });

  group('YamuxStream Connection Re-use via UDX Transport', () {
    late UDX udxInstance;
    late ResourceManagerImpl resourceManager;
    late ConnectionManager connManager;

    setUpAll(() async {
      udxInstance = UDX();
      resourceManager = ResourceManagerImpl(limiter: FixedLimiter());
      connManager = ConnectionManager();
    });

    tearDownAll(() async {
      await connManager.dispose();
      await resourceManager.close();
    });

    test('swarm streams reuse yamux connections correctly with UDX transport', () async {
      print('\n=== Starting YamuxStream Connection Re-use Test with UDX Transport ===');
      print('Test timeout: 60 seconds');
      
      // Phase 1: Create two Swarms with UDX transport
      print('Phase 1: Creating test swarms with UDX transport...');
      final swarmA = await createUDXTestSwarm(
        name: 'SwarmA', 
        udxInstance: udxInstance,
        resourceManager: resourceManager,
        connManager: connManager,
      );
      final swarmB = await createUDXTestSwarm(
        name: 'SwarmB', 
        udxInstance: udxInstance,
        resourceManager: resourceManager,
        connManager: connManager,
      );
      
      try {
        // Phase 2: Setup listening and peer discovery
        print('Phase 2: Setting up listening and peer discovery...');
        
        final listenAddr = MultiAddr('/ip4/127.0.0.1/udp/0/udx');
        await swarmA.listen([listenAddr]);
        print('SwarmA listening on: ${swarmA.listenAddresses}');
        
        // Get the actual listening address
        final actualListenAddr = swarmA.listenAddresses.firstWhere(
          (addr) => addr.hasProtocol(multiaddr_protocol.Protocols.udx.name)
        );
        print('SwarmA actual listen address: $actualListenAddr');
        
        // Add swarmA's address to swarmB's peerstore for dialing
        await swarmB.peerstore.addrBook.addAddrs(
          swarmA.localPeer, 
          [actualListenAddr], 
          AddressTTL.permanentAddrTTL
        );
        swarmB.peerstore.keyBook.addPubKey(
          swarmA.localPeer, 
          (await swarmA.peerstore.keyBook.pubKey(swarmA.localPeer))!
        );
        print('Added SwarmA address and public key to SwarmB peerstore');
        
        // Phase 3: Create multiple streams from swarmB to swarmA
        print('Phase 3: Creating multiple streams...');
        final streams = <P2PStream>[];
        final testData = <String>[];
        
        for (int i = 0; i < 3; i++) {
          print('Creating stream $i...');
          final stream = await swarmB.newStream(Context(), swarmA.localPeer);
          streams.add(stream);
          
          // Send unique data on each stream
          final data = 'stream-$i-data-${DateTime.now().millisecondsSinceEpoch}';
          testData.add(data);
          await stream.write(utf8.encode(data));
          print('Stream $i created with ID: ${stream.id()}, sent: $data');
        }
        
        // Phase 4: Verify connection sharing
        print('Phase 4: Verifying connection sharing...');
        final connections = swarmB.connsToPeer(swarmA.localPeer);
        expect(connections.length, equals(1), 
               reason: 'All streams should share one connection');
        
        final sharedConn = connections.first;
        print('✓ All streams share connection ID: ${sharedConn.id}');
        print('✓ Connection remote peer: ${sharedConn.remotePeer}');
        print('✓ Connection is closed: ${sharedConn.isClosed}');
        
        // Phase 5: Close some streams and pause
        print('Phase 5: Closing streams and pausing...');
        await streams[0].close();
        await streams[1].close();
        print('Closed streams 0 and 1');
        
        // Verify connection is still alive after closing streams
        expect(sharedConn.isClosed, isFalse, 
               reason: 'Connection should remain alive after stream closure');
        print('✓ Connection remains alive after closing streams');
        
        // Pause to test connection persistence
        print('Pausing for 3 seconds to test connection persistence...');
        // await Future.delayed(Duration(seconds: 3));
        
        // Phase 6: Verify connection is still alive after pause
        print('Phase 6: Verifying connection persistence...');
        expect(sharedConn.isClosed, isFalse, 
               reason: 'Connection should remain alive after pause');
        final connectionsAfterPause = swarmB.connsToPeer(swarmA.localPeer);
        expect(connectionsAfterPause.length, equals(1), 
               reason: 'Should still have one connection after pause');
        expect(connectionsAfterPause.first.id, equals(sharedConn.id), 
               reason: 'Should be the same connection after pause');
        print('✓ Connection persisted through pause');
        
        // Phase 7: Create new streams (should reuse existing connection)
        print('Phase 7: Creating new streams to test re-use...');
        final newStreams = <P2PStream>[];
        final newTestData = <String>[];
        
        for (int i = 0; i < 2; i++) {
          print('Creating new stream $i...');
          final newStream = await swarmB.newStream(Context(), swarmA.localPeer);
          newStreams.add(newStream);
          
          // Send data to verify the reused connection works
          final data = 'reused-stream-$i-data-${DateTime.now().millisecondsSinceEpoch}';
          newTestData.add(data);
          await newStream.write(utf8.encode(data));
          print('New stream $i created with ID: ${newStream.id()}, sent: $data');
        }
        
        // Phase 8: Verify connection reuse
        print('Phase 8: Verifying connection reuse...');
        final connectionsAfter = swarmB.connsToPeer(swarmA.localPeer);
        expect(connectionsAfter.length, equals(1), 
               reason: 'Should still have only one connection');
        expect(connectionsAfter.first.id, equals(sharedConn.id), 
               reason: 'Should reuse the same connection');
        
        print('✓ Successfully reused connection ${sharedConn.id}');
        print('✓ New streams created on existing connection');
        
        // Phase 9: Verify stream isolation and data integrity
        print('Phase 9: Verifying stream isolation...');
        
        // Check that remaining original stream is still functional
        final remainingStream = streams[2];
        expect(remainingStream.isClosed, isFalse, 
               reason: 'Remaining original stream should still be open');
        
        // Send additional data on remaining stream
        final additionalData = 'additional-data-${DateTime.now().millisecondsSinceEpoch}';
        await remainingStream.write(utf8.encode(additionalData));
        print('✓ Remaining original stream still functional');
        
        // Verify all new streams are functional
        for (int i = 0; i < newStreams.length; i++) {
          final stream = newStreams[i];
          expect(stream.isClosed, isFalse, 
                 reason: 'New stream $i should be open');
          
          // Send verification data
          final verifyData = 'verify-$i-${DateTime.now().millisecondsSinceEpoch}';
          await stream.write(utf8.encode(verifyData));
          print('✓ New stream $i is functional');
        }
        
        // Phase 10: Final connection state verification
        print('Phase 10: Final verification...');
        final finalConnections = swarmB.connsToPeer(swarmA.localPeer);
        expect(finalConnections.length, equals(1), 
               reason: 'Should end with exactly one connection');
        expect(finalConnections.first.id, equals(sharedConn.id), 
               reason: 'Should be the original connection throughout');
        expect(finalConnections.first.isClosed, isFalse, 
               reason: 'Final connection should be healthy');
        
        print('✓ Connection reuse test completed successfully!');
        print('✓ Original connection ID: ${sharedConn.id}');
        print('✓ Total streams created: ${streams.length + newStreams.length}');
        print('✓ Streams closed: 2');
        print('✓ Streams remaining: ${streams.length + newStreams.length - 2}');
        print('✓ Connections used throughout test: 1');
        
      } finally {
        // Cleanup
        print('Cleaning up test resources...');
        await swarmA.close();
        // await swarmB.close();
        print('Test cleanup completed');
      }
    }, timeout: Timeout(Duration(seconds: 60)));

    test('connection reuse under rapid stream cycling with UDX', () async {
      print('\n=== Starting Rapid Stream Cycling Test with UDX ===');
      
      final swarmA = await createUDXTestSwarm(
        name: 'CycleSwarmA', 
        udxInstance: udxInstance,
        resourceManager: resourceManager,
        connManager: connManager,
      );
      final swarmB = await createUDXTestSwarm(
        name: 'CycleSwarmB', 
        udxInstance: udxInstance,
        resourceManager: resourceManager,
        connManager: connManager,
      );
      
      try {
        final listenAddr = MultiAddr('/ip4/127.0.0.1/udp/0/udx');
        await swarmA.listen([listenAddr]);
        
        final actualListenAddr = swarmA.listenAddresses.firstWhere(
          (addr) => addr.hasProtocol(multiaddr_protocol.Protocols.udx.name)
        );
        
        await swarmB.peerstore.addrBook.addAddrs(
          swarmA.localPeer, 
          [actualListenAddr], 
          AddressTTL.permanentAddrTTL
        );
        swarmB.peerstore.keyBook.addPubKey(
          swarmA.localPeer, 
          (await swarmA.peerstore.keyBook.pubKey(swarmA.localPeer))!
        );
        
        // Rapid cycling test
        print('Starting rapid stream cycling...');
        String? connectionId;
        
        for (int cycle = 0; cycle < 5; cycle++) {
          print('Cycle $cycle: Creating streams...');
          final cycleStreams = <P2PStream>[];
          
          // Create multiple streams
          for (int i = 0; i < 3; i++) {
            final stream = await swarmB.newStream(Context(), swarmA.localPeer);
            cycleStreams.add(stream);
            await stream.write(utf8.encode('cycle-$cycle-stream-$i'));
          }
          
          // Brief pause to let streams establish
          // await Future.delayed(Duration(milliseconds: 100));
          
          // Verify connection consistency
          final connections = swarmB.connsToPeer(swarmA.localPeer);
          expect(connections.length, equals(1));
          
          if (connectionId == null) {
            connectionId = connections.first.id;
            print('Established connection ID: $connectionId');
          } else {
            expect(connections.first.id, equals(connectionId),
                   reason: 'Should reuse same connection across cycles');
          }
          
          // Close all streams in this cycle
          for (final stream in cycleStreams) {
            await stream.close();
          }
          
          // Brief pause between cycles
          // await Future.delayed(Duration(milliseconds: 50));
          print('Cycle $cycle completed');
        }
        
        print('✓ Rapid cycling test completed successfully!');
        print('✓ Same connection used across all cycles: $connectionId');
        
      } finally {
        await swarmA.close();
        await swarmB.close();
      }
    });

    test('connection health during mixed stream states with UDX', () async {
      print('\n=== Starting Mixed Stream States Test with UDX ===');
      final testStart = DateTime.now();
      
      print('[${DateTime.now().difference(testStart).inMilliseconds}ms] Creating swarmA...');
      final swarmA = await createUDXTestSwarm(
        name: 'MixedSwarmA', 
        udxInstance: udxInstance,
        resourceManager: resourceManager,
        connManager: connManager,
      );
      print('[${DateTime.now().difference(testStart).inMilliseconds}ms] SwarmA created');
      
      print('[${DateTime.now().difference(testStart).inMilliseconds}ms] Creating swarmB...');
      final swarmB = await createUDXTestSwarm(
        name: 'MixedSwarmB', 
        udxInstance: udxInstance,
        resourceManager: resourceManager,
        connManager: connManager,
      );
      print('[${DateTime.now().difference(testStart).inMilliseconds}ms] SwarmB created');
      
      try {
        print('[${DateTime.now().difference(testStart).inMilliseconds}ms] Setting up listener...');
        final listenAddr = MultiAddr('/ip4/127.0.0.1/udp/0/udx');
        await swarmA.listen([listenAddr]);
        print('[${DateTime.now().difference(testStart).inMilliseconds}ms] Listener ready');
        
        final actualListenAddr = swarmA.listenAddresses.firstWhere(
          (addr) => addr.hasProtocol(multiaddr_protocol.Protocols.udx.name)
        );
        
        await swarmB.peerstore.addrBook.addAddrs(
          swarmA.localPeer, 
          [actualListenAddr], 
          AddressTTL.permanentAddrTTL
        );
        swarmB.peerstore.keyBook.addPubKey(
          swarmA.localPeer, 
          (await swarmA.peerstore.keyBook.pubKey(swarmA.localPeer))!
        );
        
        // Create streams with mixed lifecycle management
        print('[${DateTime.now().difference(testStart).inMilliseconds}ms] Creating 5 streams with mixed states...');
        final streams = <P2PStream>[];
        
        for (int i = 0; i < 5; i++) {
          print('[${DateTime.now().difference(testStart).inMilliseconds}ms] Creating stream $i...');
          final stream = await swarmB.newStream(Context(), swarmA.localPeer);
          print('[${DateTime.now().difference(testStart).inMilliseconds}ms] Stream $i created, writing data...');
          streams.add(stream);
          await stream.write(utf8.encode('mixed-state-stream-$i'));
          print('[${DateTime.now().difference(testStart).inMilliseconds}ms] Stream $i write complete');
        }
        
        final connections = swarmB.connsToPeer(swarmA.localPeer);
        expect(connections.length, equals(1));
        final connectionId = connections.first.id;
        print('[${DateTime.now().difference(testStart).inMilliseconds}ms] All streams using connection: $connectionId');
        
        // Close some streams, keep others open
        print('[${DateTime.now().difference(testStart).inMilliseconds}ms] Closing streams 0 and 2...');
        await streams[0].close();  // Closed
        await streams[2].close();  // Closed
        // streams[1], streams[3], streams[4] remain open
        
        print('[${DateTime.now().difference(testStart).inMilliseconds}ms] Closed streams 0 and 2, keeping 1, 3, 4 open');
        
        // Verify connection is still healthy
        expect(connections.first.isClosed, isFalse);
        print('[${DateTime.now().difference(testStart).inMilliseconds}ms] Connection still healthy');
        
        // Create new streams while others are still open
        print('[${DateTime.now().difference(testStart).inMilliseconds}ms] Creating newStream1...');
        final newStream1 = await swarmB.newStream(Context(), swarmA.localPeer);
        print('[${DateTime.now().difference(testStart).inMilliseconds}ms] Creating newStream2...');
        final newStream2 = await swarmB.newStream(Context(), swarmA.localPeer);
        
        print('[${DateTime.now().difference(testStart).inMilliseconds}ms] Writing to new streams...');
        await newStream1.write(utf8.encode('new-stream-1'));
        await newStream2.write(utf8.encode('new-stream-2'));
        print('[${DateTime.now().difference(testStart).inMilliseconds}ms] New stream writes complete');
        
        // Verify still using same connection
        final connectionsAfter = swarmB.connsToPeer(swarmA.localPeer);
        expect(connectionsAfter.length, equals(1));
        expect(connectionsAfter.first.id, equals(connectionId));
        
        print('[${DateTime.now().difference(testStart).inMilliseconds}ms] ✓ Mixed stream states test completed successfully!');
        print('✓ Connection remained healthy with mixed stream states');
        print('✓ New streams successfully created alongside existing ones');
        
      } finally {
        print('[${DateTime.now().difference(testStart).inMilliseconds}ms] FINALLY BLOCK: Starting cleanup...');
        await swarmA.close();
        print('[${DateTime.now().difference(testStart).inMilliseconds}ms] FINALLY BLOCK: swarmA closed');
        await swarmB.close();
        print('[${DateTime.now().difference(testStart).inMilliseconds}ms] FINALLY BLOCK: swarmB closed');
      }
    }, timeout: Timeout(Duration(seconds: 60)));

    test('bidirectional data exchange with connection reuse', () async {
      print('\n=== Starting Bidirectional Data Exchange Test ===');
      
      final swarmA = await createUDXTestSwarm(
        name: 'EchoServer', 
        udxInstance: udxInstance,
        resourceManager: resourceManager,
        connManager: connManager,
      );
      final swarmB = await createUDXTestSwarm(
        name: 'EchoClient', 
        udxInstance: udxInstance,
        resourceManager: resourceManager,
        connManager: connManager,
      );
      
      try {
        // Setup listening
        final listenAddr = MultiAddr('/ip4/127.0.0.1/udp/0/udx');
        await swarmA.listen([listenAddr]);
        
        final actualListenAddr = swarmA.listenAddresses.firstWhere(
          (addr) => addr.hasProtocol(multiaddr_protocol.Protocols.udx.name)
        );
        
        // Setup peer discovery
        await swarmB.peerstore.addrBook.addAddrs(
          swarmA.localPeer, 
          [actualListenAddr], 
          AddressTTL.permanentAddrTTL
        );
        swarmB.peerstore.keyBook.addPubKey(
          swarmA.localPeer, 
          (await swarmA.peerstore.keyBook.pubKey(swarmA.localPeer))!
        );
        
        // Setup connection notifiee to handle incoming connections
        Completer<Conn> serverConnCompleter = Completer();
        final serverNotifiee = TestNotifiee(
          connectedCallback: (network, conn) {
            if (conn.remotePeer.toString() == swarmB.localPeer.toString() &&
                !serverConnCompleter.isCompleted) {
              print('Server received connection from client ${conn.remotePeer}');
              serverConnCompleter.complete(conn);
            }
          }
        );
        swarmA.notify(serverNotifiee);
        
        // Phase 1: Establish connection
        print('Phase 1: Establishing connection...');
        final clientConn = await swarmB.dialPeer(Context(), swarmA.localPeer);
        print('Client connected to server. Connection ID: ${clientConn.id}');
        
        final serverConn = await serverConnCompleter.future.timeout(
          Duration(seconds: 10),
          onTimeout: () => throw TimeoutException('Server did not receive connection in time')
        );
        print('Server received connection. Connection ID: ${serverConn.id}');
        
        // Verify connection reuse
        final connections = swarmB.connsToPeer(swarmA.localPeer);
        expect(connections.length, equals(1));
        final sharedConnectionId = connections.first.id;
        print('✓ Connection established: $sharedConnectionId');
        
        // Phase 2: Start independent background echo server
        print('Phase 2: Starting background echo server...');
        final serverCancellation = Completer<void>();
        final serverTask = _runBackgroundEchoServer(
          serverConn: serverConn,
          cancellation: serverCancellation,
        );
        
        // Phase 3: Test independent client streams
        print('Phase 3: Testing independent client streams...');
        final clientTests = <Future<void>>[];
        
        // Sequential tests first
        for (int i = 0; i < 3; i++) {
          clientTests.add(_performIndependentEchoTest(
            clientConn: clientConn,
            testId: i,
            expectedConnectionId: sharedConnectionId,
            swarmB: swarmB,
            swarmA: swarmA,
          ));
        }
        
        // Wait for sequential tests
        await Future.wait(clientTests);
        print('✓ Sequential echo tests completed');
        
        // Phase 4: Test concurrent streams
        print('Phase 4: Testing concurrent independent streams...');
        final concurrentTests = <Future<void>>[];
        
        for (int i = 0; i < 5; i++) {
          concurrentTests.add(_performIndependentEchoTest(
            clientConn: clientConn,
            testId: i + 100, // Offset to distinguish from sequential
            expectedConnectionId: sharedConnectionId,
            swarmB: swarmB,
            swarmA: swarmA,
          ));
        }
        
        // Wait for concurrent tests
        await Future.wait(concurrentTests);
        print('✓ Concurrent echo tests completed');
        
        // Phase 5: Verify connection reuse throughout
        print('Phase 5: Verifying connection reuse after all tests...');
        final finalConnections = swarmB.connsToPeer(swarmA.localPeer);
        expect(finalConnections.length, equals(1));
        expect(finalConnections.first.id, equals(sharedConnectionId));
        print('✓ Connection reuse maintained throughout all tests');
        
        // Stop background server
        serverCancellation.complete();
        await serverTask;
        print('✓ Background echo server stopped');
        
        print('✓ Bidirectional data exchange test completed successfully!');
        print('✓ All streams used the same connection: $sharedConnectionId');
        print('✓ Data integrity verified across all independent echo tests');
        
        // Cleanup notifiee
        swarmA.stopNotify(serverNotifiee);
        
      } finally {
        await swarmA.close();
        await swarmB.close();
      }
    });

    test('large data transfer with connection reuse', () async {
      print('\n=== Starting Large Data Transfer Test ===');
      
      final swarmA = await createUDXTestSwarm(
        name: 'DataServer', 
        udxInstance: udxInstance,
        resourceManager: resourceManager,
        connManager: connManager,
      );
      final swarmB = await createUDXTestSwarm(
        name: 'DataClient', 
        udxInstance: udxInstance,
        resourceManager: resourceManager,
        connManager: connManager,
      );
      
      try {
        // Setup
        final listenAddr = MultiAddr('/ip4/127.0.0.1/udp/0/udx');
        await swarmA.listen([listenAddr]);
        
        final actualListenAddr = swarmA.listenAddresses.firstWhere(
          (addr) => addr.hasProtocol(multiaddr_protocol.Protocols.udx.name)
        );
        
        await swarmB.peerstore.addrBook.addAddrs(
          swarmA.localPeer, 
          [actualListenAddr], 
          AddressTTL.permanentAddrTTL
        );
        swarmB.peerstore.keyBook.addPubKey(
          swarmA.localPeer, 
          (await swarmA.peerstore.keyBook.pubKey(swarmA.localPeer))!
        );
        
        // Setup connection handling
        Completer<Conn> serverConnCompleter = Completer();
        final serverNotifiee = TestNotifiee(
          connectedCallback: (network, conn) {
            if (conn.remotePeer.toString() == swarmB.localPeer.toString() &&
                !serverConnCompleter.isCompleted) {
              serverConnCompleter.complete(conn);
            }
          }
        );
        swarmA.notify(serverNotifiee);
        
        // Establish connection
        final clientConn = await swarmB.dialPeer(Context(), swarmA.localPeer);
        final serverConn = await serverConnCompleter.future.timeout(Duration(seconds: 10));
        
        final connectionId = swarmB.connsToPeer(swarmA.localPeer).first.id;
        print('Connection established: $connectionId');
        
        // Test large data transfers
        final random = Random();
        final testSizes = [1024, 8192, 32768, 65536]; // Various sizes up to 64KB
        
        for (final size in testSizes) {
          print('Testing ${size} byte transfer...');
          
          // Generate random data
          final testData = Uint8List.fromList(
            List.generate(size, (_) => random.nextInt(256))
          );
          
          // Setup server echo handler (large-data aware: reads until EOF)
          late P2PStream serverStream;
          final serverAcceptFuture = ((serverConn as dynamic).conn as core_mux_types.MuxedConn)
              .acceptStream()
              .then((stream) {
            serverStream = stream as P2PStream;
            return _handleEchoStreamLarge(serverStream);
          });

          // Client sends data then signals EOF so server knows when to echo
          final clientStream = await ((clientConn as dynamic).conn as core_mux_types.MuxedConn)
              .openStream(Context()) as P2PStream;

          await clientStream.write(testData);
          await clientStream.closeWrite();
          print('Client sent ${testData.length} bytes');

          // Wait for server to handle the stream
          await serverAcceptFuture.timeout(Duration(seconds: 30));

          // Read echo response - accumulate chunks since Yamux fragments large writes
          final receivedData = await _readAll(clientStream, timeout: Duration(seconds: 15));
          print('Client received ${receivedData.length} bytes');
          
          // Verify data integrity
          expect(receivedData, orderedEquals(testData));
          print('✓ Data integrity verified for ${size} bytes');
          
          // Verify connection reuse
          final connections = swarmB.connsToPeer(swarmA.localPeer);
          expect(connections.length, equals(1));
          expect(connections.first.id, equals(connectionId));
          
          // Cleanup streams
          await clientStream.close();
          await serverStream.close();
        }
        
        print('✓ Large data transfer test completed successfully!');
        print('✓ All transfers used the same connection: $connectionId');
        
        swarmA.stopNotify(serverNotifiee);
        
      } finally {
        await swarmA.close();
        await swarmB.close();
      }
    });
  });
}

/// Performs an echo test with bidirectional communication
Future<void> _performEchoTest({
  required Conn clientConn,
  required Conn serverConn,
  required int testId,
  required String expectedConnectionId,
  required Swarm swarmB,
  required Swarm swarmA,
}) async {
  print('Starting echo test $testId...');
  
  // Setup server stream acceptance
  late P2PStream serverStream;
  final serverAcceptFuture = ((serverConn as dynamic).conn as core_mux_types.MuxedConn)
      .acceptStream()
      .then((stream) {
    serverStream = stream as P2PStream;
    print('Server accepted stream ${serverStream.id()} for test $testId');
    return _handleEchoStream(serverStream);
  });
  
  // Client opens stream and sends data
  final clientStream = await ((clientConn as dynamic).conn as core_mux_types.MuxedConn)
      .openStream(Context()) as P2PStream;
  
  final testData = 'echo-test-$testId-${DateTime.now().millisecondsSinceEpoch}';
  final dataBytes = utf8.encode(testData);
  
  await clientStream.write(dataBytes);
  print('Client sent data for test $testId: $testData');
  
  // Wait for server to handle the echo
  await serverAcceptFuture.timeout(Duration(seconds: 5));
  
  // Read the echo response
  final receivedData = await clientStream.read().timeout(Duration(seconds: 5));
  final receivedText = utf8.decode(receivedData);
  
  print('Client received echo for test $testId: $receivedText');
  
  // Verify data integrity
  expect(receivedText, equals(testData));
  
  // Verify connection reuse
  final connections = swarmB.connsToPeer(swarmA.localPeer);
  expect(connections.length, equals(1));
  expect(connections.first.id, equals(expectedConnectionId));
  
  // Cleanup
  await clientStream.close();
  await serverStream.close();
  
  print('✓ Echo test $testId completed successfully');
}

/// Performs a concurrent echo test
Future<void> _performConcurrentEchoTest({
  required Conn clientConn,
  required Conn serverConn,
  required int testId,
  required String expectedConnectionId,
  required Swarm swarmB,
  required Swarm swarmA,
}) async {
  // Add some randomness to test concurrent behavior
  await Future.delayed(Duration(milliseconds: Random().nextInt(100)));
  
  await _performEchoTest(
    clientConn: clientConn,
    serverConn: serverConn,
    testId: testId + 100, // Offset to distinguish from sequential tests
    expectedConnectionId: expectedConnectionId,
    swarmB: swarmB,
    swarmA: swarmA,
  );
}

/// Runs a background echo server that continuously accepts and handles streams
Future<void> _runBackgroundEchoServer({
  required Conn serverConn,
  required Completer<void> cancellation,
}) async {
  print('Background echo server started');
  
  try {
    while (!cancellation.isCompleted) {
      try {
        // Accept incoming stream with timeout
        final stream = await ((serverConn as dynamic).conn as core_mux_types.MuxedConn)
            .acceptStream()
            .timeout(Duration(milliseconds: 500)) as P2PStream;
        
        print('Background server accepted stream ${stream.id()}');
        
        // Handle the stream independently (don't await to allow concurrent handling)
        _handleEchoStreamIndependently(stream).catchError((error) {
          print('Error handling stream ${stream.id()}: $error');
        });
        
      } on TimeoutException {
        // Timeout is expected when no streams are incoming - continue loop
        continue;
      } catch (e) {
        if (!cancellation.isCompleted) {
          print('Background server error accepting stream: $e');
          // Brief pause before retrying
          await Future.delayed(Duration(milliseconds: 100));
        }
      }
    }
  } catch (e) {
    print('Background echo server error: $e');
  }
  
  print('Background echo server stopped');
}

/// Handles echo functionality for a stream independently
Future<void> _handleEchoStreamIndependently(P2PStream stream) async {
  try {
    print('Handling stream ${stream.id()} independently');
    final data = await stream.read().timeout(Duration(seconds: 10));
    print('Server echoing ${data.length} bytes on stream ${stream.id()}');
    await stream.write(data);
    print('Echo completed for stream ${stream.id()}');
  } catch (e) {
    print('Error in independent echo handler for stream ${stream.id()}: $e');
  } finally {
    try {
      await stream.close();
    } catch (e) {
      print('Error closing stream ${stream.id()}: $e');
    }
  }
}

/// Performs an independent echo test (client-side only)
Future<void> _performIndependentEchoTest({
  required Conn clientConn,
  required int testId,
  required String expectedConnectionId,
  required Swarm swarmB,
  required Swarm swarmA,
}) async {
  print('Starting independent echo test $testId...');
  
  try {
    // Client opens stream and sends data
    final clientStream = await ((clientConn as dynamic).conn as core_mux_types.MuxedConn)
        .openStream(Context()) as P2PStream;
    
    final testData = 'independent-echo-test-$testId-${DateTime.now().millisecondsSinceEpoch}';
    final dataBytes = utf8.encode(testData);
    
    print('Client sending data for test $testId: $testData');
    await clientStream.write(dataBytes);
    
    // Read the echo response
    final receivedData = await clientStream.read().timeout(Duration(seconds: 10));
    final receivedText = utf8.decode(receivedData);
    
    print('Client received echo for test $testId: $receivedText');
    
    // Verify data integrity
    expect(receivedText, equals(testData));
    
    // Verify connection reuse
    final connections = swarmB.connsToPeer(swarmA.localPeer);
    expect(connections.length, equals(1));
    expect(connections.first.id, equals(expectedConnectionId));
    
    // Cleanup
    await clientStream.close();
    
    print('✓ Independent echo test $testId completed successfully');
    
  } catch (e) {
    print('Error in independent echo test $testId: $e');
    rethrow;
  }
}

/// Handles echo functionality for a stream (single read, for small payloads)
Future<void> _handleEchoStream(P2PStream stream) async {
  try {
    final data = await stream.read().timeout(Duration(seconds: 5));
    print('Server echoing ${data.length} bytes on stream ${stream.id()}');
    await stream.write(data);
  } catch (e) {
    print('Error in echo handler for stream ${stream.id()}: $e');
    rethrow;
  }
}

/// Reads all data from a stream until EOF (empty read), accumulating chunks.
Future<Uint8List> _readAll(P2PStream stream, {Duration timeout = const Duration(seconds: 15)}) async {
  final buffer = <int>[];
  while (true) {
    final chunk = await stream.read().timeout(timeout);
    if (chunk.isEmpty) break; // EOF
    buffer.addAll(chunk);
  }
  return Uint8List.fromList(buffer);
}

/// Handles echo for large data: reads until EOF then echoes all received data.
Future<void> _handleEchoStreamLarge(P2PStream stream) async {
  try {
    final data = await _readAll(stream, timeout: Duration(seconds: 15));
    print('Server echoing ${data.length} bytes on stream ${stream.id()}');
    await stream.write(data);
    await stream.closeWrite();
  } catch (e) {
    print('Error in large echo handler for stream ${stream.id()}: $e');
    rethrow;
  }
}

/// Creates a test swarm with UDX transport and real Yamux multiplexer
Future<Swarm> createUDXTestSwarm({
  required String name,
  required UDX udxInstance,
  required ResourceManagerImpl resourceManager,
  required ConnectionManager connManager,
}) async {
  print('Creating UDX test swarm: $name');
  
  // Generate test peer identity
  final keyPair = await crypto_ed25519.generateEd25519KeyPair();
  final peerId = PeerId.fromPublicKey(keyPair.publicKey);
  print('$name PeerId: ${peerId.toString()}');
  
  // Create real peerstore
  final peerstore = MemoryPeerstore();
  
  // Add own key to peerstore
  peerstore.keyBook.addPrivKey(peerId, keyPair.privateKey);
  peerstore.keyBook.addPubKey(peerId, keyPair.publicKey);
  
  // Create Yamux multiplexer config
  final yamuxMultiplexerConfig = MultiplexerConfig(
    keepAliveInterval: Duration(seconds: 30),
    maxStreamWindowSize: 1024 * 1024,
    initialStreamWindowSize: 256 * 1024,
    streamWriteTimeout: Duration(seconds: 10),
    maxStreams: 256,
  );
  
  // Create config with real protocols
  final config = Config();
  config.peerKey = keyPair;
  config.addrsFactory = passThroughAddrsFactory;
  
  // Add real Noise security protocol
  config.securityProtocols = [await NoiseSecurity.create(keyPair)];
  
  // Add REAL Yamux muxer
  config.muxers = [
    _TestYamuxMuxerProvider(yamuxConfig: yamuxMultiplexerConfig)
  ];
  
  // Create UDX transport
  final udxTransport = UDXTransport(
    connManager: connManager,
    udxInstance: udxInstance,
  );
  
  // Create upgrader
  final upgrader = BasicUpgrader(resourceManager: resourceManager);
  
  // Create and return swarm
  final swarm = Swarm(
    host: null, // Direct swarm usage
    localPeer: peerId,
    peerstore: peerstore,
    resourceManager: resourceManager,
    upgrader: upgrader,
    config: config,
    transports: [udxTransport],
  );
  
  print('$name swarm created successfully with UDX transport');
  return swarm;
}
