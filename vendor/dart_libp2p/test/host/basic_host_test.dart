import 'dart:async';
import 'dart:typed_data';

import 'package:dart_libp2p/p2p/host/basic/basic_host.dart';
import 'package:dart_libp2p/p2p/host/eventbus/basic.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/peer/addr_info.dart';
import 'package:dart_libp2p/core/event/bus.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/network/context.dart';
import 'package:dart_libp2p/core/network/network.dart';
import 'package:dart_libp2p/core/network/stream.dart';
import 'package:dart_libp2p/core/peerstore.dart'; // KeyBook is part of this
import 'package:dart_libp2p/core/protocol/protocol.dart';
import 'package:dart_libp2p/p2p/host/host.dart';
import 'package:dart_libp2p/p2p/multiaddr/protocol.dart' as multiaddr_protocol; // Aliased import
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';
import 'package:test/test.dart';
import 'package:dart_libp2p/config/config.dart'; // Added Config import
import 'package:dart_libp2p/core/crypto/keys.dart'; // Import PrivateKey

import 'package:dart_libp2p/core/network/rcmgr.dart'; // Import ResourceManager
import 'package:dart_libp2p/core/network/common.dart'; // Direction

// Generate mocks for dependencies
@GenerateMocks([
  Network,
  Peerstore,
  P2PStream,
  Conn,
  AddrBook,
  ProtoBook,
  MultiAddr,
  ResourceManager, // Added ResourceManager
  KeyBook, // Added KeyBook
  PrivateKey, // Added PrivateKey
])
import 'basic_host_test.mocks.dart';

class _TestConnStats implements ConnStats {
  @override
  final Stats stats;
  @override
  final int numStreams;
  _TestConnStats({required this.stats, this.numStreams = 0});
}

