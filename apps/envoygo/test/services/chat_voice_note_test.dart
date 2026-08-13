import 'package:envoygo/knowledge/local_file_display.dart';
import 'package:envoygo/services/chat_voice_note.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('isChatAttachmentPath matches chat out/in paths', () {
    expect(isChatAttachmentPath('chat/out/a1/voice-note.webm'), isTrue);
    expect(isChatAttachmentPath('chat/out/a1/resume.pdf'), isTrue);
    expect(isChatAttachmentPath('chat/in/bob/photo.jpg'), isTrue);
    expect(isChatAttachmentPath('imports/photo.jpg'), isFalse);
  });

  test('knowledge browse filters classify notes vs documents', () {
    expect(isKnowledgeNotesPath('notes/hello.md'), isTrue);
    expect(isKnowledgeDocumentsPath('documents/a.pdf'), isTrue);
    expect(isKnowledgeObsidianPath('notes/hello.md'), isTrue);
    expect(isKnowledgeObsidianPath('linked-obsidian/V/a.md'), isTrue);
    expect(isKnowledgeNotionPath('notes/mcp/x.md'), isTrue);
    expect(isKnowledgeNotionPath('mcp-remote/x.md'), isTrue);
    expect(isKnowledgeBlogPath('notes/imports/blog/hello.md'), isTrue);
    expect(isKnowledgeObsidianPath('notes/mcp/x.md'), isFalse);
    expect(knowledgeBrowseSource('notes/hello.md'), 'note');
    expect(knowledgeBrowseSource('notes/mcp/x.md'), 'notion');
    expect(knowledgeBrowseSource('linked-obsidian/V/a.md'), 'obsidian');
    expect(knowledgeBrowseSource('notes/imports/obsidian/x.md'), 'obsidian');
    expect(knowledgeBrowseSource('mcp-remote/x.md'), 'notion');
    expect(knowledgeBrowseSource('notes/imports/blog/hello.md'), 'blog');
    expect(knowledgeObsidianOrigin('linked-obsidian/V/a.md'), 'linked');
    expect(knowledgeObsidianOrigin('notes/imports/obsidian/x.md'), 'imported');
    expect(knowledgeObsidianOrigin('notes/hello.md'), isNull);
    expect(
      knowledgeBrowseDisplayPath('linked-obsidian/Vault/note.md'),
      'note.md',
    );
    expect(
      knowledgeBrowseDisplayPath('linked-obsidian/Obsidian vault/Inbox/a.md'),
      'Inbox/a.md',
    );
    expect(
      knowledgeBrowseDisplayPath('notes/imports/obsidian/Vault/a.md'),
      'a.md',
    );
    expect(
      matchesKnowledgeBrowseFilter(
        relativePath: 'mcp-remote/x.md',
        source: 'mcp-remote',
        filter: KnowledgeBrowseFilter.notion,
      ),
      isTrue,
    );
    expect(
      matchesKnowledgeBrowseFilter(
        relativePath: 'notes/imports/blog/hello.md',
        filter: KnowledgeBrowseFilter.notes,
      ),
      isTrue,
    );
    expect(isVaultShareableSource('vault'), isTrue);
    expect(isVaultShareableSource('linked-obsidian'), isFalse);
  });
}
