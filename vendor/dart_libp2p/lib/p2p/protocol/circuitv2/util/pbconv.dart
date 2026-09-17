// Copyright (c) 2022 The dart-libp2p Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

import 'dart:typed_data';

import 'package:dart_libp2p/p2p/protocol/circuitv2/pb/circuit.pb.dart';

import '../../../../core/multiaddr.dart';
import '../../../discovery/peer_info.dart';
import '../../../../core/peer/peer_id.dart';

/// Converts a protocol buffer Peer message to a PeerInfo.
PeerInfo peerToPeerInfoV2(Peer p) {
  if (p.id.isEmpty) {
    throw Exception('nil peer');
  }

  final id = PeerId.fromBytes(Uint8List.fromList(p.id));
  final addrs = <MultiAddr>[];

  for (final addrBytes in p.addrs) {
    try {
      final addr = MultiAddr.fromBytes(Uint8List.fromList(addrBytes));
      addrs.add(addr);
    } catch (e) {
      // Ignore invalid addresses
    }
  }

  return PeerInfo(peerId: id, addrs: addrs.toSet());
}

/// Converts a PeerInfo to a protocol buffer Peer message.
Peer peerInfoToPeerV2(PeerInfo pi) {
  final addrs = <List<int>>[];
  for (final addr in pi.addrs) {
    addrs.add(addr.toBytes());
  }

  return Peer()
    ..id = pi.peerId.toBytes()
    ..addrs.addAll(addrs);
}