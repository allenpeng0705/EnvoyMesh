/// Phase 45E — inbound `feed.notify` inbox row (mirrors Social / home store).
class FeedNotification {
  final String id;
  final String receivedAt;
  final String messageId;
  final String publisherOwnerId;
  final String publishedAt;
  final String title;
  final String url;
  final String kind;
  final String visibility;
  final String? summary;
  final List<String>? tags;
  final String? contentHash;
  final String? listingUrl;
  final String senderPeerId;
  final String? readAt;

  const FeedNotification({
    required this.id,
    required this.receivedAt,
    required this.messageId,
    required this.publisherOwnerId,
    required this.publishedAt,
    required this.title,
    required this.url,
    required this.kind,
    required this.visibility,
    this.summary,
    this.tags,
    this.contentHash,
    this.listingUrl,
    required this.senderPeerId,
    this.readAt,
  });

  factory FeedNotification.fromJson(Map<String, dynamic> json) {
    final id = json['id'] as String?;
    final title = json['title'] as String?;
    final url = json['url'] as String?;
    if (id == null || id.isEmpty) {
      throw FormatException('feed notification missing id', json);
    }
    if (title == null || title.isEmpty) {
      throw FormatException('feed notification missing title', json);
    }
    if (url == null || url.isEmpty) {
      throw FormatException('feed notification missing url', json);
    }
    final tagsRaw = json['tags'];
    List<String>? tags;
    if (tagsRaw is List) {
      tags = tagsRaw.map((e) => e.toString()).toList();
    }
    return FeedNotification(
      id: id,
      receivedAt: (json['receivedAt'] as String?) ?? '',
      messageId: (json['messageId'] as String?) ?? '',
      publisherOwnerId: (json['publisherOwnerId'] as String?) ?? '',
      publishedAt: (json['publishedAt'] as String?) ?? '',
      title: title,
      url: url,
      kind: (json['kind'] as String?) ?? 'article',
      visibility: (json['visibility'] as String?) ?? 'bonded',
      summary: json['summary'] as String?,
      tags: tags,
      contentHash: json['contentHash'] as String?,
      listingUrl: json['listingUrl'] as String?,
      senderPeerId: (json['senderPeerId'] as String?) ?? '',
      readAt: json['readAt'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'receivedAt': receivedAt,
        'messageId': messageId,
        'publisherOwnerId': publisherOwnerId,
        'publishedAt': publishedAt,
        'title': title,
        'url': url,
        'kind': kind,
        'visibility': visibility,
        if (summary != null) 'summary': summary,
        if (tags != null) 'tags': tags,
        if (contentHash != null) 'contentHash': contentHash,
        if (listingUrl != null) 'listingUrl': listingUrl,
        'senderPeerId': senderPeerId,
        if (readAt != null) 'readAt': readAt,
      };

  bool get isUnread => readAt == null || readAt!.trim().isEmpty;

  FeedNotification copyWith({String? readAt}) {
    return FeedNotification(
      id: id,
      receivedAt: receivedAt,
      messageId: messageId,
      publisherOwnerId: publisherOwnerId,
      publishedAt: publishedAt,
      title: title,
      url: url,
      kind: kind,
      visibility: visibility,
      summary: summary,
      tags: tags,
      contentHash: contentHash,
      listingUrl: listingUrl,
      senderPeerId: senderPeerId,
      readAt: readAt ?? this.readAt,
    );
  }
}
