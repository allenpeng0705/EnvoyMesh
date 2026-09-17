//
//  Generated code. Do not modify.
//  source: autonat.proto
//
// @dart = 2.12

// ignore_for_file: annotate_overrides, camel_case_types, comment_references
// ignore_for_file: constant_identifier_names, library_prefixes
// ignore_for_file: non_constant_identifier_names, prefer_final_fields
// ignore_for_file: unnecessary_import, unnecessary_this, unused_import

import 'dart:core' as $core;

import 'package:protobuf/protobuf.dart' as $pb;

import 'autonat.pbenum.dart';

export 'autonat.pbenum.dart';

class Message_PeerInfo extends $pb.GeneratedMessage {
  factory Message_PeerInfo({
    $core.List<$core.int>? id,
    $core.Iterable<$core.List<$core.int>>? addrs,
  }) {
    final $result = create();
    if (id != null) {
      $result.id = id;
    }
    if (addrs != null) {
      $result.addrs.addAll(addrs);
    }
    return $result;
  }
  Message_PeerInfo._() : super();
  factory Message_PeerInfo.fromBuffer($core.List<$core.int> i, [$pb.ExtensionRegistry r = $pb.ExtensionRegistry.EMPTY]) => create()..mergeFromBuffer(i, r);
  factory Message_PeerInfo.fromJson($core.String i, [$pb.ExtensionRegistry r = $pb.ExtensionRegistry.EMPTY]) => create()..mergeFromJson(i, r);

  static final $pb.BuilderInfo _i = $pb.BuilderInfo(_omitMessageNames ? '' : 'Message.PeerInfo', package: const $pb.PackageName(_omitMessageNames ? '' : 'autonat.pb'), createEmptyInstance: create)
    ..a<$core.List<$core.int>>(1, _omitFieldNames ? '' : 'id', $pb.PbFieldType.OY)
    ..p<$core.List<$core.int>>(2, _omitFieldNames ? '' : 'addrs', $pb.PbFieldType.PY)
    ..hasRequiredFields = false
  ;

  @$core.Deprecated(
  'Using this can add significant overhead to your binary. '
  'Use [GeneratedMessageGenericExtensions.deepCopy] instead. '
  'Will be removed in next major version')
  Message_PeerInfo clone() => Message_PeerInfo()..mergeFromMessage(this);
  @$core.Deprecated(
  'Using this can add significant overhead to your binary. '
  'Use [GeneratedMessageGenericExtensions.rebuild] instead. '
  'Will be removed in next major version')
  Message_PeerInfo copyWith(void Function(Message_PeerInfo) updates) => super.copyWith((message) => updates(message as Message_PeerInfo)) as Message_PeerInfo;

  $pb.BuilderInfo get info_ => _i;

  @$core.pragma('dart2js:noInline')
  static Message_PeerInfo create() => Message_PeerInfo._();
  Message_PeerInfo createEmptyInstance() => create();
  static $pb.PbList<Message_PeerInfo> createRepeated() => $pb.PbList<Message_PeerInfo>();
  @$core.pragma('dart2js:noInline')
  static Message_PeerInfo getDefault() => _defaultInstance ??= $pb.GeneratedMessage.$_defaultFor<Message_PeerInfo>(create);
  static Message_PeerInfo? _defaultInstance;

  @$pb.TagNumber(1)
  $core.List<$core.int> get id => $_getN(0);
  @$pb.TagNumber(1)
  set id($core.List<$core.int> v) { $_setBytes(0, v); }
  @$pb.TagNumber(1)
  $core.bool hasId() => $_has(0);
  @$pb.TagNumber(1)
  void clearId() => clearField(1);

  @$pb.TagNumber(2)
  $core.List<$core.List<$core.int>> get addrs => $_getList(1);
}

class Message_Dial extends $pb.GeneratedMessage {
  factory Message_Dial({
    Message_PeerInfo? peer,
  }) {
    final $result = create();
    if (peer != null) {
      $result.peer = peer;
    }
    return $result;
  }
  Message_Dial._() : super();
  factory Message_Dial.fromBuffer($core.List<$core.int> i, [$pb.ExtensionRegistry r = $pb.ExtensionRegistry.EMPTY]) => create()..mergeFromBuffer(i, r);
  factory Message_Dial.fromJson($core.String i, [$pb.ExtensionRegistry r = $pb.ExtensionRegistry.EMPTY]) => create()..mergeFromJson(i, r);

