/// Package peerstore provides types and interfaces for local storage of address information,
/// metadata, and public key material about libp2p peers.

import 'dart:async';

import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/protocol/protocol.dart';

import 'package:dart_libp2p/p2p/discovery/peer_info.dart';
import 'package:dart_libp2p/core/peer/addr_info.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/crypto/keys.dart';
import 'package:dart_libp2p/core/certified_addr_book.dart';

/// Error thrown when an item is not found in the peerstore.
class ErrNotFound implements Exception {
  final String message;
  const ErrNotFound([this.message = 'item not found']);
  @override
  String toString() => 'ErrNotFound: $message';
}

/// TTL values for addresses
class AddressTTL {
  /// The expiration time of addresses.
  static const Duration addressTTL = Duration(hours: 1);

  /// The ttl used for a short-lived address.
  static const Duration tempAddrTTL = Duration(minutes: 2);

  /// Used when we recently connected to a peer.
  /// It means that we are reasonably certain of the peer's address.
  /// Increased to 4 hours to support persistent connections and prevent
  /// premature address expiration for gossipsub mesh and DHT routing peers.
  static const Duration recentlyConnectedAddrTTL = Duration(hours: 4);

  /// Used for our own external addresses observed by peers.
  /// Deprecated: observed addresses are maintained till we disconnect from the peer which provided it
  @deprecated
  static const Duration ownObservedAddrTTL = Duration(minutes: 30);

  /// The ttl for a "permanent address" (e.g. bootstrap nodes).
  static const Duration permanentAddrTTL = Duration(days: 365 * 100); // ~100 years

  /// The ttl used for the addresses of a peer to whom
  /// we're connected directly. This is basically permanent, as we will
  /// clear them + re-add under a TempAddrTTL after disconnecting.
  static const Duration connectedAddrTTL = Duration(days: 365 * 100 - 1); // ~100 years - 1 day
}


/// Configuration for the peer store
class PeerStoreConfig {
  /// The maximum number of peers to store
  final int maxPeers;

  /// How long to keep peer records without updates
  final Duration peerTTL;

  /// How often to clean up expired peers
  final Duration cleanupInterval;

  const PeerStoreConfig({
    this.maxPeers = 1000,
    this.peerTTL = const Duration(hours: 24),
    this.cleanupInterval = const Duration(minutes: 30),
  });
}

/// Peerstore provides a thread-safe store of Peer related information.
abstract class Peerstore {
  /// Closes the peerstore and releases any resources.
  Future<void> close();

  /// Returns a peer.AddrInfo struct for given peer.ID.
  /// This is a small slice of the information Peerstore has on
  /// that peer, useful to other services.
  Future<AddrInfo> peerInfo(PeerId id);

  /// Returns all the peer IDs stored across all inner stores.
  Future<List<PeerId>> peers();

  /// Removes all the peer related information except its addresses. To remove the
  /// addresses use `AddrBook.clearAddrs` or set the address ttls to 0.
  Future<void> removePeer(PeerId id);

  /// The address book for this peerstore
  AddrBook get addrBook;

  /// The key book for this peerstore
  KeyBook get keyBook;

//   /// Adds or updates a peer
  Future<void> addOrUpdatePeer(PeerId peerId, {
    List<MultiAddr>? addrs,
    List<String>? protocols,
    Map<String, dynamic>? metadata,
  });

  /// Gets information about a peer
  Future<PeerInfo?> getPeer(PeerId peerId);

  /// The peer metadata for this peerstore
  PeerMetadata get peerMetadata;

  /// The metrics for this peerstore
  Metrics get metrics;

  /// The protocol book for this peerstore
  ProtoBook get protoBook;
}

/// PeerMetadata can handle values of any type. Serializing values is
/// up to the implementation. Dynamic type introspection may not be
/// supported, in which case explicitly enlisting types in the
/// serializer may be required.
///
/// Refer to the docs of the underlying implementation for more
/// information.
abstract class PeerMetadata {
  /// Get / Put is a simple registry for other peer-related key/value pairs.
  /// If we find something we use often, it should become its own set of
  /// methods. This is a last resort.
  dynamic get(PeerId p, String key);

  /// Puts a value for a key and peer.
  void put(PeerId p, String key, dynamic val);

  /// Removes all values stored for a peer.
  Future<void> removePeer(PeerId id);

