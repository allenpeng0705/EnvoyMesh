import 'dart:async';

import 'package:test/test.dart';
import 'package:mockito/mockito.dart';
import 'package:mockito/annotations.dart';

import 'package:dart_libp2p/core/event/addrs.dart';
import 'package:dart_libp2p/core/event/bus.dart';
import 'package:dart_libp2p/core/event/identify.dart';
import 'package:dart_libp2p/core/event/reachability.dart';
import 'package:dart_libp2p/core/host/host.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/network/network.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/peerstore.dart';
import 'package:dart_libp2p/core/protocol/autonatv2/autonatv2.dart';
import 'package:dart_libp2p/p2p/host/autonat/ambient_autonat_v2.dart';
import 'package:dart_libp2p/p2p/host/autonat/ambient_config.dart';

@GenerateMocks([Host, EventBus, Emitter, Subscription, Peerstore, ProtoBook, AutoNATv2, Conn])
import 'ambient_autonat_v2_test.mocks.dart';

void main() {
  group('AmbientAutoNATv2', () {
    late MockHost mockHost;
    late MockEventBus mockEventBus;
    late MockEmitter mockEmitter;
    late MockSubscription mockSubscription;
    late MockPeerstore mockPeerstore;
    late MockProtoBook mockProtoBook;
    late MockAutoNATv2 mockAutoNATv2;
    late MockConn mockConn;
    late StreamController<dynamic> eventStreamController;
    late AmbientAutoNATv2Config config;

    setUp(() {
      mockHost = MockHost();
      mockEventBus = MockEventBus();
      mockEmitter = MockEmitter();
      mockSubscription = MockSubscription();
      mockPeerstore = MockPeerstore();
      mockProtoBook = MockProtoBook();
      mockAutoNATv2 = MockAutoNATv2();
      mockConn = MockConn();
      eventStreamController = StreamController<dynamic>.broadcast();
      
      config = const AmbientAutoNATv2Config(
        bootDelay: Duration(milliseconds: 100), // Short delay for testing
        retryInterval: Duration(seconds: 1),
        refreshInterval: Duration(seconds: 5),
      );

      // Setup default mock responses
      when(mockHost.eventBus).thenReturn(mockEventBus);
      when(mockHost.peerStore).thenReturn(mockPeerstore);
      when(mockHost.addrs).thenReturn([
        MultiAddr('/ip4/1.2.3.4/tcp/4001'),
      ]);
      when(mockPeerstore.protoBook).thenReturn(mockProtoBook);
      when(mockEventBus.emitter(EvtLocalReachabilityChanged))
          .thenAnswer((_) async => mockEmitter);
      when(mockEmitter.emit(any)).thenAnswer((_) async {});
      when(mockEmitter.close()).thenAnswer((_) async {});
      when(mockEventBus.subscribe(any))
          .thenReturn(mockSubscription);
      when(mockSubscription.stream)
          .thenAnswer((_) => eventStreamController.stream);
      when(mockSubscription.close()).thenAnswer((_) async {});
      when(mockAutoNATv2.start()).thenAnswer((_) async {});
      when(mockAutoNATv2.close()).thenAnswer((_) async {});
    });

    tearDown(() {
      eventStreamController.close();
    });

    test('initializes with unknown reachability', () async {
      // Act
      final ambient = await AmbientAutoNATv2.create(
        mockHost,
        mockAutoNATv2,
        config: config,
      );

      // Assert
      expect(ambient.status, Reachability.unknown);
      expect(ambient.confidence, 0);
      
      await ambient.close();
    });

    test('subscribes to peer identification events', () async {
      // Act
      final ambient = await AmbientAutoNATv2.create(
        mockHost,
        mockAutoNATv2,
        config: config,
      );
      await Future.delayed(const Duration(milliseconds: 50));

      // Assert
      verify(mockEventBus.subscribe([
        EvtLocalAddressesUpdated,
        EvtPeerIdentificationCompleted,
      ])).called(1);
      
      await ambient.close();
    });

    test('probes peer when AutoNAT v2 support detected', () async {
      // Arrange
      final testPeerId = PeerId.fromString('12D3KooWTest');
      when(mockProtoBook.getProtocols(testPeerId))
          .thenAnswer((_) async => [AutoNATv2Protocols.dialProtocol]);
      
      final result = _MockResult()
        ..reachability = Reachability.public
        ..validatedAddrs = [];
      
      when(mockAutoNATv2.getReachability(any))
          .thenAnswer((_) async => result);

      // Act
      final ambient = await AmbientAutoNATv2.create(
        mockHost,
        mockAutoNATv2,
        config: config,
      );
      
      // Emit peer identification event
      eventStreamController.add(
        EvtPeerIdentificationCompleted(
          peer: testPeerId,
          conn: mockConn,
          listenAddrs: [],
          protocols: [],
          agentVersion: 'test/1.0.0',
          protocolVersion: 'test/1.0',
        ),
      );
      
      // Wait for probe to be scheduled and executed
      await Future.delayed(const Duration(seconds: 3));

      // Assert - probe should have been called
      verify(mockAutoNATv2.getReachability(any)).called(greaterThan(0));
      
      await ambient.close();
    });

    test('emits public reachability on successful probe', () async {
      // Arrange
      final result = _MockResult()
        ..reachability = Reachability.public
        ..validatedAddrs = [];
      
      when(mockAutoNATv2.getReachability(any))
          .thenAnswer((_) async => result);

      final ambient = await AmbientAutoNATv2.create(
        mockHost,
        mockAutoNATv2,
        config: config,
      );

      // Wait for boot delay and initial probe
      await Future.delayed(const Duration(milliseconds: 200));

      // Assert - reachability should be public
      expect(ambient.status, Reachability.public);
      
      // Verify event was emitted
      verify(mockEmitter.emit(
        argThat(predicate((event) =>
          event is EvtLocalReachabilityChanged &&
          event.reachability == Reachability.public
        )),
      )).called(greaterThan(0));
      
      await ambient.close();
    });

    test('emits private reachability on failed probe', () async {
      // Arrange
      final result = _MockResult()
        ..reachability = Reachability.private
        ..validatedAddrs = [];
      
      when(mockAutoNATv2.getReachability(any))
          .thenAnswer((_) async => result);

      final ambient = await AmbientAutoNATv2.create(
        mockHost,
        mockAutoNATv2,
        config: config,
      );

      // Wait for boot delay and initial probe
      await Future.delayed(const Duration(milliseconds: 200));

      // Assert - reachability should be private
      expect(ambient.status, Reachability.private);
      
      // Verify event was emitted
      verify(mockEmitter.emit(
        argThat(predicate((event) =>
          event is EvtLocalReachabilityChanged &&
          event.reachability == Reachability.private
        )),
      )).called(greaterThan(0));
      
      await ambient.close();
    });

    test('increases confidence on consistent results', () async {
      // Arrange
      final result = _MockResult()
        ..reachability = Reachability.public
        ..validatedAddrs = [];
      
      when(mockAutoNATv2.getReachability(any))
          .thenAnswer((_) async => result);

      final ambient = await AmbientAutoNATv2.create(
        mockHost,
        mockAutoNATv2,
        config: AmbientAutoNATv2Config(
          bootDelay: const Duration(milliseconds: 100),
          retryInterval: const Duration(milliseconds: 300),
          refreshInterval: const Duration(seconds: 5),
        ),
      );

      // Wait for initial probe
      await Future.delayed(const Duration(milliseconds: 200));
      expect(ambient.confidence, 0); // First result

      // Wait for second probe (retry interval)
      await Future.delayed(const Duration(milliseconds: 300));
      expect(ambient.confidence, 1);

      // Wait for third probe
      await Future.delayed(const Duration(milliseconds: 300));
      expect(ambient.confidence, 2);

      // Wait for fourth probe
      await Future.delayed(const Duration(milliseconds: 300));
      expect(ambient.confidence, 3); // Max confidence
      
      await ambient.close();
    });

    test('reschedules probe on address change', () async {
      // Arrange
      final result = _MockResult()
        ..reachability = Reachability.public
        ..validatedAddrs = [];
      
      when(mockAutoNATv2.getReachability(any))
          .thenAnswer((_) async => result);

      final ambient = await AmbientAutoNATv2.create(
        mockHost,
        mockAutoNATv2,
        config: config,
      );

      // Wait for initial probe to establish confidence
      await Future.delayed(const Duration(milliseconds: 200));
      
      // Manually set high confidence for testing
      // (In real scenario, this would happen after multiple probes)
      
      // Emit address change event
      eventStreamController.add(
        EvtLocalAddressesUpdated(
          diffs: false,
          current: [],
        ),
      );
      
      // Wait a bit for processing
      await Future.delayed(const Duration(milliseconds: 100));

      // New probe should be scheduled
      // Verify by checking that getReachability was called again
      verify(mockAutoNATv2.getReachability(any)).called(greaterThan(1));
      
      await ambient.close();
    });

    test('cleans up resources on close', () async {
      // Arrange
      final ambient = await AmbientAutoNATv2.create(
        mockHost,
        mockAutoNATv2,
        config: config,
      );

      // Act
      await ambient.close();

      // Assert
      verify(mockSubscription.close()).called(1);
      verify(mockEmitter.close()).called(1);
    });

    test('uses custom address function if provided', () async {
      // Arrange
      final customAddrs = [
        MultiAddr('/ip4/10.0.0.1/tcp/5000'),
        MultiAddr('/ip4/10.0.0.2/tcp/5001'),
      ];
      
      final customConfig = AmbientAutoNATv2Config(
        bootDelay: const Duration(milliseconds: 100),
        retryInterval: const Duration(seconds: 1),
        refreshInterval: const Duration(seconds: 5),
        addressFunc: () => customAddrs,
      );
      
      final result = _MockResult()
        ..reachability = Reachability.public
        ..validatedAddrs = [];
      
      when(mockAutoNATv2.getReachability(any))
          .thenAnswer((invocation) async {
            // Verify custom addresses were used
            final requests = invocation.positionalArguments[0] as List<Request>;
            expect(requests.length, customAddrs.length);
            return result;
          });

      // Act
      final ambient = await AmbientAutoNATv2.create(
        mockHost,
        mockAutoNATv2,
        config: customConfig,
      );

      // Wait for probe
      await Future.delayed(const Duration(milliseconds: 200));

      // Assert
      verify(mockAutoNATv2.getReachability(any)).called(greaterThan(0));
      
      await ambient.close();
    });
  });
}

/// Helper class to mock Result
class _MockResult implements Result {
  @override
  MultiAddr addr = MultiAddr('/ip4/1.2.3.4/tcp/4001');
  
  @override
  Reachability reachability = Reachability.unknown;
  
  @override
  int status = 0;
  
  // Note: validatedAddrs is not part of the Result interface
  List<MultiAddr> validatedAddrs = [];
}

