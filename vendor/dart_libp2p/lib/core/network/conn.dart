import 'dart:async';
import 'dart:io';

import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/protocol/protocol.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/stream.dart'; // P2PStream is used
import 'package:dart_libp2p/core/network/rcmgr.dart' show ConnScope, ScopeStat, ResourceScopeSpan; // Import new types

import 'package:dart_libp2p/core/crypto/keys.dart';
import 'package:dart_libp2p/core/network/context.dart';
import 'package:dart_libp2p/core/network/common.dart'; // Provides Direction

/// Conn is a connection to a remote peer. It multiplexes streams.
/// Usually there is no need to use a Conn directly, but it may
/// be useful to get information about the peer on the other side:
///
///   stream.Conn().RemotePeer()
abstract class Conn {
  /// Closes the connection
  Future<void> close();

  /// ID returns an identifier that uniquely identifies this Conn within this
  /// host, during this run. Connection IDs may repeat across restarts.
  String get id;

  /// NewStream constructs a new Stream over this conn.
  Future<P2PStream> newStream(Context context);

  /// GetStreams returns all open streams over this conn.
  Future<List<P2PStream>> get streams;

  /// IsClosed returns whether a connection is fully closed, so it can
  /// be garbage collected.
  bool get isClosed;

  /// LocalPeer returns our peer ID
  PeerId get localPeer;

  /// RemotePeer returns the peer ID of the remote peer.
  PeerId get remotePeer;

  /// RemotePublicKey returns the public key of the remote peer.
  Future<PublicKey?> get remotePublicKey;

  /// ConnState returns information about the connection state.
  ConnState get state;

  /// LocalMultiaddr returns the local Multiaddr associated
  /// with this connection
  MultiAddr get localMultiaddr;

  /// RemoteMultiaddr returns the remote Multiaddr associated
  /// with this connection
  MultiAddr get remoteMultiaddr;

  /// Stat stores metadata pertaining to this conn.
  ConnStats get stat;

  /// Scope returns the user view of this connection's resource scope
  ConnScope get scope; // Will now refer to rcmgr.ConnScope
}

/// ConnectionState holds information about the connection.
class ConnState {
  /// The stream multiplexer used on this connection (if any). For example: /yamux/1.0.0
  final ProtocolID streamMultiplexer;

  /// The security protocol used on this connection (if any). For example: /tls/1.0.0
  final ProtocolID security;

  /// The transport used on this connection. For example: tcp
  final String transport;

  /// Indicates whether StreamMultiplexer was selected using inlined muxer negotiation
  final bool usedEarlyMuxerNegotiation;

  const ConnState({
    required this.streamMultiplexer,
    required this.security,
    required this.transport,
    required this.usedEarlyMuxerNegotiation,
  });
}


/// Stats stores metadata pertaining to a given Stream / Conn.
class Stats {
  /// Direction specifies whether this is an inbound or an outbound connection.
  final Direction direction; // From common.dart

  /// Opened is the timestamp when this connection was opened.
  final DateTime opened;

  /// Limited indicates that this connection is Limited.
  final bool limited;

  /// Extra stores additional metadata about this connection.
  final Map<dynamic, dynamic> extra;

  const Stats({
    required this.direction,
    required this.opened,
    this.limited = false,
    this.extra = const {},
  });
}

/// ConnStats stores metadata pertaining to a given Conn.
abstract class ConnStats {
  /// Base stats
  final Stats stats;

  /// Number of streams on the connection
  final int numStreams;

  const ConnStats({
    required this.stats,
    required this.numStreams,
  });
}
