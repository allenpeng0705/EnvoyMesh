//
//  Generated code. Do not modify.
//  source: autonatv2.proto
//
// @dart = 2.12

// ignore_for_file: annotate_overrides, camel_case_types, comment_references
// ignore_for_file: constant_identifier_names, library_prefixes
// ignore_for_file: non_constant_identifier_names, prefer_final_fields
// ignore_for_file: unnecessary_import, unnecessary_this, unused_import

import 'dart:core' as $core;

import 'package:fixnum/fixnum.dart' as $fixnum;
import 'package:protobuf/protobuf.dart' as $pb;

import 'autonatv2.pbenum.dart';

export 'autonatv2.pbenum.dart';

enum Message_Msg {
  dialRequest, 
  dialResponse, 
  dialDataRequest, 
  dialDataResponse, 
  notSet
}

class Message extends $pb.GeneratedMessage {
  factory Message({
    DialRequest? dialRequest,
    DialResponse? dialResponse,
    DialDataRequest? dialDataRequest,
    DialDataResponse? dialDataResponse,
  }) {
    final $result = create();
    if (dialRequest != null) {
      $result.dialRequest = dialRequest;
    }
    if (dialResponse != null) {
      $result.dialResponse = dialResponse;
    }
    if (dialDataRequest != null) {
      $result.dialDataRequest = dialDataRequest;
    }
    if (dialDataResponse != null) {
      $result.dialDataResponse = dialDataResponse;
    }
    return $result;
  }
  Message._() : super();
  factory Message.fromBuffer($core.List<$core.int> i, [$pb.ExtensionRegistry r = $pb.ExtensionRegistry.EMPTY]) => create()..mergeFromBuffer(i, r);
  factory Message.fromJson($core.String i, [$pb.ExtensionRegistry r = $pb.ExtensionRegistry.EMPTY]) => create()..mergeFromJson(i, r);

  static const $core.Map<$core.int, Message_Msg> _Message_MsgByTag = {
    1 : Message_Msg.dialRequest,
    2 : Message_Msg.dialResponse,
    3 : Message_Msg.dialDataRequest,
    4 : Message_Msg.dialDataResponse,
    0 : Message_Msg.notSet
  };
  static final $pb.BuilderInfo _i = $pb.BuilderInfo(_omitMessageNames ? '' : 'Message', package: const $pb.PackageName(_omitMessageNames ? '' : 'autonatv2.pb'), createEmptyInstance: create)
    ..oo(0, [1, 2, 3, 4])
    ..aOM<DialRequest>(1, _omitFieldNames ? '' : 'dialRequest', protoName: 'dialRequest', subBuilder: DialRequest.create)
    ..aOM<DialResponse>(2, _omitFieldNames ? '' : 'dialResponse', protoName: 'dialResponse', subBuilder: DialResponse.create)
    ..aOM<DialDataRequest>(3, _omitFieldNames ? '' : 'dialDataRequest', protoName: 'dialDataRequest', subBuilder: DialDataRequest.create)
    ..aOM<DialDataResponse>(4, _omitFieldNames ? '' : 'dialDataResponse', protoName: 'dialDataResponse', subBuilder: DialDataResponse.create)
    ..hasRequiredFields = false
  ;

  @$core.Deprecated(
  'Using this can add significant overhead to your binary. '
  'Use [GeneratedMessageGenericExtensions.deepCopy] instead. '
  'Will be removed in next major version')
  Message clone() => Message()..mergeFromMessage(this);
  @$core.Deprecated(
  'Using this can add significant overhead to your binary. '
  'Use [GeneratedMessageGenericExtensions.rebuild] instead. '
  'Will be removed in next major version')
  Message copyWith(void Function(Message) updates) => super.copyWith((message) => updates(message as Message)) as Message;

  $pb.BuilderInfo get info_ => _i;

  @$core.pragma('dart2js:noInline')
  static Message create() => Message._();
  Message createEmptyInstance() => create();
  static $pb.PbList<Message> createRepeated() => $pb.PbList<Message>();
  @$core.pragma('dart2js:noInline')
  static Message getDefault() => _defaultInstance ??= $pb.GeneratedMessage.$_defaultFor<Message>(create);
  static Message? _defaultInstance;

