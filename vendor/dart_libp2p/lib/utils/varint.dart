import 'dart:typed_data';

/// Encodes a non-negative integer as a varint (unsigned LEB128).
Uint8List encodeVarint(int value) {
  if (value < 0) {
    throw ArgumentError('Value must be non-negative');
  }

  final bytes = <int>[];
  do {
    var byte = value & 0x7F;
    value >>= 7;
    if (value > 0) {
      byte |= 0x80; // Set continuation bit
    }
    bytes.add(byte);
  } while (value > 0);

  return Uint8List.fromList(bytes);
}

/// Decodes a varint from a byte array.
int decodeVarint(Uint8List data) {
  var result = 0;
  var shift = 0;
  var i = 0;

  while (i < data.length) {
    final byte = data[i];
    result |= (byte & 0x7F) << shift;
    if ((byte & 0x80) == 0) {
      return result;
    }
    shift += 7;
    i++;
  }

  throw FormatException('Invalid varint encoding');
} 