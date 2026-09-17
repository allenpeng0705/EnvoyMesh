import 'dart:async';
import 'dart:typed_data';

import 'package:dart_libp2p/core/host/host.dart';
import 'package:dart_libp2p/core/network/network.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/peerstore.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/stream.dart';
import 'package:dart_libp2p/core/network/rcmgr.dart';
import 'package:dart_libp2p/core/network/common.dart';
import 'package:dart_libp2p/p2p/host/resource_manager/resource_manager_impl.dart';
import 'package:dart_libp2p/p2p/protocol/ping/ping.dart';
import 'package:mockito/annotations.dart';
import 'package:test/test.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:mockito/mockito.dart';
import 'package:dart_libp2p/p2p/host/peerstore/pstoremem/peerstore.dart';
import 'package:dart_libp2p/p2p/host/basic/basic_host.dart';
import 'package:dart_libp2p/config/config.dart'; // Added Config import
import 'package:dart_libp2p/core/crypto/keys.dart'; // For PublicKey
import 'package:dart_libp2p/p2p/transport/transport.dart'; // Corrected Transport import
import 'package:dart_libp2p/core/network/context.dart'; // For Context

@GenerateMocks([Host, Network, Peerstore, P2PStream, StreamScope],
  customMocks: [ // Custom named mocks
    MockSpec<Transport>(as: #PingTestMockTransport), // Custom name for Transport mock
  ],
)
import 'ping_test.mocks.dart';

// Minimal Mock Transport

void main() {
  group('Ping Protocol', () {
    late Host host1;
    late Host host2;
    late MemoryPeerstore peerstore1;
    late MemoryPeerstore peerstore2;

    setUpAll(() async {
      peerstore1 = MemoryPeerstore();
      peerstore2 = MemoryPeerstore();
      final peerId1 = await PeerId.random();
      final peerId2 = await PeerId.random();
      
      // Create a mock network that can handle connections between hosts
      final network1 = MockNetwork();
      final network2 = MockNetwork();
      
      // Set up the networks to know about each other
      when(network1.localPeer).thenReturn(peerId1);
      when(network2.localPeer).thenReturn(peerId2);
      
      // Set up the networks to handle newStream calls
      final addr1 = MultiAddr('/ip4/127.0.0.1/tcp/4001');
      final addr2 = MultiAddr('/ip4/127.0.0.1/tcp/4002');
      
      when(network1.newStream(any, any)).thenAnswer((invocation) async {
        // Host.newStream(context, peer, protocols)
        // invocation.positionalArguments[0] is context (any)
        // invocation.positionalArguments[1] is peerId (any)
        final remotePeerIdFromInvocation = invocation.positionalArguments[1] as PeerId;
        return await PingPongMockStream.create( 
          localPeerId: peerId1, // network1's local peer
          remotePeerId: remotePeerIdFromInvocation,
          localMultiaddr: addr1,
          remoteMultiaddr: addr2, // Assuming remote peer is on addr2 for this mock
          protocolName: PingConstants.protocolId,
          resourceManager: network1.resourceManager,
        );
      });
      
      when(network2.newStream(any, any)).thenAnswer((invocation) async {
        final remotePeerIdFromInvocation = invocation.positionalArguments[1] as PeerId;
        return await PingPongMockStream.create( 
          localPeerId: peerId2, // network2's local peer
          remotePeerId: remotePeerIdFromInvocation,
          localMultiaddr: addr2,
          remoteMultiaddr: addr1, // Assuming remote peer is on addr1 for this mock
          protocolName: PingConstants.protocolId,
          resourceManager: network2.resourceManager,
        );
      });
      
      // Stub listenAddresses and peerstore
      when(network1.listenAddresses).thenReturn([addr1]);
      when(network1.resourceManager).thenReturn(ResourceManagerImpl());
      when(network2.listenAddresses).thenReturn([addr2]);
      when(network1.peerstore).thenReturn(peerstore1);
      when(network2.resourceManager).thenReturn(ResourceManagerImpl());
      when(network2.peerstore).thenReturn(peerstore2);
      // Stub connectedness
      when(network1.connectedness(peerId2)).thenReturn(Connectedness.connected);
      when(network2.connectedness(peerId1)).thenReturn(Connectedness.connected);
      
      final config1 = Config();
      // Populate config1 with any specific settings host1 needs, if any.
      // For now, BasicHost will use defaults or pull from the network mock.
      host1 = await BasicHost.create(network: network1, config: config1);
      await host1.start();

      final config2 = Config();
      // Populate config2 for host2 if needed.
      host2 = await BasicHost.create(network: network2, config: config2);
      await host2.start();

      // Add addresses to peerstores
      peerstore1.addrBook.addAddrs(peerId2, [addr2], Duration(hours: 1));
      peerstore2.addrBook.addAddrs(peerId1, [addr1], Duration(hours: 1));

      // Setup host1
      // await host1.start();
      // await host2.start();
    });

    tearDownAll(() async {
      await host1.close();
      await host2.close();
    });

    test('ping between two hosts', () async {
      final pingPayload = Uint8List.fromList(List.generate(32, (index) => index));

      // Test ping from host1 to host2
      final stream1 = await host1.newStream(host2.id, [PingConstants.protocolId], Context());
      await stream1.write(pingPayload);
      final response1 = await stream1.read();
      expect(response1, equals(pingPayload));
      await stream1.close();

      // Test ping from host2 to host1
      final stream2 = await host2.newStream(host1.id, [PingConstants.protocolId], Context());
      await stream2.write(pingPayload);
      final response2 = await stream2.read();
      expect(response2, equals(pingPayload));
      await stream2.close();
    });
  });
}

// Mock Connection
class MockConn implements Conn {
  @override
  final PeerId localPeerId;
  @override
  final PeerId remotePeerId;
  final MultiAddr _localMultiaddr;
  final MultiAddr _remoteMultiaddr;
  final ConnManagementScope _connScope;
  bool _isClosed = false;
  final String _id;
  final Transport _transport;


  MockConn._({
    required this.localPeerId,
    required this.remotePeerId,
    required MultiAddr localMultiaddr,
    required MultiAddr remoteMultiaddr,
    required ConnManagementScope connScope,
    required String id,
    required Transport transport,
  }) : _localMultiaddr = localMultiaddr,
       _remoteMultiaddr = remoteMultiaddr,
       _connScope = connScope,
       _id = id,
       _transport = transport;

  static Future<MockConn> create({
    required PeerId localPeerId,
    required PeerId remotePeerId,
    required MultiAddr localMultiaddr,
    required MultiAddr remoteMultiaddr,
    required ResourceManager resourceManager,
    Transport? transport, // Allow optional transport override
  }) async {
    final connScope = await resourceManager.openConnection(Direction.outbound, false, remoteMultiaddr);
    await connScope.setPeer(remotePeerId);
    return MockConn._(
      localPeerId: localPeerId,
      remotePeerId: remotePeerId,
      localMultiaddr: localMultiaddr,
      remoteMultiaddr: remoteMultiaddr,
      connScope: connScope,
      id: 'mockconn-${DateTime.now().microsecondsSinceEpoch}',
      transport: transport ?? PingTestMockTransport(),
    );
  }

  @override
  String get id => _id;

  @override
  Future<void> close() async {
    if (!_isClosed) {
      _isClosed = true;
      _connScope.done();
    }
  }

  @override
  bool get isClosed => _isClosed;

  @override
  Future<List<P2PStream<dynamic>>> get streams async => [];

  @override
  MultiAddr get localMultiaddr => _localMultiaddr;

  @override
  PeerId get localPeer => localPeerId;

  @override
  Future<P2PStream<dynamic>> newStream(Context context) async {
    // Corrected signature with streamId
    throw UnimplementedError('MockConn.newStream is not implemented for this test.');
  }

  @override
  MultiAddr get remoteMultiaddr => _remoteMultiaddr;

  @override
  PeerId get remotePeer => remotePeerId;
  
  @override
  Future<PublicKey?> get remotePublicKey async => null;

  @override
  ConnScope get scope => _connScope as ConnScope;

  @override
  ConnState get state => ConnState( 
    streamMultiplexer: '/mplex/6.7.0', // Mock value
    security: '/noise', // Mock value
    transport: 'tcp', // Mock value for underlying transport
    usedEarlyMuxerNegotiation: false, // Mock value
  );

  @override
  ConnStats get stat => MockConnStats( // Use MockConnStats
        stats: Stats(
          direction: Direction.outbound,
          opened: DateTime.now().subtract(const Duration(seconds: 1)),
        ),
        numStreams: 0,
      );
  
  @override
  Transport get transport => _transport;
}

// Concrete implementation for ConnStats for mocking
class MockConnStats extends ConnStats {
  MockConnStats({required Stats stats, required int numStreams})
      : super(stats: stats, numStreams: numStreams);
}


class PingPongMockStream implements P2PStream<Uint8List> {
  Uint8List? _lastWritten;
  bool _closed = false;

  final PeerId remotePeerId;
  String protocolName;
  final StreamManagementScope _streamScope;
  final MockConn _conn;

  // Private constructor
  PingPongMockStream._({
    required this.remotePeerId,
    required this.protocolName,
    required StreamManagementScope streamScope,
    required MockConn conn,
  }) : _streamScope = streamScope, _conn = conn;

  // Static async factory method
  static Future<PingPongMockStream> create({
    required PeerId localPeerId,
    required PeerId remotePeerId,
    required MultiAddr localMultiaddr,
    required MultiAddr remoteMultiaddr,
    required String protocolName,
    required ResourceManager resourceManager,
  }) async {
    final conn = await MockConn.create(
      localPeerId: localPeerId,
      remotePeerId: remotePeerId,
      localMultiaddr: localMultiaddr,
      remoteMultiaddr: remoteMultiaddr,
      resourceManager: resourceManager,
    );
    // The stream scope is opened against the remote peer.
    final streamScope = await resourceManager.openStream(remotePeerId, Direction.outbound);
    return PingPongMockStream._(
      remotePeerId: remotePeerId,
      protocolName: '', // Protocol will be set by the host
      streamScope: streamScope,
      conn: conn,
    );
  }

  @override
  P2PStream<Uint8List> get incoming => this;
  @override
  bool get isClosed => _closed;
  @override
  bool get isWritable => !_closed;
  @override
  String id() => 'pingpong-mock-id-${DateTime.now().microsecondsSinceEpoch}'; // More unique ID
  @override
  String protocol() => protocolName;
  @override
  Future<void> setProtocol(String id) async {
    // The host calls this after protocol negotiation.
    // The host is responsible for setting the protocol on the scope.
    protocolName = id;
  } 
  @override
  StreamStats stat() => StreamStats(direction: Direction.outbound, opened: DateTime.now());
  @override
  Conn get conn => _conn; 
  @override
  StreamManagementScope scope() => _streamScope; // Changed return type
  @override
  Future<Uint8List> read([int? maxLength]) async {
    // Simulate echoing the last written data
    if (_lastWritten == null) throw Exception('No data written');
    final data = _lastWritten!;
    _lastWritten = null;
    return data;
  }
  @override
  Future<void> write(Uint8List data) async {
    _lastWritten = data;
  }
  @override
  Future<void> close() async { 
    if (!_closed) {
      _closed = true; 
      _streamScope.done();
      // Potentially also close the underlying mock connection if this stream is the only one.
      // For this test, assuming stream close doesn't auto-close connection.
    }
  }
  @override
  Future<void> closeWrite() async { 
    if (!_closed) { // Simplified: full close for mock
      _closed = true;
      _streamScope.done();
    }
  }
  @override
  Future<void> closeRead() async { 
    if (!_closed) { // Simplified: full close for mock
      _closed = true;
      _streamScope.done();
    }
  }
  @override
  Future<void> reset() async { 
    if (!_closed) {
      _closed = true; 
      _streamScope.done();
    }
  }
  @override
  Future<void> setDeadline(DateTime? time) async {}
  @override
  Future<void> setReadDeadline(DateTime? time) async {}
  @override
  Future<void> setWriteDeadline(DateTime? time) async {}
}
