//
//  Generated code. Do not modify.
//  source: identify.proto
//
// @dart = 2.12

// ignore_for_file: annotate_overrides, camel_case_types, comment_references
// ignore_for_file: constant_identifier_names, library_prefixes
// ignore_for_file: non_constant_identifier_names, prefer_final_fields
// ignore_for_file: unnecessary_import, unnecessary_this, unused_import

import 'dart:convert' as $convert;
import 'dart:core' as $core;
import 'dart:typed_data' as $typed_data;

@$core.Deprecated('Use identifyDescriptor instead')
const Identify$json = {
  '1': 'Identify',
  '2': [
    {'1': 'protocolVersion', '3': 5, '4': 1, '5': 9, '10': 'protocolVersion'},
    {'1': 'agentVersion', '3': 6, '4': 1, '5': 9, '10': 'agentVersion'},
    {'1': 'publicKey', '3': 1, '4': 1, '5': 12, '10': 'publicKey'},
    {'1': 'listenAddrs', '3': 2, '4': 3, '5': 12, '10': 'listenAddrs'},
    {'1': 'observedAddr', '3': 4, '4': 1, '5': 12, '10': 'observedAddr'},
    {'1': 'protocols', '3': 3, '4': 3, '5': 9, '10': 'protocols'},
    {'1': 'signedPeerRecord', '3': 8, '4': 1, '5': 12, '10': 'signedPeerRecord'},
  ],
};

/// Descriptor for `Identify`. Decode as a `google.protobuf.DescriptorProto`.
final $typed_data.Uint8List identifyDescriptor = $convert.base64Decode(
    'CghJZGVudGlmeRIoCg9wcm90b2NvbFZlcnNpb24YBSABKAlSD3Byb3RvY29sVmVyc2lvbhIiCg'
    'xhZ2VudFZlcnNpb24YBiABKAlSDGFnZW50VmVyc2lvbhIcCglwdWJsaWNLZXkYASABKAxSCXB1'
    'YmxpY0tleRIgCgtsaXN0ZW5BZGRycxgCIAMoDFILbGlzdGVuQWRkcnMSIgoMb2JzZXJ2ZWRBZG'
    'RyGAQgASgMUgxvYnNlcnZlZEFkZHISHAoJcHJvdG9jb2xzGAMgAygJUglwcm90b2NvbHMSKgoQ'
    'c2lnbmVkUGVlclJlY29yZBgIIAEoDFIQc2lnbmVkUGVlclJlY29yZA==');

