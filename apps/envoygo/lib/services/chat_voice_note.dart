// Library / chat path helpers + Knowledge browse filters.
//
// Knowledge browse helpers live in `knowledge/local_file_display.dart` and are
// re-exported here for existing imports.

export '../knowledge/local_file_display.dart'
    show
        KnowledgeBrowseFilter,
        isKnowledgeNotesPath,
        isKnowledgeNotionPath,
        isKnowledgeBlogPath,
        isKnowledgeObsidianPath,
        isKnowledgeDocumentsPath,
        knowledgeBrowseSource,
        knowledgeObsidianOrigin,
        knowledgeBrowseDisplayPath,
        matchesKnowledgeBrowseFilter,
        isVaultShareableSource;

/// Paths that should not appear in My Files / Library lists.

bool isChatAttachmentPath(String relativePath) {
  final p = _normalize(relativePath);
  return p == 'chat' || p.startsWith('chat/');
}

/// Profile avatar / gallery blobs — managed from Profile UI.
bool isProfileMediaPath(String relativePath) {
  final p = _normalize(relativePath);
  return p == 'profile' || p.startsWith('profile/');
}

bool isHiddenFromLibraryList(String relativePath) {
  return isChatAttachmentPath(relativePath) || isProfileMediaPath(relativePath);
}

/// @deprecated Prefer [isChatAttachmentPath].
bool isChatVoiceNotePath(String relativePath) {
  return isChatAttachmentPath(relativePath) &&
      RegExp(r'(^|/)voice-note\.(webm|m4a|wav)$', caseSensitive: false)
          .hasMatch(relativePath.trim());
}

String _normalize(String relativePath) {
  return relativePath.trim().replaceFirst(RegExp(r'^/+'), '');
}
