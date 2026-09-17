import 'dart:collection';

/// A simple LRU (Least Recently Used) cache implementation
class LRUCache<K, V> {
  final int _capacity;
  final LinkedHashMap<K, V> _cache = LinkedHashMap<K, V>();
  
  /// Creates a new LRU cache with the given capacity
  LRUCache(this._capacity) {
    if (_capacity <= 0) {
      throw ArgumentError('Capacity must be positive');
    }
  }
  
  /// Gets a value from the cache
  /// Returns null if the key is not in the cache
  V? get(K key) {
    if (!_cache.containsKey(key)) {
      return null;
    }
    
    // Move the accessed key to the end (most recently used)
    final value = _cache.remove(key);
    _cache[key] = value as V;
    return value;
  }
  
  /// Puts a value in the cache
  /// If the cache is full, removes the least recently used item
  void put(K key, V value) {
    if (_cache.containsKey(key)) {
      // Remove the key to update its position
      _cache.remove(key);
    } else if (_cache.length >= _capacity) {
      // Remove the first (least recently used) item
      _cache.remove(_cache.keys.first);
    }
    
    _cache[key] = value;
  }
  
  /// Removes a key from the cache
  void remove(K key) {
    _cache.remove(key);
  }
  
  /// Clears the cache
  void clear() {
    _cache.clear();
  }
  
  /// Returns the number of items in the cache
  int get length => _cache.length;
  
  /// Returns true if the cache contains the key
  bool containsKey(K key) => _cache.containsKey(key);
  
  /// Returns all keys in the cache
  Iterable<K> get keys => _cache.keys;
  
  /// Returns all values in the cache
  Iterable<V> get values => _cache.values;
  
  /// Returns all entries in the cache
  Iterable<MapEntry<K, V>> get entries => _cache.entries;
}