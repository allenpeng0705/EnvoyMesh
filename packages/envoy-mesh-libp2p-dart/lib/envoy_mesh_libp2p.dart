/// EnvoyMesh **reusable** libp2p transport — host, relay reservation, seed
/// store and mesh sessions, for any product built on EnvoyMesh.
///
/// ## What this library is
///
/// The product-agnostic half of the libp2p adapters: start a host, dial and
/// accept peer streams, reserve a circuit-relay slot, run the shared mesh
/// session, and persist the libp2p seed. **No EnvoyMesh product concept is
/// reachable** — no persona, no bond, no chat room, no contact.
///
/// This matters for V1 of the refactoring plan: a product's desktop app must be
/// able to host a connection over WAN, which needs this transport and nothing
/// social (`docs/envoymesh-refactoring-plan.md` §1.3, §6.1).
///
/// ## Why the split was needed
///
/// This library previously re-exported `phone_discovery_session.dart`, which
/// signs envelopes with `_backend.persona`. Because one library re-exported a
/// persona-using module, the manifest classified the **whole package surface**
/// product-bound — including `Libp2pNode`, the host itself, which never
/// referenced a single social symbol. The host was unusable without the product
/// purely because of where `PhoneDiscoveryProvider` was declared.
///
/// Splitting `models.dart` (see `envoy_mesh.dart` → `mesh_peer_hit.dart`) made
/// `PhoneDiscoveryProvider` reusable, which made the host reusable. The
/// product-bound modules moved to `envoy_mesh_libp2p_social.dart`.
///
/// Verified by `scripts/check-module-boundary.mjs` (rule 5) against
/// `scripts/module-boundary.json`.
library;

export 'package:dart_libp2p/dart_libp2p.dart'
    show AddrInfo, MultiAddr, P2PStream, PeerId;
export 'package:envoy_mesh/envoy_mesh.dart';

export 'src/libp2p_node.dart';
export 'src/phone_mesh_session.dart';
export 'src/seed_store.dart';
