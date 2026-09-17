import 'dart:async';

import 'package:dart_libp2p/core/network/notifiee.dart';
import 'package:dart_libp2p/core/network/transport_conn.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/p2p/transport/connection_state.dart';
import 'package:dart_libp2p/p2p/transport/tcp_connection.dart';


/// Package connmgr provides connection tracking and management interfaces for libp2p.
///
/// The ConnManager interface allows libp2p to enforce an upper bound on the total
/// number of open connections. To avoid service disruptions, connections can be
/// tagged with metadata and optionally "protected" to ensure that essential
/// connections are not arbitrarily cut.

/// Stores metadata associated with a peer.
class TagInfo {
  /// When the peer was first seen
  final DateTime firstSeen;

  /// The current value of the peer
  final int value;

  /// Maps tag ids to their numerical values
  final Map<String, int> tags;

  /// Maps connection ids (such as remote multiaddr) to their creation time
  final Map<String, DateTime> conns;

  TagInfo({
    DateTime? firstSeen,
    this.value = 0,
    Map<String, int>? tags,
    Map<String, DateTime>? conns,
  })  : firstSeen = firstSeen ?? DateTime.now(),
        tags = tags ?? {},
        conns = conns ?? {};
}

/// Provides access to a component's total connection limit.
abstract class GetConnLimiter {
  /// Returns the total connection limit of the implementing component.
  int getConnLimit();
}

/// ConnManager tracks connections to peers, and allows consumers to associate
/// metadata with each peer.
///
/// It enables connections to be trimmed based on implementation-defined
/// heuristics. The ConnManager allows libp2p to enforce an upper bound on the
/// total number of open connections.
abstract class ConnManager {
  /// Tags a peer with a string, associating a weight with the tag.
  void tagPeer(PeerId peerId, String tag, int value);

  /// Removes the tagged value from the peer.
  void untagPeer(PeerId peerId, String tag);

  /// Updates an existing tag or inserts a new one.
  ///
  /// The connection manager calls the upsert function supplying the current
  /// value of the tag (or zero if inexistent). The return value is used as
  /// the new value of the tag.
  void upsertTag(PeerId peerId, String tag, int Function(int) upsert);

  /// Returns the metadata associated with the peer,
  /// or null if no metadata has been recorded for the peer.
  TagInfo? getTagInfo(PeerId peerId);

  /// Terminates open connections based on an implementation-defined heuristic.
  Future<void> trimOpenConns();

  /// Returns an implementation that can be called back to inform of
  /// opened and closed connections.
  Notifiee get notifiee;

  /// Protects a peer from having its connection(s) pruned.
  ///
  /// Tagging allows different parts of the system to manage protections without
  /// interfering with one another.
  ///
  /// Calls to protect() with the same tag are idempotent. They are not refcounted,
  /// so after multiple calls to protect() with the same tag, a single unprotect()
  /// call bearing the same tag will revoke the protection.
  void protect(PeerId peerId, String tag);

  /// Removes a protection that may have been placed on a peer, under the specified tag.
  ///
  /// The return value indicates whether the peer continues to be protected after
  /// this call, by way of a different tag.
  bool unprotect(PeerId peerId, String tag);

  /// Returns true if the peer is protected for some tag; if the tag is the empty string
  /// then it will return true if the peer is protected for any tag
  bool isProtected(PeerId peerId, String tag);

  /// Will return an error if the connection manager's internal
  /// connection limit exceeds the provided system limit.
  String? checkLimit(GetConnLimiter limiter);

  /// Closes the connection manager and stops background processes.
  Future<void> close();

  /// Registers a new connection with the connection manager.
  /// 
  /// This method initializes state tracking for the connection and starts monitoring it.
  /// Once registered, the connection's lifecycle will be managed by the connection manager.
  /// 
  /// [conn] The transport connection to register.
  void registerConnection(TransportConn conn);

  /// Updates the state of a connection and notifies listeners of the state change.
  /// 
  /// This method is used to transition a connection between different states in its lifecycle.
  /// State changes trigger notifications to any listeners subscribed to the connection's state stream.
  /// 
  /// [conn] The transport connection whose state is being updated.
  /// [state] The new state to set for the connection.
  /// [error] Optional error object that may be provided when transitioning to an error state.
  void updateState(TransportConn conn, ConnectionState state, {required Object? error});

  /// Returns the current state of a connection.
  /// 
  /// [conn] The transport connection to query.
  /// 
  /// Returns the current [ConnectionState] of the connection, or null if the connection
  /// is not registered with the manager.
  ConnectionState? getState(TransportConn conn);

  /// Records activity on a connection and updates its timestamp.
  /// 
  /// This method should be called whenever there is data transfer or other activity
  /// on the connection. It helps the connection manager track which connections are
  /// active and which are idle.
  /// 
  /// [tcpConnection] The transport connection on which activity occurred.
  void recordActivity(TransportConn tcpConnection);

  /// Disposes of the connection manager and releases all resources.
  /// 
  /// This method closes all managed connections and cleans up any associated resources.
  /// It should be called when the connection manager is no longer needed.
  Future<void> dispose();

  /// Returns a stream of state changes for a specific connection.
  /// 
  /// Subscribers to this stream will be notified whenever the connection's state changes.
  /// 
  /// [conn] The transport connection to monitor.
  /// 
  /// Returns a [Stream] of [ConnectionStateChange] events, or null if the connection
  /// is not registered with the manager.
  Stream<ConnectionStateChange>? getStateStream(TransportConn conn);

  /// Initiates a graceful shutdown of a connection.
  /// 
  /// This method attempts to close the connection cleanly, allowing any in-flight
  /// operations to complete. If the graceful shutdown exceeds the configured timeout,
  /// the connection may be forcibly closed.
  /// 
  /// [conn] The transport connection to close.
  Future<void> closeConnection(TransportConn conn);
}
