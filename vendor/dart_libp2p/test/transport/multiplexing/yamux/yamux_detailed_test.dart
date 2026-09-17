import 'dart:async';
import 'dart:typed_data';

import 'package:test/test.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/multiplexer.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/yamux/session.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/yamux/stream.dart';
// import 'package:dart_libp2p/p2p/transport/multiplexing/yamux/frame.dart'; // Frame not directly used
import 'package:dart_libp2p/core/network/context.dart' as core_context; // Added for Context
import '../../../mocks/yamux_mock_connection.dart';

void main() {
  test('detailed stream creation and data transfer', () async {
    print('\n=== Test Setup ===');

    print('Creating mock connection pair...');
    final (conn1, conn2) = YamuxMockConnection.createPair(
      id1: 'client_conn',
      id2: 'server_conn',
      enableFrameLogging: true,  // Enable detailed frame logging
    );
    print('Mock connections created with frame logging');

    print('\nCreating configuration...');
    final config = MultiplexerConfig(
      keepAliveInterval: Duration.zero,  // Disable keepalive for clearer logs
      streamReadTimeout: Duration(seconds: 2),  // Shorter timeout for faster failure
      streamWriteTimeout: Duration(seconds: 2),
      initialStreamWindowSize: 256 * 1024,
      maxStreamWindowSize: 1024 * 1024,
    );
    print('Configuration created');

    print('\n=== Session Creation ===');
    print('Creating client session...');
    final session1 = YamuxSession(conn1, config, true);
    print('Client session created');

    print('Creating server session...');
    final session2 = YamuxSession(conn2, config, false);
    print('Server session created');

    // Wait for sessions to initialize
    print('\nWaiting for sessions to initialize...');
    await Future.delayed(Duration(milliseconds: 100));
    print('Sessions initialized');

    try {
      print('\n=== Stream Creation ===');
      print('Creating new stream from client...');
      final stream1Future = session1.openStream(core_context.Context()); // Changed to openStream
      final stream2Future = session2.acceptStream();

      // Add timeout to stream creation
      final stream1 = await stream1Future.timeout(
        Duration(seconds: 5),
        onTimeout: () => throw TimeoutException('Timeout waiting for client stream creation')
      ) as YamuxStream;
      print('Client stream created with ID: ${stream1.id()}');

      final stream2 = await stream2Future.timeout(
        Duration(seconds: 5),
        onTimeout: () => throw TimeoutException('Timeout waiting for server stream acceptance')
      ) as YamuxStream;
      print('Server accepted stream with ID: ${stream2.id()}');

      print('\n=== Data Transfer ===');
      final testData = Uint8List.fromList([1, 2, 3, 4, 5]);
      print('Test data created: $testData');

      print('\nWriting data from client stream...');
      await stream1.write(testData).timeout(
        Duration(seconds: 5),
        onTimeout: () => throw TimeoutException('Timeout waiting for client write')
      );
      print('Client stream write completed');

      print('\nReading data from server stream...');
      final receivedData = await stream2.read().timeout(
        Duration(seconds: 5),
        onTimeout: () => throw TimeoutException('Timeout waiting for server read')
      );
      print('Server stream read completed, received: $receivedData');

      expect(receivedData, equals(testData));
      print('Data verification successful');

      print('\n=== Stream Closure ===');
      print('Closing client stream...');
      await stream1.close().timeout(
        Duration(seconds: 5),
        onTimeout: () => throw TimeoutException('Timeout waiting for client stream close')
      );
      print('Client stream closed');

      print('Closing server stream...');
      await stream2.close().timeout(
        Duration(seconds: 5),
        onTimeout: () => throw TimeoutException('Timeout waiting for server stream close')
      );
      print('Server stream closed');

    } finally {
      print('\n=== Cleanup ===');
      print('Closing sessions...');
      await session1.close();
      await session2.close();
      print('Sessions closed');

      print('Closing connections...');
      await conn1.close();
      await conn2.close();
      print('Connections closed');
    }
  }, timeout: Timeout(Duration(seconds: 30)));
}
