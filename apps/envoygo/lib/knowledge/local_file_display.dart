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
  if (knowledgeObsidianOrigin(relativePath) != null) return 'obsidian';
  if (isKnowledgeNotesPath(relativePath)) return 'note';
  return 'document';
}

/// Linked vault vs imported copy (both browse as source "obsidian").
String? knowledgeObsidianOrigin(String relativePath) {
  final p = normalizeKnowledgePath(relativePath).toLowerCase();
  if (p == 'linked-obsidian' || p.startsWith('linked-obsidian/')) {
    return 'linked';
  }
  if (p == 'notes/imports/obsidian' ||
      p.startsWith('notes/imports/obsidian/')) {
    return 'imported';
  }
  return null;
}

/// Path under the title — strip source prefixes and vault label
/// (e.g. drop `Obsidian vault/` so notes show as `Folder/note.md`).
String knowledgeBrowseDisplayPath(String relativePath) {
  final raw = normalizeKnowledgePath(relativePath);
  final lower = raw.toLowerCase();
  String? strip(String prefix) {
    if (lower == prefix) return '';
    if (lower.startsWith('$prefix/')) return raw.substring(prefix.length + 1);
    return null;
  }

  String stripVaultLabel(String rest) {
    if (rest.isEmpty) return rest;
    final slash = rest.indexOf('/');
    if (slash <= 0) return rest;
    return rest.substring(slash + 1);
  }

  final afterLinked = strip('linked-obsidian');
  if (afterLinked != null) {
    final inner = stripVaultLabel(afterLinked);
    return inner.isEmpty ? afterLinked : inner;
  }

  final afterImport = strip('notes/imports/obsidian');
  if (afterImport != null) {
    final inner = stripVaultLabel(afterImport);
    return inner.isEmpty ? afterImport : inner;
  }

  return strip('notes/imports/blog') ??
      strip('mcp-remote') ??
      strip('notes/mcp') ??
      raw;
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
