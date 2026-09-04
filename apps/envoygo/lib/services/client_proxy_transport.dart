import 'dart:async';
import 'dart:convert';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'web_socket_like.dart';

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
  static Future<ClientProxyTransport> connect({
    required String relayWsUrl,
    required String homePeerId,
    required String sessionToken,
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

    // Send the proxy-connect handshake.
    channel.sink.add(jsonEncode({
      'type': 'proxy-connect',
      'token': sessionToken,
    }));

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

    final msg = await handshakeCompleter.future;

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
      _channel.sink.add(data);
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
