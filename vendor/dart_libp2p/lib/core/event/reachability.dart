import '../network/network.dart';

/// Reachability-related events for libp2p.
///
/// This is a port of the Go implementation from go-libp2p/core/event/reachability.go
/// to Dart, using native Dart idioms.

// /// Reachability indicates how reachable a node is.
// enum Reachability {
//   /// Unknown indicates that the node doesn't know if it's reachable or not.
//   unknown,
//
//   /// Public indicates that the node is reachable from the public internet.
//   public,
//
//   /// Private indicates that the node is not reachable from the public internet.
//   private,
// }

/// EvtLocalReachabilityChanged is an event struct to be emitted when the local's
/// node reachability changes state.
///
/// This event is usually emitted by the AutoNAT subsystem.
class EvtLocalReachabilityChanged {
  /// The new reachability state.
  final Reachability reachability;

  @override
  String toString() {
    return "EvtLocalReachabilityChanged";
  }

  /// Creates a new EvtLocalReachabilityChanged event.
  EvtLocalReachabilityChanged({
    required this.reachability,
  });
}