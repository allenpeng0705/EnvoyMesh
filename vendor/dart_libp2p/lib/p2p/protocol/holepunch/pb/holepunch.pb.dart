//
//  Generated code. Do not modify.
//  source: holepunch.proto
//
// @dart = 2.12

// ignore_for_file: annotate_overrides, camel_case_types, comment_references
// ignore_for_file: constant_identifier_names, library_prefixes
// ignore_for_file: non_constant_identifier_names, prefer_final_fields
// ignore_for_file: unnecessary_import, unnecessary_this, unused_import

import 'dart:core' as $core;

import 'package:protobuf/protobuf.dart' as $pb;

import 'holepunch.pbenum.dart';

export 'holepunch.pbenum.dart';

/// spec: https://github.com/libp2p/specs/blob/master/relay/DCUtR.md
class HolePunch extends $pb.GeneratedMessage {
  factory HolePunch({
    HolePunch_Type? type,
    $core.Iterable<$core.List<$core.int>>? obsAddrs,
  }) {
    final $result = create();
    if (type != null) {
      $result.type = type;
    }
    if (obsAddrs != null) {
      $result.obsAddrs.addAll(obsAddrs);
    }
    return $result;
  }
  HolePunch._() : super();
  factory HolePunch.fromBuffer($core.List<$core.int> i, [$pb.ExtensionRegistry r = $pb.ExtensionRegistry.EMPTY]) => create()..mergeFromBuffer(i, r);
  factory HolePunch.fromJson($core.String i, [$pb.ExtensionRegistry r = $pb.ExtensionRegistry.EMPTY]) => create()..mergeFromJson(i, r);

  static final $pb.BuilderInfo _i = $pb.BuilderInfo(_omitMessageNames ? '' : 'HolePunch', package: const $pb.PackageName(_omitMessageNames ? '' : 'holepunch.pb'), createEmptyInstance: create)
    ..e<HolePunch_Type>(1, _omitFieldNames ? '' : 'type', $pb.PbFieldType.QE, defaultOrMaker: HolePunch_Type.CONNECT, valueOf: HolePunch_Type.valueOf, enumValues: HolePunch_Type.values)
    ..p<$core.List<$core.int>>(2, _omitFieldNames ? '' : 'ObsAddrs', $pb.PbFieldType.PY, protoName: 'ObsAddrs')
  ;

  @$core.Deprecated(
  'Using this can add significant overhead to your binary. '
  'Use [GeneratedMessageGenericExtensions.deepCopy] instead. '
  'Will be removed in next major version')
  HolePunch clone() => HolePunch()..mergeFromMessage(this);
  @$core.Deprecated(
  'Using this can add significant overhead to your binary. '
  'Use [GeneratedMessageGenericExtensions.rebuild] instead. '
  'Will be removed in next major version')
  HolePunch copyWith(void Function(HolePunch) updates) => super.copyWith((message) => updates(message as HolePunch)) as HolePunch;

  $pb.BuilderInfo get info_ => _i;

  @$core.pragma('dart2js:noInline')
  static HolePunch create() => HolePunch._();
  HolePunch createEmptyInstance() => create();
  static $pb.PbList<HolePunch> createRepeated() => $pb.PbList<HolePunch>();
  @$core.pragma('dart2js:noInline')
  static HolePunch getDefault() => _defaultInstance ??= $pb.GeneratedMessage.$_defaultFor<HolePunch>(create);
  static HolePunch? _defaultInstance;

  @$pb.TagNumber(1)
  HolePunch_Type get type => $_getN(0);
  @$pb.TagNumber(1)
  set type(HolePunch_Type v) { setField(1, v); }
  @$pb.TagNumber(1)
  $core.bool hasType() => $_has(0);
  @$pb.TagNumber(1)
  void clearType() => clearField(1);

  @$pb.TagNumber(2)
  $core.List<$core.List<$core.int>> get obsAddrs => $_getList(1);
}


const _omitFieldNames = $core.bool.fromEnvironment('protobuf.omit_field_names');
const _omitMessageNames = $core.bool.fromEnvironment('protobuf.omit_message_names');
