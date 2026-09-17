import 'dart:async';
import 'dart:io';
import 'package:test/test.dart';
import 'package:dart_libp2p/p2p/transport/udx_exceptions.dart';

void main() {
  group('UDX Exception Handling', () {
    test('should classify StateError with permanently lost message as UDXPacketLossException', () {
      final error = StateError('Packet permanently lost after max retries');
      final classified = UDXExceptionHandler.classifyUDXException(
        error,
        'test-context',
        StackTrace.current,
      );
      
      expect(classified, isA<UDXPacketLossException>());
      expect(classified.isTransient, isFalse);
      expect(classified.context, equals('test-context'));
      expect(classified.originalError, equals(error));
    });

    test('should classify SocketException as UDXConnectionException with transient flag', () {
      final error = SocketException('Connection refused');
      final classified = UDXExceptionHandler.classifyUDXException(
        error,
        'test-context',
        StackTrace.current,
      );
      
      expect(classified, isA<UDXConnectionException>());
      expect(classified.isTransient, isTrue); // Connection refused is transient
      expect(classified.context, equals('test-context'));
      expect(classified.originalError, equals(error));
    });

    test('should classify TimeoutException as UDXTimeoutException', () {
      final error = TimeoutException('Operation timed out', const Duration(seconds: 30));
      final classified = UDXExceptionHandler.classifyUDXException(
        error,
        'test-context',
        StackTrace.current,
      );
      
      expect(classified, isA<UDXTimeoutException>());
      expect(classified.isTransient, isTrue); // Timeouts are transient
      expect((classified as UDXTimeoutException).timeout, equals(const Duration(seconds: 30)));
      expect(classified.context, equals('test-context'));
    });

    test('should not retry UDXPacketLossException', () {
      final packetLossError = UDXPacketLossException('test-context', StateError('permanently lost'));
      
      // Test the internal retry logic
      expect(UDXExceptionHandler.shouldRetryError(packetLossError, null), isFalse);
    });

    test('should retry transient UDXConnectionException', () {
      final transientError = UDXConnectionException(
        'Connection refused',
        'test-context',
        SocketException('Connection refused'),
        isTransient: true,
      );
      
      // Test the internal retry logic  
      expect(UDXExceptionHandler.shouldRetryError(transientError, null), isTrue);
    });

    test('UDXExceptionUtils.safeClose should not throw on error', () async {
      var closeCalled = false;
      
      await UDXExceptionUtils.safeClose(
        () async {
          closeCalled = true;
          throw Exception('Close failed');
        },
        'test-resource',
      );
      
      expect(closeCalled, isTrue);
      // Should complete without throwing
    });

    test('UDXExceptionUtils.withTimeout should wrap TimeoutException', () async {
      expect(
        () => UDXExceptionUtils.withTimeout(
          Future.delayed(const Duration(seconds: 2)),
          const Duration(milliseconds: 100),
          'test-operation',
        ),
        throwsA(isA<UDXTimeoutException>()),
      );
    });

    test('UDXRetryConfig.bootstrapServer should have more aggressive settings', () {
      const config = UDXRetryConfig.bootstrapServer;
      const regular = UDXRetryConfig.regular;
      
      expect(config.maxRetries, greaterThan(regular.maxRetries));
      expect(config.initialDelay, lessThan(regular.initialDelay));
      expect(config.backoffMultiplier, lessThan(regular.backoffMultiplier));
      expect(config.maxDelay, lessThan(regular.maxDelay));
    });
  });
}
