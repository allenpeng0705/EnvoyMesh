import 'dart:async';

import '../../core/multiaddr.dart';
import '../../core/network/conn.dart';
import '../../core/network/transport_conn.dart';
import '../../core/network/stream.dart';

/// Represents a transport listener that can accept incoming connections
abstract class Listener {
  /// The address this listener is bound to
  MultiAddr get addr;

  /// Accepts an incoming connection
  /// Returns null if the listener is closed
  Future<TransportConn?> accept();

  /// Returns true if the listener is closed
  bool get isClosed;

  /// Closes the listener
  Future<void> close();

  /// Stream of incoming connections
  Stream<TransportConn> get connectionStream;

  /// Returns true if this listener supports the given multiaddress
  bool supportsAddr(MultiAddr addr);
} 
