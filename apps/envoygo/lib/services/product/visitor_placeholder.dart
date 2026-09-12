/// Local markdown shown when a remote peer has not published a default surface.
/// Mirrors `@envoymesh/api` `buildVisitorPlaceholderMarkdown`.

enum DefaultWebSurface { profile, blog, photowall }

const _defaultPhotoGallery = 'wall';

DefaultWebSurface? defaultWebSurfaceForPath(String path) {
  final p = path.replaceAll(RegExp(r'^/+'), '').replaceAll(RegExp(r'/+$'), '');
  if (p.isEmpty || p == 'index.md' || p == 'index.html') {
    return DefaultWebSurface.profile;
  }
  if (p == 'blog' || p.startsWith('blog/')) return DefaultWebSurface.blog;
  if (p == 'photos' || p.startsWith('photos/')) {
    return DefaultWebSurface.photowall;
  }
  return null;
}

String buildVisitorPlaceholderMarkdown({
  required DefaultWebSurface surface,
  required String ownerId,
  String? displayName,
}) {
  final id = ownerId.trim();
  final name = (displayName?.trim().isNotEmpty == true)
      ? displayName!.trim()
      : _shortOwnerLabel(id);
  final photoPath = 'photos/$_defaultPhotoGallery/';
  switch (surface) {
    case DefaultWebSurface.profile:
      return [
        '# $name',
        '',
        '_$name hasn’t published a Profile page on EnvoyMesh yet._',
        '',
        'You can still say hello from Social → Discover, or check back later.',
        '',
        '- [Blog](envoy://$id/blog/)',
        '- [PhotoWall](envoy://$id/$photoPath)',
        '',
      ].join('\n');
    case DefaultWebSurface.blog:
      return [
        '# Blog',
        '',
        '_$name hasn’t published any blog posts yet._',
        '',
        '- [Profile](envoy://$id/)',
        '- [PhotoWall](envoy://$id/$photoPath)',
        '',
      ].join('\n');
    case DefaultWebSurface.photowall:
      return [
        '# Photos',
        '',
        '_$name hasn’t published a PhotoWall yet._',
        '',
        '- [Profile](envoy://$id/)',
        '- [Blog](envoy://$id/blog/)',
        '',
      ].join('\n');
  }
}

String _shortOwnerLabel(String ownerId) {
  final id = ownerId.trim();
  if (id.isEmpty) return 'This person';
  final bare = id.replaceFirst(RegExp(r'^envoy:owner:', caseSensitive: false), '');
  if (bare.isEmpty) return 'This person';
  if (bare.length <= 10) return bare;
  return '${bare.substring(0, 6)}…${bare.substring(bare.length - 4)}';
}
