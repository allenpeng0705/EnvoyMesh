// Copyright (c) 2022 The dart-libp2p Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

import 'dart:typed_data';

import 'package:buffer/buffer.dart';
import 'package:protobuf/protobuf.dart';

import 'package:dart_libp2p/p2p/protocol/multistream/client.dart';

/// A reader for reading length-prefixed protocol buffer messages.
///
/// The gogo protobuf NewDelimitedReader is buffered, which may eat up stream data.
/// So we need to implement a compatible delimited reader that reads unbuffered.
/// There is a slowdown from unbuffered reading: when reading the message
/// it can take multiple single byte Reads to read the length and another Read
/// to read the message payload.
/// However, this is not critical performance degradation as
///   - the reader is utilized to read one (dialer, stop) or two messages (hop) during
///     the handshake, so it's a drop in the water for the connection lifetime.
///   - messages are small (max 4k) and the length fits in a couple of bytes,
///     so overall we have at most three reads per message.
class DelimitedReader {
  final Stream<List<int>> _stream;
  final ByteDataReader _reader;
  final int _maxSize;

  DelimitedReader(this._stream, this._maxSize) : _reader = ByteDataReader();

  /// Reads a protocol buffer message from the stream.
  Future<T> readMsg<T extends GeneratedMessage>(T message) async {
    // Read the message length
    final length = await _readVarint();
    if (length > _maxSize) {
      throw Exception('message too large');
    }

    // Read the message data
    final data = await _readExact(length);
    
    // Parse the message
    message.mergeFromBuffer(data);
    return message;
  }

  /// Reads a varint from the stream.
  Future<int> _readVarint() async {
    final bytes = <int>[];
    var i = 0;
    while (true) {
      final byte = await _readByte();
      bytes.add(byte);
      if (byte & 0x80 == 0) {
        break;
      }
      if (i++ > 9) {
        throw Exception('varint too long');
      }
    }
    final (value, _) = decodeVarint(Uint8List.fromList(bytes));
    return value;
  }

  /// Reads a single byte from the stream.
  Future<int> _readByte() async {
    if (_reader.remainingLength == 0) {
      await _fillBuffer(1);
    }
    return _reader.readUint8();
  }

  /// Reads exactly [length] bytes from the stream.
  Future<Uint8List> _readExact(int length) async {
    if (_reader.remainingLength < length) {
      await _fillBuffer(length - _reader.remainingLength);
    }
    return _reader.read(length);
  }

  /// Fills the buffer with at least [minBytes] bytes.
  Future<void> _fillBuffer(int minBytes) async {
    var bytesRead = 0;
    await for (final chunk in _stream) {
      _reader.add(chunk);
      bytesRead += chunk.length;
      if (bytesRead >= minBytes) {
        break;
      }
    }
    if (bytesRead < minBytes) {
      throw Exception('unexpected end of stream');
    }
  }
}

/// Writes a length-prefixed protocol buffer message to a sink.
void writeDelimitedMessage(Sink<List<int>> sink, GeneratedMessage message) {
  final messageBytes = message.writeToBuffer();
  final lengthBytes = encodeVarint(messageBytes.length);
  sink.add(lengthBytes);
  sink.add(messageBytes);
}