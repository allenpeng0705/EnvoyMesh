/// Phase 45C — Browser fetch helper for EnvoyGo (mirrors Social library-read-fetch).
///
/// Auto-chunks when the home returns `too_large`. Range bodies are always
/// base64 from the server. Pass [cache] + [revalidate] for If-None-Match.
library library_read_fetch;

import 'dart:convert';
import 'dart:typed_data';

import '../models/library_read.dart';

const libraryReadChunkBytes = 40 * 1024;

typedef LibraryReadFn = Future<LibraryReadResult> Function({
  required String targetOwnerId,
  required String path,
  Map<String, int>? range,
  String? ifNoneMatch,
  int? timeoutMs,
});

class BrowserFetchCacheEntry {
  final String body;
  final String contentType;
  final String contentHash;
  final String etag;
  final int byteLength;
  final bool isText;

  const BrowserFetchCacheEntry({
    required this.body,
    required this.contentType,
    required this.contentHash,
    required this.etag,
    required this.byteLength,
    required this.isText,
  });
}

class BrowserFetchResult {
  final String status; // ok | not_found | forbidden | error
  final String? body;
  final String? contentType;
  final String? contentHash;
  final String? etag;
  final int? byteLength;
  final bool isText;
  final String? error;
  final bool fromCache;

  const BrowserFetchResult({
    required this.status,
    this.body,
    this.contentType,
    this.contentHash,
    this.etag,
    this.byteLength,
    this.isText = false,
    this.error,
    this.fromCache = false,
  });
}

bool isTextMime(String mime) =>
    mime.startsWith('text/') || mime == 'application/json';

String _concatBase64Chunks(List<String> chunks) {
  final out = BytesBuilder(copy: false);
  for (final c in chunks) {
    out.add(base64Decode(c));
  }
  return base64Encode(out.takeBytes());
}

/// Fetch a library path via [libraryRead], auto-chunking on `too_large`.
Future<BrowserFetchResult> fetchLibraryContent(
  LibraryReadFn libraryRead, {
  required String targetOwnerId,
  required String path,
  BrowserFetchCacheEntry? cache,
  bool revalidate = false,
}) async {
  final ifNoneMatch =
      revalidate && cache != null && cache.etag.isNotEmpty ? cache.etag : null;

  final first = await libraryRead(
    targetOwnerId: targetOwnerId,
    path: path,
    ifNoneMatch: ifNoneMatch,
  );

  if (first.status == 'not_modified') {
    if (cache != null) {
      return BrowserFetchResult(
        status: 'ok',
        body: cache.body,
        contentType: cache.contentType,
        contentHash: cache.contentHash,
        etag: cache.etag,
        byteLength: cache.byteLength,
        isText: cache.isText,
        fromCache: true,
      );
    }
    return const BrowserFetchResult(
      status: 'error',
      error: 'not_modified without local cache',
    );
  }

  if (first.status == 'not_found' || first.status == 'forbidden') {
    return BrowserFetchResult(
      status: first.status,
      error: first.error,
    );
  }

  if (first.status == 'ok' && first.body != null && first.contentType != null) {
    return BrowserFetchResult(
      status: 'ok',
      body: first.body,
      contentType: first.contentType,
      contentHash: first.contentHash,
      etag: first.etag,
      byteLength: first.byteLength ?? first.body!.length,
      isText: isTextMime(first.contentType!),
    );
  }

  if (first.status == 'too_large') {
    final total = first.byteLength;
    if (total == null || total <= 0) {
      return const BrowserFetchResult(
        status: 'error',
        error: 'too_large without byteLength',
      );
    }
    final contentType = first.contentType ?? 'application/octet-stream';
    final text = isTextMime(contentType);
    final chunks = <String>[];
    var start = 0;
    while (start < total) {
      final end = (start + libraryReadChunkBytes - 1).clamp(0, total - 1);
      final part = await libraryRead(
        targetOwnerId: targetOwnerId,
        path: path,
        range: {'start': start, 'end': end},
      );
      if (part.status != 'ok' || part.body == null) {
        return BrowserFetchResult(
          status: 'error',
          error: part.error ??
              'range fetch failed at $start-$end (${part.status})',
        );
      }
      chunks.add(part.body!);
      start = end + 1;
    }
    final mergedB64 = _concatBase64Chunks(chunks);
    final body = text ? utf8.decode(base64Decode(mergedB64)) : mergedB64;
    return BrowserFetchResult(
      status: 'ok',
      body: body,
      contentType: contentType,
      contentHash: first.contentHash,
      etag: first.etag,
      byteLength: total,
      isText: text,
    );
  }

  return BrowserFetchResult(
    status: 'error',
    error: first.error ?? 'unexpected status ${first.status}',
  );
}
