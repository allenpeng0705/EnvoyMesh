import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:dcid/dcid.dart';
import 'package:dart_libp2p/dart_libp2p.dart';
import 'package:dart_libp2p/config/config.dart';
import 'package:dart_libp2p/config/defaults.dart';
import 'package:dart_libp2p/core/crypto/ed25519.dart' as crypto_ed25519;
import 'package:dart_libp2p/p2p/discovery/mdns.dart';
import 'package:dart_libp2p/p2p/host/basic/basic_host.dart' as p2p_host;
import 'package:dart_libp2p/p2p/host/resource_manager/limiter.dart';
import 'package:dart_libp2p/p2p/host/resource_manager/resource_manager_impl.dart';
import 'package:dart_libp2p/p2p/protocol/circuitv2/client/reservation.dart';
import 'package:dart_libp2p/p2p/transport/tcp_transport.dart';
import 'package:dart_libp2p_kad_dht/dart_libp2p_kad_dht.dart';
import 'package:envoy_mesh/envoy_mesh.dart';
import 'package:envoy_thin_client/services/web_socket_like.dart';
import 'dart:developer' as developer;
import 'package:meta/meta.dart';

import 'seed_store.dart';


void _log(String message) => developer.log(message, name: 'Libp2pNode');

/// Inbound stream handler for a registered protocol.
typedef Libp2pStreamHandler = Future<void> Function(
  P2PStream stream,
  PeerId remotePeer,
);

/// Testable surface used by [PhoneMeshSession] (shared host mesh controls).
abstract class Libp2pMeshHost {
  bool get isStarted;
  int get hostEpoch;
  Set<String> get registeredProtocols;
  String? get reservedRelayPeerId;

  void registerStreamHandler(String protocolId, Libp2pStreamHandler handler);
  void removeStreamHandler(String protocolId);
  Future<void> reserveRelay(String relayMultiaddr);
  Future<void> releaseRelayReservation();
}

/// A minimal libp2p host for the EnvoyGo thin client **and** phone social-lite.
///
/// Creates a libp2p node with:
/// - TCP transport
/// - Noise XX handshake (X25519 key exchange + ChaChaPoly)
/// - Stream muxing (yamux)
/// - Kademlia DHT client for peer discovery
/// - Circuit relay support for NAT traversal (`enableRelay`)
///
/// Shared host: one PeerId from [Libp2pSeedStore] seed serves (a) client-proxy
/// dial to home and (b) phone-mesh handlers/reservation when Social context is
/// **On this phone**. Envoy owner/device keys are separate (see PhoneIdentityStore).
class Libp2pNode implements Libp2pMeshHost {
  p2p_host.BasicHost? _host;
  IpfsDHT? _dht;
  PeerId? _peerId;
  bool _started = false;
  bool _enableRelay = false;
  final Libp2pSeedStore _seedStore;
  static const _seedKey = 'libp2p_identity_seed';

  /// Protocols currently registered via [registerStreamHandler].
  final Set<String> _registeredProtocols = {};

  /// PeerId string of the relay we last successfully reserved, if any.
  String? _reservedRelayPeerId;

  /// Foreground LAN mDNS (S7) — only while phone discovery is active.
  MdnsDiscovery? _mdns;
  final Map<String, PhoneDiscoveryProvider> _lanPeers = {};
  bool _mdnsActive = false;

  /// Bumped on each successful [start] so sessions can detect host restart.
  int _hostEpoch = 0;

  /// Last bootstrap list (used when restarting for TCP listen).
  List<String> _lastBootstrapAddrs = const [];

  /// True when [start] was asked to open a TCP listen (addrs may lag briefly
  /// after host.start — do not restart just because [hasTcpListenAddrs] is
  /// still false).
  bool _requestedTcpListen = false;

  /// In-flight [start] so warm-start + phone-mesh share one host boot
  /// (concurrent start() used to race with `_started` still false).
  Future<void>? _startInFlight;

  Libp2pNode({required Libp2pSeedStore seedStore}) : _seedStore = seedStore;

  /// The local libp2p peer ID (once started).
  PeerId? get peerId => _peerId;

