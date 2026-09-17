/// Yamux-specific exception handling and classification
/// 
/// This module provides comprehensive exception handling for Yamux multiplexer
/// operations, similar to the UDX exception handling system.

import 'dart:async';
import 'dart:io';

import 'package:logging/logging.dart';

final _log = Logger('YamuxExceptions');

/// Base class for all Yamux-related exceptions
abstract class YamuxException implements Exception {
  final String message;
  final dynamic originalException; // Changed to dynamic to handle both Exception and Error
  final StackTrace? originalStackTrace;
  final DateTime timestamp;
  final Map<String, dynamic> context;

  YamuxException._internal(
    this.message, {
    this.originalException,
    this.originalStackTrace,
    Map<String, dynamic>? context,
    DateTime? timestamp,
  })  : timestamp = timestamp ?? DateTime.now(),
        context = context ?? const {};

  @override
  String toString() => 'YamuxException: $message';

  /// Creates a copy with additional context
  YamuxException withContext(Map<String, dynamic> additionalContext) {
    final newContext = Map<String, dynamic>.from(context)
      ..addAll(additionalContext);
    return _copyWith(context: newContext);
  }

  /// Abstract method for creating copies - implemented by subclasses
  YamuxException _copyWith({Map<String, dynamic>? context});
}

/// Exception thrown when a Yamux stream is in an invalid state for the requested operation
class YamuxStreamStateException extends YamuxException {
  final String currentState;
  final String requestedOperation;
  final int streamId;

  YamuxStreamStateException(
    String message, {
    required this.currentState,
    required this.requestedOperation,
    required this.streamId,
    dynamic originalException, // Changed to dynamic
    StackTrace? originalStackTrace,
    Map<String, dynamic>? context,
  }) : super._internal(
          message,
          originalException: originalException,
          originalStackTrace: originalStackTrace,
          context: {
            'currentState': currentState,
            'requestedOperation': requestedOperation,
            'streamId': streamId,
            ...?context,
          },
        );

  @override
  String toString() =>
      'YamuxStreamStateException: $message (Stream $streamId in state $currentState, operation: $requestedOperation)';

  @override
  YamuxException _copyWith({Map<String, dynamic>? context}) {
    return YamuxStreamStateException(
      message,
      currentState: currentState,
      requestedOperation: requestedOperation,
      streamId: streamId,
      originalException: originalException,
      originalStackTrace: originalStackTrace,
      context: context ?? this.context,
    );
  }
}

/// Exception thrown when a Yamux stream operation times out
class YamuxStreamTimeoutException extends YamuxException {
  final Duration timeout;
  final String operation;
  final int streamId;

  YamuxStreamTimeoutException(
    String message, {
    required this.timeout,
    required this.operation,
    required this.streamId,
    Exception? originalException,
    StackTrace? originalStackTrace,
    Map<String, dynamic>? context,
  }) : super._internal(
          message,
          originalException: originalException,
          originalStackTrace: originalStackTrace,
          context: {
            'timeout': timeout.toString(),
            'operation': operation,
            'streamId': streamId,
            ...?context,
          },
        );

  @override
  String toString() =>
      'YamuxStreamTimeoutException: $message (Stream $streamId, operation: $operation, timeout: $timeout)';

  @override
  YamuxException _copyWith({Map<String, dynamic>? context}) {
    return YamuxStreamTimeoutException(
      message,
      timeout: timeout,
      operation: operation,
      streamId: streamId,
      originalException: originalException,
      originalStackTrace: originalStackTrace,
      context: context ?? this.context,
    );
  }
}

/// Exception thrown when a Yamux stream encounters a protocol error
class YamuxStreamProtocolException extends YamuxException {
  final String protocolError;
  final int streamId;

  YamuxStreamProtocolException(
    String message, {
    required this.protocolError,
    required this.streamId,
    Exception? originalException,
    StackTrace? originalStackTrace,
    Map<String, dynamic>? context,
  }) : super._internal(
          message,
          originalException: originalException,
          originalStackTrace: originalStackTrace,
          context: {
            'protocolError': protocolError,
            'streamId': streamId,
            ...?context,
          },
        );

  @override
  String toString() =>
      'YamuxStreamProtocolException: $message (Stream $streamId, protocol error: $protocolError)';

  @override
  YamuxException _copyWith({Map<String, dynamic>? context}) {
    return YamuxStreamProtocolException(
      message,
      protocolError: protocolError,
      streamId: streamId,
      originalException: originalException,
      originalStackTrace: originalStackTrace,
      context: context ?? this.context,
    );
  }
}

