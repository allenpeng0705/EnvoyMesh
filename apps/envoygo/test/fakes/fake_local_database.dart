/// In-memory replacement for [LocalDatabase] used by NodeNotifier
/// tests. Mirrors a subset of the real class's public surface
/// (the methods used by `NodeNotifier`).
class FakeLocalDatabase {
  bool _initialized = false;
  final List<Map<String, dynamic>> _nodes = [];

  Future<void> initialize() async {
    _initialized = true;
  }

  bool get isInitialized => _initialized;

  Future<void> upsertNode(Map<String, dynamic> node) async {
    final id = node['id'] as String;
    _nodes.removeWhere((n) => n['id'] == id);
    _nodes.add(Map<String, dynamic>.from(node));
  }

  Future<List<Map<String, dynamic>>> listNodes() async {
    return List<Map<String, dynamic>>.from(_nodes);
  }

  Future<void> deleteNode(String nodeId) async {
    _nodes.removeWhere((n) => n['id'] == nodeId);
  }

  Future<void> updateNodeLastConnected(String nodeId) async {
    final idx = _nodes.indexWhere((n) => n['id'] == nodeId);
    if (idx >= 0) {
      _nodes[idx] = {
        ..._nodes[idx],
        'last_connected_at': DateTime.now().toIso8601String(),
      };
    }
  }

  Future<void> upsertContacts(
      String nodeId, List<Map<String, dynamic>> contacts) async {
    // No-op for tests that don't exercise contact sync.
  }

  Future<void> upsertRooms(
      String nodeId, List<Map<String, dynamic>> rooms) async {
    // No-op for tests that don't exercise room sync.
  }
}
