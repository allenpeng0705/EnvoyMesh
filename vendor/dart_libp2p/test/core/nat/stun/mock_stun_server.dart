import 'dart:io';
import 'dart:async';
import 'dart:typed_data';

import 'package:dart_libp2p/p2p/nat/stun/stun_message.dart';

/// A mock STUN server for testing purposes
class MockStunServer {
  late final RawDatagramSocket _socket;
  late final InternetAddress address;
  late final int port;
  InternetAddress? _simulatedAddress;
  int? _simulatedPort;
  InternetAddress? _otherAddress;
  int? _otherPort;

  // Map of destination port to simulated responses
  final Map<int, ({InternetAddress address, int port})> _portSpecificResponses = {};

  // Configuration for CHANGE-REQUEST handling
  final Map<int, ({
    InternetAddress? responseOrigin,
    int? responseOriginPort,
    InternetAddress? mappedAddress,
    int? mappedPort,
  })> _changeRequestResponses = {};

  /// Start a mock STUN server on a random port
  static Future<MockStunServer> start() async {
    final server = MockStunServer();
    await server._init();
    return server;
  }

  Future<void> _init() async {
    _socket = await RawDatagramSocket.bind(InternetAddress.loopbackIPv4, 0);
    address = _socket.address;
    port = _socket.port;

    _socket.listen((RawSocketEvent event) {
      if (event == RawSocketEvent.read) {
        final datagram = _socket.receive();
        if (datagram != null) {
          _handleRequest(datagram);
        }
      }
    });
  }

  /// Simulate a specific mapped address and port in the response
  void simulateResponse({
    required InternetAddress mappedAddress,
    required int mappedPort,
    InternetAddress? otherAddress,
    int? otherPort,
  }) {
    _simulatedAddress = mappedAddress;
    _simulatedPort = mappedPort;
    _otherAddress = otherAddress;
    _otherPort = otherPort;
  }

  /// Simulate a response for a specific destination port
  void simulateResponseForPort(
    int destinationPort, {
    required InternetAddress mappedAddress,
    required int mappedPort,
  }) {
    _portSpecificResponses[destinationPort] = (
      address: mappedAddress,
      port: mappedPort,
    );
  }

  /// Simulate a response to a CHANGE-REQUEST attribute
  void simulateChangeRequest({
    required bool changeIP,
    required bool changePort,
    InternetAddress? responseOrigin,
    int? responseOriginPort,
    InternetAddress? mappedAddress,
    int? mappedPort,
  }) {
    // Create a key based on the CHANGE-REQUEST flags
    int flags = 0;
    if (changeIP) flags |= 0x04;
    if (changePort) flags |= 0x02;

    _changeRequestResponses[flags] = (
      responseOrigin: responseOrigin,
      responseOriginPort: responseOriginPort,
      mappedAddress: mappedAddress,
      mappedPort: mappedPort,
    );
  }

