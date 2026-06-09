import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';
import 'web_socket_like.dart';

/// WebSocket using a raw TCP socket with a complete frame parser.
///
/// Bypasses `dart:io`'s `WebSocket.connect` / `HttpClient` which on iOS
/// cellular has been observed to follow redirects or misroute connections.
/// Uses `Socket.connect` directly and implements the full WebSocket
/// protocol (RFC 6455) including masking, ping/pong, and close handshake.
class PlatformWebSocket implements WebSocketLike {
  static final _random = Random.secure();
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

  // -- Connect --

  static Future<PlatformWebSocket> connect(String url) async {
    final uri = Uri.parse(url);
    final host = uri.host;
    final port = uri.hasPort && uri.port != 0
        ? uri.port
        : (uri.scheme == 'wss' ? 443 : 80);
    final path =
        '${uri.path.isEmpty ? '/' : uri.path}${uri.hasQuery ? '?${uri.query}' : ''}';

    final ws = PlatformWebSocket._();
    final socket = await Socket.connect(host, port,
        timeout: const Duration(seconds: 8));
    ws._socket = socket;

    // Send HTTP upgrade request.
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

    // Single subscription: HTTP mode → WebSocket frame mode.
    final httpBuffer = StringBuffer();
    final frameBuffer = <int>[];
    var mode = 'http';
    final handshakeCompleter = Completer<void>();

    ws._subscription = socket.listen(
      (data) {
        final bytes =
            data is Uint8List ? data : Uint8List.fromList(data as List<int>);
        if (mode == 'http') {
          httpBuffer.write(utf8.decode(bytes));
          final r = httpBuffer.toString();
          final delim = r.indexOf('\r\n\r\n');
          if (delim >= 0) {
            if (_isSuccessResponse(r, delim)) {
              mode = 'ws';
              // Drain trailing bytes into frame buffer.
              final trailing = r.substring(delim + 4);
              if (trailing.isNotEmpty) {
                frameBuffer.addAll(utf8.encode(trailing));
                _drainFrames(frameBuffer, ws);
              }
              ws.readyState = wsOpen;
              handshakeCompleter.complete();
            } else {
              final status = r.split('\r\n')[0];
              handshakeCompleter.completeError(
                  Exception('WS upgrade rejected: $status'));
            }
          }
        } else {
          frameBuffer.addAll(bytes);
          _drainFrames(frameBuffer, ws);
        }
      },
      onError: (e) {
        if (!handshakeCompleter.isCompleted) {
          handshakeCompleter.completeError(e);
        }
        ws._teardown();
        ws.onError?.call();
      },
      onDone: () {
        if (!handshakeCompleter.isCompleted) {
          handshakeCompleter
              .completeError(Exception('Connection closed'));
        }
        ws._teardown();
        ws.onClose?.call();
      },
      cancelOnError: true,
    );

    await handshakeCompleter.future;
    Future.microtask(() => ws.onOpen?.call());
    return ws;
  }

  static bool _isSuccessResponse(String r, int delim) {
    final firstLine = r.substring(0, r.indexOf('\r\n'));
    return firstLine.contains('101');
  }

  // -- Frame draining (called from the subscription callback) --

  static void _drainFrames(List<int> buf, PlatformWebSocket ws) {
    while (buf.length >= 2) {
      final result = _parseFrame(buf, ws);
      if (result == null) break; // incomplete
      if (result == _frameClose) {
        ws._teardown();
        ws.onClose?.call();
        return;
      }
      if (result == _framePing) {
        // Respond with pong — mask it.
        final pongPayload = result.payload;
        final pongMask = List<int>.generate(4, (_) => _random.nextInt(256));
        final pong = <int>[0x8A, 0x80 | pongPayload.length];
        pong.addAll(pongMask);
        for (var i = 0; i < pongPayload.length; i++) {
          pong.add(pongPayload[i] ^ pongMask[i % 4]);
        }
        try {
          ws._socket?.add(pong);
          ws._socket?.flush();
        } catch (_) {}
        continue;
      }
      if (result == _framePong) continue; // ignore
      // Text or binary frame.
      try {
        final text = utf8.decode(result.payload);
        ws.onMessage?.call(WsMessageEvent(text));
      } catch (_) {
        // Binary frames are silently ignored.
      }
    }
  }

  // -- Frame parsing --

