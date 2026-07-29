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

  /// Separate storage instance for the device identity key. Uses iCloud
  /// Keychain sync (synchronizable: true) so the device keypair survives
  /// app uninstall+reinstall — preventing duplicate "Authorized Devices"
  /// entries when the same phone re-pairs after reinstall.
  FlutterSecureStorage? _syncedStorage;

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

  /// Storage that syncs via iCloud Keychain (survives uninstall+reinstall).
  /// Used for the device identity key only — session tokens stay device-local
  /// for security (they're short-lived and shouldn't sync across devices).
  FlutterSecureStorage get _ensureSyncedStorage {
    if (_syncedStorage != null) return _syncedStorage!;
    if (kIsWeb) {
      _syncedStorage = const FlutterSecureStorage();
    } else {
      _syncedStorage = const FlutterSecureStorage(
        aOptions: AndroidOptions(encryptedSharedPreferences: true),
        iOptions: IOSOptions(
          accessibility: KeychainAccessibility.first_unlock,
          synchronizable: true,
        ),
      );
    }
    return _syncedStorage!;
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
      return await _ensureStorage.read(key: 'node.$nodeId.sessionToken');
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

  /// Clear all stored data (does NOT clear synced identity keys).
  Future<void> clear() async {
    await _ensureStorage.deleteAll();
  }

  /// Read a raw string value by key.
  Future<String?> read(String key) async {
    try {
      return await _ensureStorage.read(key: key);
    } catch (_) {
      return null;
    }
  }

  /// Write a raw string value under a key.
  Future<void> write(String key, String value) async {
    await _ensureStorage.write(key: key, value: value);
  }

  // ---- iCloud-synced storage (survives uninstall+reinstall) ----

  /// Read a synced value (device identity key). Survives uninstall.
  Future<String?> readSynced(String key) async {
    try {
      return await _ensureSyncedStorage.read(key: key);
    } catch (_) {
      return null;
    }
  }

  /// Write a synced value (device identity key). Survives uninstall.
  Future<void> writeSynced(String key, String value) async {
    try {
      await _ensureSyncedStorage.write(key: key, value: value);
    } catch (_) {
      // Best-effort — falls back to non-synced if iCloud is unavailable.
      await _ensureStorage.write(key: key, value: value);
    }
  }
}
