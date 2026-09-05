/// Chunked family-media fetch for EnvoyGo (thin-client-protocol v0.3 §3.3).
///
/// Family attachments live on the home node's `family-media` area and are read
/// by id via `readFamilyAttachment` — never through the owner-vault
/// `readLibraryItemContent`. Like vault reads, a whole-file response would be
/// forwarded through the relay home tunnel, which drops oversized `data`
/// payloads, so chunk at [familyAttachmentReadChunkBytes] using
/// `offset` + `maxBytes` range reads (each response stays under the tunnel
/// cap; base64 ≈ 4/3 raw size).
library family_content_fetch;

import 'dart:convert';
import 'dart:typed_data';

/// Tunnel-safe read chunk (mirrors `vaultReadChunkBytes`).
const familyAttachmentReadChunkBytes = 40 * 1024;

/// Preview ceiling for inline family rendering (mirrors
/// `maxVaultPreviewBytes`; the wire cap is 25 MiB per file).
const maxFamilyAttachmentPreviewBytes = 5 * 1024 * 1024;

/// Signature of `NodeServiceClient.readFamilyAttachment` without the client.
typedef FamilyAttachmentReadFn = Future<Map<String, dynamic>> Function({
  required String id,
  int? offset,
  int? maxBytes,
});

/// Result of a family-media read.
class FamilyContentResult {
  /// Concatenated bytes across the requested range / whole file.
  final Uint8List bytes;

  /// Full stored size in bytes (from the last `sizeBytes` field seen).
  final int sizeBytes;

  const FamilyContentResult({required this.bytes, required this.sizeBytes});
}

Uint8List _concatChunks(List<Uint8List> parts) {
  final total = parts.fold<int>(0, (sum, p) => sum + p.length);
  final out = Uint8List(total);
  var offset = 0;
  for (final p in parts) {
    out.setRange(offset, offset + p.length, p);
    offset += p.length;
  }
  return out;
}

/// Fetch stored family-media bytes by [id], auto-chunking via
/// [offset] + [maxBytes].
///
/// Stops when the home reports `truncated: false` (whole file delivered) or
/// after [maxBytes] have been fetched. Throws [StateError] when the home
/// reports a full size above [maxBytes].
Future<FamilyContentResult> fetchFamilyAttachmentContent(
  FamilyAttachmentReadFn read, {
  required String id,
  int chunkBytes = familyAttachmentReadChunkBytes,
  int maxBytes = maxFamilyAttachmentPreviewBytes,
}) async {
  final parts = <Uint8List>[];
  var offset = 0;
  var totalSize = maxBytes;

  while (offset < totalSize && offset < maxBytes) {
    final row = await read(id: id, maxBytes: chunkBytes, offset: offset);
    final size = (row['sizeBytes'] as num?)?.toInt();
    if (size != null && size >= 0) totalSize = size;
    if (totalSize > maxBytes) {
      throw StateError(
        'Family attachment too large for preview ($totalSize bytes, '
        'max $maxBytes)',
      );
    }
    final b64 = row['contentBase64'] as String? ?? '';
    final part = b64.isEmpty ? Uint8List(0) : base64Decode(b64);
    parts.add(part);
    offset += part.length;
    final truncated = row['truncated'] == true;
    if (!truncated || part.isEmpty) break;
  }

  return FamilyContentResult(
    bytes: _concatChunks(parts),
    sizeBytes: totalSize,
  );
}
