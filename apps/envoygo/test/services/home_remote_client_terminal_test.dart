import 'dart:convert';
import 'dart:typed_data';

import 'package:envoygo/services/home_remote_client.dart';
import 'package:envoygo/services/web_socket_like.dart';
import 'package:flutter_test/flutter_test.dart';

/// A `WebSocketLike` that records everything sent so a test can
/// decode the JSON-RPC payload and assert the underlying PTY frame.
class _FakeWebSocket implements WebSocketLike {
  final List<String> sent = [];
  int _readyState = wsConnecting;

  @override
  int get readyState => _readyState;

  @override
  void send(String data) {
    sent.add(data);
  }

  @override
  void close() {
    _readyState = wsClosed;
  }

  /// Simulate the transport finishing its handshake. The
  /// `HomeRemoteClient` is waiting for `onOpen` to fire before it
  /// resolves `ensureConnected()`.
  void simulateOpen() {
    _readyState = wsOpen;
    onOpen?.call();
  }

  /// Simulate the home node sending the `connected` push event. The
  /// client considers the session live only after this is delivered.
  void simulateConnected() {
    onMessage?.call(WsMessageEvent(jsonEncode({'event': 'connected'})));
  }

  @override
  void Function()? onOpen;

  @override
  void Function(WsMessageEvent event)? onMessage;

  @override
  void Function()? onClose;

  @override
  void Function()? onError;
}

HomeRemoteClient _newClient(_FakeWebSocket fake) {
  return HomeRemoteClient(
    HomeRemoteClientOptions(
      resolveCandidates: () async => const [
        HomeRemoteCandidate(name: 'test', url: 'ws://test'),
      ],
      createTransport: (_) async => fake,
    ),
  );
}

Future<HomeRemoteClient> _connectedClient(_FakeWebSocket fake,
    {int perCandidateTimeoutMs = 200}) async {
  final client = HomeRemoteClient(HomeRemoteClientOptions(
    resolveCandidates: () async => const [
      HomeRemoteCandidate(name: 'test', url: 'ws://test'),
    ],
    createTransport: (_) async => fake,
    perCandidateTimeoutMs: perCandidateTimeoutMs,
    upgradeSweepMs: 0,
    initialReconnectDelayMs: 1000,
  ));
  final future = client.ensureConnected();
  // Let the constructor's timers and the createTransport call run
  // before we fire `open` on the fake.
  await Future<void>.delayed(Duration.zero);
  fake.simulateOpen();
  await future;
  // The client treats the transport as fully usable only after the
  // home's `connected` push event arrives.
  fake.simulateConnected();
  await Future<void>.delayed(Duration.zero);
  return client;
}

void main() {
  group('HomeRemoteClient — terminal wire framing', () {
    test('sendTerminalFrame produces a valid [version, type, payload] frame',
        () async {
      final fake = _FakeWebSocket();
      final client = await _connectedClient(fake);

      final payload = utf8.encode('ls -la\n');
      final frame =
          encodeTerminalFrame(TerminalWireType.stdin, Uint8List.fromList(payload));
      final result = client.sendTerminalFrame(frame);

      expect(result.ok, isTrue);
      expect(fake.sent, hasLength(1));

      final msg = jsonDecode(fake.sent.single) as Map<String, dynamic>;
      expect(msg['method'], 'homeTerminalWsSend');
      final params = msg['params'] as Map<String, dynamic>;
      final dataBase64 = params['dataBase64'] as String;
      final bytes = base64Decode(dataBase64);

      // [version=1, type=0=stdin, 'l', 's', ' ', '-', 'l', 'a', '\n']
      expect(bytes[0], 1, reason: 'version must be 1');
      expect(bytes[1], TerminalWireType.stdin, reason: 'type must be 0 (stdin)');
      expect(utf8.decode(bytes.sublist(2)), 'ls -la\n');
    });

    test('sendTerminalInput writes a stdin frame via sendTerminalFrame', () async {
      final fake = _FakeWebSocket();
      final client = await _connectedClient(fake);
      final result = client.sendTerminalInput('ls\n');
      expect(result.ok, isTrue);
      final params = jsonDecode(fake.sent.single) as Map<String, dynamic>;
      final bytes = base64Decode(
        (params['params'] as Map<String, dynamic>)['dataBase64'] as String,
      );
      expect(bytes[0], 1);
      expect(bytes[1], TerminalWireType.stdin);
      expect(utf8.decode(bytes.sublist(2)), 'ls\n');
    });

    test('sendTerminalResize encodes cols/rows as big-endian u16', () async {
      final fake = _FakeWebSocket();
      final client = await _connectedClient(fake);

      final result = client.sendTerminalResize(120, 40);
      expect(result.ok, isTrue);
      expect(fake.sent, hasLength(1));
      final params = jsonDecode(fake.sent.single) as Map<String, dynamic>;
      final bytes =
          base64Decode((params['params'] as Map<String, dynamic>)['dataBase64'] as String);

      expect(bytes[0], 1, reason: 'version');
      expect(bytes[1], TerminalWireType.resize, reason: 'type=2 (resize)');
      // cols=120 → 0x0078; rows=40 → 0x0028
      expect(bytes[2], 0x00);
      expect(bytes[3], 0x78);
      expect(bytes[4], 0x00);
      expect(bytes[5], 0x28);
    });

    test('sendTerminalResize rejects non-positive dimensions without sending',
        () {
      final fake = _FakeWebSocket();
      final client = _newClient(fake);
      final r1 = client.sendTerminalResize(0, 24);
      final r2 = client.sendTerminalResize(80, -1);
      expect(r1.ok, isFalse);
      expect(r1.error, 'homeRemote.invalidDimensions');
      expect(r2.ok, isFalse);
      expect(fake.sent, isEmpty,
          reason: 'no frames should be sent for invalid sizes');
    });

    test('sendTerminalFrame returns notConnected when transport is closed', () {
      final fake = _FakeWebSocket();
      fake.close();
      final client = _newClient(fake);
      final result = client.sendTerminalFrame(
        encodeTerminalFrame(TerminalWireType.stdin, Uint8List.fromList([0x41])),
      );
      expect(result.ok, isFalse);
      expect(result.error, 'homeRemote.notConnected');
    });

    test('sendTerminalFrame forwards sessionId when provided', () async {
      final fake = _FakeWebSocket();
      final client = await _connectedClient(fake);
      client.sendTerminalFrame(
        encodeTerminalFrame(TerminalWireType.stdin, Uint8List.fromList([0x41])),
        sessionId: 'sess-123',
      );
      final params = jsonDecode(fake.sent.single) as Map<String, dynamic>;
      expect((params['params'] as Map<String, dynamic>)['sessionId'], 'sess-123');
    });

    test('encodeTerminalFrame with empty payload is just [version, type]', () {
      final frame =
          encodeTerminalFrame(TerminalWireType.ping, Uint8List(0));
      expect(frame, [1, TerminalWireType.ping]);
    });
  });
}
