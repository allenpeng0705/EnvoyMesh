import 'dart:async';
import 'dart:io';
import 'dart:math';

import 'package:logging/logging.dart';

import '../../core/exceptions.dart';

final Logger _logger = Logger('UDXExceptions');

/// UDX-specific transport exception
class UDXTransportException extends ConnectionFailedException {
  final String context;
  final dynamic originalError;
  final bool isTransient;
  
  UDXTransportException(
    String message, 
    this.context, 
    this.originalError, {
    this.isTransient = false,
  }) : super(message);
  
  @override
  String toString() => 'UDXTransportException: $message (context: $context, transient: $isTransient)';
}

/// UDX connection-specific exception
class UDXConnectionException extends UDXTransportException {
  UDXConnectionException(
    String message, 
    String context, 
    dynamic originalError, {
    bool isTransient = false,
  }) : super(message, context, originalError, isTransient: isTransient);
}

/// UDX stream-specific exception
class UDXStreamException extends UDXTransportException {
  final String streamId;
  
  UDXStreamException(
    String message, 
    String context, 
    this.streamId,
    dynamic originalError, {
    bool isTransient = false,
  }) : super(message, context, originalError, isTransient: isTransient);
}

/// UDX packet loss exception
class UDXPacketLossException extends UDXConnectionException {
  UDXPacketLossException(
    String context, 
    dynamic originalError,
  ) : super(
    'UDX connection failed: Packet permanently lost after max retries', 
    context, 
    originalError,
    isTransient: false, // Permanent packet loss is not transient
  );
}

/// UDX timeout exception
class UDXTimeoutException extends UDXConnectionException {
  final Duration timeout;
  
  UDXTimeoutException(
    String context, 
    this.timeout,
    dynamic originalError,
  ) : super(
    'UDX operation timed out after ${timeout.inMilliseconds}ms', 
    context, 
    originalError,
    isTransient: true, // Timeouts might be transient
  );
}

/// Retry configuration for UDX operations
class UDXRetryConfig {
  final int maxRetries;
  final Duration initialDelay;
  final double backoffMultiplier;
  final Duration maxDelay;
  final bool enableJitter;
  
  const UDXRetryConfig({
    this.maxRetries = 3,
    this.initialDelay = const Duration(milliseconds: 100),
    this.backoffMultiplier = 2.0,
    this.maxDelay = const Duration(seconds: 5),
    this.enableJitter = true,
  });
  
  /// Default retry config for bootstrap servers (more aggressive)
  static const UDXRetryConfig bootstrapServer = UDXRetryConfig(
    maxRetries: 5,
    initialDelay: Duration(milliseconds: 50),
    backoffMultiplier: 1.5,
    maxDelay: Duration(seconds: 3),
    enableJitter: true,
  );
  
  /// Default retry config for regular nodes
  static const UDXRetryConfig regular = UDXRetryConfig(
    maxRetries: 3,
    initialDelay: Duration(milliseconds: 100),
    backoffMultiplier: 2.0,
    maxDelay: Duration(seconds: 5),
    enableJitter: true,
  );
}

/// Centralized UDX exception handler with retry logic
class UDXExceptionHandler {
  static final Random _random = Random();
  
  /// Handles UDX operations with comprehensive exception handling and retry logic
  static Future<T> handleUDXOperation<T>(
    Future<T> Function() operation,
    String context, {
    UDXRetryConfig retryConfig = UDXRetryConfig.regular,
    bool Function(dynamic error)? shouldRetry,
  }) async {
    int attempt = 0;
    Duration delay = retryConfig.initialDelay;
    
    while (attempt <= retryConfig.maxRetries) {
      try {
        _logger.fine('[UDXExceptionHandler] Executing operation: $context (attempt ${attempt + 1}/${retryConfig.maxRetries + 1})');
        return await operation();
      } catch (error, stackTrace) {
        final classifiedException = classifyUDXException(error, context, stackTrace);
        
        // If this is the last attempt or error is not retryable, throw
        if (attempt >= retryConfig.maxRetries || 
            !shouldRetryError(classifiedException, shouldRetry)) {
          _logger.warning('[UDXExceptionHandler] Operation failed permanently: $context. Error: $classifiedException');
          throw classifiedException;
        }
        
        // Log retry attempt
        _logger.info('[UDXExceptionHandler] Operation failed, retrying: $context. Attempt ${attempt + 1}/${retryConfig.maxRetries + 1}. Error: $classifiedException');
        
        // Calculate delay with exponential backoff and optional jitter
        if (retryConfig.enableJitter) {
          final jitter = _random.nextDouble() * 0.1; // 10% jitter
          delay = Duration(
            milliseconds: (delay.inMilliseconds * (1 + jitter)).round(),
          );
        }
        
        await Future.delayed(delay);
        
        // Update delay for next iteration
        delay = Duration(
          milliseconds: (delay.inMilliseconds * retryConfig.backoffMultiplier).round(),
        );
        if (delay > retryConfig.maxDelay) {
          delay = retryConfig.maxDelay;
        }
        
        attempt++;
      }
    }
    
    // This should never be reached, but just in case
    throw UDXTransportException('Max retries exceeded', context, null);
  }
  
