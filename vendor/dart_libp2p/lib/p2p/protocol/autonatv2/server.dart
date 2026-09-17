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

import '../../../core/peer/addr_info.dart';
import '../../../core/multiaddr.dart';
import '../../../core/network/context.dart';
import '../../../core/network/rcmgr.dart';
import '../../../core/network/stream.dart';
import '../../../utils/protobuf_utils.dart';
import 'options.dart';

final _log = Logger('autonatv2.server');

/// Errors for the server
class ServerErrors {
  static final resourceLimitExceeded = Exception('resource limit exceeded');
  static final badRequest = Exception('bad request');
  static final dialDataRefused = Exception('dial data refused');
}

/// Server implementation for AutoNAT v2
class AutoNATv2ServerImpl implements AutoNATv2Server {
  final Host host;
  final Host dialerHost;
  final RateLimiter limiter;
  final DataRequestPolicyFunc dataRequestPolicy;
  final Duration amplificationAttackPreventionDialWait;
  final MetricsTracer? metricsTracer;
  final DateTime Function() now;
  final bool allowPrivateAddrs;

  /// Maximum number of peer addresses to inspect
  static const maxPeerAddresses = 50;

  /// Maximum message size
  static const maxMsgSize = 8192;

  /// Stream timeout
  static const streamTimeout = Duration(seconds: 15);

  /// Dial-back stream timeout
  static const dialBackStreamTimeout = Duration(seconds: 5);

  /// Dial-back dial timeout
  static const dialBackDialTimeout = Duration(seconds: 10);

  /// Maximum dial-back message size
  static const dialBackMaxMsgSize = 1024;

  /// Minimum handshake size in bytes (for amplification attack prevention)
  static const minHandshakeSizeBytes = 30000;

  /// Maximum handshake size in bytes
  static const maxHandshakeSizeBytes = 100000;

  AutoNATv2ServerImpl(this.host, this.dialerHost, AutoNATv2Settings settings)
      : dataRequestPolicy = settings.dataRequestPolicy,
        amplificationAttackPreventionDialWait = settings.amplificationAttackPreventionDialWait,
        allowPrivateAddrs = settings.allowPrivateAddrs,
        now = settings.now,
        metricsTracer = settings.metricsTracer,
        limiter = RateLimiter(
          rpm: settings.serverRPM,
          perPeerRPM: settings.serverPerPeerRPM,
          dialDataRPM: settings.serverDialDataRPM,
          now: settings.now,
        );

  @override
  void start() {
    host.setStreamHandler(AutoNATv2Protocols.dialProtocol, _handleDialRequest);
  }

  @override
  void close() {
    host.removeStreamHandler(AutoNATv2Protocols.dialProtocol);
    limiter.close();
  }

  /// Handle a dial request
  Future<void> _handleDialRequest(P2PStream stream, PeerId peerId) async {
    try {
      _log.fine( 'Received dial-request from: ${stream.conn.remotePeer}, addr: ${stream.conn.remoteMultiaddr}');

      final evt = await _serveDialRequest(stream);

      _log.fine( 'Completed dial-request from ${stream.conn.remotePeer}, response status: ${evt.responseStatus}, dial status: ${evt.dialStatus}, err: ${evt.error}');

      metricsTracer?.completedRequest(evt);
    } catch (e, stackTrace) {
      _log.warning( 'Error handling dial request from ${stream.conn.remotePeer}: $e');
      _log.fine('Stack trace: $stackTrace');

      try {
        stream.reset();
      } catch (_) {
        // Ignore errors resetting stream
      }

      // Report error to metrics
      metricsTracer?.completedRequest(EventDialRequestCompleted(
        error: e is Exception ? e : Exception(e.toString()),
        responseStatus: DialResponse_ResponseStatus.E_INTERNAL_ERROR,
        dialStatus: DialStatus.UNUSED,
        dialDataRequired: false,
      ));
    }
  }

