import 'dart:async';
import 'dart:math';
import 'dart:typed_data';

import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/p2p/protocol/autonatv2/pb/autonatv2.pb.dart';
import 'package:dart_libp2p/core/host/host.dart';
import 'package:dart_libp2p/core/network/network.dart';
import 'package:dart_libp2p/core/protocol/autonatv2/autonatv2.dart';
import 'package:fixnum/fixnum.dart';
import 'package:logging/logging.dart';

import '../../../core/multiaddr.dart';
import '../../../core/network/context.dart';
import '../../../core/network/rcmgr.dart';
import '../../../core/network/stream.dart';
import '../../../utils/protobuf_utils.dart';

final _log = Logger('autonatv2.client');

/// Errors for the client
class ClientErrors {
  static final noValidPeers = Exception('no valid peers for autonat v2');
  static final dialRefused = Exception('dial refused');
}

/// Client implementation for AutoNAT v2
class AutoNATv2ClientImpl implements AutoNATv2Client {
  final Host host;
  final Uint8List _dialData;
  final MultiAddr Function(MultiAddr) normalizeMultiaddr;

  /// Stream timeout
  static const streamTimeout = Duration(seconds: 15);

  /// Dial-back stream timeout
  static const dialBackStreamTimeout = Duration(seconds: 5);

  /// Maximum message size
  static const maxMsgSize = 8192;

  /// Maximum dial-back message size
  static const dialBackMaxMsgSize = 1024;

  /// Map of nonce to dial-back queue
  final Map<int, Completer<MultiAddr>> _dialBackQueues = {};

  AutoNATv2ClientImpl(this.host, {MultiAddr Function(MultiAddr)? normalizeMultiaddr})
      : _dialData = Uint8List(4000),
        normalizeMultiaddr = normalizeMultiaddr ?? ((a) => a) {
    // Initialize dial data with random bytes
    final random = Random();
    for (int i = 0; i < _dialData.length; i++) {
      _dialData[i] = random.nextInt(256);
    }
  }

  @override
  void start() {
    host.setStreamHandler(AutoNATv2Protocols.dialBackProtocol, _handleDialBack);
  }

  @override
  void close() {
    host.removeStreamHandler(AutoNATv2Protocols.dialBackProtocol);
  }

  @override
  Future<Result> getReachability(PeerId peerId, List<Request> requests) async {
    // Create a stream to the peer
    final context = Context();
    final protocols = [AutoNATv2Protocols.dialProtocol];
    final stream = await host.newStream(peerId, protocols, context);

    try{
      await stream.scope().setService(AutoNATv2Protocols.serviceName);
    }catch(ex){
      stream.reset();
      throw Exception('Failed to attach stream ${AutoNATv2Protocols.dialProtocol} to service ${AutoNATv2Protocols.serviceName}');
    }

    try {
      await stream.scope().reserveMemory(maxMsgSize, ReservationPriority.always);
      // Reserve memory
    }catch(ex){
      stream.reset();
      throw Exception('Failed to reserve memory for stream ${AutoNATv2Protocols.dialProtocol}');
    }

    // Set deadline
    stream.setDeadline(DateTime.now().add(streamTimeout));

    // Generate a random nonce
    final nonce = Random().nextInt(1 << 32);

    // Create a completer for the dial-back
    final completer = Completer<MultiAddr>();
    _dialBackQueues[nonce] = completer;

    try {
      // Create and send the dial request (varint-length-prefixed)
      final request = _createDialRequest(requests, nonce);
      await writeDelimited(stream, request);

      // Read the response (varint-length-prefixed)
      Message response;
      try {
        response = await readDelimited(stream, Message.fromBuffer);
      } catch (e) {
        stream.reset();
        throw Exception('Dial message read failed: $e');
      }

      // Handle the response
      if (response.hasDialResponse()) {
        // Process the dial response
        return _processDialResponse(response.dialResponse, requests, completer);
      } else if (response.hasDialDataRequest()) {
        // Handle dial data request
        try {
          await _validateAndSendDialData(requests, response, stream);
        } catch (e) {
          stream.reset();
          throw Exception('Invalid dial data request: $e');
        }

        // Read the dial response after sending dial data (varint-length-prefixed)
        try {
          response = await readDelimited(stream, Message.fromBuffer);
        } catch (e) {
          stream.reset();
          throw Exception('Dial response read failed: $e');
        }

        if (!response.hasDialResponse()) {
          stream.reset();
          throw Exception('Invalid response type after dial data');
        }

        // Process the dial response
        return _processDialResponse(response.dialResponse, requests, completer);
      } else {
        stream.reset();
        throw Exception('Invalid message type: ${response.whichMsg()}');
      }
    } finally {
      _dialBackQueues.remove(nonce);
      stream.close();
    }
  }

