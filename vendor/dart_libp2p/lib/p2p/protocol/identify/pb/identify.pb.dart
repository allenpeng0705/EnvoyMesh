//
//  Generated code. Do not modify.
//  source: identify.proto
//
// @dart = 2.12

// ignore_for_file: annotate_overrides, camel_case_types, comment_references
// ignore_for_file: constant_identifier_names, library_prefixes
// ignore_for_file: non_constant_identifier_names, prefer_final_fields
// ignore_for_file: unnecessary_import, unnecessary_this, unused_import

import 'dart:core' as $core;

import 'package:protobuf/protobuf.dart' as $pb;

class Identify extends $pb.GeneratedMessage {
  factory Identify({
    $core.List<$core.int>? publicKey,
    $core.Iterable<$core.List<$core.int>>? listenAddrs,
    $core.Iterable<$core.String>? protocols,
    $core.List<$core.int>? observedAddr,
    $core.String? protocolVersion,
    $core.String? agentVersion,
    $core.List<$core.int>? signedPeerRecord,
  }) {
    final $result = create();
    if (publicKey != null) {
      $result.publicKey = publicKey;
    }
    if (listenAddrs != null) {
      $result.listenAddrs.addAll(listenAddrs);
    }
    if (protocols != null) {
      $result.protocols.addAll(protocols);
    }
    if (observedAddr != null) {
      $result.observedAddr = observedAddr;
    }
    if (protocolVersion != null) {
      $result.protocolVersion = protocolVersion;
    }
    if (agentVersion != null) {
      $result.agentVersion = agentVersion;
    }
    if (signedPeerRecord != null) {
      $result.signedPeerRecord = signedPeerRecord;
    }
    return $result;
  }
  Identify._() : super();
  factory Identify.fromBuffer($core.List<$core.int> i, [$pb.ExtensionRegistry r = $pb.ExtensionRegistry.EMPTY]) => create()..mergeFromBuffer(i, r);
  factory Identify.fromJson($core.String i, [$pb.ExtensionRegistry r = $pb.ExtensionRegistry.EMPTY]) => create()..mergeFromJson(i, r);

  static final $pb.BuilderInfo _i = $pb.BuilderInfo(_omitMessageNames ? '' : 'Identify', package: const $pb.PackageName(_omitMessageNames ? '' : 'identify.pb'), createEmptyInstance: create)
    ..a<$core.List<$core.int>>(1, _omitFieldNames ? '' : 'publicKey', $pb.PbFieldType.OY, protoName: 'publicKey')
    ..p<$core.List<$core.int>>(2, _omitFieldNames ? '' : 'listenAddrs', $pb.PbFieldType.PY, protoName: 'listenAddrs')
    ..pPS(3, _omitFieldNames ? '' : 'protocols')
    ..a<$core.List<$core.int>>(4, _omitFieldNames ? '' : 'observedAddr', $pb.PbFieldType.OY, protoName: 'observedAddr')
    ..aOS(5, _omitFieldNames ? '' : 'protocolVersion', protoName: 'protocolVersion')
    ..aOS(6, _omitFieldNames ? '' : 'agentVersion', protoName: 'agentVersion')
    ..a<$core.List<$core.int>>(8, _omitFieldNames ? '' : 'signedPeerRecord', $pb.PbFieldType.OY, protoName: 'signedPeerRecord')
    ..hasRequiredFields = false
  ;

  @$core.Deprecated(
  'Using this can add significant overhead to your binary. '
  'Use [GeneratedMessageGenericExtensions.deepCopy] instead. '
  'Will be removed in next major version')
  Identify clone() => Identify()..mergeFromMessage(this);
  @$core.Deprecated(
  'Using this can add significant overhead to your binary. '
  'Use [GeneratedMessageGenericExtensions.rebuild] instead. '
  'Will be removed in next major version')
  Identify copyWith(void Function(Identify) updates) => super.copyWith((message) => updates(message as Identify)) as Identify;

