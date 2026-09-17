import 'dart:convert';
import 'dart:typed_data';
import 'protocol.dart';
import 'validator.dart';

/// Handles encoding and decoding of multiaddr values
class MultiAddrCodec {
  /// Encodes a protocol value to bytes
  static Uint8List encodeValue(Protocol protocol, String value) {
    // Validate the value before encoding
    MultiAddrValidator.validateValue(protocol, value);

    switch (protocol.name) {
      case 'ip4':
        return _encodeIP4(value);
      case 'ip6':
        return _encodeIP6(value);
      case 'tcp':
      case 'udp':
        return _encodePort(value);
      case 'unix':
        return _encodePath(value);
      default:
        if (protocol.size == 0) { // Protocol has no value component
          return Uint8List(0);
        }
        if (protocol.isVariableSize) { // Protocol has a variable-length string value
          return _encodeString(value);
        }
        // Protocol has a fixed, non-zero size but is not handled by a specific case
        throw ArgumentError('Unsupported protocol for encoding: ${protocol.name}');
    }
  }

  /// Decodes a protocol value from bytes
  static String decodeValue(Protocol protocol, Uint8List bytes) {
    switch (protocol.name) {
      case 'ip4':
        return _decodeIP4(bytes);
      case 'ip6':
        return _decodeIP6(bytes);
      case 'tcp':
      case 'udp':
        return _decodePort(bytes);
      case 'unix':
        return _decodePath(bytes);
      default:
        if (protocol.size == 0) { // Protocol has no value component
          return '';
        }
        if (protocol.isVariableSize) { // Protocol has a variable-length string value
          return _decodeString(bytes);
        }
        // Protocol has a fixed, non-zero size but is not handled by a specific case
        throw ArgumentError('Unsupported protocol for decoding: ${protocol.name}');
    }
  }

  /// Encodes a varint
  static Uint8List encodeVarint(int value) {
    if (value < 0) throw ArgumentError('Negative varint not allowed');

    final bytes = <int>[];
    while (value >= 0x80) {
      bytes.add((value & 0x7F) | 0x80);
      value >>= 7;
    }
    bytes.add(value & 0x7F);
    return Uint8List.fromList(bytes);
  }

  /// Decodes a varint
  static (int value, int bytesRead) decodeVarint(Uint8List bytes, [int offset = 0]) {
    var value = 0;
    var shift = 0;
    var bytesRead = 0;

    for (var i = offset; i < bytes.length; i++) {
      final byte = bytes[i];
      value |= (byte & 0x7F) << shift;
      bytesRead++;
      if (byte & 0x80 == 0) break;
      shift += 7;
      if (shift > 63) throw FormatException('Varint too long');
    }

    return (value, bytesRead);
  }

  // Protocol-specific encoders
  static Uint8List _encodeIP4(String value) {
    final parts = value.split('.');
    if (parts.length != 4) throw FormatException('Invalid IPv4 address');

    final bytes = Uint8List(4);
    for (var i = 0; i < 4; i++) {
      final part = int.parse(parts[i]);
      if (part < 0 || part > 255) throw FormatException('Invalid IPv4 address');
      bytes[i] = part;
    }
    return bytes;
  }

  static Uint8List _encodeIP6(String value) {
    // Remove zone identifier if present (e.g., %30)
    final cleanValue = value.split('%')[0];

    final bytes = Uint8List(16);

    // Check if address uses compression (::)
    if (cleanValue.contains('::')) {
      return _encodeCompressedIPv6(cleanValue, bytes);
    } else {
      return _encodeUncompressedIPv6(cleanValue, bytes);
    }
  }

  /// Encodes uncompressed IPv6 address (no :: notation)
  static Uint8List _encodeUncompressedIPv6(String value, Uint8List bytes) {
    final parts = value.split(':');

    if (parts.length != 8) {
      throw FormatException('Invalid IPv6 address: must have exactly 8 segments');
    }

    for (var i = 0; i < 8; i++) {
      final segmentValue = int.parse(parts[i], radix: 16);
      bytes[i * 2] = (segmentValue >> 8) & 0xFF;
      bytes[i * 2 + 1] = segmentValue & 0xFF;
    }

    return bytes;
  }

