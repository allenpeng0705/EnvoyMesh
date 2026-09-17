/// Package host provides the core Host interface for libp2p.
///
/// Host represents a single libp2p node in a peer-to-peer network.

import 'dart:async';

import 'package:dart_libp2p/core/peer/addr_info.dart';
import 'package:dart_libp2p/core/connmgr/conn_manager.dart';
import 'package:dart_libp2p/core/event/bus.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/context.dart';
import 'package:dart_libp2p/core/network/network.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/peerstore.dart';
import 'package:dart_libp2p/core/protocol/protocol.dart';
import 'package:dart_libp2p/core/protocol/switch.dart';
import 'package:dart_libp2p/core/network/stream.dart';
import 'package:dart_libp2p/p2p/protocol/holepunch.dart'; // Added for HolePunchService


/// AddrsFactory functions can be passed to a Host to override
/// addresses returned by Addrs.
typedef AddrsFactory = List<MultiAddr> Function(List<MultiAddr> addrs);

/// Host is an object participating in a p2p network, which
/// implements protocols or provides services. It handles
/// requests like a Server, and issues requests like a Client.
/// It is called Host because it is both Server and Client (and Peer
/// may be confusing).
abstract class Host {
  /// ID returns the (local) peer.ID associated with this Host
  PeerId get id;

  /// Peerstore returns the Host's repository of Peer Addresses and Keys.
  Peerstore get peerStore;

  /// Addrs returns the listen addresses of the Host
  List<MultiAddr> get addrs;

  /// Network returns the Network interface of the Host
  Network get network;

  /// Mux returns the Mux multiplexing incoming streams to protocol handlers
  ProtocolSwitch get mux;

  /// Connect ensures there is a connection between this host and the peer with
  /// given peer.ID. Connect will absorb the addresses in pi into its internal
  /// peerstore. If there is not an active connection, Connect will issue a
  /// h.Network.Dial, and block until a connection is open, or an error is
  /// returned.
  /// 
  /// If [context] is not provided, a new Context will be created.
  Future<void> connect(AddrInfo pi, {Context? context});

  /// SetStreamHandler sets the protocol handler on the Host's Mux.
  /// This is equivalent to:
  ///   host.Mux().SetHandler(proto, handler)
  /// (Thread-safe)
  void setStreamHandler(ProtocolID pid, StreamHandler handler);

  /// SetStreamHandlerMatch sets the protocol handler on the Host's Mux
  /// using a matching function for protocol selection.
  void setStreamHandlerMatch(ProtocolID pid, bool Function(ProtocolID) match, StreamHandler handler);

  /// RemoveStreamHandler removes a handler on the mux that was set by
  /// SetStreamHandler
  void removeStreamHandler(ProtocolID pid);

  /// NewStream opens a new stream to given peer p, and writes a p2p/protocol
  /// header with given ProtocolID. If there is no connection to p, attempts
  /// to create one. If ProtocolID is "", writes no header.
  /// (Thread-safe)
  /// 
  /// If [context] is not provided, a new Context will be created.
  Future<P2PStream> newStream(PeerId p, List<ProtocolID> pids, Context context);

  /// Close shuts down the host, its Network, and services.
  Future<void> close();

  Future<void> start();

  /// ConnManager returns this hosts connection manager
  ConnManager get connManager;

  /// EventBus returns the hosts eventbus
  EventBus get eventBus;

  /// Returns the [HolePunchService] for this host, if available.
  // This service is typically initialized by the Host implementation (e.g., BasicHost)
  // if hole punching is enabled in the configuration.
  // It can be null if hole punching is not enabled or not supported by the host type.
  // ignore: one_member_abstracts
  HolePunchService? get holePunchService;
}
