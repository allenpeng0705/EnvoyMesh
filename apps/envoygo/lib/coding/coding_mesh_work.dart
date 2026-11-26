/// FH-P2-C — mesh-lite work ticket row from home node.
class CodingMeshWorkItem {
  const CodingMeshWorkItem({
    required this.id,
    required this.prompt,
    required this.cwd,
    required this.source,
    required this.status,
    this.chatId,
    this.title,
    this.lastError,
  });

  final String id;
  final String prompt;
  final String cwd;
  final String source;
  final String status;
  final String? chatId;
  final String? title;
  final String? lastError;

  factory CodingMeshWorkItem.fromJson(Map<String, dynamic> json) {
    return CodingMeshWorkItem(
      id: (json['id'] as String?)?.trim() ?? '',
      prompt: (json['prompt'] as String?)?.trim() ?? '',
      cwd: (json['cwd'] as String?)?.trim() ?? '',
      source: (json['source'] as String?)?.trim() ?? 'owner',
      status: (json['status'] as String?)?.trim() ?? 'pending',
      chatId: (json['chatId'] as String?)?.trim(),
      title: (json['title'] as String?)?.trim(),
      lastError: (json['lastError'] as String?)?.trim(),
    );
  }
}

/// Pull a known mesh-work / dispatch code out of a wrapped RPC error string.
String extractEhMeshWorkErrorCode(String? raw) {
  final text = (raw ?? '').trim();
  if (text.isEmpty) return '';
  final match = RegExp(
    r'\b(eh_mesh_work_[a-z0-9_]+|dispatch_failed|envoy_harness_cancelled)\b',
    caseSensitive: false,
  ).firstMatch(text);
  return match?.group(1)?.toLowerCase() ?? text;
}

/// Map store / RPC error codes to short end-user copy (port of API helper).
String formatEhMeshWorkUserError(String? raw) {
  final code = extractEhMeshWorkErrorCode(raw);
  switch (code) {
    case 'eh_mesh_work_not_found':
      return 'That work item isn’t on this home yet. Wait a moment and try again.';
    case 'eh_mesh_work_dismissed':
      return 'That work item was already dismissed.';
    case 'eh_mesh_work_already_firing':
    case 'eh_mesh_work_turn_busy':
      return 'Coding is already busy with this item. Wait for it to finish.';
    case 'eh_mesh_work_interrupted':
      return 'That Coding run was interrupted. Try running it again.';
    case 'eh_mesh_work_cap':
      return 'Too many work items waiting. Dismiss some, then try again.';
    case 'eh_mesh_work_prompt_required':
    case 'eh_mesh_work_cwd_required':
      return 'That work invite is missing details. Ask your friend to send it again.';
    case 'eh_mesh_work_peer_blocked':
    case 'eh_mesh_work_peer_not_bonded':
      return 'You can only send Coding work to a bonded contact.';
    case 'dispatch_failed':
    case 'envoy_harness_cancelled':
      return 'Couldn’t start Coding for this work. Try again.';
    default:
      if (code.isEmpty) return 'That didn’t work. Try again.';
      if (code.startsWith('eh_mesh_work_')) {
        return 'That didn’t work. Try again.';
      }
      return code.length > 160 ? '${code.substring(0, 157)}…' : code;
  }
}