  /// Classifies UDX exceptions into appropriate exception types
  static UDXTransportException classifyUDXException(
    dynamic error, 
    String context, 
    StackTrace stackTrace,
  ) {
    if (error is UDXTransportException) {
      return error; // Already classified
    }
    
    if (error is StateError) {
      final message = error.message;
      if (message.contains('permanently lost') || message.contains('packet.*lost')) {
        return UDXPacketLossException(context, error);
      }
      return UDXConnectionException(
        'UDX state error: $message', 
        context, 
        error,
        isTransient: false,
      );
    }
    
    if (error is SocketException) {
      return UDXConnectionException(
        'UDX socket error: ${error.message}', 
        context, 
        error,
        isTransient: _isTransientSocketError(error),
      );
    }
    
    if (error is TimeoutException) {
      return UDXTimeoutException(
        context,
        error.duration ?? const Duration(seconds: 30),
        error,
      );
    }
    
    if (error is OSError) {
      return UDXConnectionException(
        'UDX OS error: ${error.message}', 
        context, 
        error,
        isTransient: _isTransientOSError(error),
      );
    }
    
    // Generic UDX error
    return UDXTransportException(
      'UDX operation failed: $error', 
      context, 
      error,
      isTransient: false,
    );
  }
  
  /// Determines if an error should be retried
  static bool shouldRetryError(
    UDXTransportException error, 
    bool Function(dynamic error)? customShouldRetry,
  ) {
    // Use custom retry logic if provided
    if (customShouldRetry != null) {
      return customShouldRetry(error);
    }
    
    // Don't retry packet loss errors (they're permanent)
    if (error is UDXPacketLossException) {
      return false;
    }
    
    // Retry transient errors
    return error.isTransient;
  }
  
  /// Determines if a SocketException is transient
  static bool _isTransientSocketError(SocketException error) {
    final message = error.message.toLowerCase();
    
    // Network unreachable, connection refused, etc. might be transient
    return message.contains('network unreachable') ||
           message.contains('connection refused') ||
           message.contains('connection reset') ||
           message.contains('connection timed out') ||
           message.contains('host unreachable');
  }
  
  /// Determines if an OSError is transient
  static bool _isTransientOSError(OSError error) {
    // Common transient OS errors
    switch (error.errorCode) {
      case 111: // Connection refused
      case 113: // No route to host
      case 110: // Connection timed out
        return true;
      default:
        return false;
    }
  }
}

/// Utility functions for UDX exception handling
class UDXExceptionUtils {
  /// Safely closes a resource with error handling
  static Future<void> safeClose(
    Future<void> Function() closeOperation,
    String resourceName,
  ) async {
    try {
      await closeOperation();
      _logger.fine('[UDXExceptionUtils] Successfully closed $resourceName');
    } catch (error) {
      _logger.warning('[UDXExceptionUtils] Error closing $resourceName: $error');
      // Don't rethrow - we want cleanup to continue
    }
  }
  
  /// Safely closes multiple resources
  static Future<void> safeCloseAll(
    Map<String, Future<void> Function()> resources,
  ) async {
    final futures = resources.entries.map((entry) => 
      safeClose(entry.value, entry.key)
    );
    await Future.wait(futures);
  }
  
  /// Creates a timeout wrapper for UDX operations
  static Future<T> withTimeout<T>(
    Future<T> operation,
    Duration timeout,
    String context,
  ) async {
    try {
      return await operation.timeout(timeout);
    } on TimeoutException catch (e) {
      throw UDXTimeoutException(context, timeout, e);
    }
  }
}
