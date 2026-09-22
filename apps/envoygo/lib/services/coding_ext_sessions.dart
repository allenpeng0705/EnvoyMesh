import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../coding/coding_projects.dart' show codingProjectLabelFromPath;

/// Client-side Coding Tier B (Ext Agent) session registry.
///
/// EH / Pi live on the home node; Tier B sessions are local only
/// (SharedPreferences port of Social `coding-sessions.ts`).
/// API keys live on the home node (`setCodingHarnessRuntime`), not here.
const kCodingExtSessionsKey = 'envoymesh.codingExtSessions';

const kCodingTierBHarnesses = {
  'claudecode',
  'codex',
  'opencode',
  'cursor',
  'codewhale',
  'minimax-code',
};

bool isCodingTierBHarnessId(String harness) =>
    kCodingTierBHarnesses.contains(harness.trim());

const kCodingExtPlaceholderTitle = 'New task';

class CodingExtSession {
  const CodingExtSession({
    required this.id,
    required this.harness,
    required this.cwd,
    required this.title,
    required this.createdAt,
    required this.lastUsedAt,
    this.model,
    this.providerKind,
    this.endpoint,
  });

  final String id;
  final String harness;
  final String cwd;
  final String title;
  final String createdAt;
  final String lastUsedAt;
  final String? model;
  final String? providerKind;
  final String? endpoint;

  Map<String, dynamic> toJson() => {
        'id': id,
        'harness': harness,
        'cwd': cwd,
        'title': title,
        'createdAt': createdAt,
        'lastUsedAt': lastUsedAt,
        if (model != null && model!.trim().isNotEmpty) 'model': model!.trim(),
        if (providerKind != null && providerKind!.trim().isNotEmpty)
          'providerKind': providerKind!.trim(),
        if (endpoint != null && endpoint!.trim().isNotEmpty)
          'endpoint': endpoint!.trim(),
      };

  factory CodingExtSession.fromJson(Map<String, dynamic> json) {
    final createdAt = (json['createdAt'] as String?)?.trim().isNotEmpty == true
        ? json['createdAt'] as String
        : DateTime.now().toUtc().toIso8601String();
    final lastUsed = (json['lastUsedAt'] as String?)?.trim().isNotEmpty == true
        ? json['lastUsedAt'] as String
        : createdAt;
    return CodingExtSession(
      id: (json['id'] as String?)?.trim() ?? '',
      harness: (json['harness'] as String?)?.trim() ?? '',
      cwd: (json['cwd'] as String?)?.trim() ?? '',
      title: (json['title'] as String?)?.trim().isNotEmpty == true
          ? (json['title'] as String).trim()
          : kCodingExtPlaceholderTitle,
      createdAt: createdAt,
      lastUsedAt: lastUsed,
      model: (json['model'] as String?)?.trim().isNotEmpty == true
          ? (json['model'] as String).trim()
          : null,
      providerKind: () {
        final p = (json['providerKind'] as String?)?.trim();
        if (p == 'openai-compatible' || p == 'anthropic-compatible') return p;
        return null;
      }(),
      endpoint: (json['endpoint'] as String?)?.trim().isNotEmpty == true
          ? (json['endpoint'] as String).trim()
          : null,
    );
  }

  CodingExtSession copyWith({
    String? lastUsedAt,
    String? title,
    String? model,
    String? providerKind,
    String? endpoint,
    bool clearModel = false,
    bool clearProvider = false,
    bool clearEndpoint = false,
  }) {
    return CodingExtSession(
      id: id,
      harness: harness,
      cwd: cwd,
      title: title ?? this.title,
      createdAt: createdAt,
      lastUsedAt: lastUsedAt ?? this.lastUsedAt,
      model: clearModel ? null : (model ?? this.model),
      providerKind:
          clearProvider ? null : (providerKind ?? this.providerKind),
      endpoint: clearEndpoint ? null : (endpoint ?? this.endpoint),
    );
  }
}

