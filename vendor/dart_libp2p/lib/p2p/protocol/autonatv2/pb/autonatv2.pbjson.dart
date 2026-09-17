//
//  Generated code. Do not modify.
//  source: autonatv2.proto
//
// @dart = 2.12

// ignore_for_file: annotate_overrides, camel_case_types, comment_references
// ignore_for_file: constant_identifier_names, library_prefixes
// ignore_for_file: non_constant_identifier_names, prefer_final_fields
// ignore_for_file: unnecessary_import, unnecessary_this, unused_import

import 'dart:convert' as $convert;
import 'dart:core' as $core;
import 'dart:typed_data' as $typed_data;

@$core.Deprecated('Use dialStatusDescriptor instead')
const DialStatus$json = {
  '1': 'DialStatus',
  '2': [
    {'1': 'UNUSED', '2': 0},
    {'1': 'E_DIAL_ERROR', '2': 100},
    {'1': 'E_DIAL_BACK_ERROR', '2': 101},
    {'1': 'OK', '2': 200},
  ],
};

/// Descriptor for `DialStatus`. Decode as a `google.protobuf.EnumDescriptorProto`.
final $typed_data.Uint8List dialStatusDescriptor = $convert.base64Decode(
    'CgpEaWFsU3RhdHVzEgoKBlVOVVNFRBAAEhAKDEVfRElBTF9FUlJPUhBkEhUKEUVfRElBTF9CQU'
    'NLX0VSUk9SEGUSBwoCT0sQyAE=');

@$core.Deprecated('Use messageDescriptor instead')
const Message$json = {
  '1': 'Message',
  '2': [
    {'1': 'dialRequest', '3': 1, '4': 1, '5': 11, '6': '.autonatv2.pb.DialRequest', '9': 0, '10': 'dialRequest'},
    {'1': 'dialResponse', '3': 2, '4': 1, '5': 11, '6': '.autonatv2.pb.DialResponse', '9': 0, '10': 'dialResponse'},
    {'1': 'dialDataRequest', '3': 3, '4': 1, '5': 11, '6': '.autonatv2.pb.DialDataRequest', '9': 0, '10': 'dialDataRequest'},
    {'1': 'dialDataResponse', '3': 4, '4': 1, '5': 11, '6': '.autonatv2.pb.DialDataResponse', '9': 0, '10': 'dialDataResponse'},
  ],
  '8': [
    {'1': 'msg'},
  ],
};

/// Descriptor for `Message`. Decode as a `google.protobuf.DescriptorProto`.
final $typed_data.Uint8List messageDescriptor = $convert.base64Decode(
    'CgdNZXNzYWdlEj0KC2RpYWxSZXF1ZXN0GAEgASgLMhkuYXV0b25hdHYyLnBiLkRpYWxSZXF1ZX'
    'N0SABSC2RpYWxSZXF1ZXN0EkAKDGRpYWxSZXNwb25zZRgCIAEoCzIaLmF1dG9uYXR2Mi5wYi5E'
    'aWFsUmVzcG9uc2VIAFIMZGlhbFJlc3BvbnNlEkkKD2RpYWxEYXRhUmVxdWVzdBgDIAEoCzIdLm'
    'F1dG9uYXR2Mi5wYi5EaWFsRGF0YVJlcXVlc3RIAFIPZGlhbERhdGFSZXF1ZXN0EkwKEGRpYWxE'
    'YXRhUmVzcG9uc2UYBCABKAsyHi5hdXRvbmF0djIucGIuRGlhbERhdGFSZXNwb25zZUgAUhBkaW'
    'FsRGF0YVJlc3BvbnNlQgUKA21zZw==');

@$core.Deprecated('Use dialRequestDescriptor instead')
const DialRequest$json = {
  '1': 'DialRequest',
  '2': [
    {'1': 'addrs', '3': 1, '4': 3, '5': 12, '10': 'addrs'},
    {'1': 'nonce', '3': 2, '4': 1, '5': 6, '10': 'nonce'},
  ],
};

/// Descriptor for `DialRequest`. Decode as a `google.protobuf.DescriptorProto`.
final $typed_data.Uint8List dialRequestDescriptor = $convert.base64Decode(
    'CgtEaWFsUmVxdWVzdBIUCgVhZGRycxgBIAMoDFIFYWRkcnMSFAoFbm9uY2UYAiABKAZSBW5vbm'
    'Nl');

@$core.Deprecated('Use dialDataRequestDescriptor instead')
const DialDataRequest$json = {
  '1': 'DialDataRequest',
  '2': [
    {'1': 'addrIdx', '3': 1, '4': 1, '5': 13, '10': 'addrIdx'},
    {'1': 'numBytes', '3': 2, '4': 1, '5': 4, '10': 'numBytes'},
  ],
};

