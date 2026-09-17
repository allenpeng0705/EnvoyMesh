import 'dart:async';
import 'package:dart_libp2p/core/peer/pb/peer_record.pb.dart' as pb;
import 'package:dart_libp2p/core/peer/record.dart';
import 'package:dart_libp2p/core/record/record_registry.dart';
import 'package:logging/logging.dart';
import 'package:dart_libp2p/core/crypto/ed25519.dart' as crypto_ed25519;
import 'package:dart_libp2p/core/crypto/keys.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/network/transport_conn.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart' as core_peer_id_lib;
import 'package:dart_libp2p/p2p/host/eventbus/basic.dart' as p2p_eventbus; // Aliased
import 'package:dart_libp2p/config/config.dart' as p2p_config;
import 'package:dart_libp2p/p2p/security/noise/noise_protocol.dart';
import 'package:dart_libp2p/p2p/transport/basic_upgrader.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/yamux/session.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/multiplexer.dart';
import 'package:dart_libp2p/config/stream_muxer.dart';
import 'package:dart_libp2p/p2p/transport/udx_transport.dart';
import 'package:dart_udx/dart_udx.dart';
import 'package:dart_libp2p/p2p/transport/connection_manager.dart' as p2p_transport;
import 'package:dart_libp2p/core/network/rcmgr.dart'; // Interface - Corrected Path
import 'package:dart_libp2p/p2p/network/swarm/swarm.dart';
import 'package:dart_libp2p/p2p/host/basic/basic_host.dart';
import 'package:dart_libp2p/p2p/host/peerstore/pstoremem.dart';
import 'package:dart_libp2p/core/event/bus.dart' as core_event_bus; // Interface
import 'package:dart_libp2p/core/network/network.dart' show Reachability; // For forceReachability parameter
import 'package:dart_libp2p/p2p/host/autonat/ambient_config.dart'; // For AmbientAutoNATv2Config

// Logger for this utility file
final _log = Logger('RealNetStack');

// Custom AddrsFactory for testing that doesn't filter loopback
List<MultiAddr> passThroughAddrsFactory(List<MultiAddr> addrs) {
  return addrs;
}

// Helper class for providing YamuxMuxer to the config
class _TestYamuxMuxerProvider extends StreamMuxer {
  final MultiplexerConfig yamuxConfig;

  _TestYamuxMuxerProvider({required this.yamuxConfig})
      : super(
          id: YamuxConstants.protocolId, // Use the constant from YamuxSession
          muxerFactory: (Conn secureConn, bool isClient) {
            if (secureConn is! TransportConn) {
              throw ArgumentError(
                  'YamuxMuxer factory expects a TransportConn, got ${secureConn.runtimeType}');
            }
            return YamuxSession(secureConn, yamuxConfig, isClient);
          },
        );
}

// Record type for returning node details
typedef Libp2pNode = ({
  BasicHost host,
  core_peer_id_lib.PeerId peerId,
  List<MultiAddr> listenAddrs,
  KeyPair keyPair
});

