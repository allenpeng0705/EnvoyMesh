//
//  Generated code. Do not modify.
//  source: circuit.proto
//
// @dart = 2.12

// ignore_for_file: annotate_overrides, camel_case_types, comment_references
// ignore_for_file: constant_identifier_names, library_prefixes
// ignore_for_file: non_constant_identifier_names, prefer_final_fields
// ignore_for_file: unnecessary_import, unnecessary_this, unused_import

import 'dart:core' as $core;

import 'package:fixnum/fixnum.dart' as $fixnum;
import 'package:protobuf/protobuf.dart' as $pb;

import 'circuit.pbenum.dart';

export 'circuit.pbenum.dart';

class HopMessage extends $pb.GeneratedMessage {
  factory HopMessage({
    HopMessage_Type? type,
    Peer? peer,
    Reservation? reservation,
    Limit? limit,
    Status? status,
    $core.List<$core.int>? diagnosticSessionId,
  }) {
    final $result = create();
    if (type != null) {
      $result.type = type;
    }
    if (peer != null) {
      $result.peer = peer;
    }
    if (reservation != null) {
      $result.reservation = reservation;
    }
    if (limit != null) {
      $result.limit = limit;
    }
    if (status != null) {
      $result.status = status;
    }
    if (diagnosticSessionId != null) {
      $result.diagnosticSessionId = diagnosticSessionId;
    }
    return $result;
  }
  HopMessage._() : super();
  factory HopMessage.fromBuffer($core.List<$core.int> i, [$pb.ExtensionRegistry r = $pb.ExtensionRegistry.EMPTY]) => create()..mergeFromBuffer(i, r);
  factory HopMessage.fromJson($core.String i, [$pb.ExtensionRegistry r = $pb.ExtensionRegistry.EMPTY]) => create()..mergeFromJson(i, r);

  static final $pb.BuilderInfo _i = $pb.BuilderInfo(_omitMessageNames ? '' : 'HopMessage', package: const $pb.PackageName(_omitMessageNames ? '' : 'circuit.pb'), createEmptyInstance: create)
    ..e<HopMessage_Type>(1, _omitFieldNames ? '' : 'type', $pb.PbFieldType.OE, defaultOrMaker: HopMessage_Type.RESERVE, valueOf: HopMessage_Type.valueOf, enumValues: HopMessage_Type.values)
    ..aOM<Peer>(2, _omitFieldNames ? '' : 'peer', subBuilder: Peer.create)
    ..aOM<Reservation>(3, _omitFieldNames ? '' : 'reservation', subBuilder: Reservation.create)
    ..aOM<Limit>(4, _omitFieldNames ? '' : 'limit', subBuilder: Limit.create)
    ..e<Status>(5, _omitFieldNames ? '' : 'status', $pb.PbFieldType.OE, defaultOrMaker: Status.UNUSED, valueOf: Status.valueOf, enumValues: Status.values)
    ..a<$core.List<$core.int>>(6, _omitFieldNames ? '' : 'diagnosticSessionId', $pb.PbFieldType.OY)
    ..hasRequiredFields = false
  ;

  @$core.Deprecated(
  'Using this can add significant overhead to your binary. '
  'Use [GeneratedMessageGenericExtensions.deepCopy] instead. '
  'Will be removed in next major version')
  HopMessage clone() => HopMessage()..mergeFromMessage(this);
  @$core.Deprecated(
  'Using this can add significant overhead to your binary. '
  'Use [GeneratedMessageGenericExtensions.rebuild] instead. '
  'Will be removed in next major version')
  HopMessage copyWith(void Function(HopMessage) updates) => super.copyWith((message) => updates(message as HopMessage)) as HopMessage;

  $pb.BuilderInfo get info_ => _i;

  @$core.pragma('dart2js:noInline')
  static HopMessage create() => HopMessage._();
  HopMessage createEmptyInstance() => create();
  static $pb.PbList<HopMessage> createRepeated() => $pb.PbList<HopMessage>();
  @$core.pragma('dart2js:noInline')
  static HopMessage getDefault() => _defaultInstance ??= $pb.GeneratedMessage.$_defaultFor<HopMessage>(create);
  static HopMessage? _defaultInstance;

