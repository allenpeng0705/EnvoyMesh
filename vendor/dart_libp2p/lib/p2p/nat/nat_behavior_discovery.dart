import 'dart:io';
import 'dart:async';
import 'dart:typed_data';
import 'stun/stun_message.dart';
import 'stun/stun_client.dart';
import 'nat_behavior.dart';

/// A class for discovering NAT behavior according to RFC 5780
class NatBehaviorDiscovery {
  /// The STUN client to use for discovery
  final StunClient stunClient;

  /// Creates a new NAT behavior discovery instance
  NatBehaviorDiscovery({
    required this.stunClient,
  });

  /// Discovers the NAT mapping behavior
  /// 
  /// This test requires a STUN server that supports RFC 5780.
  /// It sends multiple binding requests to the same STUN server
  /// but with different CHANGE-REQUEST attributes to test how
  /// the NAT maps internal endpoints to external endpoints.
  Future<NatMappingBehavior> discoverMappingBehavior() async {
    try {
      // First, send a normal binding request to get our mapped address
      final socket1 = await RawDatagramSocket.bind(InternetAddress.anyIPv4, 0);
      final localPort = socket1.port;

      try {
        // Test 1: Get mapped address from primary address
        final response1 = await _sendRequest(socket1, StunMessage.createBindingRequest());
        if (response1 == null) {
          return NatMappingBehavior.unknown;
        }

        final mappedAddress1 = _extractMappedAddress(response1);
        if (mappedAddress1 == null) {
          return NatMappingBehavior.unknown;
        }

        // Get the OTHER-ADDRESS attribute to find the alternate address
        final otherAddress = StunMessage.extractOtherAddress(response1);
        if (otherAddress == null) {
          return NatMappingBehavior.unknown;
        }

        // Test 2: Send to alternate IP address
        final server = await stunClient.stunServer;
        final alternateServer = otherAddress.address;

        // Create a new socket with the same local port
        final socket2 = await RawDatagramSocket.bind(InternetAddress.anyIPv4, socket1.port);
        try {
          final request2 = StunMessage.createBindingRequest();
          final response2 = await _sendRequestToServer(socket2, request2, alternateServer, otherAddress.port);

          if (response2 == null) {
            return NatMappingBehavior.unknown;
          }

          final mappedAddress2 = _extractMappedAddress(response2);
          if (mappedAddress2 == null) {
            return NatMappingBehavior.unknown;
          }

          // Compare the mapped addresses
          if (mappedAddress1.port == mappedAddress2.port) {
            // Same port for different destination IP addresses
            // This is endpoint-independent mapping
            return NatMappingBehavior.endpointIndependent;
          }

          // Test 3: Send to primary IP but different port
          final socket3 = await RawDatagramSocket.bind(InternetAddress.anyIPv4, socket1.port);
          try {
            final request3 = StunMessage.createBindingRequest();
            // Use a different port on the primary server
            final differentPort = stunClient.stunPort + 1;
            final response3 = await _sendRequestToServer(socket3, request3, server, differentPort);

            if (response3 == null) {
              // If we can't get a response from a different port,
              // assume address-dependent mapping
              return NatMappingBehavior.addressDependent;
            }

            final mappedAddress3 = _extractMappedAddress(response3);
            if (mappedAddress3 == null) {
              return NatMappingBehavior.addressDependent;
            }

            // Compare the mapped addresses
            if (mappedAddress1.port == mappedAddress3.port) {
              // Same port for same IP but different port
              // This is address-dependent mapping
              return NatMappingBehavior.addressDependent;
            } else {
              // Different port for different destination port
              // This is address-and-port-dependent mapping
              return NatMappingBehavior.addressAndPortDependent;
            }
          } finally {
            socket3.close();
          }
        } finally {
          socket2.close();
        }
      } finally {
        socket1.close();
      }
    } catch (e) {
      return NatMappingBehavior.unknown;
    }
  }

