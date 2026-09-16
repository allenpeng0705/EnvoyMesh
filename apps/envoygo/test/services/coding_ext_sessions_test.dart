import 'package:envoygo/services/coding_ext_sessions.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
  });

  group('coding_ext_sessions', () {
    test('create / load / touch / remove Tier B sessions', () async {
      final created = await createCodingExtSession(
        harness: 'codex',
        cwd: '/projects/app',
        title: 'Codex',
        model: 'gpt-5',
        providerKind: 'openai-compatible',
        endpoint: 'https://api.example.com/v1',
      );
      expect(created.id, startsWith('ext:codex:'));
      expect(created.harness, 'codex');
      expect(created.cwd, '/projects/app');
      expect(created.title, 'Codex');
      expect(created.model, 'gpt-5');
      expect(created.providerKind, 'openai-compatible');
      expect(created.endpoint, 'https://api.example.com/v1');

      final loaded = await loadCodingExtSessions();
      expect(loaded, hasLength(1));
      expect(loaded.first.id, created.id);
      expect(loaded.first.model, 'gpt-5');

      await Future<void>.delayed(const Duration(milliseconds: 2));
      await touchCodingExtSession(created.id);
      final touched = await getCodingExtSession(created.id);
      expect(touched, isNotNull);
      expect(
        touched!.lastUsedAt.compareTo(created.lastUsedAt) >= 0,
        isTrue,
      );

      await removeCodingExtSession(created.id);
      expect(await loadCodingExtSessions(), isEmpty);
    });

    test('maybeAutoTitleCodingExtSession updates placeholder titles', () async {
      final created = await createCodingExtSession(
        harness: 'minimax-code',
        cwd: '/projects/app',
      );
      expect(created.title, 'app');
      expect(isCodingTierBHarnessId('minimax-code'), isTrue);

      final titled = await maybeAutoTitleCodingExtSession(
        created.id,
        'Fix the login redirect bug\nsecond line',
      );
      expect(titled, 'Fix the login redirect bug');
      final again = await maybeAutoTitleCodingExtSession(
        created.id,
        'Should not replace',
      );
      expect(again, isNull);
      expect(
        (await getCodingExtSession(created.id))!.title,
        'Fix the login redirect bug',
      );
    });

    test('updateCodingExtSessionRuntime patches model fields', () async {
      final created = await createCodingExtSession(
        harness: 'codex',
        cwd: '/x',
      );
      await updateCodingExtSessionRuntime(
        created.id,
        model: 'claude-sonnet',
        providerKind: 'anthropic-compatible',
      );
      final updated = await getCodingExtSession(created.id);
      expect(updated?.model, 'claude-sonnet');
      expect(updated?.providerKind, 'anthropic-compatible');
    });

    test('rejects non Tier B harness and empty cwd', () async {
      expect(
        () => createCodingExtSession(harness: 'pi', cwd: '/x'),
        throwsStateError,
      );
      expect(
        () => createCodingExtSession(harness: 'codex', cwd: '  '),
        throwsStateError,
      );
    });

    test('skips invalid rows and dedupes by id', () async {
      SharedPreferences.setMockInitialValues({
        kCodingExtSessionsKey: '''
[
  {"id":"ext:codex:a","harness":"codex","cwd":"/a","title":"A","createdAt":"2026-01-01T00:00:00.000Z","lastUsedAt":"2026-01-02T00:00:00.000Z"},
  {"id":"ext:codex:a","harness":"codex","cwd":"/a","title":"dup","createdAt":"2026-01-01T00:00:00.000Z","lastUsedAt":"2026-01-02T00:00:00.000Z"},
  {"id":"bad","harness":"pi","cwd":"/x","title":"Pi","createdAt":"2026-01-01T00:00:00.000Z","lastUsedAt":"2026-01-01T00:00:00.000Z"},
  {"id":"","harness":"codex","cwd":"/x","title":"X","createdAt":"2026-01-01T00:00:00.000Z","lastUsedAt":"2026-01-01T00:00:00.000Z"}
]
''',
      });
      final loaded = await loadCodingExtSessions();
      expect(loaded, hasLength(1));
      expect(loaded.first.id, 'ext:codex:a');
      expect(loaded.first.title, 'A');
    });
  });
}
