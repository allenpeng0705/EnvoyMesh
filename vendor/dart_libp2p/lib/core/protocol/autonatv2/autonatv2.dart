import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/p2p/protocol/autonatv2/pb/autonatv2.pb.dart';
import 'package:dart_libp2p/core/network/network.dart';

import '../../multiaddr.dart';

/// Protocol names for AutoNAT v2
class AutoNATv2Protocols {
  static const String serviceName = 'libp2p.autonatv2';
  static const String dialBackProtocol = '/libp2p/autonat/2/dial-back';
  static const String dialProtocol = '/libp2p/autonat/2/dial-request';
}

/// Request to verify reachability of a single address
class Request {
  /// The multiaddr to verify
  final MultiAddr addr;

  /// Whether to send dial data if the server requests it for Addr
  final bool sendDialData;

  Request({required this.addr, this.sendDialData = false});
}

/// Result of the CheckReachability call
class Result {
  /// The dialed address
  final MultiAddr addr;

  /// Reachability of the dialed address
  final Reachability reachability;

  /// Status is the outcome of the dialback
  final int status;

  Result({required this.addr, required this.reachability, required this.status});
}

/// Interface for the AutoNAT v2 service
abstract class AutoNATv2 {
  /// Start the AutoNAT v2 service
  Future<void> start();

  /// Close the AutoNAT v2 service
  Future<void> close();

  /// Whether there are peers available that support AutoNAT v2
  bool get hasPeers;

  /// Check reachability for the given addresses
  Future<Result> getReachability(List<Request> requests);
}

/// Interface for the AutoNAT v2 client
abstract class AutoNATv2Client {
  /// Start the client
  void start();

  /// Close the client
  void close();

  /// Check reachability for the given addresses with a specific peer
  Future<Result> getReachability(PeerId peerId, List<Request> requests);
}

/// Interface for the AutoNAT v2 server
abstract class AutoNATv2Server {
  /// Start the server
  void start();

  /// Close the server
  void close();
}

/// Event for dial request completion
class EventDialRequestCompleted {
  final Exception? error;
  final DialResponse_ResponseStatus responseStatus;
  final DialStatus dialStatus;
  final bool dialDataRequired;
  final MultiAddr? dialedAddr;

  EventDialRequestCompleted({
    this.error,
    required this.responseStatus,
    required this.dialStatus,
    required this.dialDataRequired,
    this.dialedAddr,
  });
}

/// Interface for metrics tracing
abstract class MetricsTracer {
  /// Record a completed request
  void completedRequest(EventDialRequestCompleted event);
}