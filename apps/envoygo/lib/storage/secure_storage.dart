import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Wrapper around flutter_secure_storage for session token persistence.
///
/// On iOS: Keychain. On Android: EncryptedSharedPreferences.
/// On web: falls back to an in-memory store (not persisted across sessions).
class SecureStorage {
  static SecureStorage? _instance;

  factory SecureStorage() {
    _instance ??= SecureStorage._();
    return _instance!;
  }

  SecureStorage._();

  /// Test-only factory that returns a fresh, non-singleton instance.
  /// Use from widget/unit tests to avoid cross-test pollution of the
  /// singleton's storage backend.
  @visibleForTesting
  factory SecureStorage.test() = SecureStorage._;

  FlutterSecureStorage? _storage;

  FlutterSecureStorage get _ensureStorage {
    if (_storage != null) return _storage!;
    if (kIsWeb) {
      // flutter_secure_storage on web uses an in-memory fallback.
      _storage = const FlutterSecureStorage();
    } else {
      _storage = const FlutterSecureStorage(
        aOptions: AndroidOptions(encryptedSharedPreferences: true),
        iOptions: IOSOptions(
          accessibility: KeychainAccessibility.first_unlock_this_device,
        ),
      );
    }
    return _storage!;
  }

  /// Save a session token for a node.
  Future<void> saveSessionToken(String nodeId, String token) async {
    try {
      await _ensureStorage.write(
          key: 'node.$nodeId.sessionToken', value: token);
    } catch (_) {
      // Storage failed — token won't persist, but pairing continues.
    }
  }

  /// Get a session token for a node.
  Future<String?> getSessionToken(String nodeId) async {
    try {
      return _ensureStorage.read(key: 'node.$nodeId.sessionToken');
    } catch (_) {
      return null;
    }
  }

  /// Delete a session token for a node.
  Future<void> deleteSessionToken(String nodeId) async {
    await _ensureStorage.delete(key: 'node.$nodeId.sessionToken');
  }

  /// Save the active node ID.
  Future<void> saveActiveNodeId(String nodeId) async {
    await _ensureStorage.write(key: 'activeNodeId', value: nodeId);
  }

  /// Get the active node ID.
  Future<String?> getActiveNodeId() async {
    return _ensureStorage.read(key: 'activeNodeId');
  }

  /// Clear all stored data.
  Future<void> clear() async {
    await _ensureStorage.deleteAll();
  }
}
