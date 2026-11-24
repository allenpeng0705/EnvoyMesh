import 'dart:convert';

/// FH-P2-C — mesh-lite Coding work marker in chat bodies.
///
/// `[envoymesh-coding-work]{"kind":"eh-mesh-work","v":1,...}`
///
/// Port of `packages/api/src/eh-mesh-work.ts`.

const ehMeshWorkKind = 'eh-mesh-work';

const ehMeshWorkMarker = '[envoymesh-coding-work]';

class EhMeshWorkRef {
  const EhMeshWorkRef({
    required this.workId,
    required this.prompt,
    required this.fromOwnerId,
    this.cwd,
    this.chatId,
    this.title,
  });

  final String workId;
  final String prompt;
  final String fromOwnerId;
  final String? cwd;
  final String? chatId;
  final String? title;

  String get kind => ehMeshWorkKind;
  int get v => 1;
}

EhMeshWorkRef? parseEhMeshWorkRef(String? text) {
  if (text == null || text.isEmpty) return null;
  final idx = text.indexOf(ehMeshWorkMarker);
  if (idx < 0) return null;
  final after = text.substring(idx + ehMeshWorkMarker.length);
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
    if (raw['kind'] != ehMeshWorkKind) return null;
    if (raw['v'] != 1) return null;
    final workId = (raw['workId'] as String?)?.trim() ?? '';
    final prompt = (raw['prompt'] as String?)?.trim() ?? '';
    final fromOwnerId = (raw['fromOwnerId'] as String?)?.trim() ?? '';
    if (workId.isEmpty || prompt.isEmpty || fromOwnerId.isEmpty) return null;
    return EhMeshWorkRef(
      workId: workId,
      prompt: prompt,
      fromOwnerId: fromOwnerId,
      cwd: (raw['cwd'] as String?)?.trim(),
      chatId: (raw['chatId'] as String?)?.trim(),
      title: (raw['title'] as String?)?.trim(),
    );
  } catch (_) {
    return null;
  }
}

String humanTextWithoutEhMeshWorkMarker(String text) {
  final idx = text.indexOf(ehMeshWorkMarker);
  if (idx < 0) return text;
  return text.substring(0, idx).trimRight();
}