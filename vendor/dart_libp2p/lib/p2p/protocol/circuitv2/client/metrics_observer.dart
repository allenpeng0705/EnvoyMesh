import 'package:dart_libp2p/core/peer/peer_id.dart';

/// Observer interface for Circuit Relay v2 client metrics
/// 
/// This optional callback interface allows external metrics collectors
/// to observe relay events for monitoring and performance analysis.
abstract class RelayMetricsObserver {
  /// Called when a relay reservation is requested
  void onReservationRequested(PeerId relayPeer, DateTime timestamp, {String? sessionId});

  /// Called when a relay reservation is completed
  void onReservationCompleted(
    PeerId relayPeer,
    DateTime requestTime,
    DateTime completeTime,
    Duration duration,
    bool success,
    String? error, {
    String? sessionId,
  });

  /// Called when a relay dial is initiated
  void onRelayDialStarted(PeerId relayPeer, PeerId destPeer, DateTime timestamp, {String? sessionId});

  /// Called when a relay dial is completed
  void onRelayDialCompleted(
    PeerId relayPeer,
    PeerId destPeer,
    DateTime startTime,
    DateTime completeTime,
    Duration duration,
    bool success,
    String? error, {
    String? sessionId,
  });

  /// Called when an incoming relay connection is accepted (receiver side)
  /// 
  /// This is the counterpart to onRelayDialCompleted - it fires on the peer
  /// that receives the relayed connection, not the peer that initiates it.
  void onIncomingRelayConnection(
    PeerId sourcePeer,
    PeerId relayPeer,
    DateTime timestamp, {
    String? sessionId,
  });
}

