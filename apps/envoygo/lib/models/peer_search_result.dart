/// Result row from home-node `searchPeers` (mesh discovery).
class PeerSearchResult {
  final String nodeId;
  final String ownerId;
  final String? displayName;
  final List<String> interests;
  final String? profileVisibility;
  final String? trustLevel;
  final List<String> multiaddrs;

  /// Whether the peer holds a live relay circuit hop (home-node relay roster).
  ///
  /// `false` = checked in but not dialable yet (listed for findability, no
  /// transport path for a hello). `null` = the source did not report it (LAN /
  /// DHT / local directory hits) — treat as reachable.
  final bool? hasHopSlot;

  const PeerSearchResult({
    required this.nodeId,
    required this.ownerId,
    this.displayName,
    this.interests = const [],
    this.profileVisibility,
    this.trustLevel,
    this.multiaddrs = const [],
    this.hasHopSlot,
  });

  /// True when a Say Hello has a chance of reaching this peer.
  ///
  /// Falls back to "has dialable addresses" when the source did not report a
  /// hop slot, so relay-roster hits with empty multiaddrs are not treated as
  /// dialable while LAN/direct hits still are.
  bool get dialable => hasHopSlot ?? multiaddrs.isNotEmpty;

  factory PeerSearchResult.fromJson(Map<String, dynamic> json) {
    final rawInterests = json['interests'];
    final rawAddrs = json['multiaddrs'];
    final rawHopSlot = json['hasHopSlot'];
    return PeerSearchResult(
      nodeId: (json['nodeId'] ?? '') as String,
      ownerId: (json['ownerId'] ?? '') as String,
      displayName: json['displayName'] as String?,
      interests: rawInterests is List
          ? rawInterests.map((e) => e.toString()).toList()
          : const [],
      profileVisibility: json['profileVisibility'] as String?,
      trustLevel: json['trustLevel'] as String?,
      multiaddrs: rawAddrs is List
          ? rawAddrs.map((e) => e.toString()).toList()
          : const [],
      hasHopSlot: rawHopSlot is bool ? rawHopSlot : null,
    );
  }
}
