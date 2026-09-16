/// Client-side Coding archive + history filter (port of Social coding-archive / history).
library;

import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

const kCodingArchivedKey = 'envoymesh.codingArchived';
const kCodingHistoryFilterKey = 'envoymesh.codingHistoryFilter';

typedef CodingArchiveKind = String; // eh | pi | ext

enum CodingHistoryFilter { all, archived }

String codingArchiveKey(CodingArchiveKind kind, String id) =>
    '${kind.trim()}:${id.trim()}';

Future<Set<String>> loadCodingArchivedKeys() async {
  try {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(kCodingArchivedKey);
    if (raw == null || raw.isEmpty) return {};
    final parsed = jsonDecode(raw);
    if (parsed is! List) return {};
    return {
      for (final row in parsed)
        if (row != null && row.toString().trim().isNotEmpty)
          row.toString().trim(),
    };
  } catch (_) {
    return {};
  }
}

Future<void> _saveArchived(Set<String> keys) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(kCodingArchivedKey, jsonEncode(keys.toList()));
}

Future<void> archiveCodingTask(String key) async {
  final k = key.trim();
  if (k.isEmpty) return;
  final keys = await loadCodingArchivedKeys();
  if (keys.contains(k)) return;
  keys.add(k);
  await _saveArchived(keys);
}

Future<void> unarchiveCodingTask(String key) async {
  final k = key.trim();
  if (k.isEmpty) return;
  final keys = await loadCodingArchivedKeys();
  if (!keys.remove(k)) return;
  await _saveArchived(keys);
}

Future<CodingHistoryFilter> loadCodingHistoryFilter() async {
  final prefs = await SharedPreferences.getInstance();
  final raw = prefs.getString(kCodingHistoryFilterKey)?.trim() ?? '';
  if (raw == 'archived') return CodingHistoryFilter.archived;
  return CodingHistoryFilter.all;
}

Future<void> saveCodingHistoryFilter(CodingHistoryFilter filter) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(
    kCodingHistoryFilterKey,
    filter == CodingHistoryFilter.archived ? 'archived' : 'all',
  );
}
