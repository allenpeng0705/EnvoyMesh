import 'dart:async';
import 'dart:io';

import 'context.dart';
import 'rcmgr.dart';

/// Error thrown when reading or writing on a reset stream.
class ResetException implements Exception {
  final String message;
  
  const ResetException([this.message = 'stream reset']);
  
  @override
  String toString() => 'ResetException: $message';
}

/// MuxedStream is a bidirectional io pipe within a connection.
abstract class MuxedStream {
  /// Reads data from the stream.
  Future<List<int>> read(int length);
  
  /// Writes data to the stream.
  Future<void> write(List<int> data);
  
  /// Closes the stream.
  ///
  /// * Any buffered data for writing will be flushed.
  /// * Future reads will fail.
  /// * Any in-progress reads/writes will be interrupted.
  ///
  /// Close may be asynchronous and _does not_ guarantee receipt of the
  /// data.
  ///
  /// Close closes the stream for both reading and writing.
  /// Close is equivalent to calling `closeRead` and `closeWrite`. Importantly, Close will not wait for any form of acknowledgment.
  /// If acknowledgment is required, the caller must call `closeWrite`, then wait on the stream for a response (or an EOF),
  /// then call close() to free the stream object.
  ///
  /// When done with a stream, the user must call either close() or `reset()` to discard the stream, even after calling `closeRead` and/or `closeWrite`.
  Future<void> close();
  
  /// Closes the stream for writing but leaves it open for reading.
  ///
  /// closeWrite does not free the stream, users must still call close or reset.
  Future<void> closeWrite();
  
  /// Closes the stream for reading but leaves it open for writing.
  ///
  /// When closeRead is called, all in-progress read calls are interrupted with a non-EOF error and
  /// no further calls to read will succeed.
  ///
  /// The handling of new incoming data on the stream after calling this function is implementation defined.
  ///
  /// closeRead does not free the stream, users must still call close or reset.
  Future<void> closeRead();
  
  /// Resets closes both ends of the stream. Use this to tell the remote
  /// side to hang up and go away.
  Future<void> reset();
  
  /// Sets a deadline for all operations on the stream.
  void setDeadline(DateTime time);
  
  /// Sets a deadline for read operations on the stream.
  void setReadDeadline(DateTime time);
  
  /// Sets a deadline for write operations on the stream.
  void setWriteDeadline(DateTime time);
}

/// MuxedConn represents a connection to a remote peer that has been
/// extended to support stream multiplexing.
///
/// A MuxedConn allows a single connection to carry many logically
/// independent bidirectional streams of binary data.
///
/// Together with network.ConnSecurity, MuxedConn is a component of the
/// transport.CapableConn interface, which represents a "raw" network
/// connection that has been "upgraded" to support the libp2p capabilities
/// of secure communication and stream multiplexing.
abstract class MuxedConn {
  /// Closes the stream muxer and the the underlying connection.
  Future<void> close();
  
  /// Returns whether a connection is fully closed, so it can be garbage collected.
  bool get isClosed;
  
  /// Creates a new stream.
  Future<MuxedStream> openStream(Context context);
  
  /// Accepts a stream opened by the other side.
  Future<MuxedStream> acceptStream();
}


/// Multiplexer wraps a connection with a stream multiplexing
/// implementation and returns a MuxedConn that supports opening
/// multiple streams over the underlying connection
abstract class Multiplexer {
  /// Constructs a new connection
  Future<MuxedConn> newConn(Socket conn, bool isServer, PeerScope scope);
}