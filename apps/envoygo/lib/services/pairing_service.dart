import 'dart:math';

import 'package:envoy_thin_client/services/pairing_uri.dart' as pairing;
import 'node_service_client.dart';
import '../storage/secure_storage.dart';

export 'package:envoy_thin_client/services/pairing_uri.dart'
    show PairingData;

/// QR code pairing service.
///
/// Parses `envoy://pair?...` (owner QR) and `envoy://invite?...` (family /
/// company invite) URIs from the home node and calls `pairThinClient` RPC.
///
/// Two pair URI formats are supported:
///
/// 1. **Compressed token format** (preferred, used by Social app >= Phase 12):
///    `envoy://pair?pairing=<base64url-gzip-json>`
///
/// 2. **Legacy query-param format**:
///    `envoy://pair?wsUrl=...&token=...&ownerId=...&...`
///
/// Family invites use `envoy://invite?token=...&wsUrl=...` (Phase 51).
class PairingService {
  final NodeServiceClient _client;
  final SecureStorage _secureStorage;

  PairingService(this._client, {SecureStorage? secureStorage})
      : _secureStorage = secureStorage ?? SecureStorage();

  /// Parse a pairing or invite URI from the home node.
  static pairing.PairingData? parsePairingUri(String uri) =>
      pairing.parsePairingUri(uri);

  /// Stable client device UUID (≥8 chars) for session token upserts.
  Future<String> getOrCreateDeviceId() async {
    const key = 'envoygo.thinClientDeviceId';
    final existing = await _secureStorage.readSynced(key);
    if (existing != null && existing.trim().length >= 8) {
      return existing.trim();
    }
    final id = _generateUuidV4();
    await _secureStorage.writeSynced(key, id);
    return id;
  }

  static String _generateUuidV4() {
    final rng = Random.secure();
    final bytes = List<int>.generate(16, (_) => rng.nextInt(256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    String hex(int b) => b.toRadixString(16).padLeft(2, '0');
    final h = bytes.map(hex).join();
    return '${h.substring(0, 8)}-${h.substring(8, 12)}-'
        '${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}';
  }

  /// Complete the pairing handshake with the home node.
  Future<PairResult> pair(
    pairing.PairingData data,
    String deviceName, {
    String? profileId,
    String? profileName,
    String? profileAvatarColor,
  }) async {
    final deviceId = await getOrCreateDeviceId();
    final result = await _client.pairWithHomeNode(
      pairingToken: data.token,
      deviceName: deviceName,
      platform: 'flutter',
      deviceId: deviceId,
      profileId: profileId,
      profileName: profileName,
      profileAvatarColor: profileAvatarColor,
    );
    final familyRaw = result['familyProfiles'];
    final boundProfileId = result['profileId'] as String? ?? 'owner';
    final isOwnerExplicit = result['isOwnerProfile'] as bool?;
    final isOwnerProfile = isOwnerExplicit ??
        (boundProfileId.trim().isEmpty || boundProfileId.trim() == 'owner');
    return PairResult(
      sessionToken: result['sessionToken'] as String,
      ownerId: result['ownerId'] as String,
      profileId: boundProfileId,
      isOwnerProfile: isOwnerProfile,
      familyProfiles: familyRaw is List
          ? familyRaw
              .whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList()
          : const [],
    );
  }
}

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
}
