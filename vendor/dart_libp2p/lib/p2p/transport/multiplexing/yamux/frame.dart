import 'dart:typed_data';

/// Yamux frame types per hashicorp yamux spec
enum YamuxFrameType {
  /// Used to send data (length = data size, followed by data bytes)
  dataFrame(0x0),
  /// Used to update window sizes (length = window delta, no data payload)
  windowUpdate(0x1),
  /// Used for keepalive (length = opaque ping value, no data payload)
  ping(0x2),
  /// Used to close session (length = error code, no data payload)
  goAway(0x3);

  final int value;
  const YamuxFrameType(this.value);

  /// Whether this frame type carries a data payload after the header.
  /// Only Data frames have a payload; WindowUpdate/Ping/GoAway use
  /// the length field to carry a value.
  bool get hasDataPayload => this == dataFrame;

  static YamuxFrameType fromValue(int value) {
    return YamuxFrameType.values.firstWhere(
      (type) => type.value == value,
      orElse: () => throw FormatException('Invalid frame type: $value'),
    );
  }
}

/// Yamux frame flags
class YamuxFlags {
  static const int syn = 0x1;
  static const int ack = 0x2;
  static const int fin = 0x4;
  static const int rst = 0x8;
}

/// Represents a Yamux frame
class YamuxFrame {
  /// Frame version (must be 0)
  static const int version = 0;

  /// Frame type
  final YamuxFrameType type;

  /// Frame flags
  final int flags;

  /// Stream ID
  final int streamId;

  /// Frame length field. For Data frames this is the data payload size.
  /// For WindowUpdate this is the window delta. For Ping this is the
  /// opaque ping value. For GoAway this is the error code.
  final int length;

  /// Frame data (only present for Data frames)
  final Uint8List data;

  const YamuxFrame({
    required this.type,
    required this.flags,
    required this.streamId,
    required this.length,
    required this.data,
  });

  /// Creates a frame from a complete byte buffer (header + data).
  /// For Data frames, bytes must include header (12) + length bytes of data.
  /// For other frame types, bytes is just the 12-byte header.
  factory YamuxFrame.fromBytes(Uint8List bytes) {
    if (bytes.length < 12) {
      throw FormatException('Frame too short');
    }

    final header = ByteData.view(bytes.buffer, bytes.offsetInBytes, 12);

    final ver = header.getUint8(0);
    if (ver != YamuxFrame.version) {
      throw FormatException('Invalid version: $ver');
    }

    final type = YamuxFrameType.fromValue(header.getUint8(1));
    final flags = header.getUint16(2, Endian.big);
    final streamId = header.getUint32(4, Endian.big);
    final length = header.getUint32(8, Endian.big);

    Uint8List data;
    if (type.hasDataPayload) {
      data = bytes.length > 12 ? bytes.sublist(12) : Uint8List(0);
      if (data.length != length) {
        throw FormatException('Frame data length mismatch: expected $length, got ${data.length}');
      }
    } else {
      data = Uint8List(0);
    }

    return YamuxFrame(
      type: type,
      flags: flags,
      streamId: streamId,
      length: length,
      data: data,
    );
  }

  /// Converts the frame to bytes
  Uint8List toBytes() {
    final dataLen = type.hasDataPayload ? data.length : 0;
    final buffer = ByteData(12 + dataLen);

    buffer.setUint8(0, version);
    buffer.setUint8(1, type.value);
    buffer.setUint16(2, flags, Endian.big);
    buffer.setUint32(4, streamId, Endian.big);
    buffer.setUint32(8, length, Endian.big);

    if (dataLen > 0) {
      buffer.buffer.asUint8List().setRange(12, 12 + dataLen, data);
    }

    return buffer.buffer.asUint8List();
  }

  /// Creates a DATA frame
  static YamuxFrame createData(int streamId, Uint8List data, {bool fin = false}) {
    return YamuxFrame(
      type: YamuxFrameType.dataFrame,
      flags: fin ? YamuxFlags.fin : 0,
      streamId: streamId,
      length: data.length,
      data: data,
    );
  }

  /// Creates a WINDOW_UPDATE frame (delta goes in length field, no data payload)
  static YamuxFrame windowUpdate(int streamId, int delta) {
    return YamuxFrame(
      type: YamuxFrameType.windowUpdate,
      flags: 0,
      streamId: streamId,
      length: delta,
      data: Uint8List(0),
    );
  }

  /// Creates a SYN frame to open a new stream (WindowUpdate with SYN flag)
  static YamuxFrame synStream(int streamId) {
    return YamuxFrame(
      type: YamuxFrameType.windowUpdate,
      flags: YamuxFlags.syn,
      streamId: streamId,
      length: 0,
      data: Uint8List(0),
    );
  }

  /// Creates an ACK frame to accept a new stream (WindowUpdate with ACK flag only).
  /// Per go-yamux: the response to a SYN uses only the ACK flag, not SYN|ACK.
  static YamuxFrame synAckStream(int streamId) {
    return YamuxFrame(
      type: YamuxFrameType.windowUpdate,
      flags: YamuxFlags.ack,
      streamId: streamId,
      length: 0,
      data: Uint8List(0),
    );
  }

  /// Creates a RESET frame (WindowUpdate with RST flag)
  static YamuxFrame reset(int streamId) {
    return YamuxFrame(
      type: YamuxFrameType.windowUpdate,
      flags: YamuxFlags.rst,
      streamId: streamId,
      length: 0,
      data: Uint8List(0),
    );
  }

  /// Creates a PING frame (value goes in length field, no data payload).
  /// Per go-yamux convention: SYN flag for request, ACK flag for response.
  static YamuxFrame ping(bool ack, [int value = 0]) {
    return YamuxFrame(
      type: YamuxFrameType.ping,
      flags: ack ? YamuxFlags.ack : YamuxFlags.syn,
      streamId: 0,
      length: value,
      data: Uint8List(0),
    );
  }

  /// Creates a GO_AWAY frame (reason goes in length field, no data payload)
  static YamuxFrame goAway(int reason) {
    return YamuxFrame(
      type: YamuxFrameType.goAway,
      flags: 0,
      streamId: 0,
      length: reason,
      data: Uint8List(0),
    );
  }
}
