/// Phone-mesh social session on the shared [Libp2pNode].
library;

import 'package:dart_libp2p/dart_libp2p.dart';
import 'package:envoy_mesh/envoy_mesh.dart';
import 'dart:developer' as developer;

import 'libp2p_node.dart';

void _log(String message) => developer.log(message, name: 'PhoneMeshSession');

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
  int? _boundEpoch;
  String? _reservedRelayPeerId;
  PhoneMeshStreamHandler? _handler;

  /// True when enabled and still bound to the current host epoch.
  bool get isActive =>
      _active && _boundEpoch != null && _boundEpoch == _node.hostEpoch;

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
    _boundEpoch = _node.hostEpoch;

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
        _log('[PhoneMeshSession] relay reserve failed: $e');
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
      _log('[PhoneMeshSession] release reservation failed: $e');
    }
    _reservedRelayPeerId = null;
    _boundEpoch = null;
    _active = false;
  }
}