  Message_Msg whichMsg() => _Message_MsgByTag[$_whichOneof(0)]!;
  void clearMsg() => clearField($_whichOneof(0));

  @$pb.TagNumber(1)
  DialRequest get dialRequest => $_getN(0);
  @$pb.TagNumber(1)
  set dialRequest(DialRequest v) { setField(1, v); }
  @$pb.TagNumber(1)
  $core.bool hasDialRequest() => $_has(0);
  @$pb.TagNumber(1)
  void clearDialRequest() => clearField(1);
  @$pb.TagNumber(1)
  DialRequest ensureDialRequest() => $_ensure(0);

  @$pb.TagNumber(2)
  DialResponse get dialResponse => $_getN(1);
  @$pb.TagNumber(2)
  set dialResponse(DialResponse v) { setField(2, v); }
  @$pb.TagNumber(2)
  $core.bool hasDialResponse() => $_has(1);
  @$pb.TagNumber(2)
  void clearDialResponse() => clearField(2);
  @$pb.TagNumber(2)
  DialResponse ensureDialResponse() => $_ensure(1);

  @$pb.TagNumber(3)
  DialDataRequest get dialDataRequest => $_getN(2);
  @$pb.TagNumber(3)
  set dialDataRequest(DialDataRequest v) { setField(3, v); }
  @$pb.TagNumber(3)
  $core.bool hasDialDataRequest() => $_has(2);
  @$pb.TagNumber(3)
  void clearDialDataRequest() => clearField(3);
  @$pb.TagNumber(3)
  DialDataRequest ensureDialDataRequest() => $_ensure(2);

  @$pb.TagNumber(4)
  DialDataResponse get dialDataResponse => $_getN(3);
  @$pb.TagNumber(4)
  set dialDataResponse(DialDataResponse v) { setField(4, v); }
  @$pb.TagNumber(4)
  $core.bool hasDialDataResponse() => $_has(3);
  @$pb.TagNumber(4)
  void clearDialDataResponse() => clearField(4);
  @$pb.TagNumber(4)
  DialDataResponse ensureDialDataResponse() => $_ensure(3);
}

class DialRequest extends $pb.GeneratedMessage {
  factory DialRequest({
    $core.Iterable<$core.List<$core.int>>? addrs,
    $fixnum.Int64? nonce,
  }) {
    final $result = create();
    if (addrs != null) {
      $result.addrs.addAll(addrs);
    }
    if (nonce != null) {
      $result.nonce = nonce;
    }
    return $result;
  }
  DialRequest._() : super();
  factory DialRequest.fromBuffer($core.List<$core.int> i, [$pb.ExtensionRegistry r = $pb.ExtensionRegistry.EMPTY]) => create()..mergeFromBuffer(i, r);
  factory DialRequest.fromJson($core.String i, [$pb.ExtensionRegistry r = $pb.ExtensionRegistry.EMPTY]) => create()..mergeFromJson(i, r);

  static final $pb.BuilderInfo _i = $pb.BuilderInfo(_omitMessageNames ? '' : 'DialRequest', package: const $pb.PackageName(_omitMessageNames ? '' : 'autonatv2.pb'), createEmptyInstance: create)
    ..p<$core.List<$core.int>>(1, _omitFieldNames ? '' : 'addrs', $pb.PbFieldType.PY)
    ..a<$fixnum.Int64>(2, _omitFieldNames ? '' : 'nonce', $pb.PbFieldType.OF6, defaultOrMaker: $fixnum.Int64.ZERO)
    ..hasRequiredFields = false
  ;

  @$core.Deprecated(
  'Using this can add significant overhead to your binary. '
  'Use [GeneratedMessageGenericExtensions.deepCopy] instead. '
  'Will be removed in next major version')
  DialRequest clone() => DialRequest()..mergeFromMessage(this);
  @$core.Deprecated(
  'Using this can add significant overhead to your binary. '
  'Use [GeneratedMessageGenericExtensions.rebuild] instead. '
  'Will be removed in next major version')
  DialRequest copyWith(void Function(DialRequest) updates) => super.copyWith((message) => updates(message as DialRequest)) as DialRequest;

  $pb.BuilderInfo get info_ => _i;

