/// Represents the possible states of a connection
enum ConnectionState {
  /// Connection is being established
  connecting,

  /// Connection is established and ready for use
  ready,

  /// Connection is active and transferring data
  active,

  /// Connection is idle (no active transfers)
  idle,

  /// Connection is being gracefully closed
  closing,

  /// Connection is closed
  closed,

  /// Connection encountered an error
  error
}



/// Represents a state change event in a connection
class ConnectionStateChange {
  /// The previous state of the connection
  final ConnectionState previousState;

  /// The new state of the connection
  final ConnectionState newState;

  /// The timestamp when the state change occurred
  final DateTime timestamp;

  /// Optional error that caused the state change
  final Object? error;

  /// Creates a new connection state change event
  ConnectionStateChange({
    required this.previousState,
    required this.newState,
    Object? error,
  })  : timestamp = DateTime.now(),
        error = error;

  @override
  String toString() {
    final errorStr = error != null ? ' (Error: $error)' : '';
    return 'ConnectionStateChange: $previousState -> $newState$errorStr';
  }
} 