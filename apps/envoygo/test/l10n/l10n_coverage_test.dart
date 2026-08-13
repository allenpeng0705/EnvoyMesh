// Regression test for the "104 untranslated messages in 5 locales" gap.
//
// Symptom: after adding new UI strings (Envoy Local settings screen,
// chains start screen, etc.) the `l10n.yaml` `untranslated-messages-file`
// option reported 104 untranslated messages for each of de/fr/it/ja/ko
// (520 total). The build still compiled because Flutter falls back to
// the English source, but the rendered UI in those locales was
// English-only — defeating the purpose of the existing translations.
//
// Fix: every newly added key was translated into all 5 locales.
// Running `flutter gen-l10n` now produces an empty `untranslated.json`
// (or no file at all) and each regenerated `app_localizations_*.dart`
// contains the full set of strings.
//
// This test pins the result at the source level. It runs in <50ms
// because it only reads the .arb files and the regenerated Dart
// outputs (no widget mounting, no provider trees). The contract:
//   1. All 5 non-EN locales have a non-empty value for every key the
//      English source has
//   2. The placeholder set in each translation matches the English
//      source exactly (so `${count}`, `${min}`, etc. are not lost)
//   3. The 5 generated Dart files are fresh (mtime after .arb)
//
// (The original "untranslated.json is empty" check was removed: the
// file is .gitignored, so a fresh clone has no file at all and the
// check would silently pass. The per-locale key check below is
// authoritative — it directly verifies the coverage contract.)
//
// If a future contributor adds a new key in `app_en.arb` without
// translating it into all 5 locales, this test fails immediately.

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  group('l10n coverage (de/fr/it/ja/ko)', () {
    const arbDir = 'lib/l10n';

    // 1. The 5 target locales have all the keys the EN source has.
    //    Locks in: nothing falls back to English silently.
    for (final locale in const ['de', 'fr', 'it', 'ja', 'ko']) {
      test('$locale: every EN key has a non-empty translation', () {
        final en = _loadArb('$arbDir/app_en.arb');
        final loc = _loadArb('$arbDir/app_$locale.arb');
        final missing = <String>[];
        final empty = <String>[];
        for (final entry in en.entries) {
          final key = entry.key as String;
          if (key.startsWith('@')) continue; // metadata
          if (!loc.containsKey(key)) {
            missing.add(key);
            continue;
          }
          final value = loc[key];
          if (value is! String || value.trim().isEmpty) {
            empty.add(key);
          }
        }
        if (missing.isNotEmpty || empty.isNotEmpty) {
          final buf = StringBuffer();
          if (missing.isNotEmpty) {
            buf.writeln('Missing in $locale (${missing.length}):');
            for (final k in missing.take(20)) {
              buf.writeln('  - $k');
            }
            if (missing.length > 20) buf.writeln('  … and ${missing.length - 20} more');
          }
          if (empty.isNotEmpty) {
            buf.writeln('Empty in $locale (${empty.length}):');
            for (final k in empty) {
              buf.writeln('  - $k');
            }
          }
          fail(buf.toString());
        }
      });
    }

    // 2. The placeholder set is preserved exactly. The Flutter l10n
    //    tool converts `{name}` → `${name}` Dart interpolation, so
    //    we check the .arb side. If a translation drops a placeholder,
    //    the runtime renders literally and silently corrupts the UI.
    for (final locale in const ['de', 'fr', 'it', 'ja', 'ko']) {
      test('$locale: placeholders match EN source exactly', () {
        final en = _loadArb('$arbDir/app_en.arb');
        final loc = _loadArb('$arbDir/app_$locale.arb');
        final placeholderRe = RegExp(r'\{(\w+)\}');
        final mismatches = <String>[];
        for (final entry in en.entries) {
          final key = entry.key as String;
          if (key.startsWith('@')) continue;
          final enVal = entry.value as String;
          final locVal = loc[key];
          if (locVal is! String) continue;
          final enPhs = (placeholderRe.allMatches(enVal).map((m) => m.group(1)!).toList())..sort();
          final locPhs = (placeholderRe.allMatches(locVal).map((m) => m.group(1)!).toList())..sort();
          if (!_listEq(enPhs, locPhs)) {
            mismatches.add(
              '  $key: EN=$enPhs, $locale=$locPhs\n    EN:    $enVal\n    $locale: $locVal',
            );
          }
        }
        if (mismatches.isNotEmpty) {
          fail(
            'Placeholder mismatches in $locale (${mismatches.length}):\n'
            '${mismatches.join('\n')}',
          );
        }
      });
    }

    // 3. The 5 generated Dart files are fresh (mtime after arb
    //    sources OR equal mtime). Guards against `gen-l10n` being
    //    skipped after a .arb edit.
    test('generated app_localizations_*.dart are at least as new as the .arb sources', () {
      final en = File('$arbDir/app_en.arb').statSync().modified;
      for (final locale in const ['de', 'fr', 'it', 'ja', 'ko']) {
        final arbMtime = File('$arbDir/app_$locale.arb').statSync().modified;
        final dartFile = File('$arbDir/app_localizations_$locale.dart');
        if (!dartFile.existsSync()) {
          fail('Missing generated file: ${dartFile.path}');
        }
        final dartMtime = dartFile.statSync().modified;
        // dartMtime >= en.mtime AND dartMtime >= arb.mtime
        // (The generator runs once; all 5 outputs are written in the same step.)
        if (dartMtime.isBefore(en) || dartMtime.isBefore(arbMtime)) {
          fail(
            'Generated file for $locale is older than the source .arb. '
            'Re-run `flutter gen-l10n`.\n'
            '  en.arb: $en\n  $locale.arb: $arbMtime\n  '
            'app_localizations_$locale.dart: $dartMtime',
          );
        }
      }
    });
  });
}

Map<String, dynamic> _loadArb(String path) {
  final content = File(path).readAsStringSync();
  return jsonDecode(content) as Map<String, dynamic>;
}

bool _listEq(List<String> a, List<String> b) {
  if (a.length != b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i] != b[i]) return false;
  }
  return true;
}
