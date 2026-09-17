import 'dart:io';
import 'dart:typed_data';
import 'conn.dart';

/// TransportConn extends the Conn interface with methods for reading and writing raw data.
/// This is used by transport implementations that need to send and receive data directly.
abstract class TransportConn extends Conn {
  /// Reads data from the connection.
  /// If [length] is provided, reads exactly that many bytes.
  /// Otherwise, reads whatever is available.
  Future<Uint8List> read([int? length]);

  Socket get socket ;

  /// Writes data to the connection.
  Future<void> write(Uint8List data);

  /// Sets a timeout for read operations.
  void setReadTimeout(Duration timeout);

  /// Sets a timeout for write operations.
  void setWriteTimeout(Duration timeout);

  /// Notifies that activity has occurred on this transport connection,
  /// potentially due to activity on a multiplexed stream over it.
  /// This can be used by multiplexers to inform the connection manager.
  void notifyActivity();
}
