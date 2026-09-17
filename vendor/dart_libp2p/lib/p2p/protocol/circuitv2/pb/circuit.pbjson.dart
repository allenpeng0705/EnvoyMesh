//
//  Generated code. Do not modify.
//  source: circuit.proto
//
// @dart = 2.12

// ignore_for_file: annotate_overrides, camel_case_types, comment_references
// ignore_for_file: constant_identifier_names, library_prefixes
// ignore_for_file: non_constant_identifier_names, prefer_final_fields
// ignore_for_file: unnecessary_import, unnecessary_this, unused_import

import 'dart:convert' as $convert;
import 'dart:core' as $core;
import 'dart:typed_data' as $typed_data;

@$core.Deprecated('Use statusDescriptor instead')
const Status$json = {
  '1': 'Status',
  '2': [
    {'1': 'UNUSED', '2': 0},
    {'1': 'OK', '2': 100},
    {'1': 'RESERVATION_REFUSED', '2': 200},
    {'1': 'RESOURCE_LIMIT_EXCEEDED', '2': 201},
    {'1': 'PERMISSION_DENIED', '2': 202},
    {'1': 'CONNECTION_FAILED', '2': 203},
    {'1': 'NO_RESERVATION', '2': 204},
    {'1': 'MALFORMED_MESSAGE', '2': 400},
    {'1': 'UNEXPECTED_MESSAGE', '2': 401},
  ],
};

/// Descriptor for `Status`. Decode as a `google.protobuf.EnumDescriptorProto`.
final $typed_data.Uint8List statusDescriptor = $convert.base64Decode(
    'CgZTdGF0dXMSCgoGVU5VU0VEEAASBgoCT0sQZBIYChNSRVNFUlZBVElPTl9SRUZVU0VEEMgBEh'
    'wKF1JFU09VUkNFX0xJTUlUX0VYQ0VFREVEEMkBEhYKEVBFUk1JU1NJT05fREVOSUVEEMoBEhYK'
    'EUNPTk5FQ1RJT05fRkFJTEVEEMsBEhMKDk5PX1JFU0VSVkFUSU9OEMwBEhYKEU1BTEZPUk1FRF'
    '9NRVNTQUdFEJADEhcKElVORVhQRUNURURfTUVTU0FHRRCRAw==');

@$core.Deprecated('Use hopMessageDescriptor instead')
const HopMessage$json = {
  '1': 'HopMessage',
  '2': [
    {'1': 'type', '3': 1, '4': 1, '5': 14, '6': '.circuit.pb.HopMessage.Type', '9': 0, '10': 'type', '17': true},
    {'1': 'peer', '3': 2, '4': 1, '5': 11, '6': '.circuit.pb.Peer', '9': 1, '10': 'peer', '17': true},
    {'1': 'reservation', '3': 3, '4': 1, '5': 11, '6': '.circuit.pb.Reservation', '9': 2, '10': 'reservation', '17': true},
    {'1': 'limit', '3': 4, '4': 1, '5': 11, '6': '.circuit.pb.Limit', '9': 3, '10': 'limit', '17': true},
    {'1': 'status', '3': 5, '4': 1, '5': 14, '6': '.circuit.pb.Status', '9': 4, '10': 'status', '17': true},
    {'1': 'diagnostic_session_id', '3': 6, '4': 1, '5': 12, '9': 5, '10': 'diagnosticSessionId', '17': true},
  ],
  '4': [HopMessage_Type$json],
  '8': [
    {'1': '_type'},
    {'1': '_peer'},
    {'1': '_reservation'},
    {'1': '_limit'},
    {'1': '_status'},
    {'1': '_diagnostic_session_id'},
  ],
};

@$core.Deprecated('Use hopMessageDescriptor instead')
const HopMessage_Type$json = {
  '1': 'Type',
  '2': [
    {'1': 'RESERVE', '2': 0},
    {'1': 'CONNECT', '2': 1},
    {'1': 'STATUS', '2': 2},
  ],
};

/// Descriptor for `HopMessage`. Decode as a `google.protobuf.DescriptorProto`.
final $typed_data.Uint8List hopMessageDescriptor = $convert.base64Decode(
    'CgpIb3BNZXNzYWdlEjQKBHR5cGUYASABKA4yGy5jaXJjdWl0LnBiLkhvcE1lc3NhZ2UuVHlwZU'
    'gAUgR0eXBliAEBEikKBHBlZXIYAiABKAsyEC5jaXJjdWl0LnBiLlBlZXJIAVIEcGVlcogBARI+'
    'CgtyZXNlcnZhdGlvbhgDIAEoCzIXLmNpcmN1aXQucGIuUmVzZXJ2YXRpb25IAlILcmVzZXJ2YX'
    'Rpb26IAQESLAoFbGltaXQYBCABKAsyES5jaXJjdWl0LnBiLkxpbWl0SANSBWxpbWl0iAEBEi8K'
    'BnN0YXR1cxgFIAEoDjISLmNpcmN1aXQucGIuU3RhdHVzSARSBnN0YXR1c4gBARI3ChVkaWFnbm'
    '9zdGljX3Nlc3Npb25faWQYBiABKAxIBVITZGlhZ25vc3RpY1Nlc3Npb25JZIgBASIsCgRUeXBl'
    'EgsKB1JFU0VSVkUQABILCgdDT05ORUNUEAESCgoGU1RBVFVTEAJCBwoFX3R5cGVCBwoFX3BlZX'
    'JCDgoMX3Jlc2VydmF0aW9uQggKBl9saW1pdEIJCgdfc3RhdHVzQhgKFl9kaWFnbm9zdGljX3Nl'
    'c3Npb25faWQ=');

