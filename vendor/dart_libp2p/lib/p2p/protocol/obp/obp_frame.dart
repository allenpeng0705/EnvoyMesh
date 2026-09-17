import 'dart:typed_data';

/// OverNode Binary Protocol (OBP) Frame
/// 
/// Frame structure (16-byte header + payload):
/// ┌─────────────────────────────────────────────────────────────┐
/// │ Magic (4 bytes) │ Version (1) │ Type (1) │ Flags (1) │ Res(1)│
/// ├─────────────────────────────────────────────────────────────┤
/// │                    Length (4 bytes, big-endian)            │
/// ├─────────────────────────────────────────────────────────────┤
/// │                    Stream ID (4 bytes)                     │
/// ├─────────────────────────────────────────────────────────────┤
/// │                    Payload (Length bytes)                  │
/// └─────────────────────────────────────────────────────────────┘
class OBPFrame {
  /// Protocol magic number: "OVND" in ASCII
  static const int MAGIC = 0x4F564E44;
  
  /// Current protocol version
  static const int VERSION = 1;
  
  /// Frame header size in bytes
  static const int HEADER_SIZE = 16;
  
  /// Maximum payload size (10MB)
  static const int MAX_PAYLOAD_SIZE = 10 * 1024 * 1024;
  
  final int version;
  final OBPMessageType type;
  final OBPFlags flags;
  final int streamId;
  final Uint8List payload;
  
  const OBPFrame({
    this.version = VERSION,
    required this.type,
    this.flags = OBPFlags.none,
    required this.streamId,
    required this.payload,
  });
  
  /// Create frame with empty payload
  OBPFrame.empty({
    this.version = VERSION,
    required this.type,
    this.flags = OBPFlags.none,
    required this.streamId,
  }) : payload = Uint8List(0);
  
  /// Get payload length
  int get length => payload.length;
  
  /// Check if frame has specific flag
  bool hasFlag(OBPFlags flag) => (flags.value & flag.value) != 0;
  
  /// Create frame with additional flag
  OBPFrame withFlag(OBPFlags flag) {
    return OBPFrame(
      version: version,
      type: type,
      flags: OBPFlags.fromValue(flags.value | flag.value),
      streamId: streamId,
      payload: payload,
    );
  }
  
  /// Encode frame to bytes
  Uint8List encode() {
    if (payload.length > MAX_PAYLOAD_SIZE) {
      throw ArgumentError('Payload too large: ${payload.length} > $MAX_PAYLOAD_SIZE');
    }
    
    final buffer = ByteData(HEADER_SIZE + payload.length);
    int offset = 0;
    
    // Magic (4 bytes)
    buffer.setUint32(offset, MAGIC, Endian.big);
    offset += 4;
    
    // Version (1 byte)
    buffer.setUint8(offset, version);
    offset += 1;
    
    // Type (1 byte)
    buffer.setUint8(offset, type.value);
    offset += 1;
    
    // Flags (1 byte)
    buffer.setUint8(offset, flags.value);
    offset += 1;
    
    // Reserved (1 byte)
    buffer.setUint8(offset, 0);
    offset += 1;
    
    // Length (4 bytes)
    buffer.setUint32(offset, payload.length, Endian.big);
    offset += 4;
    
    // Stream ID (4 bytes)
    buffer.setUint32(offset, streamId, Endian.big);
    offset += 4;
    
    // Copy payload
    final result = buffer.buffer.asUint8List();
    result.setRange(HEADER_SIZE, HEADER_SIZE + payload.length, payload);
    
    return result;
  }
  
