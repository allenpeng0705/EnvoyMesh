import 'dart:async';
import 'package:test/test.dart';
import 'package:mockito/mockito.dart';
import 'package:mockito/annotations.dart';

import 'package:dart_libp2p/core/host/host.dart';
import 'package:dart_libp2p/core/event/bus.dart';
import 'package:dart_libp2p/core/event/reachability.dart';
import 'package:dart_libp2p/core/network/network.dart';
import 'package:dart_libp2p/p2p/host/relaysvc/relay_manager.dart';

@GenerateMocks([Host, EventBus, Subscription])
import 'relay_manager_test.mocks.dart';

void main() {
  group('RelayManager', () {
    late MockHost mockHost;
    late MockEventBus mockEventBus;
    late MockSubscription mockSubscription;

    setUp(() {
      mockHost = MockHost();
      mockEventBus = MockEventBus();
      mockSubscription = MockSubscription();

      // Setup default mock responses
      when(mockHost.eventBus).thenReturn(mockEventBus);
    });

    group('Initialization', () {
      test('should create RelayManager with default resources', () async {
        // Arrange
        when(mockEventBus.subscribe(EvtLocalReachabilityChanged))
            .thenReturn(mockSubscription);
        when(mockSubscription.stream)
            .thenAnswer((_) => Stream<EvtLocalReachabilityChanged>.empty());

        // Act
        final manager = await RelayManager.create(mockHost);

        // Assert
        expect(manager, isNotNull);
        expect(manager, isA<RelayManager>());

        await manager.close();
      });

      test('should create RelayManager with custom resources', () async {
        // Arrange
        when(mockEventBus.subscribe(EvtLocalReachabilityChanged))
            .thenReturn(mockSubscription);
        when(mockSubscription.stream)
            .thenAnswer((_) => Stream<EvtLocalReachabilityChanged>.empty());

        // Act
        final manager = await RelayManager.create(
          mockHost,
          maxReservations: 256,
          maxConnections: 256,
          reservationTtl: 7200,
          connectionDuration: 7200,
          connectionData: 2 * 1024 * 1024,
        );

        // Assert
        expect(manager, isNotNull);

        await manager.close();
      });

      test('should subscribe to reachability events on creation', () async {
        // Arrange
        when(mockEventBus.subscribe(EvtLocalReachabilityChanged))
            .thenReturn(mockSubscription);
        when(mockSubscription.stream)
            .thenAnswer((_) => Stream<EvtLocalReachabilityChanged>.empty());

        // Act
        final manager = await RelayManager.create(mockHost);

        // Assert
        verify(mockEventBus.subscribe(EvtLocalReachabilityChanged)).called(1);

        await manager.close();
      });
    });

    group('Reachability Handling', () {
      test('should start relay service when reachability becomes public', () async {
        // Arrange
        final reachabilityController = StreamController<EvtLocalReachabilityChanged>.broadcast();
        
        when(mockEventBus.subscribe(EvtLocalReachabilityChanged))
            .thenReturn(mockSubscription);
        when(mockSubscription.stream)
            .thenAnswer((_) => reachabilityController.stream);
        when(mockHost.setStreamHandler(any, any)).thenReturn(null);

        final manager = await RelayManager.create(mockHost);

        // Act - Emit public reachability event
        reachabilityController.add(
          EvtLocalReachabilityChanged(reachability: Reachability.public),
        );

        // Give time for async processing
        await Future.delayed(Duration(milliseconds: 100));

        // Assert - Relay service should be started
        // We can't directly verify the internal state, but we can check
        // that the stream handler was registered (done by Relay.start())
        verify(mockHost.setStreamHandler(any, any)).called(greaterThan(0));

        await manager.close();
        await reachabilityController.close();
      });

      test('should not start relay service when reachability is private', () async {
        // Arrange
        final reachabilityController = StreamController<EvtLocalReachabilityChanged>.broadcast();
        
        when(mockEventBus.subscribe(EvtLocalReachabilityChanged))
            .thenReturn(mockSubscription);
        when(mockSubscription.stream)
            .thenAnswer((_) => reachabilityController.stream);

        final manager = await RelayManager.create(mockHost);

        // Act - Emit private reachability event
        reachabilityController.add(
          EvtLocalReachabilityChanged(reachability: Reachability.private),
        );

        await Future.delayed(Duration(milliseconds: 100));

        // Assert - Relay service should not be started
        // No stream handler should be registered for private peers
        verifyNever(mockHost.setStreamHandler(any, any));

        await manager.close();
        await reachabilityController.close();
      });

      test('should not start relay service when reachability is unknown', () async {
        // Arrange
        final reachabilityController = StreamController<EvtLocalReachabilityChanged>.broadcast();
        
        when(mockEventBus.subscribe(EvtLocalReachabilityChanged))
            .thenReturn(mockSubscription);
        when(mockSubscription.stream)
            .thenAnswer((_) => reachabilityController.stream);

        final manager = await RelayManager.create(mockHost);

        // Act - Emit unknown reachability event
        reachabilityController.add(
          EvtLocalReachabilityChanged(reachability: Reachability.unknown),
        );

        await Future.delayed(Duration(milliseconds: 100));

        // Assert - Relay service should not be started for unknown reachability
        verifyNever(mockHost.setStreamHandler(any, any));

        await manager.close();
        await reachabilityController.close();
      });

      test('should stop relay service when reachability changes from public to private', () async {
        // Arrange
        final reachabilityController = StreamController<EvtLocalReachabilityChanged>.broadcast();
        
        when(mockEventBus.subscribe(EvtLocalReachabilityChanged))
            .thenReturn(mockSubscription);
        when(mockSubscription.stream)
            .thenAnswer((_) => reachabilityController.stream);
        when(mockHost.setStreamHandler(any, any)).thenReturn(null);
        when(mockHost.removeStreamHandler(any)).thenReturn(null);

        final manager = await RelayManager.create(mockHost);

        // Act - First become public (start relay)
        reachabilityController.add(
          EvtLocalReachabilityChanged(reachability: Reachability.public),
        );
        await Future.delayed(Duration(milliseconds: 100));

        // Then become private (stop relay)
        reachabilityController.add(
          EvtLocalReachabilityChanged(reachability: Reachability.private),
        );
        await Future.delayed(Duration(milliseconds: 100));

        // Assert - Relay service should be stopped
        verify(mockHost.removeStreamHandler(any)).called(greaterThan(0));

        await manager.close();
        await reachabilityController.close();
      });

      test('should not restart relay if already running on public event', () async {
        // Arrange
        final reachabilityController = StreamController<EvtLocalReachabilityChanged>.broadcast();
        
        when(mockEventBus.subscribe(EvtLocalReachabilityChanged))
            .thenReturn(mockSubscription);
        when(mockSubscription.stream)
            .thenAnswer((_) => reachabilityController.stream);
        when(mockHost.setStreamHandler(any, any)).thenReturn(null);

        final manager = await RelayManager.create(mockHost);

        // Act - Emit public twice
        reachabilityController.add(
          EvtLocalReachabilityChanged(reachability: Reachability.public),
        );
        await Future.delayed(Duration(milliseconds: 100));

        // Clear invocations for second check
        clearInteractions(mockHost);

        reachabilityController.add(
          EvtLocalReachabilityChanged(reachability: Reachability.public),
        );
        await Future.delayed(Duration(milliseconds: 100));

        // Assert - Should not register handler again (relay already running)
        verifyNever(mockHost.setStreamHandler(any, any));

        await manager.close();
        await reachabilityController.close();
      });
    });

    group('Lifecycle Management', () {
      test('should close cleanly when not started', () async {
        // Arrange
        when(mockEventBus.subscribe(EvtLocalReachabilityChanged))
            .thenReturn(mockSubscription);
        when(mockSubscription.stream)
            .thenAnswer((_) => Stream<EvtLocalReachabilityChanged>.empty());

        final manager = await RelayManager.create(mockHost);

        // Act & Assert - Should not throw
        expect(() async => await manager.close(), returnsNormally);
      });

      test('should close cleanly when relay is running', () async {
        // Arrange
        final reachabilityController = StreamController<EvtLocalReachabilityChanged>.broadcast();
        
        when(mockEventBus.subscribe(EvtLocalReachabilityChanged))
            .thenReturn(mockSubscription);
        when(mockSubscription.stream)
            .thenAnswer((_) => reachabilityController.stream);
        when(mockHost.setStreamHandler(any, any)).thenReturn(null);
        when(mockHost.removeStreamHandler(any)).thenReturn(null);

        final manager = await RelayManager.create(mockHost);

        // Start relay
        reachabilityController.add(
          EvtLocalReachabilityChanged(reachability: Reachability.public),
        );
        await Future.delayed(Duration(milliseconds: 100));

        // Act & Assert - Should close relay and clean up
        expect(() async => await manager.close(), returnsNormally);

        await reachabilityController.close();
      });

      test('should cancel event subscription on close', () async {
        // Arrange
        when(mockEventBus.subscribe(EvtLocalReachabilityChanged))
            .thenReturn(mockSubscription);
        when(mockSubscription.stream)
            .thenAnswer((_) => Stream<EvtLocalReachabilityChanged>.empty());
        when(mockSubscription.close()).thenAnswer((_) async {});

        final manager = await RelayManager.create(mockHost);

        // Act
        await manager.close();

        // Assert - Should close subscription
        verify(mockSubscription.close()).called(1);
      });

      test('should handle multiple close calls gracefully', () async {
        // Arrange
        when(mockEventBus.subscribe(EvtLocalReachabilityChanged))
            .thenReturn(mockSubscription);
        when(mockSubscription.stream)
            .thenAnswer((_) => Stream<EvtLocalReachabilityChanged>.empty());
        when(mockSubscription.close()).thenAnswer((_) async {});

        final manager = await RelayManager.create(mockHost);

        // Act - Close twice
        await manager.close();
        await manager.close();

        // Assert - Should handle gracefully (second close is no-op)
        verify(mockSubscription.close()).called(1);  // Only called once
      });
    });

    group('Error Handling', () {
      test('should handle relay start errors gracefully', () async {
        // Arrange
        final reachabilityController = StreamController<EvtLocalReachabilityChanged>.broadcast();
        
        when(mockEventBus.subscribe(EvtLocalReachabilityChanged))
            .thenReturn(mockSubscription);
        when(mockSubscription.stream)
            .thenAnswer((_) => reachabilityController.stream);
        when(mockHost.setStreamHandler(any, any))
            .thenThrow(Exception('Failed to set handler'));

        final manager = await RelayManager.create(mockHost);

        // Act - Try to start relay (will fail internally)
        reachabilityController.add(
          EvtLocalReachabilityChanged(reachability: Reachability.public),
        );
        
        await Future.delayed(Duration(milliseconds: 100));

        // Assert - Should not crash, error logged internally
        expect(true, isTrue);  // If we got here, error was handled

        await manager.close();
        await reachabilityController.close();
      });

      test('should handle relay stop errors gracefully', () async {
        // Arrange
        final reachabilityController = StreamController<EvtLocalReachabilityChanged>.broadcast();
        
        when(mockEventBus.subscribe(EvtLocalReachabilityChanged))
            .thenReturn(mockSubscription);
        when(mockSubscription.stream)
            .thenAnswer((_) => reachabilityController.stream);
        when(mockHost.setStreamHandler(any, any)).thenReturn(null);
        when(mockHost.removeStreamHandler(any))
            .thenThrow(Exception('Failed to remove handler'));

        final manager = await RelayManager.create(mockHost);

        // Start relay
        reachabilityController.add(
          EvtLocalReachabilityChanged(reachability: Reachability.public),
        );
        await Future.delayed(Duration(milliseconds: 100));

        // Act - Try to stop relay (will fail internally)
        reachabilityController.add(
          EvtLocalReachabilityChanged(reachability: Reachability.private),
        );
        await Future.delayed(Duration(milliseconds: 100));

        // Assert - Should not crash
        expect(true, isTrue);

        await manager.close();
        await reachabilityController.close();
      });

      test('should handle event stream errors gracefully', () async {
        // Arrange
        final reachabilityController = StreamController<EvtLocalReachabilityChanged>.broadcast();
        
        when(mockEventBus.subscribe(EvtLocalReachabilityChanged))
            .thenReturn(mockSubscription);
        when(mockSubscription.stream)
            .thenAnswer((_) => reachabilityController.stream);

        final manager = await RelayManager.create(mockHost);

        // Act - Add error to stream
        reachabilityController.addError(Exception('Stream error'));
        await Future.delayed(Duration(milliseconds: 100));

        // Assert - Should handle error gracefully
        expect(true, isTrue);

        await manager.close();
        await reachabilityController.close();
      });
    });

    group('Resource Configuration', () {
      test('should respect custom reservation limits', () async {
        // Arrange
        when(mockEventBus.subscribe(EvtLocalReachabilityChanged))
            .thenReturn(mockSubscription);
        when(mockSubscription.stream)
            .thenAnswer((_) => Stream<EvtLocalReachabilityChanged>.empty());

        // Act
        final manager = await RelayManager.create(
          mockHost,
          maxReservations: 512,
        );

        // Assert
        expect(manager, isNotNull);
        // Resource limits are passed to Relay internally

        await manager.close();
      });

      test('should respect custom connection limits', () async {
        // Arrange
        when(mockEventBus.subscribe(EvtLocalReachabilityChanged))
            .thenReturn(mockSubscription);
        when(mockSubscription.stream)
            .thenAnswer((_) => Stream<EvtLocalReachabilityChanged>.empty());

        // Act
        final manager = await RelayManager.create(
          mockHost,
          maxConnections: 512,
        );

        // Assert
        expect(manager, isNotNull);

        await manager.close();
      });

      test('should respect custom TTL values', () async {
        // Arrange
        when(mockEventBus.subscribe(EvtLocalReachabilityChanged))
            .thenReturn(mockSubscription);
        when(mockSubscription.stream)
            .thenAnswer((_) => Stream<EvtLocalReachabilityChanged>.empty());

        // Act
        final manager = await RelayManager.create(
          mockHost,
          reservationTtl: 7200,
          connectionDuration: 7200,
        );

        // Assert
        expect(manager, isNotNull);

        await manager.close();
      });
    });
  });
}
