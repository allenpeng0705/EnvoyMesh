/// Result row from home-node `searchPeers` (mesh discovery).
class PeerSearchResult {
  final String nodeId;
  final String ownerId;
  final String? displayName;
  final List<String> interests;
  final String? profileVisibility;
  final String? trustLevel;

  const PeerSearchResult({
    required this.nodeId,
    required this.ownerId,
    this.displayName,
    this.interests = const [],
    this.profileVisibility,
    this.trustLevel,
  });

  factory PeerSearchResult.fromJson(Map<String, dynamic> json) {
    final rawInterests = json['interests'];
    return PeerSearchResult(
      nodeId: (json['nodeId'] ?? '') as String,
      ownerId: (json['ownerId'] ?? '') as String,
      displayName: json['displayName'] as String?,
      interests: rawInterests is List
          ? rawInterests.map((e) => e.toString()).toList()
          : const [],
      profileVisibility: json['profileVisibility'] as String?,
      trustLevel: json['trustLevel'] as String?,
    );
  }
}
