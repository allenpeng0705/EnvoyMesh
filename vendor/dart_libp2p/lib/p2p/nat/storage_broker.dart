/// Interface for storage brokers that can be used to persist NAT behavior data
abstract class StorageBroker {
  /// Saves data to storage
  Future<void> save(String key, String data);
  
  /// Loads data from storage
  Future<String?> load(String key);
  
  /// Deletes data from storage
  Future<void> delete(String key);
}

/// In-memory implementation of StorageBroker for testing
class InMemoryStorageBroker implements StorageBroker {
  final Map<String, String> _storage = {};
  
  @override
  Future<void> save(String key, String data) async {
    _storage[key] = data;
  }
  
  @override
  Future<String?> load(String key) async {
    return _storage[key];
  }
  
  @override
  Future<void> delete(String key) async {
    _storage.remove(key);
  }
}