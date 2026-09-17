//
//  Generated code. Do not modify.
//  source: envelope.proto
//
// @dart = 2.12

// ignore_for_file: annotate_overrides, camel_case_types, comment_references
// ignore_for_file: constant_identifier_names, library_prefixes
// ignore_for_file: non_constant_identifier_names, prefer_final_fields
// ignore_for_file: unnecessary_import, unnecessary_this, unused_import

import 'dart:convert' as $convert;
import 'dart:core' as $core;
import 'dart:typed_data' as $typed_data;

@$core.Deprecated('Use envelopeDescriptor instead')
const Envelope$json = {
  '1': 'Envelope',
  '2': [
    {'1': 'public_key', '3': 1, '4': 1, '5': 11, '6': '.crypto.pb.PublicKey', '10': 'publicKey'},
    {'1': 'payload_type', '3': 2, '4': 1, '5': 12, '10': 'payloadType'},
    {'1': 'payload', '3': 3, '4': 1, '5': 12, '10': 'payload'},
    {'1': 'signature', '3': 5, '4': 1, '5': 12, '10': 'signature'},
  ],
};

/// Descriptor for `Envelope`. Decode as a `google.protobuf.DescriptorProto`.
final $typed_data.Uint8List envelopeDescriptor = $convert.base64Decode(
    'CghFbnZlbG9wZRIzCgpwdWJsaWNfa2V5GAEgASgLMhQuY3J5cHRvLnBiLlB1YmxpY0tleVIJcH'
    'VibGljS2V5EiEKDHBheWxvYWRfdHlwZRgCIAEoDFILcGF5bG9hZFR5cGUSGAoHcGF5bG9hZBgD'
    'IAEoDFIHcGF5bG9hZBIcCglzaWduYXR1cmUYBSABKAxSCXNpZ25hdHVyZQ==');

