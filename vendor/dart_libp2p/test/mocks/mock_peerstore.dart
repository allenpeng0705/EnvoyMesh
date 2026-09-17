import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/p2p/discovery/peer_info.dart';
import 'package:dart_libp2p/core/peer/addr_info.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/peerstore.dart';
import 'package:dart_libp2p/core/protocol/protocol.dart';
import 'package:dart_libp2p/core/crypto/keys.dart';

/// A mock implementation of Peerstore for testing
class MockPeerstore implements Peerstore {
  final Map<String, List<MultiAddr>> _addresses = {};
  final Map<String, List<ProtocolID>> _protocols = {};
  final Map<String, Map<String, dynamic>> _metadata = {};

  List<MultiAddr> addresses(PeerId peerId) {
    return _addresses[peerId.toString()] ?? [];
  }

  Future<void> addAddrs(PeerId peerId, List<MultiAddr> addrs, Duration ttl) async {
    final id = peerId.toString();
    if (!_addresses.containsKey(id)) {
      _addresses[id] = [];
    }
    _addresses[id]!.addAll(addrs);
  }

  void addProtocols(PeerId peerId, List<ProtocolID> protocols) {
    final id = peerId.toString();
    if (!_protocols.containsKey(id)) {
      _protocols[id] = [];
    }
    _protocols[id]!.addAll(protocols);
  }

  @override
  Future<void> close() async {
    // No-op
  }

  Future<void> delete(PeerId peerId) async {
    final id = peerId.toString();
    _addresses.remove(id);
    _protocols.remove(id);
    _metadata.remove(id);
  }

  dynamic get(PeerId peerId, String key) {
    final id = peerId.toString();
    if (!_metadata.containsKey(id)) {
      return null;
    }
    return _metadata[id]![key];
  }

  @override
  Future<List<PeerId>> peers() async {
    // This is a simplification; in a real implementation we would return actual PeerIds
    return [];
  }

  List<ProtocolID> protocols(PeerId peerId) {
    return _protocols[peerId.toString()] ?? [];
  }

  void put(PeerId peerId, String key, dynamic value) {
    final id = peerId.toString();
    if (!_metadata.containsKey(id)) {
      _metadata[id] = {};
    }
    _metadata[id]![key] = value;
  }

  Future<void> setAddrs(PeerId peerId, List<MultiAddr> addrs, Duration ttl) async {
    final id = peerId.toString();
    _addresses[id] = List.from(addrs);
  }

  void setProtocols(PeerId peerId, List<ProtocolID> protocols) {
    final id = peerId.toString();
    _protocols[id] = List.from(protocols);
  }

  Future<void> supportsProtocols(PeerId peerId, List<ProtocolID> protocols) async {
    // This is a simplification; in a real implementation we would check if the peer supports the protocols
    return;
  }

  @override
  AddrBook get addrBook => _MockAddrBook(this);

  @override
  KeyBook get keyBook => _MockKeyBook();

  @override
  Metrics get metrics => _MockMetrics();

  @override
  Future<AddrInfo> peerInfo(PeerId id) async {
    return AddrInfo(id, addresses(id));
  }

  @override
  PeerMetadata get peerMetadata => _MockPeerMetadata(this);

  @override
  ProtoBook get protoBook => _MockProtoBook(this);

  @override
  Future<void> removePeer(PeerId id) async {
    await delete(id);
  }

  @override
  Future<void> addOrUpdatePeer(PeerId peerId, {List<MultiAddr>? addrs, List<String>? protocols, Map<String, dynamic>? metadata}) async {
    if (addrs != null) {
      addAddrs(peerId, addrs, Duration.zero);
    }

    if (protocols != null) {
      addProtocols(peerId, protocols.map((p) => p ).toList());
    }

    if (metadata != null) {
      for (var entry in metadata.entries) {
        put(peerId, entry.key, entry.value);
      }
    }
  }

  @override
  Future<PeerInfo?> getPeer(PeerId peerId) async {
    final id = peerId.toString();
    if (!_addresses.containsKey(id) &&
        !_protocols.containsKey(id) &&
        !_metadata.containsKey(id)) {
      return null;
    }

    return PeerInfo(
      peerId: peerId,
      addrs: _addresses[id]?.toSet(),
      protocols: _protocols[id]?.map((p) => p.toString()).toSet(),
      metadata: _metadata[id],
    );
  }
}

/// Mock implementation of AddrBook
class _MockAddrBook implements AddrBook {
  final MockPeerstore _peerstore;

  _MockAddrBook(this._peerstore);

  @override
  Future<List<MultiAddr>> addrs(PeerId id) async => _peerstore.addresses(id);