  @$core.pragma('dart2js:noInline')
  static DialRequest create() => DialRequest._();
  DialRequest createEmptyInstance() => create();
  static $pb.PbList<DialRequest> createRepeated() => $pb.PbList<DialRequest>();
  @$core.pragma('dart2js:noInline')
  static DialRequest getDefault() => _defaultInstance ??= $pb.GeneratedMessage.$_defaultFor<DialRequest>(create);
  static DialRequest? _defaultInstance;

  @$pb.TagNumber(1)
  $core.List<$core.List<$core.int>> get addrs => $_getList(0);

  @$pb.TagNumber(2)
  $fixnum.Int64 get nonce => $_getI64(1);
  @$pb.TagNumber(2)
  set nonce($fixnum.Int64 v) { $_setInt64(1, v); }
  @$pb.TagNumber(2)
  $core.bool hasNonce() => $_has(1);
  @$pb.TagNumber(2)
  void clearNonce() => clearField(2);
}

class DialDataRequest extends $pb.GeneratedMessage {
  factory DialDataRequest({
    $core.int? addrIdx,
    $fixnum.Int64? numBytes,
  }) {
    final $result = create();
    if (addrIdx != null) {
      $result.addrIdx = addrIdx;
    }
    if (numBytes != null) {
      $result.numBytes = numBytes;
    }
    return $result;
  }
  DialDataRequest._() : super();
  factory DialDataRequest.fromBuffer($core.List<$core.int> i, [$pb.ExtensionRegistry r = $pb.ExtensionRegistry.EMPTY]) => create()..mergeFromBuffer(i, r);
  factory DialDataRequest.fromJson($core.String i, [$pb.ExtensionRegistry r = $pb.ExtensionRegistry.EMPTY]) => create()..mergeFromJson(i, r);

  static final $pb.BuilderInfo _i = $pb.BuilderInfo(_omitMessageNames ? '' : 'DialDataRequest', package: const $pb.PackageName(_omitMessageNames ? '' : 'autonatv2.pb'), createEmptyInstance: create)
    ..a<$core.int>(1, _omitFieldNames ? '' : 'addrIdx', $pb.PbFieldType.OU3, protoName: 'addrIdx')
    ..a<$fixnum.Int64>(2, _omitFieldNames ? '' : 'numBytes', $pb.PbFieldType.OU6, protoName: 'numBytes', defaultOrMaker: $fixnum.Int64.ZERO)
    ..hasRequiredFields = false
  ;

  @$core.Deprecated(
  'Using this can add significant overhead to your binary. '
  'Use [GeneratedMessageGenericExtensions.deepCopy] instead. '
  'Will be removed in next major version')
  DialDataRequest clone() => DialDataRequest()..mergeFromMessage(this);
  @$core.Deprecated(
  'Using this can add significant overhead to your binary. '
  'Use [GeneratedMessageGenericExtensions.rebuild] instead. '
  'Will be removed in next major version')
  DialDataRequest copyWith(void Function(DialDataRequest) updates) => super.copyWith((message) => updates(message as DialDataRequest)) as DialDataRequest;

  $pb.BuilderInfo get info_ => _i;

  @$core.pragma('dart2js:noInline')
  static DialDataRequest create() => DialDataRequest._();
  DialDataRequest createEmptyInstance() => create();
  static $pb.PbList<DialDataRequest> createRepeated() => $pb.PbList<DialDataRequest>();
  @$core.pragma('dart2js:noInline')
  static DialDataRequest getDefault() => _defaultInstance ??= $pb.GeneratedMessage.$_defaultFor<DialDataRequest>(create);
  static DialDataRequest? _defaultInstance;

  @$pb.TagNumber(1)
  $core.int get addrIdx => $_getIZ(0);
  @$pb.TagNumber(1)
  set addrIdx($core.int v) { $_setUnsignedInt32(0, v); }
  @$pb.TagNumber(1)
  $core.bool hasAddrIdx() => $_has(0);
  @$pb.TagNumber(1)
  void clearAddrIdx() => clearField(1);

  @$pb.TagNumber(2)
  $fixnum.Int64 get numBytes => $_getI64(1);
  @$pb.TagNumber(2)
  set numBytes($fixnum.Int64 v) { $_setInt64(1, v); }
  @$pb.TagNumber(2)
  $core.bool hasNumBytes() => $_has(1);
  @$pb.TagNumber(2)
  void clearNumBytes() => clearField(2);
}

