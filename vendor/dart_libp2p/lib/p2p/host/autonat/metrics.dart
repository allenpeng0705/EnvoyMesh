import 'dart:async';
import 'package:dart_libp2p/core/network/network.dart' show Reachability; // For Reachability enum
import './pb/autonat.pb.dart' as pb; // For pb.Message_ResponseStatus

abstract class MetricsTracer {
  void reachabilityStatus(Reachability status);
  void reachabilityStatusConfidence(int confidence);
  void receivedDialResponse(pb.Message_ResponseStatus status);
  void outgoingDialResponse(pb.Message_ResponseStatus status);
  void outgoingDialRefused(String reason); // Corresponds to Go's OutgoingDialRefused
  void nextProbeTime(DateTime t); // Corresponds to Go's NextProbeTime
}

// Reasons for dial refusal, from Go's metrics.go
const String dialRefusedReasonRateLimited = "rate limited";
const String dialRefusedReasonDialBlocked = "dial blocked";
const String dialRefusedReasonNoValidAddress = "no valid address";

class NoOpMetricsTracer implements MetricsTracer {
  @override
  void reachabilityStatus(Reachability status) {}

  @override
  void reachabilityStatusConfidence(int confidence) {}

  @override
  void receivedDialResponse(pb.Message_ResponseStatus status) {}

  @override
  void outgoingDialResponse(pb.Message_ResponseStatus status) {}

  @override
  void outgoingDialRefused(String reason) {}

  @override
  void nextProbeTime(DateTime t) {}
}
