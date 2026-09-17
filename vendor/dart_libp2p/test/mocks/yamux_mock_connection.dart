import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:dart_libp2p/p2p/transport/multiplexing/yamux/frame.dart';
import 'package:dart_libp2p/core/network/transport_conn.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'base_mock_connection.dart';

/// Mock connection specialized for Yamux multiplexing tests
/// Handles frame boundaries and bidirectional communication
class YamuxMockConnection extends BaseMockConnection implements TransportConn {
  // Peer IDs for the connection
  final PeerId _localPeer;
  final PeerId _remotePeer;
  
  // Stream controllers for bidirectional communication
  final _incomingData = StreamController<List<int>>.broadcast();
  final _outgoingData = StreamController<List<int>>.broadcast();

  // Buffer for incoming data
  final _buffer = <int>[];

  // Stream subscription for cleanup
  StreamSubscription<List<int>>? _subscription;

  // Optional frame logging callback
  void Function(String, YamuxFrame)? frameLogger;

  // Auto-response configuration
  bool autoRespondToSyn;
  bool autoRespondToPing;

  YamuxMockConnection(
    super.id, {
    required PeerId localPeer,
    required PeerId remotePeer,
    this.autoRespondToSyn = true,
    this.autoRespondToPing = true,
  }) : _localPeer = localPeer,
       _remotePeer = remotePeer;
  
  @override
  PeerId get localPeer => _localPeer;
  
  @override
  PeerId get remotePeer => _remotePeer;

  /// Creates a pair of connected Yamux mock connections
  static (YamuxMockConnection, YamuxMockConnection) createPair({
    String id1 = 'yamux1',
    String id2 = 'yamux2',
    bool enableFrameLogging = false,
    bool autoRespondToSyn = true,
    bool autoRespondToPing = true,
  }) {
    // Generate simple peer IDs for testing
    final peer1 = PeerId.fromBytes(Uint8List.fromList(
      List.generate(34, (i) => (i % 250) + 1)..[0]=0x12..[1]=0x20
    ));
    final peer2 = PeerId.fromBytes(Uint8List.fromList(
      List.generate(34, (i) => (i % 250) + 2)..[0]=0x12..[1]=0x20
    ));
    
    final conn1 = YamuxMockConnection(
      id1, 
      localPeer: peer1,
      remotePeer: peer2,
      autoRespondToSyn: autoRespondToSyn, 
      autoRespondToPing: autoRespondToPing,
    );
    final conn2 = YamuxMockConnection(
      id2,
      localPeer: peer2,
      remotePeer: peer1,
      autoRespondToSyn: autoRespondToSyn, 
      autoRespondToPing: autoRespondToPing,
    );

    if (enableFrameLogging) {
      conn1.frameLogger = (id, frame) => print('$id sending frame: type=${frame.type}, flags=${frame.flags}, streamId=${frame.streamId}, length=${frame.length}');
      conn2.frameLogger = (id, frame) => print('$id sending frame: type=${frame.type}, flags=${frame.flags}, streamId=${frame.streamId}, length=${frame.length}');
    }

    // Wire up bidirectional communication with auto-response
    conn1._subscription = conn2._outgoingData.stream.listen((data) {
      print('${conn1.id} received data: ${data.length} bytes');
      if (!conn1.isClosed) {
        conn1._processIncomingData(data, conn2);
      }
    });

    conn2._subscription = conn1._outgoingData.stream.listen((data) {
      print('${conn2.id} received data: ${data.length} bytes');
      if (!conn2.isClosed) {
        conn2._processIncomingData(data, conn1);
      }
    });

    return (conn1, conn2);
  }

  @override
  Future<void> close() async {
    if (isClosed) return;
    print('$id closing connection');

    await _subscription?.cancel();
    await _incomingData.close();
    await _outgoingData.close();
    _buffer.clear();
    markClosed();
    print('$id connection closed');
  }