  /// Serve a dial request
  Future<EventDialRequestCompleted> _serveDialRequest(P2PStream stream) async {
    // Set service name
    try {
      await stream.scope().setService(AutoNATv2Protocols.serviceName);
    }catch (ex){
      stream.reset();
      _log.fine('Failed to attach stream to ${AutoNATv2Protocols.serviceName} service');
      return EventDialRequestCompleted(
        error: Exception('Failed to attach stream to autonat-v2'),
        responseStatus: DialResponse_ResponseStatus.E_INTERNAL_ERROR,
        dialStatus: DialStatus.UNUSED,
        dialDataRequired: false,
      );
    }

    try {
      // Reserve memory
      await stream.scope().reserveMemory(maxMsgSize, ReservationPriority.always);
    }catch (ex){
      stream.reset();
      _log.fine('Failed to reserve memory for stream ${AutoNATv2Protocols.dialProtocol}');
      return EventDialRequestCompleted(
        error: ServerErrors.resourceLimitExceeded,
        responseStatus: DialResponse_ResponseStatus.E_INTERNAL_ERROR,
        dialStatus: DialStatus.UNUSED,
        dialDataRequired: false,
      );
    }

    // Set deadline
    final deadline = now().add(streamTimeout);
    stream.setDeadline(deadline);

    final peerId = stream.conn.remotePeer;

    // Check for rate limit before parsing the request
    if (!limiter.accept(peerId)) {
      final response = Message()
        ..dialResponse = (DialResponse()
          ..status = DialResponse_ResponseStatus.E_REQUEST_REJECTED);

      try {
        await writeDelimited(stream, response);
      } catch (e) {
        stream.reset();
        _log.fine('Failed to write request rejected response to $peerId: $e');
        return EventDialRequestCompleted(
          responseStatus: DialResponse_ResponseStatus.E_REQUEST_REJECTED,
          error: Exception('Write failed: $e'),
          dialStatus: DialStatus.UNUSED,
          dialDataRequired: false,
        );
      }

      _log.fine('Rejected request from $peerId: rate limit exceeded');
      return EventDialRequestCompleted(
        responseStatus: DialResponse_ResponseStatus.E_REQUEST_REJECTED,
        dialStatus: DialStatus.UNUSED,
        dialDataRequired: false,
      );
    }

    // Mark request as complete when done
    limiter.completeRequest(peerId);

    // Read the request (varint-length-prefixed)
    Message? message;
    try {
      message = await readDelimited(stream, Message.fromBuffer);
    } catch (e) {
      stream.reset();
      _log.fine('Failed to read request from $peerId: $e');
      return EventDialRequestCompleted(
        error: Exception('Read failed: $e'),
        responseStatus: DialResponse_ResponseStatus.E_INTERNAL_ERROR,
        dialStatus: DialStatus.UNUSED,
        dialDataRequired: false,
      );
    }

    if (message.dialRequest == null) {
      stream.reset();
      _log.fine('Invalid message type from $peerId: expected DialRequest');
      return EventDialRequestCompleted(
        error: ServerErrors.badRequest,
        responseStatus: DialResponse_ResponseStatus.E_INTERNAL_ERROR,
        dialStatus: DialStatus.UNUSED,
        dialDataRequired: false,
      );
    }

    // Parse peer's addresses
    MultiAddr? dialAddr;
    int addrIdx = 0;

    for (int i = 0; i < message.dialRequest.addrs.length && i < maxPeerAddresses; i++) {
      try {
        final addr = MultiAddr.fromBytes(Uint8List.fromList(message.dialRequest.addrs[i]));

        if (!allowPrivateAddrs && !addr.isPublic()) {
          continue;
        }

        if (!dialerHost.network.canDial(peerId, addr)) {
          continue;
        }

        dialAddr = addr;
        addrIdx = i;
        break;
      } catch (e) {
        continue;
      }
    }

    // No dialable address
    if (dialAddr == null) {
      final response = Message()
        ..dialResponse = (DialResponse()
          ..status = DialResponse_ResponseStatus.E_DIAL_REFUSED);

      try {
        await writeDelimited(stream, response);
      } catch (e) {
        stream.reset();
        _log.fine('Failed to write dial refused response to $peerId: $e');
        return EventDialRequestCompleted(
          responseStatus: DialResponse_ResponseStatus.E_DIAL_REFUSED,
          error: Exception('Write failed: $e'),
          dialStatus: DialStatus.UNUSED,
          dialDataRequired: false,
        );
      }

      return EventDialRequestCompleted(
        responseStatus: DialResponse_ResponseStatus.E_DIAL_REFUSED,
        dialStatus: DialStatus.UNUSED,
        dialDataRequired: false,
      );
    }

    final nonce = message.dialRequest.nonce;

    // Check if dial data is required
    final isDialDataRequired = dataRequestPolicy(stream, dialAddr);

    if (isDialDataRequired && !limiter.acceptDialDataRequest(peerId)) {
      final response = Message()
        ..dialResponse = (DialResponse()
          ..status = DialResponse_ResponseStatus.E_REQUEST_REJECTED);

      try {
        await writeDelimited(stream, response);
      } catch (e) {
        stream.reset();
        _log.fine('Failed to write request rejected response to $peerId: $e');
        return EventDialRequestCompleted(
          responseStatus: DialResponse_ResponseStatus.E_REQUEST_REJECTED,
          error: Exception('Write failed: $e'),
          dialStatus: DialStatus.UNUSED,
          dialDataRequired: true,
          dialedAddr: dialAddr,
        );
      }

      _log.fine('Rejected request from $peerId: rate limit exceeded');
      return EventDialRequestCompleted(
        responseStatus: DialResponse_ResponseStatus.E_REQUEST_REJECTED,
        dialStatus: DialStatus.UNUSED,
        dialDataRequired: true,
        dialedAddr: dialAddr,
      );
    }

    // Get dial data if required
    if (isDialDataRequired) {
      try {
        await _getDialData(stream, addrIdx);
      } catch (e) {
        stream.reset();
        _log.fine('$peerId refused dial data request: $e');
        return EventDialRequestCompleted(
          error: ServerErrors.dialDataRefused,
          responseStatus: DialResponse_ResponseStatus.E_INTERNAL_ERROR,
          dialStatus: DialStatus.UNUSED,
          dialDataRequired: true,
          dialedAddr: dialAddr,
        );
      }

      // Wait to prevent thundering herd style attacks
      final waitTime = Duration(milliseconds: Random().nextInt(amplificationAttackPreventionDialWait.inMilliseconds + 1));
      Future.delayed(waitTime);
    }

    // Dial back to the peer
    final dialStatus = await _dialBack(peerId, dialAddr, nonce.toInt());

    final response = Message()
      ..dialResponse = (DialResponse()
        ..status = DialResponse_ResponseStatus.OK
        ..dialStatus = dialStatus
        ..addrIdx = addrIdx);

    try {
      await writeDelimited(stream, response);
    } catch (e) {
      stream.reset();
      _log.fine('Failed to write response to $peerId: $e');
      return EventDialRequestCompleted(
        responseStatus: DialResponse_ResponseStatus.OK,
        dialStatus: dialStatus,
        error: Exception('Write failed: $e'),
        dialDataRequired: isDialDataRequired,
        dialedAddr: dialAddr,
      );
    }

    return EventDialRequestCompleted(
      responseStatus: DialResponse_ResponseStatus.OK,
      dialStatus: dialStatus,
      error: null,
      dialDataRequired: isDialDataRequired,
      dialedAddr: dialAddr,
    );
  }

