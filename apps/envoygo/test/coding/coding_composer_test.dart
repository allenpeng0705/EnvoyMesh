import 'package:envoygo/coding/coding_composer.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
  });

  group('codingComposerCapabilities', () {
    test('enables attach and modes for Envoy, Pi, and Tier B', () {
      expect(codingComposerCapabilities('envoy-harness').attach, isTrue);
      expect(codingComposerCapabilities('pi').attach, isTrue);
      expect(codingComposerCapabilities('codex').attach, isTrue);
    });

    test('gates fast/plan/thinking for Codex and Claude Code', () {
      final codex = codingComposerCapabilities('codex');
      expect(codex.fast, isTrue);
      expect(codex.planSlash, isTrue);
      expect(codex.thinking, isTrue);

      final pi = codingComposerCapabilities('pi');
      expect(pi.fast, isFalse);
      expect(pi.planSlash, isFalse);
    });
  });

  group('shapeCodingComposerPrompt', () {
    final caps = codingComposerCapabilities('opencode');

    test('prefixes Ask mode', () {
      final out = shapeCodingComposerPrompt(
        'why?',
        const CodingComposerPrefs(mode: 'ask'),
        caps,
      );
      expect(out, contains('[Mode: Ask]'));
      expect(out, contains('why?'));
    });

    test('uses /plan when planSlash is available', () {
      final out = shapeCodingComposerPrompt(
        'refactor auth',
        const CodingComposerPrefs(mode: 'plan'),
        codingComposerCapabilities('codex'),
      );
      expect(out, '/plan refactor auth');
    });

    test('leaves Code mode body unchanged', () {
      expect(
        shapeCodingComposerPrompt(
          'fix it',
          const CodingComposerPrefs(mode: 'code'),
          caps,
        ),
        'fix it',
      );
    });
  });

  group('fastToggleSlash', () {
    test('emits on/off', () {
      expect(fastToggleSlash(true), '/fast on');
      expect(fastToggleSlash(false), '/fast off');
    });
  });

  group('codingComposerPrefs storage', () {
    test('persists mode and fast per session key', () async {
      final key = codingComposerSessionKey(kind: 'ext', id: 'ext:1');
      await saveCodingComposerPrefs(
        key,
        const CodingComposerPrefs(mode: 'plan', fast: true),
      );
      final loaded = await loadCodingComposerPrefs(key);
      expect(loaded.mode, 'plan');
      expect(loaded.fast, isTrue);
    });
  });
}