  /// Whether the node is running.
  @override
  bool get isStarted => _started;

  /// Host generation — increments when the underlying host is (re)started.
  @override
  int get hostEpoch => _hostEpoch;

  /// Whether circuit-relay client transport was enabled at [start].
  bool get relayEnabled => _enableRelay;

  /// Whether foreground mDNS advertise/browse is running (S7).
  bool get mdnsActive => _mdnsActive;

  /// True when the host has a non-circuit TCP listen (needed for mDNS advertise).
  bool get hasTcpListenAddrs {
    final host = _host;
    if (host == null) return false;
    for (final addr in host.addrs) {
      final s = addr.toString();
      if (s.contains('/tcp/') && !s.contains('/p2p-circuit')) return true;
    }
    return false;
  }

  /// PeerId of the active circuit reservation, if any.
  @override
  String? get reservedRelayPeerId => _reservedRelayPeerId;

  /// Snapshot of registered protocol IDs (for tests / debugging).
  @override
  Set<String> get registeredProtocols => Set.unmodifiable(_registeredProtocols);

  /// Load a key pair from [seed], or generate a fresh one.
  Future<KeyPair> _loadOrCreateKeyPair(Uint8List? seed) async {
    if (seed != null) {
      try {
        final privKey = await crypto_ed25519.Ed25519PrivateKey.fromRawBytes(seed);
        return KeyPair(privKey.publicKey, privKey);
      } catch (_) {
        // Seed corrupted — fall through to generate fresh.
      }
    }
    return crypto_ed25519.generateEd25519KeyPair();
  }

  /// Start the libp2p host with DHT support.
  ///
  /// [listenAddrs] are multiaddrs to listen on, e.g. `/ip4/0.0.0.0/tcp/0`.
  /// Pass an empty list for no TCP listener (circuit inbound still works when
  /// [enableRelay] is true — dart_libp2p listens on `/p2p-circuit`).
  /// [bootstrapAddrs] are DHT bootstrap peer multiaddrs to connect to.
  /// These peers are also used as circuit relay hops when dialing through
  /// `/p2p-circuit/` addresses.
  ///
  /// [enableRelay] must be true for dart_libp2p `CircuitV2Client` (home circuit
  /// dials + phone mesh reservation). Default true.
  Future<void> start({
    List<String> listenAddrs = const [],
    List<String> bootstrapAddrs = const [],
    bool enableRelay = true,
  }) async {
    if (_started) return;
    final inFlight = _startInFlight;
    if (inFlight != null) {
      await inFlight;
      return;
    }

    final done = Completer<void>();
    _startInFlight = done.future;
    try {
      await _startUnlocked(
        listenAddrs: listenAddrs,
        bootstrapAddrs: bootstrapAddrs,
        enableRelay: enableRelay,
      );
      done.complete();
    } catch (e, st) {
      done.completeError(e, st);
      rethrow;
    } finally {
      _startInFlight = null;
    }
  }

