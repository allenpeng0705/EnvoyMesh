import 'dart:async';
import 'dart:typed_data';

import 'package:test/test.dart';
import 'package:dart_libp2p/core/network/stream.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/multiplexer.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/yamux/session.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/yamux/stream.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/yamux/yamux_exceptions.dart';
import 'package:dart_libp2p/core/network/context.dart' as core_context; // Added for Context
import '../../../mocks/yamux_mock_connection.dart';

// Helper function to add timeouts to async operations
Future<T> withTimeout<T>(Future<T> future, String operation) {
  return future.timeout(
    Duration(seconds: 30),  // Increased timeout for slower systems
    onTimeout: () => throw TimeoutException('Timeout during $operation'),
  );
}

void main() {
  group('Yamux Multiplexing', () {
    late YamuxMockConnection conn1;
    late YamuxMockConnection conn2;
    late YamuxSession session1;
    late YamuxSession session2;
    late MultiplexerConfig config;

    setUp(() async {
      print('\n=== Test Setup ===');
      
      print('Creating mock connections...');
      (conn1, conn2) = YamuxMockConnection.createPair(
        id1: 'client',
        id2: 'server',
        enableFrameLogging: true,
      );

      print('Creating configuration...');
      config = const MultiplexerConfig(
        keepAliveInterval: Duration.zero,  // Disable keepalive for tests
        streamReadTimeout: Duration(seconds: 10),  // Increased timeout
        streamWriteTimeout: Duration(seconds: 10),  // Increased timeout
        initialStreamWindowSize: 256 * 1024,
        maxStreamWindowSize: 1024 * 1024,
      );

      print('Creating sessions...');
      session1 = YamuxSession(conn1, config, true);  // Client
      session2 = YamuxSession(conn2, config, false); // Server

      // Wait for sessions to initialize with timeout
      print('Waiting for sessions to initialize...');
      await Future.delayed(Duration(seconds: 1));  // Increased delay
      
      // Verify sessions are ready
      expect(session1.isClosed, isFalse, reason: 'Client session should be open');
      expect(session2.isClosed, isFalse, reason: 'Server session should be open');
      print('Sessions initialized and verified');
    });

    tearDown(() async {
      print('\n=== Test Cleanup ===');
      try {
        print('Closing sessions...');
        if (!session1.isClosed) {
          await withTimeout(session1.close(), 'session1 close')
              .catchError((e) => print('Error closing session1: $e'));
        }
        if (!session2.isClosed) {
          await withTimeout(session2.close(), 'session2 close')
              .catchError((e) => print('Error closing session2: $e'));
        }
      } catch (e) {
        print('Error during session cleanup: $e');
      }

      try {
        print('Closing connections...');
        if (!conn1.isClosed) {
          await conn1.close().catchError((e) => print('Error closing conn1: $e'));
        }
        if (!conn2.isClosed) {
          await conn2.close().catchError((e) => print('Error closing conn2: $e'));
        }
      } catch (e) {
        print('Error during connection cleanup: $e');
      }
      print('Cleanup complete');
    });

    test('creates new streams', () async {
      print('\n=== Stream Creation Test ===');
      
      // Set up stream handler before creating stream
      print('Setting up stream handler...');
      final streamReceived = Completer<P2PStream>();
      session2.setStreamHandler((stream) async {
        print('Server received stream with ID: ${(stream as YamuxStream).id()}');
        if (!streamReceived.isCompleted) {
          streamReceived.complete(stream);
        }
      });
      
      print('Creating client stream...');
      final stream1 = await withTimeout(session1.openStream(core_context.Context()), 'client stream creation') as P2PStream<Uint8List>; // Cast to P2PStream<Uint8List>
      expect(stream1, isNotNull);
      expect(stream1.isClosed, isFalse);
      print('Client stream created with ID: ${(stream1 as YamuxStream).id()}');

      print('Waiting for server to accept stream...');
      final stream2 = await withTimeout(streamReceived.future, 'server stream acceptance');
      expect(stream2, isNotNull);
      expect(stream2.isClosed, isFalse);
      print('Server accepted stream with ID: ${(stream2 as YamuxStream).id()}');

      // Verify stream IDs match
      print('Verifying stream IDs...');
      expect((stream1 as YamuxStream).id(), equals((stream2 as YamuxStream).id()));
      print('Stream IDs verified');

      try {
        // Test basic data transfer to verify stream is working
        print('Testing basic data transfer...');
        final testData = Uint8List.fromList([1, 2, 3]);
        await withTimeout(stream1.write(testData), 'test data write');
        print('Client wrote test data: $testData');
        
        final received = await withTimeout(stream2.read(), 'test data read');
        print('Server received data: $received');
        expect(received, equals(testData));
        print('Basic data transfer successful');
      } finally {
        // Close streams properly with timeouts
        print('Closing streams...');
        try {
          await withTimeout(stream1.close(), 'stream1 close')
              .catchError((e) => print('Error closing stream1: $e'));
        } catch (e) {
          print('Error during stream1 close: $e');
        }
        
        try {
          await withTimeout(stream2.close(), 'stream2 close')
              .catchError((e) => print('Error closing stream2: $e'));
        } catch (e) {
          print('Error during stream2 close: $e');
        }
        print('Streams closed');
      }
    });

    test('handles stream data transfer', () async {
      print('\n=== Stream Data Transfer Test ===');
      
      // Set up stream handler before creating stream
      print('Setting up stream handler...');
      final streamReceived = Completer<P2PStream>();
      session2.setStreamHandler((stream) async {
        if (!streamReceived.isCompleted) {
          streamReceived.complete(stream);
        }
      });
      
      print('Creating streams...');
      final stream1 = await withTimeout(session1.openStream(core_context.Context()), 'stream creation') as P2PStream<Uint8List>; // Cast to P2PStream<Uint8List>
      final stream2 = await withTimeout(streamReceived.future, 'stream acceptance');
      print('Streams established');

      try {
        // Send data from stream1 to stream2
        print('Testing client to server transfer...');
        final data1 = Uint8List.fromList([1, 2, 3, 4]);
        await withTimeout(stream1.write(data1), 'client write');
        print('Client wrote: $data1');

        final received1 = await withTimeout(stream2.read(), 'server read');
        print('Server received: $received1');
        expect(received1, equals(data1));

        // Send data from stream2 to stream1
        print('Testing server to client transfer...');
        final data2 = Uint8List.fromList([5, 6, 7, 8]);
        await withTimeout(stream2.write(data2), 'server write');
        print('Server wrote: $data2');

        final received2 = await withTimeout(stream1.read(), 'client read');
        print('Client received: $received2');
        expect(received2, equals(data2));
        
        print('Data transfer test completed successfully');
      } finally {
        // Ensure streams are closed
        print('Closing streams...');
        await withTimeout(stream1.close(), 'stream1 close')
            .catchError((e) => print('Error closing stream1: $e'));
        await withTimeout(stream2.close(), 'stream2 close')
            .catchError((e) => print('Error closing stream2: $e'));
        print('Streams closed');
      }
    });

    test('handles concurrent streams', () async {
      print('\n=== Concurrent Streams Test ===');
      
      // Set up stream handler
      print('Setting up stream handler...');
      final receivedStreams = <P2PStream>[];
      final allStreamsReceived = Completer<void>();
      final expectedStreams = 3;
      
      session2.setStreamHandler((stream) async {
        receivedStreams.add(stream);
        if (receivedStreams.length == expectedStreams) {
          allStreamsReceived.complete();
        }
      });
      
      print('Creating multiple client streams...');
      final streams1 = (await withTimeout( 
        Future.wait([
          session1.openStream(core_context.Context()),
          session1.openStream(core_context.Context()),
          session1.openStream(core_context.Context()),
        ]),
        'client streams creation',
      )).cast<P2PStream<Uint8List>>(); // Cast to P2PStream<Uint8List>
      print('Client streams created: ${streams1.length}');

      print('Waiting for server to accept all streams...');
      await withTimeout(allStreamsReceived.future, 'server streams acceptance');
      final streams2 = receivedStreams;
      print('Server accepted all streams');

      try {
        print('Testing concurrent data transfer...');
        await withTimeout(
          Future.wait([
            for (var i = 0; i < streams1.length; i++)
              Future.wait([
                streams1[i].write(Uint8List.fromList([i + 1])),
                streams2[i].write(Uint8List.fromList([i + 10])),
              ])
          ]),
          'concurrent writes',
        );
        print('Concurrent writes completed');

        print('Verifying received data...');
        for (var i = 0; i < streams1.length; i++) {
          final received1 = await withTimeout(streams1[i].read(), 'stream${i + 1} read');
          final received2 = await withTimeout(streams2[i].read(), 'stream${i + 1} read');
          print('Stream $i - Client received: $received1, Server received: $received2');
          expect(received1, equals(Uint8List.fromList([i + 10])));
          expect(received2, equals(Uint8List.fromList([i + 1])));
        }
        print('Data verification completed');
      } finally {
        // Close all streams
        print('Closing streams...');
        for (var i = 0; i < streams1.length; i++) {
          await streams1[i].close().catchError((e) => print('Error closing client stream $i: $e'));
          await streams2[i].close().catchError((e) => print('Error closing server stream $i: $e'));
        }
        print('All streams closed');
      }
    });

    test('should allow opening multiple sequential streams after closing previous ones', () async {
      print('\n=== Sequential Stream Reuse Test ===');
      print('Goal: Verify that a Yamux session can open new streams after closing old ones');
      
      // Track all created streams for cleanup
      final clientStreams = <P2PStream>[];
      final serverStreams = <P2PStream>[];
      
      try {
        const numSequentialStreams = 3;
        
        for (var i = 0; i < numSequentialStreams; i++) {
          print('\n--- Opening stream pair ${i + 1}/$numSequentialStreams ---');
          
          // Set up stream handler for this iteration
          final streamReceived = Completer<P2PStream>();
          session2.setStreamHandler((stream) async {
            print('Server received stream with ID: ${(stream as YamuxStream).id()}');
            if (!streamReceived.isCompleted) {
              streamReceived.complete(stream);
            }
          });
          
          // Open a new stream
          print('Client opening stream...');
          final clientStream = await withTimeout(
            session1.openStream(core_context.Context()),
            'client stream $i creation',
          ) as P2PStream<Uint8List>;
          clientStreams.add(clientStream);
          print('Client opened stream: ${(clientStream as YamuxStream).id()}');
          
          // Server accepts the stream
          print('Server accepting stream...');
          final serverStream = await withTimeout(
            streamReceived.future,
            'server stream $i acceptance',
          );
          serverStreams.add(serverStream);
          print('Server accepted stream: ${(serverStream as YamuxStream).id()}');
          
          // Test basic communication on this stream
          print('Testing communication on stream pair $i...');
          final testData = Uint8List.fromList([i, i + 1, i + 2]);
          await withTimeout(clientStream.write(testData), 'client write $i');
          final received = await withTimeout(serverStream.read(), 'server read $i');
          expect(received, equals(testData), reason: 'Data mismatch on stream $i');
          print('✅ Stream pair $i communication successful');
          
          // Close both streams cleanly before opening the next pair
          print('Closing stream pair $i...');
          await withTimeout(clientStream.close(), 'client stream $i close');
          await withTimeout(serverStream.close(), 'server stream $i close');
          print('✅ Stream pair $i closed');
          
          // Give the session time to clean up the closed streams
          if (i < numSequentialStreams - 1) {
            print('Waiting for session cleanup before next stream...');
            await Future.delayed(Duration(milliseconds: 500));
            
            // Verify session is still healthy
            expect(session1.isClosed, isFalse, reason: 'Client session should still be open after closing stream $i');
            expect(session2.isClosed, isFalse, reason: 'Server session should still be open after closing stream $i');
            print('✅ Sessions verified healthy');
          }
        }
        
        print('\n✅ Sequential stream reuse test PASSED - All $numSequentialStreams stream pairs opened successfully');
        
      } catch (e, stackTrace) {
        print('\n❌ Sequential stream reuse test FAILED: $e');
        print('Stack trace: $stackTrace');
        print('\nDiagnostic Info:');
        print('- Total client streams created: ${clientStreams.length}');
        print('- Total server streams created: ${serverStreams.length}');
        print('- Client session closed: ${session1.isClosed}');
        print('- Server session closed: ${session2.isClosed}');
        rethrow;
      } finally {
        // Cleanup: close any streams that might still be open
        print('\nCleaning up remaining streams...');
        for (var i = 0; i < clientStreams.length; i++) {
          try {
            if (!clientStreams[i].isClosed) {
              await clientStreams[i].close().timeout(Duration(seconds: 2));
            }
          } catch (e) {
            print('Error closing client stream $i: $e');
          }
        }
        for (var i = 0; i < serverStreams.length; i++) {
          try {
            if (!serverStreams[i].isClosed) {
              await serverStreams[i].close().timeout(Duration(seconds: 2));
            }
          } catch (e) {
            print('Error closing server stream $i: $e');
          }
        }
        print('Cleanup complete');
      }
    }, timeout: Timeout(Duration(seconds: 60)));

    test('should not lose stream events with concurrent acceptStream calls', () async {
      print('\n=== Broadcast Stream Race Condition Test ===');
      print('Goal: Verify that acceptStream() does not miss stream events due to broadcast stream timing');
      
      // This test exposes a race condition where:
      // 1. acceptStream() is called and starts listening to the broadcast stream
      // 2. openStream() sends SYN
      // 3. Server receives SYN and adds the stream to _incomingStreamsController
      // 4. But if the .first listener from acceptStream() isn't fully attached yet,
      //    the event gets lost in a broadcast stream
      
      try {
        const numIterations = 5;
        
        for (var i = 0; i < numIterations; i++) {
          print('\n--- Iteration ${i + 1}/$numIterations ---');
          
          // Start acceptStream FIRST (this is the critical timing)
          print('Server starting acceptStream...');
          final acceptFuture = session2.acceptStream().timeout(
            Duration(seconds: 5),
            onTimeout: () {
              print('❌ acceptStream() TIMED OUT - stream event was lost!');
              throw TimeoutException('acceptStream timed out - likely missed stream event from broadcast');
            },
          );
          
          // Very short delay to simulate real-world timing where accept is "waiting"
          await Future.delayed(Duration(milliseconds: 10));
          
          // Now open the stream (sends SYN, server processes it, adds to controller)
          print('Client opening stream...');
          final openFuture = session1.openStream(core_context.Context()).timeout(
            Duration(seconds: 5),
            onTimeout: () => throw TimeoutException('openStream timed out'),
          );
          
          // Both should complete
          print('Waiting for both acceptStream and openStream to complete...');
          final results = await Future.wait([
            openFuture,
            acceptFuture,
          ]).timeout(
            Duration(seconds: 6),
            onTimeout: () {
              print('❌ RACE CONDITION DETECTED:');
              print('   acceptStream() is stuck waiting because the broadcast stream');
              print('   lost the event when the stream was added to the controller');
              throw TimeoutException('Race condition: acceptStream missed stream event');
            },
          );
          
          final clientStream = results[0] as YamuxStream;
          final serverStream = results[1] as YamuxStream;
          
          print('✅ Both streams obtained: client=${clientStream.id()}, server=${serverStream.id()}');
          expect(clientStream.id(), equals(serverStream.id()));
          
          // Quick communication test
          final testData = Uint8List.fromList([i]);
          await clientStream.write(testData);
          final received = await serverStream.read().timeout(Duration(seconds: 2));
          expect(received, equals(testData));
          
          // Clean up
          await clientStream.close();
          await serverStream.close();
          
          // Small delay before next iteration
          await Future.delayed(Duration(milliseconds: 100));
          
          print('✅ Iteration ${i + 1} completed successfully');
        }
        
        print('\n✅ Broadcast stream race condition test PASSED - All $numIterations iterations succeeded');
        
      } catch (e, stackTrace) {
        print('\n❌ Broadcast stream race condition test FAILED: $e');
        print('Stack trace: $stackTrace');
        print('\nThis failure indicates that the broadcast StreamController in YamuxSession');
        print('is losing stream events when acceptStream() is called concurrently with');
        print('openStream(). The fix is to use a single-subscription StreamController');
        print('or implement proper queueing for incoming streams.');
        rethrow;
      }
    }, timeout: Timeout(Duration(seconds: 60)));

    test('handles flow control', () async {
      print('\n=== Flow Control Test ===');
      
      // Set up stream handler
      print('Setting up stream handler...');
      final streamReceived = Completer<P2PStream>();
      session2.setStreamHandler((stream) async {
        if (!streamReceived.isCompleted) {
          streamReceived.complete(stream);
        }
      });
      
      print('Creating streams...');
      final stream1 = await withTimeout(session1.openStream(core_context.Context()), 'stream creation') as P2PStream<Uint8List>; // Cast to P2PStream<Uint8List>
      final stream2 = await withTimeout(streamReceived.future, 'stream acceptance');
      print('Streams established');

      // Verify initial stream states
      expect(stream1.isClosed, isFalse, reason: 'Client stream should be open initially');
      expect(stream2.isClosed, isFalse, reason: 'Server stream should be open initially');

      try {
        print('Creating large test data...');
        // Use a smaller size for testing to avoid timeouts
        final dataSize = config.initialStreamWindowSize ~/ 2;
        final largeData = Uint8List(dataSize);
        for (var i = 0; i < largeData.length; i++) {
          largeData[i] = i % 256;
        }
        print('Test data created: ${largeData.length} bytes');

        print('Starting data transfer...');
        // Start write operation in the background
        final writeComplete = Completer<void>();
        stream1.write(largeData).then((_) {
          print('Write operation completed');
          writeComplete.complete();
        }).catchError((e) {
          print('Write operation failed: $e');
          writeComplete.completeError(e);
        });

        print('Receiving data in chunks...');
        var receivedData = <int>[];
        var lastProgress = 0;
        
        while (receivedData.length < largeData.length) {
          try {
            final chunk = await withTimeout(stream2.read(), 'chunk read');
            if (chunk.isEmpty) {
              print('Received empty chunk, stream might be closed');
              break;
            }
            receivedData.addAll(chunk);
            
            // Log progress every 20%
            final progress = (receivedData.length * 100 ~/ largeData.length);
            if (progress >= lastProgress + 20) {
              print('Received ${receivedData.length} bytes (${progress}%)');
              lastProgress = progress;
            }
          } catch (e) {
            print('Error during read: $e');
            break;
          }
        }

        // Wait for write to complete with timeout
        await withTimeout(writeComplete.future, 'write completion');
        print('Data transfer completed');

        // Verify the data
        expect(
          Uint8List.fromList(receivedData),
          equals(largeData),
          reason: 'Received data should match sent data',
        );
        print('Data verified successfully');
      } finally {
        // Close streams properly
        print('Closing streams...');
        try {
          await withTimeout(stream1.close(), 'stream1 close')
              .catchError((e) => print('Error closing stream1: $e'));
          await withTimeout(stream2.close(), 'stream2 close')
              .catchError((e) => print('Error closing stream2: $e'));
        } catch (e) {
          print('Error during stream cleanup: $e');
        }
        print('Streams closed');
      }
    });

    test('handles stream closure', () async {
      print('\n=== Stream Closure Test ===');
      
      // Set up stream handler
      print('Setting up stream handler...');
      final streamReceived = Completer<P2PStream>();
      session2.setStreamHandler((stream) async {
        if (!streamReceived.isCompleted) {
          streamReceived.complete(stream);
        }
      });
      
      print('Creating streams...');
      final stream1 = await withTimeout(session1.openStream(core_context.Context()), 'stream creation') as P2PStream; // Cast to P2PStream
      final stream2 = await withTimeout(streamReceived.future, 'stream acceptance');
      print('Streams established');

      print('Closing client stream...');
      await withTimeout(stream1.close(), 'stream1 close');
      expect(stream1.isClosed, isTrue);
      print('Client stream closed');

      print('Verifying server stream receives EOF...');
      final eofData = await withTimeout(stream2.read(), 'stream2 read');
      expect(eofData, isEmpty, reason: 'Read after remote close should return empty (EOF)');
      print('Server stream received EOF correctly');

      // After receiving EOF, the stream should be closed
      // Allow a brief moment for close propagation
      await Future.delayed(Duration(milliseconds: 100));
      expect(stream2.isClosed, isTrue);
      print('Server stream closure verified');
    });

    test('handles session closure', () async {
      print('\n=== Session Closure Test ===');
      
      // Set up stream handler
      print('Setting up stream handler...');
      final streamReceived = Completer<P2PStream>();
      session2.setStreamHandler((stream) async {
        if (!streamReceived.isCompleted) {
          streamReceived.complete(stream);
        }
      });
      
      print('Creating streams...');
      final P2PStream<Uint8List> stream1 = await withTimeout(session1.openStream(core_context.Context()), 'stream creation') as P2PStream<Uint8List>; 
      final stream2 = await withTimeout(streamReceived.future, 'stream acceptance');
      print('Streams established');

      print('Closing client session...');
      await withTimeout(session1.close(), 'session1 close');
      expect(session1.isClosed, isTrue);
      print('Client session closed');

      // Wait for session2 to close as a result of GO_AWAY from session1
      print('Waiting for server session (session2) to process closure...');
      try {
        Future<void> pollForSession2Closure() async {
          int attempts = 0;
          // Max attempts for roughly 5 seconds (250 * 20ms = 5000ms)
          const maxAttempts = 250; 
          while (!session2.isClosed && attempts < maxAttempts) {
            await Future.delayed(const Duration(milliseconds: 20));
            attempts++;
          }
          if (!session2.isClosed) {
            // Using print as _log is not defined in this test file
            print('WARNING: Session2 did not close within the polling period (5s).');
          }
        }
        await pollForSession2Closure();
      } catch (e) {
        // Using print as _log is not defined in this test file
        print('ERROR: Error while polling for session2 closure: $e');
      }
      print('Polling for session2 closure finished. session2.isClosed: ${session2.isClosed}');

      print('Verifying stream closure...');
      expect(stream1.isClosed, isTrue);
      expect(stream2.isClosed, isTrue);
      print('Streams verified closed');

      print('Verifying server session closure...');
      expect(session2.isClosed, isTrue);
      print('Server session closure verified');
    });

    test('enforces maximum streams limit', () async {
      print('\n=== Maximum Streams Test ===');
      
      // Use a smaller max streams for testing
      final testMaxStreams = 10;  // Reduced from 50 to 10 for stability
      final testConfig = MultiplexerConfig(
        keepAliveInterval: Duration.zero,
        streamReadTimeout: Duration(seconds: 5),
        streamWriteTimeout: Duration(seconds: 5),
        maxStreams: testMaxStreams,
        initialStreamWindowSize: 256 * 1024,
        maxStreamWindowSize: 1024 * 1024,
      );

      // Create new sessions with test config
      final (testConn1, testConn2) = YamuxMockConnection.createPair(
        id1: 'test_client',
        id2: 'test_server',
        enableFrameLogging: true,
      );
      
      final testSession1 = YamuxSession(testConn1, testConfig, true);
      final testSession2 = YamuxSession(testConn2, testConfig, false);

      // Wait for sessions to initialize
      await Future.delayed(Duration(milliseconds: 500));
      expect(testSession1.isClosed, isFalse);
      expect(testSession2.isClosed, isFalse);
      
      // Set up stream handler
      print('Setting up stream handler...');
      final receivedStreams = <P2PStream>[];
      
      testSession2.setStreamHandler((stream) async {
        print('Server received stream ${receivedStreams.length + 1}');
        receivedStreams.add(stream);
      });
      
      final streams = <P2PStream<Uint8List>>[]; // Specify type here
      try {
        // Create streams in small batches
        const batchSize = 2;  // Smaller batch size
        for (var i = 0; i < testMaxStreams; i += batchSize) {
          final count = (i + batchSize > testMaxStreams) ? (testMaxStreams - i) : batchSize;
          print('\nCreating batch of $count streams (${i + 1} to ${i + count})...');
          
          final batch = (await withTimeout( 
            Future.wait(
              List.generate(count, (_) => testSession1.openStream(core_context.Context())),
              eagerError: true,
            ),
            'batch streams creation',
          )).cast<P2PStream<Uint8List>>(); // Cast to P2PStream<Uint8List>
          
          streams.addAll(batch);
          print('Created ${streams.length}/$testMaxStreams streams');
          
          // Add small delay between batches
          if (i + batchSize < testMaxStreams) {
            await Future.delayed(Duration(milliseconds: 200));
          }
        }

        // Wait for server to receive all streams
        print('\nWaiting for server to receive all streams...');
        while (receivedStreams.length < testMaxStreams) {
          await Future.delayed(Duration(milliseconds: 100));
          if (testSession1.isClosed || testSession2.isClosed) {
            throw StateError('Session closed before receiving all streams');
          }
        }
        print('Server received all streams');

        // Verify streams are open
        print('\nVerifying streams...');
        expect(streams.length, equals(testMaxStreams));
        expect(receivedStreams.length, equals(testMaxStreams));
        
        // Try to create one more stream (should fail)
        print('\nTesting stream limit...');
        await expectLater(
          () => testSession1.openStream(core_context.Context()),
          throwsA(isA<StateError>()),
        );
        print('Stream limit enforced successfully');
      } finally {
        print('\nCleaning up test sessions...');
        // Close all streams first
        print('Closing streams...');
        for (var stream in streams) {
          try {
            await stream.close().timeout(Duration(seconds: 1));
          } catch (e) {
            print('Error closing stream: $e');
          }
        }

        // Then close sessions
        print('Closing sessions...');
        await testSession1.close().timeout(Duration(seconds: 2))
            .catchError((e) => print('Error closing session1: $e'));
        await testSession2.close().timeout(Duration(seconds: 2))
            .catchError((e) => print('Error closing session2: $e'));

        // Finally close connections
        print('Closing connections...');
        await testConn1.close();
        await testConn2.close();
        print('Cleanup completed');
      }
    });

    test('handles stream errors', () async {
      print('\n=== Stream Error Test ===');
      
      // Set up stream handler with error handling
      print('Setting up stream handler...');
      final streamReceived = Completer<P2PStream>();
      session2.setStreamHandler((stream) async {
        print('Server received stream with ID: ${(stream as YamuxStream).id}');
        if (!streamReceived.isCompleted) {
          streamReceived.complete(stream);
        }
      });
      
      print('Creating streams...');
      final stream1 = await withTimeout(session1.openStream(core_context.Context()), 'stream creation') as P2PStream<Uint8List>; // Cast to P2PStream<Uint8List>
      final stream2 = await withTimeout(streamReceived.future, 'stream acceptance');
      print('Streams established');

      // Verify initial stream states
      expect(stream1.isClosed, isFalse, reason: 'Stream 1 should be open initially');
      expect(stream2.isClosed, isFalse, reason: 'Stream 2 should be open initially');
      print('Initial stream states verified');

      try {
        // Test basic data transfer before closing connection
        print('Testing basic data transfer...');
        final testData = Uint8List.fromList([1, 2, 3]);
        await withTimeout(stream1.write(testData), 'test data write');
        print('Client wrote test data: $testData');
        
        final received = await withTimeout(stream2.read(), 'test data read');
        print('Server received data: $received');
        expect(received, equals(testData));
        print('Basic data transfer successful');

        print('Closing underlying connection...');
        await withTimeout(conn1.close(), 'connection close');
        print('Connection closed');

        // Add a delay to allow error propagation
        await Future.delayed(Duration(milliseconds: 200));

        print('Verifying stream operations fail...');
        await expectLater(
          () => stream1.write(Uint8List.fromList([1])),
          throwsA(anyOf(isA<StateError>(), isA<YamuxStreamStateException>())),
          reason: 'Write operation should fail after connection close',
        );
        await expectLater(
          () => stream1.read(),
          throwsA(anyOf(isA<StateError>(), isA<YamuxStreamStateException>())),
          reason: 'Read operation should fail after connection close',
        );
        print('Stream operations verified to fail correctly');
      } finally {
        print('Verifying final stream states...');
        // Try to close streams explicitly with proper error handling
        try {
          if (!stream1.isClosed) {
            await withTimeout(stream1.close(), 'stream1 close')
                .catchError((e) => print('Expected error closing stream1: $e'));
          }
        } catch (e) {
          print('Expected error during stream1 close: $e');
        }
        
        try {
          if (!stream2.isClosed) {
            await withTimeout(stream2.close(), 'stream2 close')
                .catchError((e) => print('Expected error closing stream2: $e'));
          }
        } catch (e) {
          print('Expected error during stream2 close: $e');
        }

        // Add delay to allow closure propagation
        await Future.delayed(Duration(milliseconds: 200));

        // Final state verification
        expect(stream1.isClosed, isTrue, reason: 'Stream 1 should be closed after connection close');
        expect(stream2.isClosed, isTrue, reason: 'Stream 2 should be closed after connection close');
        print('Final stream states verified');
      }
    });

    test('handles stream reset', () async {
      print('\n=== Stream Reset Test ===');
      
      final streamReceived = Completer<P2PStream>();
      session2.setStreamHandler((stream) async {
        if (!streamReceived.isCompleted) streamReceived.complete(stream);
      });

      final stream1 = await withTimeout(session1.openStream(core_context.Context()), 'stream creation') as P2PStream;
      final stream2 = await withTimeout(streamReceived.future, 'stream acceptance') as P2PStream;
      print('Streams established');

      await withTimeout(stream1.reset(), 'stream1 reset');
      print('Stream 1 has been reset');

      expect(stream1.isClosed, isTrue, reason: 'Stream 1 should be closed after reset');

      // Allow time for the RST frame to be processed by session2
      await Future.delayed(Duration(milliseconds: 100));

      await expectLater(
        () => withTimeout(stream2.read(), 'stream2 read after reset'),
        throwsA(anyOf(isA<StateError>(), isA<YamuxStreamStateException>())),
        reason: 'Reading from a reset stream should throw an error',
      );

      await expectLater(
        () => withTimeout(stream2.write(Uint8List.fromList([1,2,3])), 'stream2 write after reset'),
        throwsA(anyOf(isA<StateError>(), isA<YamuxStreamStateException>())),
        reason: 'Writing to a reset stream should throw an error',
      );

      expect(stream2.isClosed, isTrue, reason: 'Stream 2 should be closed after reset');
      print('Stream reset test completed');
    });

    test('handles half-close (closeWrite)', () async {
      print('\n=== Half-Close (closeWrite) Test ===');
      
      final streamReceived = Completer<P2PStream>();
      session2.setStreamHandler((stream) async {
        if (!streamReceived.isCompleted) streamReceived.complete(stream);
      });

      final stream1 = await withTimeout(session1.openStream(core_context.Context()), 'stream creation') as P2PStream<Uint8List>;
      final stream2 = await withTimeout(streamReceived.future, 'stream acceptance') as P2PStream<Uint8List>;
      print('Streams established');

      // 1. stream1 closes its write side
      await withTimeout(stream1.closeWrite(), 'stream1 closeWrite');
      print('Stream 1 called closeWrite()');

      // 2. Attempting to write on stream1 should fail
      await expectLater(
        () => withTimeout(stream1.write(Uint8List.fromList([1])), 'stream1 write after closeWrite'),
        throwsA(isA<StateError>()),
        reason: 'Writing after closeWrite should fail',
      );
      print('Verified write on stream1 fails');

      // 3. stream2 can still write data
      final testData = Uint8List.fromList([10, 20, 30]);
      await withTimeout(stream2.write(testData), 'stream2 write');
      print('Stream 2 wrote data: $testData');

      // 4. stream1 can still read that data
      final receivedData = await withTimeout(stream1.read(), 'stream1 read after closeWrite');
      expect(receivedData, equals(testData), reason: 'Stream 1 should receive data after its closeWrite');
      print('Stream 1 read data successfully');

      // 5. stream2 reading should now get an EOF because stream1 sent FIN
      final eofData = await withTimeout(stream2.read(), 'stream2 read after stream1 closeWrite');
      expect(eofData, isEmpty, reason: 'Reading from stream2 should return empty (EOF) after stream1 sent FIN');
      print('Verified stream2 read gets EOF');

      // Cleanup
      await stream1.close().catchError((e) {});
      await stream2.close().catchError((e) {});
      print('Half-close test completed');
    });

    test('handles local read closure (closeRead)', () async {
      print('\n=== Local Read Closure (closeRead) Test ===');
      
      final streamReceived = Completer<P2PStream>();
      session2.setStreamHandler((stream) async {
        if (!streamReceived.isCompleted) streamReceived.complete(stream);
      });

      final stream1 = await withTimeout(session1.openStream(core_context.Context()), 'stream creation') as P2PStream<Uint8List>;
      final stream2 = await withTimeout(streamReceived.future, 'stream acceptance') as P2PStream<Uint8List>;
      print('Streams established');

      // 1. stream1 closes its read side locally
      await withTimeout(stream1.closeRead(), 'stream1 closeRead');
      print('Stream 1 called closeRead()');

      // 2. Attempting to read from stream1 should fail or return EOF
      // The implementation completes the pending read with an empty list (EOF)
      final readResult = await withTimeout(stream1.read(), 'stream1 read after closeRead');
      expect(readResult.isEmpty, isTrue, reason: 'Read after closeRead should return EOF');
      print('Verified read on stream1 returns EOF');

      // 3. stream2 can still write data (it's unaware of the local closeRead)
      final testDataFrom2 = Uint8List.fromList([1, 2, 3]);
      await withTimeout(stream2.write(testDataFrom2), 'stream2 write');
      print('Stream 2 wrote data successfully');

      // 4. stream1 can still write data
      final testDataFrom1 = Uint8List.fromList([4, 5, 6]);
      await withTimeout(stream1.write(testDataFrom1), 'stream1 write after closeRead');
      print('Stream 1 wrote data successfully');

      // 5. stream2 can read the data from stream1
      final receivedData = await withTimeout(stream2.read(), 'stream2 read');
      expect(receivedData, equals(testDataFrom1), reason: 'Stream 2 should receive data from stream 1');
      print('Stream 2 read data successfully');

      // Cleanup
      await stream1.close().catchError((e) {});
      await stream2.close().catchError((e) {});
      print('Local read closure test completed');
    });

    test('handles large payload with rapid chunk delivery (OBP scenario)', () async {
      print('\n=== Large Payload with Rapid Chunk Delivery Test ===');
      print('This test reproduces the scenario that causes OBP test failures');
      
      // Set up stream handler
      final streamReceived = Completer<P2PStream>();
      session2.setStreamHandler((stream) async {
        print('Server received stream for large payload test');
        if (!streamReceived.isCompleted) {
          streamReceived.complete(stream);
        }
      });
      
      print('Creating streams...');
      final stream1 = await withTimeout(session1.openStream(core_context.Context()), 'stream creation') as P2PStream<Uint8List>;
      final stream2 = await withTimeout(streamReceived.future, 'stream acceptance') as P2PStream<Uint8List>;
      print('Streams established');

      try {
        print('Creating 100KB test data (same size as OBP test)...');
        // Create 100KB test data - same size that causes OBP test to fail
        final largeData = Uint8List(100 * 1024);
        for (var i = 0; i < largeData.length; i++) {
          largeData[i] = i % 256;
        }
        print('Test data created: ${largeData.length} bytes');

        print('Simulating rapid chunk delivery pattern from UDX...');
        // Simulate the rapid chunk delivery pattern we see in the OBP logs
        // UDX delivers data in 1384-byte chunks very rapidly
        const chunkSize = 1384; // Exact size from the OBP failure logs
        final chunks = <Uint8List>[];
        for (var i = 0; i < largeData.length; i += chunkSize) {
          final end = (i + chunkSize > largeData.length) ? largeData.length : i + chunkSize;
          chunks.add(largeData.sublist(i, end));
        }
        print('Created ${chunks.length} chunks of ${chunkSize} bytes each');

        // Track session health throughout the test
        var sessionHealthChecks = 0;
        void checkSessionHealth(String phase) {
          sessionHealthChecks++;
          print('[$phase] Session health check #$sessionHealthChecks:');
          print('  - Session1 closed: ${session1.isClosed}');
          print('  - Session2 closed: ${session2.isClosed}');
          print('  - Stream1 closed: ${stream1.isClosed}');
          print('  - Stream2 closed: ${stream2.isClosed}');
          
          if (session1.isClosed || session2.isClosed) {
            throw StateError('Session closed during $phase - this indicates the Yamux GO_AWAY issue');
          }
        }

        checkSessionHealth('Initial');

        print('Starting rapid write operations (no delays between chunks)...');
        final writeCompleter = Completer<void>();
        var chunksWritten = 0;
        
        // Send all chunks rapidly without delays (simulating UDX behavior)
        Future.microtask(() async {
          try {
            for (final chunk in chunks) {
              await stream1.write(chunk);
              chunksWritten++;
              
              // Check session health every 10 chunks
              if (chunksWritten % 10 == 0) {
                checkSessionHealth('Write chunk $chunksWritten/${chunks.length}');
              }
            }
            print('All chunks written successfully');
            writeCompleter.complete();
          } catch (e) {
            print('Write operation failed: $e');
            writeCompleter.completeError(e);
          }
        });

        print('Reading data and monitoring session health...');
        final receivedData = <int>[];
        var readOperations = 0;
        
        while (receivedData.length < largeData.length) {
          try {
            final chunk = await withTimeout(stream2.read(), 'chunk read ${readOperations + 1}');
            if (chunk.isEmpty) {
              print('Received empty chunk, stream might be closed');
              break;
            }
            
            receivedData.addAll(chunk);
            readOperations++;
            
            // Check session health every 10 read operations
            if (readOperations % 10 == 0) {
              checkSessionHealth('Read operation $readOperations');
              final progress = (receivedData.length * 100 ~/ largeData.length);
              print('Progress: ${receivedData.length}/${largeData.length} bytes (${progress}%)');
            }
            
          } catch (e) {
            print('Read operation failed: $e');
            checkSessionHealth('Read failure');
            rethrow;
          }
        }

        print('Waiting for write operations to complete...');
        await withTimeout(writeCompleter.future, 'write completion');
        
        checkSessionHealth('After write completion');

        print('Verifying data integrity...');
        expect(
          Uint8List.fromList(receivedData),
          equals(largeData),
          reason: 'Received data should match sent data',
        );
        print('✓ Data integrity verified');

        // Final session health check
        checkSessionHealth('Final');
        
        // Verify sessions are still healthy (this is the key test)
        expect(session1.isClosed, isFalse, reason: 'Session1 should remain open after large payload transfer');
        expect(session2.isClosed, isFalse, reason: 'Session2 should remain open after large payload transfer');
        expect(stream1.isClosed, isFalse, reason: 'Stream1 should remain open after large payload transfer');
        expect(stream2.isClosed, isFalse, reason: 'Stream2 should remain open after large payload transfer');
        
        print('✓ Large payload with rapid chunk delivery test PASSED');
        print('  This indicates Yamux can handle the OBP scenario correctly');
        
      } catch (e, stackTrace) {
        print('❌ Large payload test FAILED: $e');
        print('  This confirms the Yamux issue that affects OBP');
        print('  Stack trace: $stackTrace');
        
        // Provide diagnostic information
        print('\nDiagnostic Information:');
        print('- Session1 closed: ${session1.isClosed}');
        print('- Session2 closed: ${session2.isClosed}');
        print('- Stream1 closed: ${stream1.isClosed}');
        print('- Stream2 closed: ${stream2.isClosed}');
        
        rethrow;
      } finally {
        // Cleanup with error handling
        print('Cleaning up streams...');
        try {
          if (!stream1.isClosed) {
            await withTimeout(stream1.close(), 'stream1 close')
                .catchError((e) => print('Error closing stream1: $e'));
          }
          if (!stream2.isClosed) {
            await withTimeout(stream2.close(), 'stream2 close')
                .catchError((e) => print('Error closing stream2: $e'));
          }
        } catch (e) {
          print('Error during stream cleanup: $e');
        }
        print('Stream cleanup completed');
      }
    });
  });
}