  void _handleRequest(Datagram datagram) {
    final request = StunMessage.decode(datagram.data);
    if (request == null) return;

    // Check if this is a request with CHANGE-REQUEST attribute
    final changeRequest = request.attributes[StunAttribute.changeRequest];
    if (changeRequest != null && changeRequest.length >= 4) {
      _handleChangeRequest(request, datagram, changeRequest);
      return;
    }

    // Check if we have a port-specific response
    final portSpecificResponse = _portSpecificResponses[datagram.port];
    if (portSpecificResponse != null) {
      final response = StunMessage.createBindingResponse(
        request.transactionId,
        portSpecificResponse.address,
        portSpecificResponse.port,
      );

      final responseData = response.encode();
      _socket.send(responseData, datagram.address, datagram.port);
      return;
    }

    // Create a standard response
    final attributes = <int, Uint8List>{};

    // Add XOR-MAPPED-ADDRESS attribute
    final mappedAddress = _simulatedAddress ?? datagram.address;
    final mappedPort = _simulatedPort ?? datagram.port;

    final addressBytes = mappedAddress.address.split('.').map((e) => int.parse(e)).toList();
    final xorAddressBytes = Uint8List(8);
    final xorBuffer = ByteData.view(xorAddressBytes.buffer);

    // First byte is address family (0x01 for IPv4)
    xorBuffer.setUint8(0, 0x01);
    // Second byte is reserved (0x00)
    xorBuffer.setUint8(1, 0x00);
    // Port number XORed with most significant 16 bits of magic cookie
    xorBuffer.setUint16(2, mappedPort ^ (StunMessage.magicCookie >> 16));
    // IPv4 address XORed with magic cookie
    for (var i = 0; i < 4; i++) {
      xorAddressBytes[i + 4] = addressBytes[i] ^ ((StunMessage.magicCookie >> (8 * (3 - i))) & 0xFF);
    }

    attributes[StunAttribute.xorMappedAddress] = xorAddressBytes;

    // Add OTHER-ADDRESS attribute if specified
    if (_otherAddress != null && _otherPort != null) {
      final otherAddressBytes = Uint8List(8);
      final otherBuffer = ByteData.view(otherAddressBytes.buffer);

      final otherIpBytes = _otherAddress!.address.split('.').map((e) => int.parse(e)).toList();

      // First byte is reserved (0x00)
      otherBuffer.setUint8(0, 0x00);
      // Second byte is address family (0x01 for IPv4)
      otherBuffer.setUint8(1, 0x01);
      // Port number
      otherBuffer.setUint16(2, _otherPort!);
      // IPv4 address
      for (var i = 0; i < 4; i++) {
        otherAddressBytes[i + 4] = otherIpBytes[i];
      }

      attributes[StunAttribute.otherAddress] = otherAddressBytes;
    }

    // Create the response with all attributes
    final response = StunMessage(
      StunMessageType.bindingResponse,
      request.transactionId,
      attributes,
    );

    final responseData = response.encode();
    _socket.send(responseData, datagram.address, datagram.port);
  }

  void _handleChangeRequest(StunMessage request, Datagram datagram, Uint8List changeRequestData) {
    if (changeRequestData.length < 4) return;

    final buffer = ByteData.view(changeRequestData.buffer, changeRequestData.offsetInBytes);
    final flags = buffer.getUint32(0);

    // Look up the response configuration for these flags
    final responseConfig = _changeRequestResponses[flags];
    if (responseConfig == null) {
      // No specific configuration, use default behavior
      _handleRequest(datagram);
      return;
    }

    // If responseOrigin is null, don't send a response (simulating filtering)
    if (responseConfig.responseOrigin == null) {
      return;
    }

    // Create a response with the specified mapped address
    final mappedAddress = responseConfig.mappedAddress ?? _simulatedAddress ?? datagram.address;
    final mappedPort = responseConfig.mappedPort ?? _simulatedPort ?? datagram.port;

    final response = StunMessage.createBindingResponse(
      request.transactionId,
      mappedAddress,
      mappedPort,
    );

    // Add RESPONSE-ORIGIN attribute
    final responseOriginBytes = Uint8List(8);
    final originBuffer = ByteData.view(responseOriginBytes.buffer);

    final originIpBytes = responseConfig.responseOrigin!.address.split('.').map((e) => int.parse(e)).toList();

    // First byte is reserved (0x00)
    originBuffer.setUint8(0, 0x00);
    // Second byte is address family (0x01 for IPv4)
    originBuffer.setUint8(1, 0x01);
    // Port number
    originBuffer.setUint16(2, responseConfig.responseOriginPort!);
    // IPv4 address
    for (var i = 0; i < 4; i++) {
      responseOriginBytes[i + 4] = originIpBytes[i];
    }

    // Add the RESPONSE-ORIGIN attribute
    final attributes = Map<int, Uint8List>.from(response.attributes);
    attributes[StunAttribute.responseOrigin] = responseOriginBytes;

    // Create a new response with the added attribute
    final finalResponse = StunMessage(
      StunMessageType.bindingResponse,
      request.transactionId,
      attributes,
    );

    final responseData = finalResponse.encode();
    _socket.send(responseData, datagram.address, datagram.port);
  }

  /// Close the mock server
  void close() {
    _socket.close();
  }
}
