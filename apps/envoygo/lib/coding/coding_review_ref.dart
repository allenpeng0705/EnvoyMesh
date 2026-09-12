import 'dart:convert';

/// Phase 68-C2 — mesh peer-review deep-link embedded in chat bodies.
///
/// Marker line is parseable without a custom OS URL scheme:
/// `[envoymesh-coding-review]{"kind":"eh-workspace-review","v":1,...}`
///
/// Port of `packages/api/src/coding-review-ref.ts`.

const codingReviewRefKind = 'eh-workspace-review';

const codingReviewMarker = '[envoymesh-coding-review]';

class CodingReviewRef {
  const CodingReviewRef({
    required this.ownerId,
    required this.chatId,
    this.title,
    this.cwd,
    this.turnId,
    this.revision,
  });

  final String ownerId;
  final String chatId;
  final String? title;
  final String? cwd;
  final String? turnId;
  final int? revision;

  String get kind => codingReviewRefKind;
  int get v => 1;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is CodingReviewRef &&
          ownerId == other.ownerId &&
          chatId == other.chatId &&
          title == other.title &&
          cwd == other.cwd &&
          turnId == other.turnId &&
          revision == other.revision;

  @override
  int get hashCode => Object.hash(ownerId, chatId, title, cwd, turnId, revision);
}

/// Encode a single machine footer line peers can parse from chat text.
String encodeCodingReviewRef(CodingReviewRef ref) {
  final payload = <String, dynamic>{
    'kind': codingReviewRefKind,
    'v': 1,
    'ownerId': ref.ownerId.trim(),
    'chatId': ref.chatId.trim(),
  };
  final title = ref.title?.trim();
  if (title != null && title.isNotEmpty) payload['title'] = title;
  final cwd = ref.cwd?.trim();
  if (cwd != null && cwd.isNotEmpty) payload['cwd'] = cwd;
  final turnId = ref.turnId?.trim();
  if (turnId != null && turnId.isNotEmpty) payload['turnId'] = turnId;
  final revision = ref.revision;
  if (revision != null && revision.isFinite) {
    payload['revision'] = revision.floor();
  }
  return '$codingReviewMarker${jsonEncode(payload)}';
}

/// Find and parse a coding-review marker from a chat body (any line).
CodingReviewRef? parseCodingReviewRef(String? text) {
  if (text == null || text.isEmpty) return null;
  final idx = text.indexOf(codingReviewMarker);
  if (idx < 0) return null;
  final after = text.substring(idx + codingReviewMarker.length);
  final jsonStart = after.indexOf('{');
  if (jsonStart < 0) return null;
  var depth = 0;
  var end = -1;
  for (var i = jsonStart; i < after.length; i++) {
    final ch = after[i];
    if (ch == '{') {
      depth++;
    } else if (ch == '}') {
      depth--;
      if (depth == 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return null;
  try {
    final raw = jsonDecode(after.substring(jsonStart, end + 1));
    if (raw is! Map) return null;
    final obj = Map<String, dynamic>.from(raw);
    if (obj['kind'] != codingReviewRefKind) return null;
    if (obj['v'] != 1) return null;
    final ownerId =
        (obj['ownerId'] is String) ? (obj['ownerId'] as String).trim() : '';
    final chatId =
        (obj['chatId'] is String) ? (obj['chatId'] as String).trim() : '';
    if (ownerId.isEmpty || chatId.isEmpty) return null;
    String? title;
    final titleRaw = obj['title'];
    if (titleRaw is String && titleRaw.trim().isNotEmpty) {
      title = titleRaw.trim();
    }
    String? cwd;
    final cwdRaw = obj['cwd'];
    if (cwdRaw is String && cwdRaw.trim().isNotEmpty) {
      cwd = cwdRaw.trim();
    }
    String? turnId;
    final turnRaw = obj['turnId'];
    if (turnRaw is String && turnRaw.trim().isNotEmpty) {
      turnId = turnRaw.trim();
    }
    int? revision;
    final revRaw = obj['revision'];
    if (revRaw is num && revRaw.isFinite) {
      revision = revRaw.floor();
    }
    return CodingReviewRef(
      ownerId: ownerId,
      chatId: chatId,
      title: title,
      cwd: cwd,
      turnId: turnId,
      revision: revision,
    );
  } catch (_) {
    return null;
  }
}

/// Human-readable invite plus machine footer.
String formatCodingReviewInviteMessage(CodingReviewRef ref) {
  final title = ref.title?.trim();
  final human = (title != null && title.isNotEmpty)
      ? 'I\'ve invited you to review the Coding workspace “$title”. Open it on the owner\'s home node to view the timeline and changes (read-only).'
      : 'I\'ve invited you to review a Coding workspace. Open it on the owner\'s home node to view the timeline and changes (read-only).';
  return '$human\n\n${encodeCodingReviewRef(ref)}';
}

/// Strip the machine marker line, leaving human invite text for display.
String humanTextWithoutCodingReviewMarker(String text) {
  final markerIdx = text.indexOf(codingReviewMarker);
  if (markerIdx < 0) return text;
  return text.substring(0, markerIdx).trimRight();
}