  /// This field is marked optional for backwards compatibility with proto2.
  /// Users should make sure to always set this.
  @$pb.TagNumber(1)
  HopMessage_Type get type => $_getN(0);
  @$pb.TagNumber(1)
  set type(HopMessage_Type v) { setField(1, v); }
  @$pb.TagNumber(1)
  $core.bool hasType() => $_has(0);
  @$pb.TagNumber(1)
  void clearType() => clearField(1);

  @$pb.TagNumber(2)
  Peer get peer => $_getN(1);
  @$pb.TagNumber(2)
  set peer(Peer v) { setField(2, v); }
  @$pb.TagNumber(2)
  $core.bool hasPeer() => $_has(1);
  @$pb.TagNumber(2)
  void clearPeer() => clearField(2);
  @$pb.TagNumber(2)
  Peer ensurePeer() => $_ensure(1);

  @$pb.TagNumber(3)
  Reservation get reservation => $_getN(2);
  @$pb.TagNumber(3)
  set reservation(Reservation v) { setField(3, v); }
  @$pb.TagNumber(3)
  $core.bool hasReservation() => $_has(2);
  @$pb.TagNumber(3)
  void clearReservation() => clearField(3);
  @$pb.TagNumber(3)
  Reservation ensureReservation() => $_ensure(2);

  @$pb.TagNumber(4)
  Limit get limit => $_getN(3);
  @$pb.TagNumber(4)
  set limit(Limit v) { setField(4, v); }
  @$pb.TagNumber(4)
  $core.bool hasLimit() => $_has(3);
  @$pb.TagNumber(4)
  void clearLimit() => clearField(4);
  @$pb.TagNumber(4)
  Limit ensureLimit() => $_ensure(3);

  @$pb.TagNumber(5)
  Status get status => $_getN(4);
  @$pb.TagNumber(5)
  set status(Status v) { setField(5, v); }
  @$pb.TagNumber(5)
  $core.bool hasStatus() => $_has(4);
  @$pb.TagNumber(5)
  void clearStatus() => clearField(5);

  /// Diagnostic session ID for cross-node correlation (extension)
  @$pb.TagNumber(6)
  $core.List<$core.int> get diagnosticSessionId => $_getN(5);
  @$pb.TagNumber(6)
  set diagnosticSessionId($core.List<$core.int> v) { $_setBytes(5, v); }
  @$pb.TagNumber(6)
  $core.bool hasDiagnosticSessionId() => $_has(5);
  @$pb.TagNumber(6)
  void clearDiagnosticSessionId() => clearField(6);
}

class StopMessage extends $pb.GeneratedMessage {
  factory StopMessage({
    StopMessage_Type? type,
    Peer? peer,
    Limit? limit,
    Status? status,
    $core.List<$core.int>? diagnosticSessionId,
  }) {
    final $result = create();
    if (type != null) {
      $result.type = type;
    }
    if (peer != null) {
      $result.peer = peer;
    }
    if (limit != null) {
      $result.limit = limit;
    }
    if (status != null) {
      $result.status = status;
    }
    if (diagnosticSessionId != null) {
      $result.diagnosticSessionId = diagnosticSessionId;
    }
    return $result;
  }
  StopMessage._() : super();
  factory StopMessage.fromBuffer($core.List<$core.int> i, [$pb.ExtensionRegistry r = $pb.ExtensionRegistry.EMPTY]) => create()..mergeFromBuffer(i, r);
  factory StopMessage.fromJson($core.String i, [$pb.ExtensionRegistry r = $pb.ExtensionRegistry.EMPTY]) => create()..mergeFromJson(i, r);

  static final $pb.BuilderInfo _i = $pb.BuilderInfo(_omitMessageNames ? '' : 'StopMessage', package: const $pb.PackageName(_omitMessageNames ? '' : 'circuit.pb'), createEmptyInstance: create)
    ..e<StopMessage_Type>(1, _omitFieldNames ? '' : 'type', $pb.PbFieldType.OE, defaultOrMaker: StopMessage_Type.CONNECT, valueOf: StopMessage_Type.valueOf, enumValues: StopMessage_Type.values)
    ..aOM<Peer>(2, _omitFieldNames ? '' : 'peer', subBuilder: Peer.create)
    ..aOM<Limit>(3, _omitFieldNames ? '' : 'limit', subBuilder: Limit.create)
    ..e<Status>(4, _omitFieldNames ? '' : 'status', $pb.PbFieldType.OE, defaultOrMaker: Status.UNUSED, valueOf: Status.valueOf, enumValues: Status.values)
    ..a<$core.List<$core.int>>(5, _omitFieldNames ? '' : 'diagnosticSessionId', $pb.PbFieldType.OY)
    ..hasRequiredFields = false
  ;

