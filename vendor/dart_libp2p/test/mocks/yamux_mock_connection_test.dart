import 'dart:typed_data';
import 'package:test/test.dart';
import 'yamux_mock_connection.dart';

void main() {
  group('YamuxMockConnection', () {
    test('verifies basic connection wiring', () async {
      // Create connection pair
      final (conn1, conn2) = YamuxMockConnection.createPair(
        id1: 'test1',
        id2: 'test2'
      );

      try {
        // Test data
        final testData = Uint8List.fromList([1, 2, 3, 4, 5]);
        
        // Write to conn1
        await conn1.write(testData);
        
        // Read from conn2 - should get the same data
        final received = await conn2.read();
        
        expect(received, equals(testData));
        
        // Verify conn1's buffer is empty (data wasn't looped back)
        expect(conn1.debugBufferSize, equals(0));
        
        // Write response from conn2 to conn1
        final responseData = Uint8List.fromList([6, 7, 8, 9, 10]);
        await conn2.write(responseData);
        
        // Read response from conn1
        final responseReceived = await conn1.read();
        
        expect(responseReceived, equals(responseData));
        expect(conn2.debugBufferSize, equals(0));
      } finally {
        // Clean up
        await conn1.close();
        await conn2.close();
      }
    });

    test('verifies partial reads work correctly', () async {
      final (conn1, conn2) = YamuxMockConnection.createPair();

      try {
        // Write 10 bytes
        final testData = Uint8List.fromList(List.generate(10, (i) => i));
        await conn1.write(testData);
        
        // Read first 5 bytes
        final firstHalf = await conn2.read(5);
        expect(firstHalf, equals(testData.sublist(0, 5)));
        
        // Read remaining 5 bytes
        final secondHalf = await conn2.read(5);
        expect(secondHalf, equals(testData.sublist(5)));
        
        // Buffer should be empty now
        expect(conn2.debugBufferSize, equals(0));
      } finally {
        await conn1.close();
        await conn2.close();
      }
    });
  });
} 