  /// Encodes compressed IPv6 address (with :: notation)
  static Uint8List _encodeCompressedIPv6(String value, Uint8List bytes) {
    // Initialize all bytes to 0 (important for compression)
    bytes.fillRange(0, 16, 0);

    if (value == '::') {
      // All zeros address
      return bytes;
    }

    final parts = value.split('::');
    if (parts.length != 2) {
      throw FormatException('Invalid IPv6 address: malformed :: compression');
    }

    final leftPart = parts[0];
    final rightPart = parts[1];

    // Process left side of ::
    if (leftPart.isNotEmpty) {
      final leftSegments = leftPart.split(':');
      for (var i = 0; i < leftSegments.length; i++) {
        final segmentValue = int.parse(leftSegments[i], radix: 16);
        bytes[i * 2] = (segmentValue >> 8) & 0xFF;
        bytes[i * 2 + 1] = segmentValue & 0xFF;
      }
    }

    // Process right side of ::
    if (rightPart.isNotEmpty) {
      final rightSegments = rightPart.split(':');
      final startIndex = 8 - rightSegments.length; // Start from the end

      for (var i = 0; i < rightSegments.length; i++) {
        final segmentValue = int.parse(rightSegments[i], radix: 16);
        final byteIndex = (startIndex + i) * 2;
        bytes[byteIndex] = (segmentValue >> 8) & 0xFF;
        bytes[byteIndex + 1] = segmentValue & 0xFF;
      }
    }

    return bytes;
  }

// Helper function to convert bytes back to IPv6 string for testing
  static String _bytesToIPv6String(Uint8List bytes) {
    final segments = <String>[];
    for (var i = 0; i < 16; i += 2) {
      final value = (bytes[i] << 8) | bytes[i + 1];
      segments.add(value.toRadixString(16));
    }
    return segments.join(':');
  }

  static Uint8List _encodePort(String value) {
    final port = int.parse(value);
    if (port < 0 || port > 65535) throw FormatException('Invalid port number');
    return Uint8List(2)..buffer.asByteData().setUint16(0, port, Endian.big);
  }

  static Uint8List _encodePath(String value) {
    final bytes = utf8.encode(value);
    return Uint8List.fromList(bytes);
  }

  static Uint8List _encodeString(String value) {
    final bytes = utf8.encode(value);
    final length = encodeVarint(bytes.length);
    return Uint8List.fromList([...length, ...bytes]);
  }

  // Protocol-specific decoders
  static String _decodeIP4(Uint8List bytes) {
    if (bytes.length != 4) throw FormatException('Invalid IPv4 address bytes');
    return bytes.map((b) => b.toString()).join('.');
  }

  static String _decodeIP6(Uint8List bytes) {
    if (bytes.length != 16) {
      throw FormatException('Invalid IPv6 address bytes');
    }

    // Convert bytes to 16-bit groups
    final parts = <String>[];
    for (var i = 0; i < 16; i += 2) {
      final value = (bytes[i] << 8) | bytes[i + 1];
      parts.add(value.toRadixString(16).padLeft(1, '0'));
    }

    // Find longest sequence of zeros for compression
    var longestZeroStart = -1;
    var longestZeroLength = 0;
    var currentZeroStart = -1;
    var currentZeroLength = 0;

    for (var i = 0; i < parts.length; i++) {
      if (parts[i] == '0') {
        if (currentZeroStart == -1) {
          currentZeroStart = i;
        }
        currentZeroLength++;
        if (currentZeroLength > longestZeroLength) {
          longestZeroLength = currentZeroLength;
          longestZeroStart = currentZeroStart;
        }
      } else {
        currentZeroStart = -1;
        currentZeroLength = 0;
      }
    }

    // Apply compression if beneficial (more than one zero)
    if (longestZeroLength > 1) {
      parts.removeRange(longestZeroStart, longestZeroStart + longestZeroLength);
      parts.insert(longestZeroStart, '');
      if (longestZeroStart == 0) {
        parts.insert(0, '');
      }
      if (longestZeroStart + longestZeroLength == 8) {
        parts.add('');
      }
    }

    return parts.join(':');
  }

  static String _decodePort(Uint8List bytes) {
    if (bytes.length != 2) throw FormatException('Invalid port bytes');
    return bytes.buffer.asByteData().getUint16(0, Endian.big).toString();
  }

  static String _decodePath(Uint8List bytes) {
    return utf8.decode(bytes);
  }

  static String _decodeString(Uint8List bytes) {
    final (length, bytesRead) = decodeVarint(bytes);
    final stringBytes = bytes.sublist(bytesRead, bytesRead + length);
    return utf8.decode(stringBytes);
  }
}
