/// Adapts EnvoyGo [SecureStorage] to [Libp2pSeedStore] for the shared host seed.
library;

import 'package:envoy_mesh_libp2p/envoy_mesh_libp2p.dart';

import '../storage/secure_storage.dart';

class SecureStorageLibp2pSeedStore implements Libp2pSeedStore {
  SecureStorageLibp2pSeedStore(this._secure);

  final SecureStorage _secure;

  @override
  Future<String?> read(String key) => _secure.read(key);

  @override
  Future<void> write(String key, String value) => _secure.write(key, value);
}
