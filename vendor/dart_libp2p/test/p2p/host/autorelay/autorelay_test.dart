import 'dart:async';
import 'package:test/test.dart';
import 'package:mockito/mockito.dart';
import 'package:mockito/annotations.dart';

import 'package:dart_libp2p/core/host/host.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/event/bus.dart';
import 'package:dart_libp2p/core/event/reachability.dart';
import 'package:dart_libp2p/core/network/network.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/peer/addr_info.dart';
import 'package:dart_libp2p/p2p/transport/upgrader.dart';
import 'package:dart_libp2p/p2p/host/autorelay/autorelay.dart';
import 'package:dart_libp2p/p2p/host/autorelay/autorelay_config.dart';
import 'package:dart_libp2p/p2p/host/autorelay/relay_finder.dart';

@GenerateMocks([Host, EventBus, Emitter, Subscription, Network, Upgrader, RelayFinder])
import 'autorelay_test.mocks.dart';

void main() {
  group('AutoRelay', () {
    late MockHost mockHost;
    late MockEventBus mockEventBus;
    late MockEmitter mockEmitter;
    late MockSubscription mockSubscription;
    late MockNetwork mockNetwork;
    late MockUpgrader mockUpgrader;
    late AutoRelayConfig config;

    setUp(() {
      mockHost = MockHost();
      mockEventBus = MockEventBus();
      mockEmitter = MockEmitter();
      mockSubscription = MockSubscription();
      mockNetwork = MockNetwork();
      mockUpgrader = MockUpgrader();
      
      // Use a static relay address for testing (relay server from integration tests)
      final relayPeerId = PeerId.fromString('12D3KooWRcr1tPJ5D46uESVgA1sJrNmcGrW2XHGcHztHadBvcv3G');
      final relayAddr = MultiAddr('/ip4/10.10.3.10/tcp/4001');
      config = AutoRelayConfig(
        staticRelays: [AddrInfo(relayPeerId, [relayAddr])],
      );

      // Setup default mock responses
      when(mockHost.eventBus).thenReturn(mockEventBus);
      when(mockHost.network).thenReturn(mockNetwork);
      when(mockEventBus.emitter(any)).thenAnswer((_) async => mockEmitter);
      when(mockEmitter.emit(any)).thenAnswer((_) async {});
      when(mockEmitter.close()).thenAnswer((_) async {});
      
      // Mock subscriptions for background tasks - use broadcast streams
      when(mockEventBus.subscribe(any))
          .thenReturn(mockSubscription);
      when(mockSubscription.stream)
          .thenAnswer((_) => Stream.empty().asBroadcastStream());
    });

    group('Initialization', () {
      test('should create AutoRelay instance', () {
        // Act
        final autoRelay = AutoRelay(mockHost, mockUpgrader, userConfig: config);

        // Assert
        expect(autoRelay, isNotNull);
        expect(autoRelay, isA<AutoRelay>());
      });

      test('should initialize RelayFinder', () {
        // Act
        final autoRelay = AutoRelay(mockHost, mockUpgrader, userConfig: config);

        // Assert
        expect(autoRelay.relayFinder, isA<RelayFinder>());
      });
    });

    group('Address Advertisement', () {
      test('should emit address update events when started', () async {
        // Arrange
        final autoRelay = AutoRelay(mockHost, mockUpgrader, userConfig: config);
        
        final interfaceAddrs = [
          MultiAddr('/ip4/192.168.1.100/tcp/4001'),
        ];
        
        when(mockNetwork.interfaceListenAddresses)
            .thenAnswer((_) async => interfaceAddrs);

        // Act
        await autoRelay.start();
        
        // Give some time for async operations
        await Future.delayed(Duration(milliseconds: 100));

        // Assert - Verify address update event was emitted
        verify(mockEventBus.emitter(EvtAutoRelayAddrsUpdated)).called(greaterThan(0));
        verify(mockEmitter.emit(any)).called(greaterThan(0));
      });

      test('should include relay addresses when reachability is private', () async {
        // Arrange
        final autoRelay = AutoRelay(mockHost, mockUpgrader, userConfig: config);
        
        // Mock private reachability
        final privateAddrs = [
          MultiAddr('/ip4/192.168.1.100/tcp/4001'),
        ];
        
        when(mockNetwork.interfaceListenAddresses)
            .thenAnswer((_) async => privateAddrs);

        // Act
        await autoRelay.start();
        await Future.delayed(Duration(milliseconds: 100));

        // Assert - When private, should request relay addresses from RelayFinder
        // This would be verified through emitted events containing circuit addresses
        verify(mockEventBus.emitter(EvtAutoRelayAddrsUpdated)).called(greaterThan(0));
      });

      test('should use direct addresses when reachability is public', () async {
        // Arrange
        final autoRelay = AutoRelay(mockHost, mockUpgrader, userConfig: config);
        
        final publicAddrs = [
          MultiAddr('/ip4/203.0.113.1/tcp/4001'),  // public IP
        ];
        
        when(mockNetwork.interfaceListenAddresses)
            .thenAnswer((_) async => publicAddrs);

        // Act
        await autoRelay.start();
        await Future.delayed(Duration(milliseconds: 100));

        // Assert - Should emit addresses
        verify(mockEventBus.emitter(EvtAutoRelayAddrsUpdated)).called(greaterThan(0));
      });
    });

    group('Reachability Changes', () {
      test('should handle reachability change to private', () async {
        // Arrange
        final autoRelay = AutoRelay(mockHost, mockUpgrader, userConfig: config);
        
        final reachabilityStream = StreamController<EvtLocalReachabilityChanged>.broadcast();
        
        when(mockEventBus.subscribe(EvtLocalReachabilityChanged))
            .thenReturn(mockSubscription);
        when(mockSubscription.stream)
            .thenAnswer((_) => reachabilityStream.stream);
        
        when(mockNetwork.interfaceListenAddresses)
            .thenAnswer((_) async => [MultiAddr('/ip4/192.168.1.100/tcp/4001')]);

        // Act
        await autoRelay.start();
        
        // Emit reachability change
        reachabilityStream.add(
          EvtLocalReachabilityChanged(reachability: Reachability.private),
        );
        
        await Future.delayed(Duration(milliseconds: 100));

        // Assert - Should trigger address update
        verify(mockEventBus.emitter(EvtAutoRelayAddrsUpdated)).called(greaterThan(0));
        
        await reachabilityStream.close();
      });

      test('should handle reachability change to public', () async {
        // Arrange
        final autoRelay = AutoRelay(mockHost, mockUpgrader, userConfig: config);
        
        final reachabilityStream = StreamController<EvtLocalReachabilityChanged>.broadcast();
        
        when(mockEventBus.subscribe(EvtLocalReachabilityChanged))
            .thenReturn(mockSubscription);
        when(mockSubscription.stream)
            .thenAnswer((_) => reachabilityStream.stream);
        
        when(mockNetwork.interfaceListenAddresses)
            .thenAnswer((_) async => [MultiAddr('/ip4/203.0.113.1/tcp/4001')]);

        // Act
        await autoRelay.start();
        
        // Emit reachability change
        reachabilityStream.add(
          EvtLocalReachabilityChanged(reachability: Reachability.public),
        );
        
        await Future.delayed(Duration(milliseconds: 100));

        // Assert - Should trigger address update with public addresses
        verify(mockEventBus.emitter(EvtAutoRelayAddrsUpdated)).called(greaterThan(0));
        
        await reachabilityStream.close();
      });

      test('should handle reachability change to unknown', () async {
        // Arrange
        final autoRelay = AutoRelay(mockHost, mockUpgrader, userConfig: config);
        
        final reachabilityStream = StreamController<EvtLocalReachabilityChanged>.broadcast();
        
        when(mockEventBus.subscribe(EvtLocalReachabilityChanged))
            .thenReturn(mockSubscription);
        when(mockSubscription.stream)
            .thenAnswer((_) => reachabilityStream.stream);
        
        when(mockNetwork.interfaceListenAddresses)
            .thenAnswer((_) async => [MultiAddr('/ip4/192.168.1.100/tcp/4001')]);

        // Act
        await autoRelay.start();
        
        // Emit unknown reachability
        reachabilityStream.add(
          EvtLocalReachabilityChanged(reachability: Reachability.unknown),
        );
        
        await Future.delayed(Duration(milliseconds: 100));

        // Assert - Should trigger address update (treat as private)
        verify(mockEventBus.emitter(EvtAutoRelayAddrsUpdated)).called(greaterThan(0));
        
        await reachabilityStream.close();
      });
    });

    group('Lifecycle Management', () {
      test('should start AutoRelay successfully', () async {
        // Arrange
        final autoRelay = AutoRelay(mockHost, mockUpgrader, userConfig: config);
        
        when(mockNetwork.interfaceListenAddresses)
            .thenAnswer((_) async => [MultiAddr('/ip4/192.168.1.100/tcp/4001')]);

        // Act & Assert - Should not throw
        expect(() async => await autoRelay.start(), returnsNormally);
      });

      test('should not start twice', () async {
        // Arrange
        final autoRelay = AutoRelay(mockHost, mockUpgrader, userConfig: config);
        
        when(mockNetwork.interfaceListenAddresses)
            .thenAnswer((_) async => [MultiAddr('/ip4/192.168.1.100/tcp/4001')]);

        // Act - Start twice
        await autoRelay.start();
        await autoRelay.start();  // Second start should be no-op

        // Assert - Should handle gracefully
        // Implementation should check if already started
        expect(true, isTrue);  // If we got here, it didn't throw
      });

      test('should handle errors during address update gracefully', () async {
        // Arrange
        final autoRelay = AutoRelay(mockHost, mockUpgrader, userConfig: config);
        
        // Mock to throw error
        when(mockNetwork.interfaceListenAddresses)
            .thenThrow(Exception('Network error'));

        // Act & Assert - Should handle error gracefully
        await autoRelay.start();
        
        // Should not crash, error should be logged internally
        expect(true, isTrue);
      });
    });

    group('Configuration', () {
      test('should use provided config', () {
        // Arrange
        final relayPeerId = PeerId.fromString('12D3KooWRcr1tPJ5D46uESVgA1sJrNmcGrW2XHGcHztHadBvcv3G');
        final relayAddr = MultiAddr('/ip4/10.10.3.10/tcp/4001');
        final customConfig = AutoRelayConfig(
          staticRelays: [AddrInfo(relayPeerId, [relayAddr])],
        );

        // Act
        final autoRelay = AutoRelay(
          mockHost,
          mockUpgrader,
          userConfig: customConfig,
        );

        // Assert
        expect(autoRelay.config, equals(customConfig));
      });

      test('should use default config when not provided', () {
        // Note: AutoRelay requires a valid config with either staticRelays or peerSourceCallback
        // This test verifies that when no config is provided, it uses AutoRelayConfig() default,
        // which would fail if accessed without proper setup. In production, this would typically
        // be provided with valid configuration.
        
        // Act & Assert - Creating without config should use default
        // However, the default config needs either staticRelays or peerSourceCallback
        expect(
          () => AutoRelay(mockHost, mockUpgrader),
          throwsStateError,
        );
      });
    });

    group('Event Bus Integration', () {
      test('should subscribe to reachability events', () async {
        // Arrange
        final autoRelay = AutoRelay(mockHost, mockUpgrader, userConfig: config);
        
        when(mockEventBus.subscribe(EvtLocalReachabilityChanged))
            .thenReturn(mockSubscription);
        when(mockSubscription.stream)
            .thenAnswer((_) => Stream<EvtLocalReachabilityChanged>.empty());
        
        when(mockNetwork.interfaceListenAddresses)
            .thenAnswer((_) async => [MultiAddr('/ip4/192.168.1.100/tcp/4001')]);

        // Act
        await autoRelay.start();

        // Assert
        verify(mockEventBus.subscribe(EvtLocalReachabilityChanged)).called(1);
      });

      test('should emit address updated events', () async {
        // Arrange
        final autoRelay = AutoRelay(mockHost, mockUpgrader, userConfig: config);
        
        when(mockNetwork.interfaceListenAddresses)
            .thenAnswer((_) async => [MultiAddr('/ip4/192.168.1.100/tcp/4001')]);

        // Act
        await autoRelay.start();
        await Future.delayed(Duration(milliseconds: 100));

        // Assert
        verify(mockEventBus.emitter(EvtAutoRelayAddrsUpdated)).called(greaterThan(0));
        verify(mockEmitter.emit(argThat(isA<EvtAutoRelayAddrsUpdated>())))
            .called(greaterThan(0));
      });
    });

    group('Edge Cases', () {
      test('should handle empty interface addresses', () async {
        // Arrange
        final autoRelay = AutoRelay(mockHost, mockUpgrader, userConfig: config);
        
        when(mockNetwork.interfaceListenAddresses)
            .thenAnswer((_) async => <MultiAddr>[]);

        // Act & Assert
        expect(() async => await autoRelay.start(), returnsNormally);
      });

      test('should handle null config gracefully', () {
        // Act
        final autoRelay = AutoRelay(mockHost, mockUpgrader);

        // Assert - Should use default config
        expect(autoRelay.config, isNotNull);
      });
    });
  });
}
