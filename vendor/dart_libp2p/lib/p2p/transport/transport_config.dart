/// Configuration options for transport implementations
class TransportConfig {
  /// Default timeout for connection attempts
  static const defaultDialTimeout = Duration(seconds: 30);

  /// Default timeout for read operations
  static const defaultReadTimeout = Duration(seconds: 30);

  /// Default timeout for write operations
  static const defaultWriteTimeout = Duration(seconds: 30);

  /// Timeout for connection attempts
  final Duration dialTimeout;

  /// Timeout for read operations
  final Duration readTimeout;

  /// Timeout for write operations
  final Duration writeTimeout;

  /// Creates a new transport configuration
  const TransportConfig({
    this.dialTimeout = defaultDialTimeout,
    this.readTimeout = defaultReadTimeout,
    this.writeTimeout = defaultWriteTimeout,
  });

  /// Creates a new transport configuration with default values
  static const defaultConfig = TransportConfig();

  /// Creates a copy of this configuration with the given values
  TransportConfig copyWith({
    Duration? dialTimeout,
    Duration? readTimeout,
    Duration? writeTimeout,
  }) {
    return TransportConfig(
      dialTimeout: dialTimeout ?? this.dialTimeout,
      readTimeout: readTimeout ?? this.readTimeout,
      writeTimeout: writeTimeout ?? this.writeTimeout,
    );
  }
} 