void main() {
  group('BasicHost Tests', () {
    late MockNetwork network;
    late MockPeerstore peerstore;
    late MemoryAddrBook addrBook;
    late MockProtoBook protoBook;
    late PeerId localPeerId;
    late EventBus eventBus;
    late MockResourceManager mockResourceManager;
    late MockKeyBook mockKeyBook;
    late MockPrivateKey mockPrivKey;

    setUp(() {
      // Create mocks
      network = MockNetwork();
      mockResourceManager = MockResourceManager();
      peerstore = MockPeerstore();
      addrBook = MemoryAddrBook();
      protoBook = MockProtoBook();
      mockKeyBook = MockKeyBook();
      mockPrivKey = MockPrivateKey();
      localPeerId = PeerId.fromString('QmYyQSo1c1Ym7orWxLYvCrM2EmxFTANf8wXmmE7DWjhx5N');
      eventBus = BasicBus();

      // Setup mock behavior
      when(network.localPeer).thenReturn(localPeerId);
      when(network.peerstore).thenReturn(peerstore);
      when(peerstore.addrBook).thenReturn(addrBook);
      when(peerstore.protoBook).thenReturn(protoBook);
      when(peerstore.keyBook).thenReturn(mockKeyBook);
      when(mockKeyBook.privKey(localPeerId)).thenAnswer((_) async => mockPrivKey);
      when(network.listenAddresses).thenReturn([]);
      when(network.resourceManager).thenReturn(mockResourceManager);
    });

    // Helper to setup common stubs for MockMultiAddr
    void setupMockMultiAddr(MockMultiAddr addr, {String? ip4Value, String? p2pValue, bool isLoopback = false}) {
      when(addr.components).thenReturn(List<(multiaddr_protocol.Protocol, String)>.empty());
      when(addr.protocols).thenReturn(List<multiaddr_protocol.Protocol>.empty());
      when(addr.toBytes()).thenReturn(Uint8List(0));
      when(addr.isLoopback()).thenReturn(isLoopback); 
      when(addr.valueForProtocol(any)).thenReturn(null);
      if (ip4Value != null) {
        when(addr.valueForProtocol('ip4')).thenReturn(ip4Value);
      }
      if (p2pValue != null) {
         when(addr.valueForProtocol('p2p')).thenReturn(p2pValue);
      }
    }


    test('Host creation and closing', () async {
      final config = Config(); 
      config.eventBus = eventBus; 

      when(network.resourceManager).thenReturn(mockResourceManager);

      final host = await BasicHost.create(network: network, config: config);

      expect(host.id, equals(localPeerId));
      expect(host.peerStore, equals(peerstore));
      expect(host.network, equals(network));
      expect(host.eventBus, equals(eventBus));

      await host.close();
      await host.close();

      verify(network.close()).called(1);
    });

    group('Host Listening Logic on Start', () {
      test('Host does not attempt to listen if no listenAddrs are configured', () async {
        final config = Config(); 
        config.eventBus = eventBus;
        
        when(network.resourceManager).thenReturn(mockResourceManager);

        final host = await BasicHost.create(network: network, config: config);
        await host.start();

        verifyNever(network.listen(any));
        expect(host.addrs, isEmpty);

        await host.close();
      });

      test('Host start fails if network.listen() fails', () async {
        final listenAddr1 = MockMultiAddr();
        setupMockMultiAddr(listenAddr1, ip4Value: '127.0.0.1'); 
        final configListenAddrs = [listenAddr1];
        final config = Config()..listenAddrs = configListenAddrs;
        config.eventBus = eventBus;

        when(network.listen(configListenAddrs)).thenAnswer((_) async {
          return Future.error(Exception('Mock Network Listen Failed'));
        });
        
        when(network.resourceManager).thenReturn(mockResourceManager);

        final host = await BasicHost.create(network: network, config: config);

        expect(() async => await host.start(), throwsException);

        try {
          await host.close();
        } catch (_) {
          // Ignore
        }
      });
    });

    test('Host address management', () async {
      final config1 = Config();
      when(network.resourceManager).thenReturn(mockResourceManager);
      final host = await BasicHost.create(network: network, config: config1);

      expect(host.addrs, isEmpty);

      final addr1 = MockMultiAddr();
      setupMockMultiAddr(addr1, ip4Value: '192.168.1.10');
      when(addr1.toBytes()).thenReturn(Uint8List.fromList([1,2])); 

      final addr2 = MockMultiAddr();
      setupMockMultiAddr(addr2, ip4Value: '10.0.0.5');
      
      when(network.listenAddresses).thenReturn([addr1, addr2]);

      host.signalAddressChange(); 

      expect(host.addrs.length, equals(2));

      final customAddr = MockMultiAddr();
      setupMockMultiAddr(customAddr, ip4Value: '172.16.0.1');
      
      final config2 = Config();
      config2.addrsFactory = (_) => [customAddr];
      
      when(network.resourceManager).thenReturn(mockResourceManager);
      final hostWithCustomAddrs = await BasicHost.create(
        network: network,
        config: config2
      );

      expect(hostWithCustomAddrs.addrs.length, equals(1));
    });

    test('Protocol handler management', () async {
      final config = Config();
      config.eventBus = eventBus; 
      when(network.resourceManager).thenReturn(mockResourceManager);
      final host = await BasicHost.create(network: network, config: config);

      final subscription = await eventBus.subscribe(Object);
      final events = <Object>[];
      final sub = subscription.stream.listen((event) {
        events.add(event);
      });

      host.setStreamHandler('/test/1.0.0', (stream, remotePeer) async {});

      var protocols = await host.mux.protocols();
      expect(protocols.contains('/test/1.0.0'), isTrue);

      host.removeStreamHandler('/test/1.0.0');

      protocols = await host.mux.protocols();
      expect(protocols.contains('/test/1.0.0'), isFalse);

      await sub.cancel();
      await subscription.close();
      await host.close();
    });

    test('Connect to peer', () async {
      final config = Config();
      when(network.resourceManager).thenReturn(mockResourceManager);
      final host = await BasicHost.create(network: network, config: config);
      
      final listenAddrForStart = MockMultiAddr();
      setupMockMultiAddr(listenAddrForStart, ip4Value: '0.0.0.0'); 
      when(network.listenAddresses).thenReturn([listenAddrForStart]); 

      await host.start();

      final remotePeerId = PeerId.fromString('QmcgpsyWgH8Y8ajJz1Cu72KnS5uo2Aa2LpzU7kinSupNKC');
      final remoteAddr = MockMultiAddr();
      setupMockMultiAddr(remoteAddr, ip4Value: '1.2.3.4', p2pValue: remotePeerId.toString());

      final mockConn = MockConn();
      when(mockConn.remotePeer).thenReturn(remotePeerId); 
      when(mockConn.id).thenReturn('mock-conn-id'); 
      when(mockConn.isClosed).thenReturn(false); // Stub isClosed
      when(mockConn.stat).thenReturn(_TestConnStats(
        stats: Stats(direction: Direction.outbound, opened: DateTime.now()),
      ));
      when(network.connectedness(remotePeerId)).thenReturn(Connectedness.notConnected);
      when(network.dialPeer(any, remotePeerId)).thenAnswer((_) async => mockConn);

      // connect() will throw because identify can't succeed on a bare mock conn,
      // but we only care that dialPeer was invoked.
      try {
        await host.connect(AddrInfo(remotePeerId, [remoteAddr]));
      } catch (_) {
        // Expected: identify fails on mock connection
      }

      verify(network.dialPeer(any, remotePeerId)).called(1);
    });

    test('New stream creation', () async {
      final config = Config();
      when(network.resourceManager).thenReturn(mockResourceManager);
      final host = await BasicHost.create(network: network, config: config);

      final remotePeerId = PeerId.fromString('QmcgpsyWgH8Y8ajJz1Cu72KnS5uo2Aa2LpzU7kinSupNKC');

      final mockStream = MockP2PStream();
      when(network.connectedness(remotePeerId)).thenReturn(Connectedness.connected);
      when(network.newStream(any, remotePeerId)).thenAnswer((_) async => mockStream);

      try {
        await host.newStream(remotePeerId, ['/test/1.0.0'], Context());
        fail('Expected an exception due to incomplete mock setup');
      } catch (e) {
        // Expected
      }

      verify(network.newStream(any, remotePeerId)).called(1);
    });

    test('Stream handler registration', () async {
      final config = Config();
      when(network.resourceManager).thenReturn(mockResourceManager);
      final host = await BasicHost.create(network: network, config: config);

      host.setStreamHandler('/test/1.0.0', (stream, remotePeer) async {});

      var protocols = await host.mux.protocols();
      expect(protocols.contains('/test/1.0.0'), isTrue);

      host.removeStreamHandler('/test/1.0.0');

      protocols = await host.mux.protocols();
      expect(protocols.contains('/test/1.0.0'), isFalse);
    });
  });
}
