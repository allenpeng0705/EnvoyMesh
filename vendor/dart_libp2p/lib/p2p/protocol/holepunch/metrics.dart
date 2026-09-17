/// Metrics for the holepunch protocol.

import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/p2p/protocol/holepunch/holepuncher.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/conn.dart';


/// Metrics tracer for the holepunch protocol
class MetricsTracer implements HolePunchTracer {
  /// Number of successful direct dials
  int _directDialSuccessCount = 0;

  /// Number of failed direct dials
  int _directDialFailCount = 0;

  /// Number of protocol errors
  int _protocolErrorCount = 0;

  /// Number of hole punch attempts
  int _holePunchAttemptCount = 0;

  /// Number of successful hole punches
  int _holePunchSuccessCount = 0;

  /// Number of failed hole punches
  int _holePunchFailCount = 0;

  /// Creates a new metrics tracer
  MetricsTracer();

  /// Gets the number of successful direct dials
  int get directDialSuccessCount => _directDialSuccessCount;

  /// Gets the number of failed direct dials
  int get directDialFailCount => _directDialFailCount;

  /// Gets the number of protocol errors
  int get protocolErrorCount => _protocolErrorCount;

  /// Gets the number of hole punch attempts
  int get holePunchAttemptCount => _holePunchAttemptCount;

  /// Gets the number of successful hole punches
  int get holePunchSuccessCount => _holePunchSuccessCount;

  /// Gets the number of failed hole punches
  int get holePunchFailCount => _holePunchFailCount;

  @override
  void directDialSuccessful(PeerId peerId, Duration dt) {
    _directDialSuccessCount++;
  }

  @override
  void directDialFailed(PeerId peerId, Duration dt, Object err) {
    _directDialFailCount++;
  }

  @override
  void protocolError(PeerId peerId, Object err) {
    _protocolErrorCount++;
  }

  @override
  void startHolePunch(PeerId peerId, List<MultiAddr> addrs, int rtt) {
    // No metrics to collect here
  }

  @override
  void holePunchAttempt(PeerId peerId) {
    _holePunchAttemptCount++;
  }

  @override
  void endHolePunch(PeerId peerId, Duration dt, Object? err) {
    if (err == null) {
      _holePunchSuccessCount++;
    } else {
      _holePunchFailCount++;
    }
  }

  @override
  void holePunchFinished(String side, int attempts, List<MultiAddr> addrs, List<MultiAddr> obsAddrs, Conn? conn) {
    // No metrics to collect here
  }

  @override
  void close() {
    // No resources to clean up
  }

}