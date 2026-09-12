/// Live [MeshEnvelopeTransport] over shared [Libp2pNode] streams.
library;

import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dart_libp2p/dart_libp2p.dart';
import 'package:envoy_mesh/envoy_mesh.dart';
import 'package:envoy_mesh/envoy_mesh_social.dart';
import 'dart:developer' as developer;

import 'libp2p_node.dart';

void _log(String message) => developer.log(message, name: 'Libp2pMeshEnvelopeTransport');

/// UTF-8 JSON envelope bytes — matches `packages/network` encodeEnvelope.
class Libp2pMeshEnvelopeTransport implements MeshEnvelopeTransport {
  Libp2pMeshEnvelopeTransport(this._node);

  final Libp2pNode _node;

  static const _dialTimeout = Duration(seconds: 12);
  static const _replyTimeout = Duration(seconds: 12);

  @override
  Future<MeshSendResult> sendEnvelope({
    required String dialTarget,
    required String protocolId,
    required Map<String, Object?> envelope,
    bool expectReply = false,
  }) async {
    if (!_node.isStarted) {
      return const MeshSendResult(ok: false, error: 'libp2p not started');
    }
    Libp2pStreamTransport? transport;
    try {
      transport = await _node
          .dial(
            peerMultiaddr: dialTarget,
            protocolId: protocolId,
          )
          .timeout(_dialTimeout);
      final bytes = Uint8List.fromList(utf8.encode(jsonEncode(envelope)));
      await transport.rawStream.write(bytes).timeout(_replyTimeout);
      if (!expectReply) {
        return const MeshSendResult(ok: true);
      }
      final replyBytes =
          await transport.rawStream.read().timeout(_replyTimeout);
      if (replyBytes.isEmpty) {
        return const MeshSendResult(ok: false, error: 'empty reply');
      }
      final decoded = jsonDecode(utf8.decode(replyBytes.toList()));
      if (decoded is! Map) {
        return const MeshSendResult(ok: false, error: 'invalid reply JSON');
      }
      return MeshSendResult(
        ok: true,
        replyEnvelope: Map<String, Object?>.from(decoded),
      );
    } catch (e) {
      _log('[Libp2pMeshEnvelopeTransport] send failed: $e');
      return MeshSendResult(ok: false, error: e.toString());
    } finally {
      try {
        transport?.close();
      } catch (_) {}
    }
  }
}

/// Read one inbound envelope from [stream], dispatch to [backend], write ACK.
Future<void> handleInboundPhoneMeshStream({
  required P2PStream stream,
  required PeerId remotePeer,
  required String protocolId,
  required PhoneSocialBackend backend,
}) async {
  try {
    final data = await stream.read();
    if (data.isEmpty) return;
    final decoded = jsonDecode(utf8.decode(data.toList()));
    if (decoded is! Map) return;
    final envelope = Map<String, Object?>.from(decoded);
    final reply = await backend.handleInboundEnvelope(
      protocolId: protocolId,
      envelope: envelope,
      remoteLibp2pPeerId: remotePeer.toString(),
    );
    if (reply != null) {
      await stream.write(Uint8List.fromList(utf8.encode(jsonEncode(reply))));
    }
  } catch (e) {
    _log('[handleInboundPhoneMeshStream] $e');
  } finally {
    try {
      await stream.close();
    } catch (_) {}
  }
}