  Future<void> _startUnlocked({
    required List<String> listenAddrs,
    required List<String> bootstrapAddrs,
    required bool enableRelay,
  }) async {
    if (_started) return;

    _lastBootstrapAddrs = List<String>.from(bootstrapAddrs);
    _requestedTcpListen = listenAddrs.isNotEmpty;

    // Load persisted seed or generate a new one.
    // The seed is stored rather than the full keypair so it can be
    // reconstructed without needing the KeyPair type to be serializable.
    Uint8List? seed;
    try {
      final stored = await _seedStore.read(_seedKey);
      if (stored != null && stored.length == 32) {
        seed = Uint8List.fromList(stored.codeUnits);
      }
    } catch (_) {
      // Corrupt or missing seed — generate fresh below.
    }

    // Load or generate the Ed25519 key pair.
    // On first boot no seed exists so we generate a fresh pair and persist
    // the seed. On subsequent boots the seed is restored to yield the same
    // libp2p peer ID.
    final KeyPair keyPair = await _loadOrCreateKeyPair(seed);

    // Persist the raw seed so the same peer ID is restored on the next start.
    try {
      final rawSeed = (keyPair.privateKey as dynamic).raw as Uint8List;
      await _seedStore.write(_seedKey, String.fromCharCodes(rawSeed));
    } catch (_) {}

    // Use the Config API (dart_libp2p 1.0.x).
    // applyDefaults() sets up NoiseSecurity, Yamux, AutoNAT, etc.
    // We must explicitly add TcpTransport with a ResourceManager —
    // applyDefaults() does NOT add transports.
    final resourceManager = ResourceManagerImpl(limiter: FixedLimiter());
    final config = Config()
      ..peerKey = keyPair
      ..transports.add(TCPTransport(resourceManager: resourceManager))
      ..enableRelay = enableRelay;

    if (listenAddrs.isNotEmpty) {
      config.listenAddrs = listenAddrs.map((a) => MultiAddr(a)).toList();
    }

    await applyDefaults(config);
    // applyDefaults() forces enableAutoNAT=true. Ambient AutoNAT then probes
    // public bootstraps (e.g. am6.bootstrap.libp2p.io) during host.start() and
    // can stall cold start for tens of seconds even when cn-relay RTT is ~10ms.
    // Phone mesh only needs TCP + circuit relay to our community relays.
    config.enableRelay = enableRelay;
    config.enableAutoNAT = false;
    config.enableHolePunching = false;
    _enableRelay = enableRelay;

    final sw = Stopwatch()..start();
    _host = await config.newNode() as p2p_host.BasicHost;
    _log('[Libp2pNode] newNode ${sw.elapsedMilliseconds}ms');
    await _host!.start();
    _log('[Libp2pNode] host.start ${sw.elapsedMilliseconds}ms');
    _peerId = _host!.id;
    _started = true;
    _hostEpoch++;

    // DHT join is useful for Discover but must not block "Connected".
    unawaited(_startDhtAndBootstrap(bootstrapAddrs, sw));
    _log(
      '[Libp2pNode] Host ready in ${sw.elapsedMilliseconds}ms '
      '(peerId=$_peerId, bootstrap deferred)',
    );
  }

  Future<void> _startDhtAndBootstrap(
    List<String> bootstrapAddrs,
    Stopwatch sw,
  ) async {
    try {
      _dht = IpfsDHT(
        host: _host!,
        providerStore: MemoryProviderStore(),
        options: DHTOptions(mode: DHTMode.client),
      );
      await _dht!.start();
      _log('[Libp2pNode] DHT start ${sw.elapsedMilliseconds}ms');
    } catch (e) {
      _log('[Libp2pNode] DHT start failed: $e');
      return;
    }

    final boot = filterLibp2pTcpBootstrapAddrs(bootstrapAddrs);
    if (boot.isNotEmpty) {
      unawaited(_connectBootstrapPeersInBackground(boot));
    }
    try {
      final rtSize = await _dht!.routingTable.size();
      _log('[Libp2pNode] DHT routing table size: $rtSize');
    } catch (_) {}
  }

  /// Prefer the Asia community relay when present; otherwise the first addr.
  String? _pickPrimaryBootstrap(List<String> addrs) {
    if (addrs.isEmpty) return null;
    if (addrs.contains(defaultEnvoyCommunityRelayBootstrapAddr)) {
      return defaultEnvoyCommunityRelayBootstrapAddr;
    }
    return addrs.first;
  }

  Future<bool> _connectBootstrapPeer(
    String addrStr, {
    Duration timeout = const Duration(seconds: 4),
  }) async {
    try {
      final addr = MultiAddr(addrStr);
      final relayPeerIdStr = addr.valueForProtocol('p2p');
      if (relayPeerIdStr == null) return false;
      final peerId = PeerId.fromString(relayPeerIdStr);
      _log('[Libp2pNode] Connecting to bootstrap peer: $addrStr');
      await _host!
          .connect(
            AddrInfo(peerId, [addr]),
            context: Context(),
          )
          .timeout(timeout);
      await _dht!.routingTable.tryAddPeer(peerId, queryPeer: true);
      _log('[Libp2pNode] Bootstrap peer connected: $addrStr');
      return true;
    } catch (e) {
      _log('[Libp2pNode] Bootstrap peer FAILED: $addrStr — $e');
      return false;
    }
  }

