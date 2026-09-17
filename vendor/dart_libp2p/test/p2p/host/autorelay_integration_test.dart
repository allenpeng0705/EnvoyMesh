import 'dart:async';
import 'dart:typed_data';

import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/peer/addr_info.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/host/host.dart';
import 'package:dart_libp2p/core/network/network.dart'; // For Reachability
import 'package:dart_libp2p/core/network/context.dart' as core_context;
import 'package:dart_libp2p/core/network/stream.dart' as core_stream;
import 'package:dart_libp2p/p2p/host/autorelay/autorelay.dart'; // For EvtAutoRelayAddrsUpdated
import 'package:dart_libp2p/p2p/host/autonat/ambient_config.dart'; // For AmbientAutoNATv2Config
import 'package:dart_libp2p/p2p/protocol/ping/ping.dart';
import 'package:dart_libp2p/p2p/multiaddr/protocol.dart'; // For Protocols
import 'package:dart_libp2p/core/network/rcmgr.dart';
import 'package:dart_libp2p/p2p/transport/connection_manager.dart' as p2p_conn_mgr;
import 'package:dart_libp2p/p2p/host/eventbus/basic.dart' as p2p_event_bus;
import 'package:dart_udx/dart_udx.dart';
import 'package:logging/logging.dart';
import 'package:test/test.dart';

import '../../real_net_stack.dart';

