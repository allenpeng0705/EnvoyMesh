import 'dart:async';

import 'package:dart_libp2p/core/certified_addr_book.dart';
import 'package:dart_libp2p/core/network/transport_conn.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/p2p/host/host.dart';
import 'package:dart_libp2p/p2p/network/swarm/swarm.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/network.dart'; // For Connectedness, Network
import 'package:dart_libp2p/core/network/rcmgr.dart'; // For ResourceManager
import 'package:dart_libp2p/core/peerstore.dart';
import 'package:dart_libp2p/p2p/transport/basic_upgrader.dart';
import 'package:test/test.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';

import 'package:dart_libp2p/config/config.dart';
import 'package:dart_libp2p/core/crypto/ed25519.dart';
import 'package:dart_libp2p/core/crypto/keys.dart'; // For PrivKey

// New imports for real components and mocked interfaces
import 'package:dart_libp2p/p2p/host/basic/basic_host.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart' as p2p_peer; // For PeerId.createFromPublicKey
import 'package:dart_libp2p/p2p/transport/upgrader.dart'; // Corrected path
import 'package:dart_libp2p/core/event/bus.dart';
import 'package:dart_libp2p/core/connmgr/conn_manager.dart';
import 'package:dart_libp2p/core/connmgr/conn_gater.dart';
import 'package:dart_libp2p/p2p/transport/transport.dart' show Transport; // Corrected path
import 'package:dart_libp2p/p2p/transport/listener.dart' show Listener; // Corrected path
import 'swarm_integrated_test.mocks.dart'; // Import for generated mocks

