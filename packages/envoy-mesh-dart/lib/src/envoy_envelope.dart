/// Envelope helpers for social-lite wire (unsigned build + verify).
library;

import 'envoy_identity.dart';
import 'envoy_signing.dart';

/// Verify signature and that senderPeerId matches senderPublicKey.
bool verifyEnvoyEnvelope(Map<String, Object?> signed) {
  final sig = signed['signature'];
  if (sig is! String || sig.isEmpty) return false;
  final publicKey = signed['senderPublicKey'];
  if (publicKey is! String || publicKey.isEmpty) return false;
  final senderPeerId = signed['senderPeerId'];
  if (senderPeerId is! String) return false;
  if (derivePeerId(publicKey) != senderPeerId) return false;

  final unsigned = Map<String, Object?>.from(signed)..remove('signature');
  return verifyCanonicalPayload(unsigned, sig, publicKey);
}

/// Sign an unsigned envelope map; returns a new map including `signature`.
Map<String, Object?> signEnvoyEnvelope(
  Map<String, Object?> unsigned,
  String privateKeyPem,
) {
  final signature = signCanonicalPayload(unsigned, privateKeyPem);
  return {...unsigned, 'signature': signature};
}
