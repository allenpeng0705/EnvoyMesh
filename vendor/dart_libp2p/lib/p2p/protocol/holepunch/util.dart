/// Utility functions for the holepunch protocol.

import 'dart:typed_data';

import 'package:dart_libp2p/core/host/host.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';


/// Protocol ID for the holepunch protocol
const protocolId = '/libp2p/dcutr';

/// Service name for the holepunch protocol
const serviceName = 'libp2p.holepunch';

/// Stream timeout for the holepunch protocol
const streamTimeout = Duration(minutes: 1);

/// Maximum message size for the holepunch protocol
const maxMsgSize = 4 * 1024; // 4K

/// Dial timeout for hole punching
const dialTimeout = Duration(seconds: 5);

/// Maximum number of retries for hole punching
const maxRetries = 3;

/// Removes relay addresses from a list of multiaddrs
List<MultiAddr> removeRelayAddrs(List<MultiAddr> addrs) {
  return addrs.where((addr) => !isRelayAddress(addr)).toList();
}

/// Checks if a multiaddr is a relay address
bool isRelayAddress(MultiAddr addr) {
  return addr.hasProtocol('p2p-circuit');
}

/// Converts a list of multiaddrs to a list of byte arrays
List<Uint8List> addrsToBytes(List<MultiAddr> addrs) {
  return addrs.map((addr) => addr.toBytes()).toList();
}

/// Converts a list of byte arrays to a list of multiaddrs
List<MultiAddr> addrsFromBytes(List<dynamic> bytes) {
  final addrs = <MultiAddr>[];
  for (final byte in bytes) {
    try {
      final Uint8List byteList = byte is Uint8List ? byte : Uint8List.fromList(byte as List<int>);
      final addr = MultiAddr.fromBytes(byteList);
      addrs.add(addr);
    } catch (_) {
      // Skip invalid addresses
    }
  }
  return addrs;
}


/// Gets a direct (non-relay) connection to a peer if one exists
Conn? getDirectConnection(Host host, PeerId peerId) {
  for (final conn in host.network.connsToPeer(peerId)) {
    if (!isRelayAddress(conn.remoteMultiaddr)) {
      return conn;
    }
  }
  return null;
}
