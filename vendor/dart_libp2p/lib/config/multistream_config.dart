/// Configuration for multistream protocol operations
/// 
/// This class provides configuration options for multistream protocol
/// negotiation, including timeout settings and retry behavior.

/// Configuration for multistream protocol operations
class MultistreamConfig {
  /// Default timeout for read operations
  static const Duration defaultReadTimeout = Duration(seconds: 30);
  
  /// Default maximum number of retry attempts
  static const int defaultMaxRetries = 3;
  
  /// Default progressive timeout strategy settings
  static const Duration defaultInitialTimeout = Duration(seconds: 10);
  static const int defaultMaxTimeoutAttempts = 3;
  static const double defaultTimeoutMultiplier = 2.0;
  
  /// Timeout for individual read operations
  final Duration readTimeout;
  
  /// Maximum number of retry attempts for transient failures
  final int maxRetries;
  
  /// Whether to use progressive timeout strategy
  final bool useProgressiveTimeout;
  
  /// Initial timeout for progressive strategy
  final Duration initialTimeout;
  
  /// Maximum number of timeout attempts in progressive strategy
  final int maxTimeoutAttempts;
  
  /// Multiplier for timeout duration in progressive strategy
  final double timeoutMultiplier;
  
  /// Delay between retry attempts
  final Duration retryDelay;
  
  /// Whether to enable detailed logging for timeout operations
  final bool enableTimeoutLogging;
  
  /// Creates a new MultistreamConfig with the specified settings
  const MultistreamConfig({
    this.readTimeout = defaultReadTimeout,
    this.maxRetries = defaultMaxRetries,
    this.useProgressiveTimeout = true,
    this.initialTimeout = defaultInitialTimeout,
    this.maxTimeoutAttempts = defaultMaxTimeoutAttempts,
    this.timeoutMultiplier = defaultTimeoutMultiplier,
    this.retryDelay = const Duration(milliseconds: 100),
    this.enableTimeoutLogging = true,
  });
  
  /// Creates a configuration optimized for fast networks
  factory MultistreamConfig.fastNetwork() {
    return const MultistreamConfig(
      readTimeout: Duration(seconds: 10),
      maxRetries: 2,
      initialTimeout: Duration(seconds: 5),
      maxTimeoutAttempts: 2,
      timeoutMultiplier: 1.5,
      retryDelay: Duration(milliseconds: 50),
    );
  }
  
  /// Creates a configuration optimized for slow/unreliable networks
  factory MultistreamConfig.slowNetwork() {
    return const MultistreamConfig(
      readTimeout: Duration(seconds: 60),
      maxRetries: 5,
      initialTimeout: Duration(seconds: 15),
      maxTimeoutAttempts: 4,
      timeoutMultiplier: 2.5,
      retryDelay: Duration(milliseconds: 200),
    );
  }
  
  /// Creates a configuration with no retries (fail fast)
  factory MultistreamConfig.failFast() {
    return const MultistreamConfig(
      readTimeout: Duration(seconds: 5),
      maxRetries: 0,
      useProgressiveTimeout: false,
      retryDelay: Duration.zero,
    );
  }
  
  /// Creates a copy of this configuration with modified values
  MultistreamConfig copyWith({
    Duration? readTimeout,
    int? maxRetries,
    bool? useProgressiveTimeout,
    Duration? initialTimeout,
    int? maxTimeoutAttempts,
    double? timeoutMultiplier,
    Duration? retryDelay,
    bool? enableTimeoutLogging,
  }) {
    return MultistreamConfig(
      readTimeout: readTimeout ?? this.readTimeout,
      maxRetries: maxRetries ?? this.maxRetries,
      useProgressiveTimeout: useProgressiveTimeout ?? this.useProgressiveTimeout,
      initialTimeout: initialTimeout ?? this.initialTimeout,
      maxTimeoutAttempts: maxTimeoutAttempts ?? this.maxTimeoutAttempts,
      timeoutMultiplier: timeoutMultiplier ?? this.timeoutMultiplier,
      retryDelay: retryDelay ?? this.retryDelay,
      enableTimeoutLogging: enableTimeoutLogging ?? this.enableTimeoutLogging,
    );
  }
  
  @override
  String toString() {
    return 'MultistreamConfig('
        'readTimeout: $readTimeout, '
        'maxRetries: $maxRetries, '
        'useProgressiveTimeout: $useProgressiveTimeout, '
        'initialTimeout: $initialTimeout, '
        'maxTimeoutAttempts: $maxTimeoutAttempts, '
        'timeoutMultiplier: $timeoutMultiplier, '
        'retryDelay: $retryDelay, '
        'enableTimeoutLogging: $enableTimeoutLogging'
        ')';
  }
  
  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is MultistreamConfig &&
        other.readTimeout == readTimeout &&
        other.maxRetries == maxRetries &&
        other.useProgressiveTimeout == useProgressiveTimeout &&
        other.initialTimeout == initialTimeout &&
        other.maxTimeoutAttempts == maxTimeoutAttempts &&
        other.timeoutMultiplier == timeoutMultiplier &&
        other.retryDelay == retryDelay &&
        other.enableTimeoutLogging == enableTimeoutLogging;
  }
  
  @override
  int get hashCode {
    return Object.hash(
      readTimeout,
      maxRetries,
      useProgressiveTimeout,
      initialTimeout,
      maxTimeoutAttempts,
      timeoutMultiplier,
      retryDelay,
      enableTimeoutLogging,
    );
  }
}
