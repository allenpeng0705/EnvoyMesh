// Copyright (c) 2024 The dart-libp2p Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

import 'dart:async';
import 'dart:io';

import 'package:dart_libp2p/p2p/host/basic/natmgr.dart';
import 'package:dart_libp2p/p2p/host/host.dart';
import 'package:dart_libp2p/p2p/network/swarm/swarm.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/p2p/transport/connection_manager.dart';
import 'package:dart_libp2p/p2p/transport/tcp_transport.dart';
import 'package:dart_libp2p/p2p/transport/transport.dart';
import 'package:dart_libp2p/p2p/transport/transport_config.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/rcmgr.dart';
import 'package:dart_libp2p/core/network/mux.dart' show Multiplexer, MuxedConn;
import 'package:test/test.dart';
import 'package:dart_libp2p/p2p/nat/nat_behavior.dart';
import 'package:dart_libp2p/p2p/nat/nat_traversal_strategy.dart';
import 'package:dart_libp2p/p2p/nat/stun/stun_client_pool.dart';
import 'package:dart_libp2p/p2p/nat/stun/stun_client.dart';
import 'package:dart_libp2p/p2p/nat/nat_type.dart';
import 'package:dart_libp2p/config/config.dart';
import 'package:dart_libp2p/p2p/transport/basic_upgrader.dart';
import 'package:dart_libp2p/core/crypto/ed25519.dart';
import '../../../mocks/mock_host.dart';

// Define NullMultiplexer stub for tests
class NullMultiplexer implements Multiplexer {
  @override
  Future<MuxedConn> newConn(Socket conn, bool isServer, PeerScope scope) async {
    throw UnimplementedError('NullMultiplexer.newConn not implemented');
  }
}

/// Mock StunClientPool that returns deterministic results without network calls.
class MockStunClientPool extends StunClientPool {
  int _nextPort = 40000;

  MockStunClientPool() : super(stunServers: const [(host: '127.0.0.1', port: 3478)]);

  @override
  Future<StunResponse> discover() async {
    return StunResponse(
      externalAddress: InternetAddress('203.0.113.1'),
      externalPort: _nextPort++,
      natType: NatType.fullCone,
    );
  }

  @override
  Future<NatBehavior> discoverNatBehavior() async {
    return NatBehavior(
      mappingBehavior: NatMappingBehavior.endpointIndependent,
      filteringBehavior: NatFilteringBehavior.endpointIndependent,
    );
  }
}

