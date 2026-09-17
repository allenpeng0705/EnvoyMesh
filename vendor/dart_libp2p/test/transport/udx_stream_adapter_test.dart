import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/common.dart';
import 'package:dart_libp2p/core/connmgr/conn_manager.dart';
import 'package:dart_libp2p/core/network/transport_conn.dart';
import 'package:dart_libp2p/p2p/transport/udx_stream_adapter.dart';
import 'package:dart_libp2p/p2p/transport/udx_transport.dart';
import 'package:dart_udx/dart_udx.dart';
import 'package:test/test.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';

import 'udx_stream_adapter_test.mocks.dart';

@GenerateMocks([UDXStream, UDXSessionConn, UDPSocket, UDX, UDXTransport, ConnManager, UDXMultiplexer])
void main() {
  group('UDXP2PStreamAdapter', () {
    late MockUDXStream mockUdxStream;
    late MockUDXSessionConn mockParentConn;
    late UDXP2PStreamAdapter adapter;
    late StreamController<Uint8List> udxDataController;
    late StreamController<void> udxCloseController;

    setUp(() {
      mockUdxStream = MockUDXStream();
      mockParentConn = MockUDXSessionConn();
      udxDataController = StreamController<Uint8List>.broadcast();
      udxCloseController = StreamController<void>.broadcast();

      when(mockUdxStream.id).thenReturn(1);
      when(mockUdxStream.data).thenAnswer((_) => udxDataController.stream);
      when(mockUdxStream.closeEvents).thenAnswer((_) => udxCloseController.stream);
      when(mockUdxStream.closeWrite()).thenAnswer((_) async {});
      when(mockParentConn.notifyActivity()).thenAnswer((_) {});

      adapter = UDXP2PStreamAdapter(
        udxStream: mockUdxStream,
        parentConn: mockParentConn,
        direction: Direction.inbound,
      );
    });

    tearDown(() async {
      await udxDataController.close();
      await udxCloseController.close();
      if (!adapter.isClosed) {
        await adapter.close();
      }
    });

    test('initialization subscribes to udx stream events', () {
      verify(mockUdxStream.data).called(1);
      verify(mockUdxStream.closeEvents).called(1);
      expect(adapter.isClosed, isFalse);
    });

    test('read() returns data from buffer if not empty', () async {
      final testData = Uint8List.fromList([1, 2, 3]);
      udxDataController.add(testData);
      await Future.delayed(Duration.zero); // allow stream to deliver data

      final result = await adapter.read();
      expect(result, equals(testData));
    });

    test('read() waits for data if buffer is empty', () async {
      final testData = Uint8List.fromList([4, 5, 6]);
      
      final readFuture = adapter.read();
      
      // Ensure read is waiting
      await Future.delayed(const Duration(milliseconds: 50));
      udxDataController.add(testData);

      final result = await readFuture;
      expect(result, equals(testData));
    });

    test('read() respects maxLength and buffers remainder', () async {
      final testData = Uint8List.fromList([1, 2, 3, 4, 5]);
      udxDataController.add(testData);
      await Future.delayed(Duration.zero);

      final part1 = await adapter.read(3);
      expect(part1, equals(Uint8List.fromList([1, 2, 3])));

      final part2 = await adapter.read();
      expect(part2, equals(Uint8List.fromList([4, 5])));
    });

    test('read() returns EOF when stream is closed and buffer is empty', () async {
      await udxDataController.close();
      await adapter.close();

      final result = await adapter.read();
      expect(result, isEmpty);
    });

    test('read() waits indefinitely if no data arrives (no timeout)', () async {
      bool completed = false;
      final readFuture = adapter.read().then((v) {
        completed = true;
        return v;
      });

      // Wait briefly - read should still be pending since there is no timeout
      await Future.delayed(const Duration(milliseconds: 200));
      expect(completed, isFalse,
          reason: 'read() must not complete when no data arrives - '
              'yamux keepalive handles liveness, not a read timeout');

      // Clean up: unblock the pending read so tearDown does not hang
      udxDataController.add(Uint8List.fromList([1, 2, 3]));
      await readFuture;
    }, timeout: const Timeout(Duration(seconds: 5)));

    test('write() sends data to udx stream', () async {
      final testData = Uint8List.fromList([7, 8, 9]);
      when(mockUdxStream.add(any)).thenAnswer((_) async {});
      
      await adapter.write(testData);

      verify(mockUdxStream.add(testData)).called(1);
      verify(mockParentConn.notifyActivity()).called(1);
    });

    test('write() throws StateError if stream is closed', () async {
      await adapter.close();
      
      expect(
        () async => await adapter.write([1, 2, 3]),
        throwsA(isA<StateError>()),
      );
    });

    test('close() closes the stream and underlying resources', () async {
      when(mockUdxStream.close()).thenAnswer((_) async {});
      
      await adapter.close();

      expect(adapter.isClosed, isTrue);
      verify(mockUdxStream.close()).called(1);
      expect(adapter.onClose, completes);
    });

    test('reset() closes the stream with an error', () async {
      when(mockUdxStream.close()).thenAnswer((_) async {});
      
      // Call reset() to get the future, but don't await it yet.
      final resetFuture = adapter.reset();

      // Concurrently check that both futures complete with a SocketException.
      await Future.wait([
        expectLater(resetFuture, throwsA(isA<SocketException>())),
        expectLater(adapter.onClose, throwsA(isA<SocketException>())),
      ]);

      // After the futures have completed, the stream should be marked as closed.
      expect(adapter.isClosed, isTrue);
    });

    test('remote close event closes the adapter', () async {
      when(mockUdxStream.close()).thenAnswer((_) async {});
      
      udxCloseController.add(null);
      await adapter.onClose;

      expect(adapter.isClosed, isTrue);
    });

    test('closeWrite() prevents further writes', () async {
      await adapter.closeWrite();

      expect(
        () async => await adapter.write([1, 2, 3]),
        throwsStateError,
      );
    });

    test('closeWrite() allows continued reads', () async {
      await adapter.closeWrite();

      // Should still be able to read data
      final testData = Uint8List.fromList([10, 11, 12]);
      udxDataController.add(testData);
      await Future.delayed(Duration.zero);

      final result = await adapter.read();
      expect(result, equals(testData));
    });

    test('closeWrite() delegates to UDX stream', () async {
      await adapter.closeWrite();

      verify(mockUdxStream.closeWrite()).called(1);
    });

    test('closeWrite() is idempotent', () async {
      await adapter.closeWrite();
      await adapter.closeWrite();
      await adapter.closeWrite();

      // Should only call UDX closeWrite once
      verify(mockUdxStream.closeWrite()).called(1);
    });

    test('full close() after closeWrite() completes successfully', () async {
      when(mockUdxStream.close()).thenAnswer((_) async {});
      
      await adapter.closeWrite();
      await adapter.close();

      expect(adapter.isClosed, isTrue);
      verify(mockUdxStream.closeWrite()).called(1);
      verify(mockUdxStream.close()).called(1);
    });
  });

  group('UDXListener', () {
    late MockUDXMultiplexer mockMultiplexer;
    late MockUDPSocket mockSocket;
    late MockUDX mockUdx;
    late MockUDXTransport mockTransport;
    late MockConnManager mockConnManager;
    late UDXListener listener;
    late StreamController<UDPSocket> connectionsController;

    setUp(() {
      mockMultiplexer = MockUDXMultiplexer();
      mockSocket = MockUDPSocket();
      mockUdx = MockUDX();
      mockTransport = MockUDXTransport();
      mockConnManager = MockConnManager();
      connectionsController = StreamController<UDPSocket>.broadcast();

      when(mockMultiplexer.connections).thenAnswer((_) => connectionsController.stream);
      when(mockMultiplexer.close()).thenAnswer((_) async {});
      when(mockConnManager.registerConnection(any)).thenReturn(true);
      when(mockSocket.getStreamBuffer()).thenReturn(<UDXStream>[]);
      when(mockSocket.flushStreamBuffer()).thenAnswer((_) {});

      listener = UDXListener(
        listeningSocket: mockMultiplexer,
        udxInstance: mockUdx,
        boundAddr: MultiAddr('/ip4/127.0.0.1/udp/12345/udx'),
        transport: mockTransport,
        connManager: mockConnManager,
        sessionConnFactory: ({
          required udpSocket,
          required initialStream,
          required localMultiaddr,
          required remoteMultiaddr,
          required transport,
          required connManager,
          required isDialer,
          required onClosed,
        }) {
          final mockConn = MockUDXSessionConn();
          when(mockConn.id).thenReturn('mock-conn-id');
          when(mockConn.close()).thenAnswer((_) async {});
          return mockConn;
        },
      );
    });

    tearDown(() async {
      await connectionsController.close();
      if (!listener.isClosed) {
        await listener.close();
      }
    });

    test('initialization subscribes to multiplexer connections', () {
      verify(mockMultiplexer.connections).called(1);
      expect(listener.isClosed, isFalse);
    });

    test('handles incoming connection and creates a session', () async {
      final mockIncomingUdxStream = MockUDXStream();
      final streamController = StreamController<UDXEvent>.broadcast();
      
      when(mockIncomingUdxStream.id).thenReturn(100);
      when(mockIncomingUdxStream.close()).thenAnswer((_) async {});
      when(mockSocket.remoteAddress).thenReturn(InternetAddress('192.168.1.10'));
      when(mockSocket.remotePort).thenReturn(54321);
      when(mockSocket.on('stream')).thenAnswer((_) => streamController.stream);
      when(mockSocket.close()).thenAnswer((_) async {});

      final event = UDXEvent('stream', mockIncomingUdxStream);
      
      final acceptFuture = listener.accept();
      
      // Simulate new connection from multiplexer
      connectionsController.add(mockSocket);
      
      // Add a small delay to ensure the listener subscription is set up
      await Future.delayed(const Duration(milliseconds: 10));
      
      // Simulate initial stream on that connection
      streamController.add(event);

      final conn = await acceptFuture;

      expect(conn, isA<MockUDXSessionConn>());
      verify(mockConnManager.registerConnection(any)).called(1);
      
      await streamController.close();
    });

    test('ignores incoming connection if listener is closed', () async {
      when(mockSocket.close()).thenAnswer((_) async {});
      when(mockSocket.remoteAddress).thenReturn(InternetAddress('192.168.1.10'));
      when(mockSocket.remotePort).thenReturn(54321);
      
      await listener.close();
      
      connectionsController.add(mockSocket);
      await Future.delayed(Duration.zero);

      verify(mockSocket.close()).called(1);
      verifyNever(mockConnManager.registerConnection(any));
    });

    test('close() closes the listener and underlying resources', () async {
      await listener.close();

      expect(listener.isClosed, isTrue);
      verify(mockMultiplexer.close()).called(1);
      expect(listener.connectionStream.isBroadcast, isTrue);
    });
  });
}
