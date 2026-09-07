/// Persist / load the phone-local Envoy owner + device identities.
///
/// Separate from `libp2p_identity_seed` (transport PeerId) and from home
/// pair session tokens. Used only for **On this phone** social-lite.
library;

import 'envoy_identity.dart';

typedef PhoneKvRead = Future<String?> Function(String key);
typedef PhoneKvWrite = Future<void> Function(String key, String value);
typedef PhoneKvDelete = Future<void> Function(String key);

/// Loaded phone persona (Envoy layer — not libp2p).
class PhonePersona {
  const PhonePersona({
    required this.owner,
    required this.device,
  });

  final EnvoyOwnerIdentity owner;
  final EnvoyDeviceIdentity device;

  String get ownerId => owner.ownerId;
  String get devicePeerId => device.peerId;
}

/// SecureStorage (or in-memory) persistence for phone owner/device PEMs.
class PhoneIdentityStore {
  PhoneIdentityStore({
    required PhoneKvRead read,
    required PhoneKvWrite write,
    PhoneKvDelete? delete,
  })  : _read = read,
        _write = write,
        _delete = delete ?? ((_) async {});

  /// In-memory store for unit tests.
  factory PhoneIdentityStore.memory([Map<String, String>? backing]) {
    final map = backing ?? <String, String>{};
    return PhoneIdentityStore(
      read: (key) async {
        final v = map[key];
        if (v == null || v.isEmpty) return null;
        return v;
      },
      write: (key, value) async {
        map[key] = value;
      },
      delete: (key) async {
        map.remove(key);
      },
    );
  }

  static const ownerPublicKey = 'phone_owner_public_pem';
  static const ownerPrivateKey = 'phone_owner_private_pem';
  static const devicePublicKey = 'phone_device_public_pem';
  static const devicePrivateKey = 'phone_device_private_pem';

  final PhoneKvRead _read;
  final PhoneKvWrite _write;
  final PhoneKvDelete _delete;

  /// Returns existing persona or creates + persists a new one.
  Future<PhonePersona> loadOrCreate() async {
    final existing = await load();
    if (existing != null) return existing;
    return create();
  }

  /// Load persisted persona, or null if missing/corrupt.
  Future<PhonePersona?> load() async {
    final ownerPub = await _read(ownerPublicKey);
    final ownerPriv = await _read(ownerPrivateKey);
    final devicePub = await _read(devicePublicKey);
    final devicePriv = await _read(devicePrivateKey);
    if (ownerPub == null ||
        ownerPriv == null ||
        devicePub == null ||
        devicePriv == null) {
      return null;
    }
    if (ownerPub.isEmpty ||
        ownerPriv.isEmpty ||
        devicePub.isEmpty ||
        devicePriv.isEmpty) {
      return null;
    }
    try {
      final owner = EnvoyOwnerIdentity(
        ownerId: deriveOwnerId(ownerPub),
        publicKeyPem: ownerPub,
        privateKeyPem: ownerPriv,
      );
      final device = EnvoyDeviceIdentity(
        deviceId: deriveDeviceId(devicePub),
        peerId: derivePeerId(devicePub),
        publicKeyPem: devicePub,
        privateKeyPem: devicePriv,
      );
      // Sanity: derived ids must match PEM material.
      if (owner.ownerId != deriveOwnerId(ownerPub)) return null;
      if (device.peerId != derivePeerId(devicePub)) return null;
      return PhonePersona(owner: owner, device: device);
    } catch (_) {
      return null;
    }
  }

  /// Generate new owner + device keys and persist (overwrites).
  Future<PhonePersona> create() async {
    final owner = generateOwnerIdentity();
    final device = generateDeviceIdentity();
    await _persist(owner, device);
    return PhonePersona(owner: owner, device: device);
  }

  /// Wipe phone persona keys (does not touch libp2p seed or home sessions).
  Future<void> clear() async {
    await _delete(ownerPublicKey);
    await _delete(ownerPrivateKey);
    await _delete(devicePublicKey);
    await _delete(devicePrivateKey);
  }

  Future<void> _persist(
    EnvoyOwnerIdentity owner,
    EnvoyDeviceIdentity device,
  ) async {
    await _write(ownerPublicKey, owner.publicKeyPem);
    await _write(ownerPrivateKey, owner.privateKeyPem);
    await _write(devicePublicKey, device.publicKeyPem);
    await _write(devicePrivateKey, device.privateKeyPem);
  }
}
