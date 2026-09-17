import '../core/network/conn.dart'; // For Conn type
import '../core/network/transport_conn.dart'; // For TransportConn type
import '../p2p/transport/multiplexing/yamux/session.dart';
import '../p2p/transport/multiplexing/multiplexer.dart'; // For MultiplexerConfig and Multiplexer interface
import 'config.dart'; // For Config, Option, Libp2p
import '../p2p/host/autonat/ambient_config.dart'; // For AmbientAutoNATv2Config

// Imports for new defaults
import '../core/crypto/keys.dart'; // For KeyPair, KeyType
import '../core/crypto/ed25519.dart' as crypto_ed25519; // For generateEd25519KeyPair
import '../p2p/transport/tcp_transport.dart';
import '../p2p/security/noise/noise_protocol.dart';
import '../p2p/host/eventbus/basic.dart'; // For BasicBus
import '../p2p/transport/connection_manager.dart' as p2p_conn_mgr; // For ConnectionManager
// No specific import for defaultAddrsFactory if defined in this file.
// If imported from basic_host, it would be:
// import '../p2p/host/basic/basic_host.dart' show defaultAddrsFactory;
import '../core/multiaddr.dart'; // For MultiAddr in defaultAddrsFactory

/// Default configuration options for libp2p

/// Default muxer configuration for Yamux.
///
/// This factory now matches the `Multiplexer Function(Conn secureConn, bool isClient)`
/// signature. It assumes `secureConn` can be cast to `TransportConn` as required
/// by `YamuxSession`. The actual connection upgrade logic (security + muxer negotiation)
/// will be handled by the Swarm/Upgrader, which will then call this factory.
Option defaultMuxers = Libp2p.muxer(
  '/yamux/1.0.0',
  (secureConn, isClient) {
    // YamuxSession expects a TransportConn.
    // The `secureConn` provided by the (future) Upgrader should be compatible.
    if (secureConn is! TransportConn) {
      // This might happen if the security layer doesn't output a TransportConn.
      // Or if an insecure connection (which might be a raw TransportConn) is used directly.
      // For now, we'll throw if it's not directly a TransportConn.
      // A more robust solution might involve an adapter or ensuring the security
      // layer preserves or wraps TransportConn capabilities.
      throw ArgumentError(
          'YamuxSession factory requires a TransportConn, but received ${secureConn.runtimeType}. '
          'The Upgrader needs to ensure the connection passed to the muxer factory is suitable.');
    }
    return YamuxSession(
      secureConn, // Already checked to be a TransportConn
      const MultiplexerConfig(), // Use default Yamux config
      isClient,
    );
  },
);

/// Apply default options to a Config instance if they haven't been set by the user.
Future<void> applyDefaults(Config config) async {
  // Default Identity (KeyPair)
  if (config.peerKey == null) {
    config.peerKey = await crypto_ed25519.generateEd25519KeyPair();
  }

  // Default Transports
  // Note: Default transports like TCP might require connManager and resourceManager.
  // These are typically initialized in Config.newNode() or by Swarm.
  // It's safer for the main constructor (Libp2p.new_ or Config.newNode)
  // to add default transports if the list is empty, after core components
  // like ResourceManager and ConnManager are available.
  // For now, applyDefaults will not add a default transport directly.
  // The validation in Config.newNode() will ensure transports are provided.
  // if (config.transports.isEmpty) {
  //   // config.transports.add(TCPTransport(connManager: config.connManager!, resourceManager: ...)); // This shows dependency
  // }

  // Default Security Protocol
  // NoiseSecurity.create requires a KeyPair.
  // Ensure peerKey is available (defaulted above or provided by user).
  if (!config.insecure && config.securityProtocols.isEmpty) {
    if (config.peerKey != null) {
      config.securityProtocols.add(await NoiseSecurity.create(config.peerKey!));
    } else {
      // This case should not happen if peerKey is defaulted above.
      throw StateError('Cannot apply default Noise security: peerKey is null.');
    }
  }

  // Default Muxers (Yamux is already handled by the defaultMuxers Option if muxers list is empty)
  if (config.muxers.isEmpty) {
    // This re-applies the Yamux default if it wasn't added via Option.
    // The defaultMuxers Option is usually added by Libp2p.new_ if no muxer options are given.
    // However, direct Config manipulation might bypass this, so ensuring it here is safe.
    await config.withMuxer(
      '/yamux/1.0.0',
      (secureConn, isClient) {
        if (secureConn is! TransportConn) {
          throw ArgumentError(
              'Default Yamux factory (via applyDefaults) requires a TransportConn, '
              'but received ${secureConn.runtimeType}.');
        }
        return YamuxSession(
          secureConn,
          const MultiplexerConfig(),
          isClient,
        );
      },
    );
  }

  // Default Connection Manager
  if (config.connManager == null) {
    config.connManager = p2p_conn_mgr.ConnectionManager(); 
  }

  // Default Event Bus
  if (config.eventBus == null) {
    config.eventBus = BasicBus();
  }

  // Default Identify Service Settings
  config.identifyUserAgent ??= 'dart-libp2p/0.1.0'; // Example version
  config.identifyProtocolVersion ??= 'ipfs/0.1.0';
  config.disableSignedPeerRecord ??= false; // Enable signed records by default
  config.disableObservedAddrManager ??= false;

  // Default AddrsFactory
  config.addrsFactory ??= _defaultAddrsFactoryInternal; // Use internal version

  // Default service enable flags
  // config.enablePing is already true by default in Config.
  // config.enableRelay is already false by default.
  // AutoNAT: Enable by default to automatically detect reachability
  config.enableAutoNAT = true; // Changed to true by default
  // config.enableHolePunching is already true by default.
  
  // Default AmbientAutoNATv2 configuration
  if (config.ambientAutoNATConfig == null) {
    config.ambientAutoNATConfig = const AmbientAutoNATv2Config();
  }

  // Note: PeerStore and ResourceManager are created later in Config.newNode(),
  // but the defaults set here (like PeerKey for PeerStore) will be used by their creation.
}

// Define defaultAddrsFactory locally to avoid import complexities for this basic default.
List<MultiAddr> _defaultAddrsFactoryInternal(List<MultiAddr> addrs) {
  return addrs.where((addr) {
    if (addr.isLoopback()) {
      return false;
    }
    final ip4Val = addr.valueForProtocol('ip4');
    final ip6Val = addr.valueForProtocol('ip6');
    if ((ip4Val == '0.0.0.0' || ip4Val == '0.0.0.0.0.0') || (ip6Val == '::' || ip6Val == '0:0:0:0:0:0:0:0')) {
      return false;
    }
    return true;
  }).toList();
}
