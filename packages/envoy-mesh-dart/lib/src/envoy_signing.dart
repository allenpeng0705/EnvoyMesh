/// Canonical-payload Ed25519 sign/verify — must match `@envoymesh/identity`.
library;

import 'dart:convert';
import 'dart:typed_data';

import 'package:pinenacl/ed25519.dart';

import 'canonical_json.dart';
import 'ed25519_pem.dart';

/// Sign [input] after [canonicalJson]; returns base64url (no padding).
String signCanonicalPayload(Object? input, String privateKeyPem) {
  final seed = pemToRawPrivateSeed(privateKeyPem);
  final signingKey = SigningKey.fromSeed(seed);
  final payload = Uint8List.fromList(utf8.encode(canonicalJson(input)));
  final signed = signingKey.sign(payload);
  return _bytesToBase64Url(Uint8List.fromList(signed.signature.asTypedList));
}

/// Verify [signature] (base64url) over canonical JSON of [input].
bool verifyCanonicalPayload(
  Object? input,
  String signature,
  String publicKeyPem,
) {
  try {
    final rawPub = pemToRawPublicKey(publicKeyPem);
    final verifyKey = VerifyKey(rawPub);
    final payload = Uint8List.fromList(utf8.encode(canonicalJson(input)));
    final sigBytes = _base64UrlToBytes(signature);
    if (sigBytes.length != Signature.signatureLength) return false;
    return verifyKey.verify(
      signature: Signature(sigBytes),
      message: payload,
    );
  } catch (_) {
    return false;
  }
}

String _bytesToBase64Url(Uint8List bytes) {
  return base64Url.encode(bytes).replaceAll('=', '');
}

Uint8List _base64UrlToBytes(String input) {
  var s = input.replaceAll('-', '+').replaceAll('_', '/');
  final pad = s.length % 4;
  if (pad != 0) s = s.padRight(s.length + (4 - pad), '=');
  return Uint8List.fromList(base64Decode(s));
}
