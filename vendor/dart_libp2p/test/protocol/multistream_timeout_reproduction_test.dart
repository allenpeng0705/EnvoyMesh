import 'dart:async';
import 'dart:typed_data';
import 'package:test/test.dart';
import 'package:dart_libp2p/p2p/protocol/multistream/multistream.dart';
import 'package:dart_libp2p/config/multistream_config.dart';
import 'package:dart_libp2p/core/network/stream.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/network/common.dart';
import 'package:dart_libp2p/core/network/rcmgr.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/crypto/keys.dart';

/// Mock connection for testing
class MockConn implements Conn {
  @override
  String get id => 'mock-conn-timeout-test';

  @override
  PeerId get localPeer => PeerId.fromString("QmSoLnSGccFuZQJzRadHn95W2CrSFmGLwDsTU6gEdKnHv2");

  @override
  MultiAddr get localMultiaddr => MultiAddr('/ip4/127.0.0.1/tcp/0');

  @override
  PeerId get remotePeer => PeerId.fromString("QmSoLSgciZgHiZ8isU3g2mQ3z5dSg2YV6x2v2tTjK2Yx8a");

  @override
  MultiAddr get remoteMultiaddr => MultiAddr('/ip4/127.0.0.1/tcp/0');

  @override
  Future<P2PStream<dynamic>> newStream(context) async {
    throw UnimplementedError();
  }

  @override
  Future<List<P2PStream<dynamic>>> get streams async => [];

  @override
  ConnStats get stat => MockConnStats();

  @override
  Future<void> close() async {}

  @override
  bool get isClosed => false;

  @override
  ConnScope get scope => NullScope();

  @override
  Future<PublicKey?> get remotePublicKey async => null;

  @override
  ConnState get state => const ConnState(
    streamMultiplexer: '',
    security: '',
    transport: 'mock',
    usedEarlyMuxerNegotiation: false,
  );
}

class MockConnStats implements ConnStats {
  @override
  final Stats stats = Stats(direction: Direction.inbound, opened: DateTime.now());
  
  @override
  final int numStreams = 0;
}

/// Mock stream that simulates hanging/slow reads to trigger timeouts
class HangingMockStream implements P2PStream<Uint8List> {
  final String _id = 'hanging-mock-stream';
  bool _isClosed = false;
  String _protocol = '';
  final Duration _hangDuration;
  final bool _shouldHangForever;
  final MockConn _mockConn = MockConn();

  HangingMockStream({
    Duration hangDuration = const Duration(minutes: 5),
    bool shouldHangForever = true,
  }) : _hangDuration = hangDuration, _shouldHangForever = shouldHangForever;

  @override
  String id() => _id;

  @override
  String protocol() => _protocol;

  @override
  Future<void> setProtocol(String id) async {
    _protocol = id;
  }

  @override
  StreamStats stat() => StreamStats(
    direction: Direction.inbound,
    opened: DateTime.now(),
  );

  @override
  Conn get conn => _mockConn;

  @override
  StreamManagementScope scope() => NullScope();

  @override
  Future<Uint8List> read([int? maxLength]) async {
    if (_isClosed) {
      return Uint8List(0);
    }
    
    if (_shouldHangForever) {
      // This simulates a peer that never responds - hangs indefinitely
      await Future.delayed(const Duration(hours: 1));
      return Uint8List(0);
    } else {
      // This simulates a very slow peer
      await Future.delayed(_hangDuration);
      return Uint8List.fromList([1, 2, 3, 4, 5]);
    }
  }

  @override
  Future<void> write(Uint8List data) async {
    if (_isClosed) {
      throw StateError('Stream is closed');
    }
    // Simulate successful write
  }

  @override
  P2PStream<Uint8List> get incoming => this;

  @override
  Future<void> close() async {
    _isClosed = true;
  }

  @override
  Future<void> closeWrite() async {
    // No-op for mock
  }

  @override
  Future<void> closeRead() async {
    // No-op for mock
  }

  @override
  Future<void> reset() async {
    _isClosed = true;
  }

  @override
  Future<void> setDeadline(DateTime? time) async {
    // No-op for mock
  }

  @override
  Future<void> setReadDeadline(DateTime time) async {
    // No-op for mock
  }

  @override
  Future<void> setWriteDeadline(DateTime time) async {
    // No-op for mock
  }

  @override
  bool get isClosed => _isClosed;

  @override
  bool get isWritable => !_isClosed;
}