  Future<void> _connectBootstrapPeersInBackground(List<String> addrs) async {
    final primary = _pickPrimaryBootstrap(addrs);
    final ordered = <String>[
      if (primary != null) primary,
      for (final a in addrs)
        if (a != primary) a,
    ];
    for (final addrStr in ordered) {
      if (!_started) return;
      await _connectBootstrapPeer(addrStr);
    }
  }

  /// Find a peer by their PeerId via DHT query.
  ///
  /// Returns the peer's address info if found, or null if not found.
  /// This enables direct peer discovery without needing a relay server.
  Future<AddrInfo?> findPeer(PeerId targetPeerId) async {
    if (_dht == null || !_started) return null;
    try {
      final rtSize = await _dht!.routingTable.size();
      _log('[Libp2pNode.findPeer] peerId=${targetPeerId.toString()}, routingTableSize=$rtSize');
      if (rtSize == 0) {
        _log('[Libp2pNode.findPeer] WARNING: routing table is EMPTY — DHT has no peers. '
            'findPeer will definitely return 0 addresses. '
            'Check if bootstrap connections succeeded.');
      }
      final result = await _dht!.findPeer(targetPeerId);
      _log('[Libp2pNode.findPeer] result addrs=${result?.addrs.length ?? 0}');
      if (result != null) {
        for (final addr in result.addrs) {
          _log('[Libp2pNode.findPeer] addr: ${addr.toString()}');
        }
      }
      return result;
    } catch (e) {
      _log('[Libp2pNode.findPeer] ERROR: $e');
      return null;
    }
  }

  /// Dial a peer and open a stream for [protocolId].
  ///
  /// Returns a duplex stream wrapper that can be used like a WebSocket.
  /// [peerMultiaddr] is the target peer's multiaddr, e.g.
  /// - Direct: `/p2p/<peerId>`
  /// - Circuit relay: `/p2p/<relayPeerId>/p2p-circuit/p2p/<homePeerId>`
  Future<Libp2pStreamTransport> dial({
    required String peerMultiaddr,
    String protocolId = '/envoymesh/rpc/1.0.0',
  }) async {
    if (_host == null) throw StateError('Libp2pNode not started');

    final addr = MultiAddr(peerMultiaddr);
    final circuitAddr = addr.valueForProtocol('p2p-circuit');

    if (circuitAddr != null) {
      // Circuit relay dial: the multiaddr is like
      //   /p2p/<relayPeerId>/p2p-circuit/p2p/<homePeerId>
      final relayPeerIdStr = addr.valueForProtocol('p2p');
      if (relayPeerIdStr == null) {
        throw ArgumentError('Invalid circuit relay address: $peerMultiaddr');
      }
      final relayPeerId = PeerId.fromString(relayPeerIdStr);

      // The destination peer ID is encoded in the /p2p-circuit/p2p/ suffix.
      final homePeerIdStr = _extractPeerIdAfterCircuit(peerMultiaddr);
      if (homePeerIdStr == null) {
        throw ArgumentError('Invalid circuit relay address (missing destination): $peerMultiaddr');
      }
      final homePeerId = PeerId.fromString(homePeerIdStr);

      // Connect to the relay peer with the circuit address.
      await _host!.connect(
        AddrInfo(relayPeerId, [addr]),
        context: Context(),
      );

      // Open a stream to the home peer through the established circuit.
      final stream = await _host!.newStream(
        homePeerId,
        [protocolId], // ProtocolID is a typedef String
        Context(),
      );
      return Libp2pStreamTransport(stream);
    } else {
      // Direct dial: multiaddr is /p2p/<peerId> or /ip4/.../tcp/.../p2p/<peerId>
      final peerIdStr = addr.valueForProtocol('p2p');
      if (peerIdStr == null) {
        throw ArgumentError('Invalid peer multiaddr (no /p2p/ component): $peerMultiaddr');
      }
      final peerId = PeerId.fromString(peerIdStr);

      final stream = await _host!.newStream(
        peerId,
        [protocolId],
        Context(),
      );
      return Libp2pStreamTransport(stream);
    }
  }

