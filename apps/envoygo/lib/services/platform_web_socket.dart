import 'dart:async';
import 'dart:io';
import 'web_socket_like.dart';

/// Production WebSocket wrapping `dart:io`'s built-in WebSocket.
///
/// We previously used a raw TCP socket + manual frame parser to work
/// around suspected redirect/port issues on iOS cellular. Now that the
/// relay port (15432) is confirmed open and the `target` parameter is
/// correctly set, the built-in WebSocket handles framing (masking,
/// ping/pong, close) correctly without us reinventing it.
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
    _raw = null;
    readyState = wsClosed;
  }
}