Future<Libp2pNode> createLibp2pNode({
  required UDX udxInstance,
  required ResourceManager resourceManager,
  required p2p_transport.ConnectionManager connManager,
  required core_event_bus.EventBus hostEventBus, // For BasicHost
  KeyPair? keyPair,
  List<MultiAddr>? listenAddrsOverride, // If null, will use default
  String? userAgentPrefix,
  bool enableRelay = false,
  bool enableAutoRelay = false,
  bool enablePing = false,
  Reachability? forceReachability, // Force reachability for testing
  AmbientAutoNATv2Config? ambientAutoNATConfig, // Custom config for AutoNAT
  List<String>? relayServers, // List of relay multiaddrs to auto-connect
}) async {
  final kp = keyPair ?? await crypto_ed25519.generateEd25519KeyPair();
  final peerId = await core_peer_id_lib.PeerId.fromPublicKey(kp.publicKey);
  _log.fine('Creating node for PeerId: ${peerId.toBase58()}');

  final yamuxMultiplexerConfig = MultiplexerConfig(
    keepAliveInterval: Duration(seconds: 15), // Enabled keepalives
    maxStreamWindowSize: 1024 * 1024, // 1MB
    initialStreamWindowSize: 256 * 1024, // 256KB
    streamWriteTimeout: Duration(seconds: 10),
    maxStreams: 256,
  );
  final muxerDefs = [_TestYamuxMuxerProvider(yamuxConfig: yamuxMultiplexerConfig)];
  final securityProtocols = [await NoiseSecurity.create(kp)];
  final peerstore = MemoryPeerstore();

  // Ensure localPeerId matches the one derived from this.peerKey.public
  // (localPeerId is derived from this.peerKey.privateKey in _createPeerId, so they should match)
  peerstore.keyBook.addPrivKey(peerId, kp.privateKey);
  peerstore.keyBook.addPubKey(peerId, kp.publicKey);

  final transport = UDXTransport(connManager: connManager, udxInstance: udxInstance);
  // final transport = TCPTransport(resourceManager: resourceManager, connManager: connManager);
  final upgrader = BasicUpgrader(resourceManager: resourceManager);

  final defaultListenAddrs = [MultiAddr('/ip4/0.0.0.0/udp/0/udx')];
  final currentListenAddrs = listenAddrsOverride ?? defaultListenAddrs;

  // Swarm Config
  final swarmConfig = p2p_config.Config()
    ..peerKey = kp
    ..enableAutoNAT= false
    ..enableHolePunching = false
    ..enableRelay = enableRelay
    ..connManager = connManager
    ..eventBus = p2p_eventbus.BasicBus() // Swarm's own event bus
    ..addrsFactory = passThroughAddrsFactory
    ..securityProtocols = securityProtocols
    ..muxers = muxerDefs;
  
  if (listenAddrsOverride == null || listenAddrsOverride.isNotEmpty) {
    // Only set listenAddrs if we intend to listen (e.g. server node or client that might accept incoming)
    swarmConfig.listenAddrs = currentListenAddrs;
  }

  final network = Swarm(
    localPeer: peerId,
    peerstore: peerstore,
    upgrader: upgrader,
    config: swarmConfig,
    transports: [transport],
    resourceManager: resourceManager, host: null,
  );

  // BasicHost Config
  final hostConfig = p2p_config.Config()
    ..peerKey = kp
    ..eventBus = hostEventBus // Shared event bus for hosts
    ..connManager = connManager
    ..enableAutoNAT= true // Enable AutoNAT for automatic reachability detection
    ..enableHolePunching = false
    ..enableRelay = enableRelay
    ..enableAutoRelay = enableAutoRelay
    ..enablePing = enablePing
    ..forceReachability = forceReachability // Set forced reachability if provided
    ..ambientAutoNATConfig = ambientAutoNATConfig // Custom AutoNAT config
    ..relayServers = relayServers ?? [] // Set relay servers for auto-connect
    ..disableSignedPeerRecord = false
    ..addrsFactory = passThroughAddrsFactory
    ..negotiationTimeout = Duration(seconds: 20)
    ..identifyUserAgent = "${userAgentPrefix ?? 'dart-libp2p-node'}/${peerId.toBase58().substring(0,6)}";
    // ..muxers = muxerDefs // Removed, should rely on Swarm's upgrader config
    // ..securityProtocols = securityProtocols; // Removed, should rely on Swarm's upgrader config
  
  if (listenAddrsOverride == null || listenAddrsOverride.isNotEmpty) {
     hostConfig.listenAddrs = currentListenAddrs;
  }



  // final host = await hostConfig.newNode();
  final host = await BasicHost.create(
    network: network,
    config: hostConfig,
  );
  network.setHost(host); // Link Swarm back to its Host

  RecordRegistry.register<pb.PeerRecord>(
      String.fromCharCodes(PeerRecordEnvelopePayloadType),
      pb.PeerRecord.fromBuffer
  );

  // Start Identify service (BasicHost.start() does this by default if config has it)
  // but we can be explicit if needed or add custom identify options.
  // For now, rely on BasicHost's default startup of Identify.

  await host.start();
  _log.fine('Host ${peerId.toBase58()} started.');

  List<MultiAddr> actualListenAddrs = [];
  if (listenAddrsOverride == null || listenAddrsOverride.isNotEmpty) {
    try {
      await network.listen(currentListenAddrs);
      actualListenAddrs = host.addrs; // Get actual listen addrs after binding
      _log.fine('Host ${peerId.toBase58()} listening on: $actualListenAddrs');
      if (actualListenAddrs.isEmpty) {
        _log.warning('Host ${peerId.toBase58()} started but has no listen addresses after listen() call.');
      }
    } catch (e, s) {
      _log.severe('Error making host ${peerId.toBase58()} listen on $currentListenAddrs: $e', e, s);
      // Decide if this should throw or if a host can exist without listening.
      // For tests requiring connections TO this host, it's an issue.
    }
  } else {
     _log.fine('Host ${peerId.toBase58()} configured not to listen (empty listenAddrsOverride).');
  }


  return (
    host: host as BasicHost,
    peerId: peerId,
    listenAddrs: actualListenAddrs,
    keyPair: kp
  );
}
