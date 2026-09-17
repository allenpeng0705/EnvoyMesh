/// KeyBook implementation for the memory-based peerstore.

import 'dart:collection';

import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/peerstore.dart';
import 'package:synchronized/synchronized.dart';
import 'package:dart_libp2p/core/crypto/keys.dart';


/// A memory-based implementation of the KeyBook interface.
class MemoryKeyBook implements KeyBook {
  final _pks = HashMap<String, PublicKey>();
  final _sks = HashMap<String, PrivateKey>();
  final _lock = Lock();

  /// Creates a new memory-based key book implementation.
  MemoryKeyBook();

  @override
  Future<List<PeerId>> peersWithKeys() async {
    return _lock.synchronized(() async {
      final result = <PeerId>[];

      // Add peers with public keys
      for (final p in _pks.keys) {
        result.add(PeerId.fromString(p));
      }

      // Add peers with private keys (if not already added)
      for (final p in _sks.keys) {
        if (!_pks.containsKey(p)) {
          result.add(PeerId.fromString(p));
        }
      }

      return result;
    });
  }

  @override
  Future<PublicKey?> pubKey(PeerId id) async {
    final pk = await _lock.synchronized(() async {
      return _pks[id.toString()];
    });

    if (pk != null) {
      return pk;
    }

    // Try to extract the public key from the peer ID
    try {
      final extractedPk = await id.extractPublicKey();
      if (extractedPk != null) {
        _lock.synchronized(() async {
          _pks[id.toString()] = extractedPk;
        });
        return extractedPk;
      }
    } catch (e) {
      // Ignore extraction errors
    }

    return null;
  }

  @override
  void addPubKey(PeerId id, PublicKey pk) {
    // Check that the ID matches the public key
    if (!id.matchesPublicKey(pk)) {
      throw Exception('ID does not match PublicKey');
    }

    // Using synchronous lock to match interface
    _lock.synchronized(() {
      _pks[id.toString()] = pk;
    });
  }

  @override
  Future<PrivateKey?> privKey(PeerId id) async {
    return _lock.synchronized(() async {
      return _sks[id.toString()];
    });
  }

  @override
  void addPrivKey(PeerId id, PrivateKey sk) {
    // Check that the ID matches the private key
    if (!id.matchesPrivateKey(sk)) {
      throw Exception('ID does not match PrivateKey');
    }

    // Using synchronous lock to match interface
    _lock.synchronized(() {
      _sks[id.toString()] = sk;
    });
  }

  @override
  void removePeer(PeerId id) {
    // Using synchronous lock to match interface
    _lock.synchronized(() {
      final peerKey = id.toString();
      _sks.remove(peerKey);
      _pks.remove(peerKey);
    });
  }
}

/// Creates a new memory-based key book implementation.
MemoryKeyBook newKeyBook() {
  return MemoryKeyBook();
}
