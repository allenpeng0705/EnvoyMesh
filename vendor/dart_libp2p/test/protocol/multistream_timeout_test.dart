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

/// Mock stream that can simulate timeout scenarios
class TimeoutMockStream implements P2PStream<Uint8List> {
  final String _id = 'timeout-mock-stream';
  final StreamController<Uint8List> _controller = StreamController<Uint8List>();
  bool _isClosed = false;
  String _protocol = '';
  final Duration _readDelay;
  final bool _shouldTimeout;

  TimeoutMockStream({
    Duration readDelay = const Duration(milliseconds: 100),
    bool shouldTimeout = false,
  }) : _readDelay = readDelay, _shouldTimeout = shouldTimeout;

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
  Conn get conn => throw UnimplementedError();

  @override
  StreamManagementScope scope() => NullScope();

  @override
  Future<Uint8List> read([int? maxLength]) async {
    if (_shouldTimeout) {
      // Simulate a hanging read that will timeout
      await Future.delayed(const Duration(minutes: 5));
      return Uint8List(0);
    }
    
    // Simulate normal read with delay
    await Future.delayed(_readDelay);
    if (_isClosed) {
      return Uint8List(0);
    }
    
    // Return some mock data
    return Uint8List.fromList([1, 2, 3, 4, 5]);
  }

  @override
  Future<void> write(Uint8List data) async {
    if (_isClosed) {
      throw StateError('Stream is closed');
    }
    _controller.add(data);
  }

  @override
  P2PStream<Uint8List> get incoming => this;

  @override
  Future<void> close() async {
    _isClosed = true;
    await _controller.close();
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
    await _controller.close();
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
  group('MultistreamMuxer Timeout Handling', () {
    test('should use configurable timeout', () async {
      // Create a muxer with fast timeout for testing
      final config = MultistreamConfig.failFast();
      final muxer = MultistreamMuxer(config: config);
      
      // Create a mock stream that will timeout
      final stream = TimeoutMockStream(shouldTimeout: true);
      
      // Attempt to read from the stream - should timeout quickly
      final stopwatch = Stopwatch()..start();
      
      expect(
        () async => await muxer.selectOneOf(stream, ['/test/protocol']),
        throwsA(isA<TimeoutException>()),
      );
      
      stopwatch.stop();
      
      // Should timeout within the configured time (5 seconds + some buffer)
      expect(stopwatch.elapsed.inSeconds, lessThan(10));
    });

    test('should retry on timeout with slow network config', () async {
      // Create a muxer with slow network config (more retries)
      final config = MultistreamConfig.slowNetwork();
      final muxer = MultistreamMuxer(config: config);
      
      // Verify the configuration is applied
      expect(muxer.maxRetries, equals(5));
      expect(muxer.readTimeout.inSeconds, equals(60));
    });

    test('should not retry with fail-fast config', () async {
      // Create a muxer with fail-fast config (no retries)
      final config = MultistreamConfig.failFast();
      final muxer = MultistreamMuxer(config: config);
      
      // Verify the configuration is applied
      expect(muxer.maxRetries, equals(0));
      expect(muxer.readTimeout.inSeconds, equals(5));
    });

    test('should use fast network config appropriately', () async {
      // Create a muxer with fast network config
      final config = MultistreamConfig.fastNetwork();
      final muxer = MultistreamMuxer(config: config);
      
      // Verify the configuration is applied
      expect(muxer.maxRetries, equals(2));
      expect(muxer.readTimeout.inSeconds, equals(10));
    });

    test('should handle stream state validation', () async {
      final muxer = MultistreamMuxer();
      
      // Create a closed stream
      final stream = TimeoutMockStream();
      await stream.close();
      
      // Attempt to use the closed stream
      expect(
        () async => await muxer.selectOneOf(stream, ['/test/protocol']),
        throwsA(isA<FormatException>()),
      );
    });

    test('should create custom configuration', () async {
      final customConfig = const MultistreamConfig(
        readTimeout: Duration(seconds: 15),
        maxRetries: 2,
        useProgressiveTimeout: false,
        retryDelay: Duration(milliseconds: 50),
        enableTimeoutLogging: false,
      );
      
      final muxer = MultistreamMuxer(config: customConfig);
      
      expect(muxer.readTimeout.inSeconds, equals(15));
      expect(muxer.maxRetries, equals(2));
      expect(muxer.config.useProgressiveTimeout, isFalse);
      expect(muxer.config.enableTimeoutLogging, isFalse);
    });

    test('should copy configuration with modifications', () async {
      final originalConfig = MultistreamConfig.fastNetwork();
      final modifiedConfig = originalConfig.copyWith(
        readTimeout: const Duration(seconds: 20),
        maxRetries: 5,
      );
      
      expect(modifiedConfig.readTimeout.inSeconds, equals(20));
      expect(modifiedConfig.maxRetries, equals(5));
      // Other values should remain from original
      expect(modifiedConfig.timeoutMultiplier, equals(1.5));
    });
  });
}
