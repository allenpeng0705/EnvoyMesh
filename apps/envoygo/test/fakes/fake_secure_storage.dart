/// In-memory replacement for [SecureStorage] used by NodeNotifier
/// tests. Mirrors the public surface of the real class but stores
/// values in a `Map` instead of `flutter_secure_storage` (which
/// requires a platform channel).
class FakeSecureStorage {
  final Map<String, String> _store = {};

  Future<void> saveSessionToken(String nodeId, String token) async {
    _store['node.$nodeId.sessionToken'] = token;
  }

  Future<String?> getSessionToken(String nodeId) async {
    return _store['node.$nodeId.sessionToken'];
  }

  Future<void> deleteSessionToken(String nodeId) async {
    _store.remove('node.$nodeId.sessionToken');
  }

  Future<void> saveActiveNodeId(String nodeId) async {
    _store['activeNodeId'] = nodeId;
  }

  Future<String?> getActiveNodeId() async {
    return _store['activeNodeId'];
  }

  Future<void> clear() async {
    _store.clear();
  }

  /// Test-only: number of entries currently in the store.
  int get length => _store.length;
}
