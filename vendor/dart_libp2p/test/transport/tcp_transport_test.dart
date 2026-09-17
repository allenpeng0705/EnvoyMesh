import 'dart:async';
import 'dart:typed_data';
import 'dart:io'; // For BytesBuilder and potential SocketException
import 'dart:math'; // For min function

import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/transport_conn.dart';
import 'package:dart_libp2p/core/network/rcmgr.dart';
import 'package:dart_libp2p/p2p/network/connmgr/null_conn_mgr.dart';
import 'package:dart_libp2p/p2p/transport/tcp_transport.dart';
import 'package:dart_libp2p/p2p/transport/listener.dart';
import 'package:test/test.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/yamux/session.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/multiplexer.dart' as p2p_mux; // For MultiplexerConfig
import 'package:dart_libp2p/core/network/context.dart'; // Added for Context

void main() {
  group('TCPTransport Raw Connection Tests', () {
    late TCPTransport clientTransport;
    late TCPTransport serverTransport;
    late ResourceManager resourceManager;
    late Listener listener;
    late MultiAddr actualListenAddr; // To store the address with the OS-assigned port
    TransportConn? clientConn; // Nullable, initialized in setUp
    TransportConn? serverConn; // Nullable, initialized in setUp

    setUp(() async {
      resourceManager = NullResourceManager();
      // Using NullConnMgr as we are testing raw transport, not connection management policies
      final connManager = NullConnMgr();

      clientTransport = TCPTransport(
        resourceManager: resourceManager,
        connManager: connManager,
      );
      serverTransport = TCPTransport(
        resourceManager: resourceManager,
        connManager: connManager,
      );

      final initialListenAddr = MultiAddr('/ip4/127.0.0.1/tcp/0');
      listener = await serverTransport.listen(initialListenAddr);
      actualListenAddr = listener.addr; // Get the actual address with the assigned port

      // Start accepting on the server side and dialing from the client side concurrently
      final serverAcceptFuture = listener.accept();
      final clientDialFuture = clientTransport.dial(actualListenAddr);

      // Wait for both operations to complete
      final results = await Future.wait([clientDialFuture, serverAcceptFuture]);
      clientConn = results[0] as TransportConn;
      serverConn = results[1] as TransportConn;
    });

    tearDown(() async {
      // Close connections if they were successfully established
      await clientConn?.close();
      await serverConn?.close();
      // Close the listener
      await listener.close();
    });

    test('Test the ability to send 20 bytes, which requires no looping on the read side (ideally)', () async {
      final dataToSend = Uint8List.fromList(List.generate(20, (i) => i % 256));
      
      expect(clientConn, isNotNull, reason: 'Client connection should be established.');
      expect(serverConn, isNotNull, reason: 'Server connection should be established.');

      // Client writes data
      await clientConn!.write(dataToSend);
      
      // Server reads data
      final receivedBuffer = Uint8List(dataToSend.length);
      int totalBytesRead = 0;
      
      // Loop to ensure all data is read, even if it arrives in chunks.
      // For 20 bytes, we expect this loop to iterate minimally, ideally once.
      while (totalBytesRead < dataToSend.length) {
        final chunk = await serverConn!.read(); // Read available data
        if (chunk.isEmpty) { // EOF
          if (totalBytesRead < dataToSend.length) {
            fail('Stream closed prematurely. Expected ${dataToSend.length} bytes, got $totalBytesRead');
          }
          break;
        }
        // Ensure we don't write past the buffer
        final bytesToCopy = min(chunk.length, dataToSend.length - totalBytesRead);
        receivedBuffer.setRange(totalBytesRead, totalBytesRead + bytesToCopy, chunk.sublist(0, bytesToCopy));
        totalBytesRead += bytesToCopy;

        if (totalBytesRead > dataToSend.length) { // Should not happen if server sends exact amount
             fail('Read more bytes than expected. Expected ${dataToSend.length}, got $totalBytesRead');
        }
      }
      
      expect(totalBytesRead, equals(dataToSend.length), reason: 'Should read the exact number of bytes sent.');
      expect(receivedBuffer.sublist(0, totalBytesRead), orderedEquals(dataToSend), reason: 'Received data should match sent data.');
    });

    test('Test the ability to send 500 bytes of data which requires looping on the read side', () async {
      final dataToSend = Uint8List.fromList(List.generate(500, (i) => i % 256));

      expect(clientConn, isNotNull, reason: 'Client connection should be established.');
      expect(serverConn, isNotNull, reason: 'Server connection should be established.');

      // Client writes data
      await clientConn!.write(dataToSend);
      
      // Server reads data
      final receivedBytesBuilder = BytesBuilder();
      int totalBytesRead = 0;
      
      // Loop to ensure all data is read, as 500 bytes may arrive in multiple chunks.
      while (totalBytesRead < dataToSend.length) {
        // Read available data.
        final chunk = await serverConn!.read(); // Read available data
        if (chunk.isEmpty) { // EOF
          if (totalBytesRead < dataToSend.length) {
            fail('Stream closed prematurely. Expected ${dataToSend.length} bytes, got $totalBytesRead');
          }
          break;
        }
        receivedBytesBuilder.add(chunk);
        totalBytesRead += chunk.length;
      }

      if (totalBytesRead > dataToSend.length) { // Check if more data was received than sent
          fail('Read more bytes than expected. Expected ${dataToSend.length}, got $totalBytesRead. Actual data: ${receivedBytesBuilder.toBytes()}');
      }
      
      expect(totalBytesRead, equals(dataToSend.length), reason: 'Should read the exact number of bytes sent.');
      expect(receivedBytesBuilder.toBytes(), orderedEquals(dataToSend), reason: 'Received data should match sent data.');
    });

    // Nested group for Yamux tests to manage their own TCP connection lifecycle
    group('Yamux over TCP Tests', () {
      late TCPTransport yamuxClientTransport;
      late TCPTransport yamuxServerTransport;
      late Listener yamuxListener;
      late MultiAddr yamuxActualListenAddr;
      TransportConn? clientTcpConnForYamux; // TCP connection for client Yamux
      TransportConn? serverTcpConnForYamux; // TCP connection for server Yamux
      YamuxSession? clientYamuxSession; // Renamed for clarity
      YamuxSession? serverYamuxSession; // Renamed for clarity
      late ResourceManager yamuxResourceManager;

      setUp(() async {
        yamuxResourceManager = NullResourceManager();
        // Use a new ConnManager for each Yamux test setup to ensure isolation
        final connManager = NullConnMgr(); 

        yamuxClientTransport = TCPTransport(resourceManager: yamuxResourceManager, connManager: connManager);
        yamuxServerTransport = TCPTransport(resourceManager: yamuxResourceManager, connManager: connManager);

        final initialListenAddr = MultiAddr('/ip4/127.0.0.1/tcp/0');
        yamuxListener = await yamuxServerTransport.listen(initialListenAddr);
        yamuxActualListenAddr = yamuxListener.addr;

        final serverAcceptFuture = yamuxListener.accept();
        final clientDialFuture = yamuxClientTransport.dial(yamuxActualListenAddr);

        final results = await Future.wait([clientDialFuture, serverAcceptFuture]);
        clientTcpConnForYamux = results[0] as TransportConn;
        serverTcpConnForYamux = results[1] as TransportConn;

        final multiplexerConfig = p2p_mux.MultiplexerConfig(
          keepAliveInterval: Duration.zero, // Keep-alive disabled
          maxStreamWindowSize: 1024 * 1024,
          initialStreamWindowSize: 256 * 1024,
        );

        // Ensure TCP connections are valid before creating Yamux sessions
        expect(clientTcpConnForYamux, isNotNull, reason: 'Client TCP for Yamux must be established.');
        expect(serverTcpConnForYamux, isNotNull, reason: 'Server TCP for Yamux must be established.');
        
        clientYamuxSession = YamuxSession(clientTcpConnForYamux!, multiplexerConfig, true);
        serverYamuxSession = YamuxSession(serverTcpConnForYamux!, multiplexerConfig, false);

        // Give both sessions a moment to initialize their read loops
        // and potentially exchange any initial session-level frames if applicable.
        // This might help if there's a race condition in session startup.
        await Future.delayed(Duration(milliseconds: 100)); 
      });

      tearDown(() async {
        // Closing YamuxSession should close the underlying TransportConn
        await clientYamuxSession?.close();
        await serverYamuxSession?.close();
        await yamuxListener.close();
      });

      test('Test YamuxStream for SMALL data (20 bytes)', () async {
        expect(clientYamuxSession, isNotNull, reason: 'Client Yamux session must be established.');
        expect(serverYamuxSession, isNotNull, reason: 'Server Yamux session must be established.');

        // Start accepting on the server side first
        final serverAcceptStreamFuture = serverYamuxSession!.acceptStream();
        
        // Allow the acceptStream future to be processed by the event loop
        await Future.delayed(Duration(milliseconds: 50)); // Small delay

        // Now client opens the stream
        final clientStream = await clientYamuxSession!.openStream(Context());
        
        // Now await the server's accepted stream
        final serverStream = await serverAcceptStreamFuture;

        try {
          final dataToSend = Uint8List.fromList(List.generate(20, (i) => i % 256));
          await clientStream.write(dataToSend);
          
          final receivedDataBuffer = BytesBuilder();
          int totalBytesRead = 0;
          while (totalBytesRead < dataToSend.length) {
            final chunk = await serverStream.read();
            if (chunk.isEmpty && totalBytesRead < dataToSend.length) {
              fail('Yamux stream (small data) closed prematurely. Expected ${dataToSend.length}, got $totalBytesRead');
            }
            if (chunk.isEmpty) break;
            receivedDataBuffer.add(chunk);
            totalBytesRead += chunk.length;
          }
          expect(totalBytesRead, dataToSend.length, reason: 'Should read exact small data length over Yamux.');
          expect(receivedDataBuffer.toBytes(), orderedEquals(dataToSend), reason: 'Received small data over Yamux should match sent data.');
        } finally {
          print('[SMALL DATA TEST] Finally: Closing clientStream...');
          await clientStream.close();
          print('[SMALL DATA TEST] Finally: clientStream closed.');
          // Server stream will be implicitly handled by session closure in tearDown
        }
      });

      test('Test YamuxStream for LARGE data (1000 bytes)', () async {
        expect(clientYamuxSession, isNotNull, reason: 'Client Yamux session must be established.');
        expect(serverYamuxSession, isNotNull, reason: 'Server Yamux session must be established.');

        // Start accepting on the server side first
        final serverAcceptStreamFuture = serverYamuxSession!.acceptStream();

        // Allow the acceptStream future to be processed by the event loop
        await Future.delayed(Duration(milliseconds: 50)); // Small delay
        
        // Now client opens the stream
        final clientStream = await clientYamuxSession!.openStream(Context());

        // Now await the server's accepted stream
        final serverStream = await serverAcceptStreamFuture;
        
        try {
          final dataToSend = Uint8List.fromList(List.generate(1000, (i) => i % 256));
          await clientStream.write(dataToSend);
          
          final receivedDataBuffer = BytesBuilder();
          int totalBytesRead = 0;
          while (totalBytesRead < dataToSend.length) {
            final chunk = await serverStream.read();
            if (chunk.isEmpty && totalBytesRead < dataToSend.length) {
              fail('Yamux stream (large data) closed prematurely. Expected ${dataToSend.length}, got $totalBytesRead');
            }
            if (chunk.isEmpty) break;
            receivedDataBuffer.add(chunk);
            totalBytesRead += chunk.length;
          }
          expect(totalBytesRead, dataToSend.length, reason: 'Should read exact large data length over Yamux.');
          expect(receivedDataBuffer.toBytes(), orderedEquals(dataToSend), reason: 'Received large data over Yamux should match sent data.');
        } finally {
          print('[LARGE DATA TEST] Finally: Closing clientStream...');
          await clientStream.close();
          print('[LARGE DATA TEST] Finally: clientStream closed.');
          // Server stream will be implicitly handled by session closure in tearDown
        }
      });
    });
  });
}
