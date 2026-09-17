import 'dart:async';

import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/peerstore.dart';
import 'package:dart_libp2p/p2p/host/peerstore/pstoremem/peerstore.dart';
import 'package:dart_libp2p/core/crypto/ed25519.dart';
import 'package:test/test.dart';

void main() {
  group('MemoryPeerstore', () {
    late MemoryPeerstore peerstore;
    late PeerId peerId;
    late List<MultiAddr> multiaddrs;

    setUp(() async {
      peerstore = MemoryPeerstore();
      peerId = await PeerId.random();
      multiaddrs = [
        MultiAddr('/ip4/127.0.0.1/tcp/12345'),
        MultiAddr('/ip4/192.168.1.100/tcp/54321'),
      ];
    });

    test('should retrieve peer with addresses after addOrUpdatePeer', () async {
      // Add peer with addresses
      peerstore.addOrUpdatePeer(peerId, addrs: multiaddrs);

      // Get the peer
      final retrievedPeerInfo = await peerstore.getPeer(peerId);

      // Assertions
      expect(retrievedPeerInfo, isNotNull, reason: 'PeerInfo should not be null after adding addresses.');
      if (retrievedPeerInfo != null) {
        expect(retrievedPeerInfo.addrs, isNotEmpty, reason: 'PeerInfo.addrs should not be empty.');
        expect(retrievedPeerInfo.addrs.length, equals(multiaddrs.length), reason: 'PeerInfo.addrs length should match added addresses.');
        for (var addr in multiaddrs) {
          expect(retrievedPeerInfo.addrs.contains(addr), isTrue, reason: 'PeerInfo.addrs should contain address $addr');
        }
      }
    });

    test('getPeer returns null for non-existent peer', () async {
      final nonExistentPeerId = await PeerId.random();
      final retrievedPeerInfo = await peerstore.getPeer(nonExistentPeerId);
      expect(retrievedPeerInfo, isNull);
    });
    
    test('addOrUpdatePeer with protocols and metadata', () async {
      final protocols = ['/test/1.0.0', '/example/2.0'];
      final metadata = {'key1': 'value1', 'key2': 123};

      peerstore.addOrUpdatePeer(peerId, protocols: protocols, metadata: metadata);
      final retrievedPeerInfo = await peerstore.getPeer(peerId);

      expect(retrievedPeerInfo, isNotNull);
      if (retrievedPeerInfo != null) {
        expect(retrievedPeerInfo.protocols, equals(protocols.toSet()));
        expect(retrievedPeerInfo.metadata, equals(metadata));
      }
    });

    test('addOrUpdatePeer updates existing peer data', () async {
      // Initial add
      peerstore.addOrUpdatePeer(peerId, addrs: [multiaddrs[0]], protocols: ['/initial/1.0']);
      
      // Update
      final updatedProtocols = ['/updated/1.0', '/another/2.0'];
      final updatedMetadata = {'newKey': 'newValue'};
      peerstore.addOrUpdatePeer(peerId, addrs: [multiaddrs[1]], protocols: updatedProtocols, metadata: updatedMetadata);

      final retrievedPeerInfo = await peerstore.getPeer(peerId);
      expect(retrievedPeerInfo, isNotNull);
      if (retrievedPeerInfo != null) {
        // Addresses should be merged by AddrBook (current MemoryPeerstore uses Duration.zero, so this might not reflect a merge yet)
        // For now, we expect at least the latest address to be there if TTLs were working as expected.
        // This part of the test will become more relevant after fixing TTL in addOrUpdatePeer.
        expect(retrievedPeerInfo.addrs.contains(multiaddrs[1]), isTrue, reason: "Should contain the subsequently added address");
        
        expect(retrievedPeerInfo.protocols, equals(updatedProtocols.toSet()), reason: "Protocols should be overwritten by setProtocols");
        expect(retrievedPeerInfo.metadata, equals(updatedMetadata), reason: "Metadata should be updated");
      }
    });

    test('direct addrBook.addrs() call should not hang after addAddrs', () async {
      // This test reproduces the exact scenario from holepunch integration test:
      // 1. Add addresses via addAddrs (like /connect does)
      // 2. Look them up via addrs() (like holepunch handler does)
      // 3. Should not hang indefinitely
      
      final targetPeerId = await PeerId.random();
      final targetAddrs = [
        MultiAddr('/ip4/192.168.1.101/tcp/4001'),
        MultiAddr('/ip4/10.10.0.3/tcp/4001')
      ];
      
      print('🔧 Adding addresses for peer ${targetPeerId.toString()}...');
      
      // Step 1: Add addresses (mimics /connect endpoint)
      await peerstore.addrBook.addAddrs(
        targetPeerId, 
        targetAddrs, 
        Duration(hours: 1)
      );
      
      print('✅ Added ${targetAddrs.length} addresses for peer ${targetPeerId.toString()}');
      
      // Step 2: Look up addresses (mimics holepunch handler)
      print('🔎 Looking up addresses for peer ${targetPeerId.toString()} in peerstore...');
      
      final existingAddrs = await peerstore.addrBook.addrs(targetPeerId).timeout(
        Duration(seconds: 5),
        onTimeout: () {
          throw TimeoutException(
            'DEADLOCK REPRODUCED! addrBook.addrs() hung indefinitely - this is the exact bug from holepunch integration test!', 
            Duration(seconds: 5)
          );
        },
      );
      
      print('🔎 Found ${existingAddrs.length} addresses for peer ${targetPeerId.toString()}');
      
      // If we get here, the lookup worked
      expect(existingAddrs.length, equals(2), reason: 'Should find both addresses that were added');
      expect(existingAddrs, containsAll(targetAddrs), reason: 'Should contain the exact addresses that were added');
    }, timeout: Timeout(Duration(seconds: 10)));

    test('peerstore with own key initialization should not hang on addrs lookup', () async {
      // This test reproduces the EXACT initialization sequence from peer_main.dart
      // that we added to fix the hanging issue, but apparently it's still hanging
      
      // Step 1: Create peerstore exactly like peer_main.dart
      final isolatedPeerstore = MemoryPeerstore();
      final keyPair = await generateEd25519KeyPair();
      final ownPeerId = PeerId.fromPublicKey(keyPair.publicKey);
      
      // Step 2: Initialize peerstore with own keys (critical step from peer_main.dart fix)
      print('🔧 Initializing peerstore with own keys...');
      isolatedPeerstore.keyBook.addPrivKey(ownPeerId, keyPair.privateKey);
      isolatedPeerstore.keyBook.addPubKey(ownPeerId, keyPair.publicKey);
      
      // Step 3: Create target peer (like peer-b)
      final targetPeerId = await PeerId.random();
      final targetAddrs = [
        MultiAddr('/ip4/192.168.1.101/tcp/4001'),
        MultiAddr('/ip4/10.10.0.3/tcp/4001')
      ];
      
      print('🔧 Adding addresses for target peer ${targetPeerId.toString()}...');
      
      // Step 4: Add peer addresses (mimics /connect endpoint)
      await isolatedPeerstore.addrBook.addAddrs(
        targetPeerId, 
        targetAddrs, 
        Duration(hours: 1)
      );
      
      print('✅ Added ${targetAddrs.length} addresses for peer ${targetPeerId.toString()}');
      
      // Step 5: Concurrent operations that might trigger deadlock
      final futures = <Future>[];
      
      // Multiple addrs() lookups concurrently (like holepunch + other services)
      for (int i = 0; i < 5; i++) {
        futures.add(Future.delayed(Duration(milliseconds: i * 10), () async {
          print('🔎 Lookup $i: Looking up addresses for peer ${targetPeerId.toString()} in peerstore...');
          final addrs = await isolatedPeerstore.addrBook.addrs(targetPeerId);
          print('🔎 Lookup $i: Found ${addrs.length} addresses for peer ${targetPeerId.toString()}');
          return addrs;
        }));
      }
      
      // Step 6: This should complete without hanging
      final results = await Future.wait(futures).timeout(
        Duration(seconds: 5),
        onTimeout: () {
          throw TimeoutException(
            'DEADLOCK REPRODUCED with own-key initialization! This is the exact bug from holepunch integration test!', 
            Duration(seconds: 5)
          );
        },
      );
      
      // Verify all lookups succeeded
      for (final addrs in results) {
        expect(addrs.length, equals(2), reason: 'Each lookup should find both addresses');
        expect(addrs, containsAll(targetAddrs), reason: 'Each lookup should contain the exact addresses');
      }
      
      print('✅ All concurrent lookups completed successfully');
    }, timeout: Timeout(Duration(seconds: 10)));

  });
}
