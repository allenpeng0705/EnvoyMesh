import 'dart:typed_data';
import 'package:test/test.dart';
import 'package:dart_libp2p/p2p/security/noise/message_framing.dart';

void main() {
  group('MessageFraming', () {
    test('adds length prefix correctly', () {
      final testCases = [
        Uint8List.fromList([1, 2, 3]),  // Small message
        Uint8List.fromList(List.generate(256, (i) => i % 256)),  // Message with length > 255
        Uint8List(0),  // Empty message
        Uint8List.fromList(List.generate(65535, (i) => i % 256)),  // Maximum size message
      ];

      for (final message in testCases) {
        final framedMessage = MessageFraming.addLengthPrefix(message);
        
        // Verify length
        expect(framedMessage.length, equals(message.length + MessageFraming.PREFIX_LENGTH),
          reason: 'Framed message should be original length plus prefix length');
        
        // Verify prefix contains correct length
        final expectedLength = message.length;
        expect(framedMessage[0], equals(expectedLength >> 8),
          reason: 'First byte of prefix should be high byte of length');
        expect(framedMessage[1], equals(expectedLength & 0xFF),
          reason: 'Second byte of prefix should be low byte of length');
        
        // Verify message content is preserved
        expect(framedMessage.sublist(MessageFraming.PREFIX_LENGTH), equals(message),
          reason: 'Message content should be preserved after prefix');
      }
    });

    test('extracts length from prefix correctly', () {
      final testCases = [
        (Uint8List.fromList([0, 1]), 1),  // Length 1
        (Uint8List.fromList([1, 0]), 256),  // Length 256
        (Uint8List.fromList([0xFF, 0xFF]), 65535),  // Maximum length
        (Uint8List.fromList([0, 0]), 0),  // Zero length
      ];

      for (final (prefix, expectedLength) in testCases) {
        final length = MessageFraming.extractLength(prefix);
        expect(length, equals(expectedLength),
          reason: 'Extracted length should match expected value');
      }
    });

    test('validates message length correctly', () {
      final message = Uint8List(32);
      
      // Test exact length
      MessageFraming.validateMessageLength(message, 32);  // Should not throw
      
      // Test message longer than expected
      MessageFraming.validateMessageLength(message, 16);  // Should not throw
      
      // Test message shorter than expected
      expect(
        () => MessageFraming.validateMessageLength(message, 64),
        throwsA(isA<StateError>().having(
          (e) => e.message,
          'message',
          'Failed to read complete message'
        )),
        reason: 'Should throw when message is shorter than expected length'
      );
    });

    test('handles error cases', () {
      // Test extractLength with too short prefix
      expect(
        () => MessageFraming.extractLength(Uint8List(1)),
        throwsA(isA<StateError>().having(
          (e) => e.message,
          'message',
          'Invalid length prefix'
        )),
        reason: 'Should throw when prefix is too short'
      );

      // Test validateMessageLength with zero expected length
      final message = Uint8List(0);
      MessageFraming.validateMessageLength(message, 0);  // Should not throw
      
      // Test validateMessageLength with null message
      expect(
        () => MessageFraming.validateMessageLength(Uint8List(0), 1),
        throwsA(isA<StateError>()),
        reason: 'Should throw when message is shorter than expected length'
      );
    });

    test('round trip message framing', () {
      final testMessages = [
        Uint8List.fromList([1, 2, 3]),
        Uint8List.fromList(List.generate(256, (i) => i % 256)),
        Uint8List(0),
        Uint8List.fromList(List.generate(1000, (i) => i % 256)),
      ];

      for (final original in testMessages) {
        // Add length prefix
        final framedMessage = MessageFraming.addLengthPrefix(original);
        
        // Extract length from prefix
        final prefix = framedMessage.sublist(0, MessageFraming.PREFIX_LENGTH);
        final length = MessageFraming.extractLength(prefix);
        expect(length, equals(original.length),
          reason: 'Extracted length should match original message length');
        
        // Validate and extract message
        final message = framedMessage.sublist(MessageFraming.PREFIX_LENGTH);
        MessageFraming.validateMessageLength(message, length);
        expect(message, equals(original),
          reason: 'Extracted message should match original');
      }
    });

    test('handles maximum message size', () {
      // Test message at maximum size (65535 bytes)
      final maxMessage = Uint8List(65535);
      final framedMax = MessageFraming.addLengthPrefix(maxMessage);
      expect(framedMax.length, equals(65537),  // 65535 + 2 bytes prefix
        reason: 'Framed maximum size message should have correct length');
      
      final maxPrefix = framedMax.sublist(0, MessageFraming.PREFIX_LENGTH);
      final maxLength = MessageFraming.extractLength(maxPrefix);
      expect(maxLength, equals(65535),
        reason: 'Should handle maximum message length');
      
      // Test message too large (65536 bytes)
      final tooLarge = Uint8List(65536);
      final framedTooLarge = MessageFraming.addLengthPrefix(tooLarge);
      final tooLargePrefix = framedTooLarge.sublist(0, MessageFraming.PREFIX_LENGTH);
      
      // Length should wrap around to 0 due to 16-bit limit
      expect(MessageFraming.extractLength(tooLargePrefix), equals(0),
        reason: 'Length should wrap around for oversized messages');
    });
  });
} 