  @override
  Future<void> addAddr(PeerId id, MultiAddr addr, Duration ttl) async {
    await _peerstore.addAddrs(id, [addr], ttl);
  }

  @override
  Future<void> addAddrs(PeerId id, List<MultiAddr> addrs, Duration ttl) async {
    await _peerstore.addAddrs(id, addrs, ttl);
  }

  void clear(PeerId id) {
    _peerstore.setAddrs(id, [], Duration.zero);
  }

  @override
  Future<void> setAddr(PeerId id, MultiAddr addr, Duration ttl) async {
    await _peerstore.setAddrs(id, [addr], ttl);
  }

  @override
  Future<void> setAddrs(PeerId id, List<MultiAddr> addrs, Duration ttl) async {
    _peerstore.setAddrs(id, addrs, ttl);
  }

  @override
  Future<List<PeerId>> peersWithAddrs() async => [];

  Future<void> close() async {}

  @override
  Future<void> clearAddrs(PeerId p) async {
    _peerstore.setAddrs(p, [], Duration.zero);
  }

  @override
  Future<Stream<MultiAddr>> addrStream(PeerId id) async {
    return Stream.fromIterable(_peerstore.addresses(id));
  }

  @override
  Future<void> updateAddrs(PeerId p, Duration oldTTL, Duration newTTL) async {
    // No-op for mock
  }
}

/// Mock implementation of KeyBook
class _MockKeyBook implements KeyBook {
  final Map<String, PublicKey> _publicKeys = {};
  final Map<String, PrivateKey> _privateKeys = {};

  @override
  Future<PublicKey?> pubKey(PeerId id) async => _publicKeys[id.toString()];

  @override
  void addPubKey(PeerId id, PublicKey pk) {
    _publicKeys[id.toString()] = pk;
  }

  @override
  Future<PrivateKey?> privKey(PeerId id) async => _privateKeys[id.toString()];

  @override
  void addPrivKey(PeerId id, PrivateKey sk) {
    _privateKeys[id.toString()] = sk;
  }

  @override
  Future<List<PeerId>> peersWithKeys() async => [];

  @override
  void removePeer(PeerId id) {
    _publicKeys.remove(id.toString());
    _privateKeys.remove(id.toString());
  }
}

/// Mock implementation of ProtoBook
class _MockProtoBook implements ProtoBook {
  final MockPeerstore _peerstore;

  _MockProtoBook(this._peerstore);

  @override
  Future<List<ProtocolID>> getProtocols(PeerId id) async => _peerstore.protocols(id);

  @override
  void addProtocols(PeerId id, List<ProtocolID> protocols) {
    _peerstore.addProtocols(id, protocols);
  }

  @override
  void setProtocols(PeerId id, List<ProtocolID> protocols) {
    _peerstore.setProtocols(id, protocols);
  }

  @override
  void removeProtocols(PeerId id, List<ProtocolID> protocols) {
    final currentProtocols = _peerstore.protocols(id);
    final updatedProtocols = currentProtocols.where((p) => !protocols.contains(p)).toList();
    _peerstore.setProtocols(id, updatedProtocols);
  }

  @override
  Future<List<ProtocolID>> supportsProtocols(PeerId id, List<ProtocolID> protocols) async {
    final supported = _peerstore.protocols(id);
    return protocols.where((p) => supported.contains(p)).toList();
  }

  @override
  void removePeer(PeerId id) {
    _peerstore.setProtocols(id, []);
  }

  @override
  Future<ProtocolID?> firstSupportedProtocol(PeerId id, List<ProtocolID> protocols) async {
    final supported = await supportsProtocols(id, protocols);
    return supported.isNotEmpty ? supported.first : null;
  }
}

/// Mock implementation of PeerMetadata
class _MockPeerMetadata implements PeerMetadata {
  final MockPeerstore _peerstore;

  _MockPeerMetadata(this._peerstore);

  @override
  dynamic get(PeerId id, String key) => _peerstore.get(id, key);

  @override
  void put(PeerId id, String key, dynamic val) {
    _peerstore.put(id, key, val);
  }

  @override
  Future<void> removePeer(PeerId id) async {
    await _peerstore.delete(id);
  }

  @override
  Future<Map<String, dynamic>?> getAll(PeerId peerId) async {
    final id = peerId.toString();
    return _peerstore._metadata[id];
  }
}

/// Mock implementation of Metrics
class _MockMetrics implements Metrics {
  int get count => 0;

  Future<void> close() async {}

  @override
  void recordLatency(PeerId id, Duration latency) {
    // No-op for mock
  }

  @override
  Future<Duration> latencyEWMA(PeerId id) async => Duration.zero;

  @override
  void removePeer(PeerId id) {
    // No-op for mock
  }
}