String _newExtSessionId(String harness) {
  final uuid = DateTime.now().toUtc().microsecondsSinceEpoch.toRadixString(36);
  final suffix = (DateTime.now().millisecondsSinceEpoch % 0xffff)
      .toRadixString(16)
      .padLeft(4, '0');
  return 'ext:$harness:$uuid$suffix';
}

String defaultCodingExtTitle(String cwd) {
  final base = codingProjectLabelFromPath(cwd);
  return base.isEmpty ? kCodingExtPlaceholderTitle : base;
}

String codingExtTitleFromUserPrompt(String prompt) {
  final oneLine = prompt
      .trim()
      .split(RegExp(r'[\r\n]+'))
      .firstWhere((l) => l.trim().isNotEmpty, orElse: () => '')
      .trim();
  if (oneLine.isEmpty) return kCodingExtPlaceholderTitle;
  if (oneLine.length <= 48) return oneLine;
  return '${oneLine.substring(0, 45)}…';
}

bool shouldAutoSetCodingExtTitle(String title, String harness, String cwd) {
  final trimmed = title.trim();
  if (trimmed.isEmpty || trimmed == kCodingExtPlaceholderTitle) return true;
  if (trimmed == harness.trim()) return true;
  if (cwd.trim().isNotEmpty && trimmed == defaultCodingExtTitle(cwd)) {
    return true;
  }
  return false;
}

Future<List<CodingExtSession>> loadCodingExtSessions() async {
  try {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(kCodingExtSessionsKey);
    if (raw == null || raw.isEmpty) return const [];
    final parsed = jsonDecode(raw);
    if (parsed is! List) return const [];
    final out = <CodingExtSession>[];
    final seen = <String>{};
    var strippedSecrets = false;
    for (final row in parsed) {
      if (row is! Map) continue;
      final map = Map<String, dynamic>.from(row);
      if (map['apiKey'] is String && (map['apiKey'] as String).trim().isNotEmpty) {
        strippedSecrets = true;
        map.remove('apiKey');
      }
      final session = CodingExtSession.fromJson(map);
      if (session.id.isEmpty ||
          session.cwd.isEmpty ||
          !isCodingTierBHarnessId(session.harness)) {
        continue;
      }
      if (seen.contains(session.id)) continue;
      seen.add(session.id);
      out.add(session);
    }
    out.sort((a, b) => b.lastUsedAt.compareTo(a.lastUsedAt));
    if (strippedSecrets) await _saveCodingExtSessions(out);
    return out;
  } catch (_) {
    return const [];
  }
}

Future<void> _saveCodingExtSessions(List<CodingExtSession> sessions) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(
    kCodingExtSessionsKey,
    jsonEncode(sessions.map((s) => s.toJson()).toList()),
  );
}

Future<CodingExtSession> createCodingExtSession({
  required String harness,
  required String cwd,
  String? title,
  String? model,
  String? providerKind,
  String? endpoint,
}) async {
  final h = harness.trim();
  if (!isCodingTierBHarnessId(h)) {
    throw StateError('Not a Tier B harness: $h');
  }
  final path = cwd.trim();
  if (path.isEmpty) throw StateError('cwd is required');
  final now = DateTime.now().toUtc().toIso8601String();
  final session = CodingExtSession(
    id: _newExtSessionId(h),
    harness: h,
    cwd: path,
    title: title?.trim().isNotEmpty == true
        ? title!.trim()
        : defaultCodingExtTitle(path),
    createdAt: now,
    lastUsedAt: now,
    model: model?.trim().isNotEmpty == true ? model!.trim() : null,
    providerKind: providerKind == 'openai-compatible' ||
            providerKind == 'anthropic-compatible'
        ? providerKind
        : null,
    endpoint: endpoint?.trim().isNotEmpty == true ? endpoint!.trim() : null,
  );
  final all = List<CodingExtSession>.from(await loadCodingExtSessions());
  all.insert(0, session);
  await _saveCodingExtSessions(all);
  return session;
}

