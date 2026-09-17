import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/network/network.dart';

/// Notifiee is an interface for an object wishing to receive
/// notifications from a Network.
abstract class Notifiee {
  /// Called when network starts listening on an addr
  void listen(Network network, MultiAddr addr);
  
  /// Called when network stops listening on an addr
  void listenClose(Network network, MultiAddr addr);
  
  /// Called when a connection opened
  /// [dialLatency] is provided for outbound connections when timing is available
  Future<void> connected(Network network, Conn conn, {Duration? dialLatency});
  
  /// Called when a connection closed
  Future<void> disconnected(Network network, Conn conn);
}

/// NotifyBundle implements Notifiee by calling any of the functions set on it,
/// and nop'ing if they are unset. This is the easy way to register for
/// notifications.
class NotifyBundle implements Notifiee {
  /// Function called when network starts listening on an addr
  final void Function(Network, MultiAddr)? listenF;
  
  /// Function called when network stops listening on an addr
  final void Function(Network, MultiAddr)? listenCloseF;
  
  /// Function called when a connection opened (with optional dial latency)
  final void Function(Network, Conn, {Duration? dialLatency})? connectedF;
  
  /// Function called when a connection closed
  final void Function(Network, Conn)? disconnectedF;
  
  /// Creates a new NotifyBundle with the given functions
  const NotifyBundle({
    this.listenF,
    this.listenCloseF,
    this.connectedF,
    this.disconnectedF,
  });
  
  @override
  void listen(Network network, MultiAddr addr) {
    if (listenF != null) {
      listenF!(network, addr);
    }
  }
  
  @override
  void listenClose(Network network, MultiAddr addr) {
    if (listenCloseF != null) {
      listenCloseF!(network, addr);
    }
  }
  
  @override
  Future<void> connected(Network network, Conn conn, {Duration? dialLatency}) async {
    if (connectedF != null) {
      connectedF!(network, conn, dialLatency: dialLatency);
    }
  }
  
  @override
  Future<void> disconnected(Network network, Conn conn) async {
    if (disconnectedF != null) {
      disconnectedF!(network, conn);
    }
  }
}

/// Global noop notifiee. Do not change.
final NoopNotifiee globalNoopNotifiee = NoopNotifiee();

/// NoopNotifiee is a no-op implementation of Notifiee
class NoopNotifiee implements Notifiee {
  @override
  Future<void> connected(Network network, Conn conn, {Duration? dialLatency}) async {
    return await Future.delayed(Duration(milliseconds: 10));
  }
  
  @override
  Future<void> disconnected(Network network, Conn conn) async {

    return await Future.delayed(Duration(milliseconds: 10));
  }
  
  @override
  void listen(Network network, MultiAddr addr) {}
  
  @override
  void listenClose(Network network, MultiAddr addr) {}
}