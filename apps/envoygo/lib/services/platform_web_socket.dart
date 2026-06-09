import 'dart:async';
import 'dart:io';
import 'web_socket_like.dart';

/// Production WebSocket implementation using `dart:io` WebSocket directly.
///
/// Satisfies [WebSocketLike] so [HomeRemoteClient] can use real
/// WebSocket connections. Uses `dart:io` WebSocket on mobile (iOS/Android)
/// and falls back to `web_socket_channel` on web.
///
/// We bypass `web_socket_channel`'s `Uri.parse` on mobile because it
/// has been observed to mangle ports on some network configurations.
class PlatformWebSocket implements WebSocketLike {
  WebSocket? _raw;
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

  PlatformWebSocket._();

  /// Connect to a WebSocket URL using `dart:io` WebSocket directly.
  static Future<PlatformWebSocket> connect(String url) async {
    final ws = PlatformWebSocket._();
    try {
      ws._raw = await WebSocket.connect(url);
      ws.readyState = wsOpen;

      ws._subscription = ws._raw!.listen(
        (data) {
          final text =
              data is String ? data : String.fromCharCodes(data);
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

      // Fire onOpen so callers can set handlers first.
      Future.microtask(() => ws.onOpen?.call());
      return ws;
    } catch (e) {
      ws.readyState = wsClosed;
      ws.onError?.call();
      rethrow;
    }
  }

  @override
  void send(String data) {
    if (readyState == wsOpen && _raw != null) {
      _raw!.add(data);
    }
  }

  @override
  void close() {
    readyState = wsClosing;
    _subscription?.cancel();
    _subscription = null;
    _raw?.close();
    readyState = wsClosed;
  }
}
