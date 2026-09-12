/// Discovery result types and address-dialability **primitives**.
///
/// Split out of `models.dart` (`docs/envoymesh-refactoring-plan.md` §3, E3's
/// recorded refinement). `models.dart` bundled two things:
///
/// * `BondContact` / `MeshChatMessage` — genuinely social: a bond record and a
///   chat-room message.
/// * `MeshPeerHit` and the dialability helpers below — the **transport's own
///   result type**. `MeshPeerHit` is what discovery returns; `peerDialable` /
///   `isDirectPeerAddress` / `allAddressesNeedRelayHop` are pure address logic
///   with no product concept in them.
///
/// Bundling them made the transport unusable without the product: `Libp2pNode`
/// needs `PhoneDiscoveryProvider`, which needs `MeshPeerHit`, which lived in a
/// `product-bound` module — so the libp2p **host** was classified product-bound
/// purely because of where this type was declared.
///
/// `MeshPeerHit` carries optional *reported* attributes (`trustLevel`,
/// `interests`, `profileVisibility`) as plain strings. It names no product type
/// and requires no product concept to construct, so it is `reusable`.
library;

class MeshPeerHit {
  const MeshPeerHit({
    required this.nodeId,
    required this.ownerId,
    this.displayName,
    this.interests = const [],
    this.profileVisibility,
    this.trustLevel,
    this.multiaddrs = const [],
    this.hasHopSlot,
  });

  final String nodeId;
  final String ownerId;
  final String? displayName;
  final List<String> interests;
  final String? profileVisibility;
  final String? trustLevel;
  final List<String> multiaddrs;

  /// Live relay circuit hop, when the source reported it (relay roster).
  ///
  /// `false` = checked in but not dialable yet. `null` = source silent
  /// (LAN / DHT / local) — callers treat address presence as dialability.
  final bool? hasHopSlot;

  /// True when this hit can be dialed right now (Say Hello has a chance).
  bool get dialable => peerDialable(hasHopSlot: hasHopSlot, multiaddrs: multiaddrs);
}

/// Shared dialability rule — one implementation for both clients.
///
/// A *direct* address decides on its own: a relay hop report only governs
/// `/p2p-circuit/` paths, so a hit that a DHT/LAN merge gave real addresses
/// stays dialable even when a roster said "no slot right now". Otherwise the
/// hop report decides, falling back to address presence when the source was
/// silent. Used by `MeshPeerHit.dialable` and EnvoyGo
/// `PeerSearchResult.dialable` so the two cannot drift.
bool peerDialable({bool? hasHopSlot, List<String> multiaddrs = const []}) {
  if (multiaddrs.any(isDirectPeerAddress)) return true;
  return hasHopSlot ?? multiaddrs.isNotEmpty;
}

/// True for an address that does not need a relay circuit reservation.
bool isDirectPeerAddress(String addr) => !addr.contains('/p2p-circuit');

/// True when every known address needs a live relay circuit reservation.
bool allAddressesNeedRelayHop(List<String> multiaddrs) =>
    multiaddrs.isNotEmpty && multiaddrs.every((a) => !isDirectPeerAddress(a));
