/// Models shared by [SocialBackend] implementations (app-agnostic).
library;

/// Bonded contact (mirrors EnvoyGo [Contact] / home BondRecord).
class BondContact {
  const BondContact({
    required this.ownerId,
    this.displayName,
    required this.bondLevel,
    this.avatarUrl,
    this.lastSeen,
  });

  final String ownerId;
  final String? displayName;
  final String bondLevel;
  final String? avatarUrl;
  final DateTime? lastSeen;

  factory BondContact.fromJson(Map<String, dynamic> json) {
    return BondContact(
      ownerId: (json['peerOwnerId'] ?? json['owner_id'] ?? '') as String,
      displayName: (json['displayName'] ?? json['display_name']) as String?,
      bondLevel: (json['level'] ?? json['bond_level'] ?? 'public') as String,
      avatarUrl: (json['avatarUrl'] ?? json['avatar_url']) as String?,
      lastSeen: (json['lastSeen'] ?? json['last_seen']) != null
          ? DateTime.tryParse(
              (json['lastSeen'] ?? json['last_seen']) as String)
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
        'owner_id': ownerId,
        if (displayName != null) 'display_name': displayName,
        'bond_level': bondLevel,
        if (avatarUrl != null) 'avatar_url': avatarUrl,
        if (lastSeen != null) 'last_seen': lastSeen!.toIso8601String(),
      };

  Map<String, dynamic> toRpcJson() => {
        'peerOwnerId': ownerId,
        if (displayName != null) 'displayName': displayName,
        'level': bondLevel,
        if (avatarUrl != null) 'avatarUrl': avatarUrl,
        if (lastSeen != null) 'lastSeen': lastSeen!.toIso8601String(),
      };
}

/// Direct-message row for social-lite history.
class MeshChatMessage {
  const MeshChatMessage({
    required this.id,
    required this.threadId,
    this.senderOwnerId,
    this.senderDisplayName,
    this.text,
    this.createdAt,
    this.isOutbound = false,
  });

  final String id;
  final String threadId;
  final String? senderOwnerId;
  final String? senderDisplayName;
  final String? text;
  final String? createdAt;
  final bool isOutbound;

  String get messageId => id;
}

/// Discovery hit (mirrors EnvoyGo PeerSearchResult).
class MeshPeerHit {
  const MeshPeerHit({
    required this.nodeId,
    required this.ownerId,
    this.displayName,
    this.interests = const [],
    this.profileVisibility,
    this.trustLevel,
    this.multiaddrs = const [],
  });

  final String nodeId;
  final String ownerId;
  final String? displayName;
  final List<String> interests;
  final String? profileVisibility;
  final String? trustLevel;
  final List<String> multiaddrs;
}
