import 'package:envoygo/services/chat_voice_note.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('isChatAttachmentPath matches chat out/in paths', () {
    expect(isChatAttachmentPath('chat/out/a1/voice-note.webm'), isTrue);
    expect(isChatAttachmentPath('chat/out/a1/resume.pdf'), isTrue);
    expect(isChatAttachmentPath('chat/in/bob/photo.jpg'), isTrue);
    expect(isChatAttachmentPath('imports/photo.jpg'), isFalse);
    expect(isChatAttachmentPath('skills/tavily/SKILL.md'), isFalse);
  });

  test('isProfileMediaPath matches profile thumbnail and gallery', () {
    expect(isProfileMediaPath('profile/thumbnail.jpg'), isTrue);
    expect(
      isProfileMediaPath('profile/gallery/0fd7139a-9596-43fa-8733-401496c7dc98.jpg'),
      isTrue,
    );
    expect(isProfileMediaPath('photos/wall/lake.jpg'), isFalse);
  });

  test('isHiddenFromLibraryList covers chat and profile media', () {
    expect(isHiddenFromLibraryList('chat/out/a/x.pdf'), isTrue);
    expect(isHiddenFromLibraryList('profile/thumbnail.jpg'), isTrue);
    expect(isHiddenFromLibraryList('notes/hello.md'), isFalse);
  });

  test('knowledge browse filters classify notes vs documents', () {
    expect(isKnowledgeNotesPath('notes/hello.md'), isTrue);
    expect(isKnowledgeDocumentsPath('documents/a.pdf'), isTrue);
    expect(isKnowledgeObsidianPath('notes/hello.md'), isTrue);
    expect(isKnowledgeNotionPath('notes/mcp/x.md'), isTrue);
    expect(isKnowledgeObsidianPath('notes/mcp/x.md'), isFalse);
    expect(knowledgeBrowseSource('notes/mcp/x.md'), 'notion');
    expect(
      matchesKnowledgeBrowseFilter(
        relativePath: 'notes/a.md',
        published: true,
        filter: KnowledgeBrowseFilter.published,
      ),
      isTrue,
    );
    expect(
      matchesKnowledgeBrowseFilter(
        relativePath: 'notes/a.md',
        published: false,
        filter: KnowledgeBrowseFilter.published,
      ),
      isFalse,
    );
    expect(
      matchesKnowledgeBrowseFilter(
        relativePath: 'notes/mcp/x.md',
        filter: KnowledgeBrowseFilter.notion,
      ),
      isTrue,
    );
    expect(
      matchesKnowledgeBrowseFilter(
        relativePath: 'notes/hello.md',
        filter: KnowledgeBrowseFilter.obsidian,
      ),
      isTrue,
    );
  });
}
