import 'package:envoygo/coding/coding_composer.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
  });

  group('codingComposerCapabilities', () {
    test('publishes EH modes + permissions', () {
      final eh = codingComposerCapabilities('envoy-harness');
      expect(eh.agentModes.map((m) => m.id).toList(),
          ['default', 'plan', 'review']);
      expect(eh.canSetMode, isTrue);
      expect(eh.permissions, isTrue);
      expect(eh.workingMode, isFalse);
    });

    test('enables Pi permissions without native modes', () {
      final pi = codingComposerCapabilities('pi');
      expect(pi.permissions, isTrue);
      expect(pi.agentModes, isEmpty);
      expect(pi.workingMode, isTrue);
    });

    test('shows no Permissions control for a sidecar the coding run path cannot gate', () {
      final codex = codingComposerCapabilities('codex');
      expect(codex.permissions, isFalse);
      expect(codex.permissionDisabledReason, contains('would change nothing'));
      expect(codex.permissionFullDisabledReason, isNull);
      expect(codex.agentModes.any((m) => m.id == 'agent'), isTrue);
      expect(codex.canSetMode, isFalse);
    });

    test('gives a catalog ACP agent the full Permissions control, Ask included', () {
      final gemini = codingComposerCapabilities('gemini');
      expect(gemini.permissions, isTrue);
      expect(gemini.permissionAskDisabledReason, isNull);
      expect(gemini.permissionDisabledReason, isNull);
      expect(gemini.permissionFullDisabledReason, isNull);
    });

    test('deepseek-harness is sidecar (no set_mode, no Mesh perms)', () {
      final ds = codingComposerCapabilities('deepseek-harness');
      expect(ds.canSetMode, isFalse);
      expect(ds.permissions, isFalse);
      expect(ds.agentModes, isEmpty);
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
    test('uses Review prefix for EH agent mode', () {
      final caps = codingComposerCapabilities('envoy-harness');
      final out = shapeCodingComposerPrompt(
        'look over auth',
        const CodingComposerPrefs(agentModeId: 'review'),
        caps,
      );
      expect(out, contains('[Mode: Review]'));
    });

    test('uses /plan when planSlash is available', () {
      final out = shapeCodingComposerPrompt(
        'refactor auth',
        const CodingComposerPrefs(mode: 'plan', agentModeId: 'plan'),
        codingComposerCapabilities('codex'),
      );
      expect(out, '/plan refactor auth');
    });

    test('leaves Code mode body unchanged for catalog without agentModes', () {
      final caps = codingComposerCapabilities('gemini');
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
    test('persists mode, permissions, and agentModeId', () async {
      final key = codingComposerSessionKey(kind: 'ext', id: 'ext:1');
      await saveCodingComposerPrefs(
        key,
        const CodingComposerPrefs(
          mode: 'plan',
          fast: true,
          permissionPolicy: 'always-confirm',
          agentModeId: 'agent',
        ),
      );
      final loaded = await loadCodingComposerPrefs(key);
      expect(loaded.mode, 'plan');
      expect(loaded.fast, isTrue);
      expect(loaded.permissionPolicy, 'always-confirm');
      expect(loaded.agentModeId, 'agent');
    });
  });
}