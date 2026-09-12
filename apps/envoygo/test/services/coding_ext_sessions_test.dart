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
      );
      expect(created.id, startsWith('ext:codex:'));
      expect(created.harness, 'codex');
      expect(created.cwd, '/projects/app');
      expect(created.title, 'Codex');

      final loaded = await loadCodingExtSessions();
      expect(loaded, hasLength(1));
      expect(loaded.first.id, created.id);

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
