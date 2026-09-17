//
//  Generated code. Do not modify.
//  source: voucher.proto
//
// @dart = 2.12

// ignore_for_file: annotate_overrides, camel_case_types, comment_references
// ignore_for_file: constant_identifier_names, library_prefixes
// ignore_for_file: non_constant_identifier_names, prefer_final_fields
// ignore_for_file: unnecessary_import, unnecessary_this, unused_import

import 'dart:convert' as $convert;
import 'dart:core' as $core;
import 'dart:typed_data' as $typed_data;

@$core.Deprecated('Use reservationVoucherDescriptor instead')
const ReservationVoucher$json = {
  '1': 'ReservationVoucher',
  '2': [
    {'1': 'relay', '3': 1, '4': 1, '5': 12, '9': 0, '10': 'relay', '17': true},
    {'1': 'peer', '3': 2, '4': 1, '5': 12, '9': 1, '10': 'peer', '17': true},
    {'1': 'expiration', '3': 3, '4': 1, '5': 4, '9': 2, '10': 'expiration', '17': true},
  ],
  '8': [
    {'1': '_relay'},
    {'1': '_peer'},
    {'1': '_expiration'},
  ],
};

/// Descriptor for `ReservationVoucher`. Decode as a `google.protobuf.DescriptorProto`.
final $typed_data.Uint8List reservationVoucherDescriptor = $convert.base64Decode(
    'ChJSZXNlcnZhdGlvblZvdWNoZXISGQoFcmVsYXkYASABKAxIAFIFcmVsYXmIAQESFwoEcGVlch'
    'gCIAEoDEgBUgRwZWVyiAEBEiMKCmV4cGlyYXRpb24YAyABKARIAlIKZXhwaXJhdGlvbogBAUII'
    'CgZfcmVsYXlCBwoFX3BlZXJCDQoLX2V4cGlyYXRpb24=');

