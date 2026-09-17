/// ProtoBook implementation for the memory-based peerstore.

import 'dart:collection';

import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/peerstore.dart';
import 'package:dart_libp2p/core/protocol/protocol.dart';
import 'package:synchronized/synchronized.dart';


/// Error thrown when too many protocols are added for a peer.
class ErrTooManyProtocols implements Exception {
  final String message;
  const ErrTooManyProtocols([this.message = 'too many protocols']);
  @override
  String toString() => 'ErrTooManyProtocols: $message';
}

/// A segment of the protocol book, used for sharding.
class ProtoSegment {
  final _protocols = HashMap<String, Set<ProtocolID>>();

  ProtoSegment();
}

/// A memory-based implementation of the ProtoBook interface.
class MemoryProtoBook implements ProtoBook {
  final List<ProtoSegment> _segments = List.generate(256, (_) => ProtoSegment());
  final int _maxProtos;
  final _lock = Lock();

  /// Creates a new memory-based protocol book implementation.
  MemoryProtoBook({int maxProtos = 128}) : _maxProtos = maxProtos;

  /// Gets the segment for a peer ID.
  ProtoSegment _getSegment(PeerId p) {
    final peerStr = p.toString();
    final lastByte = peerStr.codeUnitAt(peerStr.length - 1) % 256;
    return _segments[lastByte];
  }

  @override
  Future<void> setProtocols(PeerId id, List<ProtocolID> protocols) async {
    if (protocols.length > _maxProtos) {
      throw const ErrTooManyProtocols();
    }

    final newProtos = <ProtocolID>{};
    for (final proto in protocols) {
      newProtos.add(proto);
    }

    final s = _getSegment(id);
    await _lock.synchronized(() async {
      s._protocols[id.toString()] = newProtos;
    });
  }

  @override
  Future<void> addProtocols(PeerId id, List<ProtocolID> protocols) async {
    final s = _getSegment(id);
    await _lock.synchronized(() async {
      final peerKey = id.toString();
      var protoSet = s._protocols[peerKey];
      if (protoSet == null) {
        protoSet = <ProtocolID>{};
        s._protocols[peerKey] = protoSet;
      }

      if (protoSet.length + protocols.length > _maxProtos) {
        throw const ErrTooManyProtocols();
      }

      for (final proto in protocols) {
        protoSet.add(proto);
      }
    });
  }

  @override
  Future<List<ProtocolID>> getProtocols(PeerId id) async{
    final s = _getSegment(id);
    return await _lock.synchronized(() async {
      final protoSet = s._protocols[id.toString()];
      if (protoSet == null) {
        return <ProtocolID>[];
      }
      return protoSet.toList();
    });
  }

  @override
  void removeProtocols(PeerId id, List<ProtocolID> protocols) {
    final s = _getSegment(id);
    // Using synchronous lock to match interface
    _lock.synchronized(() {
      final peerKey = id.toString();
      final protoSet = s._protocols[peerKey];
      if (protoSet == null) {
        // Nothing to remove
        return;
      }

      for (final proto in protocols) {
        protoSet.remove(proto);
      }

      if (protoSet.isEmpty) {
        s._protocols.remove(peerKey);
      }
    });
  }

  @override
  Future<List<ProtocolID>> supportsProtocols(PeerId id, List<ProtocolID> protocols) async {
    final s = _getSegment(id);
    return await _lock.synchronized(() async {
      final result = <ProtocolID>[];
      final protoSet = s._protocols[id.toString()];
      if (protoSet == null) {
        return result;
      }

      for (final proto in protocols) {
        if (protoSet.contains(proto)) {
          result.add(proto);
        }
      }

      return result;
    });
  }

  @override
  Future<ProtocolID?> firstSupportedProtocol(PeerId id, List<ProtocolID> protocols) async {
    final s = _getSegment(id);
    return await _lock.synchronized(() async{
      final protoSet = s._protocols[id.toString()];
      if (protoSet == null) {
        return null;
      }

      for (final proto in protocols) {
        if (protoSet.contains(proto)) {
          return proto;
        }
      }

      return null;
    });
  }

  @override
  Future<void> removePeer(PeerId id) async {
    final s = _getSegment(id);
    await _lock.synchronized(() async {
      s._protocols.remove(id.toString());
    });
  }
}

/// Creates a new memory-based protocol book implementation.
MemoryProtoBook newProtoBook({int maxProtos = 128}) {
  return MemoryProtoBook(maxProtos: maxProtos);
}
