/// Envoy identity derivation — must match `@envoymesh/identity`.
///
/// Distinct from libp2p PeerId (`12D3…`). Envelope senderPeerId uses [derivePeerId].
library;

import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:pinenacl/ed25519.dart';

import 'ed25519_pem.dart';

/// `envoy_<sha256(publicKeyPem) base64url>` — envelope / device peer id.
String derivePeerId(String publicKeyPem) => 'envoy_${_hashDirect(publicKeyPem)}';

/// `envoy:owner:<sha256(publicKeyPem) base64url>`
String deriveOwnerId(String publicKeyPem) =>
    'envoy:owner:${_hashDirect(publicKeyPem)}';

/// `envoy:device:<sha256(publicKeyPem) base64url>`
String deriveDeviceId(String publicKeyPem) =>
    'envoy:device:${_hashDirect(publicKeyPem)}';

class EnvoyKeyPair {
  const EnvoyKeyPair({
    required this.publicKeyPem,
    required this.privateKeyPem,
  });

  final String publicKeyPem;
  final String privateKeyPem;
}

class EnvoyOwnerIdentity {
  const EnvoyOwnerIdentity({
    required this.ownerId,
    required this.publicKeyPem,
    required this.privateKeyPem,
  });

  final String ownerId;
  final String publicKeyPem;
  final String privateKeyPem;
}

class EnvoyDeviceIdentity {
  const EnvoyDeviceIdentity({
    required this.deviceId,
    required this.peerId,
    required this.publicKeyPem,
    required this.privateKeyPem,
  });

  final String deviceId;
  final String peerId;
  final String publicKeyPem;
  final String privateKeyPem;
}

/// Generate an Ed25519 owner identity (phone social-lite persona).
EnvoyOwnerIdentity generateOwnerIdentity([Uint8List? seed]) {
  final keys = generateEd25519KeyPair(seed);
  return EnvoyOwnerIdentity(
    ownerId: deriveOwnerId(keys.publicKeyPem),
    publicKeyPem: keys.publicKeyPem,
    privateKeyPem: keys.privateKeyPem,
  );
}

/// Generate an Ed25519 device identity used as envelope sender.
EnvoyDeviceIdentity generateDeviceIdentity([Uint8List? seed]) {
  final keys = generateEd25519KeyPair(seed);
  return EnvoyDeviceIdentity(
    deviceId: deriveDeviceId(keys.publicKeyPem),
    peerId: derivePeerId(keys.publicKeyPem),
    publicKeyPem: keys.publicKeyPem,
    privateKeyPem: keys.privateKeyPem,
  );
}

EnvoyKeyPair generateEd25519KeyPair([Uint8List? seed]) {
  final SigningKey signingKey = seed != null
      ? SigningKey.fromSeed(seed)
      : SigningKey.fromSeed(_randomSeed());
  final rawSeed = Uint8List.fromList(signingKey.seed.asTypedList);
  final rawPub = Uint8List.fromList(signingKey.verifyKey.asTypedList);
  return EnvoyKeyPair(
    publicKeyPem: rawPublicKeyToPem(rawPub),
    privateKeyPem: rawPrivateKeyToPem(rawSeed),
  );
}

Uint8List _randomSeed() {
  final rnd = Random.secure();
  return Uint8List.fromList(List<int>.generate(32, (_) => rnd.nextInt(256)));
}

String _hashDirect(String input) {
  final digest = sha256.convert(utf8.encode(input));
  return _bytesToBase64Url(Uint8List.fromList(digest.bytes));
}

String _bytesToBase64Url(Uint8List bytes) {
  return base64Url.encode(bytes).replaceAll('=', '');
}
