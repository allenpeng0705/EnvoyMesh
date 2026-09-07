/// Provisional owner ids for LAN-discovered peers (no EMP owner yet).
library;

/// Prefix for temporary owner ids derived from a libp2p PeerId.
const String provisionalLanOwnerIdPrefix = 'lan:';

/// Stable placeholder owner id so Discover Hello can dial LAN peers.
String provisionalLanOwnerId(String libp2pPeerId) {
  final id = libp2pPeerId.trim();
  if (id.isEmpty) {
    throw ArgumentError('libp2pPeerId required for provisional LAN owner');
  }
  if (id.startsWith(provisionalLanOwnerIdPrefix)) return id;
  return '$provisionalLanOwnerIdPrefix$id';
}

bool isProvisionalLanOwnerId(String ownerId) =>
    ownerId.startsWith(provisionalLanOwnerIdPrefix);

/// Short label for UI when displayName is missing.
String shortLanPeerLabel(String libp2pPeerId) {
  final id = libp2pPeerId.trim();
  if (id.length <= 12) return id.isEmpty ? 'Nearby' : id;
  return '${id.substring(0, 8)}…${id.substring(id.length - 4)}';
}
