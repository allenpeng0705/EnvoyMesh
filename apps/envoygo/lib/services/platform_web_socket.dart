import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'web_socket_like.dart';

/// Production WebSocket using a raw TCP socket + manual WebSocket handshake.
///
/// We bypass `dart:io`'s `WebSocket.connect` because on iOS with cellular
/// data it has been observed to follow HTTP redirects / misreport ports.
/// A manual handshake over a raw `Socket` gives us full control and
/// avoids any unexpected redirect behaviour from the relay.
class PlatformWebSocket implements WebSocketLike {
  Socket? _socket;
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

  /// Connect to a WebSocket URL using a raw TCP socket + handshake.
  static Future<PlatformWebSocket> connect(String url) async {
    final uri = Uri.parse(url);
    final host = uri.host;
    final port = uri.hasPort && uri.port != 0 ? uri.port : (uri.scheme == 'wss' ? 443 : 80);
    final path = '${uri.path}${uri.hasQuery ? '?${uri.query}' : ''}';

    final ws = PlatformWebSocket._();
    final socket = await Socket.connect(host, port,
        timeout: const Duration(seconds: 8));
    ws._socket = socket;
    ws.readyState = wsOpen;

    // Build WebSocket upgrade request per RFC 6455.
    final key = _generateWebSocketKey();
    final request = 'GET $path HTTP/1.1\r\n'
        'Host: $host:$port\r\n'
        'Upgrade: websocket\r\n'
        'Connection: Upgrade\r\n'
        'Sec-WebSocket-Key: $key\r\n'
        'Sec-WebSocket-Version: 13\r\n'
        '\r\n';

    socket.add(utf8.encode(request));
    await socket.flush();

    // Read the HTTP upgrade response.
    final buffer = StringBuffer();
    final completer = Completer<void>();
    ws._subscription = socket.listen(
      (data) {
        buffer.write(utf8.decode(data));
        final response = buffer.toString();
        // Check if we have a complete HTTP response (ends with \r\n\r\n).
        if (response.contains('\r\n\r\n')) {
          final statusLine = response.split('\r\n')[0];
          if (statusLine.contains('101')) {
            completer.complete();
            // After the handshake, switch to WebSocket frame mode.
            ws._startFrameMode(socket);
          } else {
            completer.completeError(
                Exception('WebSocket upgrade failed: $statusLine'));
          }
        }
      },
      onError: (e) {
        if (!completer.isCompleted) {
          completer.completeError(e);
        }
        ws.readyState = wsClosed;
        ws.onError?.call();
      },
      onDone: () {
        if (!completer.isCompleted) {
          completer.completeError(Exception('Connection closed during handshake'));
        }
        ws.readyState = wsClosed;
        ws.onClose?.call();
      },
      cancelOnError: true,
    );

    await completer.future;
    Future.microtask(() => ws.onOpen?.call());
    return ws;
  }

  void _startFrameMode(Socket socket) {
    // Cancel the HTTP response subscription and start frame parsing.
    _subscription?.cancel();
    final buffer = <int>[];
    _subscription = socket.listen(
      (data) {
        buffer.addAll(data is List<int> ? data : data as List<int>);
        // Try to parse complete WebSocket frames.
        while (buffer.length >= 2) {
          final frame = _parseFrame(buffer);
          if (frame == null) break; // Incomplete frame.
          final text = utf8.decode(frame);
          onMessage?.call(WsMessageEvent(text));
        }
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

  /// Parse a single WebSocket text frame from the buffer.
  /// Returns the payload bytes or null if the frame is incomplete.
  List<int>? _parseFrame(List<int> buffer) {
    if (buffer.length < 2) return null;
    final opcode = buffer[0] & 0x0F;
    final masked = (buffer[1] & 0x80) != 0;
    var payloadLen = buffer[1] & 0x7F;
    var offset = 2;

    if (payloadLen == 126) {
      if (buffer.length < 4) return null;
      payloadLen = (buffer[2] << 8) | buffer[3];
      offset = 4;
    } else if (payloadLen == 127) {
      if (buffer.length < 10) return null;
      payloadLen = 0;
      for (var i = 0; i < 8; i++) {
        payloadLen = (payloadLen << 8) | buffer[2 + i];
      }
      offset = 10;
    }

    List<int> maskKey = [];
    if (masked) {
      if (buffer.length < offset + 4) return null;
      maskKey = buffer.sublist(offset, offset + 4);
      offset += 4;
    }

    if (buffer.length < offset + payloadLen) return null;
    final payload = buffer.sublist(offset, offset + payloadLen);

    // Unmask if needed.
    if (masked) {
      for (var i = 0; i < payload.length; i++) {
        payload[i] ^= maskKey[i % 4];
      }
    }

    // Remove frame from buffer.
    buffer.removeRange(0, offset + payloadLen);

    // Handle close frames.
    if (opcode == 0x08) {
      close();
      return [];
    }

    return payload;
  }

  @override
  void send(String data) {
    if (readyState != wsOpen || _socket == null) return;
    final payload = utf8.encode(data);
    final frame = _buildFrame(payload);
    _socket!.add(frame);
    _socket!.flush();
  }

  List<int> _buildFrame(List<int> payload) {
    final frame = <int>[];
    frame.add(0x81); // FIN + text opcode.
    // MASK bit must be set for client-to-server frames per RFC 6455 §5.1.
    if (payload.length < 126) {
      frame.add(0x80 | payload.length);
    } else if (payload.length < 65536) {
      frame.add(0x80 | 126);
      frame.add((payload.length >> 8) & 0xFF);
      frame.add(payload.length & 0xFF);
    } else {
      frame.add(0x80 | 127);
      for (var i = 7; i >= 0; i--) {
        frame.add((payload.length >> (i * 8)) & 0xFF);
      }
    }
    // Generate 4-byte random masking key and XOR payload.
    final maskKey = List<int>.generate(4, (_) => _random.nextInt(256));
    frame.addAll(maskKey);
    for (var i = 0; i < payload.length; i++) {
      frame.add(payload[i] ^ maskKey[i % 4]);
    }
    return frame;
  }

  @override
  void close() {
    readyState = wsClosing;
    if (_socket != null && readyState == wsClosing) {
      // Send close frame.
      _socket!.add([0x88, 0x00]);
      _socket!.flush();
    }
    _subscription?.cancel();
    _subscription = null;
    _socket?.destroy();
    _socket = null;
    readyState = wsClosed;
  }

  static String _generateWebSocketKey() {
    final random = Random.secure();
    final bytes = List<int>.generate(16, (_) => random.nextInt(256));
    return base64Encode(bytes);
  }
}
