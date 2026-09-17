//
//  Generated code. Do not modify.
//  source: proto/noise/payload.proto
//
// @dart = 2.12

// ignore_for_file: annotate_overrides, camel_case_types, comment_references
// ignore_for_file: constant_identifier_names, library_prefixes
// ignore_for_file: non_constant_identifier_names, prefer_final_fields
// ignore_for_file: unnecessary_import, unnecessary_this, unused_import

import 'dart:core' as $core;

import 'package:protobuf/protobuf.dart' as $pb;

class NoiseExtensions extends $pb.GeneratedMessage {
  factory NoiseExtensions({
    $core.Iterable<$core.List<$core.int>>? webtransportCerthashes,
    $core.Iterable<$core.String>? streamMuxers,
  }) {
    final $result = create();
    if (webtransportCerthashes != null) {
      $result.webtransportCerthashes.addAll(webtransportCerthashes);
    }
    if (streamMuxers != null) {
      $result.streamMuxers.addAll(streamMuxers);
    }
    return $result;
  }
  NoiseExtensions._() : super();
  factory NoiseExtensions.fromBuffer($core.List<$core.int> i, [$pb.ExtensionRegistry r = $pb.ExtensionRegistry.EMPTY]) => create()..mergeFromBuffer(i, r);
  factory NoiseExtensions.fromJson($core.String i, [$pb.ExtensionRegistry r = $pb.ExtensionRegistry.EMPTY]) => create()..mergeFromJson(i, r);

  static final $pb.BuilderInfo _i = $pb.BuilderInfo(_omitMessageNames ? '' : 'NoiseExtensions', package: const $pb.PackageName(_omitMessageNames ? '' : 'noise.pb'), createEmptyInstance: create)
    ..p<$core.List<$core.int>>(1, _omitFieldNames ? '' : 'webtransportCerthashes', $pb.PbFieldType.PY)
    ..pPS(2, _omitFieldNames ? '' : 'streamMuxers')
    ..hasRequiredFields = false
  ;

  @$core.Deprecated(
  'Using this can add significant overhead to your binary. '
  'Use [GeneratedMessageGenericExtensions.deepCopy] instead. '
  'Will be removed in next major version')
  NoiseExtensions clone() => NoiseExtensions()..mergeFromMessage(this);
  @$core.Deprecated(
  'Using this can add significant overhead to your binary. '
  'Use [GeneratedMessageGenericExtensions.rebuild] instead. '
  'Will be removed in next major version')
  NoiseExtensions copyWith(void Function(NoiseExtensions) updates) => super.copyWith((message) => updates(message as NoiseExtensions)) as NoiseExtensions;

  $pb.BuilderInfo get info_ => _i;

  @$core.pragma('dart2js:noInline')
  static NoiseExtensions create() => NoiseExtensions._();
  NoiseExtensions createEmptyInstance() => create();
  static $pb.PbList<NoiseExtensions> createRepeated() => $pb.PbList<NoiseExtensions>();
  @$core.pragma('dart2js:noInline')
  static NoiseExtensions getDefault() => _defaultInstance ??= $pb.GeneratedMessage.$_defaultFor<NoiseExtensions>(create);
  static NoiseExtensions? _defaultInstance;

  @$pb.TagNumber(1)
  $core.List<$core.List<$core.int>> get webtransportCerthashes => $_getList(0);

  @$pb.TagNumber(2)
  $core.List<$core.String> get streamMuxers => $_getList(1);
}

class NoiseHandshakePayload extends $pb.GeneratedMessage {
  factory NoiseHandshakePayload({
    $core.List<$core.int>? identityKey,
    $core.List<$core.int>? identitySig,
    NoiseExtensions? extensions,
  }) {
    final $result = create();
    if (identityKey != null) {
      $result.identityKey = identityKey;
    }
    if (identitySig != null) {
      $result.identitySig = identitySig;
    }
    if (extensions != null) {
      $result.extensions = extensions;
    }
    return $result;
  }
  NoiseHandshakePayload._() : super();
  factory NoiseHandshakePayload.fromBuffer($core.List<$core.int> i, [$pb.ExtensionRegistry r = $pb.ExtensionRegistry.EMPTY]) => create()..mergeFromBuffer(i, r);
  factory NoiseHandshakePayload.fromJson($core.String i, [$pb.ExtensionRegistry r = $pb.ExtensionRegistry.EMPTY]) => create()..mergeFromJson(i, r);