class DialResponse extends $pb.GeneratedMessage {
  factory DialResponse({
    DialResponse_ResponseStatus? status,
    $core.int? addrIdx,
    DialStatus? dialStatus,
  }) {
    final $result = create();
    if (status != null) {
      $result.status = status;
    }
    if (addrIdx != null) {
      $result.addrIdx = addrIdx;
    }
    if (dialStatus != null) {
      $result.dialStatus = dialStatus;
    }
    return $result;
  }
  DialResponse._() : super();
  factory DialResponse.fromBuffer($core.List<$core.int> i, [$pb.ExtensionRegistry r = $pb.ExtensionRegistry.EMPTY]) => create()..mergeFromBuffer(i, r);
  factory DialResponse.fromJson($core.String i, [$pb.ExtensionRegistry r = $pb.ExtensionRegistry.EMPTY]) => create()..mergeFromJson(i, r);

  static final $pb.BuilderInfo _i = $pb.BuilderInfo(_omitMessageNames ? '' : 'DialResponse', package: const $pb.PackageName(_omitMessageNames ? '' : 'autonatv2.pb'), createEmptyInstance: create)
    ..e<DialResponse_ResponseStatus>(1, _omitFieldNames ? '' : 'status', $pb.PbFieldType.OE, defaultOrMaker: DialResponse_ResponseStatus.E_INTERNAL_ERROR, valueOf: DialResponse_ResponseStatus.valueOf, enumValues: DialResponse_ResponseStatus.values)
    ..a<$core.int>(2, _omitFieldNames ? '' : 'addrIdx', $pb.PbFieldType.OU3, protoName: 'addrIdx')
    ..e<DialStatus>(3, _omitFieldNames ? '' : 'dialStatus', $pb.PbFieldType.OE, protoName: 'dialStatus', defaultOrMaker: DialStatus.UNUSED, valueOf: DialStatus.valueOf, enumValues: DialStatus.values)
    ..hasRequiredFields = false
  ;

  @$core.Deprecated(
  'Using this can add significant overhead to your binary. '
  'Use [GeneratedMessageGenericExtensions.deepCopy] instead. '
  'Will be removed in next major version')
  DialResponse clone() => DialResponse()..mergeFromMessage(this);
  @$core.Deprecated(
  'Using this can add significant overhead to your binary. '
  'Use [GeneratedMessageGenericExtensions.rebuild] instead. '
  'Will be removed in next major version')
  DialResponse copyWith(void Function(DialResponse) updates) => super.copyWith((message) => updates(message as DialResponse)) as DialResponse;

  $pb.BuilderInfo get info_ => _i;

  @$core.pragma('dart2js:noInline')
  static DialResponse create() => DialResponse._();
  DialResponse createEmptyInstance() => create();
  static $pb.PbList<DialResponse> createRepeated() => $pb.PbList<DialResponse>();
  @$core.pragma('dart2js:noInline')
  static DialResponse getDefault() => _defaultInstance ??= $pb.GeneratedMessage.$_defaultFor<DialResponse>(create);
  static DialResponse? _defaultInstance;

  @$pb.TagNumber(1)
  DialResponse_ResponseStatus get status => $_getN(0);
  @$pb.TagNumber(1)
  set status(DialResponse_ResponseStatus v) { setField(1, v); }
  @$pb.TagNumber(1)
  $core.bool hasStatus() => $_has(0);
  @$pb.TagNumber(1)
  void clearStatus() => clearField(1);

  @$pb.TagNumber(2)
  $core.int get addrIdx => $_getIZ(1);
  @$pb.TagNumber(2)
  set addrIdx($core.int v) { $_setUnsignedInt32(1, v); }
  @$pb.TagNumber(2)
  $core.bool hasAddrIdx() => $_has(1);
  @$pb.TagNumber(2)
  void clearAddrIdx() => clearField(2);

  @$pb.TagNumber(3)
  DialStatus get dialStatus => $_getN(2);
  @$pb.TagNumber(3)
  set dialStatus(DialStatus v) { setField(3, v); }
  @$pb.TagNumber(3)
  $core.bool hasDialStatus() => $_has(2);
  @$pb.TagNumber(3)
  void clearDialStatus() => clearField(3);
}