void main() {
  group('NAT Manager Integration Tests', () {
    late Swarm network;
    late NATManager natManager;
    late Transport testTransport;

    // Define NullMultiplexer here if not imported from a shared test utility
    // For simplicity, defining it directly in this file.
    // In a real project, this would be in a shared test mock/stub file.
    setUp(() async {
      testTransport = TCPTransport(
        config: const TransportConfig(
          dialTimeout: Duration(seconds: 5),
          readTimeout: Duration(days: 1),
          writeTimeout: Duration(days: 1),
        ),
        connManager: ConnectionManager(
          idleTimeout: const Duration(seconds: 1),
          shutdownTimeout: const Duration(seconds: 5),
        ),
        // multiplexer: nullMultiplexer, // This parameter was removed from TCPTransport
        resourceManager: NullResourceManager(),
      );

      var peerId = await PeerId.random();
      final keyPair = await generateEd25519KeyPair(); // For Config
      final testConfig = Config();
      testConfig.peerKey = keyPair;
      // NAT manager tests might not need full security/muxing, but BasicUpgrader needs a ResourceManager
      final testUpgrader = BasicUpgrader(resourceManager: NullResourceManager());

      // MockHost is needed because Swarm constructor now requires a Host.
      final mockHost = MockHost(); // Assuming MockHost exists or needs to be created

      network = Swarm(
        host: mockHost, // Added host parameter
        localPeer: peerId,
        peerstore: MemoryPeerstore(),
        resourceManager: NullResourceManager(),
        transports: [testTransport],
        upgrader: testUpgrader, // Added
        config: testConfig,      // Added
      );
      natManager = newNATManager(network, stunClientPool: MockStunClientPool());
    });

    tearDown(() async {
      await natManager.close();
    });

    test('NAT manager discovers NAT device', () async {
      // Wait for NAT discovery
      await Future.delayed(Duration(seconds: 2));
      expect(natManager.hasDiscoveredNAT(), isTrue);
    });

    test('NAT manager handles listen address changes', () async {
      // Wait for NAT discovery
      await Future.delayed(Duration(seconds: 2));
      
      // Add a listen address
      final addr = MultiAddr('/ip4/127.0.0.1/tcp/12345');
      network.listen([addr]);
      
      // Wait for mapping
      await Future.delayed(Duration(seconds: 1));
      
      // Get the mapping
      final mapping = natManager.getMapping(addr);
      expect(mapping, isNotNull);
      
      // Verify the mapping has the external address
      final parts = mapping.toString().split('/');
      expect(parts, contains('ip4'));
      expect(parts, contains('tcp'));
      
      // Remove the listen address
      network.removeListenAddress(addr);
      
      // Wait for unmapping
      await Future.delayed(Duration(seconds: 1));
      
      // Mapping should be gone
      expect(natManager.getMapping(addr), isNull);
    });

    test('NAT manager handles multiple listen addresses', () async {
      // Wait for NAT discovery
      await Future.delayed(Duration(seconds: 2));
      
      // Add multiple listen addresses (TCP only; see note below)
      final addr1 = MultiAddr('/ip4/127.0.0.1/tcp/12346');
      final addr2 = MultiAddr('/ip4/127.0.0.1/tcp/12347');
      // NOTE: UDP mapping is not tested here because the NAT manager cannot reliably
      // discover the external mapping for a UDP port unless it can use the actual
      // listening socket, which is not supported in this test setup.
      // final addr3 = Multiaddr('/ip4/127.0.0.1/udp/12348');
      
      network.listen([addr1, addr2]);

      // Wait for mappings
      await Future.delayed(Duration(seconds: 1));
      
      // Get the mappings
      final mapping1 = natManager.getMapping(addr1);
      final mapping2 = natManager.getMapping(addr2);
      // final mapping3 = natManager.getMapping(addr3);
      
      expect(mapping1, isNotNull);
      expect(mapping2, isNotNull);
      // expect(mapping3, isNotNull);
      
      // Verify the mappings have different ports
      final port1 = int.parse(mapping1.toString().split('/').last);
      final port2 = int.parse(mapping2.toString().split('/').last);
      // final port3 = int.parse(mapping3.toString().split('/').last);
      
      expect(port1, isNot(equals(port2)));
      // expect(port2, isNot(equals(port3)));
      // expect(port1, isNot(equals(port3)));
    });

    test('NAT manager handles close gracefully', () async {
      // Wait for NAT discovery
      await Future.delayed(Duration(seconds: 2));
      
      // Add a listen address
      final addr = MultiAddr('/ip4/127.0.0.1/tcp/12349');
      network.listen([addr]);
      
      // Wait for mapping
      await Future.delayed(Duration(seconds: 1));
      
      // Close the NAT manager
      await natManager.close();
      
      // Verify it's closed
      expect(natManager.hasDiscoveredNAT(), isTrue);
      expect(natManager.getMapping(addr), isNull);
    });

    test('NAT manager exposes current behavior and traversal strategy', () async {
      // Wait for NAT discovery
      await Future.delayed(Duration(seconds: 2));
      
      // Verify current behavior is not unknown
      expect(natManager.currentBehavior.mappingBehavior, isNot(equals(NatMappingBehavior.unknown)));
      
      // Verify traversal strategy is not unknown
      expect(natManager.traversalStrategy, isNot(equals(TraversalStrategy.unknown)));
    });

    test('NAT manager notifies on behavior changes', () async {
      // Register a callback for behavior changes BEFORE NAT discovery
      NatBehavior? oldBehavior;
      NatBehavior? newBehavior;
      natManager.addBehaviorChangeCallback((old, new_) {
        oldBehavior = old;
        newBehavior = new_;
      });

      // Wait for NAT discovery and callback
      await Future.delayed(Duration(seconds: 5));

      // Verify callback was called with valid behaviors
      expect(oldBehavior, isNotNull, reason: 'Old behavior should not be null');
      expect(newBehavior, isNotNull, reason: 'New behavior should not be null');
      expect(oldBehavior, isNot(equals(newBehavior)), reason: 'Behavior should have changed');
      // For the first discovery, oldBehavior.mappingBehavior may be unknown
      // but newBehavior.mappingBehavior should be known
      expect(newBehavior!.mappingBehavior, isNot(equals(NatMappingBehavior.unknown)), 
          reason: 'New mapping behavior should be known');
      expect(newBehavior!.filteringBehavior, isNot(equals(NatFilteringBehavior.unknown)), 
          reason: 'New filtering behavior should be known');
    });
  });
}
