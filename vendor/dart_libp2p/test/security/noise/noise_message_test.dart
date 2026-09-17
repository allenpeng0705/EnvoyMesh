import 'dart:typed_data';
import 'package:test/test.dart';
import 'package:dart_libp2p/p2p/security/noise/noise_message.dart';

void main() {
  group('NoiseMessage', () {

    test('extracts MAC correctly', () {
      final message = Uint8List(32)..fillRange(16, 32, 0x42);  // Fill MAC portion with 0x42
      final mac = NoiseMessage.extractMAC(message);
      
      expect(mac.length, equals(NoiseMessage.MAC_LENGTH));
      expect(mac.every((b) => b == 0x42), isTrue);
    });

    test('extracts encrypted payload correctly', () {
      // Test message with no payload (just MAC)
      final noPayload = Uint8List(NoiseMessage.MAC_LENGTH);
      final extracted1 = NoiseMessage.extractEncryptedPayload(noPayload);
      expect(extracted1, isNull);

      // Test message with payload
      final withPayload = Uint8List(32);  // 16 bytes payload + 16 bytes MAC
      withPayload.fillRange(0, 16, 0x41);  // Fill payload with 0x41
      final extracted2 = NoiseMessage.extractEncryptedPayload(withPayload);
      
      expect(extracted2, isNotNull);
      expect(extracted2!.length, equals(16));
      expect(extracted2.every((b) => b == 0x41), isTrue);
    });
  });
} 