  /// Discovers the NAT filtering behavior
  /// 
  /// This test requires a STUN server that supports RFC 5780.
  /// It sends binding requests with different CHANGE-REQUEST
  /// attributes to test how the NAT filters incoming packets.
  Future<NatFilteringBehavior> discoverFilteringBehavior() async {
    try {
      // Test 1: Get mapped address from primary address
      RawDatagramSocket socket1 = await RawDatagramSocket.bind(InternetAddress.anyIPv4, 0);
      try {
        final response1 = await _sendRequest(socket1, StunMessage.createBindingRequest());
        if (response1 == null) {
          return NatFilteringBehavior.unknown;
        }

        // Get the OTHER-ADDRESS attribute to find the alternate address
        final otherAddress = StunMessage.extractOtherAddress(response1);
        if (otherAddress == null) {
          return NatFilteringBehavior.unknown;
        }

        // Test 2: Request response from alternate IP (change IP)
        // Create a new socket for the second request
        RawDatagramSocket socket2 = await RawDatagramSocket.bind(InternetAddress.anyIPv4, socket1.port);
        try {
          final request2 = StunMessage.createBindingRequestWithChangeRequest(
            changeIP: true,
            changePort: false,
          );

          final response2 = await _sendRequest(socket2, request2);

          if (response2 != null) {
            // We received a response from the alternate IP
            // This is endpoint-independent filtering
            return NatFilteringBehavior.endpointIndependent;
          }

          // Test 3: Send to alternate IP directly and request response from primary IP
          // Create a new socket for the third request
          RawDatagramSocket socket3 = await RawDatagramSocket.bind(InternetAddress.anyIPv4, socket1.port);
          try {
            final server = await stunClient.stunServer;
            final alternateServer = otherAddress.address;

            final request3 = StunMessage.createBindingRequest();
            final response3 = await _sendRequestToServer(socket3, request3, alternateServer, otherAddress.port);

            if (response3 == null) {
              // We couldn't get a response from the alternate IP
              // Assume address-and-port-dependent filtering
              return NatFilteringBehavior.addressAndPortDependent;
            }

            // Test 4: Now that we've sent to the alternate IP, request a response
            // from the alternate IP but different port
            // Create a new socket for the fourth request
            RawDatagramSocket socket4 = await RawDatagramSocket.bind(InternetAddress.anyIPv4, socket1.port);
            try {
              final request4 = StunMessage.createBindingRequestWithChangeRequest(
                changeIP: false,
                changePort: true,
              );

              final response4 = await _sendRequestToServer(socket4, request4, alternateServer, otherAddress.port);

              if (response4 != null) {
                // We received a response from the alternate IP on a different port
                // This is address-dependent filtering
                return NatFilteringBehavior.addressDependent;
              }

              // If we get here, we couldn't receive from a different port
              // This is address-and-port-dependent filtering
              return NatFilteringBehavior.addressAndPortDependent;
            } finally {
              socket4.close();
            }
          } finally {
            socket3.close();
          }
        } finally {
          socket2.close();
        }
      } finally {
        socket1.close();
      }
    } catch (e) {
      return NatFilteringBehavior.unknown;
    }
  }

  /// Discovers comprehensive NAT behavior
  Future<NatBehavior> discoverBehavior() async {
    // Use basic STUN tests by default
    return discoverBehaviorBasic();
  }

  /// Discovers the NAT mapping behavior using basic STUN tests
  Future<NatMappingBehavior> discoverMappingBehaviorBasic() async {
    try {
      // Test 1: Get mapped address from primary address
      final socket1 = await RawDatagramSocket.bind(InternetAddress.anyIPv4, 0);
      try {
        final response1 = await _sendRequest(socket1, StunMessage.createBindingRequest());
        if (response1 == null) {
          return NatMappingBehavior.unknown;
        }

        final mappedAddress1 = _extractMappedAddress(response1);
        if (mappedAddress1 == null) {
          return NatMappingBehavior.unknown;
        }

        // Test 2: Send to a different STUN server
        final socket2 = await RawDatagramSocket.bind(InternetAddress.anyIPv4, socket1.port);
        try {
          final request2 = StunMessage.createBindingRequest();
          final response2 = await _sendRequestToServer(socket2, request2, await stunClient.stunServer, stunClient.stunPort);

          if (response2 == null) {
            return NatMappingBehavior.unknown;
          }

          final mappedAddress2 = _extractMappedAddress(response2);
          if (mappedAddress2 == null) {
            return NatMappingBehavior.unknown;
          }

          // Compare the mapped addresses
          if (mappedAddress1.port == mappedAddress2.port) {
            return NatMappingBehavior.endpointIndependent;
          } else {
            return NatMappingBehavior.addressDependent;
          }
        } finally {
          socket2.close();
        }
      } finally {
        socket1.close();
      }
    } catch (e) {
      return NatMappingBehavior.unknown;
    }
  }