  /// Create a dial request message
  Message _createDialRequest(List<Request> requests, int nonce) {
    final addrs = requests.map((r) => r.addr.toBytes()).toList();
    return Message()
      ..dialRequest = (DialRequest()
        ..addrs.addAll(addrs)
        ..nonce = Int64(nonce));
  }

  /// Process a dial response
  Future<Result> _processDialResponse(DialResponse response, List<Request> requests, Completer<MultiAddr> completer) async {
    // Handle E_DIAL_REFUSED - this means the server cannot/will not dial the address
    // This typically means the peer is NOT publicly reachable
    if (response.status == DialResponse_ResponseStatus.E_DIAL_REFUSED) {
      // Return a result indicating the peer is not publicly reachable
      // Use the first request address as the address being probed
      return Result(
        addr: requests.isNotEmpty ? requests[0].addr : MultiAddr('/'),
        reachability: Reachability.private, // Dial refused = not publicly reachable
        status: response.status.value, // Convert enum to int
      );
    }
    
    // Check other response statuses
    if (response.status != DialResponse_ResponseStatus.OK) {
      throw Exception('Dial request failed: response status ${response.status}');
    }

    // Check dial status
    if (response.dialStatus == DialStatus.UNUSED) {
      throw Exception('Invalid response: invalid dial status UNUSED');
    }

    // Check address index
    if (response.addrIdx >= requests.length) {
      throw Exception('Invalid response: addr index out of range: ${response.addrIdx} [0-${requests.length})');
    }

    // Wait for dial-back if status is OK
    MultiAddr? dialBackAddr;
    if (response.dialStatus == DialStatus.OK) {
      try {
        dialBackAddr = await completer.future.timeout(dialBackStreamTimeout);
      } catch (e) {
        // Timeout or other error, continue with null dialBackAddr
      }
    }

    // Create the result
    return _createResult(response, requests, dialBackAddr);
  }

  /// Validate and send dial data
  Future<void> _validateAndSendDialData(List<Request> requests, Message message, P2PStream stream) async {
    final dialDataRequest = message.dialDataRequest;
    final idx = dialDataRequest.addrIdx;

    // Check if the address index is valid
    if (idx >= requests.length) {
      throw Exception('Addr index out of range: $idx [0-${requests.length})');
    }

    // Check if the requested data size is too large
    if (dialDataRequest.numBytes > 100000) {
      throw Exception('Requested data too high: ${dialDataRequest.numBytes}');
    }

    // Check if we want to send dial data for this address
    if (!requests[idx].sendDialData) {
      throw Exception('Low priority addr: ${requests[idx].addr} index $idx');
    }

    // Send the dial data
    await _sendDialData(stream, dialDataRequest.numBytes.toInt());
  }

  /// Send dial data (varint-length-prefixed)
  Future<void> _sendDialData(P2PStream stream, int numBytes) async {
    int remain = numBytes;
    while (remain > 0) {
      final dataSize = min(remain, _dialData.length);
      final data = _dialData.sublist(0, dataSize);

      final response = Message()
        ..dialDataResponse = (DialDataResponse()..data = data);

      await writeDelimited(stream, response);
      remain -= dataSize;
    }
  }

