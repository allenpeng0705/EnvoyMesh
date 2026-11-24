/// Coding list History filters (port of Social `coding-history.ts`).
library;

import 'coding_archive.dart';

const codingRecentDays = 14;

class CodingHistoryRowMeta {
  const CodingHistoryRowMeta({
    required this.kind,
    required this.id,
    required this.lastUsedAt,
    this.uiBucket,
    this.extNeedsInstall = false,
  });

  final String kind;
  final String id;
  final DateTime? lastUsedAt;
  /// EH only: `needs_input` | `failed` | `attention` | `running` | `done`.
  final String? uiBucket;
  final bool extNeedsInstall;
}

bool codingRowNeedsYou(CodingHistoryRowMeta row) {
  if (row.kind == 'eh') {
    final b = row.uiBucket;
    return b == 'needs_input' || b == 'attention' || b == 'failed';
  }
  if (row.kind == 'ext' && row.extNeedsInstall) return true;
  return false;
}

bool codingRowIsRecent(
  DateTime? lastUsedAt, {
  DateTime? now,
  int days = codingRecentDays,
}) {
  final at = lastUsedAt;
  if (at == null) return false;
  final t = now ?? DateTime.now();
  return t.difference(at).inDays <= days;
}

bool codingRowMatchesFilter(
  CodingHistoryRowMeta row,
  CodingHistoryFilter filter,
  Set<String> archived, {
  DateTime? now,
}) {
  final key = codingArchiveKey(row.kind, row.id);
  final isArchived = archived.contains(key);
  if (filter == CodingHistoryFilter.archived) return isArchived;
  if (isArchived) return false;
  if (filter == CodingHistoryFilter.needsYou) return codingRowNeedsYou(row);
  if (filter == CodingHistoryFilter.recent) {
    return codingRowIsRecent(row.lastUsedAt, now: now);
  }
  return true;
}

DateTime? parseCodingLastUsedAt(Object? raw) {
  if (raw == null) return null;
  final s = raw.toString().trim();
  if (s.isEmpty) return null;
  return DateTime.tryParse(s);
}