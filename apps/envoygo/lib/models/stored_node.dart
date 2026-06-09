/// A paired home node stored locally.
class StoredNode {
  /// UUID v4, generated locally.
  final String id;

  /// Human-readable name from pairing QR.
  final String name;

  /// Home node's owner ID (envoy:owner:...).
  final String ownerId;

  /// Home node's libp2p peer ID.
  final String homePeerId;

  /// Last known LAN IP (from pairing or mDNS).
  final String? lanIp;

  /// WebSocket port (default 3030).
  final int wsPort;

  /// Relay WebSocket URL for WAN connectivity.
  final String? relayWsUrl;

  /// When this node was paired.
  final DateTime pairedAt;

  /// When this node was last connected.
  final DateTime? lastConnectedAt;

  /// Public IP or domain for direct WAN access (e.g. 1.2.3.4 or mynode.example.com).
  final String? publicHost;

  /// Public WebSocket port (default 3030).
  final int publicPort;

  const StoredNode({
    required this.id,
    required this.name,
    required this.ownerId,
    required this.homePeerId,
    this.lanIp,
    this.wsPort = 3030,
    this.relayWsUrl,
    required this.pairedAt,
    this.lastConnectedAt,
    this.publicHost,
    this.publicPort = 3030,
  });

  StoredNode copyWith({
    String? id,
    String? name,
    String? ownerId,
    String? homePeerId,
    String? lanIp,
    int? wsPort,
    String? relayWsUrl,
    DateTime? pairedAt,
    DateTime? lastConnectedAt,
    String? publicHost,
    int? publicPort,
    bool clearLanIp = false,
    bool clearRelayWsUrl = false,
  }) {
    return StoredNode(
      id: id ?? this.id,
      name: name ?? this.name,
      ownerId: ownerId ?? this.ownerId,
      homePeerId: homePeerId ?? this.homePeerId,
      lanIp: clearLanIp ? null : (lanIp ?? this.lanIp),
      wsPort: wsPort ?? this.wsPort,
      relayWsUrl:
          clearRelayWsUrl ? null : (relayWsUrl ?? this.relayWsUrl),
      pairedAt: pairedAt ?? this.pairedAt,
      lastConnectedAt: lastConnectedAt ?? this.lastConnectedAt,
      publicHost: publicHost ?? this.publicHost,
      publicPort: publicPort ?? this.publicPort,
    );
  }

  factory StoredNode.fromJson(Map<String, dynamic> json) {
    return StoredNode(
      id: json['id'] as String,
      name: json['name'] as String,
      ownerId: json['owner_id'] as String,
      homePeerId: json['home_peer_id'] as String,
      lanIp: json['lan_ip'] as String?,
      wsPort: (json['ws_port'] as int?) ?? 3030,
      relayWsUrl: json['relay_ws_url'] as String?,
      pairedAt: DateTime.parse(json['paired_at'] as String),
      lastConnectedAt: json['last_connected_at'] != null
          ? DateTime.parse(json['last_connected_at'] as String)
          : null,
      publicHost: json['public_host'] as String?,
      publicPort: (json['public_port'] as int?) ?? 3030,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'owner_id': ownerId,
        'home_peer_id': homePeerId,
        if (lanIp != null) 'lan_ip': lanIp,
        'ws_port': wsPort,
        if (relayWsUrl != null) 'relay_ws_url': relayWsUrl,
        'paired_at': pairedAt.toIso8601String(),
        if (lastConnectedAt != null)
          'last_connected_at': lastConnectedAt!.toIso8601String(),
        if (publicHost != null) 'public_host': publicHost,
        'public_port': publicPort,
      };
}