void main() {
  group('Multistream Timeout Reproduction Tests', () {
    test('reproduces the exact 30-second timeout error from client app', () async {
      // Create a muxer with default 30-second timeout (matching the error)
      final config = const MultistreamConfig(
        readTimeout: Duration(seconds: 30),
        maxRetries: 0, // No retries to get exact timeout behavior
      );
      final muxer = MultistreamMuxer(config: config);
      
      // Create a stream that hangs indefinitely (simulating unresponsive peer)
      final hangingStream = HangingMockStream(shouldHangForever: true);
      
      // Record the start time
      final stopwatch = Stopwatch()..start();
      
      // This should reproduce the exact error:
      // "TimeoutException after 0:00:30.000000: Multistream read operation timed out"
      TimeoutException? caughtException;
      
      try {
        await muxer.selectOneOf(hangingStream, ['/test/protocol']);
        fail('Expected TimeoutException but operation completed');
      } catch (e) {
        if (e is TimeoutException) {
          caughtException = e;
        } else {
          fail('Expected TimeoutException but got: ${e.runtimeType}: $e');
        }
      }
      
      stopwatch.stop();
      
      // Verify the timeout occurred at the expected time (30 seconds ± 1 second tolerance)
      expect(stopwatch.elapsed.inSeconds, greaterThanOrEqualTo(29));
      expect(stopwatch.elapsed.inSeconds, lessThanOrEqualTo(31));
      
      // Verify the exception details match the client app error
      expect(caughtException, isNotNull);
      expect(caughtException!.duration, equals(const Duration(seconds: 30)));
      expect(caughtException.message, contains('Multistream read operation timed out'));
    });

    test('demonstrates timer exception handling problem', () async {
      // This test shows why the current Timer-based approach is problematic
      final config = const MultistreamConfig(
        readTimeout: Duration(seconds: 2), // Short timeout for quick test
        maxRetries: 0,
      );
      final muxer = MultistreamMuxer(config: config);
      final hangingStream = HangingMockStream(shouldHangForever: true);
      
      bool exceptionCaught = false;
      bool unhandledExceptionOccurred = false;
      
      // Set up a zone to catch unhandled exceptions
      await runZonedGuarded(() async {
        try {
          await muxer.selectOneOf(hangingStream, ['/test/protocol']);
        } catch (e) {
          exceptionCaught = true;
          expect(e, isA<TimeoutException>());
        }
      }, (error, stack) {
        // This would be called if the Timer throws an unhandled exception
        unhandledExceptionOccurred = true;
        print('Unhandled exception caught in zone: $error');
      });
      
      // With the current implementation, we expect the exception to be caught
      // But in some cases, Timer exceptions might escape to the zone
      expect(exceptionCaught || unhandledExceptionOccurred, isTrue);
    });

    test('timeout during protocol negotiation phase', () async {
      final config = const MultistreamConfig(
        readTimeout: Duration(seconds: 3),
        maxRetries: 0,
      );
      final muxer = MultistreamMuxer(config: config);
      
      // Add a handler to the muxer
      muxer.addHandler('/test/protocol', (protocol, stream) async {
        // Handler won't be called due to timeout
      });
      
      final hangingStream = HangingMockStream(shouldHangForever: true);
      
      // Test server-side timeout during negotiate()
      expect(
        () async => await muxer.negotiate(hangingStream),
        throwsA(isA<TimeoutException>()),
      );
    });

    test('timeout with retry configuration', () async {
      final config = const MultistreamConfig(
        readTimeout: Duration(seconds: 2),
        maxRetries: 2, // Should retry twice before final timeout
        retryDelay: Duration(milliseconds: 100),
      );
      final muxer = MultistreamMuxer(config: config);
      final hangingStream = HangingMockStream(shouldHangForever: true);
      
      final stopwatch = Stopwatch()..start();
      
      expect(
        () async => await muxer.selectOneOf(hangingStream, ['/test/protocol']),
        throwsA(isA<TimeoutException>()),
      );
      
      stopwatch.stop();
      
      // With 2 retries, we expect roughly: 2s + 2s + 2s = 6s total
      // Plus retry delays: 100ms + 200ms = 300ms
      // Total should be around 6.3 seconds (with some tolerance)
      expect(stopwatch.elapsed.inSeconds, greaterThanOrEqualTo(5));
      expect(stopwatch.elapsed.inSeconds, lessThanOrEqualTo(8));
    });

    test('stream cleanup after timeout', () async {
      final config = const MultistreamConfig(
        readTimeout: Duration(seconds: 1),
        maxRetries: 0,
      );
      final muxer = MultistreamMuxer(config: config);
      final hangingStream = HangingMockStream(shouldHangForever: true);
      
      expect(hangingStream.isClosed, isFalse);
      
      try {
        await muxer.selectOneOf(hangingStream, ['/test/protocol']);
      } catch (e) {
        expect(e, isA<TimeoutException>());
      }
      
      // The stream should be reset/closed after timeout
      // Note: This depends on the implementation properly cleaning up
      expect(hangingStream.isClosed, isTrue);
    });

    test('different timeout configurations produce expected behavior', () async {
      // Test fast network config
      final fastConfig = MultistreamConfig.fastNetwork();
      expect(fastConfig.readTimeout, equals(const Duration(seconds: 10)));
      expect(fastConfig.maxRetries, equals(2));
      
      // Test slow network config  
      final slowConfig = MultistreamConfig.slowNetwork();
      expect(slowConfig.readTimeout, equals(const Duration(seconds: 60)));
      expect(slowConfig.maxRetries, equals(5));
      
      // Test fail-fast config
      final failFastConfig = MultistreamConfig.failFast();
      expect(failFastConfig.readTimeout, equals(const Duration(seconds: 5)));
      expect(failFastConfig.maxRetries, equals(0));
    });
  });
}
