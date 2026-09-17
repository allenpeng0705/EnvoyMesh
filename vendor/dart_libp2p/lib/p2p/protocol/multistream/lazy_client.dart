/// Package multistream implements lazy client functionality for the
/// multistream-select protocol. The protocol is defined at
/// https://github.com/multiformats/multistream-select

import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dart_libp2p/core/network/stream.dart';
import 'package:dart_libp2p/core/protocol/protocol.dart';
import 'package:dart_libp2p/p2p/protocol/multistream/multistream.dart';
import 'package:dart_libp2p/p2p/protocol/multistream/client.dart';


/// LazyConn is a ReadWriteCloser adapter that lazily negotiates a protocol
/// using multistream-select on first use.
abstract class LazyConn {
  /// Read reads data from the stream.
  Future<Uint8List> read([int? maxLength]);

  /// Write writes data to the stream.
  Future<void> write(Uint8List data);

  /// Close closes the underlying stream.
  Future<void> close();

  /// Flush sends the handshake.
  Future<void> flush();
}

/// NewMSSelect returns a new Multistream which is able to perform
/// protocol selection with a MultistreamMuxer.
LazyConn newMSSelect(P2PStream<dynamic> stream, ProtocolID proto) {
  return _LazyClientConn(
    protos: [protocolID, proto],
    stream: stream,
  );
}

/// NewMultistream returns a multistream for the given protocol. This will not
/// perform any protocol selection. If you are using a MultistreamMuxer, use
/// NewMSSelect.
LazyConn newMultistream(P2PStream<dynamic> stream, ProtocolID proto) {
  return _LazyClientConn(
    protos: [proto],
    stream: stream,
  );
}

/// _LazyClientConn is a ReadWriteCloser adapter that lazily negotiates a protocol
/// using multistream-select on first use.
///
/// It *does not* block writes waiting for the other end to respond. Instead, it
/// simply assumes the negotiation went successfully and starts writing data.
class _LazyClientConn implements LazyConn {
  // Used to ensure we only trigger the write half of the handshake once.
  final _writeHandshakeLock = Completer<void>();
  Exception? _writeError;
  bool _writeHandshakeDone = false;

  // Used to ensure we only trigger the read half of the handshake once.
  final _readHandshakeLock = Completer<void>();
  Exception? _readError;
  bool _readHandshakeDone = false;

  // The sequence of protocols to negotiate.
  final List<ProtocolID> protos;

  // The inner connection.
  final P2PStream<dynamic> stream;

  _LazyClientConn({
    required this.protos,
    required this.stream,
  });

  /// Read reads data from the stream.
  ///
  /// If the protocol hasn't yet been negotiated, this method triggers the write
  /// half of the handshake and then waits for the read half to complete.
  ///
  /// It returns an error if the read half of the handshake fails.
  @override
  Future<Uint8List> read([int? maxLength]) async {
    if (!_readHandshakeDone) {
      if (!_writeHandshakeDone) {
        // Ensure write handshake is started
        _startWriteHandshake();
      }

      // Do read handshake
      await _doReadHandshake();

      if (_readError != null) {
        throw _readError!;
      }
    }

    if (maxLength == null || maxLength <= 0) {
      return Uint8List(0);
    }

    return await stream.read(maxLength);
  }

  /// Performs the read handshake
  Future<void> _doReadHandshake() async {
    if (_readHandshakeDone) return;

    try {
      for (final proto in protos) {
        // Read protocol
        final tok = await readNextToken(stream);

        if (tok == 'na') {
          _readError = ProtocolNotSupportedException([proto]);
          _readHandshakeLock.complete();
          _readHandshakeDone = true;
          return;
        }

        if (tok != proto) {
          _readError = FormatException('Protocol mismatch in lazy handshake ($tok != $proto)');
          _readHandshakeLock.complete();
          _readHandshakeDone = true;
          return;
        }
      }

      _readHandshakeLock.complete();
      _readHandshakeDone = true;
    } catch (e) {
      _readError = e is Exception ? e : Exception('Unknown error: $e');
      _readHandshakeLock.complete();
      _readHandshakeDone = true;
    }
  }

  /// Starts the write handshake
  void _startWriteHandshake() {
    if (_writeHandshakeDone) return;

    // Start read handshake in background
    unawaited(_doReadHandshake());

    // Do write handshake
    _doWriteHandshake();
  }

  /// Performs the write handshake
  void _doWriteHandshake() {
    _doWriteHandshakeWithData(null);
  }

  /// Performs the write handshake and also writes some extra data
  int _doWriteHandshakeWithData(Uint8List? extra) {
    if (_writeHandshakeDone) {
      return 0;
    }

    try {
      // Create a buffer for the handshake
      final buffer = StringBuffer();

      // Write each protocol
      for (final proto in protos) {
        final protoBytes = utf8.encode(proto);
        final lengthBytes = encodeVarint(protoBytes.length + 1);

        // Write length
        for (final b in lengthBytes) {
          buffer.writeCharCode(b);
        }

        // Write protocol
        buffer.write(proto);

        // Write newline
        buffer.writeCharCode(10); // '\n'
      }

      // Convert buffer to bytes
      final handshakeBytes = utf8.encode(buffer.toString());

      // Write handshake
      if (extra == null || extra.isEmpty) {
        // Just write the handshake
        stream.write(Uint8List.fromList(handshakeBytes));
        _writeHandshakeLock.complete();
        _writeHandshakeDone = true;
        return 0;
      } else {
        // Write handshake and extra data
        final combined = Uint8List(handshakeBytes.length + extra.length);
        combined.setRange(0, handshakeBytes.length, handshakeBytes);
        combined.setRange(handshakeBytes.length, handshakeBytes.length + extra.length, extra);
        stream.write(combined);
        _writeHandshakeLock.complete();
        _writeHandshakeDone = true;
        return extra.length;
      }
    } catch (e) {
      _writeError = e is Exception ? e : Exception('Unknown error: $e');
      _writeHandshakeLock.complete();
      _writeHandshakeDone = true;
      return 0;
    }
  }

  /// Write writes data to the stream.
  ///
  /// If the protocol has not yet been negotiated, write waits for the write half
  /// of the handshake to complete triggers (but does not wait for) the read half.
  ///
  /// Write *also* ignores errors from the read half of the handshake (in case the
  /// stream is actually write only).
  @override
  Future<void> write(Uint8List data) async {
    int bytesWritten = 0;

    if (!_writeHandshakeDone) {
      // Start read handshake in background
      unawaited(_doReadHandshake());

      // Do write handshake with data
      bytesWritten = _doWriteHandshakeWithData(data);

      if (_writeError != null) {
        throw _writeError!;
      }

      if (bytesWritten > 0) {
        return;
      }
    }

    await stream.write(data);
  }

  /// Close closes the underlying stream after finishing the handshake.
  @override
  Future<void> close() async {
    // Flush the handshake on close
    await flush();

    // Finish reading the handshake before closing
    if (!_readHandshakeDone) {
      await _doReadHandshake();
    }

    await stream.close();
  }

  /// Flush sends the handshake.
  @override
  Future<void> flush() async {
    if (!_writeHandshakeDone) {
      // Start read handshake in background
      unawaited(_doReadHandshake());

      // Do write handshake
      _doWriteHandshake();

      if (_writeError != null) {
        throw _writeError!;
      }
    }
  }
}

// Use the helper functions from client.dart for reading/writing delimited messages
// and varint encoding/decoding
