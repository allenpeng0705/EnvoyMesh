import 'package:dart_libp2p/core/network/common.dart';

/// Limit is an object that specifies basic resource limits.
abstract class Limit {
  /// GetMemoryLimit returns the (current) memory limit in bytes.
  int get memoryLimit;

  /// GetStreamLimit returns the stream limit, for inbound or outbound streams.
  int getStreamLimit(Direction direction);

  /// GetStreamTotalLimit returns the total stream limit.
  int get streamTotalLimit;

  /// GetConnLimit returns the connection limit, for inbound or outbound connections.
  int getConnLimit(Direction direction);

  /// GetConnTotalLimit returns the total connection limit.
  int get connTotalLimit;

  /// GetFDLimit returns the file descriptor limit.
  /// For Dart, this might be conceptual (e.g., number of active connections)
  /// or ignored if not directly applicable.
  int get fdLimit;
}

/// BaseLimit provides a concrete implementation of the [Limit] interface.
class BaseLimit implements Limit {
  final int streams;
  final int streamsInbound;
  final int streamsOutbound;
  final int conns;
  final int connsInbound;
  final int connsOutbound;
  final int fd;
  final int memory; // Memory in bytes

  BaseLimit({
    this.streams = 0,
    this.streamsInbound = 0,
    this.streamsOutbound = 0,
    this.conns = 0,
    this.connsInbound = 0,
    this.connsOutbound = 0,
    this.fd = 0,
    this.memory = 0,
  });

  @override
  int get memoryLimit => memory;

  @override
  int getStreamLimit(Direction direction) {
    return direction == Direction.inbound ? streamsInbound : streamsOutbound;
  }

  @override
  int get streamTotalLimit => streams;

  @override
  int getConnLimit(Direction direction) {
    return direction == Direction.inbound ? connsInbound : connsOutbound;
  }

  @override
  int get connTotalLimit => conns;

  @override
  int get fdLimit => fd;

  /// Creates a new [BaseLimit] by applying values from [other] for any
  /// fields that are zero in this limit.
  BaseLimit apply(BaseLimit other) {
    return BaseLimit(
      streams: streams == 0 ? other.streams : streams,
      streamsInbound:
          streamsInbound == 0 ? other.streamsInbound : streamsInbound,
      streamsOutbound:
          streamsOutbound == 0 ? other.streamsOutbound : streamsOutbound,
      conns: conns == 0 ? other.conns : conns,
      connsInbound: connsInbound == 0 ? other.connsInbound : connsInbound,
      connsOutbound:
          connsOutbound == 0 ? other.connsOutbound : connsOutbound,
      fd: fd == 0 ? other.fd : fd,
      memory: memory == 0 ? other.memory : memory,
    );
  }

  // Helper for creating a limit instance representing "unlimited"
  // Using a large number, but not int.maxFinite to avoid issues if it's used in arithmetic directly.
  // Go uses math.MaxInt64, Dart's int can be arbitrarily large, but for practical limits,
  // a sufficiently large number is fine.
  static final int _unlimitedValue = 2 * 1024 * 1024 * 1024; // Approx 2 billion, like Go's MaxInt32

  static BaseLimit unlimited() {
    return BaseLimit(
      streams: _unlimitedValue,
      streamsInbound: _unlimitedValue,
      streamsOutbound: _unlimitedValue,
      conns: _unlimitedValue,
      connsInbound: _unlimitedValue,
      connsOutbound: _unlimitedValue,
      fd: _unlimitedValue,
      memory: _unlimitedValue * 1024, // A very large memory limit
    );
  }

  static BaseLimit blockAll() {
    return BaseLimit(
      streams: 0,
      streamsInbound: 0,
      streamsOutbound: 0,
      conns: 0,
      connsInbound: 0,
      connsOutbound: 0,
      fd: 0,
      memory: 0,
    );
  }
}
