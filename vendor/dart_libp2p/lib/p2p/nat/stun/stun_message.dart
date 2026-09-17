import 'dart:io';
import 'dart:typed_data';
import 'dart:convert';
import 'dart:math';

/// STUN message types as defined in RFC 5389
class StunMessageType {
  static const bindingRequest = 0x0001;
  static const bindingResponse = 0x0101;
  static const bindingError = 0x0111;
}

/// STUN attributes as defined in RFC 5389 and RFC 5780
class StunAttribute {
  // RFC 5389 attributes
  static const mappedAddress = 0x0001;
  static const xorMappedAddress = 0x0020;
  static const username = 0x0006;
  static const messageIntegrity = 0x0008;
  static const fingerprint = 0x8028;

  // RFC 5780 attributes for NAT behavior discovery
  static const changeRequest = 0x0003;
  static const responseOrigin = 0x802b;
  static const otherAddress = 0x802c;
  static const responsePort = 0x0027;
  static const padding = 0x0026;
  static const software = 0x8022;
}

class StunMessage {
  static const magicCookie = 0x2112A442;
  final int type;
  final List<int> transactionId;
  final Map<int, Uint8List> attributes;

  StunMessage(this.type, this.transactionId, this.attributes);

  /// Creates a binding request message
  static StunMessage createBindingRequest() {
    final transactionId = List<int>.generate(12, (_) => _random.nextInt(256));
    return StunMessage(StunMessageType.bindingRequest, transactionId, {});
  }

  /// Creates a binding request message with CHANGE-REQUEST attribute
  /// 
  /// [changeIP] - Request the server to send the response from a different IP address
  /// [changePort] - Request the server to send the response from a different port
  static StunMessage createBindingRequestWithChangeRequest({
    bool changeIP = false,
    bool changePort = false,
  }) {
    final transactionId = List<int>.generate(12, (_) => _random.nextInt(256));
    final attributes = <int, Uint8List>{};

    // Create CHANGE-REQUEST attribute (4 bytes)
    final changeRequestBytes = Uint8List(4);
    final changeRequestBuffer = ByteData.view(changeRequestBytes.buffer);

    // Set the appropriate bits for change IP (bit 2) and change port (bit 1)
    int flags = 0;
    if (changeIP) flags |= 0x04;
    if (changePort) flags |= 0x02;

    changeRequestBuffer.setUint32(0, flags);
    attributes[StunAttribute.changeRequest] = changeRequestBytes;

    return StunMessage(StunMessageType.bindingRequest, transactionId, attributes);
  }

  /// Creates a binding response message with mapped address
  static StunMessage createBindingResponse(List<int> transactionId, dynamic address, int port) {
    final attributes = <int, Uint8List>{};

    // Create XOR-MAPPED-ADDRESS attribute
    final addressBytes = address.address.split('.').map((e) => int.parse(e)).toList();
    final xorAddressBytes = Uint8List(8);
    final xorBuffer = ByteData.view(xorAddressBytes.buffer);

    // First byte is address family (0x01 for IPv4)
    xorBuffer.setUint8(0, 0x01);
    // Second byte is reserved (0x00)
    xorBuffer.setUint8(1, 0x00);
    // Port number XORed with most significant 16 bits of magic cookie
    xorBuffer.setUint16(2, port ^ (magicCookie >> 16));
    // IPv4 address XORed with magic cookie
    for (var i = 0; i < 4; i++) {
      xorAddressBytes[i + 4] = addressBytes[i] ^ ((magicCookie >> (8 * (3 - i))) & 0xFF);
    }

    attributes[StunAttribute.xorMappedAddress] = xorAddressBytes;

    return StunMessage(StunMessageType.bindingResponse, transactionId, attributes);
  }

  /// Encode the STUN message to bytes
  Uint8List encode() {
    // Calculate message length (excluding header)
    int messageLength = 0;
    attributes.forEach((_, value) => messageLength += value.length + 4); // 4 for type and length

    final buffer = ByteData(20 + messageLength); // 20 bytes header + attributes
    var offset = 0;

    // Write message type
    buffer.setUint16(offset, type);
    offset += 2;

    // Write message length
    buffer.setUint16(offset, messageLength);
    offset += 2;

    // Write magic cookie
    buffer.setUint32(offset, magicCookie);
    offset += 4;

    // Write transaction ID
    for (var i = 0; i < 12; i++) {
      buffer.setUint8(offset + i, transactionId[i]);
    }
    offset += 12;

    // Write attributes
    attributes.forEach((type, value) {
      buffer.setUint16(offset, type);
      offset += 2;
      buffer.setUint16(offset, value.length);
      offset += 2;
      final bytes = buffer.buffer.asUint8List(offset, value.length);
      bytes.setAll(0, value);
      offset += value.length;
      // Add padding if necessary
      if (value.length % 4 != 0) {
        offset += 4 - (value.length % 4);
      }
    });

    return buffer.buffer.asUint8List(0, 20 + messageLength);
  }

  /// Decode a STUN message from bytes
  static StunMessage? decode(Uint8List data) {
    if (data.length < 20) return null;

    final buffer = ByteData.view(data.buffer);
    final type = buffer.getUint16(0);
    final length = buffer.getUint16(2);
    final cookie = buffer.getUint32(4);

    // Verify magic cookie
    if (cookie != magicCookie) return null;

    // Extract transaction ID
    final transactionId = data.sublist(8, 20);

    // Parse attributes
    final attributes = <int, Uint8List>{};
    var offset = 20;

    while (offset < 20 + length) {
      final attrType = buffer.getUint16(offset);
      offset += 2;
      final attrLength = buffer.getUint16(offset);
      offset += 2;

      attributes[attrType] = data.sublist(offset, offset + attrLength);
      offset += attrLength;
      // Skip padding
      if (attrLength % 4 != 0) {
        offset += 4 - (attrLength % 4);
      }
    }

    return StunMessage(type, transactionId, attributes);
  }

  /// Extracts the RESPONSE-ORIGIN attribute from a STUN message
  static ({InternetAddress address, int port})? extractResponseOrigin(StunMessage message) {
    final responseOrigin = message.attributes[StunAttribute.responseOrigin];
    if (responseOrigin != null) {
      return decodeAddress(responseOrigin);
    }
    return null;
  }

  /// Extracts the OTHER-ADDRESS attribute from a STUN message
  static ({InternetAddress address, int port})? extractOtherAddress(StunMessage message) {
    final otherAddress = message.attributes[StunAttribute.otherAddress];
    if (otherAddress != null) {
      return decodeAddress(otherAddress);
    }
    return null;
  }

  /// Decodes an address attribute (MAPPED-ADDRESS, RESPONSE-ORIGIN, OTHER-ADDRESS)
  static ({InternetAddress address, int port})? decodeAddress(Uint8List data) {
    if (data.length < 8) return null;

    final buffer = ByteData.view(data.buffer, data.offsetInBytes);

    // Skip first byte (reserved) and get address family
    final family = buffer.getUint8(1);
    final port = buffer.getUint16(2);

    // Get IP address
    final addressBytes = data.sublist(4, 4 + (family == 1 ? 4 : 16));

    return (
      address: InternetAddress.fromRawAddress(addressBytes),
      port: port,
    );
  }

  static final _random = Random.secure();
}
