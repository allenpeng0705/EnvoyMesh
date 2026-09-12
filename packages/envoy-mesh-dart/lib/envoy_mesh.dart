/// EnvoyMesh **reusable** SDK — protocol, crypto, envelope and transport
/// primitives for any product built on EnvoyMesh.
///
/// ## What this library is
///
/// The product-agnostic half of `envoy_mesh`: everything needed to sign and
/// verify envelopes, identify a peer, discover one, and move bytes — with **no
/// EnvoyMesh product concept reachable**. A consumer importing this library
/// cannot name a bond, a family profile, a persona, a chat room or a contact,
/// because none of them is exported here.
///
/// Verified by `scripts/check-module-boundary.mjs` (rule 5) against the manifest
/// `scripts/module-boundary.json`: **every module exported below is classified
/// `reusable`**, and no `reusable` module may depend on a `product-bound` one.
/// The count is deliberately not written here — it was 13 in an earlier draft
/// while the list had already grown to 15, which is the drift a rule can catch
/// and a sentence cannot.
///
/// ## What this library is not
///
/// Product/social types — `SocialBackend`, `PhoneSocialBackend`,
/// `PhoneSocialStore`, `PhonePersona`, `BondContact`,
/// `CrossPersonaSuggestion` — now live in `envoy_mesh_social.dart`. If a symbol
/// is unresolved after upgrading, add
/// `import 'package:envoy_mesh/envoy_mesh_social.dart';`.
///
/// `MeshPeerHit` is *not* in that list: it is a reusable discovery type that was
/// split out of `models.dart` (see `src/mesh_peer_hit.dart`), it is exported by
/// **this** library, and `envoy_mesh_social.dart` no longer re-exports it.
///
/// Design and rationale: `docs/envoymesh-refactoring-plan.md` §2.3, §3, §5.
library;

export 'src/bootstrap_addrs.dart';
export 'src/canonical_json.dart';
export 'src/capability_topic_cid.dart';
export 'src/discovery_topics.dart';
export 'src/ed25519_pem.dart';
export 'src/envelope_factory.dart';
export 'src/envoy_envelope.dart';
export 'src/envoy_identity.dart';
export 'src/envoy_signing.dart';
export 'src/lan_owner_id.dart';
export 'src/mesh_envelope_transport.dart';
export 'src/mesh_peer_hit.dart';
export 'src/phone_discovery_runtime.dart';
export 'src/mesh_protocols.dart';
export 'src/relay_envelope_factory.dart';
