import 'dart:async';

import 'package:dart_libp2p/core/host/host.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/network/network.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/peerstore.dart';
import 'package:dart_libp2p/p2p/protocol/identify/id_service.dart';
import 'package:dart_libp2p/p2p/protocol/holepunch/holepunch_service.dart';
import 'package:dart_libp2p/p2p/protocol/holepunch/service.dart';
import 'package:dart_libp2p/p2p/protocol/holepunch/util.dart';
import 'package:test/test.dart';
import 'package:mockito/mockito.dart';
import 'package:mockito/annotations.dart';

@GenerateMocks([
  Host, 
  Network, 
  IDService, 
  Peerstore,
])
import 'holepunch_basic_test.mocks.dart';

void main() {
  group('HolePunch Basic Tests', () {
    late MockHost mockHost;
    late MockNetwork mockNetwork;
    late MockIDService mockIdService;
    late MockPeerstore mockPeerstore;
    late PeerId testPeerId;
    late List<MultiAddr> Function() listenAddrs;

    setUp(() async {
      mockHost = MockHost();
      mockNetwork = MockNetwork();
      mockIdService = MockIDService();
      mockPeerstore = MockPeerstore();
      testPeerId = await PeerId.random();
      
      listenAddrs = () => [
        MultiAddr('/ip4/127.0.0.1/tcp/4001'),
        MultiAddr('/ip6/::1/tcp/4002'),
      ];
      
      // Setup basic mock stubs
      when(mockHost.network).thenReturn(mockNetwork);
      when(mockHost.peerStore).thenReturn(mockPeerstore);
      when(mockHost.id).thenReturn(testPeerId);
      when(mockNetwork.localPeer).thenReturn(testPeerId);
      when(mockHost.setStreamHandler(any, any)).thenReturn(null);
      when(mockHost.removeStreamHandler(any)).thenReturn(null);
    });

    group('Service Creation', () {
      test('should create holepunch service', () {
        final service = HolePunchServiceImpl(
          mockHost,
          mockIdService,
          listenAddrs,
          options: const HolePunchOptions(),
        );
        
        expect(service, isNotNull);
        expect(service, isA<HolePunchService>());
      });

      test('should create service with default options', () {
        final service = HolePunchServiceImpl(
          mockHost,
          mockIdService,
          listenAddrs,
        );
        
        expect(service, isNotNull);
        expect(service, isA<HolePunchService>());
      });
    });

    group('Protocol Constants', () {
      test('should have correct protocol ID', () {
        expect(protocolId, equals('/libp2p/dcutr'));
      });

      test('should have correct service name', () {
        expect(serviceName, equals('libp2p.holepunch'));
      });

      test('should have reasonable timeout values', () {
        expect(streamTimeout, equals(Duration(minutes: 1)));
        expect(dialTimeout, equals(Duration(seconds: 5)));
        expect(maxRetries, equals(3));
        expect(maxMsgSize, equals(4 * 1024));
      });
    });

    group('HolePunch Options', () {
      test('should create options with custom values', () {
        const options = HolePunchOptions(
          tracer: null,
          filter: null,
        );
        
        expect(options.tracer, isNull);
        expect(options.filter, isNull);
      });

      test('should create default options', () {
        const options = HolePunchOptions();
        
        expect(options.tracer, isNull);
        expect(options.filter, isNull);
      });
    });

    group('Service Interface', () {
      test('should implement HolePunchService interface', () {
        final service = HolePunchServiceImpl(
          mockHost,
          mockIdService,
          listenAddrs,
        );
        
        expect(service, isA<HolePunchService>());
        
        // Should have the required methods
        expect(service.directConnect, isA<Function>());
        expect(service.start, isA<Function>());
        expect(service.close, isA<Function>());
      });
    });

    group('Service Lifecycle', () {
      late HolePunchServiceImpl service;
      
      setUp(() {
        service = HolePunchServiceImpl(
          mockHost,
          mockIdService,
          listenAddrs,
          options: const HolePunchOptions(),
        );
      });

      tearDown(() async {
        try {
          await service.close();
        } catch (_) {
          // Ignore errors if service is already closed
        }
      });

      test('should start successfully', () async {
        await expectLater(service.start(), completes);
        
        // Verify the service registered a stream handler
        verify(mockHost.setStreamHandler(protocolId, any)).called(1);
      });

      test('should close successfully after starting', () async {
        await service.start();
        await expectLater(service.close(), completes);
        
        // Verify cleanup happened
        verify(mockHost.removeStreamHandler(protocolId)).called(1);
      });
    });
  });
}
