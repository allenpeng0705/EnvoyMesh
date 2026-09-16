/// Client-side transcript cache for Pi / Ext Coding chats.
///
/// Home node has no durable Pi/Ext history RPC (same as Social). EnvoyGo
/// persists message rows locally so reopen restores context.
library;

import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

const kCodingTranscriptPrefix = 'envoymesh.codingTranscript.';

class CodingTranscriptMessage {
  const CodingTranscriptMessage({
    required this.id,
    required this.role,
    required this.text,
    this.createdAt,
  });

  final String id;
  final String role; // user | assistant | system
  final String text;
  final String? createdAt;

  Map<String, dynamic> toJson() => {
        'id': id,
        'role': role,
        'text': text,
        if (createdAt != null) 'createdAt': createdAt,
      };

  factory CodingTranscriptMessage.fromJson(Map<String, dynamic> json) {
    return CodingTranscriptMessage(
      id: (json['id'] as String?)?.trim() ?? '',
      role: (json['role'] as String?)?.trim() ?? 'assistant',
      text: (json['text'] as String?) ?? '',
      createdAt: (json['createdAt'] as String?)?.trim(),
    );
  }
}

String codingTranscriptKey({required String kind, required String id}) =>
    '$kCodingTranscriptPrefix$kind:${id.trim()}';

Future<List<CodingTranscriptMessage>> loadCodingTranscript({
  required String kind,
  required String id,
}) async {
  try {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(codingTranscriptKey(kind: kind, id: id));
    if (raw == null || raw.isEmpty) return const [];
    final parsed = jsonDecode(raw);
    if (parsed is! List) return const [];
    final out = <CodingTranscriptMessage>[];
    for (final row in parsed) {
      if (row is! Map) continue;
      final msg =
          CodingTranscriptMessage.fromJson(Map<String, dynamic>.from(row));
      if (msg.id.isEmpty || msg.text.trim().isEmpty) continue;
      out.add(msg);
    }
    return out;
  } catch (_) {
    return const [];
  }
}

Future<void> saveCodingTranscript({
  required String kind,
  required String id,
  required List<CodingTranscriptMessage> messages,
}) async {
  final prefs = await SharedPreferences.getInstance();
  // Cap storage — keep recent turns only.
  final trimmed = messages.length > 200
      ? messages.sublist(messages.length - 200)
      : messages;
  await prefs.setString(
    codingTranscriptKey(kind: kind, id: id),
    jsonEncode(trimmed.map((m) => m.toJson()).toList()),
  );
}

Future<void> clearCodingTranscript({
  required String kind,
  required String id,
}) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.remove(codingTranscriptKey(kind: kind, id: id));
}

/// Merge timeline message items into a durable transcript (Pi path).
List<CodingTranscriptMessage> codingMessagesFromTimelineItems(
  List<Map<String, dynamic>> items,
) {
  final out = <CodingTranscriptMessage>[];
  for (final item in items) {
    if (item['type']?.toString() != 'message') continue;
    final id = item['id']?.toString().trim() ?? '';
    final role = item['role']?.toString().trim() ?? 'assistant';
    final text = item['text']?.toString() ?? '';
    if (id.isEmpty || text.trim().isEmpty) continue;
    if (item['streaming'] == true) continue;
    out.add(
      CodingTranscriptMessage(
        id: id,
        role: role,
        text: text,
        createdAt: item['createdAt']?.toString(),
      ),
    );
  }
  return out;
}
