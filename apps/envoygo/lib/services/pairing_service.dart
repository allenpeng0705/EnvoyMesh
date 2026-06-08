import 'node_service_client.dart';

/// QR code pairing service.
///
/// Parses `envoy://pair?...` URIs, calls `pairThinClient` RPC,
/// and returns session credentials.
class PairingService {
  final NodeServiceClient _client;

  PairingService(this._client);

  /// Parse a pairing URI into structured data.
  ///
  /// Expected format:
  /// `envoy://pair?token=<pairingToken>&peerId=<peerId>&wsPort=3030&relayWsUrl=<url>&name=<name>&lanIp=<ip>`
  static PairingData? parsePairingUri(String uri) {
    if (!uri.startsWith('envoy://pair')) return null;

    final parsed = Uri.tryParse(uri);
    if (parsed == null) return null;

    final token = parsed.queryParameters['token'];
    final peerId = parsed.queryParameters['peerId'];
    if (token == null || peerId == null) return null;

    return PairingData(
      token: token,
      peerId: peerId,
      wsPort: int.tryParse(parsed.queryParameters['wsPort'] ?? '') ?? 3030,
      relayWsUrl: parsed.queryParameters['relayWsUrl'],
      name: parsed.queryParameters['name'],
      lanIp: parsed.queryParameters['lanIp'],
    );
  }

  /// Complete the pairing handshake with the home node.
  ///
  /// Calls the `pairThinClient` RPC with the pairing token, device name,
  /// and platform identifier. Returns session credentials.
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

/// Parsed pairing URI data.
class PairingData {
  final String token;
  final String peerId;
  final int wsPort;
  final String? relayWsUrl;
  final String? name;
  final String? lanIp;

  const PairingData({
    required this.token,
    required this.peerId,
    this.wsPort = 3030,
    this.relayWsUrl,
    this.name,
    this.lanIp,
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
