import 'dart:async';
import 'dart:typed_data';

import 'package:dart_libp2p/core/network/common.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/network/rcmgr.dart' show StreamScope, StreamManagementScope, ScopeStat, ResourceScopeSpan; // Import new types

/// Represents a bidirectional channel between two agents in
/// a libp2p network. "agent" is as granular as desired, potentially
/// being a "request -> reply" pair, or whole protocols.
///
/// Streams are backed by a multiplexer underneath the hood.
abstract class P2PStream<T> {
  /// Returns an identifier that uniquely identifies this Stream within this
  /// host, during this run. Stream IDs may repeat across restarts.
  String id();

  /// Returns the protocol ID associated with this stream
  String protocol();

  /// Sets the protocol for this stream
  Future<void> setProtocol(String id);

  /// Returns metadata pertaining to this stream
  StreamStats stat();

  /// Returns the connection this stream is part of
  Conn get conn; // Changed to a getter, represents the underlying connection

  /// Returns the management view of this stream's resource scope
  StreamManagementScope scope(); // Changed to StreamManagementScope

  /// Reads data from the stream
  Future<Uint8List> read([int? maxLength]);

  /// Writes data to the stream
  Future<void> write(Uint8List data);

  /// Returns a Dart Stream of the incoming data
  P2PStream<Uint8List> get incoming;

  /// Closes the stream for both reading and writing
  Future<void> close();

  /// Closes the stream for writing but leaves it open for reading
  Future<void> closeWrite();

  /// Closes the stream for reading but leaves it open for writing
  Future<void> closeRead();

  /// Closes both ends of the stream
  Future<void> reset();

  /// Sets a deadline for both reading and writing operations
  Future<void> setDeadline(DateTime? time);

  /// Sets a deadline for reading operations
  Future<void> setReadDeadline(DateTime time);

  /// Sets a deadline for writing operations
  Future<void> setWriteDeadline(DateTime time);

  /// Returns true if the stream is closed
  bool get isClosed;

  /// Returns true if the stream is ready for writing
  /// More precise than !isClosed as it excludes closing state
  bool get isWritable;
}


/// Stores metadata pertaining to a given Stream
class StreamStats {
  /// Direction specifies whether this is an inbound or an outbound connection
  final Direction direction; // Will now come from common.dart

  /// Timestamp when this connection was opened
  final DateTime opened;

  /// Indicates that this connection is limited
  final bool limited;

  /// Additional metadata about this connection
  final Map<dynamic, dynamic> extra;

  StreamStats({
    required this.direction,
    required this.opened,
    this.limited = false,
    this.extra = const {},
  });
}
