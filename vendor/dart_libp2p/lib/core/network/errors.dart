/// Exception thrown when a temporary error occurs
class TemporaryException implements Exception {
  final String message;
  
  const TemporaryException([this.message = '']);
  
  bool get isTemporary => true;
  bool get isTimeout => false;
  
  @override
  String toString() => 'TemporaryException: $message';
}

/// Exception thrown when there are no addresses associated with a peer during a dial.
class NoRemoteAddrsException implements Exception {
  const NoRemoteAddrsException();
  
  @override
  String toString() => 'NoRemoteAddrsException: no remote addresses';
}

/// Exception thrown when attempting to open a stream to a peer with the NoDial
/// option and no usable connection is available.
class NoConnException implements Exception {
  const NoConnException();
  
  @override
  String toString() => 'NoConnException: no usable connection to peer';
}

/// Exception thrown when attempting to open a stream to a peer with only a limited
/// connection, without specifying the AllowLimitedConn option.
class LimitedConnException implements Exception {
  const LimitedConnException();
  
  @override
  String toString() => 'LimitedConnException: limited connection to peer';
}

/// Exception thrown when attempting to open a stream to a peer with only a transient
/// connection, without specifying the UseTransient option.
///
/// Deprecated: Use LimitedConnException instead.
class TransientConnException extends LimitedConnException {
  const TransientConnException();
  
  @override
  String toString() => 'TransientConnException: limited connection to peer';
}

/// Exception thrown when attempting to perform an operation that would
/// exceed system resource limits.
class ResourceLimitExceededException extends TemporaryException {
  const ResourceLimitExceededException() : super('resource limit exceeded');
}

/// Exception thrown when attempting to reserve resources in a closed resource
/// scope.
class ResourceScopeClosedException implements Exception {
  const ResourceScopeClosedException();
  
  @override
  String toString() => 'ResourceScopeClosedException: resource scope closed';
}