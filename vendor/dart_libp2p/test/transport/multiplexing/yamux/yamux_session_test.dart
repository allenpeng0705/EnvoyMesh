import 'dart:async';
import 'dart:typed_data';

import 'package:dart_libp2p/core/network/conn.dart' as core_conn show Conn, ConnState; // Corrected to ConnState
import 'package:dart_libp2p/core/network/context.dart' as core_context;
import 'package:dart_libp2p/core/network/transport_conn.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/multiplexer.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/yamux/session.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/yamux/stream.dart';
import 'package:dart_libp2p/p2p/transport/multiplexing/yamux/frame.dart';
import 'package:logging/logging.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';
import 'package:test/test.dart';

// Generate mocks for TransportConn
@GenerateMocks([TransportConn])
import 'yamux_session_test.mocks.dart'; // Ensure this path is correct

void main() {
  group('YamuxSession and YamuxStream Conn Integration', () {
    late MockTransportConn mockTransportConn;
    late YamuxSession clientSession;
    late MultiplexerConfig yamuxConfig;
    late PeerId clientPeerId;
    late PeerId serverPeerId;
    late MultiAddr clientMa;
    late MultiAddr serverMa;

    setUp(() async {
      // Use fixed byte arrays for PeerIds for deterministic tests
      // Using simple generation for mock purposes, real key generation is more complex
      clientPeerId = PeerId.fromBytes(Uint8List.fromList(List.generate(34, (i) => (i % 250) + 1)..[0]=0x12..[1]=0x20)) as PeerId; // Example Ed25519 PeerId bytes
      serverPeerId = PeerId.fromBytes(Uint8List.fromList(List.generate(34, (i) => (i % 250) + 2)..[0]=0x12..[1]=0x20)) as PeerId; // Example Ed25519 PeerId bytes


      clientMa = MultiAddr('/ip4/127.0.0.1/tcp/12345');
      serverMa = MultiAddr('/ip4/192.168.0.10/tcp/54321');

      mockTransportConn = MockTransportConn();
      when(mockTransportConn.localPeer).thenReturn(clientPeerId);
      when(mockTransportConn.remotePeer).thenReturn(serverPeerId);
      when(mockTransportConn.localMultiaddr).thenReturn(clientMa);
      when(mockTransportConn.remoteMultiaddr).thenReturn(serverMa);
      when(mockTransportConn.isClosed).thenReturn(false);
      when(mockTransportConn.id).thenReturn('mock-transport-conn-01');
      when(mockTransportConn.state).thenReturn(core_conn.ConnState( // Using explicit alias core_conn.ConnState
          transport: 'mock-tcp', 
          security: 'mock-noise', 
          streamMultiplexer: '', // Or a relevant mock protocol ID
          usedEarlyMuxerNegotiation: false, // Provide a default
      ));
      
      // Feed data to the session's read loop via a queue of pending reads
      final pendingReads = <Completer<Uint8List>>[];
      final dataToFeed = <Uint8List>[];

      void _feedData(Uint8List data) {
        if (pendingReads.isNotEmpty) {
          final c = pendingReads.removeAt(0);
          c.complete(data);
        } else {
          dataToFeed.add(data);
        }
      }

      when(mockTransportConn.read(any)).thenAnswer((_) {
        if (dataToFeed.isNotEmpty) {
          return Future.value(dataToFeed.removeAt(0));
        }
        final c = Completer<Uint8List>();
        pendingReads.add(c);
        return c.future;
      });

      // Mock write: intercept SYN frames and respond with ACK via read
      when(mockTransportConn.write(any)).thenAnswer((invocation) async {
        final data = invocation.positionalArguments[0] as Uint8List;
        try {
          final frame = YamuxFrame.fromBytes(data);
          if (frame.type == YamuxFrameType.windowUpdate &&
              (frame.flags & YamuxFlags.syn != 0)) {
            final ackBytes = YamuxFrame.synAckStream(frame.streamId).toBytes();
            _feedData(ackBytes);
          }
        } catch (_) {}
      });


      yamuxConfig = MultiplexerConfig(
        keepAliveInterval: Duration(seconds: 30),
        maxStreamWindowSize: 1024 * 1024, 
        initialStreamWindowSize: 256 * 1024, 
        streamWriteTimeout: Duration(seconds: 10),
        maxStreams: 256,
        // Removed invalid parameters: acceptBacklog, enableKeepAlive, connectionWriteTimeout, logLevel, receiveWindowSize
      );

      clientSession = YamuxSession(
        mockTransportConn,
        yamuxConfig,
        true, // isClient
        // Removed Logger argument, PeerScope is optional and can be null/omitted
      );
      // No need to start the session's internal loop for this specific test.
    });

    tearDown(() async {
      // It's good practice to close the session if it has any internal resources,
      // though for this specific test, it might not be strictly necessary
      // as we are not starting its loop.
      // However, if openStream or stream.close interact with session state that needs cleanup:
      if (!clientSession.isClosed) {
         // Reset mocks for close operations if needed
        reset(mockTransportConn);
        when(mockTransportConn.isClosed).thenReturn(false); // Simulate not yet closed for session's close logic
        when(mockTransportConn.write(any)).thenAnswer((_) async {}); // For GOAWAY frame
        when(mockTransportConn.close()).thenAnswer((_) async {}); // Underlying transport close
        await clientSession.close();
      }
    });

    test('YamuxStream.conn returns its parent YamuxSession and correct connection details', () async {
      // Arrange
      // clientSession is set up. openStream will create a YamuxStream.

      // Act
      final YamuxStream yamuxStream = await clientSession.openStream(core_context.Context()) as YamuxStream;

      // Assert
      // This is the part that will fail until YamuxStream.conn is implemented correctly.
      expect(yamuxStream.conn, isA<core_conn.Conn>(), reason: "stream.conn should be a Conn object."); // Use core_conn.Conn for type check
      expect(yamuxStream.conn, same(clientSession), reason: "stream.conn should be the same instance as the parent YamuxSession.");
      
      // Verify properties accessed via stream.conn
      final connFromStream = yamuxStream.conn;
      expect(connFromStream.localPeer, same(clientPeerId), reason: "stream.conn.localPeer mismatch.");
      expect(connFromStream.remotePeer, same(serverPeerId), reason: "stream.conn.remotePeer mismatch.");
      expect(connFromStream.localMultiaddr, same(clientMa), reason: "stream.conn.localMultiaddr mismatch.");
      expect(connFromStream.remoteMultiaddr, same(serverMa), reason: "stream.conn.remoteMultiaddr mismatch.");
      expect(connFromStream.state.streamMultiplexer, equals(YamuxConstants.protocolId), reason: "stream.conn.state.streamMultiplexer mismatch.");
      // The ID of the Conn returned by stream.conn should be the ID of the YamuxSession,
      // which in turn gets its ID from the underlying transport connection.
      expect(connFromStream.id, equals('mock-transport-conn-01'), reason: "stream.conn.id should reflect underlying transport conn id via session");


      // Clean up stream
      // Closing the stream will attempt to send a FIN frame.
      // Ensure mockTransportConn.write can handle this.
      // The mock for write is already set up in setUp to accept any.
      // If stream.close() has specific interactions with session that need mock reset, do it here.
      // For now, assuming the existing mock setup for write is sufficient.
      when(mockTransportConn.isClosed).thenReturn(false); // Ensure it's not seen as already closed by stream logic
      
      await yamuxStream.close();
    });
  });

  group('YamuxSession Keepalive', () {
    test('session should close when keepalive ping send fails due to closed underlying connection', () async {
      // This test proves the zombie session bug: when the underlying transport
      // connection dies, keepalive ping sends fail but the session never closes.
      // It keeps firing pings every interval, logging errors indefinitely.

      final clientPeerId = PeerId.fromBytes(Uint8List.fromList(
          List.generate(34, (i) => (i % 250) + 1)..[0] = 0x12..[1] = 0x20));
      final serverPeerId = PeerId.fromBytes(Uint8List.fromList(
          List.generate(34, (i) => (i % 250) + 2)..[0] = 0x12..[1] = 0x20));

      final mockConn = MockTransportConn();
      when(mockConn.localPeer).thenReturn(clientPeerId);
      when(mockConn.remotePeer).thenReturn(serverPeerId);
      when(mockConn.localMultiaddr).thenReturn(MultiAddr('/ip4/127.0.0.1/tcp/1'));
      when(mockConn.remoteMultiaddr).thenReturn(MultiAddr('/ip4/127.0.0.1/tcp/2'));
      when(mockConn.isClosed).thenReturn(false);
      when(mockConn.id).thenReturn('test-keepalive-conn');
      when(mockConn.state).thenReturn(core_conn.ConnState(
        transport: 'mock-tcp',
        security: 'mock-noise',
        streamMultiplexer: '',
        usedEarlyMuxerNegotiation: false,
      ));
      when(mockConn.close()).thenAnswer((_) async {});

      // Keep the read loop alive with a never-completing future
      final readBlocker = Completer<Uint8List>();
      when(mockConn.read(any)).thenAnswer((_) => readBlocker.future);

      // Track whether write has been switched to throw
      var writesShouldFail = false;

      when(mockConn.write(any)).thenAnswer((_) async {
        if (writesShouldFail) {
          throw StateError('Stream is closed');
        }
      });

      // Create session with FAST keepalive (100ms)
      final config = MultiplexerConfig(
        keepAliveInterval: Duration(milliseconds: 100),
        maxStreamWindowSize: 256 * 1024,
        initialStreamWindowSize: 256 * 1024,
        streamWriteTimeout: Duration(seconds: 10),
        maxStreams: 256,
      );

      final session = YamuxSession(mockConn, config, true);

      // Let session init and first ping succeed
      await Future.delayed(Duration(milliseconds: 50));
      expect(session.isClosed, isFalse, reason: 'Session should be open initially');

      // Now simulate the underlying connection dying
      writesShouldFail = true;

      // Wait for at least 2 keepalive intervals so a ping fires and fails
      await Future.delayed(Duration(milliseconds: 300));

      // THE KEY ASSERTION: session should have closed itself
      expect(session.isClosed, isTrue,
          reason: 'Session should close when keepalive ping send fails '
              'due to closed underlying connection. '
              'Currently it stays open as a zombie.');

      // Cleanup: unblock the read loop
      if (!readBlocker.isCompleted) {
        readBlocker.completeError(StateError('test cleanup'));
      }
    }, timeout: Timeout(Duration(seconds: 5)));
  });
}