  /// Get dial data from the client
  Future<void> _getDialData(P2PStream stream, int addrIdx) async {
    final numBytes = minHandshakeSizeBytes + Random().nextInt(maxHandshakeSizeBytes - minHandshakeSizeBytes);

    final request = Message()
      ..dialDataRequest = (DialDataRequest()
        ..addrIdx = addrIdx
        ..numBytes = Int64(numBytes));

    await writeDelimited(stream, request);

    // Read dial data (varint-length-prefixed messages)
    int remain = numBytes;
    while (remain > 0) {
      final msg = await readDelimited(stream, Message.fromBuffer);
      if (!msg.hasDialDataResponse() || msg.dialDataResponse.data.isEmpty) {
        throw Exception('Dial data read failed: invalid or empty message');
      }

      final bytesLen = msg.dialDataResponse.data.length;
      remain -= bytesLen;

      // Check if the peer is sending too little data
      if (bytesLen < 100 && remain > 0) {
        throw Exception('Dial data msg too small: $bytesLen');
      }
    }
  }

  /// Dial back to the peer to verify reachability
  Future<DialStatus> _dialBack(PeerId peerId, MultiAddr addr, int nonce) async {
    // Add the address to the peerstore
    dialerHost.peerStore.addrBook.addAddr(peerId, addr, Duration(minutes: 1));

    try {
      // Connect to the peer
      final addrInfo = AddrInfo(peerId, [addr]);
      await dialerHost.connect(addrInfo);
    } catch (e) {
      _log.fine('Failed to dial $peerId at $addr: $e');
      return DialStatus.E_DIAL_ERROR;
    }

    try {
      // Open a stream for the dial-back
      final context = Context();
      final stream = await dialerHost.newStream(peerId, [AutoNATv2Protocols.dialBackProtocol], context);

      // Set deadline
      stream.setDeadline(now().add(dialBackStreamTimeout));

      // Send the nonce (varint-length-prefixed)
      final dialBack = DialBack()..nonce = Int64(nonce);
      await writeDelimited(stream, dialBack);

      // Close the write side of the stream
      await stream.closeWrite();

      // Read a response to ensure the message was delivered
      try {
        await readDelimited(stream, DialBackResponse.fromBuffer);
      } catch (e) {
        // Ignore read errors, we just want to make sure the message was sent
      }

      return DialStatus.OK;
    } catch (e) {
      _log.fine('Failed to open dial-back stream to $peerId: $e');
      return DialStatus.E_DIAL_BACK_ERROR;
    } finally {
      // Clean up
      dialerHost.network.closePeer(peerId);
      dialerHost.peerStore.addrBook.clearAddrs(peerId);
    }
  }
}

