//
//  Generated code. Do not modify.
//  source: peer_record.proto
//
// @dart = 2.12

// ignore_for_file: annotate_overrides, camel_case_types, comment_references
// ignore_for_file: constant_identifier_names, library_prefixes
// ignore_for_file: non_constant_identifier_names, prefer_final_fields
// ignore_for_file: unnecessary_import, unnecessary_this, unused_import

import 'dart:convert' as $convert;
import 'dart:core' as $core;
import 'dart:typed_data' as $typed_data;

@$core.Deprecated('Use peerRecordDescriptor instead')
const PeerRecord$json = {
  '1': 'PeerRecord',
  '2': [
    {'1': 'peer_id', '3': 1, '4': 1, '5': 12, '10': 'peerId'},
    {'1': 'seq', '3': 2, '4': 1, '5': 4, '10': 'seq'},
    {'1': 'addresses', '3': 3, '4': 3, '5': 11, '6': '.peer.pb.PeerRecord.AddressInfo', '10': 'addresses'},
  ],
  '3': [PeerRecord_AddressInfo$json],
};

@$core.Deprecated('Use peerRecordDescriptor instead')
const PeerRecord_AddressInfo$json = {
  '1': 'AddressInfo',
  '2': [
    {'1': 'multiaddr', '3': 1, '4': 1, '5': 12, '10': 'multiaddr'},
  ],
};

/// Descriptor for `PeerRecord`. Decode as a `google.protobuf.DescriptorProto`.
final $typed_data.Uint8List peerRecordDescriptor = $convert.base64Decode(
    'CgpQZWVyUmVjb3JkEhcKB3BlZXJfaWQYASABKAxSBnBlZXJJZBIQCgNzZXEYAiABKARSA3NlcR'
    'I9CglhZGRyZXNzZXMYAyADKAsyHy5wZWVyLnBiLlBlZXJSZWNvcmQuQWRkcmVzc0luZm9SCWFk'
    'ZHJlc3NlcxorCgtBZGRyZXNzSW5mbxIcCgltdWx0aWFkZHIYASABKAxSCW11bHRpYWRkcg==');