  static final $pb.BuilderInfo _i = $pb.BuilderInfo(_omitMessageNames ? '' : 'Message.Dial', package: const $pb.PackageName(_omitMessageNames ? '' : 'autonat.pb'), createEmptyInstance: create)
    ..aOM<Message_PeerInfo>(1, _omitFieldNames ? '' : 'peer', subBuilder: Message_PeerInfo.create)
    ..hasRequiredFields = false
  ;

  @$core.Deprecated(
  'Using this can add significant overhead to your binary. '
  'Use [GeneratedMessageGenericExtensions.deepCopy] instead. '
  'Will be removed in next major version')
  Message_Dial clone() => Message_Dial()..mergeFromMessage(this);
  @$core.Deprecated(
  'Using this can add significant overhead to your binary. '
  'Use [GeneratedMessageGenericExtensions.rebuild] instead. '
  'Will be removed in next major version')
  Message_Dial copyWith(void Function(Message_Dial) updates) => super.copyWith((message) => updates(message as Message_Dial)) as Message_Dial;

  $pb.BuilderInfo get info_ => _i;

  @$core.pragma('dart2js:noInline')
  static Message_Dial create() => Message_Dial._();
  Message_Dial createEmptyInstance() => create();
  static $pb.PbList<Message_Dial> createRepeated() => $pb.PbList<Message_Dial>();
  @$core.pragma('dart2js:noInline')
  static Message_Dial getDefault() => _defaultInstance ??= $pb.GeneratedMessage.$_defaultFor<Message_Dial>(create);
  static Message_Dial? _defaultInstance;

  @$pb.TagNumber(1)
  Message_PeerInfo get peer => $_getN(0);
  @$pb.TagNumber(1)
  set peer(Message_PeerInfo v) { setField(1, v); }
  @$pb.TagNumber(1)
  $core.bool hasPeer() => $_has(0);
  @$pb.TagNumber(1)
  void clearPeer() => clearField(1);
  @$pb.TagNumber(1)
  Message_PeerInfo ensurePeer() => $_ensure(0);
}

class Message_DialResponse extends $pb.GeneratedMessage {
  factory Message_DialResponse({
    Message_ResponseStatus? status,
    $core.String? statusText,
    $core.List<$core.int>? addr,
  }) {
    final $result = create();
    if (status != null) {
      $result.status = status;
    }
    if (statusText != null) {
      $result.statusText = statusText;
    }
    if (addr != null) {
      $result.addr = addr;
    }
    return $result;
  }
  Message_DialResponse._() : super();
  factory Message_DialResponse.fromBuffer($core.List<$core.int> i, [$pb.ExtensionRegistry r = $pb.ExtensionRegistry.EMPTY]) => create()..mergeFromBuffer(i, r);
  factory Message_DialResponse.fromJson($core.String i, [$pb.ExtensionRegistry r = $pb.ExtensionRegistry.EMPTY]) => create()..mergeFromJson(i, r);

  static final $pb.BuilderInfo _i = $pb.BuilderInfo(_omitMessageNames ? '' : 'Message.DialResponse', package: const $pb.PackageName(_omitMessageNames ? '' : 'autonat.pb'), createEmptyInstance: create)
    ..e<Message_ResponseStatus>(1, _omitFieldNames ? '' : 'status', $pb.PbFieldType.OE, defaultOrMaker: Message_ResponseStatus.OK, valueOf: Message_ResponseStatus.valueOf, enumValues: Message_ResponseStatus.values)
    ..aOS(2, _omitFieldNames ? '' : 'statusText', protoName: 'statusText')
    ..a<$core.List<$core.int>>(3, _omitFieldNames ? '' : 'addr', $pb.PbFieldType.OY)
    ..hasRequiredFields = false
  ;

  @$core.Deprecated(
  'Using this can add significant overhead to your binary. '
  'Use [GeneratedMessageGenericExtensions.deepCopy] instead. '
  'Will be removed in next major version')
  Message_DialResponse clone() => Message_DialResponse()..mergeFromMessage(this);
  @$core.Deprecated(
  'Using this can add significant overhead to your binary. '
  'Use [GeneratedMessageGenericExtensions.rebuild] instead. '
  'Will be removed in next major version')
  Message_DialResponse copyWith(void Function(Message_DialResponse) updates) => super.copyWith((message) => updates(message as Message_DialResponse)) as Message_DialResponse;

  $pb.BuilderInfo get info_ => _i;

