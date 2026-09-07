/// Ed25519 PEM encode/decode matching `@envoymesh/mobile-identity` /
/// Node `crypto` SPKI + PKCS8 prefixes used by EnvoyMesh.
library;

import 'dart:convert';
import 'dart:typed_data';

/// SPKI DER prefix for Ed25519 public key (12 bytes).
final Uint8List ed25519SpkiPrefix = Uint8List.fromList([
  0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
]);

/// PKCS8 DER prefix for Ed25519 private key seed (16 bytes).
final Uint8List ed25519Pkcs8Prefix = Uint8List.fromList([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70,
  0x04, 0x22, 0x04, 0x20,
]);

String rawPublicKeyToPem(Uint8List rawKey) {
  if (rawKey.length != 32) {
    throw ArgumentError('Ed25519 public key must be 32 bytes');
  }
  final der = Uint8List(ed25519SpkiPrefix.length + rawKey.length)
    ..setAll(0, ed25519SpkiPrefix)
    ..setAll(ed25519SpkiPrefix.length, rawKey);
  return _derToPem(der, 'PUBLIC KEY');
}

String rawPrivateKeyToPem(Uint8List rawSeed) {
  if (rawSeed.length != 32) {
    throw ArgumentError('Ed25519 private seed must be 32 bytes');
  }
  final der = Uint8List(ed25519Pkcs8Prefix.length + rawSeed.length)
    ..setAll(0, ed25519Pkcs8Prefix)
    ..setAll(ed25519Pkcs8Prefix.length, rawSeed);
  return _derToPem(der, 'PRIVATE KEY');
}

Uint8List pemToRawPublicKey(String pem) {
  return _pemToRaw(pem, ed25519SpkiPrefix.length);
}

Uint8List pemToRawPrivateSeed(String pem) {
  return _pemToRaw(pem, ed25519Pkcs8Prefix.length);
}

String _derToPem(Uint8List der, String label) {
  final b64 = base64Encode(der);
  final lines = <String>[];
  for (var i = 0; i < b64.length; i += 64) {
    final end = (i + 64 < b64.length) ? i + 64 : b64.length;
    lines.add(b64.substring(i, end));
  }
  return '-----BEGIN $label-----\n${lines.join('\n')}\n-----END $label-----\n';
}

Uint8List _pemToRaw(String pem, int prefixLen) {
  final b64 = pem
      .replaceAll(RegExp(r'-----(BEGIN|END) (PUBLIC|PRIVATE) KEY-----'), '')
      .replaceAll(RegExp(r'\s'), '');
  final der = base64Decode(b64);
  if (der.length <= prefixLen) {
    throw FormatException('PEM DER too short for Ed25519 key');
  }
  return Uint8List.fromList(der.sublist(prefixLen));
}
