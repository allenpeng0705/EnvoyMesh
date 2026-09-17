/// Package identify provides the identify service for libp2p.
///
/// The identify service provides peer discovery and network address discovery
/// capabilities for libp2p. It is a required service for a libp2p node.
///
/// This is a port of the Go implementation from go-libp2p/p2p/protocol/identify/id.go
/// to Dart, using native Dart idioms.

import 'dart:async';
import 'dart:io';

import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/conn.dart';

/// IDService is the interface for the identify service.
abstract class IDService {
  /// IdentifyConn synchronously triggers an identify request on the connection and
  /// waits for it to complete. If the connection is being identified by another
  /// caller, this call will wait. If the connection has already been identified,
  /// it will return immediately.
  Future<void> identifyConn(Conn conn);

  /// IdentifyWait triggers an identify (if the connection has not already been
  /// identified) and returns a future that completes when the identify protocol
  /// completes.
  Future<void> identifyWait(Conn conn);

  /// OwnObservedAddrs returns the addresses peers have reported we've dialed from
  List<MultiAddr> ownObservedAddrs();

  /// ObservedAddrsFor returns the addresses peers have reported we've dialed from,
  /// for a specific local address.
  List<MultiAddr> observedAddrsFor(MultiAddr local);

  /// Start starts the identify service.
  Future<void> start();

  /// Close stops the identify service.
  Future<void> close();
}