// Annotations for Mockito code generation
@GenerateMocks(
  [ // Default mocks
    Peerstore,
    ResourceManager,
    Upgrader,
    EventBus,
    ConnManager,
    ConnGater,
    Listener,
    KeyBook, // Added
    PeerMetadata, // Added
    Emitter, // Added for EventBus
  ],
  customMocks: [ // Custom named mocks
    MockSpec<Transport>(as: #SwarmTestMockTransport), // Custom name for Transport mock
    // StreamSubscription is from dart:async, often better to use a real one from a dummy stream if complex
    // For now, let's try mocking it. If it causes issues, we can switch.
    MockSpec<Subscription<dynamic>>(as: #MockStreamSubscription), // Moved to customMocks
  ],
)
void main() {
  group('Swarm with real Config, Host, and mocked dependencies', () {
    late Config config;
    late PrivateKey peerKey; // Corrected type
    late PeerId localPeerId;
    late BasicHost host;
    late Swarm swarm;

    // Mocks
    late MockPeerstore mockPeerstore;
    late MockKeyBook mockKeyBook; // Added
    late MemoryAddrBook mockAddrBook; // Added
    late MockPeerMetadata mockPeerMetadata; // Added
    late MockResourceManager mockResourceManager;
    late SwarmTestMockTransport mockTransport; // Use custom name
    // late MockUpgrader mockUpgrader; // Swarm expects a concrete BasicUpgrader
    late BasicUpgrader basicUpgrader;
    late MockEventBus mockEventBus;
    late MockEmitter mockEmitter; // Added
    late MockStreamSubscription mockStreamSubscription; // Added
    late MockConnManager mockConnManager;
    late MockConnGater mockConnGater;

    setUp(() async {
      // 1. Initialize Mocks
      mockPeerstore = MockPeerstore();
      mockKeyBook = MockKeyBook(); // Added
      mockAddrBook = MemoryAddrBook(); // Added
      mockPeerMetadata = MockPeerMetadata(); // Added
      mockResourceManager = MockResourceManager();
      mockTransport = SwarmTestMockTransport(); // Use custom name
      // mockUpgrader = MockUpgrader(); // Use BasicUpgrader
      basicUpgrader = BasicUpgrader(resourceManager: mockResourceManager);
      mockEventBus = MockEventBus();
      mockEmitter = MockEmitter(); // Added
      mockStreamSubscription = MockStreamSubscription(); // Added
      mockConnManager = MockConnManager();
      mockConnGater = MockConnGater();

      // Configure mockPeerstore to return sub-mocks
      when(mockPeerstore.keyBook).thenReturn(mockKeyBook);
      when(mockPeerstore.addrBook).thenReturn(mockAddrBook);
      when(mockPeerstore.peerMetadata).thenReturn(mockPeerMetadata);

      // Configure MockEventBus
      when(mockEventBus.emitter(any, opts: anyNamed('opts')))
          .thenAnswer((_) async => mockEmitter);
              when(mockEventBus.subscribe(any, opts: anyNamed('opts')))
                  .thenReturn(mockStreamSubscription );
              when(mockEmitter.emit(any)).thenAnswer((_) async {}); // Assuming emit is async void or returns Future<void>
              when(mockStreamSubscription.close()).thenAnswer((_) async {}); // Assuming cancel is async
              when(mockStreamSubscription.stream).thenAnswer((_) => Stream.empty()); // Stub for stream getter

              // 2. Setup Config
      config = Config();
      final kp = await generateEd25519KeyPair();
      peerKey = kp.privateKey;
      config.peerKey = kp;
      // Pass mock dependencies to BasicHost via Config
      config.connManager = mockConnManager;
      config.eventBus = mockEventBus;
      // config.connGater = mockConnGater; // Removed, Config has no connGater field
      // config.peerstore = mockPeerstore; // BasicHost gets peerstore via network.peerStore

      // Derive localPeerId from peerKey
      localPeerId = p2p_peer.PeerId.fromPublicKey(peerKey.publicKey); // Corrected

      // Mock interactions for localPeerId's keys in the peerstore
      // These might be called by Swarm or Config initialization logic implicitly
      when(mockKeyBook.addPrivKey(localPeerId, peerKey)).thenAnswer((_) async {});
      when(mockKeyBook.addPubKey(localPeerId, peerKey.publicKey)).thenAnswer((_) async {});
      when(mockPeerstore.getPeer(localPeerId)).thenAnswer((_) async => null); // Corrected method
      when(mockPeerMetadata.put(localPeerId, any, any)).thenAnswer((_) async {}); // Corrected: assumes for localPeerId, any key, any val


      // Instantiate Swarm first, with host: null
      swarm = Swarm(
        host: null, // Will be set later
        localPeer: localPeerId,
        peerstore: mockPeerstore,
        resourceManager: mockResourceManager,
        transports: [mockTransport],
        upgrader: basicUpgrader, // Pass BasicUpgrader instance
        config: config,
      );

      // Instantiate BasicHost, passing the real Swarm instance
      host = await BasicHost.create(
        network: swarm,
        config: config,
      );

      // Link the real Host back to Swarm
      swarm.setHost(host);

      // Provide default mock behaviors
      // when(mockPeerstore.get(localPeerId)).thenAnswer((_) async => mockPeerstore); // mockPeerstore is already a mock
      when(mockPeerstore.getPeer(localPeerId)).thenAnswer((_) async => null); // Corrected method, more realistic default
      // when(mockTransport.dialerScore(any, any)).thenReturn(1); // Removed, not on Transport interface
      when(mockTransport.protocols).thenReturn([]); // Default empty protocols
      when(mockConnManager.isProtected(any, any)).thenReturn(false); // Corrected method
      when(mockConnGater.interceptPeerDial(any)).thenReturn(true); // Default allow dial
      when(mockConnGater.interceptAddrDial(any, any)).thenReturn(true); // Default allow addr dial
      when(mockConnGater.interceptSecured(any, any, any)).thenReturn(true); // Default allow secured
      when(mockConnGater.interceptUpgraded(any)).thenReturn((true, null)); // Corrected return type
    });

    tearDown(() async {
      await swarm.close();
      // host.close() is called by swarm.close()
    });

    test('should initialize correctly and components should be linked', () {
      expect(swarm, isA<Swarm>());
      expect(host, isA<BasicHost>());
      expect(config, isA<Config>());

      // expect(swarm.host, equals(host)); // Swarm._host is private
      expect(swarm.localPeer, equals(localPeerId));
      // expect(swarm.config, equals(config)); // Swarm._config is private
      expect(swarm.peerstore, equals(mockPeerstore));

      expect(host.network, equals(swarm)); // BasicHost.network is public getter
      expect(host.peerStore, equals(mockPeerstore)); // Corrected getter name
      expect(host.id, equals(localPeerId));
    });

    test('listen operation should interact with mock transport and update addresses', () async {
      final listenAddrInput = MultiAddr('/ip4/127.0.0.1/tcp/0');
      final listenAddrActual = MultiAddr('/ip4/127.0.0.1/tcp/12345'); // Example actual address

      final mockListener = MockListener();
      // when(mockListener.listenAddresses).thenReturn([listenAddrActual]); // Incorrect getter
      when(mockListener.addr).thenReturn(listenAddrActual); // Correct getter
      // when(mockListener.laddr).thenReturn(listenAddrActual); // Incorrect getter
      when(mockListener.close()).thenAnswer((_) async {});
      // Mock connectionStream to return an empty stream by default for this test,
      // as Swarm.listen will try to listen to it.
      when(mockListener.connectionStream).thenAnswer((_) => Stream<TransportConn>.empty());


      when(mockTransport.canListen(listenAddrInput)).thenReturn(true);
      when(mockTransport.listen(listenAddrInput)).thenAnswer((_) async => mockListener);
      
      // Swarm.listen also calls peerstore.addAddrs
      const expectedTTL = Duration(hours: 24 * 365 * 100); // Explicitly define for clarity
      when(mockAddrBook.addAddrs(localPeerId, [listenAddrActual], expectedTTL))
          .thenAnswer((_) async {});

      await swarm.listen([listenAddrInput]);

      verify(mockTransport.listen(listenAddrInput)).called(1);
      
      // Capture and verify arguments for mockAddrBook.addAddrs
      // The verify(...).captured itself confirms the call occurred with matching signature.
      // final List<dynamic> capturedAddrsArgs = verify(mockAddrBook.addAddrs(
      //   isA<PeerId>(), // Capture PeerId
      //   captureAny, // Capture List<Multiaddr>
      //   captureAny  // Capture Duration (TTL)
      // )).captured;

      // Since called(1) is confirmed, capturedAddrsArgs is List<dynamic> of arguments
      // expect(capturedAddrsArgs.length, 3, reason: "Should have 3 arguments for addAddrs call");
      // expect(capturedAddrsArgs[0], equals(localPeerId), reason: "Argument 0 (PeerId) mismatch");
      // expect(capturedAddrsArgs[1], isA<List<MultiAddr>>(), reason: "Argument 1 should be List<Multiaddr>");
      // expect(capturedAddrsArgs[1] as List<MultiAddr>, orderedEquals([listenAddrActual]), reason: "Argument 1 (AddrList) mismatch");
      // expect(capturedAddrsArgs[2], equals(expectedTTL), reason: "Argument 2 (TTL) mismatch");

      expect(swarm.listenAddresses, contains(listenAddrActual));
      final interfaceAddrs = await swarm.interfaceListenAddresses;
      expect(interfaceAddrs, contains(listenAddrActual));
    });

    // TODO: Add more tests:
    // - Dialing a peer (verifying interactions with transport, upgrader, peerstore, connGater, connManager)
    // - Handling incoming connections (verifying interactions with upgrader, connGater, connManager)
    // - Protocol negotiation (if Host is involved, or if Swarm directly handles parts of it)
    // - Resource manager interactions during connection setup/teardown
    // - Event bus interactions (if BasicHost emits events that Swarm might react to or vice-versa)
  });
}