  /// Extract the peer ID after /p2p-circuit/p2p/ in a circuit relay multiaddr.
  String? _extractPeerIdAfterCircuit(String multiaddr) {
    final lastP2p = multiaddr.lastIndexOf('/p2p/');
    if (lastP2p < 0) return null;
    return multiaddr.substring(lastP2p + 5);
  }

  /// Register an inbound handler for [protocolId] (e.g. chat / message).
  ///
  /// Replaces any previous handler for the same protocol on this host.
  @override
  void registerStreamHandler(String protocolId, Libp2pStreamHandler handler) {
    if (_host == null) throw StateError('Libp2pNode not started');
    _host!.setStreamHandler(protocolId, (stream, remotePeer) async {
      await handler(stream, remotePeer);
    });
    _registeredProtocols.add(protocolId);
    _log('[Libp2pNode] registered handler: $protocolId');
  }

  /// Remove a previously registered protocol handler.
  @override
  void removeStreamHandler(String protocolId) {
    if (_host == null) return;
    _host!.removeStreamHandler(protocolId);
    _registeredProtocols.remove(protocolId);
    _log('[Libp2pNode] removed handler: $protocolId');
  }

  /// Remove all handlers registered via [registerStreamHandler].
  void removeAllStreamHandlers() {
    for (final protocolId in List<String>.from(_registeredProtocols)) {
      removeStreamHandler(protocolId);
    }
  }

  /// Reserve a circuit-relay v2 slot on [relayMultiaddr] (community relay).
  ///
  /// Requires [enableRelay] true at [start]. Connects to the relay first if needed.
  @override
  Future<void> reserveRelay(String relayMultiaddr) async {
    if (_host == null) throw StateError('Libp2pNode not started');
    final client = _host!.circuitV2Client;
    if (client == null) {
      throw StateError(
        'CircuitV2Client unavailable — start Libp2pNode with enableRelay: true',
      );
    }
    final relayPeerIdStr = peerIdFromBootstrapMultiaddr(relayMultiaddr);
    if (relayPeerIdStr == null) {
      throw ArgumentError('Invalid relay multiaddr (no /p2p/): $relayMultiaddr');
    }
    final relayPeerId = PeerId.fromString(relayPeerIdStr);
    final addr = MultiAddr(relayMultiaddr);
    try {
      await _host!.connect(
        AddrInfo(relayPeerId, [addr]),
        context: Context(),
      );
    } catch (e) {
      _log('[Libp2pNode] relay connect before reserve: $e');
      // continue — reserve may still work if already connected
    }
    await client.reserve(relayPeerId);
    _reservedRelayPeerId = relayPeerIdStr;
    _log('[Libp2pNode] reserved relay: $relayPeerIdStr');
  }

  /// Clear local reservation tracking.
  ///
  /// dart_libp2p does not expose an explicit unreserve API; dropping the
  /// tracked id means we will re-reserve on next [reserveRelay]. Relay slots
  /// expire server-side on TTL.
  @override
  Future<void> releaseRelayReservation() async {
    if (_reservedRelayPeerId != null) {
      _log(
        '[Libp2pNode] releasing relay reservation tracking: $_reservedRelayPeerId',
      );
    }
    _reservedRelayPeerId = null;
  }

  /// Circuit multiaddrs safe to publish in `relay.checkin`.
  ///
  /// Format: `/p2p/<relayPeerId>/p2p-circuit/p2p/<localPeerId>` when a
  /// reservation is tracked; otherwise empty (checkin still carries topics).
  List<String> relayAdvertisedMultiaddrs() {
    final local = _peerId?.toString();
    final relay = _reservedRelayPeerId;
    if (local == null || relay == null) return const [];
    return ['/p2p/$relay/p2p-circuit/p2p/$local'];
  }

