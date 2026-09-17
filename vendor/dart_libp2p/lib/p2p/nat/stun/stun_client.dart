import 'dart:io';
import 'dart:async';
import 'dart:typed_data';
import 'stun_message.dart';
import '../nat_type.dart';

class StunClient {
  static const defaultStunServer = 'stun.l.google.com';
  static const defaultStunPort = 19302;
  static const defaultTimeout = Duration(seconds: 5);
  static const dnsTimeout = Duration(seconds: 2);
  
  final String serverHost;
  final int stunPort;
  final Duration timeout;
  InternetAddress? _resolvedAddress;
  
  StunClient({
    this.serverHost = defaultStunServer,
    this.stunPort = defaultStunPort,
    Duration? timeout,
  }) : this.timeout = timeout ?? defaultTimeout;
  
  Future<InternetAddress> get stunServer async {
    if (_resolvedAddress != null) return _resolvedAddress!;
    try {
      final addresses = await InternetAddress.lookup(serverHost)
          .timeout(dnsTimeout);
      
      // Find IPv4 address
      final ipv4Address = addresses.firstWhere(
        (addr) => addr.type == InternetAddressType.IPv4,
        orElse: () => throw TimeoutException('No IPv4 address found for STUN server'),
      );
      
      _resolvedAddress = ipv4Address;
      return _resolvedAddress!;
    } catch (e) {
      rethrow;
    }
  }
  
  /// Discovers external IP address and port
  Future<StunResponse> discover() async {
    final socket = await RawDatagramSocket.bind(InternetAddress.anyIPv4, 0);
    
    final completer = Completer<StunResponse>();
    Timer? timeoutTimer;
    
    void cleanup() {
      timeoutTimer?.cancel();
      socket.close();
    }
    
    try {
      final request = StunMessage.createBindingRequest();
      final server = await stunServer;
      
      // Set up timeout for STUN response only
      timeoutTimer = Timer(timeout, () {
        if (!completer.isCompleted) {
          cleanup();
          completer.completeError(
            TimeoutException('STUN request timed out after ${timeout.inSeconds} seconds'));
        }
      });
      
      // Listen for response
      socket.listen(
        (event) {
          if (event == RawSocketEvent.read) {
            final datagram = socket.receive();
            if (datagram == null) return;
            
            final response = StunMessage.decode(datagram.data);
            if (response == null) {
              return;
            }
            
            // Extract mapped address from XOR-MAPPED-ADDRESS or MAPPED-ADDRESS
            final mappedAddress = _extractMappedAddress(response);
            if (mappedAddress != null && !completer.isCompleted) {
              cleanup();
              completer.complete(StunResponse(
                externalAddress: mappedAddress.address,
                externalPort: mappedAddress.port,
                natType: _determineNatType(response),
              ));
            }
          }
        },
        onError: (error) {
          if (!completer.isCompleted) {
            cleanup();
            completer.completeError(error);
          }
        },
        onDone: () {
          if (!completer.isCompleted) {
            cleanup();
            completer.completeError(
              TimeoutException('Socket closed before receiving response'));
          }
        },
      );
      
      // Send request
      final requestData = request.encode();
      final sent = socket.send(requestData, server, stunPort);
      if (sent == 0) {
        throw Exception('Failed to send STUN request');
      }
      
      return await completer.future;
    } catch (e) {
      cleanup();
      rethrow;
    }
  }
  
  ({InternetAddress address, int port})? _extractMappedAddress(StunMessage message) {
    // First try XOR-MAPPED-ADDRESS (RFC 5389)
    final xorMapped = message.attributes[StunAttribute.xorMappedAddress];
    if (xorMapped != null) {
      return _decodeXorMappedAddress(xorMapped, message.transactionId);
    }

    // Fallback to MAPPED-ADDRESS (RFC 3489)
    final mapped = message.attributes[StunAttribute.mappedAddress];
    if (mapped != null) {
      return _decodeMappedAddress(mapped);
    }

    return null;
  }

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

  ({InternetAddress address, int port})? _decodeMappedAddress(Uint8List data) {
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
  
  NatType _determineNatType(StunMessage response) {
    // If we got a response and could extract the mapped address,
    // we need to determine the NAT type
    if (response.type == StunMessageType.bindingResponse) {
      final mappedAddress = _extractMappedAddress(response);
      if (mappedAddress != null) {
        // For now, we'll return fullCone as the default NAT type
        // when we get a successful response. The actual NAT type
        // (symmetric vs. full cone) will be determined by comparing
        // responses from different STUN servers at a higher level.
        return NatType.fullCone;
      }
    }
    return NatType.blocked;
  }
}

class StunResponse {
  final InternetAddress? externalAddress;
  final int? externalPort;
  final NatType natType;
  
  StunResponse({
    this.externalAddress,
    this.externalPort,
    this.natType = NatType.unknown,
  });
} 