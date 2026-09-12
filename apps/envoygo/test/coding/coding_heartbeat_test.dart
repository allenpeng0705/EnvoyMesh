import 'package:flutter_test/flutter_test.dart';
import 'package:envoygo/coding/coding_heartbeat.dart';

void main() {
  group('coding_heartbeat', () {
    test('exposes cron presets matching API', () {
      expect(maxCodingHeartbeats, 20);
      expect(codingHeartbeatCronPresets['5m'], '*/5 * * * *');
      expect(codingHeartbeatCronPresets['15m'], '*/15 * * * *');
      expect(codingHeartbeatCronPresets['1h'], '0 * * * *');
      expect(codingHeartbeatCronPresets['daily'], '0 9 * * *');
    });

    test('resolveCodingHeartbeatCron maps presets and custom', () {
      expect(
        resolveCodingHeartbeatCron(presetOrCustom: '15m'),
        '*/15 * * * *',
      );
      expect(
        resolveCodingHeartbeatCron(
          presetOrCustom: 'custom',
          customCron: ' 0 8 * * 1 ',
        ),
        '0 8 * * 1',
      );
    });

    test('validates 5-field cron including */N', () {
      expect(isValidCodingHeartbeatCron('* * * * *'), isTrue);
      expect(isValidCodingHeartbeatCron('*/5 * * * *'), isTrue);
      expect(isValidCodingHeartbeatCron('0 9 * * 1'), isTrue);
      expect(isValidCodingHeartbeatCron('invalid'), isFalse);
      expect(isValidCodingHeartbeatCron('1 2 3 4'), isFalse);
      expect(isValidCodingHeartbeatCron('*/0 * * * *'), isFalse);
    });

    test('encodes and parses targets', () {
      expect(
        CodingHeartbeatTarget.tryParse({'kind': 'eh', 'chatId': 'c1'}),
        isA<CodingHeartbeatTargetEh>(),
      );
      expect(
        CodingHeartbeatTargetEh(chatId: 'c1').toJson(),
        {'kind': 'eh', 'chatId': 'c1'},
      );
      expect(
        CodingHeartbeatTargetPi(sessionId: 's1').toJson(),
        {'kind': 'pi', 'sessionId': 's1'},
      );
      expect(
        CodingHeartbeatTargetExt(sessionId: 's1', agentId: 'codex').toJson(),
        {'kind': 'ext', 'sessionId': 's1', 'agentId': 'codex'},
      );
      expect(
        CodingHeartbeatTarget.tryParse({'kind': 'eh', 'chatId': '  '}),
        isNull,
      );
      expect(
        CodingHeartbeatTarget.tryParse({'kind': 'ext', 'sessionId': 's1'}),
        isNull,
      );
    });

    test('CreateCodingHeartbeatInput.toJson includes target', () {
      final json = CreateCodingHeartbeatInput(
        name: 'HB',
        cron: '*/15 * * * *',
        prompt: 'check',
        target: const CodingHeartbeatTargetEh(chatId: 'chat-1'),
        enabled: true,
      ).toJson();
      expect(json['name'], 'HB');
      expect(json['cron'], '*/15 * * * *');
      expect(json['prompt'], 'check');
      expect(json['enabled'], true);
      expect(json['target'], {'kind': 'eh', 'chatId': 'chat-1'});
    });

    test('CodingHeartbeat.fromJson round-trips target + lastError', () {
      final hb = CodingHeartbeat.fromJson({
        'id': 'hb1',
        'name': 'N',
        'cron': '*/5 * * * *',
        'prompt': 'p',
        'target': {'kind': 'pi', 'sessionId': 'sess-9'},
        'enabled': false,
        'runCount': 2,
        'lastError': 'busy',
        'createdAt': '2026-01-01T00:00:00.000Z',
        'updatedAt': '2026-01-01T00:00:00.000Z',
      });
      expect(hb.id, 'hb1');
      expect(hb.enabled, isFalse);
      expect(hb.runCount, 2);
      expect(hb.lastError, 'busy');
      expect(hb.target, isA<CodingHeartbeatTargetPi>());
      expect(codingHeartbeatTargetLabel(hb.target), startsWith('Pi ·'));
    });
  });
}