  /// DHT provide for an Envoy capability topic (CID parity with desktop).
  Future<void> provideCapabilityTopic(String topic) async {
    if (_dht == null || !_started) {
      throw StateError('Libp2pNode DHT not started');
    }
    final cid = CID.fromString(cidStringForCapabilityTopic(topic));
    await _dht!.provide(cid, true);
    _log('[Libp2pNode] provided topic=$topic cid=${cid.toString()}');
  }

  /// DHT findProviders for a capability topic.
  ///
  /// Bounded like desktop `queryTimeoutMs` — dart_libp2p streams can hang
  /// forever when the routing table is empty or the WAN is flaky.
  Future<List<PhoneDiscoveryProvider>> findCapabilityTopicProviders(
    String topic, {
    int maxResults = 20,
    Duration timeout = const Duration(seconds: 12),
  }) async {
    if (_dht == null || !_started) return const [];
    final cid = CID.fromString(cidStringForCapabilityTopic(topic));
    final out = <PhoneDiscoveryProvider>[];
    final seen = <String>{};
    try {
      await for (final info in _dht!
          .findProvidersAsync(cid, maxResults)
          .timeout(timeout)) {
        final id = info.id.toString();
        if (!seen.add(id)) continue;
        out.add(PhoneDiscoveryProvider(
          peerId: id,
          multiaddrs: info.addrs.map((a) => a.toString()).toList(),
        ));
        if (out.length >= maxResults) break;
      }
    } on TimeoutException {
      _log(
        '[Libp2pNode] findProviders($topic) timed out after ${timeout.inSeconds}s '
        '(${out.length} providers)',
      );
    } catch (e) {
      _log('[Libp2pNode] findProviders($topic) failed: $e');
    }
    return out;
  }

  /// Snapshot of peers learned via mDNS while discovery is active.
  List<PhoneDiscoveryProvider> lanDiscoveredPeers({int maxResults = 32}) {
    final list = _lanPeers.values.toList(growable: false);
    if (list.length <= maxResults) return list;
    return list.take(maxResults).toList(growable: false);
  }

  /// Start libp2p mDNS advertise + browse (foreground phone Social only).
  ///
  /// Requires a TCP listen address on the host — otherwise advertise is a
  /// no-op inside dart_libp2p (`host.addrs` empty). Prefer calling
  /// [ensureTcpListen] first.
  Future<void> enableMdns() async {
    if (!_started || _host == null) {
      throw StateError('Libp2pNode must be started before enableMdns');
    }
    if (_mdnsActive) return;
    if (!hasTcpListenAddrs) {
      _log(
        '[Libp2pNode] enableMdns skipped — no TCP listen (call ensureTcpListen)',
      );
      return;
    }
    try {
      final mdns = MdnsDiscovery(_host!);
      mdns.notifee = _Libp2pLanNotifee(this);
      await mdns.start();
      _mdns = mdns;
      _mdnsActive = true;
      _log(
        '[Libp2pNode] mDNS started (listenAddrs=${_host!.addrs.length})',
      );
    } catch (e) {
      _log('[Libp2pNode] enableMdns failed: $e');
      rethrow;
    }
  }

  /// Ensure a TCP listen is active (restarts the host if started without one).
  ///
  /// Keeps the same identity seed / PeerId. Callers must re-bind mesh
  /// handlers after a restart ([hostEpoch] increments).
  Future<void> ensureTcpListen({
    List<String> listenAddrs = const ['/ip4/0.0.0.0/tcp/0'],
    List<String>? bootstrapAddrs,
    bool enableRelay = true,
  }) async {
    final boot = bootstrapAddrs ?? _lastBootstrapAddrs;
    // Join an in-flight boot before deciding whether to restart.
    final inFlight = _startInFlight;
    if (inFlight != null) {
      await inFlight;
    }
    // Already listening, or we already requested TCP listen and the host is
    // up (addrs can take a moment to appear — restarting here caused endless
    // "Starting phone mesh…" on EnvoyGo).
    if (_started && (hasTcpListenAddrs || _requestedTcpListen)) return;
    if (_started && !hasTcpListenAddrs && !_requestedTcpListen) {
      _log(
        '[Libp2pNode] restarting host with TCP listen for LAN mDNS',
      );
      await stop();
    }
    await start(
      listenAddrs: listenAddrs,
      bootstrapAddrs: boot,
      enableRelay: enableRelay,
    );
  }

