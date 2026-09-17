import 'dart:async';

import 'package:dart_libp2p/core/peer/peer_id.dart';
import '../../core/multiaddr.dart';

/// Metadata about a peer
class PeerInfo {
  /// The peer's ID
  final PeerId peerId;

  /// The peer's known addresses
  final Set<MultiAddr> addrs;

  /// When this peer was first discovered
  final DateTime firstSeen;

  /// When this peer was last seen
  DateTime lastSeen;

  /// The protocols supported by this peer
  final Set<String> protocols;

  /// Additional metadata about this peer
  final Map<String, dynamic> metadata;

  PeerInfo({
    required this.peerId,
    Set<MultiAddr>? addrs,
    Set<String>? protocols,
    Map<String, dynamic>? metadata,
    DateTime? firstSeen,
    DateTime? lastSeen,
  })  : addrs = addrs ?? {},
        protocols = protocols ?? {},
        metadata = metadata ?? {},
        firstSeen = firstSeen ?? DateTime.now(),
        lastSeen = lastSeen ?? DateTime.now();

  /// Updates the last seen timestamp
  void updateLastSeen() {
    lastSeen = DateTime.now();
  }

  /// Adds a new address for this peer
  void addAddr(MultiAddr addr) {
    addrs.add(addr);
    updateLastSeen();
  }

  /// Adds multiple addresses for this peer
  void addAddrs(Iterable<MultiAddr> newAddrs) {
    addrs.addAll(newAddrs);
    updateLastSeen();
  }

  /// Adds a supported protocol
  void addProtocol(String protocol) {
    protocols.add(protocol);
    updateLastSeen();
  }

  /// Adds multiple supported protocols
  void addProtocols(Iterable<String> newProtocols) {
    protocols.addAll(newProtocols);
    updateLastSeen();
  }

  /// Creates a copy of this PeerInfo
  PeerInfo copy() {
    return PeerInfo(
      peerId: peerId,
      addrs: addrs,
      protocols: protocols,
      metadata: metadata
    );
  }

}


// /// Stores information about known peers
// class PeerStore {
//   final PeerStoreConfig _config;
//   final Map<String, PeerInfo> _peers = {};
//   Timer? _cleanupTimer;
//
//   PeerStore({PeerStoreConfig? config})
//       : _config = config ?? const PeerStoreConfig() {
//     _startCleanupTimer();
//   }
//
//   /// Returns the number of stored peers
//   int get peerCount => _peers.length;
//
//   /// Returns all stored peers
//   List<PeerInfo> get peers => _peers.values.toList();
//
//   /// Returns all peer IDs
//   List<PeerId> get peerIds => _peers.values.map((p) => p.peerId).toList();
//
//   /// Adds or updates a peer
//   void addOrUpdatePeer(PeerId peerId, {
//     Iterable<Multiaddr>? addrs,
//     Iterable<String>? protocols,
//     Map<String, dynamic>? metadata,
//   }) {
//     final peerKey = peerId.toString();
//     final existing = _peers[peerKey];
//
//     if (existing != null) {
//       if (addrs != null) existing.addAddrs(addrs);
//       if (protocols != null) existing.addProtocols(protocols);
//       if (metadata != null) existing.metadata.addAll(metadata);
//       existing.updateLastSeen();
//     } else {
//       if (_peers.length >= _config.maxPeers) {
//         _removeOldestPeer();
//       }
//
//       _peers[peerKey] = PeerInfo(
//         peerId: peerId,
//         addrs: addrs?.toSet(),
//         protocols: protocols?.toSet(),
//         metadata: metadata,
//       );
//     }
//   }
//
//   /// Gets information about a peer
//   PeerInfo? getPeer(PeerId peerId) {
//     return _peers[peerId.toString()];
//   }
//
//   /// Returns all peers that support the given protocol
//   List<PeerInfo> getPeersWithProtocol(String protocol) {
//     return _peers.values.where((p) => p.protocols.contains(protocol)).toList();
//   }
//
//   /// Removes a peer
//   void removePeer(PeerId peerId) {
//     _peers.remove(peerId.toString());
//   }
//
//   /// Starts the cleanup timer
//   void _startCleanupTimer() {
//     _cleanupTimer?.cancel();
//     _cleanupTimer = Timer.periodic(_config.cleanupInterval, (_) => _cleanup());
//   }
//
//   /// Cleans up expired peers
//   void _cleanup() {
//     final now = DateTime.now();
//     _peers.removeWhere((_, peer) {
//       return now.difference(peer.lastSeen) > _config.peerTTL;
//     });
//   }
//
//   /// Removes the oldest peer when store is full
//   void _removeOldestPeer() {
//     if (_peers.isEmpty) return;
//
//     var oldestKey = _peers.keys.first;
//     var oldestTime = _peers[oldestKey]!.lastSeen;
//
//     for (final entry in _peers.entries) {
//       if (entry.value.lastSeen.isBefore(oldestTime)) {
//         oldestKey = entry.key;
//         oldestTime = entry.value.lastSeen;
//       }
//     }
//
//     _peers.remove(oldestKey);
//   }
//
//   /// Disposes of the peer store
//   void dispose() {
//     _cleanupTimer?.cancel();
//     _peers.clear();
//   }
// }