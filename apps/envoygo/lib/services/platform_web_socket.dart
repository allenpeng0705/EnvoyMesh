import 'dart:async';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'web_socket_like.dart';

/// Production WebSocket wrapping `dart:io`'s built-in WebSocket.
///
/// We previously used a raw TCP socket + manual frame parser to work
/// around suspected redirect/port issues on iOS cellular. Now that the
/// relay port (15432) is confirmed open and the `target` parameter is
/// correctly set, the built-in WebSocket handles framing (masking,
/// ping/pong, close) correctly without us reinventing it.
///
/// Early frames (notably home `event: connected`) are buffered until
/// [onMessage] is assigned — `HomeRemoteClient` installs handlers only
/// after [connect] returns, and a LAN `connected` push can arrive in that
/// window.
class PlatformWebSocket implements WebSocketLike {
  WebSocket? _raw;
  StreamSubscription? _subscription;
  final List<String> _earlyMessages = [];
  static const _maxEarlyMessages = 64;

  @override
  int readyState = wsConnecting;

  @override
  void Function()? onOpen;

  void Function(WsMessageEvent event)? _onMessage;

  @override
  void Function(WsMessageEvent event)? get onMessage => _onMessage;

  @override
  set onMessage(void Function(WsMessageEvent event)? handler) {
    _onMessage = handler;
    if (handler == null) return;
    if (_earlyMessages.isEmpty) return;
    final pending = List<String>.from(_earlyMessages);
    _earlyMessages.clear();
    for (final text in pending) {
      handler(WsMessageEvent(text));
    }
  }

  @override
  void Function()? onClose;

  @override
  void Function()? onError;

  PlatformWebSocket._();

  /// Test seam: no real network — feed frames via [deliverForTest].
  @visibleForTesting
  PlatformWebSocket.forTest() {
    readyState = wsOpen;
  }

  @visibleForTesting
  void deliverForTest(String text) => _deliver(text);

  void _deliver(String text) {
    final handler = _onMessage;
    if (handler != null) {
      handler(WsMessageEvent(text));
      return;
    }
    _earlyMessages.add(text);
    while (_earlyMessages.length > _maxEarlyMessages) {
      _earlyMessages.removeAt(0);
    }
  }

  static Future<PlatformWebSocket> connect(String url) async {
    final ws = PlatformWebSocket._();
    try {
      ws._raw = await WebSocket.connect(url);
      ws.readyState = wsOpen;
      ws._subscription = ws._raw!.listen(
        (data) {
          final text =
              data is String ? data : String.fromCharCodes(data);
          ws._deliver(text);
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
    _earlyMessages.clear();
    _subscription?.cancel();
    _subscription = null;
    _raw?.close();
    _raw = null;
    readyState = wsClosed;
  }
}
