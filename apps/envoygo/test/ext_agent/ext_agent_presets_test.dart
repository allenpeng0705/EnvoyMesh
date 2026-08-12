// Tests for the empty-default Ext Agent preset model.
//
// Why this file exists: the home node is the source of truth for
// `extAgents` (see `packages/api/src/ext-agent.ts` and the comments in
// `lib/ext_agent/ext_agent_presets.dart`). These tests guard the
// invariant that **EnvoyGo never injects a built-in agent when the
// home is unreachable** — that bug was real, the old `defaultExtAgents`
// list shipped fake "pi" / "homeclaw" presets that appeared in the UI
// when the bridge was actually offline. The fix is an empty list and
// a passthrough `mergeExtAgentPresets`; these tests pin both.

import 'package:envoygo/ext_agent/ext_agent_presets.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('defaultExtAgents', () {
    test('is empty — home node is the source of truth', () {
      expect(defaultExtAgents, isEmpty);
    });

    test('is typed as List<ExtAgentPreset>, not List<dynamic>', () {
      // Compile-time: this assignment must succeed without a cast.
      final List<ExtAgentPreset> list = defaultExtAgents;
      expect(list, isEmpty);
    });
  });

  group('mergeExtAgentPresets', () {
    test('returns empty list when configured is null (no home sync yet)', () {
      expect(mergeExtAgentPresets(null), isEmpty);
    });

    test('returns empty list when configured is empty (home has no agents)', () {
      expect(mergeExtAgentPresets(const []), isEmpty);
    });

    test('passes through a single home-pushed agent verbatim', () {
      final result = mergeExtAgentPresets([
        {
          'id': 'codex',
          'name': 'Codex',
          'adapter': 'envoymesh-message',
          'url': 'http://127.0.0.1:8023',
          'enabled': true,
        },
      ]);
      expect(result, hasLength(1));
      expect(result.first['id'], 'codex');
      expect(result.first['name'], 'Codex');
      expect(result.first['url'], 'http://127.0.0.1:8023');
    });

    test('passes through multiple home-pushed agents in order', () {
      final result = mergeExtAgentPresets([
        {'id': 'pi', 'name': 'Pi', 'enabled': true},
        {'id': 'codex', 'name': 'Codex', 'enabled': true},
        {'id': 'aider', 'name': 'Aider', 'enabled': true},
      ]);
      expect(result, hasLength(3));
      expect(result.map((a) => a['id']), ['pi', 'codex', 'aider']);
    });

    test('does not inject defaults when home returns an empty list', () {
      // This is the regression guard: before the fix, a `defaultExtAgents`
      // list of [pi, homeclaw, hermes] would always be present.
      final result = mergeExtAgentPresets(const []);
      expect(result.where((a) => a['id'] == 'pi'), isEmpty);
      expect(result.where((a) => a['id'] == 'homeclaw'), isEmpty);
    });

    test('skips entries with empty id', () {
      final result = mergeExtAgentPresets([
        {'id': '', 'name': 'Ghost'},
        {'id': '   ', 'name': 'Whitespace'},
        {'name': 'NoIdAtAll'},
        {'id': 'codex', 'name': 'Codex'},
      ]);
      expect(result, hasLength(1));
      expect(result.first['id'], 'codex');
    });

    test('skips non-Map entries without crashing', () {
      final result = mergeExtAgentPresets([
        'string-not-a-map',
        42,
        null,
        {'id': 'codex', 'name': 'Codex'},
      ]);
      expect(result, hasLength(1));
      expect(result.first['id'], 'codex');
    });

    test('deduplicates by id (last entry wins) — defensive against home double-sends', () {
      // If home accidentally sends two entries with the same id, the
      // picker would show two "Codex" rows and confuse the user. We
      // dedupe with last-wins so a buggy home push doesn't break the
      // switcher. Home is the source of truth for *which* agents exist
      // and their *fields* — but in-list uniqueness is EnvoyGo's job.
      final result = mergeExtAgentPresets([
        {'id': 'codex', 'name': 'Codex A'},
        {'id': 'codex', 'name': 'Codex B'},
      ]);
      expect(result, hasLength(1));
      expect(result.first['name'], 'Codex B');
    });

    test('trims whitespace in id before accepting the entry', () {
      final result = mergeExtAgentPresets([
        {'id': '  codex  ', 'name': 'Codex'},
      ]);
      expect(result, hasLength(1));
      expect(result.first['id'], 'codex');
    });

    test('accepts an entry even when name/url/enabled are missing', () {
      // Home may push partial records during a race; the widget tree
      // should not crash. `name` is nullable in the picker, so this
      // is a valid steady state.
      final result = mergeExtAgentPresets([
        {'id': 'codex'},
      ]);
      expect(result, hasLength(1));
      expect(result.first['id'], 'codex');
      expect(result.first['name'], isNull);
    });
  });

  group('defaultExtAgentStartHint', () {
    test('returns a generic connect-to-home message for any id', () {
      // The hint must NOT contain id-specific install commands —
      // those live on the home node. EnvoyGo always defers to home.
      final hint = defaultExtAgentStartHint('codex');
      expect(hint, contains('home'));
      expect(hint, isNot(contains('npm install')));
      expect(hint, isNot(contains('pip install')));
      expect(hint, isNot(contains('curl ')));
    });

    test('returns the same hint for known and unknown ids', () {
      // No id-based branching. The home has the real instructions.
      expect(
        defaultExtAgentStartHint('codex'),
        defaultExtAgentStartHint('aider'),
      );
      expect(
        defaultExtAgentStartHint('mmx'),
        defaultExtAgentStartHint('totally-unknown-agent'),
      );
    });
  });

  group('getExtAgentInstallInfo', () {
    test('returns a generic placeholder (home has the real data)', () {
      final info = getExtAgentInstallInfo('codex');
      expect(info.agentId, 'codex');
      expect(info.builtIn, isFalse);
      expect(info.homepageUrl, isNull);
      expect(info.startHint, contains('home'));
    });

    test('does not pretend any agent is built-in', () {
      // Pre-fix bug: `builtIn: true` was hard-coded for some agents,
      // which suppressed the "not installed" banner. EnvoyGo must
      // never claim built-in — the home node decides that.
      expect(getExtAgentInstallInfo('pi').builtIn, isFalse);
      expect(getExtAgentInstallInfo('codex').builtIn, isFalse);
      expect(getExtAgentInstallInfo('homeclaw').builtIn, isFalse);
    });
  });

  group('ExtAgentPreset.fromJson', () {
    test('parses all required fields', () {
      final p = ExtAgentPreset.fromJson({
        'id': 'codex',
        'name': 'Codex',
        'adapter': 'envoymesh-message',
        'url': 'http://127.0.0.1:8023',
        'enabled': true,
      });
      expect(p.id, 'codex');
      expect(p.name, 'Codex');
      expect(p.adapter, 'envoymesh-message');
      expect(p.url, 'http://127.0.0.1:8023');
      expect(p.enabled, isTrue);
    });

    test('defaults adapter to envoymesh-message when missing', () {
      final p = ExtAgentPreset.fromJson({
        'id': 'codex',
        'name': 'Codex',
        'url': 'http://127.0.0.1:8023',
      });
      expect(p.adapter, 'envoymesh-message');
    });

    test('treats enabled as false when missing or non-true', () {
      expect(
        ExtAgentPreset.fromJson({'id': 'a', 'name': 'A', 'url': ''}).enabled,
        isFalse,
      );
      expect(
        ExtAgentPreset.fromJson({
          'id': 'a',
          'name': 'A',
          'url': '',
          'enabled': 'yes',
        }).enabled,
        isFalse,
      );
    });

    test('trims whitespace in string fields', () {
      final p = ExtAgentPreset.fromJson({
        'id': '  codex  ',
        'name': '  Codex  ',
        'url': ' http://x ',
      });
      expect(p.id, 'codex');
      expect(p.name, 'Codex');
      expect(p.url, 'http://x');
    });

    test('round-trips through toJson', () {
      const p = ExtAgentPreset(
        id: 'codex',
        name: 'Codex',
        adapter: 'envoymesh-message',
        url: 'http://127.0.0.1:8023',
        enabled: true,
      );
      final json = p.toJson();
      expect(json['id'], 'codex');
      expect(json['name'], 'Codex');
      expect(json['adapter'], 'envoymesh-message');
      expect(json['url'], 'http://127.0.0.1:8023');
      expect(json['enabled'], isTrue);
    });
  });

  group('extAgentUsesProjectPath', () {
    test('true for coding CLI agents', () {
      expect(extAgentUsesProjectPath('codex'), isTrue);
      expect(extAgentUsesProjectPath('ClaudeCode'), isTrue);
      expect(extAgentUsesProjectPath('cursor'), isTrue);
      expect(extAgentUsesProjectPath('aider'), isTrue);
      expect(extAgentUsesProjectPath('mmx'), isTrue);
    });

    test('false for agents that ignore project folders', () {
      expect(extAgentUsesProjectPath('pi'), isFalse);
      expect(extAgentUsesProjectPath('hermes'), isFalse);
      expect(extAgentUsesProjectPath('homeclaw'), isFalse);
      expect(extAgentUsesProjectPath(null), isFalse);
    });
  });
}
