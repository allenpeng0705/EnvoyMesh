import 'dart:typed_data';
import 'package:test/test.dart';

/// Minimal implementation to demonstrate XX protocol message construction
class XXProtocolConstruction {
  // Static key is always 32 bytes
  final staticKey = Uint8List.fromList(List.generate(32, (i) => i));
  
  // Identity key is also 32 bytes
  final identityKey = Uint8List.fromList(List.generate(32, (i) => 100 + i));
  
  // Signature is 64 bytes for Ed25519
  final signature = Uint8List.fromList(List.generate(64, (i) => 200 + i));

  /// Constructs first message: -> e
  /// Should be exactly 32 bytes for the ephemeral key
  Uint8List constructFirstMessage() {
    // Just an ephemeral public key (32 bytes)
    return Uint8List.fromList(List.generate(32, (i) => i));
  }

  /// Constructs second message: <- e, ee, s, es
  /// Should be 80 bytes total:
  /// - 32 bytes ephemeral key
  /// - 32 bytes encrypted static key
  /// - 16 bytes MAC
  Uint8List constructSecondMessage() {
    final ephemeralKey = Uint8List.fromList(List.generate(32, (i) => i + 50));
    final encryptedStatic = Uint8List.fromList(List.generate(32, (i) => i + 100));
    final mac = Uint8List.fromList(List.generate(16, (i) => i + 150));
    
    return Uint8List.fromList([
      ...ephemeralKey,      // 32 bytes
      ...encryptedStatic,   // 32 bytes
      ...mac,               // 16 bytes
    ]);
  }

  /// Constructs final message: -> s, se
  /// Should be:
  /// - 32 bytes encrypted static key
  /// - 16 bytes MAC for static key
  /// - N bytes encrypted payload (identity key + signature)
  /// - 16 bytes MAC for payload
  Uint8List constructFinalMessage() {
    // First part: encrypted static key + MAC
    final encryptedStatic = Uint8List.fromList(List.generate(32, (i) => i + 100));
    final staticMac = Uint8List.fromList(List.generate(16, (i) => i + 150));
    
    // Second part: encrypted payload + MAC
    final payload = [
      ...identityKey,  // 32 bytes
      ...signature,    // 64 bytes
    ];
    final encryptedPayload = Uint8List.fromList(List.generate(payload.length, (i) => i + 200));
    final payloadMac = Uint8List.fromList(List.generate(16, (i) => i + 250));
    
    return Uint8List.fromList([
      ...encryptedStatic,    // 32 bytes
      ...staticMac,         // 16 bytes
      ...encryptedPayload,  // 96 bytes (32 + 64)
      ...payloadMac,        // 16 bytes
    ]);
  }
}

void main() {
  group('XXProtocolConstruction', () {
    late XXProtocolConstruction protocol;

    setUp(() {
      protocol = XXProtocolConstruction();
    });

    test('first message has correct structure', () {
      final message = protocol.constructFirstMessage();
      expect(message.length, equals(32),
        reason: 'First message should be exactly 32 bytes (ephemeral key)');
    });

    test('second message has correct structure', () {
      final message = protocol.constructSecondMessage();
      expect(message.length, equals(80),
        reason: 'Second message should be 80 bytes (32 + 32 + 16)');
      
      // Verify components
      final ephemeralKey = message.sublist(0, 32);
      final encryptedStatic = message.sublist(32, 64);
      final mac = message.sublist(64);
      
      expect(ephemeralKey.length, equals(32), reason: 'Ephemeral key should be 32 bytes');
      expect(encryptedStatic.length, equals(32), reason: 'Encrypted static key should be 32 bytes');
      expect(mac.length, equals(16), reason: 'MAC should be 16 bytes');
    });

    test('final message has correct structure', () {
      final message = protocol.constructFinalMessage();
      expect(message.length, equals(160),
        reason: 'Final message should be 160 bytes (32 + 16 + 96 + 16)');
      
      // Verify components
      final encryptedStatic = message.sublist(0, 32);
      final staticMac = message.sublist(32, 48);
      final encryptedPayload = message.sublist(48, 144);
      final payloadMac = message.sublist(144);
      
      expect(encryptedStatic.length, equals(32), reason: 'Encrypted static key should be 32 bytes');
      expect(staticMac.length, equals(16), reason: 'Static MAC should be 16 bytes');
      expect(encryptedPayload.length, equals(96), reason: 'Encrypted payload should be 96 bytes');
      expect(payloadMac.length, equals(16), reason: 'Payload MAC should be 16 bytes');
    });
  });
} 