import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/peer/pb/peer_record.pb.dart' as pb;
import 'package:fixnum/fixnum.dart';
import 'package:protobuf/protobuf.dart';
import 'package:synchronized/synchronized.dart';
import 'dart:core';

import '../record/record_registry.dart';
import 'addr_info.dart';

// PeerRecordEnvelopeDomain is the domain string used for peer records contained in a envelope.
const String PeerRecordEnvelopeDomain = "libp2p-peer-record";

// PeerRecordEnvelopePayloadType is the type hint used to identify peer records in an Envelope.
// Defined in https://github.com/multiformats/multicodec/blob/master/table.csv
// with name "libp2p-peer-record".
final Uint8List PeerRecordEnvelopePayloadType = Uint8List.fromList([0x03, 0x01]);

/// PeerRecord contains information that is broadly useful to share with other peers,
/// either through a direct exchange (as in the libp2p identify protocol), or through
/// a Peer Routing provider, such as a DHT.
///
/// Currently, a PeerRecord contains the public listen addresses for a peer, but this
/// is expected to expand to include other information in the future.
///
/// PeerRecords are ordered in time by their Seq field. Newer PeerRecords must have
/// greater Seq values than older records. The NewPeerRecord function will create
/// a PeerRecord with a timestamp-based Seq value.
class PeerRecord implements RecordBase{
  /// PeerID is the ID of the peer this record pertains to.
  final PeerId peerId;

  /// Addrs contains the public addresses of the peer this record pertains to.
  final List<MultiAddr> addrs;

  /// Seq is a monotonically-increasing sequence counter that's used to order
  /// PeerRecords in time. The interval between Seq values is unspecified,
  /// but newer PeerRecords MUST have a greater Seq value than older records
  /// for the same peer.
  final int seq;

  PeerRecord({
    required this.peerId,
    required this.addrs,
    required this.seq,
  });

  /// Creates a new PeerRecord with a timestamp-based sequence number.
  /// The returned record is otherwise empty and should be populated by the caller.
  static Future<PeerRecord> newRecord() async {
    return PeerRecord(
      peerId: PeerId.fromString(''),
      addrs: [],
      seq: await _timestampSeq(),
    );
  }

  /// Creates a PeerRecord from an AddrInfo struct.
  /// The returned record will have a timestamp-based sequence number.
  static Future<PeerRecord> fromAddrInfo(AddrInfo info) async {
    return PeerRecord(
      peerId: info.id,
      addrs: info.addrs,
      seq: await _timestampSeq(),
    );
  }

  /// Creates a PeerRecord from a protobuf PeerRecord struct.
  factory PeerRecord.fromProtobuf(pb.PeerRecord msg) {
    final id = PeerId.fromBytes(Uint8List.fromList(msg.peerId));
    final addrs = _addrsFromProtobuf(msg.addresses);
    return PeerRecord(
      peerId: id,
      addrs: addrs,
      seq: msg.seq.toInt(),
    );
  }

  /// Domain is used when signing and validating PeerRecords contained in Envelopes.
  /// It is constant for all PeerRecord instances.
  String domain() {
    return PeerRecordEnvelopeDomain;
  }

  /// Codec is a binary identifier for the PeerRecord type. It is constant for all PeerRecord instances.
  Uint8List codec() {
    return PeerRecordEnvelopePayloadType;
  }

  /// UnmarshalRecord parses a PeerRecord from a byte slice.
  /// This method is called automatically when consuming a record.Envelope
  /// whose PayloadType indicates that it contains a PeerRecord.
  // PeerRecord unmarshalRecord(Uint8List bytes) {
  //   try {
  //     final msg = pb.PeerRecord.fromBuffer(bytes);
  //     return
  //     this.peerId = msg.peerId;
  //     this.addrs = msg.addresses;
  //     this.seq = msg.seq;
  //
  //     return PeerRecord.fromProtobuf(msg);
  //   } catch (e) {
  //     throw FormatException('Failed to unmarshal PeerRecord: $e');
  //   }
  // }

  /// Unmarshal a record payload into a concrete PeerRecord instance
  ///
  static PeerRecord fromProtobufBytes(Uint8List payload) {

      try {
        final msg = pb.PeerRecord.fromBuffer(payload);
        return PeerRecord(
            peerId :  PeerId.fromBytes(Uint8List.fromList(msg.peerId)),
            addrs: _addrsFromProtobuf(msg.addresses),
            seq: msg.seq.toInt()
        );

      } catch (e) {
        throw FormatException('Failed to unmarshal PeerRecord: $e');
      }

  }

  /// MarshalRecord serializes a PeerRecord to a byte slice.
  /// This method is called automatically when constructing a routing.Envelope
  /// using Seal or PeerRecord.Sign.
  Uint8List marshalRecord() {
    try {
      final msg = toProtobuf();
      return msg.writeToBuffer();
    } catch (e) {
      throw FormatException('Failed to marshal PeerRecord: $e');
    }
  }

  /// Equal returns true if the other PeerRecord is identical to this one.
  bool equal(PeerRecord other) {
    if (peerId != other.peerId) return false;
    if (seq != other.seq) return false;
    if (addrs.length != other.addrs.length) return false;
    
    for (var i = 0; i < addrs.length; i++) {
      if (!addrs[i].equals(other.addrs[i])) return false;
    }
    return true;
  }

  /// ToProtobuf returns the equivalent Protocol Buffer struct object of a PeerRecord.
  pb.PeerRecord toProtobuf() {
    return pb.PeerRecord(
      peerId: peerId.toBytes(),
      addresses: _addrsToProtobuf(addrs),
      seq: Int64(seq),
    );
  }

  static List<MultiAddr> _addrsFromProtobuf(List<pb.PeerRecord_AddressInfo> addrs) {
    return addrs.map((addr) => MultiAddr.fromBytes(Uint8List.fromList(addr.multiaddr))).toList();
  }

  static List<pb.PeerRecord_AddressInfo> _addrsToProtobuf(List<MultiAddr> addrs) {
    return addrs.map((addr) => pb.PeerRecord_AddressInfo(multiaddr: addr.toBytes())).toList();

  }

  static int _lastTimestamp = 0;
  static final _timestampLock = Lock();

  /// TimestampSeq is a helper to generate a timestamp-based sequence number for a PeerRecord.
  static Future<int> _timestampSeq() async {
    return await _timestampLock.synchronized(() async {
      final now = DateTime.now().millisecondsSinceEpoch;
      // Not all clocks are strictly increasing, but we need these sequence numbers to be strictly
      // increasing.
      if (now <= _lastTimestamp) {
        _lastTimestamp++;
        return _lastTimestamp;
      }
      _lastTimestamp = now;
      return now;
    });
  }
}