  /// Create a result from a dial response
  Result _createResult(DialResponse response, List<Request> requests, MultiAddr? dialBackAddr) {
    final idx = response.addrIdx;
    final addr = requests[idx].addr;

    Reachability reachability;
    switch (response.dialStatus) {
      case DialStatus.OK:
        if (!_areAddrsConsistent(dialBackAddr, addr)) {
          throw Exception('Invalid response: dialBackAddr: $dialBackAddr, respAddr: $addr');
        }
        reachability = Reachability.public;
        break;
      case DialStatus.E_DIAL_ERROR:
        reachability = Reachability.private;
        break;
      case DialStatus.E_DIAL_BACK_ERROR:
        if (_areAddrsConsistent(dialBackAddr, addr)) {
          // We received the dial back but the server claims the dial back errored.
          // As long as we received the correct nonce in dial back it is safe to assume
          // that we are public.
          reachability = Reachability.public;
        } else {
          reachability = Reachability.unknown;
        }
        break;
      default:
        _log.warning('Invalid status code received in response for addr $addr: ${response.dialStatus}');
        throw Exception('Invalid response: invalid status code for addr $addr: ${response.dialStatus}');
    }

    return Result(
      addr: addr,
      reachability: reachability,
      status: response.dialStatus.value,
    );
  }

  /// Handle a dial-back stream
  Future<void> _handleDialBack(P2PStream stream, PeerId peerId) async {
    // Set service name
    try {
      await stream.scope().setService(AutoNATv2Protocols.serviceName);
    }catch (ex){
      _log.fine('Failed to attach stream to service ${AutoNATv2Protocols.serviceName}');
      stream.reset();
      return;
    }

    try {
      await stream.scope().reserveMemory( dialBackMaxMsgSize, ReservationPriority.always);
      // Reserve memory
    }catch (ex){
      _log.fine('Failed to reserve memory for stream ${AutoNATv2Protocols.dialBackProtocol}');
      stream.reset();
      return;
    }

    // Set deadline
    stream.setDeadline(DateTime.now().add(dialBackStreamTimeout));

    // Read the dial-back message (varint-length-prefixed)
    DialBack? dialBack;
    try {
      dialBack = await readDelimited(stream, DialBack.fromBuffer);
    } catch (e) {
      _log.fine('Failed to read dialback msg from ${stream.conn.remoteMultiaddr}: $e');
      stream.reset();
      return;
    }

    final nonce = dialBack.nonce;

    // Find the completer for this nonce
    final completer = _dialBackQueues[nonce];
    if (completer == null) {
      _log.fine('Dialback received with invalid nonce: localAddr: ${stream.conn.localMultiaddr} peer: ${stream.conn.remotePeer} nonce: $nonce');
      stream.reset();
      return;
    }

    // Complete the completer with the local address
    if (!completer.isCompleted) {
      completer.complete(stream.conn.localMultiaddr);
    } else {
      _log.fine('Multiple dialbacks received: localAddr: ${stream.conn.localMultiaddr} peer: ${stream.conn.remotePeer}');
      stream.reset();
      return;
    }

    // Send a response (varint-length-prefixed)
    try {
      final response = DialBackResponse()..status = DialBackResponse_DialBackStatus.OK;
      await writeDelimited(stream, response);
    } catch (e) {
      _log.fine('Failed to write dialback response: $e');
      stream.reset();
    }
  }

  /// Check if two addresses are consistent
  bool _areAddrsConsistent(MultiAddr? connLocalAddr, MultiAddr? dialedAddr) {
    if (connLocalAddr == null || dialedAddr == null) {
      return false;
    }

    final normalizedConnLocalAddr = normalizeMultiaddr(connLocalAddr);
    final normalizedDialedAddr = normalizeMultiaddr(dialedAddr);

    final localProtos = normalizedConnLocalAddr.protocols;
    final externalProtos = normalizedDialedAddr.protocols;

    if (localProtos.length != externalProtos.length) {
      return false;
    }

    for (int i = 0; i < localProtos.length; i++) {
      if (i == 0) {
        // Special handling for the first protocol (IP/DNS)
        final externalCode = externalProtos[i].code;
        final localCode = localProtos[i].code;

        if ((externalCode == 'dns' || externalCode == 'dnsaddr') &&
            (localCode == 'ip4' || localCode == 'ip6')) {
          continue;
        }

        if (externalCode == 'dns4' && localCode == 'ip4') {
          continue;
        }

        if (externalCode == 'dns6' && localCode == 'ip6') {
          continue;
        }

        if (localCode != externalCode) {
          return false;
        }
      } else {
        if (localProtos[i].code != externalProtos[i].code) {
          return false;
        }
      }
    }

    return true;
  }
}
