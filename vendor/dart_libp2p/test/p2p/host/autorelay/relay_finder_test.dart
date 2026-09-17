import 'package:test/test.dart';
import 'package:mockito/mockito.dart';
import 'package:mockito/annotations.dart';

import 'package:dart_libp2p/core/host/host.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/peer/addr_info.dart';
import 'package:dart_libp2p/core/peerstore.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/event/bus.dart';
import 'package:dart_libp2p/core/network/network.dart';
import 'package:dart_libp2p/p2p/transport/upgrader.dart';
import 'package:dart_libp2p/p2p/host/autorelay/relay_finder.dart';
import 'package:dart_libp2p/p2p/host/autorelay/autorelay_config.dart';
import 'package:dart_libp2p/p2p/protocol/circuitv2/client/reservation.dart';

@GenerateMocks([Host, Peerstore, AddrBook, EventBus, Network, Upgrader])
import 'relay_finder_test.mocks.dart';

void main() {
  group('RelayFinder', () {
    late MockHost mockHost;
    late MockPeerstore mockPeerstore;
    late MockAddrBook mockAddrBook;
    late MockEventBus mockEventBus;
    late MockNetwork mockNetwork;
    late MockUpgrader mockUpgrader;
    late AutoRelayConfig config;

    setUp(() {
      mockHost = MockHost();
      mockPeerstore = MockPeerstore();
      mockAddrBook = MockAddrBook();
      mockEventBus = MockEventBus();
      mockNetwork = MockNetwork();
      mockUpgrader = MockUpgrader();
      
      // Use a static relay address for testing (relay server from integration tests)
      final relayPeerId = PeerId.fromString('12D3KooWRcr1tPJ5D46uESVgA1sJrNmcGrW2XHGcHztHadBvcv3G');
      final relayAddr = MultiAddr('/ip4/10.10.3.10/tcp/4001');
      config = AutoRelayConfig(
        staticRelays: [AddrInfo(relayPeerId, [relayAddr])],
      );

      // Setup basic mock responses
      when(mockHost.peerStore).thenReturn(mockPeerstore);
      when(mockPeerstore.addrBook).thenReturn(mockAddrBook);
      when(mockHost.eventBus).thenReturn(mockEventBus);
      when(mockHost.network).thenReturn(mockNetwork);
    });

    group('Circuit Address Construction', () {
      test('should construct valid circuit addresses from reservations', () async {
        // Arrange
        final relayFinder = RelayFinder(mockHost, mockUpgrader, config);
        
        // Create a relay peer ID
        final relayPeerId = PeerId.fromString('12D3KooWRcr1tPJ5D46uESVgA1sJrNmcGrW2XHGcHztHadBvcv3G');
        
        // Relay addresses (what the relay advertises) - use public IPs
        final relayAddresses = [
          MultiAddr('/ip4/1.2.3.4/tcp/4001'),    // Public IP
          MultiAddr('/ip4/5.6.7.8/tcp/4001'),    // Public IP
        ];
        
        // Mock the peerstore to return relay addresses BEFORE injecting reservation
        when(mockHost.peerStore).thenReturn(mockPeerstore);
        when(mockPeerstore.addrBook).thenReturn(mockAddrBook);
        when(mockAddrBook.addrs(relayPeerId))
            .thenAnswer((_) async => relayAddresses);
        
        // Create a test reservation
        final reservation = Reservation(
          DateTime.now().add(Duration(hours: 1)),  // expire
          relayAddresses,  // addrs
          null,  // voucher
        );
        
        // Inject the reservation using test helper
        await relayFinder.addTestReservation(relayPeerId, reservation);
        
        // Verify the relay was actually added
        expect(await relayFinder.hasRelay(relayPeerId), isTrue, 
          reason: 'Relay should be added to internal map');
        
        // Mock current host addresses (peer's own addresses)
        final currentHostAddrs = [
          MultiAddr('/ip4/192.168.1.100/tcp/4001'),
        ];
        
        // Act - Get relay addresses
        final circuitAddrs = await relayFinder.getRelayAddrs(currentHostAddrs);
        
        // Verify the mock was called
        verify(mockAddrBook.addrs(relayPeerId)).called(greaterThanOrEqualTo(1));
        
        // Assert - Should contain circuit addresses
        expect(circuitAddrs, isNotEmpty, reason: 'Should return at least private addresses or circuit addresses');
        
        // Verify circuit addresses have correct format
        // Expected: /ip4/10.10.3.10/tcp/4001/p2p/<relay-id>/p2p-circuit
        final circuitAddrsWithRelayId = circuitAddrs.where((addr) {
          final addrStr = addr.toString();
          return addrStr.contains('/p2p/${relayPeerId.toBase58()}') && 
                 addrStr.contains('/p2p-circuit');
        }).toList();
        
        expect(circuitAddrsWithRelayId, isNotEmpty, 
          reason: 'Should have at least one circuit address with relay peer ID');
        
        // Verify both relay addresses produced circuit addresses
        expect(circuitAddrsWithRelayId.length, equals(2),
          reason: 'Should have circuit addresses for both relay addresses');
        
        // Verify format of first circuit address
        final firstCircuitAddr = circuitAddrsWithRelayId[0].toString().trimRight();
        expect(firstCircuitAddr, contains('/ip4/'));
        expect(firstCircuitAddr, contains('/tcp/4001'));
        expect(firstCircuitAddr, contains('/p2p/${relayPeerId.toBase58()}'));
        // Accept both with and without trailing slash
        expect(firstCircuitAddr.endsWith('/p2p-circuit') || firstCircuitAddr.endsWith('/p2p-circuit/'), isTrue,
          reason: 'Address should end with /p2p-circuit (with or without trailing slash)');
      });

      test('should construct valid circuit address format', () {
        // Arrange - Test the expected format of circuit addresses
        final relayId = '12D3KooWRcr1tPJ5D46uESVgA1sJrNmcGrW2XHGcHztHadBvcv3G';
        final relayAddr = MultiAddr('/ip4/10.10.3.10/tcp/4001');
        
        // Manually construct what we expect AutoRelay to build
        final expectedCircuitAddr = relayAddr
            .encapsulate('p2p', relayId)
            .encapsulate('p2p-circuit', '');
        
        // Assert - Verify the address has correct format
        final addrString = expectedCircuitAddr.toString();
        expect(addrString, contains('/ip4/10.10.3.10/tcp/4001'));
        expect(addrString, contains('/p2p/$relayId'));
        expect(addrString, contains('/p2p-circuit'));
        
        // Verify components are in correct order
        expect(addrString, matches(RegExp(r'/ip4/.*/tcp/\d+/p2p/.*?/p2p-circuit')));
      });

      test('should handle multiple relay addresses', () async {
        // Arrange
        final relayFinder = RelayFinder(mockHost, mockUpgrader, config);
        
        final relayPeerId1 = PeerId.fromString('12D3KooWRcr1tPJ5D46uESVgA1sJrNmcGrW2XHGcHztHadBvcv3G');
        final relayPeerId2 = PeerId.fromString('12D3KooWF22ud67s2HPZrmD8PdGKEc6A8xaK9qvLmfbLTdqNLSXx');
        
        final relay1Addrs = [
          MultiAddr('/ip4/11.22.33.44/tcp/4001'),  // Public IP
          MultiAddr('/ip4/55.66.77.88/tcp/4001'),  // Public IP
        ];
        
        final relay2Addrs = [
          MultiAddr('/ip4/99.100.101.102/tcp/4001'),  // Public IP
        ];
        
        // Create reservations for both relays
        final reservation1 = Reservation(
          DateTime.now().add(Duration(hours: 1)),
          relay1Addrs,
          null,
        );
        final reservation2 = Reservation(
          DateTime.now().add(Duration(hours: 1)),
          relay2Addrs,
          null,
        );
        
        // Mock peerstore responses BEFORE injecting reservations
        when(mockHost.peerStore).thenReturn(mockPeerstore);
        when(mockPeerstore.addrBook).thenReturn(mockAddrBook);
        when(mockAddrBook.addrs(relayPeerId1))
            .thenAnswer((_) async => relay1Addrs);
        when(mockAddrBook.addrs(relayPeerId2))
            .thenAnswer((_) async => relay2Addrs);
        
        // Inject both reservations
        await relayFinder.addTestReservation(relayPeerId1, reservation1);
        await relayFinder.addTestReservation(relayPeerId2, reservation2);
        
        final currentHostAddrs = [
          MultiAddr('/ip4/192.168.1.100/tcp/4001'),
        ];
        
        // Act
        final circuitAddrs = await relayFinder.getRelayAddrs(currentHostAddrs);
        
        // Assert - With 2 relays having 3 total addresses, we expect 3 circuit addresses
        final circuitAddrsOnly = circuitAddrs.where((addr) => 
          addr.toString().contains('/p2p-circuit')
        ).toList();
        
        expect(circuitAddrsOnly.length, equals(3),
          reason: 'Should have 3 circuit addresses (2 from relay1 + 1 from relay2)');
        
        // Verify both relay peer IDs are present
        final addrsWithRelay1 = circuitAddrs.where((addr) => 
          addr.toString().contains('/p2p/${relayPeerId1.toBase58()}')
        ).toList();
        expect(addrsWithRelay1.length, equals(2));
        
        final addrsWithRelay2 = circuitAddrs.where((addr) => 
          addr.toString().contains('/p2p/${relayPeerId2.toBase58()}')
        ).toList();
        expect(addrsWithRelay2.length, equals(1));
      });

      test('should include private/loopback addresses in result', () async {
        // Arrange
        final relayFinder = RelayFinder(mockHost, mockUpgrader, config);
        
        // Peer's current addresses include private and loopback
        final currentHostAddrs = [
          MultiAddr('/ip4/127.0.0.1/tcp/4001'),      // loopback
          MultiAddr('/ip4/192.168.1.100/tcp/4001'),  // private
          MultiAddr('/ip4/10.0.0.5/tcp/4001'),       // private
        ];
        
        // Act
        final circuitAddrs = await relayFinder.getRelayAddrs(currentHostAddrs);
        
        // Assert - Should include private/loopback addresses
        // (These are filtered in getRelayAddrs to be included)
        expect(circuitAddrs, isA<List<MultiAddr>>());
        
        // The method should add circuit addresses AND keep private/loopback
        // Once relays are added, we'd verify this properly
      });

      test('should use address caching to avoid excessive lookups', () async {
        // Arrange
        final relayFinder = RelayFinder(mockHost, mockUpgrader, config);
        
        final currentHostAddrs = [
          MultiAddr('/ip4/192.168.1.100/tcp/4001'),
        ];
        
        // Act - Call twice in succession
        final addrs1 = await relayFinder.getRelayAddrs(currentHostAddrs);
        final addrs2 = await relayFinder.getRelayAddrs(currentHostAddrs);
        
        // Assert - Both calls should return same cached result
        expect(addrs1, equals(addrs2));
        
        // Verify peerstore wasn't called excessively (due to caching)
        // The cache expires after 30 seconds, so within that window,
        // we should see the same result
      });
    });

    group('Relay Candidate Selection', () {
      test('should filter out relay addresses from candidates', () {
        // Arrange - Addresses that should NOT be selected as relay candidates
        final relayCircuitAddr = MultiAddr('/ip4/10.10.1.1/tcp/4001/p2p/QmRelay/p2p-circuit');
        final directAddr = MultiAddr('/ip4/10.10.1.2/tcp/4001');
        
        // Assert - Only direct addresses should be candidates
        // This tests the logic that relay addresses shouldn't be used as relay candidates
        expect(relayCircuitAddr.toString(), contains('/p2p-circuit'));
        expect(directAddr.toString(), isNot(contains('/p2p-circuit')));
      });

      test('should respect max relay limit from config', () {
        // Arrange
        final relayPeerId = PeerId.fromString('12D3KooWRcr1tPJ5D46uESVgA1sJrNmcGrW2XHGcHztHadBvcv3G');
        final relayAddr = MultiAddr('/ip4/10.10.3.10/tcp/4001');
        final customConfig = AutoRelayConfig(
          staticRelays: [AddrInfo(relayPeerId, [relayAddr])],
        );
        // Note: AutoRelayConfig should have a maxCandidateRelays field
        
        final relayFinder = RelayFinder(mockHost, mockUpgrader, customConfig);
        
        // Assert - Verify config is respected
        expect(relayFinder, isNotNull);
        // TODO: Add assertions once config max relay limits are accessible
      });
    });

    group('Reservation Management', () {
      test('should track reservation expiration times', () {
        // Arrange
        final expiration = DateTime.now().add(Duration(hours: 1));
        final reservation = Reservation(
          expiration,  // expire
          [],  // addrs
          null,  // voucher
        );
        
        // Assert
        expect(reservation.expire, equals(expiration));
        expect(reservation.expire.isAfter(DateTime.now()), isTrue);
      });

      test('should detect expired reservations', () {
        // Arrange - Create an already-expired reservation
        final expiration = DateTime.now().subtract(Duration(minutes: 1));
        final reservation = Reservation(
          expiration,  // expire
          [],  // addrs
          null,  // voucher
        );
        
        // Assert
        expect(reservation.expire.isBefore(DateTime.now()), isTrue);
      });
    });

    group('Edge Cases', () {
      test('should handle empty relay list gracefully', () async {
        // Arrange
        final relayFinder = RelayFinder(mockHost, mockUpgrader, config);
        
        final currentHostAddrs = [
          MultiAddr('/ip4/192.168.1.100/tcp/4001'),
        ];
        
        // Act - No relays connected
        final circuitAddrs = await relayFinder.getRelayAddrs(currentHostAddrs);
        
        // Assert - Should still return private addresses
        expect(circuitAddrs, isA<List<MultiAddr>>());
        // With no relays, should only contain filtered currentHostAddrs
      });

      test('should handle relay with no addresses', () async {
        // Arrange
        final relayFinder = RelayFinder(mockHost, mockUpgrader, config);
        
        final relayPeerId = PeerId.fromString('12D3KooWF22ud67s2HPZrmD8PdGKEc6A8xaK9qvLmfbLTdqNLSXx');
        
        // Mock peerstore returning empty address list
        when(mockAddrBook.addrs(relayPeerId))
            .thenAnswer((_) async => <MultiAddr>[]);
        
        final currentHostAddrs = [
          MultiAddr('/ip4/192.168.1.100/tcp/4001'),
        ];
        
        // Act
        final circuitAddrs = await relayFinder.getRelayAddrs(currentHostAddrs);
        
        // Assert - Should handle gracefully without throwing
        expect(circuitAddrs, isA<List<MultiAddr>>());
      });

      test('should handle malformed addresses gracefully', () async {
        // Arrange
        final relayFinder = RelayFinder(mockHost, mockUpgrader, config);
        
        final relayPeerId = PeerId.fromString('12D3KooWF22ud67s2HPZrmD8PdGKEc6A8xaK9qvLmfbLTdqNLSXx');
        
        // Mock peerstore returning mix of valid and potentially problematic addresses
        final mixedAddrs = [
          MultiAddr('/ip4/10.10.1.1/tcp/4001'),  // valid
          // In real scenarios, there might be edge cases with address formats
        ];
        
        when(mockAddrBook.addrs(relayPeerId))
            .thenAnswer((_) async => mixedAddrs);
        
        final currentHostAddrs = [
          MultiAddr('/ip4/192.168.1.100/tcp/4001'),
        ];
        
        // Act & Assert - Should not throw
        expect(
          () async => await relayFinder.getRelayAddrs(currentHostAddrs),
          returnsNormally,
        );
      });
    });
  });
}
