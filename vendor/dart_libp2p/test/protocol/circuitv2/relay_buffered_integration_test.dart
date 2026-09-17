// Copyright (c) 2024 The dart-libp2p Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

import 'dart:typed_data';

import 'package:dart_libp2p/core/network/stream.dart';
import 'package:dart_libp2p/p2p/protocol/circuitv2/util/buffered_reader.dart';
import 'package:dart_libp2p/p2p/protocol/circuitv2/pb/circuit.pb.dart' as pb;
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';
import 'package:test/test.dart';

import 'relay_buffered_integration_test.mocks.dart';

@GenerateMocks([P2PStream])
void main() {
  group('Relay BufferedReader Integration Tests', () {
    late MockP2PStream mockStream;
    late BufferedP2PStreamReader bufferedReader;

    setUp(() {
      mockStream = MockP2PStream();
      when(mockStream.isClosed).thenReturn(false);
    });

    test('STOP message followed immediately by relay data - no data loss', () async {
      bufferedReader = BufferedP2PStreamReader(mockStream);

      // Create a STOP message
      final stopMsg = pb.StopMessage()
        ..type = pb.StopMessage_Type.STATUS
        ..status = pb.Status.OK;
      
      final stopBytes = stopMsg.writeToBuffer();
      final stopLengthVarint = _encodeVarint(stopBytes.length);
      
      // Simulate relay data that immediately follows the STOP message
      final relayData = Uint8List.fromList([100, 101, 102, 103, 104, 105]);
      
      // Combine: length prefix + STOP message + relay data (all in one chunk)
      final combinedData = Uint8List.fromList([
        ...stopLengthVarint,
        ...stopBytes,
        ...relayData,
      ]);
      
      // Mock stream returns everything in one read
      when(mockStream.read()).thenAnswer((_) async => combinedData);
      
      // Read the length-delimited message manually (like DelimitedReader does)
      final messageLength = await bufferedReader.readVarint();
      expect(messageLength, equals(stopBytes.length));
      
      // Read the message bytes
      final messageBytes = await bufferedReader.readExact(messageLength);
      
      // Parse the message
      final receivedMsg = pb.StopMessage.fromBuffer(messageBytes);
      
      expect(receivedMsg.type, equals(pb.StopMessage_Type.STATUS));
      expect(receivedMsg.status, equals(pb.Status.OK));
      
      // CRITICAL: The relay data should still be in the buffer
      final remainingData = bufferedReader.remainingBuffer;
      
      expect(remainingData, equals(relayData));
      expect(remainingData.length, equals(6));
      
      print('✅ No data loss: ${remainingData.length} bytes preserved after STOP handshake');
    });

    test('Large relay data following STOP message', () async {
      bufferedReader = BufferedP2PStreamReader(mockStream);

      // Create a STOP message
      final stopMsg = pb.StopMessage()
        ..type = pb.StopMessage_Type.STATUS
        ..status = pb.Status.OK;
      
      final stopBytes = stopMsg.writeToBuffer();
      final stopLengthVarint = _encodeVarint(stopBytes.length);
      
      // Simulate large relay data (1KB)
      final relayData = Uint8List.fromList(List.generate(1024, (i) => i % 256));
      
      // Combine everything
      final combinedData = Uint8List.fromList([
        ...stopLengthVarint,
        ...stopBytes,
        ...relayData,
      ]);
      
      when(mockStream.read()).thenAnswer((_) async => combinedData);
      
      // Read the length-delimited message manually
      final messageLength = await bufferedReader.readVarint();
      final messageBytes = await bufferedReader.readExact(messageLength);
      final receivedMsg = pb.StopMessage.fromBuffer(messageBytes);
      
      expect(receivedMsg.status, equals(pb.Status.OK));
      
      // Verify all relay data is preserved
      final remainingData = bufferedReader.remainingBuffer;
      
      expect(remainingData.length, equals(1024));
      expect(remainingData, equals(relayData));
      
      print('✅ Large data preserved: ${remainingData.length} bytes after STOP handshake');
    });

    test('Multiple messages - verify buffer management', () async {
      bufferedReader = BufferedP2PStreamReader(mockStream);

      // Create first message
      final msg1 = pb.StopMessage()
        ..type = pb.StopMessage_Type.STATUS
        ..status = pb.Status.OK;
      
      final msg1Bytes = msg1.writeToBuffer();
      final msg1LengthVarint = _encodeVarint(msg1Bytes.length);
      
      // Create second message
      final msg2 = pb.StopMessage()
        ..type = pb.StopMessage_Type.CONNECT
        ..status = pb.Status.OK;
      
      final msg2Bytes = msg2.writeToBuffer();
      final msg2LengthVarint = _encodeVarint(msg2Bytes.length);
      
      // Application data after both messages
      final appData = Uint8List.fromList([200, 201, 202]);
      
      // Combine all
      final combinedData = Uint8List.fromList([
        ...msg1LengthVarint,
        ...msg1Bytes,
        ...msg2LengthVarint,
        ...msg2Bytes,
        ...appData,
      ]);
      
      when(mockStream.read()).thenAnswer((_) async => combinedData);
      
      // Read first message
      final length1 = await bufferedReader.readVarint();
      final bytes1 = await bufferedReader.readExact(length1);
      final receivedMsg1 = pb.StopMessage.fromBuffer(bytes1);
      
      expect(receivedMsg1.type, equals(pb.StopMessage_Type.STATUS));
      
      // Read second message
      final length2 = await bufferedReader.readVarint();
      final bytes2 = await bufferedReader.readExact(length2);
      final receivedMsg2 = pb.StopMessage.fromBuffer(bytes2);
      
      expect(receivedMsg2.type, equals(pb.StopMessage_Type.CONNECT));
      
      // Verify app data is still in buffer
      final remaining = bufferedReader.remainingBuffer;
      expect(remaining, equals(appData));
      
      print('✅ Multiple messages handled correctly');
    });

    test('Chunked data arrival - buffering works correctly', () async {
      bufferedReader = BufferedP2PStreamReader(mockStream);

      // Create a STOP message
      final stopMsg = pb.StopMessage()
        ..type = pb.StopMessage_Type.STATUS
        ..status = pb.Status.OK;
      
      final stopBytes = stopMsg.writeToBuffer();
      final stopLengthVarint = _encodeVarint(stopBytes.length);
      
      final relayData = Uint8List.fromList([100, 101, 102]);
      
      // Split data into chunks
      final chunk1 = Uint8List.fromList(stopLengthVarint.take(1).toList());
      final chunk2 = Uint8List.fromList([
        ...stopLengthVarint.skip(1),
        ...stopBytes.take(stopBytes.length ~/ 2),
      ]);
      final chunk3 = Uint8List.fromList([
        ...stopBytes.skip(stopBytes.length ~/ 2),
        ...relayData,
      ]);
      
      var callCount = 0;
      when(mockStream.read()).thenAnswer((_) async {
        callCount++;
        if (callCount == 1) return chunk1;
        if (callCount == 2) return chunk2;
        if (callCount == 3) return chunk3;
        return Uint8List(0); // EOF
      });
      
      // Read the length-delimited message manually
      final messageLength = await bufferedReader.readVarint();
      final messageBytes = await bufferedReader.readExact(messageLength);
      final receivedMsg = pb.StopMessage.fromBuffer(messageBytes);
      
      expect(receivedMsg.status, equals(pb.Status.OK));
      
      // Verify relay data is preserved even with chunked arrival
      final remainingData = bufferedReader.remainingBuffer;
      
      expect(remainingData, equals(relayData));
      
      print('✅ Chunked data handled correctly: ${remainingData.length} bytes preserved');
    });

    test('Empty relay data after STOP - no false positives', () async {
      bufferedReader = BufferedP2PStreamReader(mockStream);

      // Create a STOP message with NO data following
      final stopMsg = pb.StopMessage()
        ..type = pb.StopMessage_Type.STATUS
        ..status = pb.Status.OK;
      
      final stopBytes = stopMsg.writeToBuffer();
      final stopLengthVarint = _encodeVarint(stopBytes.length);
      
      final combinedData = Uint8List.fromList([
        ...stopLengthVarint,
        ...stopBytes,
      ]);
      
      when(mockStream.read()).thenAnswer((_) async => combinedData);
      
      // Read the length-delimited message manually
      final messageLength = await bufferedReader.readVarint();
      final messageBytes = await bufferedReader.readExact(messageLength);
      final receivedMsg = pb.StopMessage.fromBuffer(messageBytes);
      
      expect(receivedMsg.status, equals(pb.Status.OK));
      
      // Buffer should be empty
      final remainingData = bufferedReader.remainingBuffer;
      
      expect(remainingData, isEmpty);
      expect(bufferedReader.hasRemainingData, isFalse);
      
      print('✅ Empty buffer case handled correctly');
    });

    test('Bidirectional simulation - source to destination', () async {
      final srcReader = BufferedP2PStreamReader(mockStream);

      // Simulate STOP message exchange and then bidirectional data flow
      final stopMsg = pb.StopMessage()
        ..type = pb.StopMessage_Type.STATUS
        ..status = pb.Status.OK;
      
      final stopBytes = stopMsg.writeToBuffer();
      final stopLengthVarint = _encodeVarint(stopBytes.length);
      
      // Simulate data from source to destination (100 bytes)
      final srcToDstData = Uint8List.fromList(List.generate(100, (i) => i));
      
      final combinedData = Uint8List.fromList([
        ...stopLengthVarint,
        ...stopBytes,
        ...srcToDstData,
      ]);
      
      when(mockStream.read()).thenAnswer((_) async => combinedData);
      
      // Read handshake manually
      final messageLength = await srcReader.readVarint();
      final messageBytes = await srcReader.readExact(messageLength);
      pb.StopMessage.fromBuffer(messageBytes); // Just parse to validate
      
      // Get relay data
      final relayedData = srcReader.remainingBuffer;
      
      expect(relayedData, equals(srcToDstData));
      expect(relayedData.length, equals(100));
      
      print('✅ Bidirectional source→dest: ${relayedData.length} bytes relayed');
    });

    test('Stress test - 1000 bytes immediately after STOP', () async {
      bufferedReader = BufferedP2PStreamReader(mockStream);

      final stopMsg = pb.StopMessage()
        ..type = pb.StopMessage_Type.STATUS
        ..status = pb.Status.OK;
      
      final stopBytes = stopMsg.writeToBuffer();
      final stopLengthVarint = _encodeVarint(stopBytes.length);
      
      // Large relay data
      final relayData = Uint8List.fromList(List.generate(1000, (i) => (i * 7) % 256));
      
      final combinedData = Uint8List.fromList([
        ...stopLengthVarint,
        ...stopBytes,
        ...relayData,
      ]);
      
      when(mockStream.read()).thenAnswer((_) async => combinedData);
      
      // Read the length-delimited message manually
      final messageLength = await bufferedReader.readVarint();
      final messageBytes = await bufferedReader.readExact(messageLength);
      pb.StopMessage.fromBuffer(messageBytes); // Just parse to validate
      
      final remainingData = bufferedReader.remainingBuffer;
      
      expect(remainingData.length, equals(1000));
      expect(remainingData, equals(relayData));
      
      // Verify data integrity byte-by-byte
      for (var i = 0; i < 1000; i++) {
        expect(remainingData[i], equals((i * 7) % 256),
            reason: 'Byte mismatch at position $i');
      }
      
      print('✅ Stress test passed: 1000 bytes verified');
    });
  });
}

/// Helper to encode a varint (simplified for testing)
Uint8List _encodeVarint(int value) {
  final bytes = <int>[];
  var v = value;
  while (v >= 0x80) {
    bytes.add((v & 0x7F) | 0x80);
    v >>= 7;
  }
  bytes.add(v & 0x7F);
  return Uint8List.fromList(bytes);
}

