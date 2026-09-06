/// WebSocket ready state constants matching the W3C spec.
const wsConnecting = 0;
const wsOpen = 1;
const wsClosing = 2;
const wsClosed = 3;

/// A message received on a WebSocket-like transport.
class WsMessageEvent {
  final String data;
  const WsMessageEvent(this.data);
}

/// Minimal transport interface that the home-remote wire protocol needs.
///
/// Both the `web_socket_channel` package, `dart:io` WebSocket,
/// `dart:html` WebSocket, and a future libp2p-stream shim can satisfy
/// this shape. [HomeRemoteClient] is transport-agnostic and speaks
/// the same JSON-RPC + push-event protocol over any duplex transport.
///
/// Wire-level contract (JSON, one message per call to `send`):
///   client → server: `{ id, method, params }`  (requests)
///   server → client: `{ id, result | error }`  (responses)
///   server → client: `{ event, data }`         (push events)
abstract interface class WebSocketLike {
  int get readyState;

  void send(String data);

  void close();

  void Function()? onOpen;

  void Function(WsMessageEvent event)? onMessage;

  void Function()? onClose;

  void Function()? onError;
}