  Future<Map<String, dynamic>?> getAll(PeerId peerId);

}

/// AddrBook holds the multiaddrs of peers.
abstract class AddrBook {
  /// AddAddr calls AddAddrs(p, [addr], ttl)
  Future<void> addAddr(PeerId p, MultiAddr addr, Duration ttl);

  /// AddAddrs gives this AddrBook addresses to use, with a given ttl
  /// (time-to-live), after which the address is no longer valid.
  /// If the manager has a longer TTL, the operation is a no-op for that address
  Future<void> addAddrs(PeerId p, List<MultiAddr> addrs, Duration ttl);

  /// SetAddr calls SetAddrs(p, [addr], ttl)
  Future<void> setAddr(PeerId p, MultiAddr addr, Duration ttl);

  /// SetAddrs sets the ttl on addresses. This clears any TTL there previously.
  /// This is used when we receive the best estimate of the validity of an address.
  Future<void> setAddrs(PeerId p, List<MultiAddr> addrs, Duration ttl);

  /// UpdateAddrs updates the addresses associated with the given peer that have
  /// the given oldTTL to have the given newTTL.
  Future<void> updateAddrs(PeerId p, Duration oldTTL, Duration newTTL);

  /// Addrs returns all known (and valid) addresses for a given peer.
  Future<List<MultiAddr>> addrs(PeerId p);

  /// AddrStream returns a stream that gets all addresses for a given
  /// peer sent on it. If new addresses are added after the call is made
  /// they will be sent along through the stream as well.
  Future<Stream<MultiAddr>> addrStream(PeerId id);

  /// ClearAddresses removes all previously stored addresses.
  Future<void> clearAddrs(PeerId p);

  /// PeersWithAddrs returns all the peer IDs stored in the AddrBook.
  Future<List<PeerId>> peersWithAddrs();
}

/// KeyBook tracks the keys of Peers.
abstract class KeyBook {
  /// PubKey returns the public key of a peer.
  Future<PublicKey?> pubKey(PeerId id);

  /// AddPubKey stores the public key of a peer.
  void addPubKey(PeerId id, PublicKey pk);

  /// PrivKey returns the private key of a peer, if known. Generally this might only be our own
  /// private key.
  Future<PrivateKey?> privKey(PeerId id);

  /// AddPrivKey stores the private key of a peer.
  void addPrivKey(PeerId id, PrivateKey sk);

  /// PeersWithKeys returns all the peer IDs stored in the KeyBook.
  Future<List<PeerId>> peersWithKeys();

  /// RemovePeer removes all keys associated with a peer.
  void removePeer(PeerId id);
}

/// Metrics tracks metrics across a set of peers.
abstract class Metrics {
  /// RecordLatency records a new latency measurement
  void recordLatency(PeerId id, Duration latency);

  /// LatencyEWMA returns an exponentially-weighted moving avg.
  /// of all measurements of a peer's latency.
  Future<Duration> latencyEWMA(PeerId id);

  /// RemovePeer removes all metrics stored for a peer.
  void removePeer(PeerId id);
}

/// ProtoBook tracks the protocols supported by peers.
abstract class ProtoBook {
  /// GetProtocols returns the protocols registered for the given peer.
  Future<List<ProtocolID>> getProtocols(PeerId id);

  /// AddProtocols adds the given protocols to the peer.
  void addProtocols(PeerId id, List<ProtocolID> protocols);

  /// SetProtocols sets the protocols for the given peer (replacing any previously stored protocols).
  void setProtocols(PeerId id, List<ProtocolID> protocols);

  /// RemoveProtocols removes the given protocols from the peer.
  void removeProtocols(PeerId id, List<ProtocolID> protocols);

  /// SupportsProtocols returns the set of protocols the peer supports from among the given protocols.
  /// If the returned error is not null, the result is indeterminate.
  Future<List<ProtocolID>> supportsProtocols(PeerId id, List<ProtocolID> protocols);

  /// FirstSupportedProtocol returns the first protocol that the peer supports among the given protocols.
  /// If the peer does not support any of the given protocols, this function will return null.
  Future<ProtocolID?> firstSupportedProtocol(PeerId id, List<ProtocolID> protocols);

  /// RemovePeer removes all protocols associated with a peer.
  void removePeer(PeerId id);
}
