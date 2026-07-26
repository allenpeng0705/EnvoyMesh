/// Models for Phase 45 web content / library RPCs (EnvoyGo thin client).
library web_content;

class WebContentSectionSummary {
  final String title;
  final String slug;
  final String path;
  final String url;
  final String visibility;
  final List<String>? tags;
  final String updatedAt;

  const WebContentSectionSummary({
    required this.title,
    required this.slug,
    required this.path,
    required this.url,
    required this.visibility,
    this.tags,
    required this.updatedAt,
  });

  factory WebContentSectionSummary.fromJson(Map<String, dynamic> json) {
    return WebContentSectionSummary(
      title: (json['title'] as String?) ?? '',
      slug: (json['slug'] as String?) ?? '',
      path: (json['path'] as String?) ?? '',
      url: (json['url'] as String?) ?? '',
      visibility: (json['visibility'] as String?) ?? 'bonded',
      tags: (json['tags'] as List<dynamic>?)
          ?.map((e) => e.toString())
          .toList(),
      updatedAt: (json['updatedAt'] as String?) ?? '',
    );
  }
}

class EnsureDefaultWebSiteResult {
  final List<String> created;
  final String profileUrl;
  final String blogUrl;
  final String photowallUrl;

  const EnsureDefaultWebSiteResult({
    required this.created,
    required this.profileUrl,
    required this.blogUrl,
    required this.photowallUrl,
  });

  factory EnsureDefaultWebSiteResult.fromJson(Map<String, dynamic> json) {
    final urls = (json['urls'] as Map<String, dynamic>?) ?? const {};
    final created = (json['created'] as List<dynamic>?)
            ?.map((e) => e.toString())
            .toList() ??
        const <String>[];
    return EnsureDefaultWebSiteResult(
      created: created,
      profileUrl: (urls['profile'] as String?) ?? '',
      blogUrl: (urls['blog'] as String?) ?? '',
      photowallUrl: (urls['photowall'] as String?) ?? '',
    );
  }
}

class PublishWebContentResult {
  final String path;
  final String url;
  final String? listingUrl;
  final String title;
  final String visibility;
  final String contentHash;
  final int byteLength;

  const PublishWebContentResult({
    required this.path,
    required this.url,
    this.listingUrl,
    required this.title,
    required this.visibility,
    required this.contentHash,
    required this.byteLength,
  });

  factory PublishWebContentResult.fromJson(Map<String, dynamic> json) {
    return PublishWebContentResult(
      path: (json['path'] as String?) ?? '',
      url: (json['url'] as String?) ?? '',
      listingUrl: json['listingUrl'] as String?,
      title: (json['title'] as String?) ?? '',
      visibility: (json['visibility'] as String?) ?? 'bonded',
      contentHash: (json['contentHash'] as String?) ?? '',
      byteLength: (json['byteLength'] as num?)?.toInt() ?? 0,
    );
  }
}

/// Own Feed (Friend Circle) post from home `listFeedPosts`.
class FeedPostSummary {
  final String path;
  final String url;
  final String title;
  final String? summary;
  final String? bodyPreview;
  final String publishedAt;
  final String visibility;
  final List<String> imageUrls;
  final String publisherOwnerId;

  const FeedPostSummary({
    required this.path,
    required this.url,
    required this.title,
    this.summary,
    this.bodyPreview,
    required this.publishedAt,
    required this.visibility,
    required this.imageUrls,
    required this.publisherOwnerId,
  });

  factory FeedPostSummary.fromJson(Map<String, dynamic> json) {
    final images = (json['imageUrls'] as List<dynamic>?)
            ?.map((e) => e.toString())
            .toList() ??
        const <String>[];
    return FeedPostSummary(
      path: (json['path'] as String?) ?? '',
      url: (json['url'] as String?) ?? '',
      title: (json['title'] as String?) ?? '',
      summary: json['summary'] as String?,
      bodyPreview: json['bodyPreview'] as String?,
      publishedAt: (json['publishedAt'] as String?) ?? '',
      visibility: (json['visibility'] as String?) ?? 'bonded',
      imageUrls: images,
      publisherOwnerId: (json['publisherOwnerId'] as String?) ?? '',
    );
  }
}

/// Own Blog post from home `listBlogPosts`.
class BlogPostSummary {
  final String path;
  final String url;
  final String title;
  final String? summary;
  final String? bodyPreview;
  final String publishedAt;
  final String visibility;
  final String publisherOwnerId;