Future<void> touchCodingExtSession(String id) async {
  final all = List<CodingExtSession>.from(await loadCodingExtSessions());
  final i = all.indexWhere((s) => s.id == id);
  if (i < 0) return;
  all[i] = all[i].copyWith(
    lastUsedAt: DateTime.now().toUtc().toIso8601String(),
  );
  await _saveCodingExtSessions(all);
}

Future<void> updateCodingExtSessionTitle(String id, String title) async {
  final next = title.trim();
  if (next.isEmpty) return;
  final all = List<CodingExtSession>.from(await loadCodingExtSessions());
  final i = all.indexWhere((s) => s.id == id);
  if (i < 0) return;
  if (all[i].title == next) return;
  all[i] = all[i].copyWith(
    title: next,
    lastUsedAt: DateTime.now().toUtc().toIso8601String(),
  );
  await _saveCodingExtSessions(all);
}

Future<void> updateCodingExtSessionRuntime(
  String id, {
  String? model,
  String? providerKind,
  String? endpoint,
}) async {
  final all = List<CodingExtSession>.from(await loadCodingExtSessions());
  final i = all.indexWhere((s) => s.id == id);
  if (i < 0) return;
  all[i] = all[i].copyWith(
    model: model,
    providerKind: providerKind,
    endpoint: endpoint,
    clearModel: model != null && model.trim().isEmpty,
    clearProvider: providerKind != null && providerKind.trim().isEmpty,
    clearEndpoint: endpoint != null && endpoint.trim().isEmpty,
    lastUsedAt: DateTime.now().toUtc().toIso8601String(),
  );
  await _saveCodingExtSessions(all);
}

/// Change the agent (and model) on one Tier B task. Other sessions stay put.
Future<CodingExtSession?> updateCodingExtSessionAgent(
  String id, {
  required String harness,
  String? model,
  String? providerKind,
  String? endpoint,
}) async {
  final h = harness.trim();
  if (!isCodingTierBHarnessId(h)) return null;
  final all = List<CodingExtSession>.from(await loadCodingExtSessions());
  final i = all.indexWhere((s) => s.id == id);
  if (i < 0) return null;
  final cur = all[i];
  final nextModel = (model ?? '').trim();
  final nextEndpoint = (endpoint ?? '').trim();
  final nextProvider = providerKind == 'openai-compatible' ||
          providerKind == 'anthropic-compatible'
      ? providerKind
      : null;
  all[i] = CodingExtSession(
    id: cur.id,
    harness: h,
    cwd: cur.cwd,
    title: cur.title,
    createdAt: cur.createdAt,
    lastUsedAt: DateTime.now().toUtc().toIso8601String(),
    model: nextModel.isEmpty ? null : nextModel,
    providerKind: nextProvider,
    endpoint: nextEndpoint.isEmpty ? null : nextEndpoint,
  );
  await _saveCodingExtSessions(all);
  return all[i];
}

Future<String?> maybeAutoTitleCodingExtSession(
  String id,
  String prompt,
) async {
  final session = await getCodingExtSession(id);
  if (session == null) return null;
  if (!shouldAutoSetCodingExtTitle(
    session.title,
    session.harness,
    session.cwd,
  )) {
    return null;
  }
  final next = codingExtTitleFromUserPrompt(prompt);
  if (next == kCodingExtPlaceholderTitle) return null;
  await updateCodingExtSessionTitle(id, next);
  return next;
}

Future<void> removeCodingExtSession(String id) async {
  final next =
      (await loadCodingExtSessions()).where((s) => s.id != id).toList();
  await _saveCodingExtSessions(next);
}

Future<CodingExtSession?> getCodingExtSession(String id) async {
  final all = await loadCodingExtSessions();
  for (final s in all) {
    if (s.id == id) return s;
  }
  return null;
}
