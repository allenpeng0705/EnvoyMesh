/// Pairing results and the client device id — the connection layer's half of
/// the pairing flow.
///
/// `PairResult` used to live in `lib/services/product/pairing_service.dart`.
/// The connection layer's `pairWithNode` returns it, so it had to move to a
/// module the connection layer may import. `pairing_service.dart` re-exports it
/// so existing importers keep working.
///
/// The *handshake itself* (`pairThinClient`, which binds a profile and returns
/// the profile list) is a product-plane RPC and stays in the product layer,
/// reached through `HomeConnectionHooks.pairHome` (Workstream A5).
library;

import 'dart:math';

import '../storage/secure_storage.dart';

/// Result of a successful pairing.
class PairResult {
  final String sessionToken;
  final String ownerId;
  final String profileId;
  final bool isOwnerProfile;
  final List<Map<String, dynamic>> familyProfiles;

  const PairResult({
    required this.sessionToken,
    required this.ownerId,
    this.profileId = 'owner',
    this.isOwnerProfile = true,
    this.familyProfiles = const [],
  });

  /// Build from a raw `pairThinClient` result map.
  factory PairResult.fromRpc(Map<String, dynamic> result) {
    final familyRaw = result['familyProfiles'];
    final boundProfileId = result['profileId'] as String? ?? 'owner';
    final isOwnerExplicit = result['isOwnerProfile'] as bool?;
    return PairResult(
      sessionToken: result['sessionToken'] as String,
      ownerId: result['ownerId'] as String,
      profileId: boundProfileId,
      isOwnerProfile: isOwnerExplicit ??
          (boundProfileId.trim().isEmpty || boundProfileId.trim() == 'owner'),
      familyProfiles: familyRaw is List
          ? familyRaw
              .whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList()
          : const [],
    );
  }
}

/// Stable client device UUID (≥8 chars) used as the thin-client device id in
/// session-token upserts.
///
/// Reusable: it names no product concept, so the connection layer owns it and
/// the product layer borrows it through `NodeNotifier.clientDeviceId()`.
Future<String> getOrCreateClientDeviceId(SecureStorage storage) async {
  const key = 'envoygo.thinClientDeviceId';
  final existing = await storage.readSynced(key);
  if (existing != null && existing.trim().length >= 8) {
    return existing.trim();
  }
  final id = _generateUuidV4();
  await storage.writeSynced(key, id);
  return id;
}

String _generateUuidV4() {
  final rng = Random.secure();
  final bytes = List<int>.generate(16, (_) => rng.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  String hex(int b) => b.toRadixString(16).padLeft(2, '0');
  final h = bytes.map(hex).join();
  return '${h.substring(0, 8)}-${h.substring(8, 12)}-'
      '${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}';
}
