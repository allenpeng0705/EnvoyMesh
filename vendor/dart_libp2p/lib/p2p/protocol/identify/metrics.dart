/// Metrics for the identify service.
///
/// This file contains the interface and implementation for collecting metrics
/// from the identify service.
///
/// This is a port of the Go implementation from go-libp2p/p2p/protocol/identify/metrics.go
/// to Dart, using native Dart idioms.

import 'package:dart_libp2p/core/network/network.dart';

import '../../../core/event/addrs.dart';
import '../../../core/event/protocol.dart';

/// The support status for the identify push protocol.
enum IdentifyPushSupport {
  /// The peer's support for identify push is unknown.
  unknown,
  
  /// The peer supports identify push.
  supported,
  
  /// The peer does not support identify push.
  unsupported,
}

/// MetricsTracer is an interface for collecting metrics from the identify service.
abstract class MetricsTracer {
  /// TriggeredPushes counts IdentifyPushes triggered by event.
  void triggeredPushes(dynamic event);
  
  /// ConnPushSupport counts peers by Push Support.
  void connPushSupport(IdentifyPushSupport support);
  
  /// IdentifyReceived tracks metrics on receiving an identify response.
  void identifyReceived(bool isPush, int numProtocols, int numAddrs);
  
  /// IdentifySent tracks metrics on sending an identify response.
  void identifySent(bool isPush, int numProtocols, int numAddrs);
}

/// A no-op implementation of MetricsTracer that doesn't collect any metrics.
class NoopMetricsTracer implements MetricsTracer {
  /// Creates a new no-op metrics tracer.
  const NoopMetricsTracer();
  
  @override
  void triggeredPushes(dynamic event) {}
  
  @override
  void connPushSupport(IdentifyPushSupport support) {}
  
  @override
  void identifyReceived(bool isPush, int numProtocols, int numAddrs) {}
  
  @override
  void identifySent(bool isPush, int numProtocols, int numAddrs) {}
}

/// A simple metrics tracer that logs metrics to the console.
class LoggingMetricsTracer implements MetricsTracer {
  /// Creates a new logging metrics tracer.
  const LoggingMetricsTracer();
  
  @override
  void triggeredPushes(dynamic event) {
    String type = 'unknown';
    if (event is EvtLocalProtocolsUpdated) {
      type = 'protocols_updated';
    } else if (event is EvtLocalAddressesUpdated) {
      type = 'addresses_updated';
    }
  }
  
  @override
  void connPushSupport(IdentifyPushSupport support) {
  }
  
  @override
  void identifyReceived(bool isPush, int numProtocols, int numAddrs) {
    final direction = isPush ? 'inbound' : 'outbound';
    final type = isPush ? 'push' : 'identify';
  }
  
  @override
  void identifySent(bool isPush, int numProtocols, int numAddrs) {
    final direction = isPush ? 'outbound' : 'inbound';
    final type = isPush ? 'push' : 'identify';
  }
}
