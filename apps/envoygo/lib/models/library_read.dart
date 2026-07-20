/// Phase 45C — typed result for home `libraryRead` JSON-RPC.
class LibraryReadResult {
  final String peerOwnerId;
  final String libp2pPeerId;
  final String status; // ok | not_found | forbidden | too_large | not_modified
  final String? body;
  final String? contentType;
  final String? contentHash;
  final int? byteLength;
  final String? etag;
  final Map<String, int>? range;
  final String? publicRedirection;
  final int latencyMs;
  final String? error;

  const LibraryReadResult({
    required this.peerOwnerId,
    required this.libp2pPeerId,
    required this.status,
    this.body,
    this.contentType,
    this.contentHash,
    this.byteLength,
    this.etag,
    this.range,
    this.publicRedirection,
    required this.latencyMs,
    this.error,
  });

  factory LibraryReadResult.fromJson(Map<String, dynamic> json) {
    Map<String, int>? range;
    final rawRange = json['range'];
    if (rawRange is Map) {
      range = {
        'start': (rawRange['start'] as num?)?.toInt() ?? 0,
        'end': (rawRange['end'] as num?)?.toInt() ?? 0,
        'total': (rawRange['total'] as num?)?.toInt() ?? 0,
      };
    }
    final status = json['status'] as String?;
    if (status == null || status.isEmpty) {
      throw FormatException('libraryRead result missing status', json);
    }
    return LibraryReadResult(
      peerOwnerId: (json['peerOwnerId'] as String?) ?? '',
      libp2pPeerId: (json['libp2pPeerId'] as String?) ?? '',
      status: status,
      body: json['body'] as String?,
      contentType: json['contentType'] as String?,
      contentHash: json['contentHash'] as String?,
      byteLength: (json['byteLength'] as num?)?.toInt(),
      etag: json['etag'] as String?,
      range: range,
      publicRedirection: json['publicRedirection'] as String?,
      latencyMs: (json['latencyMs'] as num?)?.toInt() ?? 0,
      error: json['error'] as String?,
    );
  }
}
