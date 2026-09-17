import 'dart:typed_data';

/// Handles message framing for the Noise protocol
class MessageFraming {
  /// Length of the prefix in bytes
  static const PREFIX_LENGTH = 2;

  /// Adds length prefix to a message
  static Uint8List addLengthPrefix(Uint8List message) {
    final lengthBytes = Uint8List(PREFIX_LENGTH)
      ..[0] = message.length >> 8
      ..[1] = message.length & 0xFF;
    
    return Uint8List(PREFIX_LENGTH + message.length)
      ..setAll(0, lengthBytes)
      ..setAll(PREFIX_LENGTH, message);
  }

  /// Extracts length from prefix bytes
  static int extractLength(Uint8List prefix) {
    if (prefix.length < PREFIX_LENGTH) {
      throw StateError('Invalid length prefix');
    }
    return (prefix[0] << 8) | prefix[1];
  }

  /// Validates that a complete message was read
  static void validateMessageLength(Uint8List message, int expectedLength) {
    if (message.length < expectedLength) {
      throw StateError('Failed to read complete message');
    }
  }
} 