/// Dial + stream I/O for signed Envoy envelopes (test seam over Libp2pNode).
library;

/// Result of sending an envelope on a mesh protocol stream.
class MeshSendResult {
  const MeshSendResult({
    required this.ok,
    this.replyEnvelope,
    this.error,
  });

  final bool ok;
  final Map<String, Object?>? replyEnvelope;
  final String? error;
}

/// Abstraction so [PhoneSocialBackend] can be tested without dart_libp2p.
abstract class MeshEnvelopeTransport {
  /// Open [protocolId] to [dialTarget] (multiaddr or `/p2p/<id>`), write
  /// [envelope] JSON, optionally read one reply envelope.
  Future<MeshSendResult> sendEnvelope({
    required String dialTarget,
    required String protocolId,
    required Map<String, Object?> envelope,
    bool expectReply = false,
  });
}

/// In-memory fake: records outbound sends; optional scripted replies.
class FakeMeshEnvelopeTransport implements MeshEnvelopeTransport {
  final List<Map<String, Object?>> sent = [];

  /// If set, invoked to build a reply for expectReply sends.
  MeshSendResult Function(
    String dialTarget,
    String protocolId,
    Map<String, Object?> envelope,
  )? onSend;

  @override
  Future<MeshSendResult> sendEnvelope({
    required String dialTarget,
    required String protocolId,
    required Map<String, Object?> envelope,
    bool expectReply = false,
  }) async {
    sent.add({
      'dialTarget': dialTarget,
      'protocolId': protocolId,
      'expectReply': expectReply,
      'envelope': envelope,
    });
    if (onSend != null) {
      return onSend!(dialTarget, protocolId, envelope);
    }
    if (expectReply) {
      return const MeshSendResult(
        ok: true,
        replyEnvelope: {
          'intent': 'chat.delivered',
          'payload': {'messageId': 'ack'},
        },
      );
    }
    return const MeshSendResult(ok: true);
  }
}
