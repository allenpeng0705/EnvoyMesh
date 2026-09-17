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

import 'package:protobuf/protobuf.dart' as $pb;

class Status extends $pb.ProtobufEnum {
  static const Status UNUSED = Status._(0, _omitEnumNames ? '' : 'UNUSED');
  static const Status OK = Status._(100, _omitEnumNames ? '' : 'OK');
  static const Status RESERVATION_REFUSED = Status._(200, _omitEnumNames ? '' : 'RESERVATION_REFUSED');
  static const Status RESOURCE_LIMIT_EXCEEDED = Status._(201, _omitEnumNames ? '' : 'RESOURCE_LIMIT_EXCEEDED');
  static const Status PERMISSION_DENIED = Status._(202, _omitEnumNames ? '' : 'PERMISSION_DENIED');
  static const Status CONNECTION_FAILED = Status._(203, _omitEnumNames ? '' : 'CONNECTION_FAILED');
  static const Status NO_RESERVATION = Status._(204, _omitEnumNames ? '' : 'NO_RESERVATION');
  static const Status MALFORMED_MESSAGE = Status._(400, _omitEnumNames ? '' : 'MALFORMED_MESSAGE');
  static const Status UNEXPECTED_MESSAGE = Status._(401, _omitEnumNames ? '' : 'UNEXPECTED_MESSAGE');

  static const $core.List<Status> values = <Status> [
    UNUSED,
    OK,
    RESERVATION_REFUSED,
    RESOURCE_LIMIT_EXCEEDED,
    PERMISSION_DENIED,
    CONNECTION_FAILED,
    NO_RESERVATION,
    MALFORMED_MESSAGE,
    UNEXPECTED_MESSAGE,
  ];

  static final $core.Map<$core.int, Status> _byValue = $pb.ProtobufEnum.initByValue(values);
  static Status? valueOf($core.int value) => _byValue[value];

  const Status._($core.int v, $core.String n) : super(v, n);
}

class HopMessage_Type extends $pb.ProtobufEnum {
  static const HopMessage_Type RESERVE = HopMessage_Type._(0, _omitEnumNames ? '' : 'RESERVE');
  static const HopMessage_Type CONNECT = HopMessage_Type._(1, _omitEnumNames ? '' : 'CONNECT');
  static const HopMessage_Type STATUS = HopMessage_Type._(2, _omitEnumNames ? '' : 'STATUS');

  static const $core.List<HopMessage_Type> values = <HopMessage_Type> [
    RESERVE,
    CONNECT,
    STATUS,
  ];

  static final $core.Map<$core.int, HopMessage_Type> _byValue = $pb.ProtobufEnum.initByValue(values);
  static HopMessage_Type? valueOf($core.int value) => _byValue[value];

  const HopMessage_Type._($core.int v, $core.String n) : super(v, n);
}

class StopMessage_Type extends $pb.ProtobufEnum {
  static const StopMessage_Type CONNECT = StopMessage_Type._(0, _omitEnumNames ? '' : 'CONNECT');
  static const StopMessage_Type STATUS = StopMessage_Type._(1, _omitEnumNames ? '' : 'STATUS');

  static const $core.List<StopMessage_Type> values = <StopMessage_Type> [
    CONNECT,
    STATUS,
  ];

  static final $core.Map<$core.int, StopMessage_Type> _byValue = $pb.ProtobufEnum.initByValue(values);
  static StopMessage_Type? valueOf($core.int value) => _byValue[value];

  const StopMessage_Type._($core.int v, $core.String n) : super(v, n);
}


const _omitEnumNames = $core.bool.fromEnvironment('protobuf.omit_enum_names');
