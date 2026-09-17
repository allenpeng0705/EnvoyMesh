//
//  Generated code. Do not modify.
//  source: lib/src/core/crypto/pb/crypto.proto
//
// @dart = 2.12

// ignore_for_file: annotate_overrides, camel_case_types, comment_references
// ignore_for_file: constant_identifier_names, library_prefixes
// ignore_for_file: non_constant_identifier_names, prefer_final_fields
// ignore_for_file: unnecessary_import, unnecessary_this, unused_import

import 'dart:convert' as $convert;
import 'dart:core' as $core;
import 'dart:typed_data' as $typed_data;

@$core.Deprecated('Use keyTypeDescriptor instead')
const KeyType$json = {
  '1': 'KeyType',
  '2': [
    {'1': 'RSA', '2': 0},
    {'1': 'Ed25519', '2': 1},
    {'1': 'Secp256k1', '2': 2},
    {'1': 'ECDSA', '2': 3},
  ],
};

/// Descriptor for `KeyType`. Decode as a `google.protobuf.EnumDescriptorProto`.
final $typed_data.Uint8List keyTypeDescriptor = $convert.base64Decode(
    'CgdLZXlUeXBlEgcKA1JTQRAAEgsKB0VkMjU1MTkQARINCglTZWNwMjU2azEQAhIJCgVFQ0RTQR'
    'AD');

@$core.Deprecated('Use publicKeyDescriptor instead')
const PublicKey$json = {
  '1': 'PublicKey',
  '2': [
    {'1': 'Type', '3': 1, '4': 2, '5': 14, '6': '.crypto.pb.KeyType', '10': 'Type'},
    {'1': 'Data', '3': 2, '4': 2, '5': 12, '10': 'Data'},
  ],
};

/// Descriptor for `PublicKey`. Decode as a `google.protobuf.DescriptorProto`.
final $typed_data.Uint8List publicKeyDescriptor = $convert.base64Decode(
    'CglQdWJsaWNLZXkSJgoEVHlwZRgBIAIoDjISLmNyeXB0by5wYi5LZXlUeXBlUgRUeXBlEhIKBE'
    'RhdGEYAiACKAxSBERhdGE=');

@$core.Deprecated('Use privateKeyDescriptor instead')
const PrivateKey$json = {
  '1': 'PrivateKey',
  '2': [
    {'1': 'Type', '3': 1, '4': 2, '5': 14, '6': '.crypto.pb.KeyType', '10': 'Type'},
    {'1': 'Data', '3': 2, '4': 2, '5': 12, '10': 'Data'},
  ],
};

/// Descriptor for `PrivateKey`. Decode as a `google.protobuf.DescriptorProto`.
final $typed_data.Uint8List privateKeyDescriptor = $convert.base64Decode(
    'CgpQcml2YXRlS2V5EiYKBFR5cGUYASACKA4yEi5jcnlwdG8ucGIuS2V5VHlwZVIEVHlwZRISCg'
    'REYXRhGAIgAigMUgREYXRh');

