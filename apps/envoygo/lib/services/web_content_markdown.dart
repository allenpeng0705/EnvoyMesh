/// Extract `envoy://…` image targets from markdown `![alt](envoy://…)` embeds.
final _envoyMdImageRe = RegExp(r'!\[([^\]]*)\]\((envoy://[^)\s]+)\)');

List<String> extractEnvoyMarkdownImageUrls(String markdown) {
  return _envoyMdImageRe
      .allMatches(markdown)
      .map((m) => m.group(2)!.trim())
      .where((u) => u.isNotEmpty)
      .toList();
}

String previewFromWebContentMarkdown(String markdown, {int maxLen = 280}) {
  var text = markdown.replaceFirst(RegExp(r'^#\s+[^\n]+\n*'), '').trim();
  text = text.replaceAll(_envoyMdImageRe, '').trim();
  text = text.replaceAll(RegExp(r'!\[([^\]]*)\]\([^)]+\)'), '').trim();
  if (text.isEmpty) return '';
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen);
}
