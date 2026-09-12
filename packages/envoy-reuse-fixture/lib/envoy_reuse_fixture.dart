/// **The reuse test** — a consumer built only from EnvoyMesh's `reusable`
/// modules.
///
/// `docs/envoymesh-refactoring-plan.md` §4.4 asks for a fixture that proves the
/// encapsulation claim rather than asserting it. This package is that fixture.
///
/// ## The rule this file obeys
///
/// It imports **only**:
///
/// * `package:envoy_mesh/envoy_mesh.dart` — the reusable SDK library
/// * `package:envoy_thin_client/envoy_thin_client.dart` — 12/12 modules reusable
/// * `package:envoy_mesh_libp2p/envoy_mesh_libp2p.dart` — the reusable libp2p
///   transport (host, sessions, seed store)
///
/// It must **never** import `envoy_mesh_social.dart` or
/// `envoy_mesh_libp2p_social.dart`. `test/reuse_test.dart` asserts that
/// mechanically by scanning this file's own directives, and
/// `scripts/check-module-boundary.mjs` independently enforces that no
/// `reusable` module depends on a `product-bound` one.
///
/// ## Why this is a realistic consumer, not a smoke test
///
/// Every function below is something a non-social product actually needs:
/// identify a peer, sign and verify an envelope, decide whether an address is
/// dialable now, parse a pairing URI, and persist a libp2p seed. If any of them
/// required a bond, a persona or a chat room, this package would not compile.
library;

// --- only reusable imports ---------------------------------------------------
//
// `envoy_mesh.dart` is imported explicitly even though `envoy_mesh_libp2p.dart`
// re-exports it. That redundancy is the fixture's *evidence*: the reusable SDK
// library must be importable and sufficient on its own. The analyzer calls it
// unnecessary; keeping it is deliberate.
// ignore: unnecessary_import
import 'package:envoy_mesh/envoy_mesh.dart';
import 'package:envoy_mesh_libp2p/envoy_mesh_libp2p.dart';
import 'package:envoy_thin_client/envoy_thin_client.dart';

// --- re-export the reusable surface this consumer is built from ---------------
//
// The fixture's public surface IS the reusable surface. Re-exporting it means
// the test (and any reader) works through this one entry point, which is what a
// product would do. Note that nothing product-bound is exported, because
// nothing product-bound is imported.
export 'package:envoy_mesh/envoy_mesh.dart';
export 'package:envoy_mesh_libp2p/envoy_mesh_libp2p.dart';
export 'package:envoy_thin_client/envoy_thin_client.dart';

/// A consumer's minimal notion of "who am I on the mesh".
///
/// Built from a locally generated key pair — no owner profile, no device
/// certificate, no bond. That is the point: a product that is not EnvoyMesh
/// social still needs a peer identity, and the reusable surface provides one.
class FixturePeerIdentity {
  FixturePeerIdentity({String? label})
      : _keyPair = generateEd25519KeyPair(),
        label = label ?? 'reuse-fixture';

  final EnvoyKeyPair _keyPair;
  final String label;

  String get publicKeyPem => _keyPair.publicKeyPem;
  String get privateKeyPem => _keyPair.privateKeyPem;

  /// The runtime peer id derived from the public key.
  String get peerId => derivePeerId(publicKeyPem);

  /// Sign an arbitrary payload using canonical JSON — the same signing
  /// convention every EnvoyMesh message uses.
  String sign(Map<String, Object?> payload) =>
      signCanonicalPayload(payload, privateKeyPem);

  /// Verify a signature produced by [sign].
  bool verify(Map<String, Object?> payload, String signature) =>
      verifyCanonicalPayload(payload, signature, publicKeyPem);
}

/// Build a signed envelope the way a non-social product would: a typed intent
/// carried over the mesh, with no chat or bond semantics attached.
Map<String, Object?> buildSignedEnvelope({
  required FixturePeerIdentity identity,
  required String intent,
  required Map<String, Object?> payload,
  String? recipientPeerId,
}) {
  final unsigned = <String, Object?>{
    'version': '0.1',
    'messageId': payload['messageId'] ?? 'fixture-message',
    'createdAt': '2026-01-01T00:00:00.000Z',
    'senderPeerId': identity.peerId,
    'senderPublicKey': identity.publicKeyPem,
    'senderRole': 'agent',
    'recipientRole': 'agent',
    if (recipientPeerId != null) 'recipientPeerId': recipientPeerId,
    'intent': intent,
    'payload': payload,
  };
  return signEnvoyEnvelope(unsigned, identity.privateKeyPem);
}

/// Decide whether a discovered peer can be dialed right now.
///
/// This is the decision every product makes before showing a peer as reachable,
/// and it is pure transport logic — `hasHopSlot` + `multiaddrs`, no trust tier
/// involved.
bool canDialNow({required bool? hasHopSlot, required List<String> multiaddrs}) =>
    peerDialable(hasHopSlot: hasHopSlot, multiaddrs: multiaddrs);

/// Parse a pairing URI into transport candidates — the same path a product's
/// mobile app takes after scanning a QR code.
PairingData? parsePairing(String uri) => parsePairingUri(uri);

/// Turn a user-typed interest into the discovery topic vocabulary.
List<String> topicsForInterests(List<String> interests) =>
    interests.map(interestTopicFor).toList();

/// Persist a libp2p seed in memory — the reusable half of the libp2p surface.
///
/// `Libp2pNode` itself is part of this import, which is what makes the fixture
/// meaningful: the **host** is reusable, so a product can run a node runtime
/// without the social plane.
Future<String> roundTripSeed(String seed) async {
  final store = MemoryLibp2pSeedStore();
  await store.write('libp2p_identity_seed', seed);
  return (await store.read('libp2p_identity_seed')) ?? '';
}
