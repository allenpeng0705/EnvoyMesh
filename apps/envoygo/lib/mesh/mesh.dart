/// EnvoyGo mesh/social adapters.
///
/// Level-2 libp2p + `envoy_mesh` types come from `envoy_mesh_libp2p`.
/// App-specific pieces (Home RPC backend, SQLite, Contact adapters) stay here.
library;

export 'package:envoy_mesh_libp2p/envoy_mesh_libp2p.dart';

export 'home_social_backend.dart';
export 'phone_social_local_db.dart';
export 'secure_storage_libp2p_seed_store.dart';
export 'social_model_adapters.dart';
