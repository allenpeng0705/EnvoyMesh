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