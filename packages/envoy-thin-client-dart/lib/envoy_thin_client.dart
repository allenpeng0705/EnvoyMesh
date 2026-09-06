/// Envoy thin-client core — pure-Dart pairing + JSON-RPC client used to
/// reach an Envoy home node.
///
/// Exported here:
///  - wire types: `JsonRpcRequest/Response/Error/Event`, `WebSocketLike`,
///    `WsMessageEvent`, `UnauthorizedException`
///  - pairing: `PairingData`, `parsePairingUri`
///  - client + transports: `HomeRemoteClient`, `CandidateResolver`,
///    `ReconnectSupervisor`, `ClientProxyTransport`
///
/// Note: `PlatformWebSocket` (a `dart:io` WebSocket) is intentionally NOT
/// re-exported here so the barrel stays importable on web. Import it
/// directly as `package:envoy_thin_client/services/platform_web_socket.dart`
/// when an IO socket transport is needed.
library;

export 'models/json_rpc.dart';
export 'models/stored_node.dart';

export 'services/candidate_resolver.dart';
export 'services/client_proxy_transport.dart';
export 'services/exceptions.dart';
export 'services/home_remote_client.dart';
export 'services/pairing_uri.dart';
export 'services/reconnect_supervisor.dart';
export 'services/web_socket_like.dart';
