import 'dart:async';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'web_socket_like.dart';

/// Production WebSocket implementation wrapping `web_socket_channel`.
///
/// Satisfies [WebSocketLike] so [HomeRemoteClient] can use real
/// WebSocket connections on all platforms (iOS, Android, web).
class PlatformWebSocket implements WebSocketLike {
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

  PlatformWebSocket._(this._channel);

  /// Connect to a WebSocket URL.
  static Future<PlatformWebSocket> connect(String url) async {
    final uri = Uri.parse(url);
    final channel = WebSocketChannel.connect(uri);
    final ws = PlatformWebSocket._(channel);

    await channel.ready;
    ws.readyState = wsOpen;

    ws._subscription = channel.stream.listen(
      (data) {
        final text = data is String ? data : String.fromCharCodes(data);
        ws.onMessage?.call(WsMessageEvent(text));
      },
      onError: (_) {
        ws.readyState = wsClosed;
        ws.onError?.call();
      },
      onDone: () {
        ws.readyState = wsClosed;
        ws.onClose?.call();
      },
      cancelOnError: true,
    );

    // Fire onOpen after install so callers can set handlers first.
    Future.microtask(() => ws.onOpen?.call());
    return ws;
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
