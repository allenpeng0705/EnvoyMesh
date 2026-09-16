/// Sticky Coding composer prefs + capabilities + prompt shaping
/// (port of Social coding-composer-*.ts).
library;

import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

const kCodingComposerPrefsKey = 'envoymesh.codingComposerPrefs';

typedef CodingWorkingMode = String; // ask | plan | code
typedef CodingThinkingEffort = String; // off | low | medium | high

class CodingComposerCapabilities {
  const CodingComposerCapabilities({
    required this.model,
    required this.workingMode,
    required this.planSlash,
    required this.fast,
    required this.thinking,
    required this.importSession,
    required this.attach,
  });

  final bool model;
  final bool workingMode;
  final bool planSlash;
  final bool fast;
  final bool thinking;
  final bool importSession;
  final bool attach;
}

class CodingComposerPrefs {
  const CodingComposerPrefs({
    this.mode = 'code',
    this.fast = false,
    this.thinking = 'off',
    this.model,
  });

  final CodingWorkingMode mode;
  final bool fast;
  final CodingThinkingEffort thinking;
  final String? model;

  CodingComposerPrefs copyWith({
    CodingWorkingMode? mode,
    bool? fast,
    CodingThinkingEffort? thinking,
    String? model,
    bool clearModel = false,
  }) {
    return CodingComposerPrefs(
      mode: mode ?? this.mode,
      fast: fast ?? this.fast,
      thinking: thinking ?? this.thinking,
      model: clearModel ? null : (model ?? this.model),
    );
  }

  Map<String, dynamic> toJson() => {
        'mode': mode,
        'fast': fast,
        'thinking': thinking,
        if (model != null && model!.trim().isNotEmpty) 'model': model!.trim(),
      };

  factory CodingComposerPrefs.fromJson(Map<String, dynamic> json) {
    final mode = json['mode']?.toString();
    final thinking = json['thinking']?.toString();
    return CodingComposerPrefs(
      mode: mode == 'ask' || mode == 'plan' || mode == 'code' ? mode! : 'code',
      fast: json['fast'] == true,
      thinking: thinking == 'low' ||
              thinking == 'medium' ||
              thinking == 'high' ||
              thinking == 'off'
          ? thinking!
          : 'off',
      model: (json['model'] as String?)?.trim().isNotEmpty == true
          ? (json['model'] as String).trim()
          : null,
    );
  }
}

const _defaultPrefs = CodingComposerPrefs();

String codingComposerSessionKey({required String kind, required String id}) =>
    '$kind:${id.trim()}';

CodingComposerCapabilities codingComposerCapabilities(String harness) {
  final id = harness.trim();
  if (id == 'envoy-harness') {
    return const CodingComposerCapabilities(
      model: true,
      workingMode: true,
      planSlash: true,
      fast: true,
      thinking: false,
      importSession: true,
      attach: true,
    );
  }
  if (id == 'pi') {
    return const CodingComposerCapabilities(
      model: true,
      workingMode: true,
      planSlash: false,
      fast: false,
      thinking: false,
      importSession: true,
      attach: true,
    );
  }
  const planSlash = {'codex', 'claudecode'};
  const fast = {'codex', 'claudecode'};
  const thinking = {'claudecode', 'codex'};
  return CodingComposerCapabilities(
    model: true,
    workingMode: true,
    planSlash: planSlash.contains(id),
    fast: fast.contains(id),
    thinking: thinking.contains(id),
    importSession: true,
    attach: true,
  );
}

Future<Map<String, CodingComposerPrefs>> _loadAll() async {
  try {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(kCodingComposerPrefsKey);
    if (raw == null || raw.isEmpty) return {};
    final parsed = jsonDecode(raw);
    if (parsed is! Map) return {};
    final out = <String, CodingComposerPrefs>{};
    for (final e in parsed.entries) {
      if (e.value is! Map) continue;
      out[e.key.toString()] =
          CodingComposerPrefs.fromJson(Map<String, dynamic>.from(e.value as Map));
    }
    return out;
  } catch (_) {
    return {};
  }
}

Future<void> _saveAll(Map<String, CodingComposerPrefs> all) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(
    kCodingComposerPrefsKey,
    jsonEncode({for (final e in all.entries) e.key: e.value.toJson()}),
  );
}

Future<CodingComposerPrefs> loadCodingComposerPrefs(String sessionKey) async {
  final all = await _loadAll();
  return all[sessionKey] ?? _defaultPrefs;
}

Future<CodingComposerPrefs> saveCodingComposerPrefs(
  String sessionKey,
  CodingComposerPrefs prefs,
) async {
  final all = await _loadAll();
  all[sessionKey] = prefs;
  await _saveAll(all);
  return prefs;
}

const _askPrefix =
    '[Mode: Ask] Answer questions and explain. Do not edit files unless the user explicitly asks.';
const _planPrefix =
    '[Mode: Plan] Produce a concrete plan only. Do not modify files or run mutating tools yet.';

String shapeCodingComposerPrompt(
  String userText,
  CodingComposerPrefs prefs,
  CodingComposerCapabilities caps,
) {
  final body = userText.trim();
  final parts = <String>[];
  if (caps.workingMode && prefs.mode == 'ask') {
    parts.add(_askPrefix);
  } else if (caps.workingMode && prefs.mode == 'plan') {
    if (caps.planSlash) {
      return body.isEmpty ? '/plan' : '/plan $body';
    }
    parts.add(_planPrefix);
  }
  if (caps.thinking && prefs.thinking != 'off') {
    if (caps.planSlash || caps.fast) {
      parts.add(
        prefs.thinking == 'low'
            ? '[Thinking: low effort]'
            : prefs.thinking == 'medium'
                ? '[Thinking: medium effort]'
                : '[Thinking: high effort]',
      );
    }
  }
  if (parts.isEmpty) return body;
  if (body.isEmpty) return parts.join('\n');
  return '${parts.join('\n')}\n\n$body';
}

String fastToggleSlash(bool enabled) => enabled ? '/fast on' : '/fast off';
