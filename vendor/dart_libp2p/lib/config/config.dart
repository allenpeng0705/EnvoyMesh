import 'dart:async';

import 'package:dart_libp2p/config/defaults.dart';
import 'package:dart_libp2p/config/stream_muxer.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/network/network.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';

import 'package:dart_libp2p/core/crypto/keys.dart';
import 'package:dart_libp2p/core/host/host.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/p2p/security/security_protocol.dart';
import 'package:dart_libp2p/p2p/transport/transport.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/multiplexer.dart';
import 'package:dart_libp2p/core/connmgr/conn_manager.dart'; // Added
import 'package:dart_libp2p/core/event/bus.dart'; // Added
import 'package:dart_libp2p/p2p/host/basic/natmgr.dart'; // Added
import 'package:dart_libp2p/core/host/host.dart' show AddrsFactory; // Added for AddrsFactory
import 'package:dart_libp2p/p2p/host/basic/basic_host.dart'; // Added for BasicHost

// Added imports for _createNetwork
import 'package:dart_libp2p/p2p/network/swarm/swarm.dart';
import 'package:dart_libp2p/p2p/host/peerstore/pstoremem/peerstore.dart'; // For MemoryPeerstore
import 'package:dart_libp2p/p2p/host/resource_manager/resource_manager_impl.dart';
import 'package:dart_libp2p/p2p/host/resource_manager/limiter.dart'; // For FixedLimiter
import 'package:dart_libp2p/p2p/transport/basic_upgrader.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart' as concrete_peer_id; // For concrete PeerId if needed
import 'package:dart_libp2p/core/peerstore.dart' show Peerstore; // For type hinting
import 'package:dart_libp2p/core/network/rcmgr.dart' show ResourceManager; // For type hinting
import 'package:dart_libp2p/core/record/record_registry.dart';
import 'package:logging/logging.dart';

import '../core/peer/pb/peer_record.pb.dart' as pb;
import '../core/peer/record.dart'; // Added for RecordRegistry

// AutoNATv2 imports
import 'package:dart_libp2p/core/protocol/autonatv2/autonatv2.dart';
import 'package:dart_libp2p/p2p/protocol/autonatv2.dart';
import 'package:dart_libp2p/p2p/protocol/autonatv2/options.dart';
import 'package:dart_libp2p/p2p/host/autonat/ambient_config.dart';
import 'package:dart_libp2p/p2p/protocol/circuitv2/client/metrics_observer.dart';

final Logger _logger = Logger('Config');

/// Config describes a set of settings for a libp2p node
///
/// This is *not* a stable interface. Use the options defined in the root
/// package.
class Config {
  /// The identifier this node will send to other peers when
  /// identifying itself, e.g. via the identify protocol.
  String? userAgent;

  /// The protocol version that identifies the family
  /// of protocols used by the peer in the Identify protocol.
  String? protocolVersion;

  /// The private key for this node
  KeyPair? peerKey;

  /// List of transports to use
  List<Transport> transports = [];

  /// List of security protocols to use
  List<SecurityProtocol> securityProtocols = [];

  /// Whether to use insecure connections (no security)
  bool insecure = false;

  /// List of addresses to listen on
  List<MultiAddr> listenAddrs = [];

  /// List of stream multiplexers to use
  List<StreamMuxer> muxers = [];

  // BasicHost specific configurations
  Duration? negotiationTimeout;
  AddrsFactory? addrsFactory;
  ConnManager? connManager;
  EventBus? eventBus;
  NATManager Function(Network)? natManagerFactory;

  // IdentifyService specific configurations
  String? identifyUserAgent;
  String? identifyProtocolVersion;
  bool? disableSignedPeerRecord;
  bool? disableObservedAddrManager;
  // We can add a field for MetricsTracer for Identify if needed:
  // MetricsTracer? identifyMetricsTracer;

  // Service-specific enable flags
  bool enablePing = true; // Default to true for Ping service
  bool enableRelay = false; // Default to false for Relay service
  bool enableAutoRelay = false; // Default to false for AutoRelay service
  bool enableAutoNAT = false; // Default to false for AutoNAT service
  bool enableHolePunching = true; // Default to true for Hole Punching service