  /// Discovers the NAT filtering behavior using basic STUN tests
  Future<NatFilteringBehavior> discoverFilteringBehaviorBasic() async {
    try {
      // Test 1: Get mapped address from primary address
      RawDatagramSocket socket1 = await RawDatagramSocket.bind(InternetAddress.anyIPv4, 0);
      try {
        final response1 = await _sendRequest(socket1, StunMessage.createBindingRequest());
        if (response1 == null) {
          return NatFilteringBehavior.unknown;
        }

        // Test 2: Request response from a different STUN server
        RawDatagramSocket socket2 = await RawDatagramSocket.bind(InternetAddress.anyIPv4, socket1.port);
        try {
          final request2 = StunMessage.createBindingRequest();
          final response2 = await _sendRequestToServer(socket2, request2, await stunClient.stunServer, stunClient.stunPort);

          if (response2 != null) {
            return NatFilteringBehavior.endpointIndependent;
          } else {
            return NatFilteringBehavior.addressDependent;
          }
        } finally {
          socket2.close();
        }
      } finally {
        socket1.close();
      }
    } catch (e) {
      return NatFilteringBehavior.unknown;
    }
  }

  /// Discovers comprehensive NAT behavior using basic STUN tests
  Future<NatBehavior> discoverBehaviorBasic() async {
    final mappingBehavior = await discoverMappingBehaviorBasic();
    final filteringBehavior = await discoverFilteringBehaviorBasic();

    return NatBehavior(
      mappingBehavior: mappingBehavior,
      filteringBehavior: filteringBehavior,
    );
  }

  /// Sends a STUN request and waits for a response
  Future<StunMessage?> _sendRequest(RawDatagramSocket socket, StunMessage request) async {
    final server = await stunClient.stunServer;
    return _sendRequestToServer(socket, request, server, stunClient.stunPort);
  }

  /// Sends a STUN request to a specific server and waits for a response
  Future<StunMessage?> _sendRequestToServer(
    RawDatagramSocket socket,
    StunMessage request,
    InternetAddress server,
    int port,
  ) async {
    final completer = Completer<StunMessage?>();
    Timer? timeoutTimer;

    // Set up timeout
    timeoutTimer = Timer(stunClient.timeout, () {
      if (!completer.isCompleted) {
        completer.complete(null);
      }
    });

    // Listen for response
    final subscription = socket.listen((event) {
      if (event == RawSocketEvent.read) {
        final datagram = socket.receive();
        if (datagram == null) return;

        final response = StunMessage.decode(datagram.data);
        if (response == null) return;

        if (!completer.isCompleted) {
          timeoutTimer?.cancel();
          completer.complete(response);
        }
      }
    });

    // Send request
    final requestData = request.encode();
    socket.send(requestData, server, port);

    // Wait for response or timeout
    final response = await completer.future;
    subscription.cancel();

    return response;
  }

  /// Extracts the mapped address from a STUN response
  ({InternetAddress address, int port})? _extractMappedAddress(StunMessage message) {
    // First try XOR-MAPPED-ADDRESS (RFC 5389)
    final xorMapped = message.attributes[StunAttribute.xorMappedAddress];
    if (xorMapped != null) {
      return _decodeXorMappedAddress(xorMapped, message.transactionId);
    }

    // Fallback to MAPPED-ADDRESS (RFC 3489)
    final mapped = message.attributes[StunAttribute.mappedAddress];
    if (mapped != null) {
      return StunMessage.decodeAddress(mapped);
    }

    return null;
  }

  /// Decodes an XOR-MAPPED-ADDRESS attribute
  ({InternetAddress address, int port})? _decodeXorMappedAddress(Uint8List data, List<int> transactionId) {
    if (data.length < 8) return null;

    final buffer = ByteData.view(data.buffer, data.offsetInBytes);

    // First byte is address family (0x01 for IPv4)
    final family = buffer.getUint8(0);
    // Skip second byte (reserved)
    // Get port (XOR with most significant 16 bits of magic cookie)
    final port = buffer.getUint16(2) ^ (StunMessage.magicCookie >> 16);

    // Get IP address (XOR with magic cookie)
    final addressBytes = Uint8List(4); // Always 4 bytes for IPv4
    for (var i = 0; i < 4; i++) {
      addressBytes[i] = data[i + 4] ^ ((StunMessage.magicCookie >> (8 * (3 - i))) & 0xFF);
    }

    return (
      address: InternetAddress.fromRawAddress(addressBytes),
      port: port,
    );
  }
}