class DialDataResponse extends $pb.GeneratedMessage {
  factory DialDataResponse({
    $core.List<$core.int>? data,
  }) {
    final $result = create();
    if (data != null) {
      $result.data = data;
    }
    return $result;
  }
  DialDataResponse._() : super();
  factory DialDataResponse.fromBuffer($core.List<$core.int> i, [$pb.ExtensionRegistry r = $pb.ExtensionRegistry.EMPTY]) => create()..mergeFromBuffer(i, r);
  factory DialDataResponse.fromJson($core.String i, [$pb.ExtensionRegistry r = $pb.ExtensionRegistry.EMPTY]) => create()..mergeFromJson(i, r);

  static final $pb.BuilderInfo _i = $pb.BuilderInfo(_omitMessageNames ? '' : 'DialDataResponse', package: const $pb.PackageName(_omitMessageNames ? '' : 'autonatv2.pb'), createEmptyInstance: create)
    ..a<$core.List<$core.int>>(1, _omitFieldNames ? '' : 'data', $pb.PbFieldType.OY)
    ..hasRequiredFields = false
  ;

  @$core.Deprecated(
  'Using this can add significant overhead to your binary. '
  'Use [GeneratedMessageGenericExtensions.deepCopy] instead. '
  'Will be removed in next major version')
  DialDataResponse clone() => DialDataResponse()..mergeFromMessage(this);
  @$core.Deprecated(
  'Using this can add significant overhead to your binary. '
  'Use [GeneratedMessageGenericExtensions.rebuild] instead. '
  'Will be removed in next major version')
  DialDataResponse copyWith(void Function(DialDataResponse) updates) => super.copyWith((message) => updates(message as DialDataResponse)) as DialDataResponse;

  $pb.BuilderInfo get info_ => _i;

  @$core.pragma('dart2js:noInline')
  static DialDataResponse create() => DialDataResponse._();
  DialDataResponse createEmptyInstance() => create();
  static $pb.PbList<DialDataResponse> createRepeated() => $pb.PbList<DialDataResponse>();
  @$core.pragma('dart2js:noInline')
  static DialDataResponse getDefault() => _defaultInstance ??= $pb.GeneratedMessage.$_defaultFor<DialDataResponse>(create);
  static DialDataResponse? _defaultInstance;

  @$pb.TagNumber(1)
  $core.List<$core.int> get data => $_getN(0);
  @$pb.TagNumber(1)
  set data($core.List<$core.int> v) { $_setBytes(0, v); }
  @$pb.TagNumber(1)
  $core.bool hasData() => $_has(0);
  @$pb.TagNumber(1)
  void clearData() => clearField(1);
}

class DialBack extends $pb.GeneratedMessage {
  factory DialBack({
    $fixnum.Int64? nonce,
  }) {
    final $result = create();
    if (nonce != null) {
      $result.nonce = nonce;
    }
    return $result;
  }
  DialBack._() : super();
  factory DialBack.fromBuffer($core.List<$core.int> i, [$pb.ExtensionRegistry r = $pb.ExtensionRegistry.EMPTY]) => create()..mergeFromBuffer(i, r);
  factory DialBack.fromJson($core.String i, [$pb.ExtensionRegistry r = $pb.ExtensionRegistry.EMPTY]) => create()..mergeFromJson(i, r);

  static final $pb.BuilderInfo _i = $pb.BuilderInfo(_omitMessageNames ? '' : 'DialBack', package: const $pb.PackageName(_omitMessageNames ? '' : 'autonatv2.pb'), createEmptyInstance: create)
    ..a<$fixnum.Int64>(1, _omitFieldNames ? '' : 'nonce', $pb.PbFieldType.OF6, defaultOrMaker: $fixnum.Int64.ZERO)
    ..hasRequiredFields = false
  ;

  @$core.Deprecated(
  'Using this can add significant overhead to your binary. '
  'Use [GeneratedMessageGenericExtensions.deepCopy] instead. '
  'Will be removed in next major version')
  DialBack clone() => DialBack()..mergeFromMessage(this);
  @$core.Deprecated(
  'Using this can add significant overhead to your binary. '
  'Use [GeneratedMessageGenericExtensions.rebuild] instead. '
  'Will be removed in next major version')
  DialBack copyWith(void Function(DialBack) updates) => super.copyWith((message) => updates(message as DialBack)) as DialBack;

