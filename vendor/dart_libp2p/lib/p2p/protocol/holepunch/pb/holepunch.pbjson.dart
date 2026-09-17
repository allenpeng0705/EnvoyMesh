//
//  Generated code. Do not modify.
//  source: holepunch.proto
//
// @dart = 2.12

// ignore_for_file: annotate_overrides, camel_case_types, comment_references
// ignore_for_file: constant_identifier_names, library_prefixes
// ignore_for_file: non_constant_identifier_names, prefer_final_fields
// ignore_for_file: unnecessary_import, unnecessary_this, unused_import

import 'dart:convert' as $convert;
import 'dart:core' as $core;
import 'dart:typed_data' as $typed_data;

@$core.Deprecated('Use holePunchDescriptor instead')
const HolePunch$json = {
  '1': 'HolePunch',
  '2': [
    {'1': 'type', '3': 1, '4': 2, '5': 14, '6': '.holepunch.pb.HolePunch.Type', '10': 'type'},
    {'1': 'ObsAddrs', '3': 2, '4': 3, '5': 12, '10': 'ObsAddrs'},
  ],
  '4': [HolePunch_Type$json],
};

@$core.Deprecated('Use holePunchDescriptor instead')
const HolePunch_Type$json = {
  '1': 'Type',
  '2': [
    {'1': 'CONNECT', '2': 100},
    {'1': 'SYNC', '2': 300},
  ],
};

/// Descriptor for `HolePunch`. Decode as a `google.protobuf.DescriptorProto`.
final $typed_data.Uint8List holePunchDescriptor = $convert.base64Decode(
    'CglIb2xlUHVuY2gSMAoEdHlwZRgBIAIoDjIcLmhvbGVwdW5jaC5wYi5Ib2xlUHVuY2guVHlwZV'
    'IEdHlwZRIaCghPYnNBZGRycxgCIAMoDFIIT2JzQWRkcnMiHgoEVHlwZRILCgdDT05ORUNUEGQS'
    'CQoEU1lOQxCsAg==');

