import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:dart_libp2p/dart_libp2p.dart';
import 'package:dart_libp2p_kad_dht/dart_libp2p_kad_dht.dart';
import 'package:dart_libp2p/p2p/host/basic/basic_host.dart' as p2p_host;
import 'package:dart_libp2p/config/config.dart';
import 'package:dart_libp2p/config/defaults.dart';
import 'package:dart_libp2p/core/crypto/ed25519.dart' as crypto_ed25519;
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
/// The node maintains its own Ed25519 peer identity, generated on first
/// startup. This identity is NOT the owner's identity — it's a separate
/// peer ID used only for libp2p transport.
class Libp2pNode {
  p2p_host.BasicHost? _host;
  IpfsDHT? _dht;
  PeerId? _peerId;
  bool _started = false;

  /// The local libp2p peer ID (once started).
  PeerId? get peerId => _peerId;

  /// Whether the node is running.
  bool get isStarted => _started;

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

    // Generate a random Ed25519 key pair for this peer.
    // In production, store the key in secure storage and reuse it.
    final keyPair = await crypto_ed25519.generateEd25519KeyPair();

    // Use the Config API (dart_libp2p 1.0.x).
    // applyDefaults() sets up NoiseSecurity, TCP, Yamux, AutoNAT, etc.
    final config = Config()
      ..peerKey = keyPair;

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
    for (final addrStr in bootstrapAddrs) {
      try {
        final addr = MultiAddr(addrStr);
        final relayPeerIdStr = addr.valueForProtocol('p2p');
        if (relayPeerIdStr != null) {
          final peerId = PeerId.fromString(relayPeerIdStr);
          await _host!.connect(
            AddrInfo(peerId, [addr]),
            context: Context(),
          );
          await _dht!.routingTable.tryAddPeer(peerId, queryPeer: false);
        }
      } catch (_) {
        // Ignore individual bootstrap peer failures.
      }
    }
  }

  /// Find a peer by their PeerId via DHT query.
  ///
  /// Returns the peer's address info if found, or null if not found.
  /// This enables direct peer discovery without needing a relay server.
  Future<AddrInfo?> findPeer(PeerId targetPeerId) async {
    if (_dht == null || !_started) return null;
    try {
      return await _dht!.findPeer(targetPeerId);
    } catch (_) {
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
class Libp2pStreamTransport implements WebSocketLike {
  final P2PStream<dynamic> _stream;
  StreamSubscription<Uint8List>? _subscription;

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

  Libp2pStreamTransport(this._stream) {
    // Mark as open immediately — the stream is already established.
    // Fire onOpen in the next microtask so callers can install handlers first.
    readyState = wsOpen;
    Future.microtask(() => onOpen?.call());

    // Start a background task to read from the stream and deliver messages.
    _readLoop();
  }

  /// Continuously read from the P2PStream and deliver data via onMessage.
  Future<void> _readLoop() async {
    try {
      while (readyState == wsOpen) {
        final data = await _stream.read();
        if (data.isEmpty) break;
        final text = utf8.decode(data.toList());
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
      _subscription?.cancel();
      _stream.close();
      readyState = wsClosed;
    }
  }
}
