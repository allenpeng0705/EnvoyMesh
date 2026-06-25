import 'dart:convert';

import 'package:envoygo/models/terminal_session.dart';
import 'package:envoygo/services/home_remote_client.dart';
import 'package:envoygo/services/web_socket_like.dart';

/// Controllable mock WebSocket for JSON-RPC home-remote tests.
class TerminalRpcMockWebSocket implements WebSocketLike {
  TerminalRpcMockWebSocket({
    List<Map<String, dynamic>>? initialSessions,
    List<Map<String, dynamic>>? initialRooms,
    this.onCreateTerminal,
  })  : _sessions = List<Map<String, dynamic>>.from(initialSessions ?? []),
        _rooms = List<Map<String, dynamic>>.from(initialRooms ?? []);

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

  final List<String> sentMessages = [];
  final List<Map<String, dynamic>> _sessions;
  final List<Map<String, dynamic>> _rooms;
  final List<Map<String, dynamic>> createCalls = [];
  final List<Map<String, dynamic>> createRoomCalls = [];

  /// When false, `createChatRoom` returns the room but does not add it to
  /// `_rooms`, simulating list lag after create.
  bool addRoomOnCreate = true;

  /// When set, `createTerminalSession` responds with a JSON-RPC error.
  String? createTerminalError;

  /// When set, `homeTerminalWsOpen` returns this result instead of `{ok:true}`.
  Map<String, dynamic>? homeTerminalWsOpenResult;

  /// Optional hook to customize create responses or inject failures.
  Map<String, dynamic> Function(Map<String, dynamic>? params)? onCreateTerminal;

  int _sessionCounter = 0;
  int _roomCounter = 0;

  void simulateOpen() {
    readyState = wsOpen;
    onOpen?.call();
  }

  void simulateConnected() {
    onMessage?.call(WsMessageEvent(jsonEncode({'event': 'connected'})));
  }

  @override
  void send(String data) {
    sentMessages.add(data);
    final msg = jsonDecode(data) as Map<String, dynamic>;
    final method = msg['method'] as String?;
    final id = msg['id'];
    if (method == null || id == null) return;

    final params = msg['params'] as Map<String, dynamic>?;
    if (method == 'createTerminalSession' && createTerminalError != null) {
      final err = createTerminalError!;
      Future.microtask(() {
        onMessage?.call(WsMessageEvent(jsonEncode({
          'id': id,
          'error': {'message': err},
        })));
      });
      return;
    }
    final result = _handleMethod(method, params);
    if (result == _noResponse) return;

    Future.microtask(() {
      onMessage?.call(WsMessageEvent(jsonEncode({'id': id, 'result': result})));
    });
  }

  static const _noResponse = Object();

  Object? _handleMethod(String method, Map<String, dynamic>? params) {
    switch (method) {
      case 'listTerminalSessions':
        return List<Map<String, dynamic>>.from(_sessions);
      case 'createTerminalSession':
        createCalls.add(Map<String, dynamic>.from(params ?? {}));
        if (onCreateTerminal != null) {
          final created = onCreateTerminal!(params);
          _upsertSession(created);
          return created;
        }
        _sessionCounter++;
        final created = {
          'sessionId': 'sess-new-$_sessionCounter',
          'title': (params?['title'] as String?) ?? 'Terminal $_sessionCounter',
          'cwd': params?['cwd'] ?? '/Users/me',
          'shell': '/bin/zsh',
          'state': 'running',
          'createdAt': '2026-06-24T12:00:00.000Z',
          'lastActivityAt': '2026-06-24T12:00:00.000Z',
        };
        _upsertSession(created);
        return created;
      case 'closeTerminalSession':
        final sessionId = params?['sessionId'] as String?;
        if (sessionId != null) {
          _sessions.removeWhere((s) => s['sessionId'] == sessionId);
        }
        return null;
      case 'terminalAttach':
        final sessionId = params?['sessionId'] as String? ?? 'unknown';
        return {
          'sessionId': sessionId,
          'token': 'tok-test',
          'wsUrl': 'ws://127.0.0.1:3032/ws/terminal/$sessionId?token=tok-test',
          'cols': 80,
          'rows': 24,
        };
      case 'homeTerminalWsOpen':
        return homeTerminalWsOpenResult ?? {'ok': true};
      case 'homeTerminalWsClose':
        return {'ok': true};
      case 'listChatRooms':
        return List<Map<String, dynamic>>.from(_rooms);
      case 'createChatRoom':
        createRoomCalls.add(Map<String, dynamic>.from(params ?? {}));
        _roomCounter++;
        final createdRoom = {
          'roomId': 'room-new-$_roomCounter',
          'title': (params?['title'] as String?) ?? 'Group $_roomCounter',
          'creatorOwnerId': 'envoy:owner:abc',
          'memberOwnerIds': [
            'envoy:owner:abc',
            ...((params?['memberOwnerIds'] as List<dynamic>?) ?? [])
                .map((e) => e.toString()),
          ],
          'revision': 1,
          'updatedAt': '2026-06-24T12:00:00.000Z',
        };
        if (addRoomOnCreate) {
          _rooms.add(Map<String, dynamic>.from(createdRoom));
        }
        return createdRoom;
      case 'sendChatRoomMessage':
        return {'ok': true};
      case 'inviteToChatRoom':
        return _rooms.isNotEmpty ? _rooms.first : null;
      case 'listChatHistory':
        return [];
      default:
        return null;
    }
  }

  void _upsertSession(Map<String, dynamic> session) {
    final id = session['sessionId'] as String;
    _sessions.removeWhere((s) => s['sessionId'] == id);
    _sessions.add(Map<String, dynamic>.from(session));
  }

  void setSessions(List<TerminalSession> sessions) {
    _sessions
      ..clear()
      ..addAll(sessions.map((s) => {
            'sessionId': s.id,
            'title': s.name,
            if (s.cwd != null) 'cwd': s.cwd,
            'shell': s.runningProcess ?? '/bin/zsh',
            'state': s.state ?? 'running',
            if (s.createdAt != null)
              'createdAt': s.createdAt!.toIso8601String(),
            'lastActivityAt': s.createdAt?.toIso8601String() ??
                '2026-06-24T12:00:00.000Z',
          }));
  }

  void setRooms(List<Map<String, dynamic>> rooms) {
    _rooms
      ..clear()
      ..addAll(rooms.map(Map<String, dynamic>.from));
  }

  @override
  void close() {
    readyState = wsClosed;
  }
}

Future<HomeRemoteClient> connectTerminalRpcMock(
  TerminalRpcMockWebSocket mock, {
  void Function(bool online)? onHomeOnlineChange,
}) async {
  final client = HomeRemoteClient(
    HomeRemoteClientOptions(
      resolveCandidates: () async => const [
        HomeRemoteCandidate(name: 'test', url: 'ws://test'),
      ],
      createTransport: (_) async => mock,
      onHomeOnlineChange: onHomeOnlineChange ?? (_) {},
      onActiveTransportChange: (_) {},
      perCandidateTimeoutMs: 1000,
      initialReconnectDelayMs: 1000,
    ),
  );
  final future = client.ensureConnected();
  await Future<void>.delayed(Duration.zero);
  mock.simulateOpen();
  await future;
  mock.simulateConnected();
  await Future<void>.delayed(Duration.zero);
  return client;
}

Map<String, dynamic> decodeLastSent(TerminalRpcMockWebSocket mock) =>
    jsonDecode(mock.sentMessages.last) as Map<String, dynamic>;
