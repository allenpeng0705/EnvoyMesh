import 'dart:async';
import 'dart:typed_data';
import 'package:protobuf/protobuf.dart' show GeneratedMessage;
import '../core/network/stream.dart'; // Import P2PStream
import './varint.dart';

// Helper to read exact number of bytes from a P2PStream, managing a carry-over buffer.
Future<Uint8List> _readNBytesFromP2PStream(
    P2PStream stream, int n, List<int> carryOverBuffer) async {
  final resultBuilder = BytesBuilder(copy: false);

  // Consume from carryOverBuffer first
  if (carryOverBuffer.isNotEmpty) {
    if (carryOverBuffer.length >= n) {
      resultBuilder.add(carryOverBuffer.sublist(0, n));
      final remaining = carryOverBuffer.sublist(n);
      carryOverBuffer.clear();
      carryOverBuffer.addAll(remaining);
      return resultBuilder.toBytes();
    } else {
      resultBuilder.add(carryOverBuffer); // Add all of it
      carryOverBuffer.clear(); // And clear
    }
  }

  // Read from P2PStream until n bytes are collected
  while (resultBuilder.length < n) {
    final needed = n - resultBuilder.length;
    // Try to read at most 'needed' bytes, but P2PStream.read() might return less or more if not capped.
    // The P2PStream.read([int? maxLength]) signature allows specifying maxLength.
    // Let's use it to avoid over-reading if possible, though the core logic handles carry-over.
    final chunk = await stream.read(needed); 

    if (chunk.isEmpty) {
      if (stream.isClosed) {
        throw StateError(
            'P2PStream closed prematurely while trying to read $n bytes. Got ${resultBuilder.length}');
      } else {
        // Stream not closed but returned empty chunk. This might mean no data currently available.
        // For delimited reading, we expect data or closure.
        // This could be a point of refinement based on specific P2PStream implementation guarantees.
        // For now, let's assume an empty chunk when data is expected is an issue or requires a brief pause.
        // A short delay might help if it's a transient state, but can also hide issues.
        // Consider throwing an error or implementing a timeout mechanism if this becomes problematic.
        // await Future.delayed(Duration(milliseconds: 10)); // Avoid busy-looping on transient empty reads
        // continue; // Retry read
        // For now, let's treat it as an unexpected end of data if we still need bytes.
         throw StateError(
            'P2PStream read returned empty chunk while expecting $needed more bytes. Got ${resultBuilder.length} of $n.');
      }
    }
    
    carryOverBuffer.addAll(chunk); // Add new chunk to carry-over for processing

    // Try to fulfill from carryOverBuffer again
    if (carryOverBuffer.length >= (n - resultBuilder.length)) { // If carryOver now has enough
      final stillNeeded = n - resultBuilder.length;
      resultBuilder.add(carryOverBuffer.sublist(0, stillNeeded));
      final remaining = carryOverBuffer.sublist(stillNeeded);
      carryOverBuffer.clear();
      carryOverBuffer.addAll(remaining);
      // Loop condition (resultBuilder.length < n) will handle breaking
    } else { // Not enough yet, take all of carryOverBuffer
      resultBuilder.add(carryOverBuffer);
      carryOverBuffer.clear();
    }
  }
  return resultBuilder.toBytes();
}

/// Reads a varint length-prefixed message from the P2PStream.
///
/// [stream]: The P2PStream to read from.
/// [builder]: A function that constructs the specific GeneratedMessage type from bytes.
/// Returns a Future of the parsed message.
Future<T> readDelimited<T extends GeneratedMessage>(
    P2PStream stream, T Function(List<int> bytes) builder) async {
  final carryOverBuffer = <int>[]; 

  final varintBytesBuilder = BytesBuilder(copy: false);
  int messageLength = -1;
  int varintByteCount = 0;

  // 1. Read and decode the varint length prefix
  while (true) {
    int byte;
    if (carryOverBuffer.isNotEmpty) {
      byte = carryOverBuffer.removeAt(0);
    } else {
      // Read a new chunk from the P2PStream. Read one byte at a time for varint, or a small chunk.
      // Reading one byte at a time can be inefficient. Let's read a small chunk.
      final chunk = await stream.read(12); // Read up to 12 bytes (max varint is 10, plus a bit)
      if (chunk.isEmpty) {
        if (stream.isClosed) {
          throw StateError('P2PStream closed prematurely while reading varint length.');
        } else {
           throw StateError('P2PStream read returned empty chunk while reading varint length.');
        }
      }
      carryOverBuffer.addAll(chunk);
      if (carryOverBuffer.isEmpty) { 
        throw StateError('P2PStream logic error: carryOverBuffer empty after adding non-empty chunk.');
      }
      byte = carryOverBuffer.removeAt(0);
    }

    varintBytesBuilder.addByte(byte);
    varintByteCount++;

    if ((byte & 0x80) == 0) { // Last byte of varint
      try {
        messageLength = decodeVarint(varintBytesBuilder.toBytes());
      } catch (e) {
        throw FormatException('Invalid varint decoding: $e. Bytes: ${varintBytesBuilder.toBytes()}');
      }
      break;
    }

    if (varintByteCount > 10) { 
      throw FormatException('Varint prefix is too long (max 10 bytes). Read: ${varintBytesBuilder.toBytes()}');
    }
  }

  if (messageLength < 0) {
    throw FormatException('Invalid message length: $messageLength');
  }
  if (messageLength == 0) { // Handle zero-length messages (e.g. empty protobuf message)
    return builder(Uint8List(0));
  }


  // 2. Read the message bytes
  final messageData = await _readNBytesFromP2PStream(stream, messageLength, carryOverBuffer);

  // 3. Parse the message
  return builder(messageData);
}

/// Writes a varint length-prefixed message to the P2PStream.
///
/// [stream]: The P2PStream's sink to write to.
/// [message]: The protobuf message to serialize and send.
Future<void> writeDelimited(P2PStream stream, GeneratedMessage message) async {
  final messageBytes = message.writeToBuffer();
  final lengthBytes = encodeVarint(messageBytes.length);
  
  final fullMessage = BytesBuilder(copy: false);
  fullMessage.add(lengthBytes);
  fullMessage.add(messageBytes);
  
  await stream.write(fullMessage.toBytes());
}
