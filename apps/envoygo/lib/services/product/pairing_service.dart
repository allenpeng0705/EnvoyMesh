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

  /// Why this code belongs to another app, or `null` when it is ours.
  ///
  /// A pairing code names the app that minted it, and this phone belongs to
  /// `EnvoyMesh` — so a code from EnvoyDev's desktop app must be refused **here**,
  /// before anything is dialled. Nobody else can: the token inside the code is opaque
  /// and app-local, so the desktop node only ever sees its own, and the outcome without
  /// this check is a phone that quietly pairs with the wrong product's desktop app.
  ///
  /// The sentence comes from the shared contract so every family client says the same
  /// thing. (Localising it means adding an ARB key for the template; the values are
  /// already the two product names.)
  static String? appMismatch(pairing.PairingData data) =>
      pairing.pairingAppMismatch(data.app, pairing.kDefaultAppName);

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
