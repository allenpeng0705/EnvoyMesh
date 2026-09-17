/// Package holepunch provides the holepunch service for libp2p.
///
/// The holepunch service provides direct connection establishment capabilities
/// for libp2p nodes behind NATs/firewalls. It coordinates hole punching between
/// peers to establish direct connections.
///
/// This is a port of the Go implementation from go-libp2p/p2p/protocol/holepunch
/// to Dart, using native Dart idioms.

import 'dart:async';

import 'package:dart_libp2p/core/peer/peer_id.dart';



/// HolePunchService is the interface for the holepunch service.
abstract class HolePunchService {
  /// DirectConnect attempts to make a direct connection with a remote peer.
  /// It first attempts a direct dial (if we have a public address of that peer), and then
  /// coordinates a hole punch over the given relay connection.
  Future<void> directConnect(PeerId peerId);

  /// Start starts the holepunch service.
  Future<void> start();

  /// Close stops the holepunch service.
  Future<void> close();
}