  /// Stop mDNS and clear the LAN peer cache.
  Future<void> disableMdns() async {
    final mdns = _mdns;
    _mdns = null;
    _mdnsActive = false;
    _lanPeers.clear();
    if (mdns == null) return;
    try {
      await mdns.stop();
      _log('[Libp2pNode] mDNS stopped');
    } catch (e) {
      _log('[Libp2pNode] disableMdns failed: $e');
    }
  }

  void _onLanPeerFound(AddrInfo peer) {
    final id = peer.id.toString();
    if (_peerId != null && id == _peerId.toString()) return;
    final addrs = peer.addrs.map((a) => a.toString()).toList();
    final prev = _lanPeers[id];
    final merged = <String>{
      ...?prev?.multiaddrs,
      ...addrs,
    }.toList();
    _lanPeers[id] = PhoneDiscoveryProvider(peerId: id, multiaddrs: merged);
    _log('[Libp2pNode] mDNS peer found: $id addrs=${merged.length}');
    // Keep dialable LAN paths in the peerstore for subsequent mesh dials.
    unawaited(() async {
      try {
        await _host?.peerStore.addrBook.addAddrs(
          peer.id,
          peer.addrs,
          const Duration(minutes: 10),
        );
      } catch (e) {
        _log('[Libp2pNode] peerStore addAddrs failed: $e');
      }
    }());
  }

  /// Test seam: inject a LAN peer as if mDNS found it.
  @visibleForTesting
  void debugInjectLanPeer(PhoneDiscoveryProvider peer) {
    if (peer.peerId.isEmpty) return;
    _lanPeers[peer.peerId] = peer;
  }

  /// Stop the host and release all resources.
  Future<void> stop() async {
    removeAllStreamHandlers();
    await disableMdns();
    await releaseRelayReservation();
    if (_dht != null) {
      await _dht!.close();
      _dht = null;
    }
    if (_host != null) {
      await _host!.close();
      _host = null;
    }
    _started = false;
    _enableRelay = false;
    _requestedTcpListen = false;
  }
}

class _Libp2pLanNotifee implements MdnsNotifee {
  _Libp2pLanNotifee(this._node);

  final Libp2pNode _node;

  @override
  void handlePeerFound(AddrInfo peer) => _node._onLanPeerFound(peer);
}

/// A WebSocket-like wrapper around a libp2p [P2PStream].
///
/// Implements [WebSocketLike] so it can be used as a drop-in replacement
/// for WebSocket transport in [HomeRemoteClient].
///
/// Incoming data: [P2PStream.read] → delivered as WsMessageEvent.
/// Outgoing data: written via [P2PStream.write] → forwarded to peer.
///
/// For the client-proxy protocol (circuit relay), call [performHandshake]
/// after construction to complete the proxy-connect authentication
/// before normal message dispatch begins.
class Libp2pStreamTransport implements WebSocketLike {
  final P2PStream<dynamic> _stream;

  /// Completes when the handshake is done and the transport is ready.
  /// Until then, onOpen is not fired and incoming messages are buffered.
  Completer<void>? _handshakeCompleter;

  /// Buffers messages received before the handshake completes.
  final _pendingMessages = <String>[];

  /// Whether the transport has completed its setup phase (handshake or
  /// immediate-open) and is now in normal message mode.
  bool _messageMode = false;

  @override
  int readyState = wsConnecting;

  @override
  void Function()? onOpen;

  @override
  void Function(WsMessageEvent event)? onMessage;

  @override
  void Function()? onClose;

  @override
  void Function()? onError;

  Libp2pStreamTransport(this._stream);

  /// Underlying libp2p stream (one-shot mesh envelope I/O without WS mode).
  P2PStream get rawStream => _stream;

