import 'dart:typed_data';

/// Handles basic message framing for Noise protocol messages
class NoiseMessage {
  static const MAC_LENGTH = 16;

  /// Validates that a message contains enough bytes for a MAC
  static void validateMessageWithMAC(Uint8List message) {
    if (message.length < MAC_LENGTH) {
      throw StateError('Message too short to contain MAC: ${message.length} < $MAC_LENGTH bytes');
    }
  }

  /// Extracts the encrypted payload from a message, if present
  static Uint8List? extractEncryptedPayload(Uint8List message) {
    validateMessageWithMAC(message);
    if (message.length > MAC_LENGTH) {
      final payload = message.sublist(0, message.length - MAC_LENGTH);
      return payload;
    }
    return null;
  }

  /// Extracts the MAC from a message
  static Uint8List extractMAC(Uint8List message) {
    validateMessageWithMAC(message);
    return message.sublist(message.length - MAC_LENGTH);
  }
} 