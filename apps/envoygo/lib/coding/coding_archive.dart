/// Client-side Coding archive + history filter (port of Social coding-archive / history).
library;

import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

const kCodingArchivedKey = 'envoymesh.codingArchived';
const kCodingHistoryFilterKey = 'envoymesh.codingHistoryFilter';

typedef CodingArchiveKind = String; // eh | pi | ext

enum CodingHistoryFilter { all, needsYou, recent, archived }

const kCodingHistoryFlatKey = 'envoymesh.codingHistoryFlat';

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

String codingHistoryFilterWire(CodingHistoryFilter filter) {
  switch (filter) {
    case CodingHistoryFilter.needsYou:
      return 'needs_you';
    case CodingHistoryFilter.recent:
      return 'recent';
    case CodingHistoryFilter.archived:
      return 'archived';
    case CodingHistoryFilter.all:
      return 'all';
  }
}

CodingHistoryFilter parseCodingHistoryFilter(String? raw) {
  switch (raw?.trim()) {
    case 'needs_you':
      return CodingHistoryFilter.needsYou;
    case 'recent':
      return CodingHistoryFilter.recent;
    case 'archived':
      return CodingHistoryFilter.archived;
    default:
      return CodingHistoryFilter.all;
  }
}

Future<CodingHistoryFilter> loadCodingHistoryFilter() async {
  final prefs = await SharedPreferences.getInstance();
  return parseCodingHistoryFilter(prefs.getString(kCodingHistoryFilterKey));
}

Future<void> saveCodingHistoryFilter(CodingHistoryFilter filter) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(
    kCodingHistoryFilterKey,
    codingHistoryFilterWire(filter),
  );
}

Future<bool> loadCodingHistoryFlatMode() async {
  final prefs = await SharedPreferences.getInstance();
  final raw = prefs.getString(kCodingHistoryFlatKey)?.trim() ?? '';
  return raw == '1' || raw == 'true';
}

Future<void> saveCodingHistoryFlatMode(bool flat) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(kCodingHistoryFlatKey, flat ? '1' : '0');
}