  /// Perform the client-proxy handshake over this stream.
  ///
  /// Sends `{ type: "proxy-connect", token }` as the first message,
  /// waits for `{ type: "proxy-accept" }` or `{ type: "proxy-reject" }`,
  /// then marks the transport as open and begins normal message dispatch.
  ///
  /// Throws if the handshake fails or is rejected.
  Future<void> performHandshake(String token) async {
    if (_handshakeCompleter != null) {
      throw StateError('Handshake already performed');
    }
    _handshakeCompleter = Completer<void>();

    // Send proxy-connect handshake.
    _stream.write(Uint8List.fromList(utf8.encode(
        jsonEncode({'type': 'proxy-connect', 'token': token}))));

    // Wait for proxy-accept / proxy-reject as the first message.
    final firstBytes = await _stream.read();
    if (firstBytes.isEmpty) {
      // ignore: definite assignment — throw prevents further use
      _handshakeCompleter!.completeError(
          Exception('Connection closed during handshake'));
      throw Exception('Connection closed during handshake');
    }

    final firstText = utf8.decode(firstBytes.toList());
    Map<String, dynamic>? msg;
    try {
      msg = jsonDecode(firstText) as Map<String, dynamic>;
    } catch (_) {
      _handshakeCompleter!.completeError(
          Exception('Invalid handshake response: $firstText'));
      throw Exception('Invalid handshake response: $firstText');
    }

    if (msg['type'] == 'proxy-reject') {
      final reason = msg['reason'] as String? ?? 'unknown';
      _handshakeCompleter!.completeError(Exception('Proxy rejected: $reason'));
      throw Exception('Proxy rejected: $reason');
    }

    if (msg['type'] != 'proxy-accept') {
      // Could be a home-tunnel "connected" / "tunnel-up" event.
      if (msg['event'] == 'connected' || msg['event'] == 'tunnel-up') {
        // Treat as accept.
      } else {
        _handshakeCompleter!.completeError(
            Exception('Unexpected handshake message: $msg'));
        throw Exception('Unexpected handshake message: $msg');
      }
    }

    // Handshake succeeded. Mark as open and dispatch buffered messages.
    readyState = wsOpen;
    _messageMode = true;

    // Deliver any messages that arrived before we entered message mode.
    for (final pending in _pendingMessages) {
      onMessage?.call(WsMessageEvent(pending));
    }
    _pendingMessages.clear();

    _handshakeCompleter!.complete();
    // Fire onOpen, then re-emit `connected` so HomeRemoteClient can gate
    // RPCs (handshake already consumed the home/relay ready signal).
    Future.microtask(() {
      onOpen?.call();
      onMessage?.call(WsMessageEvent(jsonEncode({
        'event': 'connected',
        'data': {'libp2pProxied': true},
      })));
    });

    // Start the normal message dispatch loop.
    _readLoop();
  }

  /// Mark the transport as immediately open (no handshake required).
  /// Used for direct libp2p connections that don't need client-proxy auth.
  void markImmediatelyOpen() {
    if (_handshakeCompleter != null) return; // Already in handshake mode.
    readyState = wsOpen;
    _messageMode = true;
    Future.microtask(() => onOpen?.call());
    _readLoop();
  }

  /// Continuously read from the P2PStream and deliver data via onMessage.
  /// Before [performHandshake] completes, messages are buffered.
  Future<void> _readLoop() async {
    try {
      while (readyState == wsOpen) {
        final data = await _stream.read();
        if (data.isEmpty) break;
        final text = utf8.decode(data.toList());

        if (!_messageMode) {
          // Still in handshake phase — buffer any messages that arrive
          // (e.g. events before proxy-accept). The handshake response was
          // already consumed by performHandshake(), so this handles any
          // race-between-reads.
          _pendingMessages.add(text);
          continue;
        }

        onMessage?.call(WsMessageEvent(text));
      }
    } catch (_) {
      // Read error — stream closed or protocol error.
    } finally {
      if (readyState == wsOpen) {
        readyState = wsClosed;
        onClose?.call();
      }
    }
  }

  @override
  void send(String data) {
    if (readyState == wsOpen) {
      _stream.write(Uint8List.fromList(utf8.encode(data)));
    }
  }

  @override
  void close() {
    if (readyState == wsOpen) {
      readyState = wsClosing;
      _stream.close();
      readyState = wsClosed;
    }
  }
}
