import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/transport_conn.dart';
import 'package:dart_libp2p/core/network/rcmgr.dart';
import 'package:dart_libp2p/p2p/network/connmgr/null_conn_mgr.dart';
import 'package:dart_libp2p/p2p/transport/tcp_transport.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/yamux/session.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/multiplexer.dart' as p2p_mux;
import 'package:test/test.dart';
import 'package:logging/logging.dart';

void main() {
  // Setup logging for Yamux to observe its behavior
  hierarchicalLoggingEnabled = true;
  final yamuxLogger = Logger('YamuxSession');
  yamuxLogger.level = Level.ALL; // Capture all Yamux logs
  Logger.root.onRecord.listen((record) {
    if (record.loggerName.startsWith('YamuxSession')) {
      print('[${record.level.name}] ${record.loggerName}: ${record.message}');
      if (record.error != null) {
        print('  ERROR: ${record.error}');
      }
      if (record.stackTrace != null) {
        // print('  STACKTRACE: ${record.stackTrace}'); // Can be very verbose
      }
    }
  });

  group('Yamux One-Sided Initialization Test', () {
    late ServerSocket simpleTcpServer;
    late int serverPort;
    TCPTransport? clientTransport;
    TransportConn? clientTcpConnection;
    YamuxSession? clientYamuxSession;

    setUp(() async {
      // Start a simple TCP server that accepts one connection and does nothing
      simpleTcpServer = await ServerSocket.bind(InternetAddress.loopbackIPv4, 0);
      serverPort = simpleTcpServer.port;
      print('Simple TCP Server listening on port $serverPort');

      // Don't wait for the connection here, just start listening
      simpleTcpServer.listen((socket) {
        print('Simple TCP Server accepted a connection from ${socket.remoteAddress.address}:${socket.remotePort}');
        // Optionally, read and discard data to keep the pipe open from OS perspective
        socket.listen(
          (data) {
            // print('Simple TCP Server received ${data.length} bytes (discarding)');
          },
          onError: (e) {
            // print('Simple TCP Server socket error: $e');
            socket.destroy();
          },
          onDone: () {
            // print('Simple TCP Server socket closed by client.');
            socket.destroy();
          },
          cancelOnError: true,
        );
      });

      final resourceManager = NullResourceManager();
      final connManager = NullConnMgr();
      clientTransport = TCPTransport(resourceManager: resourceManager, connManager: connManager);
    });

    tearDown(() async {
      print('Tearing down one-sided test...');
      await clientYamuxSession?.close(); // This should also close clientTcpConnection
      // If clientTcpConnection was not closed by Yamux, close it explicitly (though it should be)
      if (clientTcpConnection != null && !(clientTcpConnection!.isClosed)) {
         print('Explicitly closing clientTcpConnection in tearDown.');
         await clientTcpConnection!.close();
      }
      await simpleTcpServer.close();
      print('Teardown complete.');
    });

    test('Client-side YamuxSession initializes against a non-Yamux TCP server', () async {
      print('Starting one-sided Yamux initialization test...');
      final serverAddr = MultiAddr('/ip4/127.0.0.1/tcp/$serverPort');
      
      try {
        clientTcpConnection = await clientTransport!.dial(serverAddr);
        expect(clientTcpConnection, isNotNull, reason: 'Client TCP connection should be established.');
        print('Client TCP connection established to simple server.');

        final multiplexerConfig = p2p_mux.MultiplexerConfig(
          keepAliveInterval: Duration.zero, // Disable keep-alive
          maxStreamWindowSize: 1024 * 1024,
          initialStreamWindowSize: 256 * 1024,
        );

        print('Attempting to create YamuxSession (client-side)...');
        // This is the critical part: does YamuxSession constructor complete and its
        // internal _readLoop start without immediate issues?
        clientYamuxSession = YamuxSession(
          clientTcpConnection!,
          multiplexerConfig,
          true, // isClient
        );
        print('YamuxSession (client-side) created.');

        // We are not opening a stream. We just want to see if the session
        // can exist, start its read loop, and not hang or crash immediately
        // when connected to a server not speaking Yamux.
        // It's expected that the _readLoop might eventually error out if it
        // tries to parse non-Yamux frames, or if the server closes the connection.
        // The main thing is that it doesn't hang the test indefinitely at construction
        // or very initial phase.

        // Give it a very short time to see if it crashes due to initial frame parsing
        // or if the read loop starts and then potentially idles or errors gracefully.
        await Future.delayed(Duration(seconds: 5)); 
        print('YamuxSession existed for 5 seconds.');

        // If YamuxSession.close() itself hangs, this test would also hang here.
        // This also tests if closing a session connected to a non-Yamux peer is clean.
        print('Attempting to close clientYamuxSession...');
        await clientYamuxSession!.close();
        print('clientYamuxSession closed.');

        // Check if the underlying TCP connection was closed by Yamux
        // This might be tricky as isClosed might not update immediately or
        // the simple server might have closed it already.
        // For this test, primary focus is on YamuxSession not hanging.
        expect(clientTcpConnection!.isClosed, isTrue, reason: 'Underlying TCP connection should be closed by YamuxSession.close()');


      } catch (e, s) {
        print('Test failed with error: $e');
        print('Stack trace: $s');
        fail('One-sided Yamux test failed: $e');
      }
    }, timeout: Timeout(Duration(seconds: 15))); // Shorter timeout for this specific test
  });
}