void main() {
  Logger.root.level = Level.FINE; // Enable more detailed logging
  Logger.root.onRecord.listen((record) {
    // Show logs from AutoRelay, RelayFinder, BasicHost, RelayManager, AutoNAT
    if (record.loggerName.contains('AutoRelay') ||
        record.loggerName.contains('RelayFinder') ||
        record.loggerName.contains('BasicHost') ||
        record.loggerName.contains('RelayManager') ||
        record.loggerName.contains('ambient_autonat_v2') ||
        record.loggerName.contains('identify') ||
        record.loggerName.contains('autonatv2'))
    {
      print('${record.level.name}: ${record.time}: ${record.loggerName}: ${record.message}');
    }
  });

  group('AutoRelay Integration', () {
    late Libp2pNode relayNode;
    late Libp2pNode peerANode;
    late Libp2pNode peerBNode;
    late Host relayHost;
    late Host peerAHost;
    late Host peerBHost;
    late PeerId relayPeerId;
    late PeerId peerAPeerId;
    late PeerId peerBPeerId;
    late UDX udx;
    StreamSubscription? autoRelaySubA;
    StreamSubscription? autoRelaySubB;

    setUp(() async {
      udx = UDX();
      final resourceManager = NullResourceManager();
      final connManager = p2p_conn_mgr.ConnectionManager();

      print('\n=== Setting up test nodes ===');

      // Create relay server with forced public reachability
      print('Creating relay server...');
      final relayEventBus = p2p_event_bus.BasicBus();
      relayNode = await createLibp2pNode(
        udxInstance: udx,
        resourceManager: resourceManager,
        connManager: connManager,
        hostEventBus: relayEventBus,
        enableRelay: true,
        enablePing: true,
        userAgentPrefix: 'relay-server',
        forceReachability: Reachability.public, // Force public to start relay service
      );
      relayHost = relayNode.host;
      relayPeerId = relayNode.peerId;
      print('Relay server created: ${relayPeerId.toBase58()}');
      print('Relay addresses: ${relayHost.addrs}');
      
      await Future.delayed(Duration(milliseconds: 500)); // Give it time to start
      print('Relay service should now be active (via forceReachability)');

      // Build relay server addresses for auto-connect configuration
      // Filter to get only direct (non-circuit) addresses
      final relayDirectAddrs = relayHost.addrs
          .where((addr) => !addr.toString().contains('/p2p-circuit'))
          .toList();
      
      // Construct full relay addresses with peer ID
      final relayServerAddrs = relayDirectAddrs.map((addr) {
        return '${addr.toString()}/p2p/${relayPeerId.toBase58()}';
      }).toList();
      
      print('Relay server addresses for auto-connect: $relayServerAddrs');

      // Create peer A with its own event bus, fast AutoNAT config, and relay auto-connect
      print('\nCreating peer A...');
      final peerAEventBus = p2p_event_bus.BasicBus();
      final autoNATConfig = AmbientAutoNATv2Config(
        bootDelay: Duration(milliseconds: 500), // Fast boot for testing
        retryInterval: Duration(seconds: 1),
        refreshInterval: Duration(seconds: 5),
      );
      peerANode = await createLibp2pNode(
        udxInstance: udx,
        resourceManager: resourceManager,
        connManager: connManager,
        hostEventBus: peerAEventBus,
        enableAutoRelay: true,
        enablePing: true,
        userAgentPrefix: 'peer-a',
        ambientAutoNATConfig: autoNATConfig,
        relayServers: relayServerAddrs, // Auto-connect to relay servers
      );
      peerAHost = peerANode.host;
      peerAPeerId = peerANode.peerId;
      print('Peer A created: ${peerAPeerId.toBase58()}');
      print('Peer A addresses: ${peerAHost.addrs}');
      print('✅ Peer A configured to auto-connect to ${relayServerAddrs.length} relay servers');

      // Create peer B with its own event bus, fast AutoNAT config, and relay auto-connect
      print('\nCreating peer B...');
      final peerBEventBus = p2p_event_bus.BasicBus();
      peerBNode = await createLibp2pNode(
        udxInstance: udx,
        resourceManager: resourceManager,
        connManager: connManager,
        hostEventBus: peerBEventBus,
        enableAutoRelay: true,
        enablePing: true,
        userAgentPrefix: 'peer-b',
        ambientAutoNATConfig: autoNATConfig, // Use same config as peer A
        relayServers: relayServerAddrs, // Auto-connect to relay servers
      );
      peerBHost = peerBNode.host;
      peerBPeerId = peerBNode.peerId;
      print('Peer B created: ${peerBPeerId.toBase58()}');
      print('Peer B addresses: ${peerBHost.addrs}');
      print('✅ Peer B configured to auto-connect to ${relayServerAddrs.length} relay servers');

      print('\n=== Test: Circuit Relay Advertisement and Ping ===');

      // Subscribe to AutoRelay events for debugging - use each peer's own event bus
      final autoRelaySubASub = peerAHost.eventBus.subscribe(EvtAutoRelayAddrsUpdated);
      autoRelaySubA = autoRelaySubASub.stream.listen((event) {
        if (event is EvtAutoRelayAddrsUpdated) {
          print('🔄 Peer A AutoRelay addresses updated (${event.advertisableAddrs.length}):');
          for (var addr in event.advertisableAddrs) {
            print('   - $addr');
            print('     Is circuit: ${addr.toString().contains('/p2p-circuit')}');
          }
        }
      });

      final autoRelaySubBSub = peerBHost.eventBus.subscribe(EvtAutoRelayAddrsUpdated);
      autoRelaySubB = autoRelaySubBSub.stream.listen((event) {
        if (event is EvtAutoRelayAddrsUpdated) {
          print('🔄 Peer B AutoRelay addresses updated (${event.advertisableAddrs.length}):');
          for (var addr in event.advertisableAddrs) {
            print('   - $addr');
            print('     Is circuit: ${addr.toString().contains('/p2p-circuit')}');
          }
        }
      });
    });

    tearDown(() async {
      print('\n=== Tearing down test nodes ===');
      await autoRelaySubA?.cancel();
      await autoRelaySubB?.cancel();
      
      print('Closing hosts...');
      // await peerAHost.close();
      // await peerBHost.close();
      // await relayHost.close();
      // print('Hosts closed');

      // Give connections a moment to finish closing, but don't wait too long
      await Future.delayed(Duration(milliseconds: 500));
      print('✅ Teardown complete');
    });

    test('Peers advertise circuit relay addresses and can ping through relay', () async {
      // Step 1: Verify auto-connection to relay server
      // NOTE: Peers should already be connected to relay via Config.relayServers during host.start()
      print('\n📡 Step 1: Verifying auto-connection to relay server...');
      
      // Verify connections established automatically
      expect(peerAHost.network.connectedness(relayPeerId).name, equals('connected'));
      expect(peerBHost.network.connectedness(relayPeerId).name, equals('connected'));
      print('✅ Both peers automatically connected to relay server via Config.relayServers');
      
      // Step 1b: AutoNAT will automatically detect reachability after connections are established
      // No manual event emission needed - AmbientAutoNATv2 handles this automatically
      print('\n🔧 Waiting for AutoNAT to detect reachability and trigger AutoRelay...');
      // Give AutoNAT time to probe and determine reachability
      // bootDelay=500ms + probe time + AutoRelay processing
      await Future.delayed(Duration(seconds: 2));
      print('✅ AutoNAT should have detected reachability by now');
      
      // Debug: Check what protocols the relay server advertises
      print('\n🔍 Debug: Checking relay server protocols...');
      final relayProtocols = await peerAHost.peerStore.protoBook.getProtocols(relayPeerId);
      print('Relay server protocols: $relayProtocols');
      final hasCircuitV2 = relayProtocols.any((p) => p.contains('circuit') || p.contains('libp2p/circuit'));
      print('Has circuit relay protocol: $hasCircuitV2');
      
      // Debug: Check connected peers from Peer A's perspective
      print('\n🔍 Debug: Checking Peer A\'s connected peers...');
      final peerAConnectedPeers = peerAHost.network.peers;
      print('Peer A connected peers: ${peerAConnectedPeers.length}');
      for (final peerId in peerAConnectedPeers) {
        print('  - ${peerId.toBase58()}');
      }

      // Step 2: Wait for AutoRelay to discover relay and reserve slot
      print('\n⏳ Step 2: Waiting for AutoRelay to discover relay (bootDelay=5s + processing)...');
      await Future.delayed(Duration(seconds: 12));
      
      // Step 3: Verify peers advertise circuit addresses
      print('\n🔍 Step 3: Verifying circuit relay addresses...');
      final peerAAddrs = peerAHost.addrs;
      final peerBAddrs = peerBHost.addrs;
      
      print('Peer A addresses: $peerAAddrs');
      print('Peer B addresses: $peerBAddrs');
      
      // Check for circuit addresses containing relay peer ID
      final peerACircuitAddrs = peerAAddrs.where((addr) {
        final addrStr = addr.toString();
        return addrStr.contains('/p2p-circuit') && addrStr.contains(relayPeerId.toBase58());
      }).toList();
      
      final peerBBaseCircuitAddrs = peerBAddrs.where((addr) {
        final addrStr = addr.toString();
        return addrStr.contains('/p2p-circuit') && addrStr.contains(relayPeerId.toBase58());
      }).toList();
      
      print('Peer A circuit addresses: $peerACircuitAddrs');
      print('Peer B base circuit addresses: $peerBBaseCircuitAddrs');
      
      expect(peerACircuitAddrs, isNotEmpty, 
        reason: 'Peer A should advertise at least one circuit relay address through relay ${relayPeerId.toBase58()}');
      expect(peerBBaseCircuitAddrs, isNotEmpty,
        reason: 'Peer B should advertise at least one circuit relay address through relay ${relayPeerId.toBase58()}');
      
      print('✅ Both peers advertise circuit relay addresses');

      // Step 3.5: Verify relay server's peerstore was updated via Identify Push
      print('\n🔍 Step 3.5: Verifying relay server\'s peerstore has peers\' circuit addresses...');
      
      // Check relay's peerstore for peer A's addresses
      final relayKnownPeerAAddrs = await relayHost.peerStore.addrBook.addrs(peerAPeerId);
      print('Relay server knows ${relayKnownPeerAAddrs.length} addresses for Peer A:');
      for (var addr in relayKnownPeerAAddrs) {
        print('   - $addr');
      }
      
      // Check relay's peerstore for peer B's addresses
      final relayKnownPeerBAddrs = await relayHost.peerStore.addrBook.addrs(peerBPeerId);
      print('Relay server knows ${relayKnownPeerBAddrs.length} addresses for Peer B:');
      for (var addr in relayKnownPeerBAddrs) {
        print('   - $addr');
      }
      
      // Filter for circuit addresses
      final relayKnownPeerACircuitAddrs = relayKnownPeerAAddrs.where((addr) {
        return addr.toString().contains('/p2p-circuit');
      }).toList();
      
      final relayKnownPeerBCircuitAddrs = relayKnownPeerBAddrs.where((addr) {
        return addr.toString().contains('/p2p-circuit');
      }).toList();
      
      print('Relay knows ${relayKnownPeerACircuitAddrs.length} circuit addresses for Peer A');
      print('Relay knows ${relayKnownPeerBCircuitAddrs.length} circuit addresses for Peer B');
      
      // Verify relay server received circuit addresses via Identify Push
      expect(relayKnownPeerACircuitAddrs, isNotEmpty,
        reason: 'Relay server should have received Peer A\'s circuit addresses via Identify Push');
      expect(relayKnownPeerBCircuitAddrs, isNotEmpty,
        reason: 'Relay server should have received Peer B\'s circuit addresses via Identify Push');
      
      print('✅ Relay server\'s peerstore correctly updated with both peers\' circuit addresses');

      // Step 4: Construct full dialable circuit addresses for peer B
      // AutoRelay advertises: /ip4/X.X.X.X/udp/PORT/udx/p2p/RELAY_ID/p2p-circuit
      // We need to dial:      /ip4/X.X.X.X/udp/PORT/udx/p2p/RELAY_ID/p2p-circuit/p2p/DEST_PEER_ID
      print('\n📋 Step 4: Constructing dialable circuit addresses for peer B...');
      final peerBDialableCircuitAddrs = peerBBaseCircuitAddrs.map((addr) {
        // Append destination peer ID to make it dialable
        return addr.encapsulate(Protocols.p2p.name, peerBPeerId.toString());
      }).toList();
      
      print('Peer B dialable circuit addresses: $peerBDialableCircuitAddrs');
      
      // Debug: Check what addresses peer A already knows about peer B (if any)
      // NOTE: Peer A and Peer B have NOT connected to each other yet, only to the relay server.
      // Identify runs when peers connect, so peer A shouldn't know peer B's addresses yet
      // unless there's automatic discovery through the relay.
      print('\n🔍 Debug: Checking peer A\'s peerstore for peer B BEFORE manual add...');
      final existingPeerBAddrs = await peerAHost.peerStore.addrBook.addrs(peerBPeerId);
      print('Existing addresses for peer B in peer A\'s peerstore: ${existingPeerBAddrs.length}');
      if (existingPeerBAddrs.isEmpty) {
        print('   → Empty (as expected - peers haven\'t connected to each other yet)');
      } else {
        for (var addr in existingPeerBAddrs) {
          print('   - $addr');
          final hasCircuit = addr.toString().contains('/p2p-circuit');
          print('     Is circuit: $hasCircuit');
        }
      }
      
      // Add ONLY dialable circuit addresses to peer A's peerstore
      // This forces peer A to dial peer B via circuit relay
      await peerAHost.peerStore.addrBook.clearAddrs(peerBPeerId);
      await peerAHost.peerStore.addrBook.addAddrs(
        peerBPeerId,
        peerBDialableCircuitAddrs,  // Full circuit addresses with destination peer ID
        Duration(hours: 1),
      );
      print('✅ Peer B dialable circuit addresses added to peer A peerstore (${peerBDialableCircuitAddrs.length} addresses)');

      // Verify peerstore was properly updated with circuit addresses
      print('\n🔍 Verifying peerstore contains circuit addresses...');
      final storedAddrs = await peerAHost.peerStore.addrBook.addrs(peerBPeerId);
      print('Stored addresses for peer B in peer A\'s peerstore: ${storedAddrs.length}');
      for (var addr in storedAddrs) {
        print('   - $addr');
      }
      
      final storedCircuitAddrs = storedAddrs.where((addr) {
        final addrStr = addr.toString();
        return addrStr.contains('/p2p-circuit') && 
               addrStr.contains(relayPeerId.toBase58()) &&
               addrStr.contains(peerBPeerId.toBase58());
      }).toList();
      
      expect(storedCircuitAddrs.length, equals(peerBDialableCircuitAddrs.length),
        reason: 'Peerstore should contain exactly ${peerBDialableCircuitAddrs.length} circuit addresses');
      expect(storedCircuitAddrs, isNotEmpty,
        reason: 'Peerstore must contain circuit relay addresses for peer B');
      
      print('✅ Peerstore verified: ${storedCircuitAddrs.length} circuit addresses stored correctly');

      // Step 5: Ping peer B from peer A via circuit relay
      print('\n🏓 Step 5: Pinging peer B from peer A via circuit relay...');
      final pingService = PingService(peerAHost);
      
      try {
        final pingResult = await pingService.ping(peerBPeerId).first.timeout(
          Duration(seconds: 15),
          onTimeout: () {
            throw TimeoutException('Ping timed out after 15 seconds');
          },
        );
        
        print('Ping result: error=${pingResult.hasError}, rtt=${pingResult.rtt?.inMilliseconds}ms');
        
        expect(pingResult.hasError, isFalse,
          reason: 'Ping should succeed through circuit relay');
        expect(pingResult.rtt, isNotNull,
          reason: 'Ping should return a valid RTT');
        
        print('✅ Ping succeeded! RTT: ${pingResult.rtt?.inMilliseconds}ms');
        
        // Verify the connection is using circuit relay
        final conns = peerAHost.network.connsToPeer(peerBPeerId);
        expect(conns, isNotEmpty, 
          reason: 'Should have at least one connection to peer B');
        
        final connAddr = conns.first.remoteMultiaddr.toString();
        print('Connection address: $connAddr');
        
        expect(connAddr.contains('/p2p-circuit'), isTrue,
          reason: 'Connection MUST be using circuit relay (address should contain /p2p-circuit). '
                  'Got: $connAddr');
        print('✅ Verified: Connection is using circuit relay');
      } catch (e, stackTrace) {
        print('❌ Ping failed: $e');
        print('Stack trace: $stackTrace');
        rethrow;
      }
      
      print('\n✅ Test completed successfully!');
    }, timeout: Timeout(Duration(seconds: 30))); // Increased timeout for teardown

    test('Circuit relay connections are reused by Swarm for multiple dials', () async {
      // This test verifies that when dialing the same peer multiple times through
      // a relay, the Swarm reuses the existing connection rather than creating
      // new relay connections each time.
      
      print('\n🔄 Testing circuit relay connection reuse at Swarm level...');
      
      // Step 1: Verify both peers are connected to relay
      expect(peerAHost.network.connectedness(relayPeerId).name, equals('connected'));
      expect(peerBHost.network.connectedness(relayPeerId).name, equals('connected'));
      print('✅ Both peers connected to relay');
      
      // Step 2: Wait for AutoRelay to properly set up circuit addresses
      print('\n⏳ Waiting for AutoRelay to discover relay and advertise circuit addresses...');
      await Future.delayed(Duration(seconds: 12)); // Same as other test - needs time for AutoRelay
      
      // Step 3: Get peer B's circuit addresses (must include relay peer ID)
      final peerBAddrs = peerBHost.addrs;
      final peerBCircuitAddrs = peerBAddrs.where((addr) {
        final addrStr = addr.toString();
        return addrStr.contains('/p2p-circuit') && addrStr.contains(relayPeerId.toBase58());
      }).toList();
      
      print('Peer B addresses: $peerBAddrs');
      print('Peer B circuit addresses: $peerBCircuitAddrs');
      
      expect(peerBCircuitAddrs, isNotEmpty,
        reason: 'Peer B should advertise circuit relay addresses through relay ${relayPeerId.toBase58()}');
      
      // Step 4: Construct dialable circuit address to peer B
      final peerBCircuitAddr = peerBCircuitAddrs.first;
      final cleanAddr = peerBCircuitAddr.toString().endsWith('/') 
        ? peerBCircuitAddr.toString().substring(0, peerBCircuitAddr.toString().length - 1)
        : peerBCircuitAddr.toString();
      final dialableCircuitAddrStr = '$cleanAddr/p2p/${peerBPeerId.toBase58()}';
      final dialableCircuitAddr = MultiAddr(dialableCircuitAddrStr);
      
      print('Dialable circuit address to peer B: $dialableCircuitAddrStr');
      
      // Add the circuit address to peerstore so connect() can find it
      await peerAHost.peerStore.addrBook.addAddrs(
        peerBPeerId,
        [dialableCircuitAddr],
        Duration(hours: 1),
      );
      
      // Step 5: First dial to peer B through relay
      print('\n🔌 Dial #1: Creating initial relay connection...');
      await peerAHost.connect(AddrInfo(peerBPeerId, [dialableCircuitAddr]));
      
      // Get the initial connection
      final conns1 = peerAHost.network.connsToPeer(peerBPeerId);
      expect(conns1, isNotEmpty, reason: 'Should have connection after first dial');
      expect(conns1.length, equals(1), 
        reason: 'Should have exactly one connection after first dial');
      
      final conn1 = conns1.first;
      final conn1Addr = conn1.remoteMultiaddr.toString();
      expect(conn1Addr.contains('/p2p-circuit'), isTrue,
        reason: 'First connection should be via circuit relay');
      
      print('✅ First connection established: $conn1Addr');
      print('   Connection ID: ${conn1.id}');
      
      // Step 6: Second dial to the same peer (should reuse connection)
      print('\n🔌 Dial #2: Attempting to dial same peer again...');
      await peerAHost.connect(AddrInfo(peerBPeerId, [dialableCircuitAddr]));
      
      // Get connections again
      final conns2 = peerAHost.network.connsToPeer(peerBPeerId);
      expect(conns2.length, equals(1),
        reason: 'Should STILL have exactly one connection (reused, not duplicated)');
      
      final conn2 = conns2.first;
      print('✅ Second dial completed');
      print('   Connection ID: ${conn2.id}');
      
      // Verify it's the same connection
      expect(identical(conn1, conn2), isTrue,
        reason: 'Swarm MUST reuse the same connection instance for multiple dials to same peer');
      
      print('✅ Verified: Swarm reuses the same circuit relay connection');
      
      // Step 7: Third dial via ping service (another way to trigger dial)
      print('\n🏓 Dial #3: Pinging peer (triggers dial internally)...');
      final pingService = PingService(peerAHost);
      final pingResult = await pingService.ping(peerBPeerId).first.timeout(
        Duration(seconds: 10),
      );
      
      expect(pingResult.hasError, isFalse, reason: 'Ping should succeed');
      print('✅ Ping succeeded: RTT=${pingResult.rtt?.inMilliseconds}ms');
      
      // Verify still only one connection
      final conns3 = peerAHost.network.connsToPeer(peerBPeerId);
      expect(conns3.length, equals(1),
        reason: 'Should STILL have exactly one connection after ping');
      expect(identical(conns1.first, conns3.first), isTrue,
        reason: 'Should be the same connection instance');
      
      print('✅ Verified: Ping reused existing connection (no new connection created)');
      
      // Step 8: CRITICAL - Test bidirectional reuse (B dials back to A)
      print('\n🔄 Step 8: Testing BIDIRECTIONAL reuse - Peer B dials back to Peer A...');
      
      // Get Peer A's circuit addresses
      final peerAAddrs = peerAHost.addrs;
      final peerACircuitAddrs = peerAAddrs.where((addr) {
        final addrStr = addr.toString();
        return addrStr.contains('/p2p-circuit') && addrStr.contains(relayPeerId.toBase58());
      }).toList();
      
      print('Peer A addresses: $peerAAddrs');
      print('Peer A circuit addresses: $peerACircuitAddrs');
      
      expect(peerACircuitAddrs, isNotEmpty,
        reason: 'Peer A should also advertise circuit relay addresses');
      
      // Construct dialable circuit address to Peer A
      final peerACircuitAddr = peerACircuitAddrs.first;
      final cleanAddrA = peerACircuitAddr.toString().endsWith('/')
        ? peerACircuitAddr.toString().substring(0, peerACircuitAddr.toString().length - 1)
        : peerACircuitAddr.toString();
      final dialableCircuitAddrToA = '$cleanAddrA/p2p/${peerAPeerId.toBase58()}';
      
      print('Dialable circuit address to peer A: $dialableCircuitAddrToA');
      
      // Add to Peer B's peerstore
      await peerBHost.peerStore.addrBook.addAddrs(
        peerAPeerId,
        [MultiAddr(dialableCircuitAddrToA)],
        Duration(hours: 1),
      );
      
      // Get connection count BEFORE B dials A
      final connsFromABefore = peerAHost.network.connsToPeer(peerBPeerId);
      final connsFromBBefore = peerBHost.network.connsToPeer(peerAPeerId);
      
      print('Before B→A dial:');
      print('  Peer A sees ${connsFromABefore.length} connection(s) to B');
      print('  Peer B sees ${connsFromBBefore.length} connection(s) to A');
      
      // Now Peer B dials Peer A (REVERSE direction)
      print('\n🔌 Dial #4 (REVERSE): Peer B → Peer A...');
      await peerBHost.connect(AddrInfo(peerAPeerId, [MultiAddr(dialableCircuitAddrToA)]));
      
      // Get connection counts AFTER B dials A
      final connsFromAAfter = peerAHost.network.connsToPeer(peerBPeerId);
      final connsFromBAfter = peerBHost.network.connsToPeer(peerAPeerId);
      
      print('\nAfter B→A dial:');
      print('  Peer A sees ${connsFromAAfter.length} connection(s) to B');
      print('  Peer B sees ${connsFromBAfter.length} connection(s) to A');
      
      // CRITICAL ASSERTIONS: Verify bidirectional reuse
      expect(connsFromAAfter.length, equals(1),
        reason: 'Peer A should STILL have only 1 connection to B after B dials A back (bidirectional reuse)');
      
      expect(connsFromBAfter.length, equals(1),
        reason: 'Peer B should have exactly 1 connection to A (reused existing connection, not created new one)');
      
      // Verify it's still the same connection from A's perspective
      expect(identical(connsFromABefore.first, connsFromAAfter.first), isTrue,
        reason: 'Peer A should still have the SAME connection instance after B dials back');
      
      print('✅ CRITICAL: Verified bidirectional connection reuse!');
      print('   ✓ A→B established 1 connection');
      print('   ✓ B→A reused that SAME connection (not created new one)');
      print('   ✓ Total connections: 1 (not 2)');
      
      // Step 9: Verify bidirectional communication works
      print('\n🏓 Step 9: Testing bidirectional communication (B pings A)...');
      final pingServiceB = PingService(peerBHost);
      final pingResultBA = await pingServiceB.ping(peerAPeerId).first.timeout(
        Duration(seconds: 10),
      );
      
      expect(pingResultBA.hasError, isFalse, 
        reason: 'Ping from B to A should succeed using reused connection');
      print('✅ B→A Ping succeeded: RTT=${pingResultBA.rtt?.inMilliseconds}ms');
      
      // Final verification: Still only 1 connection each direction
      final finalConnsA = peerAHost.network.connsToPeer(peerBPeerId);
      final finalConnsB = peerBHost.network.connsToPeer(peerAPeerId);
      
      expect(finalConnsA.length, equals(1),
        reason: 'After all operations, should STILL have only 1 connection');
      expect(finalConnsB.length, equals(1),
        reason: 'After all operations, should STILL have only 1 connection');
      
      print('\n🎉 Circuit relay BIDIRECTIONAL connection reuse test completed successfully!');
      print('   ✓ Multiple dials from same peer reuse connection (A→B→A→B)');
      print('   ✓ Reverse dial reuses connection (A→B, then B→A)');
      print('   ✓ Bidirectional communication works (A pings B, B pings A)');
      print('   ✓ No duplicate connections created');
      print('   ✓ Connection reuse works at Swarm level (not transport level)');
    }, timeout: Timeout(Duration(seconds: 60))); // Increased timeout for bidirectional test

    test('Bidirectional data transfer through circuit relay', () async {
      // This test verifies that actual application data (not just ping) can flow
      // bidirectionally through a circuit relay on a single stream:
      //   1. A opens stream to B through relay
      //   2. A sends data to B (verified)
      //   3. B sends response back to A on the same stream (verified)

      print('\n=== Bidirectional Data Transfer Through Circuit Relay ===');

      // Step 1: Wait for AutoRelay to set up circuit addresses
      expect(peerAHost.network.connectedness(relayPeerId).name, equals('connected'));
      expect(peerBHost.network.connectedness(relayPeerId).name, equals('connected'));
      print('Both peers connected to relay');

      print('Waiting for AutoRelay to discover relay and advertise circuit addresses...');
      await Future.delayed(Duration(seconds: 12));

      // Step 2: Get peer B's circuit addresses and add to peer A's peerstore
      final peerBAddrs = peerBHost.addrs;
      final peerBCircuitAddrs = peerBAddrs.where((addr) {
        final addrStr = addr.toString();
        return addrStr.contains('/p2p-circuit') && addrStr.contains(relayPeerId.toBase58());
      }).toList();

      expect(peerBCircuitAddrs, isNotEmpty,
          reason: 'Peer B should advertise circuit relay addresses');
      print('Peer B circuit addresses: $peerBCircuitAddrs');

      // Construct dialable circuit addresses with destination peer ID
      final peerBDialableAddrs = peerBCircuitAddrs.map((addr) {
        return addr.encapsulate(Protocols.p2p.name, peerBPeerId.toString());
      }).toList();

      await peerAHost.peerStore.addrBook.clearAddrs(peerBPeerId);
      await peerAHost.peerStore.addrBook.addAddrs(
        peerBPeerId,
        peerBDialableAddrs,
        Duration(hours: 1),
      );

      // Step 3: Register bidirectional protocol on peer B
      const protocolId = '/test/relay-bidir/1.0.0';
      final serverStreamCompleter = Completer<core_stream.P2PStream>();

      peerBHost.setStreamHandler(protocolId, (core_stream.P2PStream stream, PeerId remotePeer) async {
        print('[B] Received stream from ${remotePeer.toBase58()}');
        if (!serverStreamCompleter.isCompleted) {
          serverStreamCompleter.complete(stream);
        }
      });

      // Step 4: Peer A connects and opens stream to peer B through relay
      print('Peer A connecting to peer B through relay...');
      await peerAHost.connect(AddrInfo(peerBPeerId, peerBDialableAddrs));

      // Verify circuit relay is being used
      final conns = peerAHost.network.connsToPeer(peerBPeerId);
      expect(conns, isNotEmpty, reason: 'Should have connection to peer B');
      final connAddr = conns.first.remoteMultiaddr.toString();
      expect(connAddr.contains('/p2p-circuit'), isTrue,
          reason: 'Connection must use circuit relay, got: $connAddr');
      print('Connected via circuit relay: $connAddr');

      print('Peer A opening stream...');
      final clientStream = await peerAHost.newStream(
        peerBPeerId,
        [protocolId],
        core_context.Context(),
      ).timeout(Duration(seconds: 10));
      print('[A] Stream opened: ${clientStream.id()}');

      final serverStream = await serverStreamCompleter.future.timeout(
        Duration(seconds: 10),
        onTimeout: () => throw TimeoutException('Peer B did not receive stream'),
      );
      print('[B] Stream accepted: ${serverStream.id()}');

      // Step 5: A sends data to B
      final aToBData = Uint8List.fromList(List.generate(100, (i) => i + 1));
      print('[A] Sending ${aToBData.length} bytes to B...');
      await clientStream.write(aToBData);
      await clientStream.closeWrite();
      print('[A] Data sent, write side closed');

      // Step 6: B reads data from A
      print('[B] Reading data from A...');
      final receivedFromA = <int>[];
      while (true) {
        final chunk = await serverStream.read().timeout(Duration(seconds: 10));
        if (chunk.isEmpty) break;
        receivedFromA.addAll(chunk);
      }
      print('[B] Received ${receivedFromA.length} bytes from A');

      expect(Uint8List.fromList(receivedFromA), equals(aToBData),
          reason: 'B should receive exactly what A sent');
      print('A->B data verified');

      // Step 7: B sends response back to A on the same stream
      final bToAData = Uint8List.fromList(List.generate(100, (i) => 100 - i));
      print('[B] Sending ${bToAData.length} bytes back to A...');
      await serverStream.write(bToAData);
      await serverStream.closeWrite();
      print('[B] Response sent, write side closed');

      // Step 8: A reads response from B
      print('[A] Reading response from B...');
      final receivedFromB = <int>[];
      while (true) {
        final chunk = await clientStream.read().timeout(Duration(seconds: 10));
        if (chunk.isEmpty) break;
        receivedFromB.addAll(chunk);
      }
      print('[A] Received ${receivedFromB.length} bytes from B');

      expect(Uint8List.fromList(receivedFromB), equals(bToAData),
          reason: 'A should receive exactly what B sent back');
      print('B->A data verified');

      // Cleanup
      await clientStream.close();
      await serverStream.close();

      print('\nBidirectional data transfer through circuit relay: PASSED');
      print('  A->B: ${aToBData.length} bytes sent and verified');
      print('  B->A: ${bToAData.length} bytes sent and verified');
    }, timeout: Timeout(Duration(seconds: 60)));

    test('B can independently open new stream to A after A dialed B through relay (no direct addrs)', () async {
      // This replicates the real-world "latching" failure:
      //   1. A dials B through relay (works)
      //   2. B tries to ping/dial A independently (fails in practice)
      //
      // The root issue: in the real world, peers are behind NAT and can ONLY
      // reach each other through the relay. But in tests on localhost, B can
      // just dial A directly via UDX, masking the bug.
      //
      // To replicate: after A dials B through relay, we STRIP all direct
      // addresses for A from B's peerstore. B must use the existing relayed
      // connection — if B's Swarm doesn't track it, this test will fail.

      print('\n=== B->A Through Relay Only (No Direct Addresses) ===');

      // Step 1: Wait for AutoRelay setup
      expect(peerAHost.network.connectedness(relayPeerId).name, equals('connected'));
      expect(peerBHost.network.connectedness(relayPeerId).name, equals('connected'));
      print('Both peers connected to relay');

      print('Waiting for AutoRelay to advertise circuit addresses...');
      await Future.delayed(Duration(seconds: 12));

      // Step 2: Set up peer B's circuit addresses in A's peerstore (relay-only)
      final peerBAddrs = peerBHost.addrs;
      final peerBCircuitAddrs = peerBAddrs.where((addr) {
        final addrStr = addr.toString();
        return addrStr.contains('/p2p-circuit') && addrStr.contains(relayPeerId.toBase58());
      }).toList();

      expect(peerBCircuitAddrs, isNotEmpty,
          reason: 'Peer B should advertise circuit relay addresses');

      final peerBDialableAddrs = peerBCircuitAddrs.map((addr) {
        return addr.encapsulate(Protocols.p2p.name, peerBPeerId.toString());
      }).toList();

      await peerAHost.peerStore.addrBook.clearAddrs(peerBPeerId);
      await peerAHost.peerStore.addrBook.addAddrs(
        peerBPeerId,
        peerBDialableAddrs,
        Duration(hours: 1),
      );

      // Step 3: A dials B through relay
      print('[A] Connecting to B through relay...');
      await peerAHost.connect(AddrInfo(peerBPeerId, peerBDialableAddrs));

      final connsAtoB = peerAHost.network.connsToPeer(peerBPeerId);
      expect(connsAtoB, isNotEmpty, reason: 'A should have connection to B');
      expect(connsAtoB.first.remoteMultiaddr.toString().contains('/p2p-circuit'), isTrue,
          reason: 'Connection must use circuit relay');
      print('[A] Connected to B via relay: ${connsAtoB.first.remoteMultiaddr}');

      // Give Identify time to exchange info over the new relayed connection
      await Future.delayed(Duration(seconds: 2));

      // Step 4: CRITICAL - Strip ALL direct addresses for A from B's peerstore
      // This simulates NAT: B cannot reach A except through the relay.
      // Only keep the existing Swarm connection (if B's Swarm tracks it).
      print('\n--- Simulating NAT: removing all direct addresses for A from B ---');

      final bAddrsForA_before = await peerBHost.peerStore.addrBook.addrs(peerAPeerId);
      print('[B] Addresses for A BEFORE clearing: ${bAddrsForA_before.length}');
      for (final addr in bAddrsForA_before) {
        final isDirect = !addr.toString().contains('/p2p-circuit');
        print('  - $addr ${isDirect ? "(DIRECT - will be removed)" : "(CIRCUIT)"}');
      }

      // Clear ALL addresses — B must rely solely on the existing Swarm connection
      await peerBHost.peerStore.addrBook.clearAddrs(peerAPeerId);

      final bAddrsForA_after = await peerBHost.peerStore.addrBook.addrs(peerAPeerId);
      print('[B] Addresses for A AFTER clearing: ${bAddrsForA_after.length}');

      // Step 5: Diagnostic - check if B's Swarm sees the relayed connection
      print('\n--- Diagnostic: B\'s Swarm state for A ---');

      final connsBtoA = peerBHost.network.connsToPeer(peerAPeerId);
      print('[B] Swarm connections to A: ${connsBtoA.length}');
      for (final conn in connsBtoA) {
        print('  - id=${conn.id}, remote=${conn.remoteMultiaddr}, closed=${conn.isClosed}');
      }

      final bConnectedness = peerBHost.network.connectedness(peerAPeerId);
      print('[B] Connectedness to A: ${bConnectedness.name}');

      // Step 6: THE CRITICAL TEST - B independently tries to ping A
      // B has NO addresses for A in its peerstore.
      // B must find the existing relayed connection in its Swarm.
      // If the Swarm doesn't track inbound relayed connections, this FAILS.
      print('\n[B] Attempting to ping A (no direct addresses, must use existing relay conn)...');

      final pingServiceB = PingService(peerBHost);
      try {
        final pingResult = await pingServiceB.ping(peerAPeerId).first.timeout(
          Duration(seconds: 15),
          onTimeout: () {
            throw TimeoutException('B->A ping timed out after 15s');
          },
        );

        if (pingResult.hasError) {
          print('[B] Ping to A FAILED with error: ${pingResult.error}');
          fail('B should be able to ping A using the existing relayed connection. '
              'Error: ${pingResult.error}');
        }

        print('[B] Ping to A succeeded! RTT: ${pingResult.rtt?.inMilliseconds}ms');
      } catch (e) {
        print('\n[B] Ping to A FAILED: $e');

        // Extra diagnostics on failure
        print('\n--- Post-failure diagnostics ---');
        final postConnsB = peerBHost.network.connsToPeer(peerAPeerId);
        print('[B] Connections to A after failure: ${postConnsB.length}');
        for (final conn in postConnsB) {
          print('  - id=${conn.id}, remote=${conn.remoteMultiaddr}, closed=${conn.isClosed}');
        }
        final postConnsA = peerAHost.network.connsToPeer(peerBPeerId);
        print('[A] Connections to B after failure: ${postConnsA.length}');
        for (final conn in postConnsA) {
          print('  - id=${conn.id}, remote=${conn.remoteMultiaddr}, closed=${conn.isClosed}');
        }
        final postBConnectedness = peerBHost.network.connectedness(peerAPeerId);
        print('[B] Connectedness to A: ${postBConnectedness.name}');

        rethrow;
      }

      // Step 7: Also test B opening a custom stream to A
      print('\n[B] Opening custom stream to A (still no direct addresses)...');

      const echoProtocol = '/test/reverse-echo/1.0.0';
      final aStreamCompleter = Completer<core_stream.P2PStream>();

      peerAHost.setStreamHandler(echoProtocol, (core_stream.P2PStream stream, PeerId remotePeer) async {
        print('[A] Received stream from ${remotePeer.toBase58()} on reverse-echo protocol');
        if (!aStreamCompleter.isCompleted) {
          aStreamCompleter.complete(stream);
        }
      });

      final bStream = await peerBHost.newStream(
        peerAPeerId,
        [echoProtocol],
        core_context.Context(),
      ).timeout(
        Duration(seconds: 10),
        onTimeout: () => throw TimeoutException('B failed to open stream to A'),
      );
      print('[B] Stream opened to A: ${bStream.id()}');

      final aStream = await aStreamCompleter.future.timeout(
        Duration(seconds: 10),
        onTimeout: () => throw TimeoutException('A did not receive stream from B'),
      );
      print('[A] Stream accepted from B: ${aStream.id()}');

      // B sends data to A
      final bToAData = Uint8List.fromList(List.generate(50, (i) => i * 2));
      print('[B] Sending ${bToAData.length} bytes to A...');
      await bStream.write(bToAData);
      await bStream.closeWrite();

      // A reads data
      final receivedAtA = <int>[];
      while (true) {
        final chunk = await aStream.read().timeout(Duration(seconds: 10));
        if (chunk.isEmpty) break;
        receivedAtA.addAll(chunk);
      }
      print('[A] Received ${receivedAtA.length} bytes from B');

      expect(Uint8List.fromList(receivedAtA), equals(bToAData),
          reason: 'A should receive exactly what B sent');
      print('B->A data on new independent stream: verified');

      // Cleanup
      await bStream.close();
      await aStream.close();
      peerAHost.removeStreamHandler(echoProtocol);

      print('\nB independently opening streams to A (relay-only, no direct addrs): PASSED');
    }, timeout: Timeout(Duration(seconds: 60)));
  });
}