  static const _frameClose = 1;
  static const _framePing = 2;
  static const _framePong = 3;

  /// Returns null if frame incomplete, a marker constant for control
  /// frames, or a payload wrapper for data frames.
  static _FrameResult? _parseFrame(List<int> buf, PlatformWebSocket ws) {
    if (buf.length < 2) return null;

    final opcode = buf[0] & 0x0F;
    final masked = (buf[1] & 0x80) != 0;
    var len = buf[1] & 0x7F;
    var off = 2;

    if (len == 126) {
      if (buf.length < 4) return null;
      len = (buf[2] << 8) | buf[3];
      off = 4;
    } else if (len == 127) {
      if (buf.length < 10) return null;
      len = 0;
      for (var i = 0; i < 8; i++) {
        len = (len << 8) | buf[2 + i];
      }
      off = 10;
    }

    // Payload length cap (1 MB).
    if (len > 1048576) {
      ws.close(1009, 'Frame too large');
      return _FrameResult(_frameClose, []);
    }

    var maskKey = <int>[];
    if (masked) {
      if (buf.length < off + 4) return null;
      maskKey = buf.sublist(off, off + 4);
      off += 4;
    }

    if (buf.length < off + len) return null;
    final payload = buf.sublist(off, off + len);
    buf.removeRange(0, off + len);

    // Unmask payload.
    if (masked) {
      for (var i = 0; i < payload.length; i++) {
        payload[i] ^= maskKey[i % 4];
      }
    }

    switch (opcode) {
      case 0x8: // close
        return _FrameResult(_frameClose, payload);
      case 0x9: // ping
        return _FrameResult(_framePing, payload);
      case 0xA: // pong
        return _FrameResult(_framePong, payload);
      default: // text or binary
        return _FrameResult(0, payload);
    }
  }

  // -- Send --

  @override
  void send(String data) {
    if (readyState != wsOpen || _socket == null) return;
    final frame = _buildTextFrame(utf8.encode(data));
    try {
      _socket!.add(frame);
      _socket!.flush();
    } catch (_) {
      _teardown();
      onError?.call();
    }
  }

  List<int> _buildTextFrame(List<int> payload) {
    return _buildFrame(0x81, payload); // FIN + text opcode
  }

  List<int> _buildFrame(int opcodeAndFin, List<int> payload) {
    final buf = <int>[opcodeAndFin];
    if (payload.length < 126) {
      buf.add(0x80 | payload.length);
    } else if (payload.length < 65536) {
      buf.add(0x80 | 126);
      buf.add((payload.length >> 8) & 0xFF);
      buf.add(payload.length & 0xFF);
    } else {
      buf.add(0x80 | 127);
      for (var i = 7; i >= 0; i--) {
        buf.add((payload.length >> (i * 8)) & 0xFF);
      }
    }
    final mask = List<int>.generate(4, (_) => _random.nextInt(256));
    buf.addAll(mask);
    for (var i = 0; i < payload.length; i++) {
      buf.add(payload[i] ^ mask[i % 4]);
    }
    return buf;
  }

  // -- Close --

  @override
  void close([int code = 1000, String reason = '']) {
    if (readyState == wsClosed || readyState == wsClosing) return;
    readyState = wsClosing;
    if (_socket != null) {
      // Send a masked close frame.
      final payload = <int>[];
      if (code != 1000) {
        payload.addAll([(code >> 8) & 0xFF, code & 0xFF]);
        payload.addAll(utf8.encode(reason));
      }
      final frame = _buildFrame(0x88, payload); // FIN + close opcode
      try {
        _socket!.add(frame);
        _socket!.flush();
      } catch (_) {}
    }
    _teardown();
  }

  void _teardown() {
    readyState = wsClosed;
    _subscription?.cancel();
    _subscription = null;
    try {
      _socket?.destroy();
    } catch (_) {}
    _socket = null;
  }

  // -- WebSocket key generation (RFC 6455 §4.1) --

  static String _generateWebSocketKey() {
    final bytes = List<int>.generate(16, (_) => _random.nextInt(256));
    return base64Encode(bytes);
  }
}

/// Parsed frame result.
class _FrameResult {
  final int type; // 0 = data, 1 = close, 2 = ping, 3 = pong
  final List<int> payload;
  const _FrameResult(this.type, this.payload);
}
