import 'dart:async';
import 'dart:typed_data';
import 'base_mock_connection.dart';

/// Mock connection specialized for noise protocol tests
/// Handles message framing and bidirectional communication
class NoiseMockConnection extends BaseMockConnection {
  // Stream controllers for bidirectional communication
  final _incomingData = StreamController<List<int>>.broadcast();
  final _outgoingData = StreamController<List<int>>.broadcast();
  
  // Buffer for incoming data
  final _buffer = <int>[];
  
  // Stream subscription for cleanup
  StreamSubscription<List<int>>? _subscription;
  
  NoiseMockConnection(super.id);

  /// Creates a pair of connected noise mock connections
  static (NoiseMockConnection, NoiseMockConnection) createPair({
    String id1 = 'noise1',
    String id2 = 'noise2',
  }) {
    final conn1 = NoiseMockConnection(id1);
    final conn2 = NoiseMockConnection(id2);
    
    // Wire up bidirectional communication
    conn1._subscription = conn2._outgoingData.stream.listen((data) {
      print('${conn1.id} received data: ${data.length} bytes');
      if (!conn1.isClosed) {
        conn1._buffer.addAll(data);
        print('${conn1.id} buffered data, total buffer size: ${conn1._buffer.length}');
        conn1._incomingData.add([]);  // Just trigger the stream to wake up waiters
      }
    });
    
    conn2._subscription = conn1._outgoingData.stream.listen((data) {
      print('${conn2.id} received data: ${data.length} bytes');
      if (!conn2.isClosed) {
        conn2._buffer.addAll(data);
        print('${conn2.id} buffered data, total buffer size: ${conn2._buffer.length}');
        conn2._incomingData.add([]);  // Just trigger the stream to wake up waiters
      }
    });
    
    return (conn1, conn2);
  }

  @override
  Future<void> close() async {
    if (isClosed) return;
    print('$id closing connection');
    
    // Process any remaining buffered data
    if (_buffer.isNotEmpty) {
      print('$id has ${_buffer.length} bytes in buffer during close');
      _incomingData.add(_buffer);
    }
    
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
          final data = await _incomingData.stream.first.timeout(
            Duration(seconds: 30),  // Long timeout for handshake
            onTimeout: () => throw TimeoutException('Read timed out waiting for more data'),
          );
          print('$id received ${data.length} additional bytes');
          _buffer.addAll(data);
        }

        // Return exactly the requested number of bytes
        final result = Uint8List.fromList(_buffer.take(length).toList());
        _buffer.removeRange(0, length);
        print('$id returning ${result.length} bytes, ${_buffer.length} bytes remaining in buffer');
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
      final data = await _incomingData.stream.first.timeout(
        Duration(seconds: 30),
        onTimeout: () => throw TimeoutException('Read timed out waiting for data'),
      );
      print('$id received ${data.length} bytes');
      return Uint8List.fromList(data);
    } catch (e) {
      print('$id error during read: $e');
      rethrow;
    }
  }

  @override
  Future<void> write(Uint8List data) async {
    validateNotClosed();
    print('$id writing ${data.length} bytes');
    
    recordWrite(data);  // Record data for test verification
    _outgoingData.add(data);  // Send data as-is
    print('$id wrote ${data.length} bytes');
  }

  /// For testing: get current buffer size
  int get debugBufferSize => _buffer.length;

  /// For testing: get buffer contents
  List<int> debugGetBufferContents() => List<int>.from(_buffer);
} 