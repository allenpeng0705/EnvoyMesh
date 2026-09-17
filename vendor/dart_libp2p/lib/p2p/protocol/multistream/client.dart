/// Package multistream implements client functionality for the
/// multistream-select protocol. The protocol is defined at
/// https://github.com/multiformats/multistream-select

import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dart_libp2p/core/network/stream.dart';
import 'package:dart_libp2p/core/protocol/protocol.dart';
import 'package:dart_libp2p/p2p/protocol/multistream/multistream.dart';

/// ErrNotSupported is the error returned when the muxer doesn't support
/// the protocols tried for the handshake.
class ProtocolNotSupportedException implements Exception {
  /// List of protocols that were not supported by the muxer
  final List<ProtocolID> protocols;

  const ProtocolNotSupportedException(this.protocols);

  @override
  String toString() => 'Protocols not supported: $protocols';
}

/// ErrUnrecognizedResponse is the error returned when the muxer responds with
/// an unexpected message.
class UnrecognizedResponseException implements Exception {
  final String actual;
  final String expected;

  const UnrecognizedResponseException({required this.actual, required this.expected});

  @override
  String toString() => 'Unrecognized response. Expected: $expected (or na). Got: $actual';
}

/// ErrNoProtocols is the error thrown when no protocols have been specified.
class NoProtocolsException implements Exception {
  const NoProtocolsException();

  @override
  String toString() => 'No protocols specified';
}

/// SelectProtoOrFail performs the initial multistream handshake
/// to inform the muxer of the protocol that will be used to communicate
/// on this stream. It returns an error if the muxer does not support the protocol.
Future<void> selectProtoOrFail(ProtocolID proto, P2PStream<dynamic> stream) async {
  try {
    // Send the multistream protocol ID and the requested protocol
    await writeDelimited(stream, utf8.encode(protocolID));
    await writeDelimited(stream, utf8.encode(proto));

    // Read the multistream header response
    final headerResponse = await readNextToken(stream);
    if (headerResponse != protocolID) {
      throw FormatException('Received mismatch in protocol id');
    }

    // Read the protocol response
    final protoResponse = await readNextToken(stream);
    if (protoResponse == 'na') {
      throw ProtocolNotSupportedException([proto]);
    } else if (protoResponse != proto) {
      throw UnrecognizedResponseException(actual: protoResponse, expected: proto);
    }

    // Success - protocol selected
    return;
  } catch (e) {
    if (e is! ProtocolNotSupportedException && 
        e is! UnrecognizedResponseException && 
        e is! FormatException) {
      await stream.reset();
    }
    rethrow;
  }
}

/// SelectOneOf will perform handshakes with the protocols on the given list
/// until it finds one which is supported by the muxer.
Future<ProtocolID> selectOneOf(List<ProtocolID> protos, P2PStream<dynamic> stream) async {
  if (protos.isEmpty) {
    throw const NoProtocolsException();
  }

  try {
    // Try the first protocol with the initial handshake
    try {
      await selectProtoOrFail(protos[0], stream);
      return protos[0];
    } on ProtocolNotSupportedException {
      // First protocol not supported, try the others
    } catch (e) {
      // Other error, propagate it
      rethrow;
    }

    // Try the remaining protocols
    for (var i = 1; i < protos.length; i++) {
      try {
        await _trySelect(protos[i], stream);
        return protos[i];
      } on ProtocolNotSupportedException {
        // Protocol not supported, continue to the next one
        continue;
      }
    }

    // None of the protocols were supported
    throw ProtocolNotSupportedException(protos);
  } catch (e) {
    if (e is! ProtocolNotSupportedException) {
      await stream.reset();
    }
    rethrow;
  }
}

/// Tries to select a protocol by sending it to the muxer and reading the response
Future<void> _trySelect(ProtocolID proto, P2PStream<dynamic> stream) async {
  await writeDelimited(stream, utf8.encode(proto));

  final response = await readNextToken(stream);
  if (response == 'na') {
    throw ProtocolNotSupportedException([proto]);
  } else if (response != proto) {
    throw UnrecognizedResponseException(actual: response, expected: proto);
  }
}

/// Writes a delimited message to the stream
Future<void> writeDelimited(P2PStream<dynamic> stream, List<int> message) async {
  // Encode the length as a varint
  final lengthBytes = encodeVarint(message.length + 1);

  // Create the full message: length + message + newline
  final fullMessage = Uint8List(lengthBytes.length + message.length + 1);
  fullMessage.setRange(0, lengthBytes.length, lengthBytes);
  fullMessage.setRange(lengthBytes.length, lengthBytes.length + message.length, message);
  fullMessage[lengthBytes.length + message.length] = 10; // '\n'

  // Write to the stream
  await stream.write(fullMessage);
}

/// Reads a delimited message from the stream
Future<Uint8List> readDelimited(P2PStream<dynamic> stream) async {
  // Read the first byte to determine if we need to read more for the varint
  final firstByte = await stream.read(1);
  if (firstByte.isEmpty) {
    throw FormatException('Unexpected end of stream');
  }

  // Determine how many more bytes we need to read for the varint
  int bytesToRead = 0;
  if (firstByte[0] >= 0x80) {
    // We need to read more bytes
    bytesToRead = 1;
    int b = firstByte[0];
    while (b >= 0x80 && bytesToRead < 9) {
      b >>= 7;
      bytesToRead++;
    }
    if (bytesToRead >= 9) {
      throw FormatException('Varint too long');
    }
  }

  // Read the rest of the varint bytes if needed
  Uint8List varintBytes;
  if (bytesToRead > 0) {
    final restOfVarint = await stream.read(bytesToRead - 1);
    varintBytes = Uint8List(bytesToRead);
    varintBytes[0] = firstByte[0];
    varintBytes.setRange(1, bytesToRead, restOfVarint);
  } else {
    varintBytes = firstByte;
  }


  // Decode the varint to get the message length
  final (length, _) = decodeVarint(varintBytes);
  if (length > 1024) {
    throw MessageTooLargeException();
  }

  // Read the message
  final message = await stream.read(length);
  if (message.length != length) {
    throw FormatException('Unexpected end of stream');
  }

  // Check for trailing newline
  if (message.isEmpty || message[length - 1] != 10) { // '\n'
    throw FormatException('Message did not have trailing newline');
  }

  // Return the message without the trailing newline
  return Uint8List.fromList(message.sublist(0, length - 1));
}

/// Reads the next token from the stream
Future<String> readNextToken(P2PStream<dynamic> stream) async {
  final bytes = await readDelimited(stream);
  return utf8.decode(bytes);
}

/// Encodes an integer as a varint
Uint8List encodeVarint(int value) {
  if (value < 0) {
    throw ArgumentError('Cannot encode negative value');
  }

  final bytes = <int>[];
  do {
    int b = value & 0x7F;
    value >>= 7;
    if (value != 0) {
      b |= 0x80;
    }
    bytes.add(b);
  } while (value != 0);

  return Uint8List.fromList(bytes);
}

/// Decodes a varint to an integer
(int, int) decodeVarint(Uint8List bytes) {
  int result = 0;
  int shift = 0;
  int bytesRead = 0;

  for (final b in bytes) {
    bytesRead++;
    result |= (b & 0x7F) << shift;
    if (b < 0x80) {
      return (result, bytesRead);
    }
    shift += 7;
    if (shift > 63) {
      throw FormatException('Varint too long');
    }
  }

  throw FormatException('Unexpected end of varint');
}
