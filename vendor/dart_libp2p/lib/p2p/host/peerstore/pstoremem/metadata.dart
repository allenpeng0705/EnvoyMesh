/// Metadata implementation for the memory-based peerstore.

import 'dart:collection';

import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/peerstore.dart';
import 'package:synchronized/synchronized.dart';


/// A memory-based implementation of the PeerMetadata interface.
class MemoryPeerMetadata implements PeerMetadata {
  final _ds = HashMap<String, Map<String, dynamic>>();
  final _lock = Lock();

  /// Creates a new memory-based peer metadata implementation.
  MemoryPeerMetadata();

  @override
  Future<dynamic> get(PeerId p, String key) async {
    // Using synchronous lock to match interface
    return await _lock.synchronized(() async {
      final m = _ds[p.toString()];
      if (m == null) {
        throw const ErrNotFound();
      }
      final val = m[key];
      if (val == null) {
        throw const ErrNotFound();
      }
      return val;
    });
  }

  @override
  void put(PeerId p, String key, dynamic val) {
    // Using synchronous lock to match interface
    _lock.synchronized(() {
      final peerKey = p.toString();
      var m = _ds[peerKey];
      if (m == null) {
        m = <String, dynamic>{};
        _ds[peerKey] = m;
      }
      m[key] = val;
    });
  }

  @override
  Future<void> removePeer(PeerId id) async {
    // Using synchronous lock to match interface
    await _lock.synchronized(() async {
      _ds.remove(id.toString());
    });
  }

  Future<Map<String, dynamic>?> getAll(PeerId peerId) async {
    return _lock.synchronized(() {
      return _ds[peerId.toString()];
    });
  }
  
}

/// Creates a new memory-based peer metadata implementation.
MemoryPeerMetadata newPeerMetadata() {
  return MemoryPeerMetadata();
}
