// Copyright (c) 2024 The dart-libp2p Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

import 'dart:async';
import 'dart:typed_data';

import 'package:dart_libp2p/core/network/stream.dart';
import 'package:dart_libp2p/p2p/protocol/circuitv2/util/buffered_reader.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';
import 'package:test/test.dart';

import 'buffered_reader_test.mocks.dart';

@GenerateMocks([P2PStream])
void main() {
  group('BufferedP2PStreamReader', () {
    late MockP2PStream mockStream;
    late BufferedP2PStreamReader reader;

    setUp(() {
      mockStream = MockP2PStream();
    });

    test('readExact() returns correct bytes', () async {
      reader = BufferedP2PStreamReader(mockStream);
      
      // Mock stream to return data in chunks
      when(mockStream.read()).thenAnswer((_) async => Uint8List.fromList([1, 2, 3, 4, 5]));
      
      final result = await reader.readExact(5);
      
      expect(result, equals([1, 2, 3, 4, 5]));
      verify(mockStream.read()).called(1);
    });

    test('readExact() reads across multiple chunks', () async {
      reader = BufferedP2PStreamReader(mockStream);
      
      // Mock stream to return data in small chunks
      var callCount = 0;
      when(mockStream.read()).thenAnswer((_) async {
        callCount++;
        if (callCount == 1) return Uint8List.fromList([1, 2]);
        if (callCount == 2) return Uint8List.fromList([3, 4]);
        if (callCount == 3) return Uint8List.fromList([5, 6, 7]);
        return Uint8List(0); // EOF
      });
      
      final result = await reader.readExact(6);
      
      expect(result, equals([1, 2, 3, 4, 5, 6]));
      expect(callCount, equals(3));
    });

    test('readExact() throws on EOF before reading enough bytes', () async {
      reader = BufferedP2PStreamReader(mockStream);
      
      // Mock stream returns only 3 bytes then EOF
      var callCount = 0;
      when(mockStream.read()).thenAnswer((_) async {
        callCount++;
        if (callCount == 1) return Uint8List.fromList([1, 2, 3]);
        return Uint8List(0); // EOF
      });
      
      await expectLater(
        reader.readExact(10),
        throwsA(isA<Exception>().having((e) => e.toString(), 'message', contains('Unexpected EOF'))),
      );
    });

    test('readByte() returns single byte', () async {
      reader = BufferedP2PStreamReader(mockStream);
      
      when(mockStream.read()).thenAnswer((_) async => Uint8List.fromList([42, 43, 44]));
      
      final byte1 = await reader.readByte();
      final byte2 = await reader.readByte();
      
      expect(byte1, equals(42));
      expect(byte2, equals(43));
      verify(mockStream.read()).called(1); // Should only read once for multiple readByte calls
    });

    test('remainingBuffer returns unconsumed data', () async {
      reader = BufferedP2PStreamReader(mockStream);
      
      // Mock stream to return 10 bytes
      when(mockStream.read()).thenAnswer((_) async => Uint8List.fromList([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
      
      // Read only 5 bytes
      await reader.readExact(5);
      
      // Get remaining buffer
      final remaining = reader.remainingBuffer;
      
      expect(remaining, equals([6, 7, 8, 9, 10]));
      expect(reader.hasRemainingData, isFalse); // Buffer should be consumed
    });

    test('remainingBuffer is empty when all data consumed', () async {
      reader = BufferedP2PStreamReader(mockStream);
      
      when(mockStream.read()).thenAnswer((_) async => Uint8List.fromList([1, 2, 3]));
      
      // Read all bytes
      await reader.readExact(3);
      
      final remaining = reader.remainingBuffer;
      
      expect(remaining, isEmpty);
      expect(reader.hasRemainingData, isFalse);
    });

    test('asStream() works with DelimitedReader', () async {
      reader = BufferedP2PStreamReader(mockStream);
      
      // Mock stream to return a varint-prefixed message then EOF
      var callCount = 0;
      when(mockStream.read()).thenAnswer((_) async {
        callCount++;
        if (callCount == 1) return Uint8List.fromList([5, 10, 20, 30, 40, 50]);
        return Uint8List(0); // EOF
      });
      
      final stream = reader.asStream();
      
      // Read as bytes (stream will provide the data)
      var receivedData = <int>[];
      await for (final chunk in stream) {
        receivedData.addAll(chunk);
        break; // Just read one chunk for this test
      }
      
      expect(receivedData, equals([5, 10, 20, 30, 40, 50]));
      
      // Give the pump loop time to notice cancellation
      await Future.delayed(Duration(milliseconds: 10));
    });

    test('asStream() handles EOF correctly', () async {
      reader = BufferedP2PStreamReader(mockStream);
      
      // Mock stream returns data then EOF
      var callCount = 0;
      when(mockStream.read()).thenAnswer((_) async {
        callCount++;
        if (callCount == 1) return Uint8List.fromList([1, 2, 3]);
        return Uint8List(0); // EOF
      });
      
      final stream = reader.asStream();
      final chunks = <List<int>>[];
      
      await for (final chunk in stream) {
        chunks.add(chunk);
      }
      
      expect(chunks.length, equals(1));
      expect(chunks[0], equals([1, 2, 3]));
    }, timeout: Timeout(Duration(seconds: 10)));

    test('multiple reads with partial buffer consumption', () async {
      reader = BufferedP2PStreamReader(mockStream);
      
      // Mock stream to return chunks
      var callCount = 0;
      when(mockStream.read()).thenAnswer((_) async {
        callCount++;
        if (callCount == 1) return Uint8List.fromList([1, 2, 3, 4, 5]);
        if (callCount == 2) return Uint8List.fromList([6, 7, 8, 9, 10]);
        return Uint8List(0); // EOF
      });
      
      // Read 3 bytes
      final first = await reader.readExact(3);
      expect(first, equals([1, 2, 3]));
      expect(reader.remainingLength, equals(2));
      
      // Read 5 more bytes (should consume remaining 2 + read 3 more)
      final second = await reader.readExact(5);
      expect(second, equals([4, 5, 6, 7, 8]));
      expect(reader.remainingLength, equals(2));
      
      // Get remaining
      final remaining = reader.remainingBuffer;
      expect(remaining, equals([9, 10]));
    }, timeout: Timeout(Duration(seconds: 10)));

    test('readExact(0) returns empty buffer', () async {
      reader = BufferedP2PStreamReader(mockStream);
      
      final result = await reader.readExact(0);
      
      expect(result, isEmpty);
      verifyNever(mockStream.read());
    });

    test('close() prevents further reads', () async {
      reader = BufferedP2PStreamReader(mockStream);
      
      reader.close();
      
      expect(reader.isClosed, isTrue);
      await expectLater(
        reader.readByte(),
        throwsA(isA<StateError>().having((e) => e.toString(), 'message', contains('closed'))),
      );
    });

    test('isEOF flag is set correctly', () async {
      reader = BufferedP2PStreamReader(mockStream);
      
      expect(reader.isEOF, isFalse);
      
      // Mock stream returns EOF immediately
      when(mockStream.read()).thenAnswer((_) async => Uint8List(0));
      
      // Use expectLater for async functions
      await expectLater(
        reader.readExact(1),
        throwsA(isA<Exception>()),
      );
      
      expect(reader.isEOF, isTrue);
    });

    test('critical relay scenario: STOP message + immediate data', () async {
      reader = BufferedP2PStreamReader(mockStream);
      
      // Simulate STOP message (4 bytes: length=2, data=[10,20]) followed by relay data [100,101,102]
      when(mockStream.read()).thenAnswer((_) async => Uint8List.fromList([2, 10, 20, 100, 101, 102]));
      
      // DelimitedReader would read the first message (length prefix + 2 bytes)
      final lengthByte = await reader.readByte();
      expect(lengthByte, equals(2));
      
      final messageData = await reader.readExact(2);
      expect(messageData, equals([10, 20]));
      
      // Critical: The remaining buffer should contain relay data
      final relayData = reader.remainingBuffer;
      expect(relayData, equals([100, 101, 102]));
      
      // This prevents data loss!
      expect(relayData.length, equals(3));
    });

    test('handles stream read errors gracefully', () async {
      reader = BufferedP2PStreamReader(mockStream);
      
      when(mockStream.read()).thenThrow(Exception('Stream error'));
      
      await expectLater(
        reader.readExact(5),
        throwsA(isA<Exception>().having((e) => e.toString(), 'message', contains('Stream error'))),
      );
    });

    test('asStream() is lazy - only reads on listen', () async {
      reader = BufferedP2PStreamReader(mockStream);
      
      var callCount = 0;
      when(mockStream.read()).thenAnswer((_) async {
        callCount++;
        if (callCount == 1) return Uint8List.fromList([1, 2, 3]);
        return Uint8List(0); // EOF
      });
      
      // Create stream but don't listen yet
      final stream = reader.asStream();
      
      // Wait a bit
      await Future.delayed(Duration(milliseconds: 10));
      
      // Should not have read yet
      verifyNever(mockStream.read());
      
      // Now listen
      final chunks = <List<int>>[];
      await for (final chunk in stream) {
        chunks.add(chunk);
        break;
      }
      
      // Now it should have read
      verify(mockStream.read()).called(greaterThan(0));
      
      // Give the pump loop time to notice cancellation
      await Future.delayed(Duration(milliseconds: 10));
    });
  });
}