  $pb.BuilderInfo get info_ => _i;

  @$core.pragma('dart2js:noInline')
  static DialBack create() => DialBack._();
  DialBack createEmptyInstance() => create();
  static $pb.PbList<DialBack> createRepeated() => $pb.PbList<DialBack>();
  @$core.pragma('dart2js:noInline')
  static DialBack getDefault() => _defaultInstance ??= $pb.GeneratedMessage.$_defaultFor<DialBack>(create);
  static DialBack? _defaultInstance;

  @$pb.TagNumber(1)
  $fixnum.Int64 get nonce => $_getI64(0);
  @$pb.TagNumber(1)
  set nonce($fixnum.Int64 v) { $_setInt64(0, v); }
  @$pb.TagNumber(1)
  $core.bool hasNonce() => $_has(0);
  @$pb.TagNumber(1)
  void clearNonce() => clearField(1);
}

class DialBackResponse extends $pb.GeneratedMessage {
  factory DialBackResponse({
    DialBackResponse_DialBackStatus? status,
  }) {
    final $result = create();
    if (status != null) {
      $result.status = status;
    }
    return $result;
  }
  DialBackResponse._() : super();
  factory DialBackResponse.fromBuffer($core.List<$core.int> i, [$pb.ExtensionRegistry r = $pb.ExtensionRegistry.EMPTY]) => create()..mergeFromBuffer(i, r);
  factory DialBackResponse.fromJson($core.String i, [$pb.ExtensionRegistry r = $pb.ExtensionRegistry.EMPTY]) => create()..mergeFromJson(i, r);

  static final $pb.BuilderInfo _i = $pb.BuilderInfo(_omitMessageNames ? '' : 'DialBackResponse', package: const $pb.PackageName(_omitMessageNames ? '' : 'autonatv2.pb'), createEmptyInstance: create)
    ..e<DialBackResponse_DialBackStatus>(1, _omitFieldNames ? '' : 'status', $pb.PbFieldType.OE, defaultOrMaker: DialBackResponse_DialBackStatus.OK, valueOf: DialBackResponse_DialBackStatus.valueOf, enumValues: DialBackResponse_DialBackStatus.values)
    ..hasRequiredFields = false
  ;

  @$core.Deprecated(
  'Using this can add significant overhead to your binary. '
  'Use [GeneratedMessageGenericExtensions.deepCopy] instead. '
  'Will be removed in next major version')
  DialBackResponse clone() => DialBackResponse()..mergeFromMessage(this);
  @$core.Deprecated(
  'Using this can add significant overhead to your binary. '
  'Use [GeneratedMessageGenericExtensions.rebuild] instead. '
  'Will be removed in next major version')
  DialBackResponse copyWith(void Function(DialBackResponse) updates) => super.copyWith((message) => updates(message as DialBackResponse)) as DialBackResponse;

  $pb.BuilderInfo get info_ => _i;

  @$core.pragma('dart2js:noInline')
  static DialBackResponse create() => DialBackResponse._();
  DialBackResponse createEmptyInstance() => create();
  static $pb.PbList<DialBackResponse> createRepeated() => $pb.PbList<DialBackResponse>();
  @$core.pragma('dart2js:noInline')
  static DialBackResponse getDefault() => _defaultInstance ??= $pb.GeneratedMessage.$_defaultFor<DialBackResponse>(create);
  static DialBackResponse? _defaultInstance;

  @$pb.TagNumber(1)
  DialBackResponse_DialBackStatus get status => $_getN(0);
  @$pb.TagNumber(1)
  set status(DialBackResponse_DialBackStatus v) { setField(1, v); }
  @$pb.TagNumber(1)
  $core.bool hasStatus() => $_has(0);
  @$pb.TagNumber(1)
  void clearStatus() => clearField(1);
}


const _omitFieldNames = $core.bool.fromEnvironment('protobuf.omit_field_names');
const _omitMessageNames = $core.bool.fromEnvironment('protobuf.omit_message_names');
