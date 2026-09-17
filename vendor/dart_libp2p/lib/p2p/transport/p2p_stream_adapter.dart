import 'package:uuid/uuid.dart'; // Moved to top
import 'dart:async';
import 'dart:typed_data';

import 'package:dart_libp2p/core/network/common.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/network/context.dart';
import 'package:dart_libp2p/core/network/mux.dart' show MuxedStream, ResetException; // Added ResetException
import 'package:dart_libp2p/core/network/rcmgr.dart' show StreamManagementScope, StreamScope;
import 'package:dart_libp2p/core/network/stream.dart' show P2PStream, StreamStats;
import 'package:dart_libp2p/p2p/transport/tcp_connection.dart'; // Assuming TCPConnection will be the parent

class P2PStreamAdapter implements P2PStream<Uint8List> {
  final MuxedStream _underlyingMuxedStream;
  final TCPConnection _parentConnection; // Or a more generic Conn type if needed
  final StreamManagementScope _streamManagementScope;
  final Direction _direction; // Added direction
  String _protocolId;
  final String _id;
  bool _isClosed = false;

  // Stream controller for the 'incoming' getter
  late StreamController<Uint8List> _incomingDataController;
  StreamSubscription? _muxedStreamSubscription;

  P2PStreamAdapter(
    this._underlyingMuxedStream,
    this._parentConnection,
    this._streamManagementScope,
    this._direction, // Added direction
    this._protocolId,
  ) : _id = Uuid().v4() { // Initialize unique ID
    _incomingDataController = StreamController<Uint8List>(
      onListen: _startListening,
      onCancel: _stopListening,
    );
  }

  void _startListening() {
    // This is a simplified read loop. A more robust implementation
    // might handle backpressure and read chunking based on maxLength.
    _muxedStreamSubscription = Stream.fromFuture(
      Future(() async {
        while (!_isClosed && !_incomingDataController.isClosed) {
          try {
            final data = await _underlyingMuxedStream.read(0); 
            if (data.isNotEmpty) {
              if (!_incomingDataController.isClosed) {
                _incomingDataController.add(Uint8List.fromList(data));
              }
            } else {
              // Empty data might signify EOF from muxer for some implementations
              await _handleResetOrClose();
              break;
            }
          } on ResetException {
            await _handleResetOrClose();
            break;
          } catch (e) {
            if (!_isClosed && !_incomingDataController.isClosed) {
              _incomingDataController.addError(e);
            }
            await _handleResetOrClose(); 
            break;
          }
        }
      }).catchError((e) { // Catch errors from the Future itself
          if (!_isClosed && !_incomingDataController.isClosed) {
            _incomingDataController.addError(e);
          }
          // Ensure cleanup even if the future fails before listen() is set up or during its execution
          _handleResetOrClose().catchError((_) {}); // Fire and forget
      }),
    ).listen(
      null, // Data is handled by the Future's loop
      onError: (e) {
        // This onError is for errors passed through _incomingDataController.addError()
        // or errors from the stream generation logic itself if not caught by the Future's catchError.
        // The primary error handling and stream closing should be within the Future.
        // If an error reaches here, it implies the controller is still open.
        if (!_incomingDataController.isClosed) {
           _incomingDataController.addError(e);
        }
        _handleResetOrClose().catchError((_) {}); // Fire and forget
      },
      onDone: () {
        _handleResetOrClose().catchError((_) {}); // Fire and forget
      },
      cancelOnError: true, // Automatically cancel subscription on error
    );
  }

  void _stopListening() {
    _muxedStreamSubscription?.cancel();
    _muxedStreamSubscription = null;
  }

  Future<void> _handleResetOrClose() async {
    if (_isClosed) return;
    _isClosed = true;
    _muxedStreamSubscription?.cancel();
    _muxedStreamSubscription = null;
    if (!_incomingDataController.isClosed) {
      await _incomingDataController.close();
    }
    _streamManagementScope.done(); // Removed await, .done() is void
  }

  @override
  String id() => _id;

  @override
  String protocol() => _protocolId;

  @override
  Future<void> setProtocol(String id) async {
    _protocolId = id;
    await _streamManagementScope.setProtocol(id);
  }