  @$core.pragma('dart2js:noInline')
  static Message_DialResponse create() => Message_DialResponse._();
  Message_DialResponse createEmptyInstance() => create();
  static $pb.PbList<Message_DialResponse> createRepeated() => $pb.PbList<Message_DialResponse>();
  @$core.pragma('dart2js:noInline')
  static Message_DialResponse getDefault() => _defaultInstance ??= $pb.GeneratedMessage.$_defaultFor<Message_DialResponse>(create);
  static Message_DialResponse? _defaultInstance;

  @$pb.TagNumber(1)
  Message_ResponseStatus get status => $_getN(0);
  @$pb.TagNumber(1)
  set status(Message_ResponseStatus v) { setField(1, v); }
  @$pb.TagNumber(1)
  $core.bool hasStatus() => $_has(0);
  @$pb.TagNumber(1)
  void clearStatus() => clearField(1);

  @$pb.TagNumber(2)
  $core.String get statusText => $_getSZ(1);
  @$pb.TagNumber(2)
  set statusText($core.String v) { $_setString(1, v); }
  @$pb.TagNumber(2)
  $core.bool hasStatusText() => $_has(1);
  @$pb.TagNumber(2)
  void clearStatusText() => clearField(2);

  @$pb.TagNumber(3)
  $core.List<$core.int> get addr => $_getN(2);
  @$pb.TagNumber(3)
  set addr($core.List<$core.int> v) { $_setBytes(2, v); }
  @$pb.TagNumber(3)
  $core.bool hasAddr() => $_has(2);
  @$pb.TagNumber(3)
  void clearAddr() => clearField(3);
}

class Message extends $pb.GeneratedMessage {
  factory Message({
    Message_MessageType? type,
    Message_Dial? dial,
    Message_DialResponse? dialResponse,
  }) {
    final $result = create();
    if (type != null) {
      $result.type = type;
    }
    if (dial != null) {
      $result.dial = dial;
    }
    if (dialResponse != null) {
      $result.dialResponse = dialResponse;
    }
    return $result;
  }
  Message._() : super();
  factory Message.fromBuffer($core.List<$core.int> i, [$pb.ExtensionRegistry r = $pb.ExtensionRegistry.EMPTY]) => create()..mergeFromBuffer(i, r);
  factory Message.fromJson($core.String i, [$pb.ExtensionRegistry r = $pb.ExtensionRegistry.EMPTY]) => create()..mergeFromJson(i, r);

  static final $pb.BuilderInfo _i = $pb.BuilderInfo(_omitMessageNames ? '' : 'Message', package: const $pb.PackageName(_omitMessageNames ? '' : 'autonat.pb'), createEmptyInstance: create)
    ..e<Message_MessageType>(1, _omitFieldNames ? '' : 'type', $pb.PbFieldType.OE, defaultOrMaker: Message_MessageType.DIAL, valueOf: Message_MessageType.valueOf, enumValues: Message_MessageType.values)
    ..aOM<Message_Dial>(2, _omitFieldNames ? '' : 'dial', subBuilder: Message_Dial.create)
    ..aOM<Message_DialResponse>(3, _omitFieldNames ? '' : 'dialResponse', protoName: 'dialResponse', subBuilder: Message_DialResponse.create)
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

  @$pb.TagNumber(1)
  Message_MessageType get type => $_getN(0);
  @$pb.TagNumber(1)
  set type(Message_MessageType v) { setField(1, v); }
  @$pb.TagNumber(1)
  $core.bool hasType() => $_has(0);
  @$pb.TagNumber(1)
  void clearType() => clearField(1);

  @$pb.TagNumber(2)
  Message_Dial get dial => $_getN(1);
  @$pb.TagNumber(2)
  set dial(Message_Dial v) { setField(2, v); }
  @$pb.TagNumber(2)
  $core.bool hasDial() => $_has(1);
  @$pb.TagNumber(2)
  void clearDial() => clearField(2);
  @$pb.TagNumber(2)
  Message_Dial ensureDial() => $_ensure(1);

  @$pb.TagNumber(3)
  Message_DialResponse get dialResponse => $_getN(2);
  @$pb.TagNumber(3)
  set dialResponse(Message_DialResponse v) { setField(3, v); }
  @$pb.TagNumber(3)
  $core.bool hasDialResponse() => $_has(2);
  @$pb.TagNumber(3)
  void clearDialResponse() => clearField(3);
  @$pb.TagNumber(3)
  Message_DialResponse ensureDialResponse() => $_ensure(2);
}


const _omitFieldNames = $core.bool.fromEnvironment('protobuf.omit_field_names');
const _omitMessageNames = $core.bool.fromEnvironment('protobuf.omit_message_names');