  $pb.BuilderInfo get info_ => _i;

  @$core.pragma('dart2js:noInline')
  static Identify create() => Identify._();
  Identify createEmptyInstance() => create();
  static $pb.PbList<Identify> createRepeated() => $pb.PbList<Identify>();
  @$core.pragma('dart2js:noInline')
  static Identify getDefault() => _defaultInstance ??= $pb.GeneratedMessage.$_defaultFor<Identify>(create);
  static Identify? _defaultInstance;

  /// publicKey is this node's public key (which also gives its node.ID)
  /// - may not need to be sent, as secure channel implies it has been sent.
  /// - then again, if we change / disable secure channel, may still want it.
  @$pb.TagNumber(1)
  $core.List<$core.int> get publicKey => $_getN(0);
  @$pb.TagNumber(1)
  set publicKey($core.List<$core.int> v) { $_setBytes(0, v); }
  @$pb.TagNumber(1)
  $core.bool hasPublicKey() => $_has(0);
  @$pb.TagNumber(1)
  void clearPublicKey() => clearField(1);

  /// listenAddrs are the multiaddrs the sender node listens for open connections on
  @$pb.TagNumber(2)
  $core.List<$core.List<$core.int>> get listenAddrs => $_getList(1);

  /// protocols are the services this node is running
  @$pb.TagNumber(3)
  $core.List<$core.String> get protocols => $_getList(2);

  /// oservedAddr is the multiaddr of the remote endpoint that the sender node perceives
  /// this is useful information to convey to the other side, as it helps the remote endpoint
  /// determine whether its connection to the local peer goes through NAT.
  @$pb.TagNumber(4)
  $core.List<$core.int> get observedAddr => $_getN(3);
  @$pb.TagNumber(4)
  set observedAddr($core.List<$core.int> v) { $_setBytes(3, v); }
  @$pb.TagNumber(4)
  $core.bool hasObservedAddr() => $_has(3);
  @$pb.TagNumber(4)
  void clearObservedAddr() => clearField(4);

  /// protocolVersion determines compatibility between peers
  @$pb.TagNumber(5)
  $core.String get protocolVersion => $_getSZ(4);
  @$pb.TagNumber(5)
  set protocolVersion($core.String v) { $_setString(4, v); }
  @$pb.TagNumber(5)
  $core.bool hasProtocolVersion() => $_has(4);
  @$pb.TagNumber(5)
  void clearProtocolVersion() => clearField(5);

  /// agentVersion is like a UserAgent string in browsers, or client version in bittorrent
  /// includes the client name and client.
  @$pb.TagNumber(6)
  $core.String get agentVersion => $_getSZ(5);
  @$pb.TagNumber(6)
  set agentVersion($core.String v) { $_setString(5, v); }
  @$pb.TagNumber(6)
  $core.bool hasAgentVersion() => $_has(5);
  @$pb.TagNumber(6)
  void clearAgentVersion() => clearField(6);

  /// signedPeerRecord contains a serialized SignedEnvelope containing a PeerRecord,
  /// signed by the sending node. It contains the same addresses as the listenAddrs field, but
  /// in a form that lets us share authenticated addrs with other peers.
  /// see github.com/libp2p/go-libp2p/core/record/pb/envelope.proto and
  /// github.com/libp2p/go-libp2p/core/peer/pb/peer_record.proto for message definitions.
  @$pb.TagNumber(8)
  $core.List<$core.int> get signedPeerRecord => $_getN(6);
  @$pb.TagNumber(8)
  set signedPeerRecord($core.List<$core.int> v) { $_setBytes(6, v); }
  @$pb.TagNumber(8)
  $core.bool hasSignedPeerRecord() => $_has(6);
  @$pb.TagNumber(8)
  void clearSignedPeerRecord() => clearField(8);
}


const _omitFieldNames = $core.bool.fromEnvironment('protobuf.omit_field_names');
const _omitMessageNames = $core.bool.fromEnvironment('protobuf.omit_message_names');
