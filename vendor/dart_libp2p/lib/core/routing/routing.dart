import 'dart:async';
import 'dart:typed_data';
import 'package:dcid/dcid.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/peer/addr_info.dart';
import 'package:dart_libp2p/core/routing/options.dart';


/// Error thrown when a routing operation fails to find the requested record
class NotFoundError implements Exception {
  final String message;
  const NotFoundError([this.message = 'routing: not found']);
  @override
  String toString() => message;
}

/// Error thrown when a routing operation is not supported
class NotSupportedError implements Exception {
  final String message;
  const NotSupportedError([this.message = 'routing: operation or key not supported']);
  @override
  String toString() => message;
}

/// ContentProviding is able to announce where to find content on the Routing system.
abstract class ContentProviding {
  /// Provide adds the given cid to the content routing system. If 'true' is
  /// passed, it also announces it, otherwise it is just kept in the local
  /// accounting of which objects are being provided.
  Future<void> provide(CID cid, bool announce);
}

/// ContentDiscovery is able to retrieve providers for a given CID using the Routing system.
abstract class ContentDiscovery {
  /// Search for peers who are able to provide a given key
  /// 
  /// When count is 0, this method will return an unbounded number of results.
  Stream<AddrInfo> findProvidersAsync(CID cid, int count);
}

/// ContentRouting is a value provider layer of indirection. It is used to find
/// information about who has what content.
///
/// Content is identified by CID (content identifier), which encodes a hash
/// of the identified content in a future-proof manner.
abstract class ContentRouting implements ContentProviding, ContentDiscovery {}

/// PeerRouting is a way to find address information about certain peers.
/// This can be implemented by a simple lookup table, a tracking server,
/// or even a DHT.
abstract class PeerRouting {
  /// FindPeer searches for a peer with given ID, returns a peer.AddrInfo
  /// with relevant addresses.
  Future<AddrInfo?> findPeer(PeerId id, {RoutingOptions? options});
}

/// ValueStore is a basic Put/Get interface.
abstract class ValueStore {
  /// PutValue adds value corresponding to given Key.
  Future<void> putValue(String key, Uint8List value, {RoutingOptions? options});

  /// GetValue searches for the value corresponding to given Key.
  Future<Uint8List?> getValue(String key, RoutingOptions? options);

  /// SearchValue searches for better and better values from this value
  /// store corresponding to the given Key.
  Stream<Uint8List> searchValue(String key, RoutingOptions? options);
}

/// PubKeyFetcher is an interface that should be implemented by value stores
/// that can optimize retrieval of public keys.
abstract class PubKeyFetcher {
  /// GetPublicKey returns the public key for the given peer.
  Future<dynamic> getPublicKey(PeerId id);
}

/// Routing is the combination of different routing types supported by libp2p.
/// It can be satisfied by a single item (such as a DHT) or multiple different
/// pieces that are more optimized to each task.
abstract class Routing implements ContentRouting, PeerRouting, ValueStore {
  /// Bootstrap allows callers to hint to the routing system to get into a
  /// Bootstrapped state and remain there. It is not a synchronous call.
  Future<void> bootstrap();
}

/// Returns the key used to retrieve public keys from a value store.
String keyForPublicKey(PeerId id) {
  return '/pk/${id.toString()}';
}

/// Retrieves the public key associated with the given peer ID from the value store.
///
/// If the ValueStore is also a PubKeyFetcher, this method will call getPublicKey
/// (which may be better optimized) instead of getValue.
Future<dynamic> getPublicKey(ValueStore store, PeerId id) async {
  // First try to extract the public key from the peer ID if possible
  try {
    final key = await id.extractPublicKey();
    if (key != null) {
      return key;
    }
  } catch (e) {
    // If extraction fails, continue to fetch from the store
  }

  // If the store is a PubKeyFetcher, use the optimized method
  if (store is PubKeyFetcher) {
    PubKeyFetcher pkFetcher = store as PubKeyFetcher;
    return await pkFetcher.getPublicKey(id);
  }

  // Otherwise, use the regular getValue method
  final key = keyForPublicKey(id);
  final pkval = await store.getValue(key, null);

  // Unmarshal the public key (implementation would depend on the key format)
  // This is a placeholder for the actual implementation
  return pkval;
}