/// Descriptor for `DialDataRequest`. Decode as a `google.protobuf.DescriptorProto`.
final $typed_data.Uint8List dialDataRequestDescriptor = $convert.base64Decode(
    'Cg9EaWFsRGF0YVJlcXVlc3QSGAoHYWRkcklkeBgBIAEoDVIHYWRkcklkeBIaCghudW1CeXRlcx'
    'gCIAEoBFIIbnVtQnl0ZXM=');

@$core.Deprecated('Use dialResponseDescriptor instead')
const DialResponse$json = {
  '1': 'DialResponse',
  '2': [
    {'1': 'status', '3': 1, '4': 1, '5': 14, '6': '.autonatv2.pb.DialResponse.ResponseStatus', '10': 'status'},
    {'1': 'addrIdx', '3': 2, '4': 1, '5': 13, '10': 'addrIdx'},
    {'1': 'dialStatus', '3': 3, '4': 1, '5': 14, '6': '.autonatv2.pb.DialStatus', '10': 'dialStatus'},
  ],
  '4': [DialResponse_ResponseStatus$json],
};

@$core.Deprecated('Use dialResponseDescriptor instead')
const DialResponse_ResponseStatus$json = {
  '1': 'ResponseStatus',
  '2': [
    {'1': 'E_INTERNAL_ERROR', '2': 0},
    {'1': 'E_REQUEST_REJECTED', '2': 100},
    {'1': 'E_DIAL_REFUSED', '2': 101},
    {'1': 'OK', '2': 200},
  ],
};

/// Descriptor for `DialResponse`. Decode as a `google.protobuf.DescriptorProto`.
final $typed_data.Uint8List dialResponseDescriptor = $convert.base64Decode(
    'CgxEaWFsUmVzcG9uc2USQQoGc3RhdHVzGAEgASgOMikuYXV0b25hdHYyLnBiLkRpYWxSZXNwb2'
    '5zZS5SZXNwb25zZVN0YXR1c1IGc3RhdHVzEhgKB2FkZHJJZHgYAiABKA1SB2FkZHJJZHgSOAoK'
    'ZGlhbFN0YXR1cxgDIAEoDjIYLmF1dG9uYXR2Mi5wYi5EaWFsU3RhdHVzUgpkaWFsU3RhdHVzIl'
    'sKDlJlc3BvbnNlU3RhdHVzEhQKEEVfSU5URVJOQUxfRVJST1IQABIWChJFX1JFUVVFU1RfUkVK'
    'RUNURUQQZBISCg5FX0RJQUxfUkVGVVNFRBBlEgcKAk9LEMgB');

@$core.Deprecated('Use dialDataResponseDescriptor instead')
const DialDataResponse$json = {
  '1': 'DialDataResponse',
  '2': [
    {'1': 'data', '3': 1, '4': 1, '5': 12, '10': 'data'},
  ],
};

/// Descriptor for `DialDataResponse`. Decode as a `google.protobuf.DescriptorProto`.
final $typed_data.Uint8List dialDataResponseDescriptor = $convert.base64Decode(
    'ChBEaWFsRGF0YVJlc3BvbnNlEhIKBGRhdGEYASABKAxSBGRhdGE=');

@$core.Deprecated('Use dialBackDescriptor instead')
const DialBack$json = {
  '1': 'DialBack',
  '2': [
    {'1': 'nonce', '3': 1, '4': 1, '5': 6, '10': 'nonce'},
  ],
};

/// Descriptor for `DialBack`. Decode as a `google.protobuf.DescriptorProto`.
final $typed_data.Uint8List dialBackDescriptor = $convert.base64Decode(
    'CghEaWFsQmFjaxIUCgVub25jZRgBIAEoBlIFbm9uY2U=');

@$core.Deprecated('Use dialBackResponseDescriptor instead')
const DialBackResponse$json = {
  '1': 'DialBackResponse',
  '2': [
    {'1': 'status', '3': 1, '4': 1, '5': 14, '6': '.autonatv2.pb.DialBackResponse.DialBackStatus', '10': 'status'},
  ],
  '4': [DialBackResponse_DialBackStatus$json],
};

@$core.Deprecated('Use dialBackResponseDescriptor instead')
const DialBackResponse_DialBackStatus$json = {
  '1': 'DialBackStatus',
  '2': [
    {'1': 'OK', '2': 0},
  ],
};

/// Descriptor for `DialBackResponse`. Decode as a `google.protobuf.DescriptorProto`.
final $typed_data.Uint8List dialBackResponseDescriptor = $convert.base64Decode(
    'ChBEaWFsQmFja1Jlc3BvbnNlEkUKBnN0YXR1cxgBIAEoDjItLmF1dG9uYXR2Mi5wYi5EaWFsQm'
    'Fja1Jlc3BvbnNlLkRpYWxCYWNrU3RhdHVzUgZzdGF0dXMiGAoORGlhbEJhY2tTdGF0dXMSBgoC'
    'T0sQAA==');

