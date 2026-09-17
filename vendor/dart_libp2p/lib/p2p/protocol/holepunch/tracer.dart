/// Tracer implementation for the holepunch protocol.

import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/p2p/protocol/holepunch/holepuncher.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:logging/logging.dart';


/// Logger for the tracer
final _log = Logger('p2p-holepunch-tracer');

/// Basic tracer implementation for the holepunch protocol
class BasicHolePunchTracer implements HolePunchTracer {
  /// Whether the tracer is enabled
  bool _enabled = true;

  /// Creates a new basic tracer
  BasicHolePunchTracer();

  /// Starts the tracer
  void start() {
    _enabled = true;
  }

  /// Closes the tracer
  @override
  void close() {
    _enabled = false;
  }

  @override
  void directDialSuccessful(PeerId peerId, Duration dt) {
    if (!_enabled) return;
    _log.fine('Direct dial to $peerId successful in ${dt.inMilliseconds}ms');
  }

  @override
  void directDialFailed(PeerId peerId, Duration dt, Object err) {
    if (!_enabled) return;
    _log.fine('Direct dial to $peerId failed in ${dt.inMilliseconds}ms: $err');
  }

  @override
  void protocolError(PeerId peerId, Object err) {
    if (!_enabled) return;
    _log.fine('Protocol error with $peerId: $err');
  }

  @override
  void startHolePunch(PeerId peerId, List<MultiAddr> addrs, int rtt) {
    if (!_enabled) return;
    _log.fine('Starting hole punch with $peerId, RTT: ${rtt}ms, addresses: $addrs');
  }

  @override
  void holePunchAttempt(PeerId peerId) {
    if (!_enabled) return;
    _log.fine('Attempting hole punch with $peerId');
  }

  @override
  void endHolePunch(PeerId peerId, Duration dt, Object? err) {
    if (!_enabled) return;
    if (err == null) {
      _log.fine('Hole punch with $peerId successful in ${dt.inMilliseconds}ms');
    } else {
      _log.fine('Hole punch with $peerId failed in ${dt.inMilliseconds}ms: $err');
    }
  }

  @override
  void holePunchFinished(String side, int attempts, List<MultiAddr> addrs, List<MultiAddr> obsAddrs, Conn? conn) {
    if (!_enabled) return;
    final connStr = conn != null ? 'successful' : 'failed';
    _log.fine('Hole punch finished ($side) after $attempts attempts, $connStr, addresses: $addrs, observed addresses: $obsAddrs');
  }
}