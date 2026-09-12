/// Parse public blog listing markdown (`blog/index.md`) into post links.
final _blogIndexLinkRe =
    RegExp(r'^-\s*\[([^\]]+)\]\((envoy://[^)\s]+)\)', multiLine: true);

class PublicBlogPostLink {
  final String title;
  final String url;
  const PublicBlogPostLink({required this.title, required this.url});
}

List<PublicBlogPostLink> parsePublicBlogIndex(String markdown) {
  final text = markdown.trim();
  if (text.isEmpty || text.contains('_No posts yet._')) return const [];
  return _blogIndexLinkRe
      .allMatches(text)
      .map(
        (m) => PublicBlogPostLink(
          title: m.group(1)!.trim(),
          url: m.group(2)!.trim(),
        ),
      )
      .where((e) => e.title.isNotEmpty && e.url.isNotEmpty)
      .toList();
}
