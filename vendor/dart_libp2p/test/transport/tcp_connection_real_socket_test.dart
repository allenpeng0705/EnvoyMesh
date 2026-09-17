import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:dart_libp2p/p2p/transport/tcp_connection.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/common.dart'; // Changed import
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/crypto/keys.dart';
import 'package:dart_libp2p/p2p/crypto/key_generator.dart';
import 'package:dart_libp2p/core/network/rcmgr.dart';
import 'package:dart_libp2p/core/connmgr/conn_manager.dart'; // Added for legacyConnManager if needed
import 'package:logging/logging.dart'; // Added for logging setup

import 'package:test/test.dart';

// Removed custom mock classes, will use NullResourceManager from rcmgr.dart

void main() {
  // Setup logging to see detailed logs from TCPConnection
  Logger.root.level = Level.ALL;
  Logger.root.onRecord.listen((record) {
    print('${record.level.name}: ${record.time}: ${record.loggerName}: ${record.message}');
    if (record.error != null) {
      print('ERROR: ${record.error}, STACKTRACE: ${record.stackTrace}');
    }
  });

  group('TCPConnection with Real Sockets', () {
    late ServerSocket serverSocket;
    late Socket clientSocket;
    late Socket acceptedSocket;
    late TCPConnection clientConnection;
    late StreamSubscription serverSubscription;
    final List<Uint8List> serverReceivedData = [];

    final String localHostIp = '127.0.0.1';
    int port = 0; // Will be set by ServerSocket

    late PeerId clientPeerId;
    late PeerId serverPeerId;
    late ResourceManager mockResourceManager; // Changed type to ResourceManager

    setUp(() async {
      serverReceivedData.clear();

      // Generate PeerIds
      final clientKeyPair = await generateEd25519KeyPair(); 
      clientPeerId = PeerId.fromPublicKey(clientKeyPair.publicKey); 
      final serverKeyPair = await generateEd25519KeyPair(); 
      serverPeerId = PeerId.fromPublicKey(serverKeyPair.publicKey); 

      // Use NullResourceManager
      mockResourceManager = NullResourceManager(); // Use NullResourceManager

      // Start a server
      serverSocket = await ServerSocket.bind(localHostIp, 0); // 0 for ephemeral port
      port = serverSocket.port;
      print('Test server listening on $localHostIp:$port');

      // Server accepts a connection
      final serverAcceptCompleter = Completer<Socket>();
      serverSocket.listen((socket) {
        print('Test server accepted connection from ${socket.remoteAddress.address}:${socket.remotePort}');
        acceptedSocket = socket;
        serverSubscription = acceptedSocket.listen(
          (data) {
            print('Test server received ${data.length} bytes: $data');
            serverReceivedData.add(data);
          },
          onError: (error) {
            print('Test server socket error: $error');
          },
          onDone: () {
            print('Test server socket done');
          },
        );
        serverAcceptCompleter.complete(socket);
      });

      // Client connects to the server
      print('Test client attempting to connect to $localHostIp:$port');
      clientSocket = await Socket.connect(localHostIp, port);
      clientSocket.setOption(SocketOption.tcpNoDelay, true); // Added tcpNoDelay
      print('Test client connected to ${clientSocket.remoteAddress.address}:${clientSocket.remotePort}');
      
      // Wait for server to accept
      acceptedSocket = await serverAcceptCompleter.future;
      acceptedSocket.setOption(SocketOption.tcpNoDelay, true); // Added tcpNoDelay


      // Create TCPConnection for the client
      final localClientMultiaddr = MultiAddr('/ip4/${clientSocket.address.address}/tcp/${clientSocket.port}'); // Corrected: Constructor
      final remoteServerMultiaddr = MultiAddr('/ip4/$localHostIp/tcp/$port'); // Corrected: Constructor
      
      clientConnection = await TCPConnection.create(
        clientSocket,
        localClientMultiaddr,
        remoteServerMultiaddr,
        clientPeerId,       // localPeerId for the client connection
        serverPeerId,       // remotePeerId (server's PeerId)
        mockResourceManager,
        false,              // isServer = false for client
        // legacyConnManager: null, // Optional, can be omitted
      );
      print('Client TCPConnection created. Local: ${clientConnection.localMultiaddr}, Remote: ${clientConnection.remoteMultiaddr}');
    });

    tearDown(() async {
      print('Tearing down test...');
      await serverSubscription.cancel();
      await acceptedSocket.close();
      acceptedSocket.destroy();
      await serverSocket.close();
      await clientConnection.close(); // This should close clientSocket
      print('Test teardown complete.');
    });

    test('Client can write data and server receives it', () async {
      final testData = Uint8List.fromList([1, 2, 3, 4, 5]);
      print('Test: Client writing data: $testData');
      await clientConnection.write(testData);
      
      // Allow some time for data to be processed
      await Future.delayed(Duration(milliseconds: 100)); 

      expect(serverReceivedData.isNotEmpty, isTrue, reason: "Server should have received data");
      expect(serverReceivedData.first, equals(testData), reason: "Server received data should match sent data");
      print('Test: Client write successful, server received matching data.');
    });

    test('Server can send data and client receives it', () async {
      final testData = Uint8List.fromList([10, 20, 30, 40, 50]);
      print('Test: Server sending data: $testData');
      acceptedSocket.add(testData);
      await acceptedSocket.flush();

      print('Test: Client attempting to read data');
      final receivedData = await clientConnection.read(testData.length); // Corrected: positional argument
      
      expect(receivedData, isNotNull, reason: "Client should have received data");
      expect(receivedData, equals(testData), reason: "Client received data should match sent data");
      print('Test: Server send successful, client received matching data.');
    });

    // TODO: Add more tests, especially for the "missing data" scenario
    // - Test with multiple small chunks
    // - Test with delays between chunks
    // - Test with SocketOption.tcpNoDelay (added to setUp)
    // - Replicate the S3, S4, S5 sequence from the original issue
    
    test('Server sends multiple small chunks, client reads them sequentially', () async {
      final chunk1 = Uint8List.fromList([1, 2, 3, 4, 5]); // 5 bytes
      final chunk2 = Uint8List.fromList(List.generate(30, (i) => i + 10)); // 30 bytes, "Nonce 4" size
    final chunk3 = Uint8List.fromList(List.generate(30, (i) => i + 100)); // 30 bytes, "Nonce 5" size

    print('Test: Server sending chunk 1 (${chunk1.length} bytes)');
    acceptedSocket.add(chunk1);
    await acceptedSocket.flush();
    // Small delay to ensure packets are sent separately if OS buffers
    await Future.delayed(Duration(milliseconds: 20));


    print('Test: Server sending chunk 2 (${chunk2.length} bytes)');
    acceptedSocket.add(chunk2);
    await acceptedSocket.flush();
    await Future.delayed(Duration(milliseconds: 20));

    print('Test: Server sending chunk 3 (${chunk3.length} bytes)');
    acceptedSocket.add(chunk3);
    await acceptedSocket.flush();
    
    print('Test: Client attempting to read chunk 1');
    final received1 = await clientConnection.read(chunk1.length);
    expect(received1, equals(chunk1), reason: "Client should receive chunk 1 correctly");
    print('Test: Client received chunk 1: $received1');

    print('Test: Client attempting to read chunk 2');
    final received2 = await clientConnection.read(chunk2.length);
    expect(received2, equals(chunk2), reason: "Client should receive chunk 2 correctly");
    print('Test: Client received chunk 2: $received2');
    
    print('Test: Client attempting to read chunk 3');
    final received3 = await clientConnection.read(chunk3.length);
    expect(received3, equals(chunk3), reason: "Client should receive chunk 3 correctly");
    print('Test: Client received chunk 3: $received3');

    print('Test: All chunks received successfully.');
    });

    test('Server sends partial data then closes, client reads available then EOF', () async {
      final chunkFull = Uint8List.fromList([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      final chunkPartialSent = Uint8List.fromList([11, 12, 13, 14, 15]); // Server will send this
      final chunkPartialExpectedLength = 10; // Client will try to read 10 bytes for the second chunk

      // Server sends the first full chunk
      print('Test: Server sending full chunk (${chunkFull.length} bytes)');
      acceptedSocket.add(chunkFull);
      await acceptedSocket.flush();
      await Future.delayed(Duration(milliseconds: 10)); // Ensure it's sent

      // Server sends the partial second chunk
      print('Test: Server sending partial chunk (${chunkPartialSent.length} bytes)');
      acceptedSocket.add(chunkPartialSent);
      await acceptedSocket.flush();
      await Future.delayed(Duration(milliseconds: 10)); // Ensure it's sent

      // Server closes its socket
      print('Test: Server closing its socket');
      await acceptedSocket.close();
      // Wait for onDone to propagate on client side if necessary, though read should handle it
      await Future.delayed(Duration(milliseconds: 50));


      // Client reads the first full chunk
      print('Test: Client reading first full chunk');
      final receivedFull = await clientConnection.read(chunkFull.length);
      expect(receivedFull, equals(chunkFull), reason: "Client should receive the first full chunk correctly");
      print('Test: Client received first full chunk: $receivedFull');

      // Client attempts to read the second chunk (expecting more than was sent before close)
      print('Test: Client attempting to read second chunk (expecting $chunkPartialExpectedLength bytes)');
      // With the corrected read logic, this should return the 5 bytes that were sent.
      final receivedPartial = await clientConnection.read(chunkPartialExpectedLength);
      expect(receivedPartial, equals(chunkPartialSent), reason: "Client should receive the partial data that was sent before close");
      print('Test: Client received partial data: $receivedPartial');
      
      // Subsequent read should yield EOF (empty list) because the buffer is now empty and socket is done.
      print('Test: Client attempting subsequent read (expecting EOF)');
      final eofRead = await clientConnection.read(1); // Try to read 1 byte
      expect(eofRead, isEmpty, reason: "Subsequent read after partial receive and close should be EOF");
      print('Test: Client received EOF as expected.');
    });

    test('Client read times out if server sends no data', () async {
      final readTimeoutDuration = Duration(milliseconds: 100);
      clientConnection.setReadTimeout(readTimeoutDuration);

      print('Test: Client attempting to read with timeout of $readTimeoutDuration');
      
      Object? thrownError;
      try {
        // Attempt to read data that will never arrive
        await clientConnection.read(10); 
      } catch (e) {
        thrownError = e;
        print('Test: Client read threw error as expected: $e');
      }

      expect(thrownError, isNotNull, reason: "A timeout exception should have been thrown.");
      expect(thrownError, isA<TimeoutException>(), reason: "The thrown error should be a TimeoutException.");
      
      // Reset timeout for subsequent tests if any or for teardown
      clientConnection.setReadTimeout(Duration.zero); 
    });
  }); // End of group
}
