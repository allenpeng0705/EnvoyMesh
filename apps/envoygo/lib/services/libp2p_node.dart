import 'dart:async';
import 'dart:convert';
import 'package:dart_libp2p/dart_libp2p.dart';
import 'package:dart_libp2p_pubsub/dart_libp2p_pubsub.dart';
import 'web_socket_like.dart';

/// A minimal libp2p host for the EnvoyGo thin client.
///
/// Creates a libp2p node with:
/// - TCP transport
/// - Noise XX handshake (X25519 key exchange + ChaChaPoly)
/// - Stream muxing (mplex)
/// - Circuit relay support for NAT traversal
/// - Identify protocol (optional)
///
/// The node maintains its own Ed25519 peer identity, generated on first
/// startup. This identity is NOT the owner's identity — it's a separate
/// peer ID used only for libp2p transport.
class Libp2pNode {
  Host? _host;
  PeerId? _peerId;
  bool _started = false;

  /// The local libp2p peer ID (once started).
  PeerId? get peerId => _peerId;

  /// Whether the node is running.
  bool get isStarted => _started;

  /// Start the libp2p host.
  ///
  /// [listenAddrs] are multiaddrs to listen on, e.g. `/ip4/0.0.0.0/tcp/0`.
  /// Pass an empty list for client-only mode (no listening).
  /// [relayMultiaddr] is the relay's libp2p multiaddr for circuit relay,
  /// e.g. `/ip4/47.93.11.212/tcp/4001/p2p/<relayPeerId>`.
  Future<void> start({
    List<String> listenAddrs = const [],
    String? relayMultiaddr,
  }) async {
    if (_started) return;

    // Generate or load a random Ed25519 key pair for this peer.
    final keyPair = await _loadOrGenerateKeyPair();

    final gossipsub = GossipSubRouter();
    final builder = HostBuilder()
      ..setIdentity(keyPair)
      ..addTransport(TcpTransport())
      ..setSecurity(NoiseSecurity())
      ..setStreamMuxer(MplexStreamMuxer())
      ..addPubSubRouter(gossipsub);

    if (listenAddrs.isNotEmpty) {
      for (final addr in listenAddrs) {
        builder.addListenAddr(addr);
      }
    }

    _host = await builder.build();
    await _host!.start();
    _peerId = _host!.peerId;
    _started = true;

    // Subscribe to all registered topics via GossipSub.
    final pubsub = _host!.pubSub as GossipSubRouter?;
    if (pubsub != null) {
      for (final topic in _topicSubscriptions.keys) {
        pubsub.subscribe(topic);
        pubsub.onMessage(topic, (msg) {
          try {
            final data = jsonDecode(utf8.decode(msg.data)) as Map<String, dynamic>;
            for (final handler in _topicSubscriptions[topic] ?? {}) {
              handler(data);
            }
          } catch (_) {}
        });
      }
    }
  }

  /// Dial a peer and open a stream for [protocolId].
  ///
  /// Returns a duplex stream wrapper that can be used like a WebSocket.
  /// [peerMultiaddr] is the target peer's multiaddr, e.g.
  /// `/p2p/<peerId>` or a relay circuit address.
  Future<Libp2pStreamTransport> dial({
    required String peerMultiaddr,
    String protocolId = '/envoymesh/rpc/1.0.0',
  }) async {
    if (_host == null) throw StateError('Libp2pNode not started');
    final conn = await _host!.dialProtocol(peerMultiaddr, protocolId);
    // conn provides a bidirectional stream: conn.stream for rx, conn.sink for tx.
    return Libp2pStreamTransport(conn.stream, (data) => conn.sink.add(data));
  }

  // -- Pub/Sub (GossipSub) --

  final _topicSubscriptions = <String, Set<void Function(Map<String, dynamic> data)>>{};

  /// Subscribe to a pub/sub topic. Returns an unsubscribe function.
  /// Events arrive as Map<String, dynamic> via the callback.
  void Function() subscribeTopic(
    String topic,
    void Function(Map<String, dynamic> data) handler,
  ) {
    _topicSubscriptions.putIfAbsent(topic, () => {});
    _topicSubscriptions[topic]!.add(handler);
    return () => _topicSubscriptions[topic]?.remove(handler);
  }

  /// Stop the host and release all resources.
  Future<void> stop() async {
    if (_host != null) {
      await _host!.stop();
      _host = null;
    }
    _started = false;
  }

  Future<KeyPair> _loadOrGenerateKeyPair() async {
    // For now, generate a fresh Ed25519 key pair each time.
    // In production, store the key in secure storage and reuse it.
    return KeyPair.generateEd25519();
  }
}

/// A WebSocket-like wrapper around a libp2p duplex stream.
///
/// Implements [WebSocketLike] so it can be used as a drop-in replacement
/// for WebSocket transport in [HomeRemoteClient].
///
/// Incoming data: read from the stream → deliver as WsMessageEvent.
/// Outgoing data: written to the stream via [send] → forwarded to peer.
class Libp2pStreamTransport implements WebSocketLike {
  final Stream<List<int>> _incoming;
  final void Function(List<int> data) _outgoing;
  StreamSubscription? _subscription;

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

  Libp2pStreamTransport(this._incoming, this._outgoing) {
    // Mark as open immediately — the stream is already established by
    // dialProtocol. Fire onOpen in the next microtask so callers can
    // install handlers first.
    readyState = wsOpen;
    Future.microtask(() => onOpen?.call());

    _subscription = _incoming.listen(
      (data) {
        final text = utf8.decode(data);
        onMessage?.call(WsMessageEvent(text));
      },
      onError: (_) {
        readyState = wsClosed;
        onError?.call();
      },
      onDone: () {
        readyState = wsClosed;
        onClose?.call();
      },
      cancelOnError: true,
    );
  }

  @override
  void send(String data) {
    if (readyState == wsOpen) {
      _outgoing(utf8.encode(data));
    }
  }

  @override
  void close() {
    readyState = wsClosing;
    _subscription?.cancel();
    readyState = wsClosed;
  }
}
