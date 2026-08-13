// Knowledge Browse path helpers (mirrors Social `local-file-display.ts`).

String normalizeKnowledgePath(String relativePath) {
  return relativePath.trim().replaceFirst(RegExp(r'^/+'), '');
}

/// Browse filter for Knowledge → Browse. Blog posts live under Notes.
enum KnowledgeBrowseFilter {
  all,
  notes,
  obsidian,
  notion,
  documents,
  published,
}

bool isKnowledgeNotesPath(String relativePath) {
  final p = normalizeKnowledgePath(relativePath).toLowerCase();
  return p == 'notes' || p.startsWith('notes/');
}

bool isKnowledgeNotionPath(String relativePath) {
  final p = normalizeKnowledgePath(relativePath).toLowerCase();
  if (p == 'mcp-remote' || p.startsWith('mcp-remote/')) return true;
  return p == 'notes/mcp' || p.startsWith('notes/mcp/');
}

bool isKnowledgeBlogPath(String relativePath) {
  final p = normalizeKnowledgePath(relativePath).toLowerCase();
  return p == 'notes/imports/blog' || p.startsWith('notes/imports/blog/');
}

bool isKnowledgeObsidianPath(String relativePath) {
  final p = normalizeKnowledgePath(relativePath).toLowerCase();
  if (p == 'linked-obsidian' || p.startsWith('linked-obsidian/')) return true;
  if (p == 'notes/imports/obsidian' || p.startsWith('notes/imports/obsidian/')) {
    return true;
  }
  return isKnowledgeNotesPath(relativePath) &&
      !isKnowledgeNotionPath(relativePath) &&
      !isKnowledgeBlogPath(relativePath);
}

bool isKnowledgeDocumentsPath(String relativePath) =>
    !isKnowledgeNotesPath(relativePath);

String knowledgeBrowseSource(String relativePath) {
  if (isKnowledgeNotionPath(relativePath)) return 'notion';
  if (isKnowledgeBlogPath(relativePath)) return 'blog';
  final p = normalizeKnowledgePath(relativePath).toLowerCase();
  if (p == 'linked-obsidian' || p.startsWith('linked-obsidian/')) {
    return 'obsidian';
  }
  if (p == 'notes/imports/obsidian' ||
      p.startsWith('notes/imports/obsidian/')) {
    return 'obsidian';
  }
  if (isKnowledgeNotesPath(relativePath)) return 'note';
  return 'document';
}

bool matchesKnowledgeBrowseFilter({
  required String relativePath,
  bool? published,
  String? source,
  required KnowledgeBrowseFilter filter,
}) {
  switch (filter) {
    case KnowledgeBrowseFilter.all:
      return true;
    case KnowledgeBrowseFilter.notes:
      return isKnowledgeNotesPath(relativePath) ||
          source == 'linked-obsidian' ||
          source == 'mcp-remote';
    case KnowledgeBrowseFilter.obsidian:
      return source == 'linked-obsidian' || isKnowledgeObsidianPath(relativePath);
    case KnowledgeBrowseFilter.notion:
      return source == 'mcp-remote' || isKnowledgeNotionPath(relativePath);
    case KnowledgeBrowseFilter.documents:
      return isKnowledgeDocumentsPath(relativePath) &&
          source != 'linked-obsidian' &&
          source != 'mcp-remote';
    case KnowledgeBrowseFilter.published:
      return published == true;
  }
}

bool isVaultShareableSource(String source) => source == 'vault';
