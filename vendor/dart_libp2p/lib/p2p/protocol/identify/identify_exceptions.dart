/// Exceptions specific to the Identify protocol.
///
/// These typed exceptions allow callers to catch and handle specific
/// identify failure scenarios differently.

import 'package:dart_libp2p/core/peer/peer_id.dart';

/// Base class for all identify-related exceptions.
///
/// This allows callers to catch all identify exceptions with a single catch block
/// if they don't need to differentiate between specific failure modes.
abstract class IdentifyException implements Exception {
  /// The peer ID for which identification failed (if known).
  final PeerId? peerId;
  
  /// A descriptive message about the failure.
  final String message;
  
  /// The underlying cause of the failure (if any).
  final Object? cause;
  
  IdentifyException({
    this.peerId,
    required this.message,
    this.cause,
  });
  
  @override
  String toString() {
    final peerStr = peerId != null ? ' (peer: $peerId)' : '';
    final causeStr = cause != null ? ' caused by: $cause' : '';
    return '$runtimeType: $message$peerStr$causeStr';
  }
}

/// Exception thrown when identify protocol negotiation times out.
///
/// This occurs when the remote peer doesn't respond to the identify protocol
/// within the expected timeout window. Common causes:
/// - Remote peer has gone offline
/// - Network connectivity issues
/// - Remote peer is overloaded and not responding
///
/// This exception is NOT a security failure - the peer may be valid but
/// simply unreachable. Applications should handle this gracefully without
/// crashing, typically by:
/// - Logging the failure
/// - Removing the peer from active connection pool
/// - Retrying later with exponential backoff
class IdentifyTimeoutException extends IdentifyException {
  /// The duration before the timeout occurred.
  final Duration? timeout;
  
  IdentifyTimeoutException({
    PeerId? peerId,
    required String message,
    this.timeout,
    Object? cause,
  }) : super(peerId: peerId, message: message, cause: cause);
  
  /// Creates an IdentifyTimeoutException from a generic exception.
  ///
  /// This factory method helps convert generic timeout exceptions into
  /// typed IdentifyTimeoutException instances.
  factory IdentifyTimeoutException.fromException({
    required PeerId peerId,
    required Object exception,
    Duration? timeout,
  }) {
    return IdentifyTimeoutException(
      peerId: peerId,
      message: 'Identify timeout for peer $peerId',
      timeout: timeout,
      cause: exception,
    );
  }
}

/// Exception thrown when identify stream negotiation fails.
///
/// This occurs when:
/// - Unable to open a stream to the peer
/// - Multistream protocol negotiation fails
/// - Stream is closed by remote during negotiation
class IdentifyStreamException extends IdentifyException {
  IdentifyStreamException({
    PeerId? peerId,
    required String message,
    Object? cause,
  }) : super(peerId: peerId, message: message, cause: cause);
}

/// Exception thrown when identify protocol returns invalid/malformed data.
///
/// This is a potential security concern - the peer may be sending
/// corrupted or malicious identify data.
class IdentifyProtocolException extends IdentifyException {
  IdentifyProtocolException({
    PeerId? peerId,
    required String message,
    Object? cause,
  }) : super(peerId: peerId, message: message, cause: cause);
}

/// Helper function to determine if an exception is a timeout-related error.
///
/// This examines the exception and its string representation to determine
/// if it represents a timeout condition.
bool isTimeoutException(Object exception) {
  final errorString = exception.toString().toLowerCase();
  return errorString.contains('timeout') || 
         errorString.contains('timed out') ||
         errorString.contains('timeoutexception');
}

/// Helper function to wrap a generic exception into an appropriate
/// IdentifyException subtype.
///
/// This is useful for converting exceptions caught during identify
/// operations into properly typed exceptions.
IdentifyException wrapIdentifyException({
  required PeerId peerId,
  required Object exception,
  Duration? timeout,
}) {
  if (isTimeoutException(exception)) {
    return IdentifyTimeoutException.fromException(
      peerId: peerId,
      exception: exception,
      timeout: timeout,
    );
  }
  
  // For now, wrap unknown exceptions as stream exceptions
  return IdentifyStreamException(
    peerId: peerId,
    message: 'Identify stream error for peer $peerId',
    cause: exception,
  );
}

