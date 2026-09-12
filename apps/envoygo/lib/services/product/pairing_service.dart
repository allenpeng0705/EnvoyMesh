import 'package:envoy_thin_client/services/pairing_uri.dart' as pairing;

import '../../connection/home_pairing.dart';
import '../../storage/secure_storage.dart';
import 'node_service_client.dart';

export 'package:envoy_thin_client/services/pairing_uri.dart'
    show PairingData;

// `PairResult` moved to the connection layer (Workstream A5): the connection
// layer's `NodeNotifier.pairWithNode` returns it and may not import a product
// module. Re-exported here so existing importers keep working.
export '../../connection/home_pairing.dart' show PairResult;

/// QR code pairing service.
///
/// Parses `envoy://pair?...` (owner QR) and `envoy://invite?...` (family /
/// company invite) URIs from the home node and calls the `pairThinClient` RPC.
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
///
/// Product-bound: the handshake binds a profile and returns the bindable
/// profile list, so it is reached from the connection layer through
/// `HomeConnectionHooks.pairHome` rather than imported by it.
class PairingService {
  final NodeServiceClient _client;
  final SecureStorage _secureStorage;

  PairingService(this._client, {SecureStorage? secureStorage})
      : _secureStorage = secureStorage ?? SecureStorage();

  /// Parse a pairing or invite URI from the home node.
  static pairing.PairingData? parsePairingUri(String uri) =>
      pairing.parsePairingUri(uri);

  /// Stable client device UUID (≥8 chars) for session token upserts.
  /// Delegates to the connection layer, which owns this plumbing.
  Future<String> getOrCreateDeviceId() => getOrCreateClientDeviceId(_secureStorage);

  /// Complete the pairing handshake with the home node.
  Future<PairResult> pair({
    required String pairingToken,
    required String deviceName,
    required String deviceId,
    String? profileId,
    String? profileName,
    String? profileAvatarColor,
  }) async {
    final result = await _client.pairWithHomeNode(
      pairingToken: pairingToken,
      deviceName: deviceName,
      platform: 'flutter',
      deviceId: deviceId,
      profileId: profileId,
      profileName: profileName,
      profileAvatarColor: profileAvatarColor,
    );
    return PairResult.fromRpc(result);
  }
}
