//
//  Generated code. Do not modify.
//  source: voucher.proto
//
// @dart = 2.12

// ignore_for_file: annotate_overrides, camel_case_types, comment_references
// ignore_for_file: constant_identifier_names, library_prefixes
// ignore_for_file: non_constant_identifier_names, prefer_final_fields
// ignore_for_file: unnecessary_import, unnecessary_this, unused_import

import 'dart:core' as $core;

import 'package:fixnum/fixnum.dart' as $fixnum;
import 'package:protobuf/protobuf.dart' as $pb;

class ReservationVoucher extends $pb.GeneratedMessage {
  factory ReservationVoucher({
    $core.List<$core.int>? relay,
    $core.List<$core.int>? peer,
    $fixnum.Int64? expiration,
  }) {
    final $result = create();
    if (relay != null) {
      $result.relay = relay;
    }
    if (peer != null) {
      $result.peer = peer;
    }
    if (expiration != null) {
      $result.expiration = expiration;
    }
    return $result;
  }
  ReservationVoucher._() : super();
  factory ReservationVoucher.fromBuffer($core.List<$core.int> i, [$pb.ExtensionRegistry r = $pb.ExtensionRegistry.EMPTY]) => create()..mergeFromBuffer(i, r);
  factory ReservationVoucher.fromJson($core.String i, [$pb.ExtensionRegistry r = $pb.ExtensionRegistry.EMPTY]) => create()..mergeFromJson(i, r);

  static final $pb.BuilderInfo _i = $pb.BuilderInfo(_omitMessageNames ? '' : 'ReservationVoucher', package: const $pb.PackageName(_omitMessageNames ? '' : 'circuit.pb'), createEmptyInstance: create)
    ..a<$core.List<$core.int>>(1, _omitFieldNames ? '' : 'relay', $pb.PbFieldType.OY)
    ..a<$core.List<$core.int>>(2, _omitFieldNames ? '' : 'peer', $pb.PbFieldType.OY)
    ..a<$fixnum.Int64>(3, _omitFieldNames ? '' : 'expiration', $pb.PbFieldType.OU6, defaultOrMaker: $fixnum.Int64.ZERO)
    ..hasRequiredFields = false
  ;

  @$core.Deprecated(
  'Using this can add significant overhead to your binary. '
  'Use [GeneratedMessageGenericExtensions.deepCopy] instead. '
  'Will be removed in next major version')
  ReservationVoucher clone() => ReservationVoucher()..mergeFromMessage(this);
  @$core.Deprecated(
  'Using this can add significant overhead to your binary. '
  'Use [GeneratedMessageGenericExtensions.rebuild] instead. '
  'Will be removed in next major version')
  ReservationVoucher copyWith(void Function(ReservationVoucher) updates) => super.copyWith((message) => updates(message as ReservationVoucher)) as ReservationVoucher;

  $pb.BuilderInfo get info_ => _i;

  @$core.pragma('dart2js:noInline')
  static ReservationVoucher create() => ReservationVoucher._();
  ReservationVoucher createEmptyInstance() => create();
  static $pb.PbList<ReservationVoucher> createRepeated() => $pb.PbList<ReservationVoucher>();
  @$core.pragma('dart2js:noInline')
  static ReservationVoucher getDefault() => _defaultInstance ??= $pb.GeneratedMessage.$_defaultFor<ReservationVoucher>(create);
  static ReservationVoucher? _defaultInstance;

  /// These fields are marked optional for backwards compatibility with proto2.
  /// Users should make sure to always set these.
  @$pb.TagNumber(1)
  $core.List<$core.int> get relay => $_getN(0);
  @$pb.TagNumber(1)
  set relay($core.List<$core.int> v) { $_setBytes(0, v); }
  @$pb.TagNumber(1)
  $core.bool hasRelay() => $_has(0);
  @$pb.TagNumber(1)
  void clearRelay() => clearField(1);

  @$pb.TagNumber(2)
  $core.List<$core.int> get peer => $_getN(1);
  @$pb.TagNumber(2)
  set peer($core.List<$core.int> v) { $_setBytes(1, v); }
  @$pb.TagNumber(2)
  $core.bool hasPeer() => $_has(1);
  @$pb.TagNumber(2)
  void clearPeer() => clearField(2);

  @$pb.TagNumber(3)
  $fixnum.Int64 get expiration => $_getI64(2);
  @$pb.TagNumber(3)
  set expiration($fixnum.Int64 v) { $_setInt64(2, v); }
  @$pb.TagNumber(3)
  $core.bool hasExpiration() => $_has(2);
  @$pb.TagNumber(3)
  void clearExpiration() => clearField(3);
}


const _omitFieldNames = $core.bool.fromEnvironment('protobuf.omit_field_names');
const _omitMessageNames = $core.bool.fromEnvironment('protobuf.omit_message_names');
