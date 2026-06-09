/// A bonded contact synced from the home node.
class Contact {
  /// Owner ID (envoy:owner:...).
  final String ownerId;

  /// Display name from profile.
  final String? displayName;

  /// Trust tier: blocked, public, referred, direct.
  final String bondLevel;

  /// Avatar URL (or base64 data URI).
  final String? avatarUrl;

  /// Last seen timestamp.
  final DateTime? lastSeen;

  const Contact({
    required this.ownerId,
    this.displayName,
    required this.bondLevel,
    this.avatarUrl,
    this.lastSeen,
  });

  factory Contact.fromJson(Map<String, dynamic> json) {
    // Home node uses camelCase (BondRecord: peerOwnerId, level).
    // We also accept snake_case for local DB cache.
    return Contact(
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
}
