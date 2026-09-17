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

class HolePunch_Type extends $pb.ProtobufEnum {
  static const HolePunch_Type CONNECT = HolePunch_Type._(100, _omitEnumNames ? '' : 'CONNECT');
  static const HolePunch_Type SYNC = HolePunch_Type._(300, _omitEnumNames ? '' : 'SYNC');

  static const $core.List<HolePunch_Type> values = <HolePunch_Type> [
    CONNECT,
    SYNC,
  ];

  static final $core.Map<$core.int, HolePunch_Type> _byValue = $pb.ProtobufEnum.initByValue(values);
  static HolePunch_Type? valueOf($core.int value) => _byValue[value];

  const HolePunch_Type._($core.int v, $core.String n) : super(v, n);
}


const _omitEnumNames = $core.bool.fromEnvironment('protobuf.omit_enum_names');
