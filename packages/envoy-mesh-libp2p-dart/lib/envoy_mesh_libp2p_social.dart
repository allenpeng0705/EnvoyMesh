/// EnvoyMesh **social** libp2p adapters — the parts that need an EnvoyMesh
/// product identity.
///
/// ## What belongs here
///
/// Two modules, both genuinely coupled to the product:
///
/// * `phone_discovery_session.dart` — signs discovery envelopes with
///   `_backend.persona`, the phone-plane identity.
/// * `libp2p_mesh_envelope_transport.dart` — takes
///   `required PhoneSocialBackend backend` to route envelopes through a social
///   backend.
///
/// Unlike `Libp2pNode`, neither can work without the product, so neither can be
/// reclassified by moving a type — the coupling is real, not incidental.
///
/// `envoy_mesh_libp2p.dart` remains the reusable surface: host, relay
/// reservation, seed store and the shared mesh session.
///
/// Design and rationale: `docs/envoymesh-refactoring-plan.md` §5, §8.3.
library;

export 'src/libp2p_mesh_envelope_transport.dart';
export 'src/phone_discovery_session.dart';
