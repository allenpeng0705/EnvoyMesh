/// Base class for libp2p-related exceptions
abstract class Libp2pException implements Exception {
  String get message;
}

/// Thrown when protocol negotiation fails
class ProtocolNegotiationException extends Libp2pException {
  @override
  final String message;
  ProtocolNegotiationException(this.message);
}

/// Thrown when connection establishment fails
class ConnectionFailedException extends Libp2pException {
  @override
  final String message;
  ConnectionFailedException(this.message);
} 