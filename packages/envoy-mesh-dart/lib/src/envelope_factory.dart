/// Build unsigned EMP envelopes for phone social-lite (bond + chat).
library;

import 'envoy_identity.dart';

String _newMessageId() =>
    'msg-${DateTime.now().toUtc().microsecondsSinceEpoch}';

String _nowIso() => DateTime.now().toUtc().toIso8601String();

/// Human→human unsigned envelope skeleton.
Map<String, Object?> buildUnsignedEnvelope({
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
    'senderRole': 'human',
    if (recipientPeerId != null) 'recipientPeerId': recipientPeerId,
    'recipientRole': 'human',
    'intent': intent,
    'payload': payload,
  };
}

Map<String, Object?> buildBondRequestPayload({
  required String requesterOwnerId,
  String? requesterDisplayName,
  required String message,
  String requestedLevel = 'direct',
}) {
  return {
    'requesterOwnerId': requesterOwnerId,
    if (requesterDisplayName != null && requesterDisplayName.isNotEmpty)
      'requesterDisplayName': requesterDisplayName,
    'message': message.startsWith('[HELLO]') ? message : '[HELLO] $message',
    'proofOfContext': requesterDisplayName != null
        ? 'displayName:$requesterDisplayName'
        : 'phone-social-lite',
    'requestedLevel': requestedLevel,
  };
}

Map<String, Object?> buildBondAcceptPayload({
  required String responderOwnerId,
  required String requesterOwnerId,
  String? message,
}) {
  return {
    'responderOwnerId': responderOwnerId,
    'requesterOwnerId': requesterOwnerId,
    if (message != null) 'message': message,
  };
}

Map<String, Object?> buildChatMessagePayload({
  required String senderOwnerId,
  required String text,
}) {
  return {
    'senderOwnerId': senderOwnerId,
    'text': text,
  };
}

Map<String, Object?> buildChatDeliveredPayload({
  required String messageId,
  required String recipientOwnerId,
  String? deliveredAt,
}) {
  return {
    'messageId': messageId,
    'recipientOwnerId': recipientOwnerId,
    'deliveredAt': deliveredAt ?? DateTime.now().toUtc().toIso8601String(),
  };
}