  @override
  Future<Uint8List> read([int? length]) async {
    validateNotClosed();
    print('$id reading' + (length != null ? ' $length bytes' : ''));

    try {
      // If length is specified, read exactly that many bytes
      if (length != null) {
        // If we already have enough data in the buffer, return it immediately
        if (_buffer.length >= length) {
          final result = Uint8List.fromList(_buffer.take(length).toList());
          _buffer.removeRange(0, length);
          print('$id returning ${result.length} bytes from buffer, ${_buffer.length} bytes remaining');
          return result;
        }

        // Wait until we have enough data
        while (_buffer.length < length) {
          print('$id buffer has ${_buffer.length} bytes, waiting for more data to reach $length bytes');
          await _incomingData.stream.first.timeout(
            Duration(seconds: 30),  // Long timeout for handshake
            onTimeout: () => throw TimeoutException('Read timed out waiting for more data'),
          );
          // No need to add data here as it's already in the buffer
        }

        // Return exactly the requested number of bytes
        final result = Uint8List.fromList(_buffer.take(length).toList());
        _buffer.removeRange(0, length);
        print('$id returning ${result.length} bytes, ${_buffer.length} bytes remaining');
        return result;
      }

      // If no length specified, return all buffered data or wait for next chunk
      if (_buffer.isNotEmpty) {
        final result = Uint8List.fromList(_buffer);
        _buffer.clear();
        print('$id returning all buffered data: ${result.length} bytes');
        return result;
      }

      // Wait for next data chunk
      print('$id waiting for next data chunk');
      await _incomingData.stream.first.timeout(
        Duration(seconds: 30),
        onTimeout: () => throw TimeoutException('Read timed out waiting for data'),
      );

      // Return all buffered data
      final result = Uint8List.fromList(_buffer);
      _buffer.clear();
      print('$id returning all buffered data: ${result.length} bytes');
      return result;
    } catch (e) {
      print('$id error during read: $e');
      rethrow;
    }
  }

  @override
  Future<void> write(Uint8List data) async {
    validateNotClosed();
    print('$id writing ${data.length} bytes');

    if (frameLogger != null) {
      try {
        final frame = YamuxFrame.fromBytes(data);
        frameLogger!(id, frame);
      } catch (e) {
        print('$id error parsing frame: $e');
      }
    }

    recordWrite(data);  // Record data for test verification
    _outgoingData.add(data);  // Send data as-is
    print('$id wrote ${data.length} bytes');
  }

  /// For testing: get current buffer size
  int get debugBufferSize => _buffer.length;

  /// For testing: get buffer contents
  List<int> debugGetBufferContents() => List<int>.from(_buffer);

  @override
  Socket get socket => throw UnimplementedError('Socket not available in mock connection');

  @override
  void setReadTimeout(Duration timeout) {
    // No-op in mock implementation
  }

  @override
  void setWriteTimeout(Duration timeout) {
    // No-op in mock implementation
  }

  @override
  void notifyActivity() {
    // Mock implementation, can be empty or log
  }

  /// Process incoming data and handle auto-responses
  void _processIncomingData(List<int> data, YamuxMockConnection peer) {
    _buffer.addAll(data);
    print('$id buffered data, total buffer size: ${_buffer.length}');
    
    // Try to parse and auto-respond to frames
    _tryAutoRespond(data, peer);
    
    // Notify waiters that data is available
    _incomingData.add([]);
  }

  /// Attempt to parse frames and send auto-responses
  void _tryAutoRespond(List<int> data, YamuxMockConnection peer) {
    try {
      final frame = YamuxFrame.fromBytes(Uint8List.fromList(data));
      
      // Auto-respond to SYN frames with ACK
      if (autoRespondToSyn &&
          frame.type == YamuxFrameType.windowUpdate &&
          (frame.flags & YamuxFlags.syn != 0) &&
          (frame.flags & YamuxFlags.ack == 0)) {

        print('$id auto-responding to SYN frame for stream ${frame.streamId}');
        final synAckFrame = YamuxFrame.synAckStream(frame.streamId);
        
        // Send SYN-ACK response asynchronously to avoid blocking
        Future.microtask(() async {
          if (!peer.isClosed) {
            await peer.write(synAckFrame.toBytes());
            print('$id sent SYN-ACK for stream ${frame.streamId}');
          }
        });
      }
      
      // Auto-respond to PING frames with PONG
      if (autoRespondToPing && 
          frame.type == YamuxFrameType.ping && 
          (frame.flags & YamuxFlags.ack == 0)) {
        
        // For PING frames, the opaque value is stored in the length field
        final opaqueValue = frame.length;
        print('$id auto-responding to PING frame with opaque $opaqueValue');
        final pongFrame = YamuxFrame.ping(true, opaqueValue);
        
        // Send PONG response asynchronously
        Future.microtask(() async {
          if (!peer.isClosed) {
            await peer.write(pongFrame.toBytes());
            print('$id sent PONG for opaque $opaqueValue');
          }
        });
      }
      
    } catch (e) {
      // Not a valid frame or incomplete frame, ignore
      print('$id could not parse frame for auto-response: $e');
    }
  }
}
