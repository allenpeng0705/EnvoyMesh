/// Represents the state of a Noise XX handshake
enum XXHandshakeState {
  /// Initial state
  initial,
  
  /// After sending/receiving e
  sentE,
  
  /// After sending/receiving ee, s, es
  sentEES,
  
  /// After sending/receiving s, se
  complete,
  
  /// Error state
  error
} 