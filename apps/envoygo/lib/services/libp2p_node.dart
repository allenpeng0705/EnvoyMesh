import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/foundation.dart';
import 'package:dart_libp2p/dart_libp2p.dart';
import 'package:dart_libp2p_kad_dht/dart_libp2p_kad_dht.dart';
import 'package:dart_libp2p/p2p/host/basic/basic_host.dart' as p2p_host;
import 'package:dart_libp2p/config/config.dart';
import 'package:dart_libp2p/config/defaults.dart';
import 'package:dart_libp2p/core/crypto/ed25519.dart' as crypto_ed25519;
import 'package:dart_libp2p/p2p/transport/tcp_transport.dart';
import 'package:dart_libp2p/p2p/host/resource_manager/resource_manager_impl.dart';
import 'package:dart_libp2p/p2p/host/resource_manager/limiter.dart';
import 'package:envoygo/storage/secure_storage.dart';
import 'web_socket_like.dart';

/// A minimal libp2p host for the EnvoyGo thin client.
///
/// Creates a libp2p node with:
/// - TCP transport
/// - Noise XX handshake (X25519 key exchange + ChaChaPoly)
/// - Stream muxing (yamux)
/// - Kademlia DHT client for peer discovery
/// - Circuit relay support for NAT traversal
///
/// The node maintains its own Ed25519 peer identity. On first startup it
/// generates a key pair and persists the seed to [secureStorage]. On
/// subsequent runs it loads the seed and recreates the same peer ID, so the
/// home node can find this mobile via DHT and dial it back directly.
class Libp2pNode {
  p2p_host.BasicHost? _host;
  IpfsDHT? _dht;
  PeerId? _peerId;
  bool _started = false;
  final SecureStorage _secureStorage;
  static const _seedKey = 'libp2p_identity_seed';

  Libp2pNode({required SecureStorage secureStorage})
      : _secureStorage = secureStorage;

  /// The local libp2p peer ID (once started).
  PeerId? get peerId => _peerId;

  /// Whether the node is running.
  bool get isStarted => _started;

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
  /// Pass an empty list for client-only mode (no listening).
  /// [bootstrapAddrs] are DHT bootstrap peer multiaddrs to connect to.
  /// These peers are also used as circuit relay hops when dialing through
  /// `/p2p-circuit/` addresses.
  Future<void> start({
    List<String> listenAddrs = const [],
    List<String> bootstrapAddrs = const [],
  }) async {
    if (_started) return;

    // Load persisted seed or generate a new one.
    // The seed is stored rather than the full keypair so it can be
    // reconstructed without needing the KeyPair type to be serializable.
    Uint8List? seed;
    try {
      final stored = await _secureStorage.read(_seedKey);
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
      await _secureStorage.write(_seedKey, String.fromCharCodes(rawSeed));
    } catch (_) {}

    // Use the Config API (dart_libp2p 1.0.x).
    // applyDefaults() sets up NoiseSecurity, Yamux, AutoNAT, etc.
    // We must explicitly add TcpTransport with a ResourceManager —
    // applyDefaults() does NOT add transports.
    final resourceManager = ResourceManagerImpl(limiter: FixedLimiter());
    final config = Config()
      ..peerKey = keyPair
      ..transports.add(TCPTransport(resourceManager: resourceManager));

    if (listenAddrs.isNotEmpty) {
      config.listenAddrs = listenAddrs.map((a) => MultiAddr(a)).toList();
    }

    await applyDefaults(config);

    _host = await config.newNode() as p2p_host.BasicHost;
    await _host!.start();
    _peerId = _host!.id;
    _started = true;

    // Initialize DHT client for peer discovery.
    // DHTMode.client means we query the DHT but don't respond to other peers' queries.
    _dht = IpfsDHT(
      host: _host!,
      providerStore: MemoryProviderStore(),
      options: DHTOptions(mode: DHTMode.client),
    );
    await _dht!.start();

    // Connect to DHT bootstrap peers to join the DHT network.
    int connectedCount = 0;
    for (final addrStr in bootstrapAddrs) {
      try {
        final addr = MultiAddr(addrStr);
        final relayPeerIdStr = addr.valueForProtocol('p2p');
        if (relayPeerIdStr != null) {
          final peerId = PeerId.fromString(relayPeerIdStr);
          debugPrint('[Libp2pNode] Connecting to bootstrap peer: $addrStr');
          await _host!.connect(
            AddrInfo(peerId, [addr]),
            context: Context(),
          );
          await _dht!.routingTable.tryAddPeer(peerId, queryPeer: true);
          connectedCount++;
          debugPrint('[Libp2pNode] Bootstrap peer connected: $addrStr');
        }
      } catch (e) {
        debugPrint('[Libp2pNode] Bootstrap peer FAILED: $addrStr — $e');
        // Ignore individual bootstrap peer failures.
      }
    }
    debugPrint('[Libp2pNode] Bootstrap: $connectedCount/${bootstrapAddrs.length} peers connected');

    // Give the DHT a moment to establish connections with bootstrap peers
    // before we try to query. Without this, findPeer() immediately after start()
    // may return null because the routing table hasn't converged yet.
    await Future<void>.delayed(const Duration(milliseconds: 10_000));
    // ignore: dart SDK print — debug only
    try {
      final rtSize = await _dht!.routingTable.size();
      debugPrint('[Libp2pNode] DHT started, routing table size: $rtSize');
    } catch (_) {}
  }

  /// Find a peer by their PeerId via DHT query.
  ///
  /// Returns the peer's address info if found, or null if not found.
  /// This enables direct peer discovery without needing a relay server.
  Future<AddrInfo?> findPeer(PeerId targetPeerId) async {
    if (_dht == null || !_started) return null;
    try {
      final rtSize = await _dht!.routingTable.size();
      debugPrint('[Libp2pNode.findPeer] peerId=${targetPeerId.toString()}, routingTableSize=$rtSize');
      if (rtSize == 0) {
        debugPrint('[Libp2pNode.findPeer] WARNING: routing table is EMPTY — DHT has no peers. '
            'findPeer will definitely return 0 addresses. '
            'Check if bootstrap connections succeeded.');
      }
      final result = await _dht!.findPeer(targetPeerId);
      debugPrint('[Libp2pNode.findPeer] result addrs=${result?.addrs.length ?? 0}');
      if (result != null) {
        for (final addr in result.addrs) {
          debugPrint('[Libp2pNode.findPeer] addr: ${addr.toString()}');
        }
      }
      return result;
    } catch (e) {
      debugPrint('[Libp2pNode.findPeer] ERROR: $e');
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

  /// Stop the host and release all resources.
  Future<void> stop() async {
    if (_dht != null) {
      await _dht!.close();
      _dht = null;
    }
    if (_host != null) {
      await _host!.close();
      _host = null;
    }
    _started = false;
  }
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
    // Fire onOpen so HomeRemoteClient knows the transport is ready.
    Future.microtask(() => onOpen?.call());

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
