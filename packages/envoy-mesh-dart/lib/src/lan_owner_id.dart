/// Provisional (locally invented) owner ids for peers we can see but whose real
/// EMP owner id is not known yet.
///
/// Two flavours exist on purpose:
///
/// - `lan:<peerId>` — a peer found on the local network (mDNS) or via DHT with
///   directly dialable addresses. Callers treat this prefix as "dialable
///   without a relay hop" and skip empty-address guards for it.
/// - `relay:<peerId>` — a peer returned by a relay roster lookup (WAN) whose
///   public response stripped `ownerId` by design, and which may hold no live
///   circuit hop (`multiaddrs` empty). Such a peer is *findable*, not yet
///   dialable: never treat it as a LAN peer.
///
/// Both are placeholders, never bondable identities — a real owner id always
/// supersedes them (see `PhoneSocialStore.upsertPeer`).
library;

/// Prefix for temporary owner ids derived from a libp2p PeerId (LAN / direct).
const String provisionalLanOwnerIdPrefix = 'lan:';

/// Prefix for temporary owner ids for relay-roster (WAN) hits.
const String provisionalRelayOwnerIdPrefix = 'relay:';

/// Stable placeholder owner id so Discover Hello can dial LAN peers.
String provisionalLanOwnerId(String libp2pPeerId) {
  final id = libp2pPeerId.trim();
  if (id.isEmpty) {
    throw ArgumentError('libp2pPeerId required for provisional LAN owner');
  }
  if (id.startsWith(provisionalLanOwnerIdPrefix)) return id;
  return '$provisionalLanOwnerIdPrefix$id';
}

/// Stable placeholder owner id for a relay-roster hit with no published owner.
///
/// Keeps the hit visible in Discover (empty `ownerId` is filtered out) without
/// claiming the peer is directly dialable.
String provisionalRelayOwnerId(String libp2pPeerId) {
  final id = libp2pPeerId.trim();
  if (id.isEmpty) {
    throw ArgumentError('libp2pPeerId required for provisional relay owner');
  }
  if (id.startsWith(provisionalRelayOwnerIdPrefix)) return id;
  return '$provisionalRelayOwnerIdPrefix$id';
}

bool isProvisionalLanOwnerId(String ownerId) =>
    ownerId.startsWith(provisionalLanOwnerIdPrefix);

bool isProvisionalRelayOwnerId(String ownerId) =>
    ownerId.startsWith(provisionalRelayOwnerIdPrefix);

/// True for any locally invented placeholder owner id (LAN *or* relay).
bool isProvisionalOwnerId(String ownerId) =>
    isProvisionalLanOwnerId(ownerId) || isProvisionalRelayOwnerId(ownerId);

/// Short label for UI when displayName is missing.
String shortLanPeerLabel(String libp2pPeerId) {
  final id = libp2pPeerId.trim();
  if (id.length <= 12) return id.isEmpty ? 'Nearby' : id;
  return '${id.substring(0, 8)}…${id.substring(id.length - 4)}';
}

/// Neutral short label for a peer with no display name (LAN or WAN).
String shortPeerLabel(String libp2pPeerId) {
  final id = libp2pPeerId.trim();
  if (id.length <= 12) return id.isEmpty ? 'Peer' : id;
  return '${id.substring(0, 8)}…${id.substring(id.length - 4)}';
}