  // AutoNATv2 specific configurations
  List<AutoNATv2Option> autoNATv2Options = [];
  
  // AmbientAutoNATv2 specific configurations
  AmbientAutoNATv2Config? ambientAutoNATConfig;
  
  // Force reachability option (for edge cases like relay servers)
  Reachability? forceReachability;
  
  // Relay server configuration
  List<String> relayServers = []; // List of relay multiaddr strings to auto-connect
  
  // Relay metrics observer (for instrumentation)
  RelayMetricsObserver? relayMetricsObserver;

  /// Apply applies the given options to the config, returning the first error
  /// encountered (if any).
  Future<void> apply(List<Option> opts) async {
    for (final opt in opts) {
      if (opt == null) continue;
      await opt(this);
    }
  }

  /// Creates a new libp2p Host from the Config.
  ///
  /// This function consumes the config. Do not reuse it.
  Future<Host> newNode() async {
    // Validate configuration
    _validate();

    // Ensure core record types are registered (idempotent)
    RecordRegistry.register<pb.PeerRecord>(
      String.fromCharCodes(PeerRecordEnvelopePayloadType),
      pb.PeerRecord.fromBuffer
    );

    // This is a placeholder implementation that outlines the steps involved in creating a Host.
    // In a real implementation, these steps would be implemented with actual code.

    // 1. Create a PeerId from the private key
    final peerId = await _createPeerId();

    // 2. Create a Network with the transports and security protocols
    final network = await _createNetwork(peerId); // Creates Swarm

    // 3. Create a Host with the Network
    final host = await _createHost(network, peerId); // Creates BasicHost, Swarm gets host set.

    // 4. Network listening will be initiated by host.start() if listenAddrs are configured.
    //    Removing direct network.listen() call here to avoid double listening.
    _logger.info('[Config.newNode] for peer ${peerId.toString()}: Host created. Listening will be handled by host.start().');

    return host;
  }

  /// Creates a PeerId from the private key
  Future<concrete_peer_id.PeerId> _createPeerId() async {
    if (peerKey == null) {
      throw Exception('No peer key specified');
    }

    // Create a PeerId from the private key
    // PeerId.fromPrivateKey returns Future<PeerId> (concrete)
    return concrete_peer_id.PeerId.fromPrivateKey(peerKey!.privateKey);
  }

  /// Creates a Network with the transports and security protocols
  Future<Network> _createNetwork(PeerId localPeerId) async {
    // Instantiate dependencies for Swarm
    final Peerstore peerstore = MemoryPeerstore();

    // Add local peer's keys to the keyBook
    if (this.peerKey == null) {
      // This should ideally be caught by _validate() earlier, but as a safeguard:
      throw StateError('Config.peerKey is null when trying to populate KeyBook in _createNetwork.');
    }
    // Ensure localPeerId matches the one derived from this.peerKey.public
    // (localPeerId is derived from this.peerKey.privateKey in _createPeerId, so they should match)
    peerstore.keyBook.addPrivKey(localPeerId, this.peerKey!.privateKey);
    peerstore.keyBook.addPubKey(localPeerId, this.peerKey!.publicKey);
    
    final Limiter limiter = FixedLimiter(); // Or use a Limiter from Config if added later
    final ResourceManager resourceManager = ResourceManagerImpl(limiter: limiter);
    final BasicUpgrader upgrader = BasicUpgrader(resourceManager: resourceManager);

    // Instantiate Swarm
    final Swarm swarm = Swarm(
      host: null, // Will be set later by _createHost via swarm.setHost()
      localPeer: localPeerId,
      peerstore: peerstore,
      resourceManager: resourceManager,
      upgrader: upgrader,
      config: this, // Pass the Config instance itself
      transports: transports, // From this.transports
    );

    return swarm;
  }

