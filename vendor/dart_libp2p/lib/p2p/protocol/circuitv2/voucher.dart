// Copyright (c) 2022 The dart-libp2p Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

import 'dart:typed_data';
import 'package:fixnum/fixnum.dart';
import 'package:dart_libp2p/p2p/protocol/circuitv2/pb/voucher.pb.dart';
import 'package:dart_libp2p/p2p/protocol/circuitv2/proto.dart';

import '../../../core/peer/peer_id.dart';

/// A reservation voucher for circuit relay.
class ReservationVoucherData {
  /// The ID of the peer providing relay service.
  final PeerId relay;

  /// The ID of the peer receiving relay service through the relay.
  final PeerId peer;

  /// The expiration time of the reservation (Unix timestamp).
  final DateTime expiration;

  /// Creates a new reservation voucher.
  ReservationVoucherData({
    required this.relay,
    required this.peer,
    required this.expiration,
  });

  String domain() => CircuitV2Protocol.recordDomain;

  List<int> codec() => CircuitV2Protocol.recordCodec;

  Uint8List marshalRecord() {
    final expiration = Int64(this.expiration.millisecondsSinceEpoch ~/ 1000);
    final pb = ReservationVoucher(
      relay: relay.toBytes(),
      peer: peer.toBytes(),
      expiration: expiration,
    );
    return Uint8List.fromList(pb.writeToBuffer());
  }

  /// Creates a ReservationVoucherData from a protocol buffer message.
  static ReservationVoucherData fromProto(ReservationVoucher pb) {
    final relay = PeerId.fromBytes(Uint8List.fromList(pb.relay));
    final peer = PeerId.fromBytes(Uint8List.fromList(pb.peer));
    final expiration = DateTime.fromMillisecondsSinceEpoch(pb.expiration.toInt() * 1000);
    return ReservationVoucherData(
      relay: relay,
      peer: peer,
      expiration: expiration,
    );
  }

  /// Converts this voucher to a protocol buffer message.
  ReservationVoucher toProto() {
    final expiration = Int64(this.expiration.millisecondsSinceEpoch ~/ 1000);
    return ReservationVoucher(
      relay: relay.toBytes(),
      peer: peer.toBytes(),
      expiration: expiration,
    );
  }
}