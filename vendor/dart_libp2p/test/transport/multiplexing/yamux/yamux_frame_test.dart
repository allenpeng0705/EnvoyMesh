import 'dart:typed_data';

import 'package:test/test.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/yamux/frame.dart';

void main() {
  group('YamuxFrame', () {
    test('creates data frame correctly', () {
      final data = Uint8List.fromList([1, 2, 3, 4, 5]);
      final frame = YamuxFrame.createData(1, data);
      
      expect(frame.type, equals(YamuxFrameType.dataFrame));
      expect(frame.flags, equals(0));
      expect(frame.streamId, equals(1));
      expect(frame.length, equals(5));
      expect(frame.data, equals(data));
    });

    test('creates window update frame correctly', () {
      final frame = YamuxFrame.windowUpdate(1, 1024);

      expect(frame.type, equals(YamuxFrameType.windowUpdate));
      expect(frame.flags, equals(0));
      expect(frame.streamId, equals(1));
      expect(frame.length, equals(1024));
      expect(frame.data, isEmpty);
    });

    test('creates SYN stream frame correctly', () {
      final frame = YamuxFrame.synStream(1);

      expect(frame.type, equals(YamuxFrameType.windowUpdate));
      expect(frame.flags, equals(YamuxFlags.syn));
      expect(frame.streamId, equals(1));
      expect(frame.length, equals(0));
      expect(frame.data, isEmpty);
    });

    test('creates reset frame correctly', () {
      final frame = YamuxFrame.reset(1);

      expect(frame.type, equals(YamuxFrameType.windowUpdate));
      expect(frame.flags, equals(YamuxFlags.rst));
      expect(frame.streamId, equals(1));
      expect(frame.length, equals(0));
      expect(frame.data, isEmpty);
    });

    test('creates ping frame correctly', () {
      final frame = YamuxFrame.ping(false, 42);

      expect(frame.type, equals(YamuxFrameType.ping));
      expect(frame.flags, equals(YamuxFlags.syn));
      expect(frame.streamId, equals(0));
      expect(frame.length, equals(42));
      expect(frame.data, isEmpty);
    });

    test('creates ping ack frame correctly', () {
      final frame = YamuxFrame.ping(true, 42);

      expect(frame.type, equals(YamuxFrameType.ping));
      expect(frame.flags, equals(YamuxFlags.ack));
      expect(frame.streamId, equals(0));
      expect(frame.length, equals(42));
      expect(frame.data, isEmpty);
    });

    test('creates go away frame correctly', () {
      final frame = YamuxFrame.goAway(1);

      expect(frame.type, equals(YamuxFrameType.goAway));
      expect(frame.flags, equals(0));
      expect(frame.streamId, equals(0));
      expect(frame.length, equals(1));
      expect(frame.data, isEmpty);
    });

    group('frame serialization', () {
      test('serializes and deserializes data frame', () {
        final data = Uint8List.fromList([1, 2, 3, 4, 5]);
        final original = YamuxFrame.createData(1, data);
        final bytes = original.toBytes();
        final decoded = YamuxFrame.fromBytes(bytes);
        
        expect(decoded.type, equals(original.type));
        expect(decoded.flags, equals(original.flags));
        expect(decoded.streamId, equals(original.streamId));
        expect(decoded.length, equals(original.length));
        expect(decoded.data, equals(original.data));
      });

      test('serializes and deserializes window update frame', () {
        final original = YamuxFrame.windowUpdate(1, 1024);
        final bytes = original.toBytes();
        final decoded = YamuxFrame.fromBytes(bytes);
        
        expect(decoded.type, equals(original.type));
        expect(decoded.flags, equals(original.flags));
        expect(decoded.streamId, equals(original.streamId));
        expect(decoded.length, equals(original.length));
        expect(decoded.data, equals(original.data));
      });

      test('handles invalid frame version', () {
        final data = Uint8List(12);  // Empty frame with wrong version
        data[0] = 1;  // Set version to 1 (invalid)
        
        expect(
          () => YamuxFrame.fromBytes(data),
          throwsA(isA<FormatException>()),
        );
      });

      test('handles frame too short', () {
        final data = Uint8List(11);  // One byte too short
        
        expect(
          () => YamuxFrame.fromBytes(data),
          throwsA(isA<FormatException>()),
        );
      });

      test('handles data length mismatch', () {
        final data = Uint8List(16);  // 12 byte header + 4 bytes data
        final header = ByteData.view(data.buffer, 0, 12);
        header.setUint32(8, 8, Endian.big);  // Set length to 8 but only 4 bytes present
        
        expect(
          () => YamuxFrame.fromBytes(data),
          throwsA(isA<FormatException>()),
        );
      });
    });
  });
} 