@$core.Deprecated('Use stopMessageDescriptor instead')
const StopMessage$json = {
  '1': 'StopMessage',
  '2': [
    {'1': 'type', '3': 1, '4': 1, '5': 14, '6': '.circuit.pb.StopMessage.Type', '9': 0, '10': 'type', '17': true},
    {'1': 'peer', '3': 2, '4': 1, '5': 11, '6': '.circuit.pb.Peer', '9': 1, '10': 'peer', '17': true},
    {'1': 'limit', '3': 3, '4': 1, '5': 11, '6': '.circuit.pb.Limit', '9': 2, '10': 'limit', '17': true},
    {'1': 'status', '3': 4, '4': 1, '5': 14, '6': '.circuit.pb.Status', '9': 3, '10': 'status', '17': true},
    {'1': 'diagnostic_session_id', '3': 5, '4': 1, '5': 12, '9': 4, '10': 'diagnosticSessionId', '17': true},
  ],
  '4': [StopMessage_Type$json],
  '8': [
    {'1': '_type'},
    {'1': '_peer'},
    {'1': '_limit'},
    {'1': '_status'},
    {'1': '_diagnostic_session_id'},
  ],
};

@$core.Deprecated('Use stopMessageDescriptor instead')
const StopMessage_Type$json = {
  '1': 'Type',
  '2': [
    {'1': 'CONNECT', '2': 0},
    {'1': 'STATUS', '2': 1},
  ],
};

/// Descriptor for `StopMessage`. Decode as a `google.protobuf.DescriptorProto`.
final $typed_data.Uint8List stopMessageDescriptor = $convert.base64Decode(
    'CgtTdG9wTWVzc2FnZRI1CgR0eXBlGAEgASgOMhwuY2lyY3VpdC5wYi5TdG9wTWVzc2FnZS5UeX'
    'BlSABSBHR5cGWIAQESKQoEcGVlchgCIAEoCzIQLmNpcmN1aXQucGIuUGVlckgBUgRwZWVyiAEB'
    'EiwKBWxpbWl0GAMgASgLMhEuY2lyY3VpdC5wYi5MaW1pdEgCUgVsaW1pdIgBARIvCgZzdGF0dX'
    'MYBCABKA4yEi5jaXJjdWl0LnBiLlN0YXR1c0gDUgZzdGF0dXOIAQESNwoVZGlhZ25vc3RpY19z'
    'ZXNzaW9uX2lkGAUgASgMSARSE2RpYWdub3N0aWNTZXNzaW9uSWSIAQEiHwoEVHlwZRILCgdDT0'
    '5ORUNUEAASCgoGU1RBVFVTEAFCBwoFX3R5cGVCBwoFX3BlZXJCCAoGX2xpbWl0QgkKB19zdGF0'
    'dXNCGAoWX2RpYWdub3N0aWNfc2Vzc2lvbl9pZA==');

@$core.Deprecated('Use peerDescriptor instead')
const Peer$json = {
  '1': 'Peer',
  '2': [
    {'1': 'id', '3': 1, '4': 1, '5': 12, '9': 0, '10': 'id', '17': true},
    {'1': 'addrs', '3': 2, '4': 3, '5': 12, '10': 'addrs'},
  ],
  '8': [
    {'1': '_id'},
  ],
};

/// Descriptor for `Peer`. Decode as a `google.protobuf.DescriptorProto`.
final $typed_data.Uint8List peerDescriptor = $convert.base64Decode(
    'CgRQZWVyEhMKAmlkGAEgASgMSABSAmlkiAEBEhQKBWFkZHJzGAIgAygMUgVhZGRyc0IFCgNfaW'
    'Q=');

@$core.Deprecated('Use reservationDescriptor instead')
const Reservation$json = {
  '1': 'Reservation',
  '2': [
    {'1': 'expire', '3': 1, '4': 1, '5': 4, '9': 0, '10': 'expire', '17': true},
    {'1': 'addrs', '3': 2, '4': 3, '5': 12, '10': 'addrs'},
    {'1': 'voucher', '3': 3, '4': 1, '5': 12, '9': 1, '10': 'voucher', '17': true},
  ],
  '8': [
    {'1': '_expire'},
    {'1': '_voucher'},
  ],
};

/// Descriptor for `Reservation`. Decode as a `google.protobuf.DescriptorProto`.
final $typed_data.Uint8List reservationDescriptor = $convert.base64Decode(
    'CgtSZXNlcnZhdGlvbhIbCgZleHBpcmUYASABKARIAFIGZXhwaXJliAEBEhQKBWFkZHJzGAIgAy'
    'gMUgVhZGRycxIdCgd2b3VjaGVyGAMgASgMSAFSB3ZvdWNoZXKIAQFCCQoHX2V4cGlyZUIKCghf'
    'dm91Y2hlcg==');

@$core.Deprecated('Use limitDescriptor instead')
const Limit$json = {
  '1': 'Limit',
  '2': [
    {'1': 'duration', '3': 1, '4': 1, '5': 13, '9': 0, '10': 'duration', '17': true},
    {'1': 'data', '3': 2, '4': 1, '5': 4, '9': 1, '10': 'data', '17': true},
  ],
  '8': [
    {'1': '_duration'},
    {'1': '_data'},
  ],
};

/// Descriptor for `Limit`. Decode as a `google.protobuf.DescriptorProto`.
final $typed_data.Uint8List limitDescriptor = $convert.base64Decode(
    'CgVMaW1pdBIfCghkdXJhdGlvbhgBIAEoDUgAUghkdXJhdGlvbogBARIXCgRkYXRhGAIgASgESA'
    'FSBGRhdGGIAQFCCwoJX2R1cmF0aW9uQgcKBV9kYXRh');