  @override
  StreamStats stat() {
    // Direction needs to be determined based on how the stream was created (inbound/outbound)
    // This information should ideally be passed to or be derivable by P2PStreamAdapter
    return StreamStats(
      direction: _direction, // Use the provided direction
      opened: DateTime.now(), // TODO: Get actual open time from when stream was accepted/opened
      limited: false, // TODO: Get from scope if available
      extra: {},
    );
  }


  @override
  StreamManagementScope scope() {
    // This is a pragmatic cast. Ideally, StreamManagementScope would implement StreamScope
    // or provide a getter for it. This change assumes such compatibility is intended.
    // If StreamManagementScope is not meant to be a StreamScope, rcmgr.dart needs adjustment.
    return _streamManagementScope ;
  }


  @override
  Future<Uint8List> read([int? maxLength]) async {
    if (_isClosed) {
      throw ResetException('Stream is closed');
    }
    try {
      // MuxedStream.read expects a length. If maxLength is null, decide a default.
      // If maxLength is 0, it might mean read whatever is available for some muxers.
      // This needs to align with the specific MuxedStream implementation.
      final data = await _underlyingMuxedStream.read(maxLength ?? 0); // Assuming 0 means read available for underlying
      return Uint8List.fromList(data);
    } on ResetException {
      await _handleResetOrClose();
      rethrow;
    } catch (e) {
      await _handleResetOrClose();
      throw ResetException('Read error: $e');
    }
  }

  @override
  Future<void> write(Uint8List data) async {
    if (_isClosed) {
      throw ResetException('Stream is closed');
    }
    try {
      await _underlyingMuxedStream.write(data);
    } on ResetException {
      await _handleResetOrClose();
      rethrow;
    } catch (e) {
      await _handleResetOrClose();
      throw ResetException('Write error: $e');
    }
  }

  @override
  P2PStream<Uint8List> get incoming => this; // The adapter itself can be the stream of incoming data

  @override
  Stream<Uint8List> get stream => _incomingDataController.stream;


  @override
  Future<void> close() async {
    if (_isClosed) return;
    try {
      await _underlyingMuxedStream.close();
    } catch (e) {
      // Log error, but proceed with local cleanup
    } finally {
      await _handleResetOrClose();
    }
  }

  @override
  Future<void> closeWrite() async {
    if (_isClosed) return;
    try {
      await _underlyingMuxedStream.closeWrite();
    } on ResetException {
      // If closeWrite causes a reset, treat it as such.
      await _handleResetOrClose();
      rethrow;
    } catch (e) {
      // Log or handle other errors
      // Decide if this should also trigger _handleResetOrClose
    }
    // Note: closeWrite in MuxedStream doesn't free the stream.
    // The P2PStream contract implies that full close/reset is still needed.
  }

  @override
  Future<void> closeRead() async {
    if (_isClosed) return;
    try {
      await _underlyingMuxedStream.closeRead();
      // After closing read side, we should stop our read loop.
      _muxedStreamSubscription?.cancel();
      _muxedStreamSubscription = null;
      if (!_incomingDataController.isClosed) {
         // No more data will come, so close the controller if it's not already.
        await _incomingDataController.close();
      }
    } on ResetException {
      await _handleResetOrClose();
      rethrow;
    } catch (e) {
    }
    // Note: closeRead in MuxedStream doesn't free the stream.
  }

  @override
  Future<void> reset() async {
    if (_isClosed) return;
    try {
      await _underlyingMuxedStream.reset();
    } catch (e) {
      // Log error, but proceed with local cleanup
    } finally {
      await _handleResetOrClose();
    }
  }

  @override
  Future<void> setDeadline(DateTime? time) async {
    // P2PStream allows nullable DateTime for clearing, MuxedStream does not.
    // If time is null, we can't directly call setDeadline on MuxedStream
    // unless the specific MuxedStream implementation has a way to clear deadlines.
    // For now, if time is null, we do nothing. If a clear operation is needed,
    // the MuxedStream interface might need an update or specific handling.
    if (time != null) {
      _underlyingMuxedStream.setDeadline(time);
    }
  }

  @override
  Future<void> setReadDeadline(DateTime time) async {
    _underlyingMuxedStream.setReadDeadline(time);
  }

  @override
  Future<void> setWriteDeadline(DateTime time) async {
    _underlyingMuxedStream.setWriteDeadline(time);
  }

  @override
  bool get isClosed => _isClosed;

  @override
  bool get isWritable => !_isClosed;

  @override
  Conn get conn => _parentConnection;


}
