import 'node_service_client.dart';

/// QR code pairing service.
///
/// Parses `envoy://pair?...` URIs from the home node and calls
/// `pairThinClient` RPC. The home node format uses these parameters:
///
/// Required:
///   wsUrl       — relay WebSocket URL
///   token       — short-lived pairing token
///   ownerPublicKey — owner's Ed25519 public key (PEM)
///   ownerId     — owner DID (envoy:owner:...)
///
/// Optional:
///   lanWsUrl       — LAN WebSocket URL
///   relayPeerId    — relay's libp2p peer ID
///   agentPeerId    — bridge agent peer ID
///   agentPubKey    — bridge agent public key (PEM)
///   agentName      — bridge agent display name
///   homeNodePeerId — home node libp2p peer ID
class PairingService {
  final NodeServiceClient _client;

  PairingService(this._client);

  /// Parse a pairing URI from the home node.
  ///
  /// Handles the format from `parseEnvoyPairUri` in the TypeScript codebase.
  /// Empty values for optional parameters are normalized to `null` so
  /// downstream code can treat absent and empty identically.
  static PairingData? parsePairingUri(String uri) {
    if (!uri.startsWith('envoy://pair')) return null;

    final parsed = Uri.tryParse(uri);
    if (parsed == null) return null;

    final token = parsed.queryParameters['token']?.trim();
    final wsUrl = parsed.queryParameters['wsUrl']?.trim();

    // token and wsUrl are required for pairing.
    if (token == null || token.isEmpty) return null;
    if (wsUrl == null || wsUrl.isEmpty) return null;

    // Prefer relayWsUrl (clean URL from QR) over wsUrl (has ?target=.&token=.).
    // relayWsUrl is the relay WebSocket endpoint without routing params.
    final relayWsUrl = _nullableTrim(parsed.queryParameters['relayWsUrl']) ?? wsUrl;

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
    );
  }

  /// Complete the pairing handshake with the home node.
  Future<PairResult> pair(PairingData data, String deviceName) async {
    final result = await _client.pairWithHomeNode(
      data.token,
      deviceName,
      'flutter',
    );
    return PairResult(
      sessionToken: result['sessionToken'] as String,
      ownerId: result['ownerId'] as String,
    );
  }

  /// Trim a query value, returning `null` for missing or empty-after-trim
  /// entries. Lets callers treat `?foo=` the same as `?foo` or no `foo` at all.
  static String? _nullableTrim(String? raw) {
    if (raw == null) return null;
    final trimmed = raw.trim();
    return trimmed.isEmpty ? null : trimmed;
  }
}

/// Parsed pairing URI data from the home node.
class PairingData {
  /// Short-lived pairing token.
  final String token;

  /// Relay WebSocket URL (required, has ?target=...&token=...).
  final String wsUrl;

  /// Clean relay WebSocket URL without routing params (preferred).
  final String relayWsUrl;

  /// LAN WebSocket URL (optional, direct LAN access).
  final String? lanWsUrl;

  /// Owner ID from the home node (envoy:owner:...).
  final String? ownerId;

  /// Home node's libp2p peer ID.
  final String? homeNodePeerId;

  /// Bridge agent peer ID.
  final String? agentPeerId;

  /// Bridge agent display name.
  final String? agentName;

  /// Relay libp2p peer ID.
  final String? relayPeerId;

  /// Owner's Ed25519 public key (PEM).
  final String? ownerPublicKey;

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
  });
}

/// Result of a successful pairing.
class PairResult {
  final String sessionToken;
  final String ownerId;

  const PairResult({
    required this.sessionToken,
    required this.ownerId,
  });
}