  @$core.Deprecated(
  'Using this can add significant overhead to your binary. '
  'Use [GeneratedMessageGenericExtensions.deepCopy] instead. '
  'Will be removed in next major version')
  StopMessage clone() => StopMessage()..mergeFromMessage(this);
  @$core.Deprecated(
  'Using this can add significant overhead to your binary. '
  'Use [GeneratedMessageGenericExtensions.rebuild] instead. '
  'Will be removed in next major version')
  StopMessage copyWith(void Function(StopMessage) updates) => super.copyWith((message) => updates(message as StopMessage)) as StopMessage;

  $pb.BuilderInfo get info_ => _i;

  @$core.pragma('dart2js:noInline')
  static StopMessage create() => StopMessage._();
  StopMessage createEmptyInstance() => create();
  static $pb.PbList<StopMessage> createRepeated() => $pb.PbList<StopMessage>();
  @$core.pragma('dart2js:noInline')
  static StopMessage getDefault() => _defaultInstance ??= $pb.GeneratedMessage.$_defaultFor<StopMessage>(create);
  static StopMessage? _defaultInstance;

  /// This field is marked optional for backwards compatibility with proto2.
  /// Users should make sure to always set this.
  @$pb.TagNumber(1)
  StopMessage_Type get type => $_getN(0);
  @$pb.TagNumber(1)
  set type(StopMessage_Type v) { setField(1, v); }
  @$pb.TagNumber(1)
  $core.bool hasType() => $_has(0);
  @$pb.TagNumber(1)
  void clearType() => clearField(1);

  @$pb.TagNumber(2)
  Peer get peer => $_getN(1);
  @$pb.TagNumber(2)
  set peer(Peer v) { setField(2, v); }
  @$pb.TagNumber(2)
  $core.bool hasPeer() => $_has(1);
  @$pb.TagNumber(2)
  void clearPeer() => clearField(2);
  @$pb.TagNumber(2)
  Peer ensurePeer() => $_ensure(1);

  @$pb.TagNumber(3)
  Limit get limit => $_getN(2);
  @$pb.TagNumber(3)
  set limit(Limit v) { setField(3, v); }
  @$pb.TagNumber(3)
  $core.bool hasLimit() => $_has(2);
  @$pb.TagNumber(3)
  void clearLimit() => clearField(3);
  @$pb.TagNumber(3)
  Limit ensureLimit() => $_ensure(2);

  @$pb.TagNumber(4)
  Status get status => $_getN(3);
  @$pb.TagNumber(4)
  set status(Status v) { setField(4, v); }
  @$pb.TagNumber(4)
  $core.bool hasStatus() => $_has(3);
  @$pb.TagNumber(4)
  void clearStatus() => clearField(4);

  /// Diagnostic session ID for cross-node correlation (extension)
  @$pb.TagNumber(5)
  $core.List<$core.int> get diagnosticSessionId => $_getN(4);
  @$pb.TagNumber(5)
  set diagnosticSessionId($core.List<$core.int> v) { $_setBytes(4, v); }
  @$pb.TagNumber(5)
  $core.bool hasDiagnosticSessionId() => $_has(4);
  @$pb.TagNumber(5)
  void clearDiagnosticSessionId() => clearField(5);
}