  /// Creates a Host with the Network
  Future<Host> _createHost(Network network, PeerId peerId) async {
    // BasicHost expects the Config object itself.
    // The peerId is implicitly available in the Config (this.peerKey)
    // or via network.localPeer() after network is fully initialized.
    // For BasicHost constructor, we only need the network and the config.
    final BasicHost host = await BasicHost.create(network: network, config: this);
    
    // Set the host on the swarm to resolve circular dependency
    if (network is Swarm) {
      network.setHost(host);
    } else {
      // This case should ideally not happen if _createNetwork always returns a Swarm
      // or a Network implementation that supports setHost or similar mechanism.
      _logger.info('Warning: Network is not a Swarm instance, cannot set host on network.');
    }
    
    return host;
  }

  // _startListening method is removed as its functionality is now part of newNode

  /// Validates the configuration
  void _validate() {
    if (peerKey == null) {
      throw Exception('No peer key specified');
    }

    if (insecure && securityProtocols.isNotEmpty) {
      throw Exception('Cannot use security protocols with an insecure configuration');
    }

    if (muxers.isEmpty) {
      throw Exception('No stream multiplexers specified');
    }

    if (transports.isEmpty) {
      throw Exception('No transports specified');
    }

    if (!insecure && securityProtocols.isEmpty) {
      throw Exception('No security protocols specified and insecure is not enabled');
    }

    // Add more validation as needed
  }

}

/// Option is a libp2p config option that can be given to the libp2p constructor.
typedef Option = FutureOr<void> Function(Config config);

/// Extension methods for Config options
extension ConfigOptions on Config {
  /// Configures libp2p to use the given addresses.
  Future<void> withListenAddrs(List<MultiAddr> addrs) async {
    listenAddrs.addAll(addrs);
  }

  /// Configures libp2p to use the given security protocol.
  Future<void> withSecurity(SecurityProtocol securityProtocol) async {
    if (insecure) {
      throw Exception('Cannot use security protocols with an insecure configuration');
    }
    securityProtocols.add(securityProtocol);
  }

  /// Configures libp2p to use no security (insecure connections).
  Future<void> withNoSecurity() async {
    if (securityProtocols.isNotEmpty) {
      throw Exception('Cannot use insecure connections with security protocols configured');
    }
    insecure = true;
  }

  /// Configures libp2p to use the given transport.
  Future<void> withTransport(Transport transport) async {
    transports.add(transport);
  }

  /// Configures libp2p to use the given identity (private key).
  Future<void> withIdentity(KeyPair keyPair) async {
    peerKey = keyPair;
  }

  /// Configures libp2p to use the given user agent.
  Future<void> withUserAgent(String agent) async {
    userAgent = agent;
  }

  Future<void> withReachability(Reachability r) async {
    forceReachability = r;
  }

  Future<void> withAmbientAutoNAT(AmbientAutoNATv2Config conf) async {
    ambientAutoNATConfig = conf;
  }

  /// Configures libp2p to use the given protocol version.
  Future<void> withProtocolVersion(String version) async {
    protocolVersion = version;
  }

  /// Configures libp2p to use the given stream multiplexer.
  Future<void> withMuxer(String id, Multiplexer Function(Conn secureConn, bool isClient) muxerFactory) async {
    muxers.add(StreamMuxer(id: id, muxerFactory: muxerFactory));
  }

  // Options for BasicHost
  Future<void> withNegotiationTimeout(Duration timeout) async {
    negotiationTimeout = timeout;
  }

  Future<void> withAddrsFactory(AddrsFactory factory) async {
    addrsFactory = factory;
  }

  Future<void> withConnManager(ConnManager manager) async {
    connManager = manager;
  }

  Future<void> withEventBus(EventBus bus) async {
    eventBus = bus;
  }

  Future<void> withNatManager(NATManager Function(Network) factory) async {
    natManagerFactory = factory;
  }

  // Options for IdentifyService
  Future<void> withIdentifyUserAgent(String agent) async {
    identifyUserAgent = agent;
  }

  Future<void> withIdentifyProtocolVersion(String version) async {
    identifyProtocolVersion = version;
  }

  Future<void> withIdentifyDisableSignedPeerRecord(bool disable) async {
    disableSignedPeerRecord = disable;
  }

