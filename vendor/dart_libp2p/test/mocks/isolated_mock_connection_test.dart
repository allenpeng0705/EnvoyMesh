import 'dart:typed_data';
import 'package:test/test.dart';
import 'package:cryptography/cryptography.dart';
import 'isolated_mock_connection.dart';

void main() {
  group('MockConnection', () {
    late MockConnection conn1;
    late MockConnection conn2;

    setUp(() {
      // Use createPair instead of manual setup
      (conn1, conn2) = MockConnection.createPair(id1: 'conn1', id2: 'conn2');
    });

    tearDown(() async {
      await conn1.close();
      await conn2.close();
    });

    test('basic write and read', () async {
      final data = Uint8List.fromList([1, 2, 3]);
      await conn1.write(data);
      final received = await conn2.read();
      expect(received, equals(data));
    });

    test('concurrent reads and writes', () async {
      // Start multiple read operations before writing
      final readFutures = Future.wait([
        conn2.read(),
        conn2.read(),
        conn2.read(),
      ]);
      
      // Write data after a small delay
      await Future.delayed(Duration(milliseconds: 10));
      final testData = List.generate(3, (i) => 
        Uint8List.fromList([1, 2, 3])  // Fixed values for each array
      );
      
      for (final data in testData) {
        await conn1.write(data);
      }
      
      // Verify all reads complete with correct data
      final results = await readFutures;
      for (var i = 0; i < results.length; i++) {
        expect(results[i], equals(testData[i]));
      }
    });

    test('read with exact length', () async {
      final data = Uint8List.fromList([1, 2, 3, 4, 5]);
      await conn1.write(data);
      
      final part1 = await conn2.read(2);
      expect(part1, equals(Uint8List.fromList([1, 2])));
      
      final part2 = await conn2.read(3);
      expect(part2, equals(Uint8List.fromList([3, 4, 5])));
    });

    test('bidirectional communication', () async {
      // Start reads first
      final conn1ReadFuture = conn1.read();
      final conn2ReadFuture = conn2.read();
      
      // Then do writes
      await conn1.write(Uint8List.fromList([1, 2, 3]));
      await conn2.write(Uint8List.fromList([4, 5, 6]));
      
      // Wait for reads to complete
      final conn1Received = await conn1ReadFuture;
      final conn2Received = await conn2ReadFuture;
      
      expect(conn1Received, equals(Uint8List.fromList([4, 5, 6])));
      expect(conn2Received, equals(Uint8List.fromList([1, 2, 3])));
    });

    test('handles connection closure', () async {
      // Write some data
      await conn1.write(Uint8List.fromList([1, 2, 3]));
      
      // Close one side
      await conn1.close();
      
      // Verify the data can still be read
      final received = await conn2.read();
      expect(received, equals(Uint8List.fromList([1, 2, 3])));
      
      // Verify further writes fail
      expect(
        () => conn1.write(Uint8List.fromList([4, 5, 6])),
        throwsA(isA<StateError>()),
      );
    });

    test('handles rapid writes and reads', () async {
      final testData = List.generate(100, (i) => 
        Uint8List.fromList([1, 2, 3])  // Fixed values for each array
      );
      
      // Write all data rapidly
      await Future.wait(
        testData.map((data) => conn1.write(data))
      );
      
      // Read all data rapidly
      final results = await Future.wait(
        List.generate(100, (i) => conn2.read())
      );
      
      // Verify all data was received correctly and in order
      for (var i = 0; i < results.length; i++) {
        expect(results[i], equals(testData[i]));
      }
    });

    test('proves read chunking issue', () async {
      // Create a message that simulates our noise handshake message:
      // - 2 byte length prefix indicating 48 bytes
      // - 32 bytes of encrypted data
      // - 16 bytes of MAC
      final message = Uint8List(50)  // 2 + 32 + 16
        ..[0] = 0  // Length prefix high byte (48 in big endian)
        ..[1] = 48;  // Length prefix low byte
      // Fill the rest with recognizable patterns
      message.fillRange(2, 34, 0x42);    // Encrypted data (32 bytes)
      message.fillRange(34, 50, 0x4D);   // MAC (16 bytes)

      // Write the complete message
      await conn1.write(message);
      print('\nWrote message: ${message.toList()}');

      // Try to read it back in chunks like the noise protocol does:
      // 1. Read 2 byte length prefix
      final lengthBytes = await conn2.read(2);
      final length = (lengthBytes[0] << 8) | lengthBytes[1];
      print('Length prefix indicates: $length bytes');

      // 2. Read the full message of 'length' bytes
      final messageBody = await conn2.read(length);
      print('Actually read: ${messageBody.length} bytes');
      print('Message body: ${messageBody.toList()}');

      // This should fail because we only got 32 bytes instead of 48
      expect(messageBody.length, equals(48), 
        reason: 'Should read all 48 bytes indicated by length prefix');
      
      // The missing MAC bytes should be 0x4D
      expect(messageBody.sublist(32), 
        List.filled(16, 0x4D),
        reason: 'Should include MAC bytes');
    });

    test('correctly handles large messages with length prefix', () async {
      final (conn1, conn2) = MockConnection.createPair(
        id1: 'sender',
        id2: 'receiver',
      );

      // Create a large message (164 bytes like in the failing test)
      final messageBody = Uint8List(164)..fillRange(0, 164, 42);  // Fill with 42s
      
      // Add length prefix (2 bytes for 164)
      final fullMessage = Uint8List(166)  // 2 bytes length + 164 bytes data
        ..[0] = 164 >> 8     // High byte of length
        ..[1] = 164 & 0xFF;  // Low byte of length
      fullMessage.setRange(2, 166, messageBody);  // Copy message after length
      
      // Write the full message
      await conn1.write(fullMessage);
      
      // Read in same pattern as NoiseXXProtocol
      final lengthBytes = await conn2.read(2);
      final length = (lengthBytes[0] << 8) | lengthBytes[1];
      expect(length, equals(164), reason: 'Should read correct message length');
      
      // Try to read full message
      final receivedMessage = await conn2.read(length);
      expect(receivedMessage.length, equals(164), 
        reason: 'Should read entire message body');
      
      // Verify message contents
      expect(receivedMessage, equals(messageBody),
        reason: 'Message contents should match');
      
      // Verify no data left in buffer
      expect(conn2.debugBufferSize, equals(0),
        reason: 'Buffer should be empty after reading');
    });

    test('correctly handles message boundaries with length prefixes', () async {
      final (conn1, conn2) = MockConnection.createPair(id1: 'sender', id2: 'receiver');

      try {
        // Create two messages with length prefixes
        final message1 = Uint8List(34); // 2 byte length (32) + 32 bytes data
        message1[0] = 0;  // Length prefix high byte
        message1[1] = 32; // Length prefix low byte
        message1.fillRange(2, 34, 0x42); // Fill data with 0x42

        final message2 = Uint8List(82); // 2 byte length (80) + 80 bytes data
        message2[0] = 0;   // Length prefix high byte
        message2[1] = 80;  // Length prefix low byte
        message2.fillRange(2, 82, 0x43); // Fill data with 0x43

        // Write both messages in sequence
        await conn1.write(message1);
        await conn1.write(message2);

        // Read first length prefix (2 bytes)
        final length1Bytes = await conn2.read(2);
        final length1 = (length1Bytes[0] << 8) | length1Bytes[1];
        expect(length1, equals(32), reason: 'First message length prefix should be 32');

        // Read first message body
        final body1 = await conn2.read(length1);
        expect(body1.length, equals(32), reason: 'First message body should be 32 bytes');
        expect(body1.every((b) => b == 0x42), isTrue, reason: 'First message body should be all 0x42');

        // Read second length prefix (2 bytes)
        final length2Bytes = await conn2.read(2);
        final length2 = (length2Bytes[0] << 8) | length2Bytes[1];
        expect(length2, equals(80), reason: 'Second message length prefix should be 80');

        // Read second message body
        final body2 = await conn2.read(length2);
        expect(body2.length, equals(80), reason: 'Second message body should be 80 bytes');
        expect(body2.every((b) => b == 0x43), isTrue, reason: 'Second message body should be all 0x43');
      } finally {
        await conn1.close();
        await conn2.close();
      }
    });

    test('proves double buffering issue', () async {
      final (conn1, conn2) = MockConnection.createPair(
        id1: 'sender',
        id2: 'receiver',
      );

      try {
        // Write a length-prefixed message (like in NoiseXXProtocol)
        final message = Uint8List.fromList([1, 2, 3, 4]);  // 4 bytes of data
        final fullMessage = Uint8List(6)  // 2 bytes length + 4 bytes data
          ..[0] = 0  // Length prefix high byte (4 in big endian)
          ..[1] = 4  // Length prefix low byte
          ..setAll(2, message);
        
        print('\nStep 1: Writing full message (6 bytes)');
        await conn1.write(fullMessage);
        
        print('\nStep 2: Reading length prefix (2 bytes)');
        final lengthBytes = await conn2.read(2);
        final length = (lengthBytes[0] << 8) | lengthBytes[1];
        print('Length from prefix: $length');
        print('Buffer size after reading length: ${conn2.debugBufferSize}');
        print('Buffer contents: ${conn2.debugGetBufferContents()}');
        
        print('\nStep 3: Reading message body ($length bytes)');
        final receivedMessage = await conn2.read(length);
        print('Received message: ${receivedMessage.toList()}');
        print('Buffer size after reading message: ${conn2.debugBufferSize}');
        print('Buffer contents: ${conn2.debugGetBufferContents()}');
        
        // Try to read any remaining data
        print('\nStep 4: Attempting to read any remaining data');
        if (conn2.debugBufferSize > 0) {
          final remaining = await conn2.read();
          print('Found remaining data: ${remaining.toList()}');
        }
        
        // Verify the buffer state
        expect(conn2.debugBufferSize, equals(0),
          reason: 'Buffer should be empty after reading entire message');
      } finally {
        await conn1.close();
        await conn2.close();
      }
    });

    test('handles noise protocol message sequence', () async {
      final (sender, receiver) = MockConnection.createPair(
        id1: 'sender',
        id2: 'receiver',
      );

      // First message: e (32 bytes)
      final message1 = Uint8List(34)  // 2 bytes length + 32 bytes data
        ..[0] = 0  // Length prefix high byte (32)
        ..[1] = 32;  // Length prefix low byte
      message1.fillRange(2, 34, 0x42);  // Fill with 0x42

      // Second message: e, ee, s, es (80 bytes)
      final message2 = Uint8List(82)  // 2 bytes length + 80 bytes data
        ..[0] = 0  // Length prefix high byte (80)
        ..[1] = 80;  // Length prefix low byte
      message2.fillRange(2, 82, 0x43);  // Fill with 0x43

      // Third message: s, se (48 bytes)
      final message3 = Uint8List(50)  // 2 bytes length + 48 bytes data
        ..[0] = 0  // Length prefix high byte (48)
        ..[1] = 48;  // Length prefix low byte
      message3.fillRange(2, 50, 0x44);  // Fill with 0x44

      // Write all messages
      await sender.write(message1);
      await sender.write(message2);
      await sender.write(message3);

      // Read and verify first message
      final lengthBytes1 = await receiver.read(2);
      final length1 = (lengthBytes1[0] << 8) | lengthBytes1[1];
      expect(length1, equals(32), reason: 'First message length should be 32');
      final body1 = await receiver.read(length1);
      expect(body1.length, equals(32), reason: 'First message body should be 32 bytes');
      expect(body1.every((b) => b == 0x42), isTrue, reason: 'First message body should be all 0x42');

      // Read and verify second message
      final lengthBytes2 = await receiver.read(2);
      final length2 = (lengthBytes2[0] << 8) | lengthBytes2[1];
      expect(length2, equals(80), reason: 'Second message length should be 80');
      final body2 = await receiver.read(length2);
      expect(body2.length, equals(80), reason: 'Second message body should be 80 bytes');
      expect(body2.every((b) => b == 0x43), isTrue, reason: 'Second message body should be all 0x43');

      // Read and verify third message
      final lengthBytes3 = await receiver.read(2);
      final length3 = (lengthBytes3[0] << 8) | lengthBytes3[1];
      expect(length3, equals(48), reason: 'Third message length should be 48');
      final body3 = await receiver.read(length3);
      expect(body3.length, equals(48), reason: 'Third message body should be 48 bytes');
      expect(body3.every((b) => b == 0x44), isTrue, reason: 'Third message body should be all 0x44');

      // Close connections
      await sender.close();
      await receiver.close();
    });
  });
} 