/// Protocol-related events for libp2p.
///
/// This is a port of the Go implementation from go-libp2p/core/event/protocol.go
/// to Dart, using native Dart idioms.

import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/protocol/protocol.dart';

/// EvtPeerProtocolsUpdated should be emitted when a peer we're connected to adds or removes protocols from their stack.
class EvtPeerProtocolsUpdated {
  /// Peer is the peer whose protocols were updated.
  final PeerId peer;
  
  /// Added enumerates the protocols that were added by this peer.
  final List<ProtocolID> added;
  
  /// Removed enumerates the protocols that were removed by this peer.
  final List<ProtocolID> removed;


  @override
  String toString() {
    return "EvtPeerProtocolsUpdated";
  }

  /// Creates a new EvtPeerProtocolsUpdated event.
  EvtPeerProtocolsUpdated({
    required this.peer,
    required this.added,
    required this.removed,
  });
}

/// EvtLocalProtocolsUpdated should be emitted when stream handlers are attached or detached from the local host.
/// For handlers attached with a matcher predicate (host.setStreamHandlerMatch()), only the protocol ID will be
/// included in this event.
class EvtLocalProtocolsUpdated {
  /// Added enumerates the protocols that were added locally.
  final List<ProtocolID> added;
  
  /// Removed enumerates the protocols that were removed locally.
  final List<ProtocolID> removed;

  @override
  String toString() {
    return "EvtLocalProtocolsUpdated";
  }

  /// Creates a new EvtLocalProtocolsUpdated event.
  EvtLocalProtocolsUpdated({
    required this.added,
    required this.removed,
  });
}