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

/// Browse filter for Knowledge → Browse (mirrors Social).
enum KnowledgeBrowseFilter {
  all,
  notes,
  obsidian,
  notion,
  documents,
  published,
}

bool isKnowledgeNotesPath(String relativePath) {
  final p = _normalize(relativePath).toLowerCase();
  return p == 'notes' || p.startsWith('notes/');
}

/// Saved Notion/MCP write-back notes (`notes/mcp/…`).
bool isKnowledgeNotionPath(String relativePath) {
  final p = _normalize(relativePath).toLowerCase();
  return p == 'notes/mcp' || p.startsWith('notes/mcp/');
}

/// Obsidian-managed vault notes: under `notes/` but not MCP write-back.
bool isKnowledgeObsidianPath(String relativePath) {
  return isKnowledgeNotesPath(relativePath) &&
      !isKnowledgeNotionPath(relativePath);
}

bool isKnowledgeDocumentsPath(String relativePath) =>
    !isKnowledgeNotesPath(relativePath);

String knowledgeBrowseSource(String relativePath) {
  if (isKnowledgeNotionPath(relativePath)) return 'notion';
  if (isKnowledgeNotesPath(relativePath)) return 'obsidian';
  return 'document';
}

bool matchesKnowledgeBrowseFilter({
  required String relativePath,
  bool? published,
  required KnowledgeBrowseFilter filter,
}) {
  switch (filter) {
    case KnowledgeBrowseFilter.all:
      return true;
    case KnowledgeBrowseFilter.notes:
      return isKnowledgeNotesPath(relativePath);
    case KnowledgeBrowseFilter.obsidian:
      return isKnowledgeObsidianPath(relativePath);
    case KnowledgeBrowseFilter.notion:
      return isKnowledgeNotionPath(relativePath);
    case KnowledgeBrowseFilter.documents:
      return isKnowledgeDocumentsPath(relativePath);
    case KnowledgeBrowseFilter.published:
      return published == true;
  }
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
