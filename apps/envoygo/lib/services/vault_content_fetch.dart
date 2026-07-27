/// Chunked vault file fetch for EnvoyGo (relay home-tunnel safe).
///
/// A single `readLibraryItemContent` without [offset] returns the whole file.
/// On cellular, that JSON-RPC frame is forwarded through the relay home tunnel
/// which drops oversized `data` payloads. Chunk at [vaultReadChunkBytes] so each
/// response stays well under the tunnel cap (base64 ≈ 4/3 raw size).
library vault_content_fetch;

import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/foundation.dart' show visibleForTesting;

import 'library_read_cache.dart';

/// Matches home `MAX_LIBRARY_READ_BINARY_BYTES` / Browser chunk size.
const vaultReadChunkBytes = 40 * 1024;

/// Same ceiling as `@envoymesh/api` `MAX_LIBRARY_ITEM_PREVIEW_BYTES`.
const maxVaultPreviewBytes = 5 * 1024 * 1024;

typedef VaultReadChunkFn = Future<Map<String, dynamic>> Function({
  required String relativePath,
  int? maxBytes,
  int? offset,
});

class VaultContentResult {
  final Uint8List bytes;
  final String mimeType;
  final bool fromCache;

  const VaultContentResult({
    required this.bytes,
    required this.mimeType,
    this.fromCache = false,
  });
}

Uint8List concatVaultChunks(List<Uint8List> parts) {
  final total = parts.fold<int>(0, (sum, p) => sum + p.length);
  final out = Uint8List(total);
  var offset = 0;
  for (final p in parts) {
    out.setRange(offset, offset + p.length, p);
    offset += p.length;
  }
  return out;
}

VaultContentResult _resultFromRow(Map<String, dynamic> row) {
  final b64 = row['contentBase64'] as String? ?? '';
  final bytes = b64.isEmpty ? Uint8List(0) : base64Decode(b64);
  final mime = (row['mimeType'] as String?)?.trim();
  return VaultContentResult(
    bytes: bytes,
    mimeType: (mime != null && mime.isNotEmpty) ? mime : 'application/octet-stream',
  );
}

Future<VaultContentResult> _fetchChunked(
  VaultReadChunkFn read, {
  required String relativePath,
  required int chunkBytes,
  required int maxBytes,
}) async {
  final parts = <Uint8List>[];
  var offset = 0;
  var mimeType = 'application/octet-stream';
  var totalSize = maxBytes;

  while (offset < totalSize && offset < maxBytes) {
    final row = await read(
      relativePath: relativePath,
      maxBytes: chunkBytes,
      offset: offset,
    );
    final remoteMime = (row['mimeType'] as String?)?.trim();
    if (remoteMime != null && remoteMime.isNotEmpty) mimeType = remoteMime;
    final size = (row['sizeBytes'] as num?)?.toInt();
    if (size != null && size >= 0) totalSize = size;
    if (totalSize > maxBytes) {
      throw StateError(
        'Vault file too large for preview ($totalSize bytes, max $maxBytes)',
      );
    }
    final b64 = row['contentBase64'] as String? ?? '';
    final part = b64.isEmpty ? Uint8List(0) : base64Decode(b64);
    parts.add(part);
    offset += part.length;
    final truncated = row['truncated'] == true;
    if (!truncated || part.isEmpty) break;
  }

  return VaultContentResult(
    bytes: concatVaultChunks(parts),
    mimeType: mimeType,
  );
}

/// Fetch vault bytes, auto-chunking via [offset] + [maxBytes].
///
/// Falls back to a single full read when the home ignores `offset` (pre-offset
/// nodes treat `maxBytes` as a hard file-size ceiling and reject >40 KiB).
Future<VaultContentResult> fetchVaultContent(
  VaultReadChunkFn read, {
  required String relativePath,
  int chunkBytes = vaultReadChunkBytes,
  int maxBytes = maxVaultPreviewBytes,
}) async {
  try {
    return await _fetchChunked(
      read,
      relativePath: relativePath,
      chunkBytes: chunkBytes,
      maxBytes: maxBytes,
    );
  } catch (_) {
    // Older home: ignore offset, apply maxBytes as total-size cap → "too large".
    // Full read (no offset / default max) still works on LAN / larger tunnels.
    final row = await read(relativePath: relativePath);
    final size = (row['sizeBytes'] as num?)?.toInt() ?? 0;
    if (size > maxBytes) {
      throw StateError(
        'Vault file too large for preview ($size bytes, max $maxBytes)',
      );
    }
    return _resultFromRow(row);
  }
}

/// Cache-first vault load keyed by stable [homePeerId] (survives re-pair).
///
/// Pass [maxAge] as [Duration.zero] (or null with a fresh put after mutation)
/// after profile/gallery writes so the UI does not keep a stale thumb.
Future<VaultContentResult> getOrFetchVaultContent(
  VaultReadChunkFn read, {
  required String homePeerId,
  required String relativePath,
  Duration? maxAge = vaultCacheFreshTtl,
  int chunkBytes = vaultReadChunkBytes,
  bool bypassCache = false,
}) async {
  final key = vaultCacheKey(homePeerId, relativePath);
  if (!bypassCache) {
    final cached = await LibraryReadCache.instance.peekBlobEntry(key);
    if (cached != null) {
      final age = DateTime.now().toUtc().difference(cached.cachedAt.toUtc());
      final fresh = maxAge == null || age < maxAge;
      if (fresh) {
        Uint8List? bytes = cached.bytes;
        if (bytes == null) {
          try {
            bytes = base64Decode(cached.body);
          } catch (_) {
            bytes = null;
          }
        }
        if (bytes != null && bytes.isNotEmpty) {
          return VaultContentResult(
            bytes: bytes,
            mimeType: cached.contentType,
            fromCache: true,
          );
        }
      }
    }
  } else {
    await LibraryReadCache.instance.invalidateBlob(key);
  }

  final fetched = await fetchVaultContent(
    read,
    relativePath: relativePath,
    chunkBytes: chunkBytes,
  );
  if (fetched.bytes.isNotEmpty) {
    await LibraryReadCache.instance.putBlob(
      key,
      fetched.bytes,
      contentType: fetched.mimeType,
    );
  }
  return fetched;
}

@visibleForTesting
Future<VaultContentResult> fetchVaultContentForTest(
  VaultReadChunkFn read, {
  required String relativePath,
  int chunkBytes = vaultReadChunkBytes,
}) =>
    fetchVaultContent(read, relativePath: relativePath, chunkBytes: chunkBytes);
