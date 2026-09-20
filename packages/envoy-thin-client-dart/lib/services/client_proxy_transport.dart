import 'dart:async';
import 'dart:convert';

import 'package:envoy_thin_client/services/mesh_frame.dart';
import 'package:envoy_thin_client/services/web_socket_like.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

/// Transport that connects through the relay's libp2p circuit to the
/// home node, speaking the client-proxy handshake protocol.
///
/// Flow:
///   1. Connect to relay WebSocket
///   2. Send proxy-connect handshake with session token
///   3. Receive proxy-accept (or proxy-reject)
///   4. Enter bidirectional JSON-RPC mode
///
/// This gives us libp2p-based routing through the relay without
/// requiring a full libp2p stack on the Flutter side.
class ClientProxyTransport implements WebSocketLike {
  final WebSocketChannel _channel;
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

  ClientProxyTransport._(this._channel);

  /// Connect to the home node via the relay's libp2p proxy.
  ///
  /// [relayWsUrl] is the relay WebSocket URL (e.g. ws://relay:15432/ws).
  /// [homePeerId] is the home node's libp2p peer ID.
  /// [sessionToken] is the thin-client session token for authentication.
  /// [handshakeTimeout] bounds the wait for `proxy-accept` **after** the socket is open; see the
  /// note on the timeout below for why the transport owns it rather than borrowing the caller's.
  static Future<ClientProxyTransport> connect({
    required String relayWsUrl,
    required String homePeerId,
    required String sessionToken,
    Duration handshakeTimeout = const Duration(seconds: 20),
  }) async {
    // Connect to the relay WebSocket with peer routing.
    // Use Uri.encodeComponent for the peer ID because base64url encoding
    // can include +/= chars that Uri.parse misinterprets as spaces
    // without proper encoding.
    // The relay server expects ?target= (not ?peer=) as the routing parameter.
    //
    // The relayWsUrl may already have ?peer=... from candidate_resolver.dart.
    // Strip any existing query params before appending our own.
    final baseUrl = relayWsUrl.contains('?')
        ? relayWsUrl.substring(0, relayWsUrl.indexOf('?'))
        : relayWsUrl;
    final encodedPeerId = Uri.encodeComponent(homePeerId);
    final url = sessionToken.isNotEmpty
        ? '$baseUrl?target=$encodedPeerId&token=$sessionToken'
        : '$baseUrl?target=$encodedPeerId';
    final uri = Uri.parse(url);
    final channel = WebSocketChannel.connect(uri);
    final transport = ClientProxyTransport._(channel);

    await channel.ready;
    transport.readyState = wsOpen;

    // Send the proxy-connect handshake. Framed like every other send on this transport: the relay
    // forwards these bytes verbatim into the home's stream, and an unframed write is a frame the
    // home buffers forever (see `mesh_frame.dart`).
    channel.sink.add(frameMeshMessage(jsonEncode({
      'type': 'proxy-connect',
      'token': sessionToken,
    })));

    // Use a single subscription for both handshake and JSON-RPC mode.
    final handshakeCompleter = Completer<Map<String, dynamic>>();
    transport._subscription = channel.stream.listen(
      (data) {
        final text =
            data is String ? data : String.fromCharCodes(data);
        if (!handshakeCompleter.isCompleted) {
          // Still waiting for handshake response.
          try {
            final msg = jsonDecode(text) as Map<String, dynamic>;
            // Accept both handshake formats:
            // - libp2p proxy path: { type: "proxy-accept" | "proxy-reject" }
            // - home-tunnel path: { event: "connected" | "tunnel-up" | "tunnel-down" }
            if (msg['type'] == 'proxy-accept') {
              handshakeCompleter.complete(msg);
              return;
            }
            if (msg['type'] == 'proxy-reject') {
              handshakeCompleter.complete(msg);
              return;
            }
            // Home-tunnel path: "connected" event means tunnel is established.
            // Treat as success equivalent to proxy-accept.
            if (msg['event'] == 'connected' ||
                msg['event'] == 'tunnel-up') {
              handshakeCompleter.complete({'type': 'proxy-accept'});
              return;
            }
          } catch (_) {
            // Not JSON or not handshake — ignore during handshake phase.
            return;
          }
        }
        // Handshake complete — normal JSON-RPC mode.
        transport.onMessage?.call(WsMessageEvent(text));
      },
      onError: (_) {
        if (!handshakeCompleter.isCompleted) {
          handshakeCompleter
              .completeError(Exception('WebSocket error'));
        }
        transport.readyState = wsClosed;
        transport.onError?.call();
      },
      onDone: () {
        if (!handshakeCompleter.isCompleted) {
          handshakeCompleter
              .completeError(Exception('WebSocket closed'));
        }
        transport.readyState = wsClosed;
        transport.onClose?.call();
      },
      cancelOnError: true,
    );

    // `channel.ready` already resolved, so the socket **is** open; what remains is the *handshake*,
    // which is a different wait. The relay only answers `proxy-accept` once the home has accepted
    // the proxied stream, and a relay whose home never answers will hold this socket open.
    //
    // Bounding it here (rather than trusting the caller to wrap `connect` in a `.timeout`) is what
    // closes the channel on expiry: a caller's timeout moves its walk on but cannot reach the
    // channel this method owns, so every timed-out dial would leak one live socket — and with it one
    // of the relay's capped connection slots. On timeout this closes both.
    final Map<String, dynamic> msg;
    try {
      msg = await handshakeCompleter.future.timeout(handshakeTimeout);
    } on TimeoutException {
      transport.readyState = wsClosed;
      unawaited(transport._subscription?.cancel());
      transport._subscription = null;
      unawaited(channel.sink.close());
      throw TimeoutException(
        'proxy handshake timed out after ${handshakeTimeout.inMilliseconds} ms',
        handshakeTimeout,
      );
    }

    if (msg['type'] == 'proxy-reject') {
      final reason = msg['reason'] as String? ?? 'unknown';
      transport.readyState = wsClosed;
      transport._subscription?.cancel();
      channel.sink.close();
      throw Exception('Proxy rejected: $reason');
    }

    // Proxy accepted — already in JSON-RPC mode from the listener above.

    // Fire onOpen, then re-emit `connected` so HomeRemoteClient can gate
    // RPCs on the home-ready signal (this transport consumes the relay's
    // original `connected` during handshake).
    Future.microtask(() {
      transport.onOpen?.call();
      transport.onMessage?.call(WsMessageEvent(jsonEncode({
        'event': 'connected',
        'data': {'relayProxied': true},
      })));
    });
    return transport;
  }

  @override
  void send(String data) {
    if (readyState == wsOpen) {
      // The delimiter is the contract: the relay forwards this text into the home's libp2p stream,
      // and the home splits that stream on `\n`. Without it the home sees an incomplete frame and
      // never answers — a hang, not a parse error.
      _channel.sink.add(frameMeshMessage(data));
    }
  }

  @override
  void close() {
    readyState = wsClosing;
    _subscription?.cancel();
    _subscription = null;
    _channel.sink.close();
    readyState = wsClosed;
  }
}
