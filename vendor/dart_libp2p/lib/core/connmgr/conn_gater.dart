import 'package:dart_libp2p/core/peer/peer_id.dart';

import '../network/conn.dart';
import '../multiaddr.dart';

/// Represents a reason for disconnecting from a peer.
/// This is used to communicate the intention behind a Conn closure.
class DisconnectReason {
  /// A unique identifier for this disconnect reason
  final int code;

  /// A human-readable message explaining the reason for disConn
  final String message;

  const DisconnectReason({
    required this.code,
    required this.message,
  });
}

/// ConnGater can be implemented by a type that supports active
/// inbound or outbound Conn gating.
///
/// ConnGaters are active, whereas ConnManagers tend to be passive.
///
/// A ConnGater will be consulted during different states in the lifecycle
/// of a Conn being established/upgraded. Specific functions will be called
/// throughout the process, to allow you to intercept the Conn at that stage.
///
/// This interface can be used to implement *strict/active* Conn management
/// policies, such as hard limiting of Conns once a maximum count has been
/// reached, maintaining a peer blacklist, or limiting Conns by transport
/// quotas.
abstract class ConnGater {
  /// Tests whether we're permitted to Dial the specified peer.
  ///
  /// This is called by the network implementation when dialling a peer.
  bool interceptPeerDial(PeerId peerId);

  /// Tests whether we're permitted to dial the specified
  /// multiaddr for the given peer.
  ///
  /// This is called by the network implementation after it has
  /// resolved the peer's addrs, and prior to dialling each.
  bool interceptAddrDial(PeerId peerId, MultiAddr addr);

  /// Tests whether an incipient inbound Conn is allowed.
  ///
  /// This is called by the upgrader, or by the transport directly,
  /// straight after it has accepted a Conn from its socket.
  bool interceptAccept(Conn conn);

  /// Tests whether a given Conn, now authenticated,
  /// is allowed.
  ///
  /// This is called by the upgrader, after it has performed the security
  /// handshake, and before it negotiates the muxer, or by the directly by the
  /// transport, at the exact same checkpoint.
  bool interceptSecured(bool isInitiator, PeerId peerId, Conn conn);

  /// Tests whether a fully capable Conn is allowed.
  ///
  /// At this point, the Conn a multiplexer has been selected.
  /// When rejecting a Conn, the gater can return a DisconnectReason.
  (bool, DisconnectReason?) interceptUpgraded(Conn conn);
}

/// A no-op implementation of ConnGater that allows all Conns.
class NoopConnGater implements ConnGater {
  const NoopConnGater();

  @override
  bool interceptPeerDial(PeerId peerId) => true;

  @override
  bool interceptAddrDial(PeerId peerId, MultiAddr addr) => true;

  @override
  bool interceptAccept(Conn conn) => true;

  @override
  bool interceptSecured(bool isInitiator, PeerId peerId, Conn conn) => true;

  @override
  (bool, DisconnectReason?) interceptUpgraded(Conn conn) => (true, null);
}