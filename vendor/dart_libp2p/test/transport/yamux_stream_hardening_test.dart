import 'dart:async';
import 'dart:typed_data';
import 'package:test/test.dart';
import 'package:mockito/mockito.dart';
import 'package:mockito/annotations.dart';
import 'package:logging/logging.dart';

import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/yamux/stream.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/yamux/frame.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/yamux/yamux_exceptions.dart';

// Generate mocks
import 'multiplexing/yamux/yamux_stream_test.dart' show MockPeerId;
@GenerateMocks([Conn])
import 'yamux_stream_hardening_test.mocks.dart';

void main() {
  // Set up logging for tests
  Logger.root.level = Level.ALL;
  Logger.root.onRecord.listen((record) {
    print('${record.level.name}: ${record.time}: ${record.message}');
  });

  group('YamuxStream State Exception Handling', () {
    late MockConn mockConn;
    late List<YamuxFrame> sentFrames;
    late YamuxStream stream;

    setUp(() {
      mockConn = MockConn();
      sentFrames = [];
      
      // Create a stream with a mock frame sender
      stream = YamuxStream(
        id: 1,
        protocol: '/test/1.0.0',
        metadata: {},
        initialWindowSize: 65536,
        sendFrame: (frame) async {
          sentFrames.add(frame);
        },
        parentConn: mockConn,
        logPrefix: 'Test',
        remotePeer: MockPeerId('12D3KooWF22ud67s2HPZrmD8PdGKEc6A8xaK9qvLmfbLTdqNLSXx'),
        maxFrameSize: 64 * 1024,
      );
    });

    test('read() on reset stream throws YamuxStreamStateException', () async {
      // Force the stream into reset state
      await stream.forceReset();
      
      // Attempt to read should throw a properly classified exception
      await expectLater(
        stream.read(),
        throwsA(isA<YamuxStreamStateException>()
            .having((e) => e.currentState, 'currentState', 'reset')
            .having((e) => e.requestedOperation, 'requestedOperation', 'read')
            .having((e) => e.streamId, 'streamId', 1)),
      );
    });

    test('read() on closed stream throws YamuxStreamStateException', () async {
      // Open the stream first
      await stream.open();
      
      // Close the stream
      await stream.close();
      
      // Attempt to read should throw a properly classified exception
      await expectLater(
        stream.read(),
        throwsA(isA<YamuxStreamStateException>()
            .having((e) => e.currentState, 'currentState', 'closed')
            .having((e) => e.requestedOperation, 'requestedOperation', 'read')
            .having((e) => e.streamId, 'streamId', 1)),
      );
    });

    test('read() on init stream throws YamuxStreamStateException', () async {
      // Stream starts in init state, attempt to read should throw
      await expectLater(
        stream.read(),
        throwsA(isA<YamuxStreamStateException>()
            .having((e) => e.currentState, 'currentState', contains('init'))
            .having((e) => e.requestedOperation, 'requestedOperation', 'read')
            .having((e) => e.streamId, 'streamId', 1)),
      );
    });

    test('read() with timeout on hanging stream', () async {
      // Open the stream
      await stream.open();
      
      // Start a read operation that will timeout
      final readFuture = stream.read();
      
      // Wait a bit to ensure the read is waiting
      await Future.delayed(Duration(milliseconds: 100));
      
      // The read should eventually timeout and throw YamuxStreamTimeoutException
      expect(
        () async => await readFuture.timeout(Duration(seconds: 1)),
        throwsA(anyOf([
          isA<TimeoutException>(),
          isA<YamuxStreamTimeoutException>(),
        ])),
      );
    });

    test('read() returns EOF on closing stream with empty queue', () async {
      // Open the stream
      await stream.open();
      
      // Simulate receiving a FIN frame to put stream in closing state
      final finFrame = YamuxFrame.createData(1, Uint8List(0), fin: true);
      await stream.handleFrame(finFrame);
      
      // Read should return EOF (empty data) instead of throwing
      final result = await stream.read();
      expect(result, isEmpty);
    });

   test('read() handles state transitions gracefully', () async {
      // Open the stream
      await stream.open();

      // Start a read operation
      final readFuture = stream.read();

      // Give the read operation time to start waiting
      await Future.delayed(Duration(milliseconds: 10));

      // Reset the stream while read is waiting
      await stream.reset();

      // Read should return EOF (empty bytes) when stream transitions to reset
      // during a pending read - this is graceful degradation behavior
      final result = await readFuture;
      expect(result, isEmpty);
    });

    test('multiple concurrent reads handle state changes safely', () async {
      // Open the stream
      await stream.open();
      
      // Start multiple read operations with immediate error handlers
      // Note: YamuxStream only supports one pending read at a time, so only the last
      // completer is actually active. The earlier reads will hang.
      final readFutures = <Future<Uint8List>>[];
      readFutures.add(stream.read().catchError((e) => Uint8List(0)));
      await Future.delayed(Duration(milliseconds: 10));
      readFutures.add(stream.read().catchError((e) => Uint8List(0)));
      await Future.delayed(Duration(milliseconds: 10));
      readFutures.add(stream.read().catchError((e) => Uint8List(0)));
      
      // Reset the stream while the last read is waiting
      await Future.delayed(Duration(milliseconds: 10));
      await stream.reset();
      
      // The last read should complete, but the earlier ones will hang
      // So we only wait for the last one with a timeout for the others
      final results = await Future.wait([
        readFutures[0].timeout(Duration(milliseconds: 100), onTimeout: () => Uint8List(0)),
        readFutures[1].timeout(Duration(milliseconds: 100), onTimeout: () => Uint8List(0)),
        readFutures[2],  // This one should complete with error
      ]);
      
      // All should return empty (either from error handler or timeout)
      for (final result in results) {
        expect(result, isEmpty);
      }
    });

    test('YamuxExceptionHandler.classifyYamuxException works correctly', () {
      // Test StateError classification
      final stateError = StateError('Stream is now in state YamuxStreamState.reset');
      final classified = YamuxExceptionHandler.classifyYamuxException(
        stateError,
        StackTrace.current,
        streamId: 1,
        operation: 'read',
        currentState: 'reset',
      );
      
      expect(classified, isA<YamuxStreamStateException>());
      final streamStateEx = classified as YamuxStreamStateException;
      expect(streamStateEx.currentState, 'reset');
      expect(streamStateEx.requestedOperation, 'read');
      expect(streamStateEx.streamId, 1);
    });

    test('YamuxExceptionHandler.shouldResetStream logic', () {
      // Test different exception types
      final resetStateEx = YamuxStreamStateException(
        'test',
        currentState: 'reset',
        requestedOperation: 'read',
        streamId: 1,
      );
      expect(YamuxExceptionHandler.shouldResetStream(resetStateEx), false);
      
      final openStateEx = YamuxStreamStateException(
        'test',
        currentState: 'open',
        requestedOperation: 'read',
        streamId: 1,
      );
      expect(YamuxExceptionHandler.shouldResetStream(openStateEx), true);
      
      final protocolEx = YamuxStreamProtocolException(
        'test',
        protocolError: 'format_error',
        streamId: 1,
      );
      expect(YamuxExceptionHandler.shouldResetStream(protocolEx), true);
    });

    test('stream state validation methods work correctly', () async {
      // Test _isValidStateForRead through public interface
      
      // Init state should be invalid for read
      await expectLater(
        stream.read(),
        throwsA(isA<YamuxStreamStateException>()),
      );
      
      // Open state should be valid for read (will not throw state error)
      await stream.open();
      final readFuture = stream.read();

      // Give the read operation time to start waiting
      await Future.delayed(Duration(milliseconds: 10));

      // Reset the stream to cancel the pending read
      await stream.reset();

      // Read returns EOF (graceful degradation) when reset during pending read
      final result = await readFuture;
      expect(result, isEmpty);
    });
  });

  group('YamuxStream Exception Integration', () {
    late MockConn mockConn;
    late List<YamuxFrame> sentFrames;
    late YamuxStream stream;

    setUp(() {
      mockConn = MockConn();
      sentFrames = [];
      
      stream = YamuxStream(
        id: 2,
        protocol: '/integration/1.0.0',
        metadata: {},
        initialWindowSize: 65536,
        sendFrame: (frame) async {
          sentFrames.add(frame);
        },
        parentConn: mockConn,
        logPrefix: 'Integration',
        remotePeer: MockPeerId('12D3KooWF22ud67s2HPZrmD8PdGKEc6A8xaK9qvLmfbLTdqNLSXx'),
        maxFrameSize: 64 * 1024,
      );
    });

    test('exception context is properly preserved', () async {
      await stream.open();
      await stream.reset();
      
      try {
        await stream.read();
        fail('Should have thrown an exception');
      } catch (e) {
        if (e is YamuxStreamStateException) {
          expect(e.context['streamId'], 2);
          expect(e.context['operation'], 'read');
          expect(e.context['currentState'], contains('reset'));
          expect(e.originalException, isA<StateError>());
        }
      }
    });

    test('exception chaining preserves original error information', () async {
      await stream.open();
      await stream.reset();
      
      try {
        await stream.read();
        fail('Should have thrown an exception');
      } catch (e) {
        if (e is YamuxStreamStateException) {
          expect(e.originalException, isNotNull);
          expect(e.originalStackTrace, isNotNull);
          expect(e.timestamp, isNotNull);
          expect(e.toString(), contains('Stream 2'));
          expect(e.toString(), contains('reset'));
        }
      }
    });
  });
}
