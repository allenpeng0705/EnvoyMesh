import 'dart:convert';
import 'dart:math';

import 'package:archive/archive.dart';
import 'node_service_client.dart';
import '../storage/secure_storage.dart';

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
  static PairingData? parsePairingUri(String uri) {
    final trimmed = uri.trim();
    if (trimmed.isEmpty) return null;

    // Lenient paste: bare `invite?token=...` (Social paste box style).
    final normalized = trimmed.startsWith('invite?')
        ? 'envoy://$trimmed'
        : trimmed;

    final parsed = Uri.tryParse(normalized);
    if (parsed == null) return null;

    final host = parsed.host.toLowerCase();
    final isInvite = host == 'invite' ||
        normalized.startsWith('envoy://invite');

    if (!isInvite && !normalized.startsWith('envoy://pair')) {
      return null;
    }

    if (!isInvite) {
      // Try compressed token format first.
      final compressedToken = parsed.queryParameters['pairing']?.trim();
      if (compressedToken != null && compressedToken.isNotEmpty) {
        try {
          final decoded = _decodePairingToken(compressedToken);
          if (decoded != null) return decoded;
        } catch (_) {
          // Fall through to legacy parsing.
        }
      }
    }

    return _parseLegacyPairingUri(parsed, isInviteUri: isInvite);
  }

  // ─── Compressed token decoding ─────────────────────────────────────────────

  static PairingData? _decodePairingToken(String token) {
    if (token.isEmpty) return null;

    final trimmed = token.trim();
    final decompressed = _gzipDecompress(trimmed);
    if (decompressed == null) return null;

    String json;
    try {
      json = utf8.decode(decompressed);
    } catch (_) {
      return null;
    }

    Map<String, dynamic> obj;
    try {
      obj = jsonDecode(json) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }

    final v = obj['v'];
    if (v != 1) return null;

    final ws = obj['ws'] as String?;
    final tok = obj['tok'] as String?;
    final oid = obj['oid'] as String?;

    if (ws == null || ws.isEmpty) return null;
    if (tok == null || tok.isEmpty) return null;
    if (oid == null || oid.isEmpty) return null;

    final relayWsUrl = obj['rel'] as String?;
    final lanWsUrl = obj['lan'] as String?;
    final homeNodePeerId = obj['tid'] as String?;
    final agentPeerId = obj['apid'] as String?;
    final agentName = obj['aname'] as String?;
    final bpnRaw = obj['bpn'];
    final relsRaw = obj['rels'];

    List<String>? bootstrapPresetNames;
    if (bpnRaw is List) {
      final filtered = bpnRaw
          .whereType<String>()
          .where((s) => s.isNotEmpty)
          .toList();
      bootstrapPresetNames = filtered.isEmpty ? null : filtered;
    }

    List<String>? relayWsUrls;
    if (relsRaw is List) {
      final primaryBase = _stripRelayQuery(relayWsUrl);
      final seen = <String>{if (primaryBase != null) primaryBase};
      final extras = <String>[];
      for (final raw in relsRaw.whereType<String>()) {
        final base = _stripRelayQuery(raw);
        if (base == null || base.isEmpty || seen.contains(base)) continue;
        seen.add(base);
        extras.add(base);
        if (extras.length >= 8) break;
      }
      relayWsUrls = extras.isEmpty ? null : extras;
    }

    final bootstrapPeers = relayWsUrls;

    return PairingData(
      token: tok,
      wsUrl: ws,
      relayWsUrl: relayWsUrl?.isNotEmpty == true ? relayWsUrl! : ws,
      lanWsUrl: lanWsUrl?.isNotEmpty == true ? lanWsUrl : null,
      ownerId: oid,
      homeNodePeerId: homeNodePeerId?.isNotEmpty == true ? homeNodePeerId : null,
      agentPeerId: agentPeerId?.isNotEmpty == true ? agentPeerId : null,
      agentName: agentName?.isNotEmpty == true ? agentName : null,
      bootstrapPeers: bootstrapPeers,
      bootstrapPresetNames: bootstrapPresetNames,
      relayWsUrls: relayWsUrls,
      isInviteUri: false,
    );
  }

  static String? _stripRelayQuery(String? url) {
    if (url == null) return null;
    final trimmed = url.trim();
    if (trimmed.isEmpty) return null;
    final q = trimmed.indexOf('?');
    return q >= 0 ? trimmed.substring(0, q) : trimmed;
  }

  static List<int>? _gzipDecompress(String base64url) {
    try {
      String base64 = base64url.replaceAll('-', '+').replaceAll('_', '/');
      while (base64.length % 4 != 0) {
        base64 += '=';
      }
      final bytes = base64Decode(base64);
      final archive = GZipDecoder().decodeBytes(bytes);
      return archive;
    } catch (_) {
      return null;
    }
  }

  // ─── Legacy / invite query-param decoding ─────────────────────────────────

  static PairingData? _parseLegacyPairingUri(
    Uri parsed, {
    required bool isInviteUri,
  }) {
    final token = parsed.queryParameters['token']?.trim();
    final wsUrl = parsed.queryParameters['wsUrl']?.trim();

    if (token == null || token.isEmpty) return null;
    if (wsUrl == null || wsUrl.isEmpty) return null;

    final relayWsUrl =
        _nullableTrim(parsed.queryParameters['relayWsUrl']) ?? wsUrl;

    return PairingData(
      token: token,
      wsUrl: wsUrl,
      relayWsUrl: relayWsUrl,
      lanWsUrl: _nullableTrim(parsed.queryParameters['lanWsUrl']),
      ownerId: _nullableTrim(parsed.queryParameters['ownerId']),
      homeNodePeerId: _nullableTrim(parsed.queryParameters['homeNodePeerId']),
      agentPeerId: _nullableTrim(parsed.queryParameters['agentPeerId']),
      agentName: _nullableTrim(parsed.queryParameters['agentName']),
      relayPeerId: _nullableTrim(parsed.queryParameters['relayPeerId']),
      ownerPublicKey: _nullableTrim(parsed.queryParameters['ownerPublicKey']),
      bootstrapPeers:
          _parseBootstrapPeers(parsed.queryParameters['bootstrapPeers']),
      bootstrapPresetNames: _parseBootstrapPresetNames(
          parsed.queryParameters['bootstrapPresetNames']),
      inviteId: _nullableTrim(parsed.queryParameters['inviteId']),
      profileId: _nullableTrim(parsed.queryParameters['profileId']),
      isInviteUri: isInviteUri,
    );
  }

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
    PairingData data,
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

  static String? _nullableTrim(String? raw) {
    if (raw == null) return null;
    final trimmed = raw.trim();
    return trimmed.isEmpty ? null : trimmed;
  }

  static List<String>? _parseBootstrapPeers(String? raw) {
    if (raw == null || raw.isEmpty) return null;
    final trimmed = raw.trim();
    if (trimmed.isEmpty) return null;
    return trimmed
        .split(',')
        .map((s) => s.trim())
        .where((s) => s.isNotEmpty)
        .toList();
  }

  static List<String>? _parseBootstrapPresetNames(String? raw) {
    if (raw == null || raw.isEmpty) return null;
    final trimmed = raw.trim();
    if (trimmed.isEmpty) return null;
    return trimmed
        .split(',')
        .map((s) => s.trim())
        .where((s) => s.isNotEmpty)
        .toList();
  }
}

/// Parsed pairing / invite URI data from the home node.
class PairingData {
  final String token;
  final String wsUrl;
  final String relayWsUrl;
  final String? lanWsUrl;
  final String? ownerId;
  final String? homeNodePeerId;
  final String? agentPeerId;
  final String? agentName;
  final String? relayPeerId;
  final String? ownerPublicKey;
  final List<String>? bootstrapPeers;
  final List<String>? bootstrapPresetNames;
  final List<String>? relayWsUrls;

  /// True when URI was `envoy://invite` (family / company invite).
  final bool isInviteUri;

  /// Optional invite id from the URI (audit / UI).
  final String? inviteId;

  /// Optional pre-selected family profile id (targeted invite / re-pair).
  final String? profileId;

  const PairingData({
    required this.token,
    required this.wsUrl,
    required this.relayWsUrl,
    this.lanWsUrl,
    this.ownerId,
    this.homeNodePeerId,
    this.agentPeerId,
    this.agentName,
    this.relayPeerId,
    this.ownerPublicKey,
    this.bootstrapPeers,
    this.bootstrapPresetNames,
    this.relayWsUrls,
    this.isInviteUri = false,
    this.inviteId,
    this.profileId,
  });
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
