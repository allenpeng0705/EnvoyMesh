//
//  Generated code. Do not modify.
//  source: autonat.proto
//
// @dart = 2.12

// ignore_for_file: annotate_overrides, camel_case_types, comment_references
// ignore_for_file: constant_identifier_names, library_prefixes
// ignore_for_file: non_constant_identifier_names, prefer_final_fields
// ignore_for_file: unnecessary_import, unnecessary_this, unused_import

import 'dart:convert' as $convert;
import 'dart:core' as $core;
import 'dart:typed_data' as $typed_data;

@$core.Deprecated('Use messageDescriptor instead')
const Message$json = {
  '1': 'Message',
  '2': [
    {'1': 'type', '3': 1, '4': 1, '5': 14, '6': '.autonat.pb.Message.MessageType', '10': 'type'},
    {'1': 'dial', '3': 2, '4': 1, '5': 11, '6': '.autonat.pb.Message.Dial', '10': 'dial'},
    {'1': 'dialResponse', '3': 3, '4': 1, '5': 11, '6': '.autonat.pb.Message.DialResponse', '10': 'dialResponse'},
  ],
  '3': [Message_PeerInfo$json, Message_Dial$json, Message_DialResponse$json],
  '4': [Message_MessageType$json, Message_ResponseStatus$json],
};

@$core.Deprecated('Use messageDescriptor instead')
const Message_PeerInfo$json = {
  '1': 'PeerInfo',
  '2': [
    {'1': 'id', '3': 1, '4': 1, '5': 12, '10': 'id'},
    {'1': 'addrs', '3': 2, '4': 3, '5': 12, '10': 'addrs'},
  ],
};

@$core.Deprecated('Use messageDescriptor instead')
const Message_Dial$json = {
  '1': 'Dial',
  '2': [
    {'1': 'peer', '3': 1, '4': 1, '5': 11, '6': '.autonat.pb.Message.PeerInfo', '10': 'peer'},
  ],
};

@$core.Deprecated('Use messageDescriptor instead')
const Message_DialResponse$json = {
  '1': 'DialResponse',
  '2': [
    {'1': 'status', '3': 1, '4': 1, '5': 14, '6': '.autonat.pb.Message.ResponseStatus', '10': 'status'},
    {'1': 'statusText', '3': 2, '4': 1, '5': 9, '10': 'statusText'},
    {'1': 'addr', '3': 3, '4': 1, '5': 12, '10': 'addr'},
  ],
};

@$core.Deprecated('Use messageDescriptor instead')
const Message_MessageType$json = {
  '1': 'MessageType',
  '2': [
    {'1': 'DIAL', '2': 0},
    {'1': 'DIAL_RESPONSE', '2': 1},
  ],
};

@$core.Deprecated('Use messageDescriptor instead')
const Message_ResponseStatus$json = {
  '1': 'ResponseStatus',
  '2': [
    {'1': 'OK', '2': 0},
    {'1': 'E_DIAL_ERROR', '2': 100},
    {'1': 'E_DIAL_REFUSED', '2': 101},
    {'1': 'E_BAD_REQUEST', '2': 200},
    {'1': 'E_INTERNAL_ERROR', '2': 300},
  ],
};

/// Descriptor for `Message`. Decode as a `google.protobuf.DescriptorProto`.
final $typed_data.Uint8List messageDescriptor = $convert.base64Decode(
    'CgdNZXNzYWdlEjMKBHR5cGUYASABKA4yHy5hdXRvbmF0LnBiLk1lc3NhZ2UuTWVzc2FnZVR5cG'
    'VSBHR5cGUSLAoEZGlhbBgCIAEoCzIYLmF1dG9uYXQucGIuTWVzc2FnZS5EaWFsUgRkaWFsEkQK'
    'DGRpYWxSZXNwb25zZRgDIAEoCzIgLmF1dG9uYXQucGIuTWVzc2FnZS5EaWFsUmVzcG9uc2VSDG'
    'RpYWxSZXNwb25zZRowCghQZWVySW5mbxIOCgJpZBgBIAEoDFICaWQSFAoFYWRkcnMYAiADKAxS'
    'BWFkZHJzGjgKBERpYWwSMAoEcGVlchgBIAEoCzIcLmF1dG9uYXQucGIuTWVzc2FnZS5QZWVySW'
    '5mb1IEcGVlchp+CgxEaWFsUmVzcG9uc2USOgoGc3RhdHVzGAEgASgOMiIuYXV0b25hdC5wYi5N'
    'ZXNzYWdlLlJlc3BvbnNlU3RhdHVzUgZzdGF0dXMSHgoKc3RhdHVzVGV4dBgCIAEoCVIKc3RhdH'
    'VzVGV4dBISCgRhZGRyGAMgASgMUgRhZGRyIioKC01lc3NhZ2VUeXBlEggKBERJQUwQABIRCg1E'
    'SUFMX1JFU1BPTlNFEAEiaQoOUmVzcG9uc2VTdGF0dXMSBgoCT0sQABIQCgxFX0RJQUxfRVJST1'
    'IQZBISCg5FX0RJQUxfUkVGVVNFRBBlEhIKDUVfQkFEX1JFUVVFU1QQyAESFQoQRV9JTlRFUk5B'
    'TF9FUlJPUhCsAg==');

