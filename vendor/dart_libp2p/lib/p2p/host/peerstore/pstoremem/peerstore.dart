/// Peerstore implementation for the memory-based peerstore.

import 'dart:async';

import 'package:dart_libp2p/p2p/discovery/peer_info.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/peer/addr_info.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/peerstore.dart';

import 'addr_book.dart';
import 'key_book.dart';
import 'metadata.dart';
import 'metrics.dart';
import 'proto_book.dart';

/// A memory-based implementation of the Peerstore interface.
class MemoryPeerstore implements Peerstore {
  final MemoryMetrics _metrics;
  final MemoryKeyBook _keyBook;
  final MemoryAddrBook _addrBook;
  final MemoryProtoBook _protoBook;
  final MemoryPeerMetadata _peerMetadata;

  /// Creates a new memory-based peerstore implementation.
  MemoryPeerstore({
    MemoryMetrics? metrics,
    MemoryKeyBook? keyBook,
    MemoryAddrBook? addrBook,
    MemoryProtoBook? protoBook,
    MemoryPeerMetadata? peerMetadata,
  }) : 
    _metrics = metrics ?? newMetrics(),
    _keyBook = keyBook ?? newKeyBook(),
    _addrBook = addrBook ?? newAddrBook(),
    _protoBook = protoBook ?? newProtoBook(),
    _peerMetadata = peerMetadata ?? newPeerMetadata();

  @override
  AddrBook get addrBook => _addrBook;

  @override
  KeyBook get keyBook => _keyBook;

  @override
  Metrics get metrics => _metrics;

  @override
  PeerMetadata get peerMetadata => _peerMetadata;

  @override
  ProtoBook get protoBook => _protoBook;

  @override
  Future<void> close() async {
    // No resources to release in this implementation
  }

  @override
  Future<AddrInfo> peerInfo(PeerId id) async {
    return AddrInfo(
      id,
      await _addrBook.addrs(id)
    );
  }

  @override
  Future<List<PeerId>> peers() async {
    final set = <String>{};

    // Add peers with keys
    for (final p in await _keyBook.peersWithKeys()) {
      set.add(p.toString());
    }

    // Add peers with addresses
    for (final p in await _addrBook.peersWithAddrs()) {
      set.add(p.toString());
    }

    final result = <PeerId>[];
    for (final p in set) {
      result.add(PeerId.fromString(p));
    }

    return result;
  }

  @override
  Future<void> removePeer(PeerId id) async {
    _keyBook.removePeer(id);
    _protoBook.removePeer(id);
    _peerMetadata.removePeer(id);
    _metrics.removePeer(id);
    // Note: We don't remove the peer from the address book
  }

  @override
  Future<void> addOrUpdatePeer(PeerId peerId, {List<MultiAddr>? addrs, List<String>? protocols, Map<String, dynamic>? metadata}) async {
    if (addrs != null) {
      // Use a default TTL for addresses added via this general method.
      // AddressTTL.addressTTL (1 hour) seems like a reasonable default.
      await _addrBook.addAddrs(peerId, addrs, AddressTTL.addressTTL);
    }

    if (protocols != null) {
      _protoBook.setProtocols(peerId, protocols);
    }

    if (metadata != null) {
      for (var entry in metadata.entries) {
        _peerMetadata.put(peerId, entry.key, entry.value);
      }
    }
  }

  @override
  Future<PeerInfo?> getPeer(PeerId peerId) async {
    final addrs = await _addrBook.addrs(peerId);
    final protocols = await _protoBook.getProtocols(peerId);
    final metadata = await _peerMetadata.getAll(peerId);

    if (addrs.isEmpty && protocols.isEmpty && (metadata?.values.isEmpty ?? true)) {
      return null;
    }

    return PeerInfo(
      peerId: peerId,
      addrs: addrs.toSet(),
      protocols: protocols.toSet(),
      metadata: metadata,
    );
  }
}

/// Creates a new memory-based peerstore implementation.
MemoryPeerstore newPeerstore({
  MemoryMetrics? metrics,
  MemoryKeyBook? keyBook,
  MemoryAddrBook? addrBook,
  MemoryProtoBook? protoBook,
  MemoryPeerMetadata? peerMetadata,
}) {
  return MemoryPeerstore(
    metrics: metrics,
    keyBook: keyBook,
    addrBook: addrBook,
    protoBook: protoBook,
    peerMetadata: peerMetadata,
  );
}
