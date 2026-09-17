import 'dart:typed_data';
import 'package:test/test.dart';
import 'package:cryptography/cryptography.dart';
import 'package:dart_libp2p/p2p/security/secured_connection.dart';
import '../mocks/secured_mock_connection.dart';

void main() {
  group('SecuredConnection', () {
    test('verifies length prefix and message splitting', () async {
      final (conn1, conn2) = SecuredMockConnection.createPair(
        id1: 'writer',
        id2: 'reader',
      );

      // Create test keys
      final algorithm = Chacha20.poly1305Aead();
      final key = await algorithm.newSecretKey();

      final secured1 = SecuredConnection(conn1, key, key, securityProtocolId: '');
      final secured2 = SecuredConnection(conn2, key, key, securityProtocolId: '');

      // Test with different message sizes to verify length prefix handling
      final testCases = [
        Uint8List.fromList([1, 2, 3]), // Small message
        Uint8List.fromList(List.generate(100, (i) => i)), // Medium message
        Uint8List.fromList(List.generate(1000, (i) => i % 256)), // Large message
      ];

      for (final testData in testCases) {
        await secured1.write(testData);

        // Print debug info about the write
        print('Test case size: ${testData.length}');
        print('Raw writes from conn1: ${conn1.writes}');

        final received = await secured2.read();
        expect(received, equals(testData),
          reason: 'Data should be correctly encrypted, transmitted, and decrypted for size ${testData.length}');
      }

      await conn1.close();
      await conn2.close();
    });

    test('verifies nonce handling between connections', () async {
      final (conn1, conn2) = SecuredMockConnection.createPair(
        id1: 'sender',
        id2: 'receiver',
      );

      // Create different keys for send and receive
      final algorithm = Chacha20.poly1305Aead();
      final sendKey = await algorithm.newSecretKey();
      final recvKey = await algorithm.newSecretKey();

      // Create connections with reversed keys
      final secured1 = SecuredConnection(conn1, sendKey, recvKey, securityProtocolId: '');  // sendKey for encryption
      final secured2 = SecuredConnection(conn2, recvKey, sendKey, securityProtocolId: '');  // recvKey for decryption

      // Send multiple messages to verify nonce increments correctly
      final messages = List.generate(5, (i) => 
        Uint8List.fromList(List.generate(10, (j) => (i * 10 + j) % 256))
      );

      for (final msg in messages) {
        await secured1.write(msg);
        final received = await secured2.read();
        expect(received, equals(msg),
          reason: 'Message should be correctly encrypted and decrypted with incrementing nonces');
      }

      // Verify bidirectional communication works with separate nonces
      final testData = Uint8List.fromList([1, 2, 3, 4, 5]);

      // Send from secured1 to secured2
      await secured1.write(testData);
      var received = await secured2.read();
      expect(received, equals(testData),
        reason: 'Data should transfer from secured1 to secured2');

      // Send from secured2 to secured1
      await secured2.write(testData);
      received = await secured1.read();
      expect(received, equals(testData),
        reason: 'Data should transfer from secured2 to secured1');

      await conn1.close();
      await conn2.close();
    });

    test('verifies message framing end-to-end', () async {
      final (conn1, conn2) = SecuredMockConnection.createPair(
        id1: 'sender',
        id2: 'receiver',
      );

      // Create a single key for simplicity
      final algorithm = Chacha20.poly1305Aead();
      final key = await algorithm.newSecretKey();

      final secured1 = SecuredConnection(conn1, key, key, securityProtocolId: '');
      final secured2 = SecuredConnection(conn2, key, key, securityProtocolId: '');

      // Test a single message that's large enough to verify framing
      // but small enough to debug easily
      final testData = Uint8List.fromList(List.generate(48, (i) => i));

      // Write the message
      await secured1.write(testData);

      // Capture the raw bytes written to the underlying connection
      final rawBytes = conn1.writes.first;
      print('Raw framed message: ${rawBytes.length} bytes');
      print('Length prefix: [${rawBytes[0]}, ${rawBytes[1]}]');

      // Read and decrypt
      final received = await secured2.read();
      expect(received, equals(testData),
        reason: 'Message should be correctly framed, transmitted and decrypted');

      await conn1.close();
      await conn2.close();
    });

    test('guards against double-framing', () async {
      final (conn1, conn2) = SecuredMockConnection.createPair(
        id1: 'sender',
        id2: 'receiver',
      );

      // Create a single key for simplicity
      final algorithm = Chacha20.poly1305Aead();
      final key = await algorithm.newSecretKey();

      final secured1 = SecuredConnection(conn1, key, key, securityProtocolId: '');
      final secured2 = SecuredConnection(conn2, key, key, securityProtocolId: '');

      // Create a message with a pattern that could be mistaken for a length prefix
      // First two bytes [0, 32] could be interpreted as a length prefix
      final testData = Uint8List.fromList([0, 32, ...List.generate(30, (i) => i)]);

      // Write the message
      await secured1.write(testData);

      // Verify the raw bytes have only one length prefix (4-byte big-endian)
      final rawBytes = conn1.writes.first;
      final actualLength = (rawBytes[0] << 24) | (rawBytes[1] << 16) | (rawBytes[2] << 8) | rawBytes[3];
      final encryptedData = rawBytes.sublist(4);

      // The actual length should be the encrypted data length (32) + MAC (16)
      expect(actualLength, equals(testData.length + 16),
        reason: 'Length prefix should account for encrypted data and MAC');
      expect(encryptedData.length, equals(actualLength),
        reason: 'Encrypted data length should match length prefix');

      // Read and verify the message is correctly decrypted
      final received = await secured2.read();
      expect(received, equals(testData),
        reason: 'Message should be correctly decrypted without double-framing');

      await conn1.close();
      await conn2.close();
    });
  });
} 
