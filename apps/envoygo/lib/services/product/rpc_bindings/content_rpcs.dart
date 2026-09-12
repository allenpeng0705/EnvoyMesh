import '../../../models/web_content.dart';
import '../../home_rpc_session.dart';

/// Content/knowledge bindings: web content, feed/blog and the home vault.
mixin ContentRpcs on HomeRpcSession {
  Future<EnsureDefaultWebSiteResult> ensureDefaultWebSite() async {
    final result =
        await homeClient.call('ensureDefaultWebSite') as Map<String, dynamic>;
    return EnsureDefaultWebSiteResult.fromJson(result);
  }

  Future<List<WebContentSectionSummary>> listWebContentSections() async {
    final result = await homeClient.call('listWebContentSections');
    final list = result as List<dynamic>;
    return list
        .map(
          (e) => WebContentSectionSummary.fromJson(e as Map<String, dynamic>),
        )
        .toList();
  }

  Future<List<FeedPostSummary>> listFeedPosts() async {
    final result = await homeClient.call('listFeedPosts');
    final list = (result as List<dynamic>?) ?? const [];
    return list
        .map((e) => FeedPostSummary.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<BlogPostSummary>> listBlogPosts() async {
    final result = await homeClient.call('listBlogPosts');
    final list = (result as List<dynamic>?) ?? const [];
    return list
        .map((e) => BlogPostSummary.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<ContentEngagementSummary> getContentEngagement({
    required String url,
  }) async {
    final result =
        await homeClient.call('getContentEngagement', {'url': url})
            as Map<String, dynamic>;
    return ContentEngagementSummary.fromJson(result);
  }

  Future<ContentEngagementSummary> toggleContentStar({
    required String url,
  }) async {
    final result =
        await homeClient.call('toggleContentStar', {'url': url})
            as Map<String, dynamic>;
    return ContentEngagementSummary.fromJson(result);
  }

  Future<ContentEngagementSummary> addContentComment({
    required String url,
    required String text,
  }) async {
    final result =
        await homeClient.call('addContentComment', {'url': url, 'text': text})
            as Map<String, dynamic>;
    return ContentEngagementSummary.fromJson(result);
  }

  Future<ContentEngagementSummary> removeContentComment({
    required String url,
    required String commentId,
  }) async {
    final result =
        await homeClient.call('removeContentComment', {
              'url': url,
              'commentId': commentId,
            })
            as Map<String, dynamic>;
    return ContentEngagementSummary.fromJson(result);
  }

  Future<Map<String, dynamic>> deleteWebContentEntry({
    required String path,
    String? ownerId,
  }) async {
    final result =
        await homeClient.call('deleteWebContentEntry', {
              'path': path,
              if (ownerId != null) 'ownerId': ownerId,
            })
            as Map<String, dynamic>;
    return result;
  }

  /// Draft site/Feed content via home AI (`draftAuthorContent`).
  /// Returns `{ ok: true, text }` or `{ ok: false, reason }`.
  Future<Map<String, dynamic>> draftAuthorContent({
    required String surface,
    required String mode,
    required String tone,
    String? hint,
    String? title,
    String? existingText,
    String? locale,
    Map<String, dynamic>? profileContext,
  }) async {
    return await homeClient.call('draftAuthorContent', {
          'surface': surface,
          'mode': mode,
          'tone': tone,
          if (hint != null && hint.isNotEmpty) 'hint': hint,
          if (title != null && title.isNotEmpty) 'title': title,
          if (existingText != null && existingText.isNotEmpty)
            'existingText': existingText,
          if (locale != null && locale.isNotEmpty) 'locale': locale,
          if (profileContext != null) 'profileContext': profileContext,
        })
        as Map<String, dynamic>;
  }

  Future<PublishWebContentResult> publishWebContentEntry({
    required String template,
    required String title,
    required String visibility,
    String? body,
    List<String>? contactIds,
    List<String>? tags,
    String? contentBase64,
    String? mimeType,
    String? fileName,
    String? gallery,
    String? stablePath,
    String? sectionSlug,
    bool? advertiseTopic,
    List<Map<String, String>>? images,
  }) async {
    final result =
        await homeClient.call('publishWebContentEntry', {
              'template': template,
              'title': title,
              'visibility': visibility,
              if (body != null) 'body': body,
              if (contactIds != null) 'contactIds': contactIds,
              if (tags != null) 'tags': tags,
              if (contentBase64 != null) 'contentBase64': contentBase64,
              if (mimeType != null) 'mimeType': mimeType,
              if (fileName != null) 'fileName': fileName,
              if (gallery != null) 'gallery': gallery,
              if (stablePath != null) 'stablePath': stablePath,
              if (sectionSlug != null) 'sectionSlug': sectionSlug,
              if (advertiseTopic != null) 'advertiseTopic': advertiseTopic,
              if (images != null) 'images': images,
            })
            as Map<String, dynamic>;
    return PublishWebContentResult.fromJson(result);
  }

  // -- My Files / Knowledge (home vault via thin client) --

  Future<ListAllLocalFilesResult> listAllLocalFiles({String? query}) async {
    final result =
        await homeClient.call('listAllLocalFiles', {
              if (query != null && query.isNotEmpty) 'query': query,
            })
            as Map<String, dynamic>;
    return ListAllLocalFilesResult.fromJson(result);
  }

  Future<Map<String, dynamic>> readLocalFileContent({
    required String source,
    required String relativePath,
    String? documentId,
    int? maxBytes,
    int? offset,
  }) async {
    return await homeClient.call('readLocalFileContent', {
          'source': source,
          'relativePath': relativePath,
          if (documentId != null) 'documentId': documentId,
          if (maxBytes != null) 'maxBytes': maxBytes,
          if (offset != null) 'offset': offset,
        })
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> importLinkedObsidianNotes({
    List<String>? paths,
    bool all = false,
  }) async {
    return await homeClient.call('importLinkedObsidianNotes', {
          if (paths != null) 'paths': paths,
          if (all) 'all': true,
        })
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> importExternalMcpKnowledge({
    List<String>? paths,
    List<String>? externalIds,
    String? query,
    String? title,
  }) async {
    return await homeClient.call('importExternalMcpKnowledge', {
          if (paths != null) 'paths': paths,
          if (externalIds != null) 'externalIds': externalIds,
          if (query != null) 'query': query,
          if (title != null) 'title': title,
        })
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> exportNotesToLinkedObsidian({
    required List<String> relativePaths,
    String? targetRootLabel,
  }) async {
    return await homeClient.call('exportNotesToLinkedObsidian', {
          'relativePaths': relativePaths,
          if (targetRootLabel != null) 'targetRootLabel': targetRootLabel,
        })
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> exportNotesToMcp({
    required List<String> relativePaths,
  }) async {
    return await homeClient.call('exportNotesToMcp', {
          'relativePaths': relativePaths,
        })
        as Map<String, dynamic>;
  }

  /// Owner vault knowledge.query — returns answer text.
  Future<String> knowledgeQuery(String question) async {
    final result = await homeClient.call('knowledgeQuery', {'question': question});
    if (result is String) return result;
    if (result is Map && result['answer'] is String) {
      return result['answer'] as String;
    }
    return result?.toString() ?? '';
  }

  Future<Map<String, dynamic>> getRagIndexStatus() async {
    final result =
        await homeClient.call('getRagIndexStatus', {}) as Map<String, dynamic>;
    return result;
  }

  Future<Map<String, dynamic>> reindexRagKnowledge({bool force = false}) async {
    // Large vaults reindex for a long time on Envoy Local CPU embed.
    final result =
        await homeClient.call('reindexRagKnowledge', {
              if (force) 'force': true,
            }, const Duration(minutes: 45))
            as Map<String, dynamic>;
    return result;
  }

  Future<Map<String, dynamic>> testRagEmbedding() async {
    final result =
        await homeClient.call('testRagEmbedding', {}) as Map<String, dynamic>;
    return result;
  }

  Future<Map<String, dynamic>> testChatModel() async {
    final result =
        await homeClient.call('testChatModel', {}) as Map<String, dynamic>;
    return result;
  }

  Future<List<Map<String, dynamic>>> listKbPlugins() async {
    final result = await homeClient.call('listKbPlugins', {});
    if (result is List) {
      return result
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    }
    if (result is Map) {
      final list = (result['plugins'] as List<dynamic>?) ?? const [];
      return list
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    }
    return const [];
  }

  /// Discover Obsidian vault folders on the home node (owner-only).
  Future<List<String>> discoverObsidianVaults() async {
    final result =
        await homeClient.call('discoverObsidianVaults', {})
            as Map<String, dynamic>;
    final paths = result['paths'];
    if (paths is! List) return const [];
    return paths
        .map((e) => e.toString().trim())
        .where((s) => s.isNotEmpty)
        .toList();
  }

  /// Open Obsidian or Notion on the home computer (owner-only allowlist).
  Future<Map<String, dynamic>> openDesktopApp({required String app}) async {
    final result =
        await homeClient.call('openDesktopApp', {'app': app})
            as Map<String, dynamic>;
    return result;
  }

  Future<Map<String, dynamic>> activateKbPlugin({
    required String pluginId,
  }) async {
    final result =
        await homeClient.call('activateKbPlugin', {'pluginId': pluginId})
            as Map<String, dynamic>;
    return result;
  }

  Future<Map<String, dynamic>> deactivateKbPlugin({
    required String pluginId,
  }) async {
    final result =
        await homeClient.call('deactivateKbPlugin', {'pluginId': pluginId})
            as Map<String, dynamic>;
    return result;
  }

  Future<void> setLibraryItemPublished({
    required String documentId,
    required bool published,
  }) async {
    await homeClient.call('setLibraryItemPublished', {
      'documentId': documentId,
      'published': published,
    });
  }

  Future<void> openLocalFile({
    required String source,
    required String relativePath,
  }) async {
    await homeClient.call('openLocalFile', {
      'source': source,
      'relativePath': relativePath,
    });
  }

  Future<Map<String, dynamic>> createNote({
    required String filename,
    required String content,
    String? subfolder,
    String sensitivity = 'private',
    bool alsoPublishAsBlog = false,
  }) async {
    return await homeClient.call('createNote', {
          'filename': filename,
          'content': content,
          if (subfolder != null && subfolder.isNotEmpty) 'subfolder': subfolder,
          'sensitivity': sensitivity,
          if (alsoPublishAsBlog) 'alsoPublishAsBlog': true,
        })
        as Map<String, dynamic>;
  }

  Future<void> deleteVaultItem({required String relativePath}) async {
    await homeClient.call('deleteVaultItem', {'relativePath': relativePath});
  }

  Future<Map<String, dynamic>> convertLibraryItemToMarkdown({
    String? documentId,
    String? relativePath,
  }) async {
    return await homeClient.call('convertLibraryItemToMarkdown', {
          if (documentId != null) 'documentId': documentId,
          if (relativePath != null) 'relativePath': relativePath,
        })
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> importToLibrary({
    required String relativePath,
    required String contentBase64,
    String? mimeType,
  }) async {
    return await homeClient.call('importToLibrary', {
          'relativePath': relativePath,
          'contentBase64': contentBase64,
          if (mimeType != null) 'mimeType': mimeType,
        })
        as Map<String, dynamic>;
  }

  Future<void> shareFile({
    required String targetOwnerId,
    required String path,
    String sensitivity = 'friends',
    String? deliveryChannel,
  }) async {
    await homeClient.call('shareFile', {
      'targetOwnerId': targetOwnerId,
      'file': {
        'path': path,
        'sensitivity': sensitivity,
        if (deliveryChannel != null) 'deliveryChannel': deliveryChannel,
      },
    });
  }

  // -- Chains (Phase 40/43/52 — status, start, light ops) --
  //
  // EnvoyGo can list, start, cancel, pin, and rebalance. Fleet "Manage
  // workers" setup stays on the home Social UI.
}