/// Exception thrown when a Yamux session encounters an error
class YamuxSessionException extends YamuxException {
  final String sessionError;

  YamuxSessionException(
    String message, {
    required this.sessionError,
    Exception? originalException,
    StackTrace? originalStackTrace,
    Map<String, dynamic>? context,
  }) : super._internal(
          message,
          originalException: originalException,
          originalStackTrace: originalStackTrace,
          context: {
            'sessionError': sessionError,
            ...?context,
          },
        );

  @override
  String toString() => 'YamuxSessionException: $message (Session error: $sessionError)';

  @override
  YamuxException _copyWith({Map<String, dynamic>? context}) {
    return YamuxSessionException(
      message,
      sessionError: sessionError,
      originalException: originalException,
      originalStackTrace: originalStackTrace,
      context: context ?? this.context,
    );
  }
}

/// Utility class for handling Yamux exceptions
class YamuxExceptionHandler {
  /// Classifies and wraps exceptions that occur in Yamux operations
  static YamuxException classifyYamuxException(
    dynamic exception, // Changed to dynamic to handle both Exception and Error
    StackTrace? stackTrace, {
    int? streamId,
    String? operation,
    String? currentState,
    Map<String, dynamic>? context,
  }) {
    final baseContext = <String, dynamic>{
      'timestamp': DateTime.now().toIso8601String(),
      'operation': operation ?? 'unknown',
      if (streamId != null) 'streamId': streamId,
      if (currentState != null) 'currentState': currentState,
      ...?context,
    };

    // Handle StateError specifically (most common Yamux stream error)
    // StateError extends Error, not Exception
    if (exception is StateError) {
      final stateError = exception as StateError;
      final message = stateError.message;
      
      // Check for specific state-related errors
      if (message.contains('reset') || message.contains('Reset')) {
        return YamuxStreamStateException(
          'Stream operation failed: stream is in reset state',
          currentState: 'reset',
          requestedOperation: operation ?? 'unknown',
          streamId: streamId ?? -1,
          originalException: exception,
          originalStackTrace: stackTrace,
          context: baseContext,
        );
      }
      
      if (message.contains('closed') || message.contains('Closed')) {
        return YamuxStreamStateException(
          'Stream operation failed: stream is closed',
          currentState: 'closed',
          requestedOperation: operation ?? 'unknown',
          streamId: streamId ?? -1,
          originalException: exception,
          originalStackTrace: stackTrace,
          context: baseContext,
        );
      }
      
      if (message.contains('closing') || message.contains('Closing')) {
        return YamuxStreamStateException(
          'Stream operation failed: stream is closing',
          currentState: 'closing',
          requestedOperation: operation ?? 'unknown',
          streamId: streamId ?? -1,
          originalException: exception,
          originalStackTrace: stackTrace,
          context: baseContext,
        );
      }
      
      // Generic state error
      return YamuxStreamStateException(
        'Stream operation failed due to invalid state: $message',
        currentState: currentState ?? 'unknown',
        requestedOperation: operation ?? 'unknown',
        streamId: streamId ?? -1,
        originalException: exception,
        originalStackTrace: stackTrace,
        context: baseContext,
      );
    }

    // Handle timeout exceptions
    if (exception is TimeoutException) {
      return YamuxStreamTimeoutException(
        'Yamux stream operation timed out: ${exception.toString()}',
        timeout: exception.duration ?? const Duration(seconds: 30),
        operation: operation ?? 'unknown',
        streamId: streamId ?? -1,
        originalException: exception,
        originalStackTrace: stackTrace,
        context: baseContext,
      );
    }

    // Handle socket exceptions (underlying transport issues)
    if (exception is SocketException) {
      return YamuxStreamProtocolException(
        'Yamux stream socket error: ${exception.toString()}',
        protocolError: 'socket_error',
        streamId: streamId ?? -1,
        originalException: exception,
        originalStackTrace: stackTrace,
        context: baseContext,
      );
    }

    // Handle format exceptions (protocol parsing errors)
    if (exception is FormatException) {
      return YamuxStreamProtocolException(
        'Yamux stream protocol format error: ${exception.toString()}',
        protocolError: 'format_error',
        streamId: streamId ?? -1,
        originalException: exception,
        originalStackTrace: stackTrace,
        context: baseContext,
      );
    }

    // Generic Yamux exception for unclassified errors
    return YamuxStreamProtocolException(
      'Yamux stream error: ${exception.toString()}',
      protocolError: 'unknown_error',
      streamId: streamId ?? -1,
      originalException: exception,
      originalStackTrace: stackTrace,
      context: baseContext,
    );
  }

