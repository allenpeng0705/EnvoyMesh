/// Persistence for the libp2p identity seed (shared host PeerId).
library;

/// Key/value store used only for `libp2p_identity_seed`.
///
/// Apps typically wrap secure storage (Keychain / EncryptedSharedPreferences).
/// Tests use [MemoryLibp2pSeedStore].
abstract class Libp2pSeedStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
}

/// In-memory seed store for unit tests and ephemeral hosts.
class MemoryLibp2pSeedStore implements Libp2pSeedStore {
  MemoryLibp2pSeedStore([Map<String, String>? backing])
      : _map = backing ?? <String, String>{};

  final Map<String, String> _map;

  @override
  Future<String?> read(String key) async {
    final v = _map[key];
    if (v == null || v.isEmpty) return null;
    return v;
  }

  @override
  Future<void> write(String key, String value) async {
    _map[key] = value;
  }
}
