/// STOMP protocol exceptions and error handling.

/// Base exception for all STOMP-related errors
abstract class StompException implements Exception {
  final String message;
  final Object? cause;

  const StompException(this.message, [this.cause]);

  @override
  String toString() => 'StompException: $message${cause != null ? ' (caused by: $cause)' : ''}';
}

/// Exception thrown when a STOMP frame is malformed
class StompFrameException extends StompException {
  const StompFrameException(super.message, [super.cause]);

  @override
  String toString() => 'StompFrameException: $message${cause != null ? ' (caused by: $cause)' : ''}';
}

/// Exception thrown when STOMP protocol negotiation fails
class StompProtocolException extends StompException {
  const StompProtocolException(super.message, [super.cause]);

  @override
  String toString() => 'StompProtocolException: $message${cause != null ? ' (caused by: $cause)' : ''}';
}

/// Exception thrown when STOMP connection fails
class StompConnectionException extends StompException {
  const StompConnectionException(super.message, [super.cause]);

  @override
  String toString() => 'StompConnectionException: $message${cause != null ? ' (caused by: $cause)' : ''}';
}

/// Exception thrown when STOMP authentication fails
class StompAuthenticationException extends StompException {
  const StompAuthenticationException(super.message, [super.cause]);

  @override
  String toString() => 'StompAuthenticationException: $message${cause != null ? ' (caused by: $cause)' : ''}';
}

/// Exception thrown when a STOMP subscription operation fails
class StompSubscriptionException extends StompException {
  final String? subscriptionId;

  const StompSubscriptionException(super.message, [this.subscriptionId, super.cause]);

  @override
  String toString() => 'StompSubscriptionException: $message${subscriptionId != null ? ' (subscription: $subscriptionId)' : ''}${cause != null ? ' (caused by: $cause)' : ''}';
}

/// Exception thrown when a STOMP transaction operation fails
class StompTransactionException extends StompException {
  final String? transactionId;

  const StompTransactionException(super.message, [this.transactionId, super.cause]);

  @override
  String toString() => 'StompTransactionException: $message${transactionId != null ? ' (transaction: $transactionId)' : ''}${cause != null ? ' (caused by: $cause)' : ''}';
}

/// Exception thrown when STOMP message sending fails
class StompSendException extends StompException {
  final String? destination;

  const StompSendException(super.message, [this.destination, super.cause]);

  @override
  String toString() => 'StompSendException: $message${destination != null ? ' (destination: $destination)' : ''}${cause != null ? ' (caused by: $cause)' : ''}';
}

/// Exception thrown when STOMP message acknowledgment fails
class StompAckException extends StompException {
  final String? messageId;

  const StompAckException(super.message, [this.messageId, super.cause]);

  @override
  String toString() => 'StompAckException: $message${messageId != null ? ' (message: $messageId)' : ''}${cause != null ? ' (caused by: $cause)' : ''}';
}

/// Exception thrown when STOMP frame size limits are exceeded
class StompFrameSizeException extends StompFrameException {
  final int actualSize;
  final int maxSize;

  const StompFrameSizeException(super.message, this.actualSize, this.maxSize, [super.cause]);

  @override
  String toString() => 'StompFrameSizeException: $message (actual: $actualSize, max: $maxSize)${cause != null ? ' (caused by: $cause)' : ''}';
}

/// Exception thrown when STOMP timeout occurs
class StompTimeoutException extends StompException {
  final Duration timeout;

  const StompTimeoutException(super.message, this.timeout, [super.cause]);

  @override
  String toString() => 'StompTimeoutException: $message (timeout: ${timeout.inMilliseconds}ms)${cause != null ? ' (caused by: $cause)' : ''}';
}

/// Exception thrown when STOMP heart-beat fails
class StompHeartBeatException extends StompException {
  const StompHeartBeatException(super.message, [super.cause]);

  @override
  String toString() => 'StompHeartBeatException: $message${cause != null ? ' (caused by: $cause)' : ''}';
}

/// Exception thrown when STOMP destination is invalid
class StompDestinationException extends StompException {
  final String? destination;

  const StompDestinationException(super.message, [this.destination, super.cause]);

  @override
  String toString() => 'StompDestinationException: $message${destination != null ? ' (destination: $destination)' : ''}${cause != null ? ' (caused by: $cause)' : ''}';
}

/// Exception thrown when STOMP server sends an ERROR frame
class StompServerErrorException extends StompException {
  final String? receiptId;
  final Map<String, String>? headers;

  const StompServerErrorException(super.message, [this.receiptId, this.headers, super.cause]);

  @override
  String toString() {
    var result = 'StompServerErrorException: $message';
    if (receiptId != null) {
      result += ' (receipt-id: $receiptId)';
    }
    if (headers != null && headers!.isNotEmpty) {
      result += ' (headers: $headers)';
    }
    if (cause != null) {
      result += ' (caused by: $cause)';
    }
    return result;
  }
}

/// Exception thrown when STOMP state is invalid for the requested operation
class StompStateException extends StompException {
  final String currentState;
  final String expectedState;

  const StompStateException(super.message, this.currentState, this.expectedState, [super.cause]);

  @override
  String toString() => 'StompStateException: $message (current: $currentState, expected: $expectedState)${cause != null ? ' (caused by: $cause)' : ''}';
}