  /// Safely executes a Yamux operation with comprehensive exception handling
  static Future<T> handleYamuxOperation<T>(
    Future<T> Function() operation, {
    int? streamId,
    String? operationName,
    String? currentState,
    Map<String, dynamic>? context,
  }) async {
    try {
      return await operation();
    } catch (e, stackTrace) {
      if (e is YamuxException) {
        // Already classified, just rethrow
        rethrow;
      }
      
      // Handle both Exception and Error types (StateError extends Error, not Exception)
      if (e is Exception || e is Error) {
        final classified = classifyYamuxException(
          e, // Pass the original exception/error directly
          stackTrace,
          streamId: streamId,
          operation: operationName,
          currentState: currentState,
          context: context,
        );
        
        _log.warning(
          'Yamux operation failed: ${classified.message}',
          classified.originalException,
          classified.originalStackTrace,
        );
        
        throw classified;
      }
      
      // Other types (shouldn't happen in normal operation)
      rethrow;
    }
  }

  /// Determines if a Yamux exception represents a recoverable error
  static bool isRecoverable(YamuxException exception) {
    // Stream state exceptions are generally not recoverable at the stream level
    if (exception is YamuxStreamStateException) {
      return false;
    }
    
    // Timeout exceptions might be recoverable with retry
    if (exception is YamuxStreamTimeoutException) {
      return true;
    }
    
    // Some protocol exceptions might be recoverable
    if (exception is YamuxStreamProtocolException) {
      // Socket errors are usually not recoverable
      if (exception.protocolError == 'socket_error') {
        return false;
      }
      // Format errors are usually not recoverable
      if (exception.protocolError == 'format_error') {
        return false;
      }
      // Unknown errors - be conservative
      return false;
    }
    
    // Session exceptions are generally not recoverable
    return false;
  }

  /// Determines if a Yamux exception should trigger stream reset
  static bool shouldResetStream(YamuxException exception) {
    // Stream state exceptions usually mean the stream is already in a bad state
    if (exception is YamuxStreamStateException) {
      // If stream is already reset or closed, no need to reset again
      return !['reset', 'closed'].contains(exception.currentState);
    }
    
    // Protocol exceptions usually warrant a reset
    if (exception is YamuxStreamProtocolException) {
      return true;
    }
    
    // Timeout exceptions might warrant a reset
    if (exception is YamuxStreamTimeoutException) {
      return true;
    }
    
    // Session exceptions don't reset individual streams
    return false;
  }
}

/// Utility functions for safe Yamux operations
class YamuxExceptionUtils {
  /// Safely closes a stream without throwing exceptions
  static Future<void> safeStreamClose(dynamic stream, {String? context}) async {
    try {
      if (stream != null && stream.close != null) {
        await stream.close();
      }
    } catch (e) {
      _log.warning('Error during safe stream close${context != null ? ' ($context)' : ''}: $e');
    }
  }

  /// Safely resets a stream without throwing exceptions
  static Future<void> safeStreamReset(dynamic stream, {String? context}) async {
    try {
      if (stream != null && stream.reset != null) {
        await stream.reset();
      }
    } catch (e) {
      _log.warning('Error during safe stream reset${context != null ? ' ($context)' : ''}: $e');
    }
  }

  /// Executes an operation with a timeout and proper Yamux exception handling
  static Future<T> withTimeout<T>(
    Future<T> Function() operation, {
    Duration timeout = const Duration(seconds: 30),
    int? streamId,
    String? operationName,
    String? currentState,
  }) async {
    try {
      return await operation().timeout(timeout);
    } on TimeoutException catch (e, stackTrace) {
      throw YamuxExceptionHandler.classifyYamuxException(
        e,
        stackTrace,
        streamId: streamId,
        operation: operationName,
        currentState: currentState,
      );
    } catch (e, stackTrace) {
      // Handle both Exception and Error types (StateError extends Error, not Exception)
      if (e is Exception || e is Error) {
        throw YamuxExceptionHandler.classifyYamuxException(
          e,
          stackTrace,
          streamId: streamId,
          operation: operationName,
          currentState: currentState,
        );
      }
      rethrow;
    }
  }
}
