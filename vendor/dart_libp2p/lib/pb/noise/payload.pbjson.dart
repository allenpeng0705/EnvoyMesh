//
//  Generated code. Do not modify.
//  source: proto/noise/payload.proto
//
// @dart = 2.12

// ignore_for_file: annotate_overrides, camel_case_types, comment_references
// ignore_for_file: constant_identifier_names, library_prefixes
// ignore_for_file: non_constant_identifier_names, prefer_final_fields
// ignore_for_file: unnecessary_import, unnecessary_this, unused_import

import 'dart:convert' as $convert;
import 'dart:core' as $core;
import 'dart:typed_data' as $typed_data;

@$core.Deprecated('Use noiseExtensionsDescriptor instead')
const NoiseExtensions$json = {
  '1': 'NoiseExtensions',
  '2': [
    {'1': 'webtransport_certhashes', '3': 1, '4': 3, '5': 12, '10': 'webtransportCerthashes'},
    {'1': 'stream_muxers', '3': 2, '4': 3, '5': 9, '10': 'streamMuxers'},
  ],
};

/// Descriptor for `NoiseExtensions`. Decode as a `google.protobuf.DescriptorProto`.
final $typed_data.Uint8List noiseExtensionsDescriptor = $convert.base64Decode(
    'Cg9Ob2lzZUV4dGVuc2lvbnMSNwoXd2VidHJhbnNwb3J0X2NlcnRoYXNoZXMYASADKAxSFndlYn'
    'RyYW5zcG9ydENlcnRoYXNoZXMSIwoNc3RyZWFtX211eGVycxgCIAMoCVIMc3RyZWFtTXV4ZXJz');

@$core.Deprecated('Use noiseHandshakePayloadDescriptor instead')
const NoiseHandshakePayload$json = {
  '1': 'NoiseHandshakePayload',
  '2': [
    {'1': 'identity_key', '3': 1, '4': 1, '5': 12, '10': 'identityKey'},
    {'1': 'identity_sig', '3': 2, '4': 1, '5': 12, '10': 'identitySig'},
    {'1': 'static_key', '3': 3, '4': 1, '5': 12, '10': 'staticKey'},
    {'1': 'extensions', '3': 4, '4': 1, '5': 11, '6': '.noise.pb.NoiseExtensions', '10': 'extensions'},
  ],
};

/// Descriptor for `NoiseHandshakePayload`. Decode as a `google.protobuf.DescriptorProto`.
final $typed_data.Uint8List noiseHandshakePayloadDescriptor = $convert.base64Decode(
    'ChVOb2lzZUhhbmRzaGFrZVBheWxvYWQSIQoMaWRlbnRpdHlfa2V5GAEgASgMUgtpZGVudGl0eU'
    'tleRIhCgxpZGVudGl0eV9zaWcYAiABKAxSC2lkZW50aXR5U2lnEh0KCnN0YXRpY19rZXkYAyAB'
    'KAxSCXN0YXRpY0tleRI5CgpleHRlbnNpb25zGAQgASgLMhkubm9pc2UucGIuTm9pc2VFeHRlbn'
    'Npb25zUgpleHRlbnNpb25z');