  Future<void> withIdentifyDisableObservedAddrManager(bool disable) async {
    disableObservedAddrManager = disable;
  }

  /// Configures libp2p to enable/disable the Ping service.
  Future<void> withPing(bool enabled) async {
    enablePing = enabled;
  }

  /// Configures libp2p to enable/disable the Relay service.
  Future<void> withRelay(bool enabled) async {
    enableRelay = enabled;
  }

  Future<void> withAutoRelay(bool enabled) async {
    enableAutoRelay = enabled;
  }

  /// Configures libp2p to enable/disable the AutoNAT service.
  Future<void> withAutoNAT(bool enabled) async {
    enableAutoNAT = enabled;
  }

  /// Configures libp2p to enable/disable the Hole Punching service.
  Future<void> withHolePunching(bool enabled) async {
    enableHolePunching = enabled;
  }
  
  /// Configures relay servers to automatically connect to during startup
  Future<void> withRelayServers(List<String> servers) async {
    relayServers = servers;
  }

  // AutoNATv2 specific configuration methods

  /// Configures AutoNATv2 with specific options
  Future<void> withAutoNATv2Options(List<AutoNATv2Option> options) async {
    autoNATv2Options.addAll(options);
  }

  /// Configures AutoNATv2 to allow private addresses (for testing)
  Future<void> withAutoNATv2AllowPrivateAddrs() async {
    autoNATv2Options.add(allowPrivateAddrs());
  }

  /// Configures AutoNATv2 server rate limits
  Future<void> withAutoNATv2ServerRateLimit(int rpm, int perPeerRPM, int dialDataRPM) async {
    autoNATv2Options.add(withServerRateLimit(rpm, perPeerRPM, dialDataRPM));
  }

  /// Configures AutoNATv2 amplification attack prevention dial wait time
  Future<void> withAutoNATv2AmplificationAttackPreventionDialWait(Duration duration) async {
    autoNATv2Options.add(withAmplificationAttackPreventionDialWait(duration));
  }

  /// Configures AutoNATv2 with a custom data request policy
  Future<void> withAutoNATv2DataRequestPolicy(DataRequestPolicyFunc policy) async {
    autoNATv2Options.add(withDataRequestPolicy(policy));
  }

  /// Configures AutoNATv2 with a metrics tracer
  Future<void> withAutoNATv2MetricsTracer(MetricsTracer metricsTracer) async {
    autoNATv2Options.add(withMetricsTracer(metricsTracer));
  }
}

/// Factory functions for creating options
class Libp2p {
  /// Configures libp2p to listen on the given addresses.
  static Option listenAddrs(List<MultiAddr> addrs) {
    return (config) => config.withListenAddrs(addrs);
  }

  /// Configures libp2p to use the given security protocol.
  static Option security(SecurityProtocol securityProtocol) {
    return (config) => config.withSecurity(securityProtocol);
  }

  /// Configures libp2p to use no security (insecure connections).
  static Option noSecurity() {
    return (config) => config.withNoSecurity();
  }

  /// Configures libp2p to use the given transport.
  static Option transport(Transport transport) {
    return (config) => config.withTransport(transport);
  }

  /// Configures libp2p to use the given identity (private key).
  static Option identity(KeyPair keyPair) {
    return (config) => config.withIdentity(keyPair);
  }

  /// Configures libp2p to use the given user agent.
  static Option userAgent(String agent) {
    return (config) => config.withUserAgent(agent);
  }

  static Option forceReachability(Reachability reachability){
    return (config)  => config.withReachability(reachability);
  }

  /// Configures libp2p to use the given protocol version.
  static Option protocolVersion(String version) {
    return (config) => config.withProtocolVersion(version);
  }

  /// Configures libp2p to use the given stream multiplexer.
  static Option muxer(String id, Multiplexer Function(Conn secureConn, bool isClient) muxerFactory) {
    return (config) => config.withMuxer(id, muxerFactory);
  }

  // BasicHost options
  static Option negotiationTimeout(Duration timeout) {
    return (config) => config.withNegotiationTimeout(timeout);
  }

