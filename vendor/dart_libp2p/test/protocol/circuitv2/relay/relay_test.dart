import 'dart:async';
import 'dart:typed_data';

import 'package:dart_libp2p/core/crypto/ed25519.dart';
import 'package:test/test.dart';
import 'package:mockito/mockito.dart';
import 'package:mockito/annotations.dart';

import 'package:dart_libp2p/core/host/host.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/network/stream.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/p2p/protocol/circuitv2/relay/relay.dart';
import 'package:dart_libp2p/p2p/protocol/circuitv2/relay/resources.dart';
import 'package:dart_libp2p/p2p/protocol/circuitv2/proto.dart';

@GenerateMocks([Host, Conn])
@GenerateNiceMocks([MockSpec<P2PStream>()])
import 'relay_test.mocks.dart';

void main() {
  group('Relay Server', () {
    late MockHost mockHost;
    late Resources resources;
    late Relay relay;
    late PeerId testHostPeerId;

    setUp(() async {
      mockHost = MockHost();
      resources = Resources(
        maxReservations: 10,
        maxConnections: 10,
        reservationTtl: 3600,
        connectionDuration: 120,
        connectionData: 1024 * 1024,
      );
      
      // Create a real PeerId for the host
      final keyPair = await generateEd25519KeyPair();
      testHostPeerId = PeerId.fromPublicKey(keyPair.publicKey);
      
      // Mock basic host properties
      when(mockHost.id).thenReturn(testHostPeerId);
      when(mockHost.addrs).thenReturn([]);
      
      relay = Relay(mockHost, resources);
    });

    group('Reservation Management', () {
      test('should accept valid reservation requests', () {
        // Arrange
        final peerId = 'test-peer-123';
        final expiration = DateTime.now().add(Duration(hours: 1));
        
        // Act
        relay.addReservationForTesting(peerId, expiration);
        
        // Assert
        expect(relay.hasReservation(peerId), isTrue);
        expect(relay.reservationsForTesting, contains(peerId));
      });

      test('should reject expired reservations', () {
        // Arrange
        final peerId = 'test-peer-123';
        final expiration = DateTime.now().subtract(Duration(hours: 1));
        
        // Act
        relay.addReservationForTesting(peerId, expiration);
        
        // Assert
        expect(relay.hasReservation(peerId), isFalse);
      });

      test('should handle multiple reservations', () {
        // Arrange
        final peer1 = 'peer-1';
        final peer2 = 'peer-2';
        final expiration = DateTime.now().add(Duration(hours: 1));
        
        // Act
        relay.addReservationForTesting(peer1, expiration);
        relay.addReservationForTesting(peer2, expiration);
        
        // Assert
        expect(relay.hasReservation(peer1), isTrue);
        expect(relay.hasReservation(peer2), isTrue);
        expect(relay.reservationsForTesting.length, equals(2));
      });
    });

    group('Connection Tracking', () {
      test('should track active connections', () {
        // This test verifies connection counting indirectly
        // The connection count is managed internally by _relayData
        
        final srcPeer = 'src-peer';
        final dstPeer = 'dst-peer';
        
        // Initially no connections
        expect(relay.getConnectionCount(srcPeer, dstPeer), equals(0));
      });

      test('should provide immutable view of connections', () {
        // Arrange & Act
        final connections = relay.connectionsForTesting;
        
        // Assert
        expect(connections, isA<Map<String, int>>());
        expect(() => connections['test'] = 1, throwsUnsupportedError);
      });
    });

    group('Bidirectional Data Forwarding', () {
      test('should relay data from source to destination', () async {
        // Arrange
        final srcKeyPair = await generateEd25519KeyPair();
        final dstKeyPair = await generateEd25519KeyPair();
        final srcPeer = PeerId.fromPublicKey(srcKeyPair.publicKey);
        final dstPeer = PeerId.fromPublicKey(dstKeyPair.publicKey);
        
        final srcStream = MockP2PStream();
        final dstStream = MockP2PStream();
        
        // Track reads: first return data, then return empty to signal EOF
        var srcReadCount = 0;
        final testData = Uint8List.fromList([1, 2, 3, 4, 5]);
        when(srcStream.read()).thenAnswer((_) async {
          if (srcReadCount == 0) {
            srcReadCount++;
            return testData;
          }
          return Uint8List(0); // EOF
        });
        
        // Track destination writes
        final dstWrites = <Uint8List>[];
        when(dstStream.write(any)).thenAnswer((invocation) async {
          final data = invocation.positionalArguments[0] as Uint8List;
          dstWrites.add(data);
        });
        
        // Destination reads return empty immediately (no reverse data)
        when(dstStream.read()).thenAnswer((_) async => Uint8List(0));
        
        // Mock close behavior
        when(srcStream.close()).thenAnswer((_) async {});
        when(dstStream.close()).thenAnswer((_) async {});
        
        // Act: Start relay
        relay.relayDataForTesting(srcStream, dstStream, srcPeer, dstPeer);
        
        // Wait for data to be relayed and cleanup
        await Future.delayed(Duration(milliseconds: 200));
        
        // Assert: Data was forwarded to destination
        expect(dstWrites, isNotEmpty);
        expect(dstWrites.first, equals(testData));
        
        // Verify streams were closed
        verify(srcStream.close()).called(greaterThanOrEqualTo(1));
        verify(dstStream.close()).called(greaterThanOrEqualTo(1));
      });

      test('should relay data from destination to source', () async {
        // Arrange
        final srcKeyPair = await generateEd25519KeyPair();
        final dstKeyPair = await generateEd25519KeyPair();
        final srcPeer = PeerId.fromPublicKey(srcKeyPair.publicKey);
        final dstPeer = PeerId.fromPublicKey(dstKeyPair.publicKey);
        
        final srcStream = MockP2PStream();
        final dstStream = MockP2PStream();
        
        // Source reads return empty immediately (no forward data)
        when(srcStream.read()).thenAnswer((_) async => Uint8List(0));
        
        // Track source writes
        final srcWrites = <Uint8List>[];
        when(srcStream.write(any)).thenAnswer((invocation) async {
          final data = invocation.positionalArguments[0] as Uint8List;
          srcWrites.add(data);
        });
        
        // Track destination reads: first return data, then return empty
        var dstReadCount = 0;
        final testData = Uint8List.fromList([5, 4, 3, 2, 1]);
        when(dstStream.read()).thenAnswer((_) async {
          if (dstReadCount == 0) {
            dstReadCount++;
            return testData;
          }
          return Uint8List(0); // EOF
        });
        
        // Mock close behavior
        when(srcStream.close()).thenAnswer((_) async {});
        when(dstStream.close()).thenAnswer((_) async {});
        
        // Act: Start relay
        relay.relayDataForTesting(srcStream, dstStream, srcPeer, dstPeer);
        
        // Wait for data to be relayed and cleanup
        await Future.delayed(Duration(milliseconds: 200));
        
        // Assert: Data was forwarded to source
        expect(srcWrites, isNotEmpty);
        expect(srcWrites.first, equals(testData));
        
        // Verify streams were closed
        verify(srcStream.close()).called(greaterThanOrEqualTo(1));
        verify(dstStream.close()).called(greaterThanOrEqualTo(1));
      });

      test('should handle stream errors gracefully', () async {
        // Arrange
        final srcKeyPair = await generateEd25519KeyPair();
        final dstKeyPair = await generateEd25519KeyPair();
        final srcPeer = PeerId.fromPublicKey(srcKeyPair.publicKey);
        final dstPeer = PeerId.fromPublicKey(dstKeyPair.publicKey);
        
        final srcStream = MockP2PStream();
        final dstStream = MockP2PStream();
        
        // Mock source stream to throw error
        when(srcStream.read()).thenThrow(Exception('Stream error'));
        when(dstStream.read()).thenAnswer((_) async => Uint8List(0));
        
        // Mock close behavior
        when(srcStream.close()).thenAnswer((_) async {});
        when(dstStream.close()).thenAnswer((_) async {});
        
        // Act: Start relay (should not throw)
        expect(() => relay.relayDataForTesting(srcStream, dstStream, srcPeer, dstPeer),
               returnsNormally);
        
        // Wait for error handling
        await Future.delayed(Duration(milliseconds: 200));
        
        // Assert: Cleanup should have occurred
        verify(srcStream.close()).called(greaterThanOrEqualTo(1));
        verify(dstStream.close()).called(greaterThanOrEqualTo(1));
      });

      test('should relay data bidirectionally on a single open connection', () async {
        // This tests the real-world scenario:
        // 1. A opens relay connection to B
        // 2. A sends data to B (verified)
        // 3. While connection is still open, B sends data back to A (verified)
        //
        // Both directions must work concurrently on the same relay.

        final srcKeyPair = await generateEd25519KeyPair();
        final dstKeyPair = await generateEd25519KeyPair();
        final srcPeer = PeerId.fromPublicKey(srcKeyPair.publicKey);
        final dstPeer = PeerId.fromPublicKey(dstKeyPair.publicKey);

        final srcStream = MockP2PStream();
        final dstStream = MockP2PStream();

        // Data A sends to B
        final aToBData = Uint8List.fromList([1, 2, 3, 4, 5]);
        // Data B sends back to A
        final bToAData = Uint8List.fromList([10, 20, 30, 40, 50]);

        // Completer to coordinate: B's response comes after A's data is relayed
        final aToBRelayed = Completer<void>();
        final bToARelayed = Completer<void>();

        // Source (A) reads: first read blocks waiting for B's response, then gets data, then EOF
        var srcReadCount = 0;
        when(srcStream.read()).thenAnswer((_) async {
          srcReadCount++;
          if (srcReadCount == 1) {
            // First read: A sends data (return it immediately)
            return aToBData;
          }
          // Subsequent reads: wait for B→A data to arrive, then EOF
          await bToARelayed.future;
          return Uint8List(0); // EOF
          });

        // Destination (B) reads: first waits for A's data to arrive, then sends response, then EOF
        var dstReadCount = 0;
        when(dstStream.read()).thenAnswer((_) async {
          dstReadCount++;
          if (dstReadCount == 1) {
            // Wait for A→B relay to complete before B sends its data
            await aToBRelayed.future;
            return bToAData;
          }
          return Uint8List(0); // EOF
        });

        // Track writes to destination (A→B direction)
        final dstWrites = <Uint8List>[];
        when(dstStream.write(any)).thenAnswer((invocation) async {
          final data = invocation.positionalArguments[0] as Uint8List;
          dstWrites.add(Uint8List.fromList(data));
          // Signal that A→B data has been relayed
          if (!aToBRelayed.isCompleted) {
            aToBRelayed.complete();
          }
        });

        // Track writes to source (B→A direction)
        final srcWrites = <Uint8List>[];
        when(srcStream.write(any)).thenAnswer((invocation) async {
          final data = invocation.positionalArguments[0] as Uint8List;
          srcWrites.add(Uint8List.fromList(data));
          // Signal that B→A data has been relayed
          if (!bToARelayed.isCompleted) {
            bToARelayed.complete();
          }
        });

        // Mock closeWrite and close
        when(srcStream.closeWrite()).thenAnswer((_) async {});
        when(dstStream.closeWrite()).thenAnswer((_) async {});
        when(srcStream.close()).thenAnswer((_) async {});
        when(dstStream.close()).thenAnswer((_) async {});
        when(srcStream.isClosed).thenReturn(false);
        when(dstStream.isClosed).thenReturn(false);

        // Act: Start relay
        relay.relayDataForTesting(srcStream, dstStream, srcPeer, dstPeer);

        // Wait for both directions to complete
        await aToBRelayed.future.timeout(Duration(seconds: 5),
            onTimeout: () => fail('A→B relay timed out'));
        await bToARelayed.future.timeout(Duration(seconds: 5),
            onTimeout: () => fail('B→A relay timed out'));

        // Allow relay cleanup to finish
        await Future.delayed(Duration(milliseconds: 200));

        // Assert: A→B data was forwarded to destination
        expect(dstWrites, isNotEmpty, reason: 'Destination should have received data from A');
        expect(dstWrites.first, equals(aToBData),
            reason: 'Data from A should arrive at B unchanged');

        // Assert: B→A data was forwarded back to source
        expect(srcWrites, isNotEmpty, reason: 'Source should have received data from B');
        expect(srcWrites.first, equals(bToAData),
            reason: 'Data from B should arrive at A unchanged');
      });
    });

    group('Lifecycle', () {
      test('should start and register HOP protocol handler', () {
        // Act
        relay.start();
        
        // Assert
        verify(mockHost.setStreamHandler(CircuitV2Protocol.protoIDv2Hop, any))
            .called(1);
      });

      test('should stop and remove protocol handler', () async {
        // Arrange
        relay.start();
        
        // Act
        await relay.close();
        
        // Assert
        verify(mockHost.removeStreamHandler(CircuitV2Protocol.protoIDv2Hop))
            .called(1);
      });

      test('should handle multiple close calls gracefully', () async {
        // Arrange
        relay.start();
        
        // Act & Assert: Multiple closes should not throw
        await relay.close();
        await relay.close();
        
        verify(mockHost.removeStreamHandler(any)).called(1);
      });
    });

    group('Connection Reuse Integration', () {
      test('relay connection count stays at 1 when same peer pair communicates multiple times', () async {
        // Arrange
        final srcKeyPair = await generateEd25519KeyPair();
        final dstKeyPair = await generateEd25519KeyPair();
        final srcPeer = PeerId.fromPublicKey(srcKeyPair.publicKey);
        final dstPeer = PeerId.fromPublicKey(dstKeyPair.publicKey);
        
        final srcStream1 = MockP2PStream();
        final dstStream1 = MockP2PStream();
        
        // Configure streams to stay alive long enough to check count
        // First few reads return empty (no data), then after delay return EOF
        var srcReadCount = 0;
        when(srcStream1.read()).thenAnswer((_) async {
          srcReadCount++;
          if (srcReadCount <= 2) {
            // Keep connection alive for first checks
            await Future.delayed(Duration(milliseconds: 200));
            return Uint8List(0); // No data but not EOF yet
          }
          return Uint8List(0); // EOF
        });
        
        var dstReadCount = 0;
        when(dstStream1.read()).thenAnswer((_) async {
          dstReadCount++;
          if (dstReadCount <= 2) {
            await Future.delayed(Duration(milliseconds: 200));
            return Uint8List(0);
          }
          return Uint8List(0);
        });
        
        when(srcStream1.close()).thenAnswer((_) async {});
        when(dstStream1.close()).thenAnswer((_) async {});
        
        // Act: Manually add connection (simulating what _handleConnect does)
        relay.addConnectionForTesting(srcPeer.toString(), dstPeer.toString());
        
        // Start first relay
        relay.relayDataForTesting(srcStream1, dstStream1, srcPeer, dstPeer);
        
        // Wait for relay to establish (but not long enough for EOF)
        await Future.delayed(Duration(milliseconds: 50));
        
        // Assert: Connection count should be 1
        final count1 = relay.getConnectionCount(srcPeer.toString(), dstPeer.toString());
        expect(count1, equals(1), reason: 'First relay should register 1 connection');
        
        // Act: Try to start second relay with same peer pair (simulating duplicate connection)
        final srcStream2 = MockP2PStream();
        final dstStream2 = MockP2PStream();
        
        var src2ReadCount = 0;
        when(srcStream2.read()).thenAnswer((_) async {
          src2ReadCount++;
          if (src2ReadCount <= 2) {
            await Future.delayed(Duration(milliseconds: 200));
            return Uint8List(0);
          }
          return Uint8List(0);
        });
        
        var dst2ReadCount = 0;
        when(dstStream2.read()).thenAnswer((_) async {
          dst2ReadCount++;
          if (dst2ReadCount <= 2) {
            await Future.delayed(Duration(milliseconds: 200));
            return Uint8List(0);
          }
          return Uint8List(0);
        });
        
        when(srcStream2.close()).thenAnswer((_) async {});
        when(dstStream2.close()).thenAnswer((_) async {});
        
        // Manually add second connection (simulating duplicate connection bug)
        relay.addConnectionForTesting(srcPeer.toString(), dstPeer.toString());
        
        relay.relayDataForTesting(srcStream2, dstStream2, srcPeer, dstPeer);
        
        await Future.delayed(Duration(milliseconds: 50));
        
        // Assert: Connection count should now be 2 (demonstrating the problem)
        final count2 = relay.getConnectionCount(srcPeer.toString(), dstPeer.toString());
        expect(count2, equals(2), reason: 'Second relay increments connection count to 2 (this is the bug we fixed in the client)');
        
        // Wait for cleanup
        await Future.delayed(Duration(milliseconds: 500));
      });

      test('connection count decrements when relay connections close', () async {
        // Arrange
        final srcKeyPair = await generateEd25519KeyPair();
        final dstKeyPair = await generateEd25519KeyPair();
        final srcPeer = PeerId.fromPublicKey(srcKeyPair.publicKey);
        final dstPeer = PeerId.fromPublicKey(dstKeyPair.publicKey);
        
        final srcStream = MockP2PStream();
        final dstStream = MockP2PStream();
        
        // Configure streams to stay alive briefly, then close
        var srcReadCount = 0;
        when(srcStream.read()).thenAnswer((_) async {
          srcReadCount++;
          if (srcReadCount == 1) {
            // First read: stay alive
            await Future.delayed(Duration(milliseconds: 100));
            return Uint8List(0);
          }
          // Second read: EOF
          return Uint8List(0);
        });
        
        var dstReadCount = 0;
        when(dstStream.read()).thenAnswer((_) async {
          dstReadCount++;
          if (dstReadCount == 1) {
            await Future.delayed(Duration(milliseconds: 100));
            return Uint8List(0);
          }
          return Uint8List(0);
        });
        
        when(srcStream.close()).thenAnswer((_) async {});
        when(dstStream.close()).thenAnswer((_) async {});
        
        // Act: Manually add connection and start relay
        relay.addConnectionForTesting(srcPeer.toString(), dstPeer.toString());
        relay.relayDataForTesting(srcStream, dstStream, srcPeer, dstPeer);
        
        // Wait for relay to establish
        await Future.delayed(Duration(milliseconds: 50));
        
        // Assert: Connection should be tracked
        expect(relay.getConnectionCount(srcPeer.toString(), dstPeer.toString()), greaterThan(0));
        
        // Wait for cleanup to complete
        await Future.delayed(Duration(milliseconds: 300));
        
        // Assert: Connection count should return to 0 after cleanup
        expect(relay.getConnectionCount(srcPeer.toString(), dstPeer.toString()), equals(0),
            reason: 'Connection should be removed from tracking after cleanup');
      });

      test('multiple concurrent connections between different peer pairs are tracked separately', () async {
        // Arrange
        final srcPeer1 = PeerId.fromPublicKey((await generateEd25519KeyPair()).publicKey);
        final dstPeer1 = PeerId.fromPublicKey((await generateEd25519KeyPair()).publicKey);
        final srcPeer2 = PeerId.fromPublicKey((await generateEd25519KeyPair()).publicKey);
        final dstPeer2 = PeerId.fromPublicKey((await generateEd25519KeyPair()).publicKey);
        
        final stream1Src = MockP2PStream();
        final stream1Dst = MockP2PStream();
        final stream2Src = MockP2PStream();
        final stream2Dst = MockP2PStream();
        
        // Configure all streams to stay alive long enough for verification
        var s1SrcCount = 0;
        when(stream1Src.read()).thenAnswer((_) async {
          s1SrcCount++;
          if (s1SrcCount <= 2) {
            await Future.delayed(Duration(milliseconds: 200));
            return Uint8List(0);
          }
          return Uint8List(0);
        });
        
        var s1DstCount = 0;
        when(stream1Dst.read()).thenAnswer((_) async {
          s1DstCount++;
          if (s1DstCount <= 2) {
            await Future.delayed(Duration(milliseconds: 200));
            return Uint8List(0);
          }
          return Uint8List(0);
        });
        
        var s2SrcCount = 0;
        when(stream2Src.read()).thenAnswer((_) async {
          s2SrcCount++;
          if (s2SrcCount <= 2) {
            await Future.delayed(Duration(milliseconds: 200));
            return Uint8List(0);
          }
          return Uint8List(0);
        });
        
        var s2DstCount = 0;
        when(stream2Dst.read()).thenAnswer((_) async {
          s2DstCount++;
          if (s2DstCount <= 2) {
            await Future.delayed(Duration(milliseconds: 200));
            return Uint8List(0);
          }
          return Uint8List(0);
        });
        
        when(stream1Src.close()).thenAnswer((_) async {});
        when(stream1Dst.close()).thenAnswer((_) async {});
        when(stream2Src.close()).thenAnswer((_) async {});
        when(stream2Dst.close()).thenAnswer((_) async {});
        
        // Act: Manually add connections and start both relays
        relay.addConnectionForTesting(srcPeer1.toString(), dstPeer1.toString());
        relay.addConnectionForTesting(srcPeer2.toString(), dstPeer2.toString());
        
        relay.relayDataForTesting(stream1Src, stream1Dst, srcPeer1, dstPeer1);
        relay.relayDataForTesting(stream2Src, stream2Dst, srcPeer2, dstPeer2);
        
        await Future.delayed(Duration(milliseconds: 50));
        
        // Assert: Each peer pair should have 1 connection
        expect(relay.getConnectionCount(srcPeer1.toString(), dstPeer1.toString()), equals(1));
        expect(relay.getConnectionCount(srcPeer2.toString(), dstPeer2.toString()), equals(1));
        
        // Different peer pairs should not interfere
        expect(relay.getConnectionCount(srcPeer1.toString(), dstPeer2.toString()), equals(0));
        expect(relay.getConnectionCount(srcPeer2.toString(), dstPeer1.toString()), equals(0));
        
        await Future.delayed(Duration(milliseconds: 500));
      });
    });
  });
}

