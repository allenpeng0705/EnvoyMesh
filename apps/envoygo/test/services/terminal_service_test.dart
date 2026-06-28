import 'dart:convert';
import 'dart:typed_data';

import 'package:envoygo/services/home_remote_client.dart';
import 'package:envoygo/services/node_service_client.dart';
import 'package:envoygo/services/terminal_service.dart';
import 'package:flutter_test/flutter_test.dart';

import '../helpers/terminal_rpc_mock.dart';

void main() {
  group('TerminalService', () {
    late TerminalRpcMockWebSocket mock;
    late TerminalService service;

    setUp(() async {
      mock = TerminalRpcMockWebSocket();
      final homeClient = await connectTerminalRpcMock(mock);
      final nodeService = NodeServiceClient(homeClient);
      service = TerminalService(nodeService, homeClient);
    });

    test('attach opens PTY tunnel and marks service attached', () async {
      await service.attach('sess-abc');

      expect(service.isAttached, isTrue);
      final methods = mock.sentMessages
          .map((raw) => jsonDecode(raw) as Map<String, dynamic>)
          .map((msg) => msg['method'] as String?)
          .whereType<String>()
          .toList();
      expect(methods, contains('terminalAttach'));
      expect(methods, contains('homeTerminalWsOpen'));
    });

    test('attach throws when homeTerminalWsOpen rejects', () async {
      mock.homeTerminalWsOpenResult = {
        'ok': false,
        'error': 'terminal WebSocket open timeout',
      };

      await expectLater(
        service.attach('sess-fail'),
        throwsA(isA<Exception>()),
      );
      expect(service.isAttached, isFalse);
    });

    test('sendRaw returns false when transport is closed', () async {
      await service.attach('sess-abc');
      mock.close();

      final ok = service.sendRaw(Uint8List.fromList([0x61]));
      expect(ok, isFalse);
      expect(service.isAttached, isFalse);
    });

    test('detach sends homeTerminalWsClose with sessionId', () async {
      await service.attach('sess-detach');
      await service.detach();

      final closeMsg = mock.sentMessages
          .map((raw) => jsonDecode(raw) as Map<String, dynamic>)
          .firstWhere((msg) => msg['method'] == 'homeTerminalWsClose');
      expect(
        (closeMsg['params'] as Map<String, dynamic>)['sessionId'],
        'sess-detach',
      );
      expect(service.isAttached, isFalse);
    });

    test('createSession forwards title to RPC', () async {
      final result = await service.createSession(
        command: 'build',
        cwd: '/tmp',
      );

      expect(result['sessionId'], isNotEmpty);
      expect(mock.createCalls.single['title'], 'build');
      expect(mock.createCalls.single['cwd'], '/tmp');
    });
  });
}
