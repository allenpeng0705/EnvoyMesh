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
    final relayWsUrl =
        parsed.queryParameters['relayWsUrl']?.trim() ?? wsUrl;

    return PairingData(
      token: token,
      wsUrl: wsUrl,
      relayWsUrl: relayWsUrl,
      lanWsUrl: parsed.queryParameters['lanWsUrl']?.trim(),
      ownerId: parsed.queryParameters['ownerId']?.trim(),
      homeNodePeerId: parsed.queryParameters['homeNodePeerId']?.trim(),
      agentPeerId: parsed.queryParameters['agentPeerId']?.trim(),
      agentName: parsed.queryParameters['agentName']?.trim(),
      relayPeerId: parsed.queryParameters['relayPeerId']?.trim(),
      ownerPublicKey: parsed.queryParameters['ownerPublicKey']?.trim(),
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
