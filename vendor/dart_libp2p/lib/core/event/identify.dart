/// Identify-related events for libp2p.
///
/// This is a port of the Go implementation from go-libp2p/core/event/identify.go
/// to Dart, using native Dart idioms.

import 'package:dart_libp2p/core/peer/peer_id.dart';

import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/protocol/protocol.dart';

/// EvtPeerIdentificationCompleted is emitted when the initial identification round for a peer is completed.
class EvtPeerIdentificationCompleted {
  /// Peer is the ID of the peer whose identification succeeded.
  final PeerId peer;

  /// Conn is the connection we identified.
  final Conn conn;

  /// ListenAddrs is the list of addresses the peer is listening on.
  final List<MultiAddr> listenAddrs;

  /// Protocols is the list of protocols the peer advertised on this connection.
  final List<ProtocolID> protocols;

  /// SignedPeerRecord is the provided signed peer record of the peer. May be null.
  /// 
  /// Note: In the Dart implementation, we're using a dynamic type for now as the record.Envelope
  /// type is not yet defined. This should be updated when the record package is implemented.
  final dynamic signedPeerRecord;

  /// AgentVersion is like a UserAgent string in browsers, or client version in
  /// bittorrent includes the client name and client.
  final String agentVersion;

  /// ProtocolVersion is the protocolVersion field in the identify message
  final String protocolVersion;

  /// ObservedAddr is the our side's connection address as observed by the
  /// peer. This is not verified, the peer could return anything here.
  final MultiAddr? observedAddr;


  @override
  String toString() {
    return "EvtPeerIdentificationCompleted";
  }

  /// Creates a new EvtPeerIdentificationCompleted event.
  EvtPeerIdentificationCompleted({
    required this.peer,
    required this.conn,
    required this.listenAddrs,
    required this.protocols,
    this.signedPeerRecord,
    required this.agentVersion,
    required this.protocolVersion,
    this.observedAddr,
  });
}

/// EvtPeerIdentificationFailed is emitted when the initial identification round for a peer failed.
class EvtPeerIdentificationFailed {
  /// Peer is the ID of the peer whose identification failed.
  final PeerId peer;
  
  /// Reason is the reason why identification failed.
  final Exception reason;


  @override
  String toString() {
    return "EvtPeerIdentificationFailed";
  }

  /// Creates a new EvtPeerIdentificationFailed event.
  EvtPeerIdentificationFailed({
    required this.peer,
    required this.reason,
  });
}
