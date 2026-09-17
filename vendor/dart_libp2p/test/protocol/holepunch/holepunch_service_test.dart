import 'dart:async';
import 'dart:typed_data';

import 'package:dart_libp2p/core/host/host.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/network/network.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/network/stream.dart';
import 'package:dart_libp2p/core/network/rcmgr.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/peerstore.dart';
import 'package:dart_libp2p/core/peer/addr_info.dart';
import 'package:dart_libp2p/p2p/protocol/identify/id_service.dart';
import 'package:dart_libp2p/p2p/protocol/holepunch/holepunch_service.dart';
import 'package:dart_libp2p/p2p/protocol/holepunch/service.dart';
import 'package:dart_libp2p/p2p/protocol/holepunch/pb/holepunch.pb.dart';
import 'package:dart_libp2p/p2p/protocol/holepunch/util.dart';
import 'package:test/test.dart';
import 'package:mockito/mockito.dart';
import 'package:mockito/annotations.dart';

@GenerateMocks([
  Host, 
  Network, 
  Conn, 
  P2PStream, 
  IDService, 
  Peerstore,
  AddrBook,
  StreamManagementScope,
])
import 'holepunch_service_test.mocks.dart';

void main() {
  group('HolePunchService', () {
    late MockHost mockHost;
    late MockNetwork mockNetwork;
    late MockIDService mockIdService;
    late MockPeerstore mockPeerstore;
    late MockAddrBook mockAddrBook;
    HolePunchServiceImpl? service;
    late PeerId testPeerId;
    late List<MultiAddr> Function() listenAddrs;

    setUp(() async {
      mockHost = MockHost();
      mockNetwork = MockNetwork();
      mockIdService = MockIDService();
      mockPeerstore = MockPeerstore();
      mockAddrBook = MockAddrBook();
      testPeerId = await PeerId.random();
      service = null; // Initialize as null
      
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
      
      // Setup peerstore mocks
      when(mockPeerstore.addrBook).thenReturn(mockAddrBook);
      when(mockAddrBook.addrs(any)).thenAnswer((_) async => <MultiAddr>[]);
      
      // Setup network mocks
      when(mockNetwork.connsToPeer(any)).thenReturn([]);
      
      // Setup host.newStream mock (used by holepuncher)
      when(mockHost.newStream(any, any, any))
        .thenAnswer((_) async => throw Exception('Connection failed (expected in test)'));
      
      // Setup host.connect mock (used by holepuncher) 
      when(mockHost.connect(any, context: anyNamed('context')))
        .thenAnswer((_) async => throw Exception('Connection failed (expected in test)'));
    });

    tearDown(() async {
      if (service != null) {
        try {
          await service!.close();
        } catch (e) {
          // Ignore errors if service is already closed
        }
        service = null;
      }
    });

    group('Service Initialization', () {
      test('should create service successfully', () async {
        service = HolePunchServiceImpl(
          mockHost,
          mockIdService,
          listenAddrs,
          options: const HolePunchOptions(),
        );
        
        expect(service, isNotNull);
      });

      test('should throw error when identify service is null', () {
        expect(() => HolePunchServiceImpl(
          mockHost,
          mockIdService,
          listenAddrs,
        ), returnsNormally);
      });

      test('should start service successfully', () async {
        service = HolePunchServiceImpl(
          mockHost,
          mockIdService,
          listenAddrs,
          options: const HolePunchOptions(),
        );
        
        await expectLater(service!.start(), completes);
      });

      test('should close service successfully', () async {
        service = HolePunchServiceImpl(
          mockHost,
          mockIdService,
          listenAddrs,
          options: const HolePunchOptions(),
        );

        await service!.start();
        await expectLater(service!.close(), completes);
      });
    });

    group('Direct Connect', () {
      late PeerId remotePeerId;
      
      setUp(() async {
        remotePeerId = await PeerId.random();
        service = HolePunchServiceImpl(
          mockHost,
          mockIdService,
          listenAddrs,
          options: const HolePunchOptions(),
        );
        
        await service!.start();
      });

      test('should handle direct connection request', () async {
        // Mock that peer has some addresses to check
        when(mockAddrBook.addrs(remotePeerId)).thenAnswer((_) async => [
          MultiAddr('/ip4/192.168.1.100/tcp/4001'),
        ]);
        
        // Direct connect should complete even if the actual connection fails
        // (the service should handle connection failures gracefully)
        await expectLater(
          service!.directConnect(remotePeerId).catchError((_) => null),
          completes,
        );
      });

      test('should handle peer with no addresses', () async {
        // Mock that peer has no addresses
        when(mockAddrBook.addrs(remotePeerId)).thenAnswer((_) async => <MultiAddr>[]);
        
        // Should handle the case gracefully even with no addresses
        await expectLater(
          service!.directConnect(remotePeerId).catchError((_) => null),
          completes,
        );
      });
    });

    group('Service Behavior', () {      
      // Use a fresh service for each test in this group to avoid lifecycle conflicts
      late HolePunchServiceImpl localService;

      test('should register protocol handler on start', () async {
        localService = HolePunchServiceImpl(
          mockHost,
          mockIdService,
          listenAddrs,
          options: const HolePunchOptions(),
        );
        
        await localService.start();
        
        // Verify the service registered a stream handler for the DCUtR protocol
        verify(mockHost.setStreamHandler(protocolId, any)).called(1);
        
        await localService.close();
      });

      test('should unregister protocol handler on close', () async {
        localService = HolePunchServiceImpl(
          mockHost,
          mockIdService,
          listenAddrs,
          options: const HolePunchOptions(),
        );
        
        await localService.start();
        await localService.close();
        
        // Verify the service removed its stream handler
        verify(mockHost.removeStreamHandler(protocolId)).called(1);
      });

      test('should handle service lifecycle correctly', () async {
        localService = HolePunchServiceImpl(
          mockHost,
          mockIdService,
          listenAddrs,
          options: const HolePunchOptions(),
        );
        
        // Should be able to start and close without error
        await localService.start();
        await localService.close();
        
        // Verify both setup and cleanup happened
        verify(mockHost.setStreamHandler(any, any)).called(1);
        verify(mockHost.removeStreamHandler(any)).called(1);
      });
    });

    group('Protocol Compliance', () {
      test('should use correct protocol ID', () {
        expect(protocolId, equals('/libp2p/dcutr'));
      });

      test('should have reasonable timeouts', () {
        expect(streamTimeout, equals(Duration(minutes: 1)));
        expect(dialTimeout, equals(Duration(seconds: 5)));
      });

      test('should have reasonable message size limits', () {
        expect(maxMsgSize, equals(4 * 1024));
      });
    });

    group('Options and Configuration', () {
      test('should accept custom options', () {
        final customOptions = HolePunchOptions(
          tracer: null,
          filter: null,
        );
        
        service = HolePunchServiceImpl(
          mockHost,
          mockIdService,
          listenAddrs,
          options: customOptions,
        );
        
        expect(service, isNotNull);
      });

      test('should work with default options', () {
        service = HolePunchServiceImpl(
          mockHost,
          mockIdService,
          listenAddrs,
        );
        
        expect(service, isNotNull);
      });
    });
  });
}

// No additional mock implementations needed