  /// Decode frame from bytes
  static OBPFrame decode(Uint8List data) {
    if (data.length < HEADER_SIZE) {
      throw FormatException('Frame too short: ${data.length} < $HEADER_SIZE');
    }
    
    final buffer = ByteData.sublistView(data);
    int offset = 0;
    
    // Check magic
    final magic = buffer.getUint32(offset, Endian.big);
    if (magic != MAGIC) {
      throw FormatException('Invalid magic: 0x${magic.toRadixString(16)} != 0x${MAGIC.toRadixString(16)}');
    }
    offset += 4;
    
    // Version
    final version = buffer.getUint8(offset);
    if (version != VERSION) {
      throw FormatException('Unsupported version: $version != $VERSION');
    }
    offset += 1;
    
    // Type
    final typeValue = buffer.getUint8(offset);
    final type = OBPMessageType.fromValue(typeValue);
    offset += 1;
    
    // Flags
    final flagsValue = buffer.getUint8(offset);
    final flags = OBPFlags.fromValue(flagsValue);
    offset += 1;
    
    // Reserved (skip)
    offset += 1;
    
    // Length
    final length = buffer.getUint32(offset, Endian.big);
    if (length > MAX_PAYLOAD_SIZE) {
      throw FormatException('Payload too large: $length > $MAX_PAYLOAD_SIZE');
    }
    offset += 4;
    
    // Stream ID
    final streamId = buffer.getUint32(offset, Endian.big);
    offset += 4;
    
    // Check total frame size
    if (data.length < HEADER_SIZE + length) {
      throw FormatException('Incomplete frame: ${data.length} < ${HEADER_SIZE + length}');
    }
    
    // Extract payload
    final payload = data.sublist(HEADER_SIZE, HEADER_SIZE + length);
    
    return OBPFrame(
      version: version,
      type: type,
      flags: flags,
      streamId: streamId,
      payload: payload,
    );
  }
  
  @override
  String toString() {
    return 'OBPFrame(type: $type, flags: $flags, streamId: $streamId, length: $length)';
  }
  
  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! OBPFrame) return false;
    
    return version == other.version &&
           type == other.type &&
           flags == other.flags &&
           streamId == other.streamId &&
           _uint8ListEquals(payload, other.payload);
  }
  
  @override
  int get hashCode {
    return Object.hash(version, type, flags, streamId, payload.length);
  }
  
  static bool _uint8ListEquals(Uint8List a, Uint8List b) {
    if (a.length != b.length) return false;
    for (int i = 0; i < a.length; i++) {
      if (a[i] != b[i]) return false;
    }
    return true;
  }
}

/// OBP Message Types
enum OBPMessageType {
  // Control messages
  handshakeReq(0x01),
  handshakeAck(0x02),
  ping(0x03),
  pong(0x04),
  error(0x05),
  
  // Prekey protocol
  prekeyBroadcastReq(0x10),
  prekeyBroadcastAck(0x11),
  prekeyFetchReq(0x12),
  prekeyFetchResp(0x13),
  
  // CRDT protocol
  crdtSyncReq(0x20),
  crdtSyncResp(0x21),
  crdtPinReq(0x22),
  crdtPinAck(0x23);
  
  const OBPMessageType(this.value);
  
  final int value;
  
  static OBPMessageType fromValue(int value) {
    for (final type in OBPMessageType.values) {
      if (type.value == value) return type;
    }
    throw ArgumentError('Unknown message type: 0x${value.toRadixString(16)}');
  }
  
  @override
  String toString() => 'OBPMessageType.${name}(0x${value.toRadixString(16)})';
}

/// OBP Control Flags
enum OBPFlags {
  none(0x00),
  ackRequired(0x01),  // Sender expects acknowledgment
  fin(0x02),          // Final message in sequence
  err(0x04),          // Error condition
  compressed(0x08);   // Payload is compressed
  
  const OBPFlags(this.value);
  
  final int value;
  
  static OBPFlags fromValue(int value) {
    for (final flag in OBPFlags.values) {
      if (flag.value == value) return flag;
    }
    // For combined flags, return none as fallback
    // In practice, we'll handle combined flags differently
    return OBPFlags.none;
  }
  
  @override
  String toString() {
    if (value == 0) return 'OBPFlags.none';
    
    final flags = <String>[];
    for (final flag in OBPFlags.values) {
      if (flag != OBPFlags.none && (value & flag.value) != 0) {
        flags.add(flag.name);
      }
    }
    
    return flags.isEmpty ? 'OBPFlags(0x${value.toRadixString(16)})' : 'OBPFlags(${flags.join('|')})';
  }
}

/// Helper class for handling combined flags
class OBPFlagsHelper {
  static int combineFlags(List<OBPFlags> flags) {
    int result = 0;
    for (final flag in flags) {
      result |= flag.value;
    }
    return result;
  }
  
  static bool hasFlag(int combinedFlags, OBPFlags flag) {
    return (combinedFlags & flag.value) != 0;
  }
  
  static List<OBPFlags> extractFlags(int combinedFlags) {
    final result = <OBPFlags>[];
    for (final flag in OBPFlags.values) {
      if (flag != OBPFlags.none && hasFlag(combinedFlags, flag)) {
        result.add(flag);
      }
    }
    return result;
  }
}