  const BlogPostSummary({
    required this.path,
    required this.url,
    required this.title,
    this.summary,
    this.bodyPreview,
    required this.publishedAt,
    required this.visibility,
    required this.publisherOwnerId,
  });

  factory BlogPostSummary.fromJson(Map<String, dynamic> json) {
    return BlogPostSummary(
      path: (json['path'] as String?) ?? '',
      url: (json['url'] as String?) ?? '',
      title: (json['title'] as String?) ?? '',
      summary: json['summary'] as String?,
      bodyPreview: json['bodyPreview'] as String?,
      publishedAt: (json['publishedAt'] as String?) ?? '',
      visibility: (json['visibility'] as String?) ?? 'bonded',
      publisherOwnerId: (json['publisherOwnerId'] as String?) ?? '',
    );
  }
}

class LocalFileItem {
  final String source;
  final String relativePath;
  final String title;
  final String extension;
  final int byteLength;
  final String updatedAt;
  final String? documentId;
  final bool? published;

  const LocalFileItem({
    required this.source,
    required this.relativePath,
    required this.title,
    required this.extension,
    required this.byteLength,
    required this.updatedAt,
    this.documentId,
    this.published,
  });

  factory LocalFileItem.fromJson(Map<String, dynamic> json) {
    return LocalFileItem(
      source: (json['source'] as String?) ?? 'vault',
      relativePath: (json['relativePath'] as String?) ?? '',
      title: (json['title'] as String?) ?? '',
      extension: (json['extension'] as String?) ?? '',
      byteLength: (json['byteLength'] as num?)?.toInt() ?? 0,
      updatedAt: (json['updatedAt'] as String?) ?? '',
      documentId: json['documentId'] as String?,
      published: json['published'] as bool?,
    );
  }
}

class ListAllLocalFilesResult {
  final List<LocalFileItem> items;
  final int vaultCount;
  final int workspaceCount;

  const ListAllLocalFilesResult({
    required this.items,
    required this.vaultCount,
    required this.workspaceCount,
  });

  factory ListAllLocalFilesResult.fromJson(Map<String, dynamic> json) {
    final list = (json['items'] as List<dynamic>?) ?? const [];
    return ListAllLocalFilesResult(
      items: list
          .map((e) => LocalFileItem.fromJson(e as Map<String, dynamic>))
          .toList(),
      vaultCount: (json['vaultCount'] as num?)?.toInt() ?? 0,
      workspaceCount: (json['workspaceCount'] as num?)?.toInt() ?? 0,
    );
  }
}

class ContentEngagementComment {
  final String id;
  final String authorOwnerId;
  final String text;
  final String createdAt;

  const ContentEngagementComment({
    required this.id,
    required this.authorOwnerId,
    required this.text,
    required this.createdAt,
  });

  factory ContentEngagementComment.fromJson(Map<String, dynamic> json) {
    return ContentEngagementComment(
      id: (json['id'] as String?) ?? '',
      authorOwnerId: (json['authorOwnerId'] as String?) ?? '',
      text: (json['text'] as String?) ?? '',
      createdAt: (json['createdAt'] as String?) ?? '',
    );
  }
}

class ContentEngagementSummary {
  final String url;
  final int starCount;
  final bool starredByMe;
  final List<String> starOwnerIds;
  final int commentCount;
  final List<ContentEngagementComment> comments;

  const ContentEngagementSummary({
    required this.url,
    required this.starCount,
    required this.starredByMe,
    required this.starOwnerIds,
    required this.commentCount,
    required this.comments,
  });

  factory ContentEngagementSummary.fromJson(Map<String, dynamic> json) {
    final list = (json['comments'] as List<dynamic>?) ?? const [];
    final stars = (json['starOwnerIds'] as List<dynamic>?) ?? const [];
    return ContentEngagementSummary(
      url: (json['url'] as String?) ?? '',
      starCount: (json['starCount'] as num?)?.toInt() ?? 0,
      starredByMe: json['starredByMe'] as bool? ?? false,
      starOwnerIds: stars.map((e) => e.toString()).toList(),
      commentCount: (json['commentCount'] as num?)?.toInt() ?? 0,
      comments: list
          .map((e) => ContentEngagementComment.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}
