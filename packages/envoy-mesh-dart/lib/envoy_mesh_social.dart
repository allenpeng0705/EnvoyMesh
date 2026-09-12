/// EnvoyMesh **social** SDK — the EnvoyMesh product's own types.
///
/// ## Why this is separate from `envoy_mesh.dart`
///
/// Until this split, `envoy_mesh.dart` exported the reusable primitives *and*
/// the product types from a single library, so a consumer that wanted
/// `canonical_json` and `envoy_signing` also received `SocialBackend`,
/// `PhoneSocialStore`, `BondContact` and `CrossPersonaSuggestion` in scope. The
/// library was even labelled *"EnvoyMesh social-lite SDK"*, which made the mixed
/// surface look intentional. That is the encapsulation defect recorded in
/// `docs/envoymesh-refactoring-plan.md` §2.3.
///
/// ## What belongs here
///
/// Anything that names an EnvoyMesh product concept — a persona, a bond, a
/// contact, a chat message or room, a phone-plane discovery record. The manifest
/// (`scripts/module-boundary.json`) classifies each module; **every module
/// exported below is `product-bound`**, and importing this library is what makes
/// those names reachable.
///
/// `src/mesh_peer_hit.dart` is deliberately **not** re-exported here even though
/// it sits alongside `models.dart`. It is a `reusable` type (split out of
/// `models.dart` for exactly that reason), so `envoy_mesh.dart` is its only
/// source of truth; re-exporting it from a product-bound library would put a
/// reusable name on the product surface and make this library's docstring
/// untrue. Consumers that already import both libraries are unaffected.
///
/// ## Consumers
///
/// The EnvoyGo mobile app is currently the only consumer. A product that is
/// **not** EnvoyMesh social should import `envoy_mesh.dart` only — that is the
/// point of the split, and `envoy_thin_client` already demonstrates it (all 12
/// of its modules are `reusable`).
///
/// Design and rationale: `docs/envoymesh-refactoring-plan.md` §5 (A1), E2, E3.
library;

export 'src/cross_persona_suggestions.dart';
export 'src/models.dart';
export 'src/phone_identity_store.dart';
export 'src/phone_social_backend.dart';
export 'src/phone_social_store.dart';
export 'src/social_backend.dart';
