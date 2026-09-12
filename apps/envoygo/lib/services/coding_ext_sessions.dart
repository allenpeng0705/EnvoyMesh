import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// Client-side Coding Tier B (Ext Agent) session registry.
///
/// EH / Pi live on the home node; Tier B sessions are local only
/// (SharedPreferences port of Social `coding-sessions.ts`).
const kCodingExtSessionsKey = 'envoymesh.codingExtSessions';

const _tierBHarnesses = {
  'claudecode',
  'codex',
  'opencode',
  'cursor',
  'codewhale',
};

bool isCodingTierBHarnessId(String harness) =>
    _tierBHarnesses.contains(harness.trim());

class CodingExtSession {
  const CodingExtSession({
    required this.id,
    required this.harness,
    required this.cwd,
    required this.title,
    required this.createdAt,
    required this.lastUsedAt,
  });

  final String id;
  final String harness;
  final String cwd;
  final String title;
  final String createdAt;
  final String lastUsedAt;

  Map<String, dynamic> toJson() => {
        'id': id,
        'harness': harness,
        'cwd': cwd,
        'title': title,
        'createdAt': createdAt,
        'lastUsedAt': lastUsedAt,
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
          : ((json['harness'] as String?)?.trim() ?? ''),
      createdAt: createdAt,
      lastUsedAt: lastUsed,
    );
  }

  CodingExtSession copyWith({String? lastUsedAt, String? title}) {
    return CodingExtSession(
      id: id,
      harness: harness,
      cwd: cwd,
      title: title ?? this.title,
      createdAt: createdAt,
      lastUsedAt: lastUsedAt ?? this.lastUsedAt,
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

Future<List<CodingExtSession>> loadCodingExtSessions() async {
  try {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(kCodingExtSessionsKey);
    if (raw == null || raw.isEmpty) return const [];
    final parsed = jsonDecode(raw);
    if (parsed is! List) return const [];
    final out = <CodingExtSession>[];
    final seen = <String>{};
    for (final row in parsed) {
      if (row is! Map) continue;
      final session =
          CodingExtSession.fromJson(Map<String, dynamic>.from(row));
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
    title: title?.trim().isNotEmpty == true ? title!.trim() : h,
    createdAt: now,
    lastUsedAt: now,
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
