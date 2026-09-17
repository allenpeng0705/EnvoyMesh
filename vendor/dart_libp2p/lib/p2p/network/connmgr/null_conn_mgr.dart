import 'dart:async';

import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/p2p/transport/connection_state.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/network/network.dart';
import 'package:dart_libp2p/core/network/notifiee.dart';
import 'package:dart_libp2p/core/network/transport_conn.dart';

import 'package:dart_libp2p/core/connmgr/conn_manager.dart';

/// A no-op implementation of Notifiee that does nothing.
class NoopNotifiee implements Notifiee {
  const NoopNotifiee();


  @override
  void listen(Network network, MultiAddr addr) { }

  @override
  void listenClose(Network network, MultiAddr addr) { }

  @override
  Future<void> connected(Network network, Conn conn, {Duration? dialLatency}) async {

    return await Future.delayed(Duration(milliseconds: 10));
  }

  @override
  Future<void> disconnected(Network network, Conn conn) async {
    return await Future.delayed(Duration(milliseconds: 10));
  }
}

/// NullConnMgr is a ConnManager that provides no functionality.
class NullConnMgr implements ConnManager {
  /// The singleton instance of NoopNotifiee
  static const _noopNotifiee = NoopNotifiee();

  const NullConnMgr();

  @override
  void tagPeer(PeerId peerId, String tag, int value) {}

  @override
  void untagPeer(PeerId peerId, String tag) {}

  @override
  void upsertTag(PeerId peerId, String tag, int Function(int) upsert) {}

  @override
  TagInfo? getTagInfo(PeerId peerId) => TagInfo();

  @override
  Future<void> trimOpenConns() async {}

  @override
  Notifiee get notifiee => _noopNotifiee;

  @override
  void protect(PeerId peerId, String tag) {}

  @override
  bool unprotect(PeerId peerId, String tag) => false;

  @override
  bool isProtected(PeerId peerId, String tag) => false;

  @override
  String? checkLimit(GetConnLimiter limiter) => null;

  @override
  Future<void> close() async {}

  @override
  Future<void> dispose() {
    return Future.delayed(Duration(milliseconds: 10));
  }

  @override
  ConnectionState? getState(TransportConn conn) {
  }

  @override
  void recordActivity(TransportConn tcpConnection) {
  }

  @override
  void registerConnection(TransportConn conn) {
  }

  @override
  void updateState(TransportConn conn, ConnectionState state, {required Object? error}) {
  }

  @override
  Future<void> closeConnection(TransportConn conn) {
    return Future.delayed(Duration(milliseconds: 10));
  }

  @override
  Stream<ConnectionStateChange>? getStateStream(TransportConn conn) {
    return null;
  }
}