  static Option addrsFactory(AddrsFactory factory) {
    return (config) => config.withAddrsFactory(factory);
  }

  static Option connManager(ConnManager manager) {
    return (config) => config.withConnManager(manager);
  }

  static Option eventBus(EventBus bus) {
    return (config) => config.withEventBus(bus);
  }

  static Option natManager(NATManager Function(Network) factory) {
    return (config) => config.withNatManager(factory);
  }

  // IdentifyService options
  static Option identifyUserAgent(String agent) {
    return (config) => config.withIdentifyUserAgent(agent);
  }

  static Option identifyProtocolVersion(String version) {
    return (config) => config.withIdentifyProtocolVersion(version);
  }

  static Option identifyDisableSignedPeerRecord(bool disable) {
    return (config) => config.withIdentifyDisableSignedPeerRecord(disable);
  }

  static Option identifyDisableObservedAddrManager(bool disable) {
    return (config) => config.withIdentifyDisableObservedAddrManager(disable);
  }

  static Option ambientAutoNATv2Config(AmbientAutoNATv2Config conf){
    return (config) => config.withAmbientAutoNAT(conf);
  }

  /// Configures libp2p to enable/disable the Ping service.
  // ... (other static option methods)

  static Option ping(bool enabled) {
    return (config) => config.withPing(enabled);
  }

  static Option relay(bool enabled) {
    return (config) => config.withRelay(enabled);
  }

  static Option autoRelay(bool enabled) {
    return (config) => config.withAutoRelay(enabled);
  }

  static Option autoNAT(bool enabled) {
    return (config) => config.withAutoNAT(enabled);
  }
  
  static Option relayServers(List<String> servers) {
    return (config) => config.withRelayServers(servers);
  }

  /// Sets the relay metrics observer for tracking relay client operations
  static Option relayMetricsObserver(RelayMetricsObserver observer) {
    return (config) => config.relayMetricsObserver = observer;
  }

  // AutoNATv2 specific options
  
  /// Configures AutoNATv2 with specific options
  static Option autoNATv2Options(List<AutoNATv2Option> options) {
    return (config) => config.withAutoNATv2Options(options);
  }

  /// Configures AutoNATv2 to allow private addresses (for testing)
  static Option autoNATv2AllowPrivateAddrs() {
    return (config) => config.withAutoNATv2AllowPrivateAddrs();
  }

  /// Configures AutoNATv2 server rate limits
  static Option autoNATv2ServerRateLimit(int rpm, int perPeerRPM, int dialDataRPM) {
    return (config) => config.withAutoNATv2ServerRateLimit(rpm, perPeerRPM, dialDataRPM);
  }

  /// Configures AutoNATv2 amplification attack prevention dial wait time
  static Option autoNATv2AmplificationAttackPreventionDialWait(Duration duration) {
    return (config) => config.withAutoNATv2AmplificationAttackPreventionDialWait(duration);
  }

  /// Configures AutoNATv2 with a custom data request policy
  static Option autoNATv2DataRequestPolicy(DataRequestPolicyFunc policy) {
    return (config) => config.withAutoNATv2DataRequestPolicy(policy);
  }

  /// Configures AutoNATv2 with a metrics tracer
  static Option autoNATv2MetricsTracer(MetricsTracer metricsTracer) {
    return (config) => config.withAutoNATv2MetricsTracer(metricsTracer);
  }

  static Option holePunching(bool enabled) {
    return (config) => config.withHolePunching(enabled);
  }

  /// Creates a new Config instance.
  static Config newConfig() {
    return Config();
  }

  /// Creates a new libp2p node with the given options.
  /// 
  /// This is a convenience method that creates a new Config, applies the options,
  /// and calls newNode() on the Config.
  static Future<Host> new_(List<Option> options) async {
    final config = newConfig();
    await config.apply(options);

    // Apply defaults for any options that weren't specified
    await applyDefaults(config);

    // Register core record types
    RecordRegistry.register<pb.PeerRecord>(
      String.fromCharCodes(PeerRecordEnvelopePayloadType),
      pb.PeerRecord.fromBuffer
    );

    return await config.newNode();
  }
}
