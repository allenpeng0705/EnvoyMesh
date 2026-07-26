import 'package:envoygo/services/visitor_placeholder.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('defaultWebSurfaceForPath maps profile blog photowall', () {
    expect(defaultWebSurfaceForPath(''), DefaultWebSurface.profile);
    expect(defaultWebSurfaceForPath('index.md'), DefaultWebSurface.profile);
    expect(defaultWebSurfaceForPath('blog/'), DefaultWebSurface.blog);
    expect(defaultWebSurfaceForPath('blog/posts/a.md'), DefaultWebSurface.blog);
    expect(
      defaultWebSurfaceForPath('photos/wall/index.md'),
      DefaultWebSurface.photowall,
    );
    expect(defaultWebSurfaceForPath('market/index.md'), isNull);
  });

  test('buildVisitorPlaceholderMarkdown for unpublished blog', () {
    final md = buildVisitorPlaceholderMarkdown(
      surface: DefaultWebSurface.blog,
      ownerId: 'envoy:owner:bob',
      displayName: 'Bob',
    );
    expect(md, contains('# Blog'));
    expect(md, contains('hasn’t published any blog posts'));
    expect(md, contains('envoy://envoy:owner:bob/'));
  });
}