class Peer extends $pb.GeneratedMessage {
  factory Peer({
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
  Peer._() : super();
  factory Peer.fromBuffer($core.List<$core.int> i, [$pb.ExtensionRegistry r = $pb.ExtensionRegistry.EMPTY]) => create()..mergeFromBuffer(i, r);
  factory Peer.fromJson($core.String i, [$pb.ExtensionRegistry r = $pb.ExtensionRegistry.EMPTY]) => create()..mergeFromJson(i, r);

  static final $pb.BuilderInfo _i = $pb.BuilderInfo(_omitMessageNames ? '' : 'Peer', package: const $pb.PackageName(_omitMessageNames ? '' : 'circuit.pb'), createEmptyInstance: create)
    ..a<$core.List<$core.int>>(1, _omitFieldNames ? '' : 'id', $pb.PbFieldType.OY)
    ..p<$core.List<$core.int>>(2, _omitFieldNames ? '' : 'addrs', $pb.PbFieldType.PY)
    ..hasRequiredFields = false
  ;

  @$core.Deprecated(
  'Using this can add significant overhead to your binary. '
  'Use [GeneratedMessageGenericExtensions.deepCopy] instead. '
  'Will be removed in next major version')
  Peer clone() => Peer()..mergeFromMessage(this);
  @$core.Deprecated(
  'Using this can add significant overhead to your binary. '
  'Use [GeneratedMessageGenericExtensions.rebuild] instead. '
  'Will be removed in next major version')
  Peer copyWith(void Function(Peer) updates) => super.copyWith((message) => updates(message as Peer)) as Peer;

  $pb.BuilderInfo get info_ => _i;

  @$core.pragma('dart2js:noInline')
  static Peer create() => Peer._();
  Peer createEmptyInstance() => create();
  static $pb.PbList<Peer> createRepeated() => $pb.PbList<Peer>();
  @$core.pragma('dart2js:noInline')
  static Peer getDefault() => _defaultInstance ??= $pb.GeneratedMessage.$_defaultFor<Peer>(create);
  static Peer? _defaultInstance;

  /// This field is marked optional for backwards compatibility with proto2.
  /// Users should make sure to always set this.
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

class Reservation extends $pb.GeneratedMessage {
  factory Reservation({
    $fixnum.Int64? expire,
    $core.Iterable<$core.List<$core.int>>? addrs,
    $core.List<$core.int>? voucher,
  }) {
    final $result = create();
    if (expire != null) {
      $result.expire = expire;
    }
    if (addrs != null) {
      $result.addrs.addAll(addrs);
    }
    if (voucher != null) {
      $result.voucher = voucher;
    }
    return $result;
  }
  Reservation._() : super();
  factory Reservation.fromBuffer($core.List<$core.int> i, [$pb.ExtensionRegistry r = $pb.ExtensionRegistry.EMPTY]) => create()..mergeFromBuffer(i, r);
  factory Reservation.fromJson($core.String i, [$pb.ExtensionRegistry r = $pb.ExtensionRegistry.EMPTY]) => create()..mergeFromJson(i, r);

  static final $pb.BuilderInfo _i = $pb.BuilderInfo(_omitMessageNames ? '' : 'Reservation', package: const $pb.PackageName(_omitMessageNames ? '' : 'circuit.pb'), createEmptyInstance: create)
    ..a<$fixnum.Int64>(1, _omitFieldNames ? '' : 'expire', $pb.PbFieldType.OU6, defaultOrMaker: $fixnum.Int64.ZERO)
    ..p<$core.List<$core.int>>(2, _omitFieldNames ? '' : 'addrs', $pb.PbFieldType.PY)
    ..a<$core.List<$core.int>>(3, _omitFieldNames ? '' : 'voucher', $pb.PbFieldType.OY)
    ..hasRequiredFields = false
  ;

  @$core.Deprecated(
  'Using this can add significant overhead to your binary. '
  'Use [GeneratedMessageGenericExtensions.deepCopy] instead. '
  'Will be removed in next major version')
  Reservation clone() => Reservation()..mergeFromMessage(this);
  @$core.Deprecated(
  'Using this can add significant overhead to your binary. '
  'Use [GeneratedMessageGenericExtensions.rebuild] instead. '
  'Will be removed in next major version')
  Reservation copyWith(void Function(Reservation) updates) => super.copyWith((message) => updates(message as Reservation)) as Reservation;

  $pb.BuilderInfo get info_ => _i;

  @$core.pragma('dart2js:noInline')
  static Reservation create() => Reservation._();
  Reservation createEmptyInstance() => create();
  static $pb.PbList<Reservation> createRepeated() => $pb.PbList<Reservation>();
  @$core.pragma('dart2js:noInline')
  static Reservation getDefault() => _defaultInstance ??= $pb.GeneratedMessage.$_defaultFor<Reservation>(create);
  static Reservation? _defaultInstance;

  /// This field is marked optional for backwards compatibility with proto2.
  /// Users should make sure to always set this.
  @$pb.TagNumber(1)
  $fixnum.Int64 get expire => $_getI64(0);
  @$pb.TagNumber(1)
  set expire($fixnum.Int64 v) { $_setInt64(0, v); }
  @$pb.TagNumber(1)
  $core.bool hasExpire() => $_has(0);
  @$pb.TagNumber(1)
  void clearExpire() => clearField(1);

  @$pb.TagNumber(2)
  $core.List<$core.List<$core.int>> get addrs => $_getList(1);

  @$pb.TagNumber(3)
  $core.List<$core.int> get voucher => $_getN(2);
  @$pb.TagNumber(3)
  set voucher($core.List<$core.int> v) { $_setBytes(2, v); }
  @$pb.TagNumber(3)
  $core.bool hasVoucher() => $_has(2);
  @$pb.TagNumber(3)
  void clearVoucher() => clearField(3);
}

class Limit extends $pb.GeneratedMessage {
  factory Limit({
    $core.int? duration,
    $fixnum.Int64? data,
  }) {
    final $result = create();
    if (duration != null) {
      $result.duration = duration;
    }
    if (data != null) {
      $result.data = data;
    }
    return $result;
  }
  Limit._() : super();
  factory Limit.fromBuffer($core.List<$core.int> i, [$pb.ExtensionRegistry r = $pb.ExtensionRegistry.EMPTY]) => create()..mergeFromBuffer(i, r);
  factory Limit.fromJson($core.String i, [$pb.ExtensionRegistry r = $pb.ExtensionRegistry.EMPTY]) => create()..mergeFromJson(i, r);

  static final $pb.BuilderInfo _i = $pb.BuilderInfo(_omitMessageNames ? '' : 'Limit', package: const $pb.PackageName(_omitMessageNames ? '' : 'circuit.pb'), createEmptyInstance: create)
    ..a<$core.int>(1, _omitFieldNames ? '' : 'duration', $pb.PbFieldType.OU3)
    ..a<$fixnum.Int64>(2, _omitFieldNames ? '' : 'data', $pb.PbFieldType.OU6, defaultOrMaker: $fixnum.Int64.ZERO)
    ..hasRequiredFields = false
  ;

  @$core.Deprecated(
  'Using this can add significant overhead to your binary. '
  'Use [GeneratedMessageGenericExtensions.deepCopy] instead. '
  'Will be removed in next major version')
  Limit clone() => Limit()..mergeFromMessage(this);
  @$core.Deprecated(
  'Using this can add significant overhead to your binary. '
  'Use [GeneratedMessageGenericExtensions.rebuild] instead. '
  'Will be removed in next major version')
  Limit copyWith(void Function(Limit) updates) => super.copyWith((message) => updates(message as Limit)) as Limit;

  $pb.BuilderInfo get info_ => _i;

  @$core.pragma('dart2js:noInline')
  static Limit create() => Limit._();
  Limit createEmptyInstance() => create();
  static $pb.PbList<Limit> createRepeated() => $pb.PbList<Limit>();
  @$core.pragma('dart2js:noInline')
  static Limit getDefault() => _defaultInstance ??= $pb.GeneratedMessage.$_defaultFor<Limit>(create);
  static Limit? _defaultInstance;

  @$pb.TagNumber(1)
  $core.int get duration => $_getIZ(0);
  @$pb.TagNumber(1)
  set duration($core.int v) { $_setUnsignedInt32(0, v); }
  @$pb.TagNumber(1)
  $core.bool hasDuration() => $_has(0);
  @$pb.TagNumber(1)
  void clearDuration() => clearField(1);

  @$pb.TagNumber(2)
  $fixnum.Int64 get data => $_getI64(1);
  @$pb.TagNumber(2)
  set data($fixnum.Int64 v) { $_setInt64(1, v); }
  @$pb.TagNumber(2)
  $core.bool hasData() => $_has(1);
  @$pb.TagNumber(2)
  void clearData() => clearField(2);
}


const _omitFieldNames = $core.bool.fromEnvironment('protobuf.omit_field_names');
const _omitMessageNames = $core.bool.fromEnvironment('protobuf.omit_message_names');