/// Rate limiter for the server
class RateLimiter {
  final int rpm;
  final int perPeerRPM;
  final int dialDataRPM;
  final DateTime Function() now;

  final Map<PeerId, List<DateTime>> _peerReqs = {};
  final List<_Entry> _reqs = [];
  final List<DateTime> _dialDataReqs = [];
  final Set<PeerId> _ongoingReqs = {};
  bool _closed = false;

  RateLimiter({
    required this.rpm,
    required this.perPeerRPM,
    required this.dialDataRPM,
    required this.now,
  });

  /// Accept a new request
  bool accept(PeerId peerId) {
    if (_closed) {
      return false;
    }

    final currentTime = now();
    _cleanup(currentTime);

    if (_ongoingReqs.contains(peerId)) {
      return false;
    }

    if (_reqs.length >= rpm || (_peerReqs[peerId]?.length ?? 0) >= perPeerRPM) {
      return false;
    }

    _ongoingReqs.add(peerId);
    _reqs.add(_Entry(peerId, currentTime));

    if (!_peerReqs.containsKey(peerId)) {
      _peerReqs[peerId] = [];
    }
    _peerReqs[peerId]!.add(currentTime);

    return true;
  }

  /// Accept a dial data request
  bool acceptDialDataRequest(PeerId peerId) {
    if (_closed) {
      return false;
    }

    final currentTime = now();
    _cleanup(currentTime);

    if (_dialDataReqs.length >= dialDataRPM) {
      return false;
    }

    _dialDataReqs.add(currentTime);
    return true;
  }

  /// Clean up stale requests
  void _cleanup(DateTime currentTime) {
    final minute = Duration(minutes: 1);

    // Clean up global requests
    int idx = 0;
    while (idx < _reqs.length && currentTime.difference(_reqs[idx].time) >= minute) {
      final entry = _reqs[idx];

      // Clean up peer requests
      if (_peerReqs.containsKey(entry.peerId)) {
        int peerIdx = 0;
        while (peerIdx < _peerReqs[entry.peerId]!.length && 
               currentTime.difference(_peerReqs[entry.peerId]![peerIdx]) >= minute) {
          peerIdx++;
        }

        if (peerIdx > 0) {
          _peerReqs[entry.peerId] = _peerReqs[entry.peerId]!.sublist(peerIdx);
        }

        if (_peerReqs[entry.peerId]!.isEmpty) {
          _peerReqs.remove(entry.peerId);
        }
      }

      idx++;
    }

    if (idx > 0) {
      _reqs.removeRange(0, idx);
    }

    // Clean up dial data requests
    idx = 0;
    while (idx < _dialDataReqs.length && currentTime.difference(_dialDataReqs[idx]) >= minute) {
      idx++;
    }

    if (idx > 0) {
      _dialDataReqs.removeRange(0, idx);
    }
  }

  /// Mark a request as complete
  void completeRequest(PeerId peerId) {
    _ongoingReqs.remove(peerId);
  }

  /// Close the rate limiter
  void close() {
    _closed = true;
    _peerReqs.clear();
    _ongoingReqs.clear();
    _reqs.clear();
    _dialDataReqs.clear();
  }
}

/// Entry for the rate limiter
class _Entry {
  final PeerId peerId;
  final DateTime time;

  _Entry(this.peerId, this.time);
}

/// Amplification attack prevention policy
bool amplificationAttackPrevention(P2PStream stream, MultiAddr dialAddr) {
  try {
    final connIP = stream.conn.remoteMultiaddr.toIP();
    final dialIP = stream.conn.localMultiaddr.toIP();

    if (connIP == null || dialIP == null) {
      return true;
    }

    return !(connIP == dialIP);
  } catch (e) {
    return true;
  }
}
