/// Relay control envelopes (`relay.checkin` / `relay.lookup`) — system role.
library;

import 'envoy_envelope.dart';
import 'envoy_identity.dart';

String _newMessageId() =>
    'msg-${DateTime.now().toUtc().microsecondsSinceEpoch}';

String _nowIso() => DateTime.now().toUtc().toIso8601String();

String expiresAtFromNow(Duration ttl) =>
    DateTime.now().toUtc().add(ttl).toIso8601String();

/// System→system unsigned envelope (relay control plane).
Map<String, Object?> buildUnsignedSystemEnvelope({
  required EnvoyDeviceIdentity device,
  required String intent,
  required Object? payload,
  String? recipientPeerId,
  String? messageId,
  String? correlationId,
  String? createdAt,
}) {
  return {
    'version': '0.1',
    'messageId': messageId ?? _newMessageId(),
    if (correlationId != null) 'correlationId': correlationId,
    'createdAt': createdAt ?? _nowIso(),
    'senderPeerId': device.peerId,
    'senderPublicKey': device.publicKeyPem,
    'senderRole': 'system',
    if (recipientPeerId != null) 'recipientPeerId': recipientPeerId,
    'recipientRole': 'system',
    'intent': intent,
    'payload': payload,
  };
}

/// Build `relay.checkin` payload (protocol schema parity).
Map<String, Object?> buildRelayCheckinPayload({
  required String peerId,
  String? ownerId,
  String? displayName,
  List<String> relayReachableAddrs = const [],
  List<String> capabilities = const ['mesh.discovery'],
  List<Map<String, Object?>> advertisements = const [],
  List<Map<String, Object?>> relayHints = const [],
  required String expiresAt,
}) {
  return {
    'peerId': peerId,
    if (ownerId != null && ownerId.isNotEmpty) 'ownerId': ownerId,
    if (displayName != null && displayName.isNotEmpty)
      'displayName': displayName,
    'relayReachableAddrs': relayReachableAddrs,
    'capabilities': capabilities,
    'advertisements': advertisements,
    'relayHints': relayHints,
    'expiresAt': expiresAt,
  };
}

/// Topic-hash advertisements for public discoverability.
List<Map<String, Object?>> topicHashAdvertisements({
  required List<String> topicHashes,
  required String expiresAt,
  String visibility = 'public',
}) {
  return [
    for (final hash in topicHashes)
      if (hash.isNotEmpty)
        {
          'topicHash': hash,
          'visibility': visibility,
          'expiresAt': expiresAt,
        },
  ];
}

/// Build `relay.lookup` payload.
Map<String, Object?> buildRelayLookupPayload({
  required String queryId,
  String? topicHash,
  String? capability,
  String? targetPeerId,
  String? targetOwnerId,
  int maxResults = 20,
  int maxHops = 1,
  int maxFanout = 2,
  String visibilityScope = 'public',
  required String expiresAt,
}) {
  return {
    'queryId': queryId,
    if (topicHash != null && topicHash.isNotEmpty) 'topicHash': topicHash,
    if (capability != null && capability.isNotEmpty) 'capability': capability,
    if (targetPeerId != null && targetPeerId.isNotEmpty)
      'targetPeerId': targetPeerId,
    if (targetOwnerId != null && targetOwnerId.isNotEmpty)
      'targetOwnerId': targetOwnerId,
    'maxResults': maxResults,
    'maxHops': maxHops,
    'maxFanout': maxFanout,
    'visibilityScope': visibilityScope,
    'expiresAt': expiresAt,
  };
}

/// Parse peers from a `relay.lookup` response envelope payload.
List<Map<String, dynamic>> parseRelayLookupPeers(Object? payload) {
  if (payload is! Map) return const [];
  final peers = payload['peers'];
  if (peers is! List) return const [];
  return [
    for (final p in peers)
      if (p is Map) Map<String, dynamic>.from(p),
  ];
}

/// Placeholder used by community relays for unsigned control replies.
/// Must match `RENDEZVOUS_RESPONSE_PLACEHOLDER_*` in `@envoymesh/protocol`.
const String relayControlResponsePlaceholder =
    'relay:rendezvous-response/unsigned-placeholder';

/// Accept a dialed-relay `relay.lookup.response` (placeholder or signed).
///
/// Placeholder replies are only accepted when [dialedTrustedRelay] is true
/// (caller dialed a known bootstrap relay multiaddr).
bool isAcceptableRelayLookupResponse(
  Map<String, Object?> envelope, {
  required bool dialedTrustedRelay,
}) {
  if (envelope['intent'] != 'relay.lookup.response') return false;
  final sig = envelope['signature'];
  final pub = envelope['senderPublicKey'];
  if (sig == relayControlResponsePlaceholder &&
      pub == relayControlResponsePlaceholder) {
    return dialedTrustedRelay;
  }
  return verifyEnvoyEnvelope(envelope);
}
