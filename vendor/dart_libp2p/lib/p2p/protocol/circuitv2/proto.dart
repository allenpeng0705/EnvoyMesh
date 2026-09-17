// Copyright (c) 2022 The dart-libp2p Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

/// Protocol identifiers for the circuit relay protocol.
class CircuitV2Protocol {
  /// Protocol ID for the hop protocol (relay side).
  static const String protoIDv2Hop = '/libp2p/circuit/relay/0.2.0/hop';

  /// Protocol ID for the stop protocol (client side).
  static const String protoIDv2Stop = '/libp2p/circuit/relay/0.2.0/stop';

  /// Domain for the reservation voucher record.
  static const String recordDomain = 'libp2p-relay-rsvp';

  /// Codec for the reservation voucher record.
  static const List<int> recordCodec = [0x03, 0x02];
}