  static final $pb.BuilderInfo _i = $pb.BuilderInfo(_omitMessageNames ? '' : 'NoiseHandshakePayload', package: const $pb.PackageName(_omitMessageNames ? '' : 'noise.pb'), createEmptyInstance: create)
    ..a<$core.List<$core.int>>(1, _omitFieldNames ? '' : 'identityKey', $pb.PbFieldType.OY)
    ..a<$core.List<$core.int>>(2, _omitFieldNames ? '' : 'identitySig', $pb.PbFieldType.OY)
    ..aOM<NoiseExtensions>(4, _omitFieldNames ? '' : 'extensions', subBuilder: NoiseExtensions.create)
    ..hasRequiredFields = false
  ;

  @$core.Deprecated(
  'Using this can add significant overhead to your binary. '
  'Use [GeneratedMessageGenericExtensions.deepCopy] instead. '
  'Will be removed in next major version')
  NoiseHandshakePayload clone() => NoiseHandshakePayload()..mergeFromMessage(this);
  @$core.Deprecated(
  'Using this can add significant overhead to your binary. '
  'Use [GeneratedMessageGenericExtensions.rebuild] instead. '
  'Will be removed in next major version')
  NoiseHandshakePayload copyWith(void Function(NoiseHandshakePayload) updates) => super.copyWith((message) => updates(message as NoiseHandshakePayload)) as NoiseHandshakePayload;

  $pb.BuilderInfo get info_ => _i;

  @$core.pragma('dart2js:noInline')
  static NoiseHandshakePayload create() => NoiseHandshakePayload._();
  NoiseHandshakePayload createEmptyInstance() => create();
  static $pb.PbList<NoiseHandshakePayload> createRepeated() => $pb.PbList<NoiseHandshakePayload>();
  @$core.pragma('dart2js:noInline')
  static NoiseHandshakePayload getDefault() => _defaultInstance ??= $pb.GeneratedMessage.$_defaultFor<NoiseHandshakePayload>(create);
  static NoiseHandshakePayload? _defaultInstance;

  @$pb.TagNumber(1)
  $core.List<$core.int> get identityKey => $_getN(0);
  @$pb.TagNumber(1)
  set identityKey($core.List<$core.int> v) { $_setBytes(0, v); }
  @$pb.TagNumber(1)
  $core.bool hasIdentityKey() => $_has(0);
  @$pb.TagNumber(1)
  void clearIdentityKey() => clearField(1);

  @$pb.TagNumber(2)
  $core.List<$core.int> get identitySig => $_getN(1);
  @$pb.TagNumber(2)
  set identitySig($core.List<$core.int> v) { $_setBytes(1, v); }
  @$pb.TagNumber(2)
  $core.bool hasIdentitySig() => $_has(1);
  @$pb.TagNumber(2)
  void clearIdentitySig() => clearField(2);

  @$pb.TagNumber(4)
  NoiseExtensions get extensions => $_getN(2);
  @$pb.TagNumber(4)
  set extensions(NoiseExtensions v) { setField(4, v); }
  @$pb.TagNumber(4)
  $core.bool hasExtensions() => $_has(2);
  @$pb.TagNumber(4)
  void clearExtensions() => clearField(4);
  @$pb.TagNumber(4)
  NoiseExtensions ensureExtensions() => $_ensure(2);
}


const _omitFieldNames = $core.bool.fromEnvironment('protobuf.omit_field_names');
const _omitMessageNames = $core.bool.fromEnvironment('protobuf.omit_message_names');
