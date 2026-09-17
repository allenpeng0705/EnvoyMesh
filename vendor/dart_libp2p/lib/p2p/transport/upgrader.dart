import 'dart:async';
import 'package:dart_libp2p/core/peer/peer_id.dart';

import '../../core/multiaddr.dart';
import '../../core/network/transport_conn.dart';
import '../../core/network/conn.dart'; // For returning the final Conn
import '../../config/config.dart'; // To access security and muxer configurations

// UpgradeProtocol might still be useful for representing choices,
// but BasicUpgrader won't manage a list of them directly for its own negotiation.
// It will derive them from Config.
// For now, let's keep it if it's used by other parts, or remove if truly unused later.
/// Represents a protocol that can be negotiated during connection upgrade
class UpgradeProtocol {
  /// The protocol identifier (e.g., '/noise', '/tls/1.0.0', '/yamux/1.0.0')
  final String id;

  /// The priority of this protocol (higher numbers = higher priority)
  final int priority;

  const UpgradeProtocol({
    required this.id,
    this.priority = 0,
  });

  @override
  String toString() => id;
}


/// Handles the full upgrade of connections to a secure and multiplexed state.
abstract class Upgrader {
  /// Upgrades an outbound connection.
  ///
  /// This method orchestrates the entire upgrade process:
  /// 1. Negotiates and applies a security protocol.
  /// 2. Negotiates and applies a stream multiplexer over the secured connection.
  ///
  /// Returns a fully upgraded [Conn] ready for use by the swarm.
  ///
  /// Parameters:
  /// - [connection]: The raw [TransportConn] to upgrade.
  /// - [remotePeerId]: The [PeerId] of the remote peer (if known, for outbound).
  /// - [config]: The node's [Config] containing security and muxer options.
  /// - [remoteAddr]: The remote peer's [MultiAddr].
  Future<Conn> upgradeOutbound({
    required TransportConn connection,
    required PeerId remotePeerId, // For security handshake context
    required Config config,
    required MultiAddr remoteAddr, // For context, though underlying conn has it
  });

  /// Upgrades an inbound connection.
  ///
  /// This method orchestrates the entire upgrade process for an incoming connection:
  /// 1. Negotiates and applies a security protocol.
  /// 2. Negotiates and applies a stream multiplexer over the secured connection.
  ///
  /// Returns a fully upgraded [Conn] ready for use by the swarm.
  ///
  /// Parameters:
  /// - [connection]: The raw [TransportConn] to upgrade.
  /// - [config]: The node's [Config] containing security and muxer options.
  Future<Conn> upgradeInbound({
    required TransportConn connection,
    required Config config,
  });
}
