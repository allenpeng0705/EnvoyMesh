// Copyright (c) 2024 The dart-libp2p Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

import 'dart:async';
import 'dart:typed_data';

import 'package:buffer/buffer.dart';
import 'package:dart_libp2p/core/network/stream.dart';

/// A pull-based reader for P2PStream that only reads what's requested.
/// 
/// This is critical for circuit relay to prevent data loss. The eager
/// StreamController-based adapters would over-read data meant for relay
/// forwarding, causing it to be stuck in internal buffers and lost.
/// 
/// BufferedP2PStreamReader:
/// - Only reads from P2PStream when data is actually requested
/// - Exposes remaining unconsumed bytes via [remainingBuffer]
/// - Supports conversion to Stream<List<int>> for DelimitedReader compatibility
class BufferedP2PStreamReader {
  final P2PStream _stream;
  final ByteDataReader _buffer = ByteDataReader();
  bool _eof = false;
  bool _closed = false;
  
  BufferedP2PStreamReader(this._stream);
  
  /// Get remaining unconsumed bytes in buffer.
  /// This is critical for relay: after reading handshake messages,
  /// any buffered application data must be forwarded to the relay peer.
  Uint8List get remainingBuffer {
    if (_buffer.remainingLength == 0) {
      return Uint8List(0);
    }
    return _buffer.read(_buffer.remainingLength);
  }
  
  /// Check if there are bytes remaining in the buffer
  bool get hasRemainingData => _buffer.remainingLength > 0;
  
  /// Number of bytes remaining in buffer
  int get remainingLength => _buffer.remainingLength;
  
  /// Read a single byte from the stream
  Future<int> readByte() async {
    if (_closed) {
      throw StateError('BufferedP2PStreamReader is closed');
    }
    
    // Fill buffer if needed
    while (_buffer.remainingLength == 0 && !_eof) {
      await _fillBuffer(1);
    }
    
    if (_buffer.remainingLength == 0) {
      throw Exception('Unexpected EOF while reading byte');
    }
    
    return _buffer.readUint8();
  }
  
  /// Read a varint from the stream (for length-delimited messages).
  Future<int> readVarint() async {
    final bytes = <int>[];
    var i = 0;
    while (true) {
      final byte = await readByte();
      bytes.add(byte);
      if (byte & 0x80 == 0) {
        break;
      }
      if (i++ > 9) {
        throw Exception('varint too long');
      }
    }
    
    // Decode varint
    var value = 0;
    var shift = 0;
    for (var byte in bytes) {
      value |= (byte & 0x7F) << shift;
      shift += 7;
    }
    return value;
  }
  
  /// Read exactly [length] bytes from the stream.
  /// Throws if EOF is reached before reading [length] bytes.
  Future<Uint8List> readExact(int length) async {
    if (_closed) {
      throw StateError('BufferedP2PStreamReader is closed');
    }
    
    if (length == 0) {
      return Uint8List(0);
    }
    
    // Fill buffer until we have enough bytes
    while (_buffer.remainingLength < length && !_eof) {
      await _fillBuffer(length - _buffer.remainingLength);
    }
    
    if (_buffer.remainingLength < length) {
      throw Exception('Unexpected EOF: requested $length bytes, got ${_buffer.remainingLength}');
    }
    
    return _buffer.read(length);
  }
  
  /// Fill the internal buffer with at least [minBytes] bytes from the P2PStream.
  Future<void> _fillBuffer(int minBytes) async {
    if (_eof || _closed) {
      return;
    }
    
    var bytesRead = 0;
    while (bytesRead < minBytes && !_eof && !_closed) {
      try {
        final chunk = await _stream.read();
        
        if (chunk.isEmpty) {
          // EOF reached
          _eof = true;
          break;
        }
        
        _buffer.add(chunk);
        bytesRead += chunk.length;
        
      } catch (e) {
        // Stream error or closed
        _eof = true;
        rethrow;
      }
    }
  }
  
  /// Adapt this buffered reader to a Stream<List<int>> for DelimitedReader compatibility.
  /// 
  /// This creates a pull-based stream that only reads from P2PStream when
  /// the returned stream is actively being listened to.
  /// 
  /// IMPORTANT: This method should NOT be used if you need to access [remainingBuffer]
  /// afterward, as there's no way to track what DelimitedReader consumed from the stream.
  /// For the relay use case, use [readExact] and [readByte] directly instead.
  Stream<List<int>> asStream() {
    late StreamController<List<int>> controller;
    bool cancelled = false;
    
    Future<void> pumpData() async {
      try {
        // First, yield any data already in buffer
        if (_buffer.remainingLength > 0 && !cancelled) {
          final buffered = _buffer.read(_buffer.remainingLength);
          if (!cancelled && !controller.isClosed) {
            controller.add(buffered);
          }
        }
        
        // Then, pull data on-demand from P2PStream
        while (!_eof && !_closed && !cancelled && !controller.isClosed) {
          final chunk = await _stream.read();
          
          if (chunk.isEmpty) {
            // EOF reached
            _eof = true;
            break;
          }
          
          // Just pass through directly without buffering
          if (!cancelled && !controller.isClosed) {
            controller.add(chunk);
          }
        }
        
      } catch (e, s) {
        if (!cancelled && !controller.isClosed) {
          controller.addError(e, s);
        }
      } finally {
        if (!cancelled && !controller.isClosed) {
          await controller.close();
        }
      }
    }
    
    controller = StreamController<List<int>>(
      onListen: pumpData,
      onCancel: () {
        cancelled = true;
      },
    );
    
    return controller.stream;
  }
  
  /// Close the buffered reader
  void close() {
    _closed = true;
  }
  
  /// Check if the reader has reached EOF
  bool get isEOF => _eof;
  
  /// Check if the reader is closed
  bool get isClosed => _closed;
}

