/// Phase 45C — `envoy://` content URL parser for EnvoyGo.
///
/// Mirrors `packages/api/src/envoy-url.ts`. Deliberately regex-based: the
/// owner-id form contains colons (`envoy:owner:…`) which WHATWG `Uri`
/// treats as `host:port`.
///
/// Trailing `/` is preserved so the home can map `blog/` → `blog/index.md`
/// (see `resolveWebContentPath` on the node).
library envoy_url;

const _prefix = 'envoy://';
final _contentRe = RegExp(r'^envoy://([^/?#]+)(?:/([^?#]*))?(?:[?#].*)?$');

class ParsedEnvoyContentUrl {
  final String owner;
  final String ownerForm; // 'owner-id' | 'handle'
  /// Decoded path, leading slash stripped; trailing slash preserved.
  final String path;
  final String raw;

  const ParsedEnvoyContentUrl({
    required this.owner,
    required this.ownerForm,
    required this.path,
    required this.raw,
  });

  String get targetOwnerId => owner;
}

/// Throws [FormatException] on invalid / non-content / handle URLs.
ParsedEnvoyContentUrl parseEnvoyContentUrl(String input) {
  final trimmed = input.trim();
  if (!trimmed.startsWith(_prefix)) {
    throw FormatException('Not an envoy:// URL', input);
  }
  // Pairing URIs: envoy://contact?...
  if (trimmed.startsWith('envoy://contact')) {
    throw FormatException('Pairing URI is not a content URL', input);
  }
  final match = _contentRe.firstMatch(trimmed);
  if (match == null) {
    throw FormatException('Malformed envoy:// content URL', input);
  }
  final owner = match.group(1)!;
  final rawPath = match.group(2) ?? '';
  String path;
  try {
    path = Uri.decodeComponent(rawPath);
  } catch (_) {
    path = rawPath;
  }
  // Collapse duplicate slashes (server normalizeWebPath does the same) but
  // keep a trailing slash so directory → index.md works.
  final hadTrailingSlash = path.endsWith('/') && path.isNotEmpty;
  path = path.replaceAll(RegExp(r'/+'), '/');
  if (path.startsWith('/')) path = path.substring(1);
  if (hadTrailingSlash && path.isNotEmpty && !path.endsWith('/')) {
    path = '$path/';
  }

  if (owner.startsWith('@')) {
    throw FormatException(
      'Handle URLs (envoy://@handle/…) are reserved for v2 — use envoy://envoy:owner:<id>/…',
      input,
    );
  }
  if (!owner.startsWith('envoy:owner:')) {
    throw FormatException('Owner must be envoy:owner:… form', input);
  }
  return ParsedEnvoyContentUrl(
    owner: owner,
    ownerForm: 'owner-id',
    path: path,
    raw: trimmed,
  );
}

bool isEnvoyContentUrl(String input) {
  try {
    parseEnvoyContentUrl(input);
    return true;
  } catch (_) {
    return false;
  }
}
