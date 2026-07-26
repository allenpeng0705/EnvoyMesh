/// Inbound star/comment on the owner's Feed or Blog (Content nav badge).
class ContentEngageNotification {
  final String id;
  final String receivedAt;
  final String messageId;
  final String url;
  final String surface; // feed | blog
  final String action; // star | comment | snapshot (snapshot is UI-refresh only)
  final String actorOwnerId;
  final String? text;
  final String senderPeerId;

  const ContentEngageNotification({
    required this.id,
    required this.receivedAt,
    required this.messageId,
    required this.url,
    required this.surface,
    required this.action,
    required this.actorOwnerId,
    this.text,
    required this.senderPeerId,
  });

  factory ContentEngageNotification.fromJson(Map<String, dynamic> json) {
    final id = json['id'] as String?;
    final url = json['url'] as String?;
    final surface = json['surface'] as String?;
    if (id == null || id.isEmpty) {
      throw FormatException('content engage notification missing id', json);
    }
    if (url == null || url.isEmpty) {
      throw FormatException('content engage notification missing url', json);
    }
    if (surface != 'feed' && surface != 'blog') {
      throw FormatException('content engage notification bad surface', json);
    }
    return ContentEngageNotification(
      id: id,
      receivedAt: (json['receivedAt'] as String?) ?? '',
      messageId: (json['messageId'] as String?) ?? id,
      url: url,
      surface: surface!,
      action: (json['action'] as String?) ?? 'comment',
      actorOwnerId: (json['actorOwnerId'] as String?) ?? '',
      text: json['text'] as String?,
      senderPeerId: (json['senderPeerId'] as String?) ?? '',
    );
  }
}
