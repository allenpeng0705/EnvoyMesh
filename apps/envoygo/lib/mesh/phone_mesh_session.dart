/// Phone-mesh social session on the shared [Libp2pNode].
library;

import 'package:dart_libp2p/dart_libp2p.dart';
import 'package:envoy_mesh/envoy_mesh.dart';
import 'package:flutter/foundation.dart';

import '../services/libp2p_node.dart';

/// Inbound stream callback for social-lite protocols.
typedef PhoneMeshStreamHandler = Future<void> Function(
  P2PStream stream,
  PeerId remotePeer,
  String protocolId,
);

/// Controls mesh listen-handlers + relay reservation lifecycle.
class PhoneMeshSession {
  PhoneMeshSession(this._node);

  final Libp2pMeshHost _node;

  bool _active = false;
  String? _reservedRelayPeerId;
  PhoneMeshStreamHandler? _handler;

  bool get isActive => _active;
  String? get reservedRelayPeerId => _reservedRelayPeerId;

  static const List<String> socialProtocols = [
    envoyMessageProtocol,
    envoyChatProtocol,
  ];

  Future<void> enable({
    required PhoneMeshStreamHandler onStream,
    String relayMultiaddr = defaultEnvoyCommunityRelayBootstrapAddr,
    bool reserveRelay = true,
  }) async {
    if (!_node.isStarted) {
      throw StateError('Libp2pNode must be started before enabling phone mesh');
    }
    _handler = onStream;

    for (final protocol in socialProtocols) {
      _node.registerStreamHandler(protocol, (stream, remotePeer) async {
        final h = _handler;
        if (h == null) return;
        await h(stream, remotePeer, protocol);
      });
    }

    if (reserveRelay) {
      try {
        await _node.reserveRelay(relayMultiaddr);
        _reservedRelayPeerId = peerIdFromBootstrapMultiaddr(relayMultiaddr);
      } catch (e) {
        debugPrint('[PhoneMeshSession] relay reserve failed: $e');
      }
    }

    _active = true;
  }

  Future<void> disable() async {
    for (final protocol in socialProtocols) {
      _node.removeStreamHandler(protocol);
    }
    _handler = null;
    try {
      await _node.releaseRelayReservation();
    } catch (e) {
      debugPrint('[PhoneMeshSession] release reservation failed: $e');
    }
    _reservedRelayPeerId = null;
    _active = false;
  }
}
