import 'package:meta/meta.dart';
import 'handshake_state.dart';

/// Manages state transitions for the Noise XX handshake pattern
class NoiseStateMachine {
  final bool _isInitiator;
  XXHandshakeState _state;

  NoiseStateMachine(this._isInitiator) : _state = XXHandshakeState.initial;

  /// Gets the current state
  XXHandshakeState get state => _state;

  /// Validates if a read operation is allowed in the current state
  @visibleForTesting
  void validateRead() {
    switch (_state) {
      case XXHandshakeState.initial:
        if (_isInitiator) {
          throw StateError('Initiator cannot receive first message');
        }
        break;
      case XXHandshakeState.sentE:
        if (!_isInitiator) {
          throw StateError('Responder cannot receive second message');
        }
        break;
      case XXHandshakeState.sentEES:
        if (_isInitiator) {
          throw StateError('Initiator cannot receive third message');
        }
        break;
      case XXHandshakeState.complete:
        throw StateError('Cannot read message in completed state');
      case XXHandshakeState.error:
        throw StateError('Cannot read message in error state');
    }
  }

  /// Validates if a write operation is allowed in the current state
  @visibleForTesting
  void validateWrite() {
    switch (_state) {
      case XXHandshakeState.initial:
        if (!_isInitiator) {
          throw StateError('Responder cannot send first message');
        }
        break;
      case XXHandshakeState.sentE:
        if (_isInitiator) {
          throw StateError('Initiator cannot send second message');
        }
        break;
      case XXHandshakeState.sentEES:
        if (!_isInitiator) {
          throw StateError('Responder cannot send third message');
        }
        break;
      case XXHandshakeState.complete:
        throw StateError('Cannot write message in completed state');
      case XXHandshakeState.error:
        throw StateError('Cannot write message in error state');
    }
  }

  /// Transitions to the next state after a successful read
  void transitionAfterRead() {
    validateRead();
    switch (_state) {
      case XXHandshakeState.initial:
        _state = XXHandshakeState.sentE;
        break;
      case XXHandshakeState.sentE:
        _state = XXHandshakeState.sentEES;
        break;
      case XXHandshakeState.sentEES:
        _state = XXHandshakeState.complete;
        break;
      default:
        throw StateError('Invalid state transition from $_state');
    }
  }

  /// Transitions to the next state after a successful write
  void transitionAfterWrite() {
    validateWrite();
    switch (_state) {
      case XXHandshakeState.initial:
        _state = XXHandshakeState.sentE;
        break;
      case XXHandshakeState.sentE:
        _state = XXHandshakeState.sentEES;
        break;
      case XXHandshakeState.sentEES:
        _state = XXHandshakeState.complete;
        break;
      default:
        throw StateError('Invalid state transition from $_state');
    }
  }

  /// Transitions to error state
  void transitionToError() {
    _state = XXHandshakeState.error;
  }

  /// Returns true if the handshake is complete
  bool get isComplete => _state == XXHandshakeState.complete;
} 