import 'dart:async';
import 'dart:typed_data';

import '../../../core/host/host.dart';
import '../../../core/network/context.dart'; // Added import for Context
import '../../../core/network/network.dart';
import '../../../core/network/stream.dart';
import '../../../core/peer/peer_id.dart';
import '../../../core/protocol/autonatv1/autonatv1.dart';
import './pb/autonat.pb.dart' as pb; // Corrected relative path
import '../../../core/peer/addr_info.dart';
import '../../../core/multiaddr.dart';
import '../../../utils/protobuf_utils.dart'; // Import for delimited messaging

// Assuming these constants are defined elsewhere or need to be defined.
// For now, using placeholders.
import './metrics.dart' show MetricsTracer; // Moved import to top
import '../../../core/network/rcmgr.dart' show ReservationPriority; // For stream scoping

const String serviceName = 'libp2p.autonat'; // From Go: s.Scope().SetService(ServiceName)
const int _autoNATClientMaxMessageScopeReservation = 8192; // 8KB for client-side stream scope
const Duration streamTimeout = Duration(seconds: 60); // From Go: streamTimeout


/// Function type for providing addresses.
typedef AddrFunc = List<MultiAddr> Function();

class AutoNATV1ClientImpl implements AutoNATV1Client {
  final Host _host;
  final AddrFunc _addrFunc;
  final MetricsTracer? _metricsTracer;
  final Duration _requestTimeout;

  AutoNATV1ClientImpl(this._host, AddrFunc? addrFunc, this._metricsTracer, this._requestTimeout)
      : _addrFunc = addrFunc ?? (() => _host.addrs);

  @override
  Future<void> dialBack(PeerId peer) async {
    P2PStream? stream;
    try {
      final ctx = Context(); // No timeout in Context to avoid unhandled exceptions
      stream = await _host.newStream(peer, [autoNATV1Proto], ctx).timeout(_requestTimeout); 
      
      await stream.scope().setService(serviceName);
      await stream.scope().reserveMemory(_autoNATClientMaxMessageScopeReservation, ReservationPriority.always);

      // Determine the effective deadline: earlier of context timeout and stream I/O timeout
      final now = DateTime.now();
      final contextAbsoluteDeadline = now.add(_requestTimeout);
      final streamIoAbsoluteDeadline = now.add(streamTimeout); // streamTimeout is the 60s constant

      final effectiveDeadline = contextAbsoluteDeadline.isBefore(streamIoAbsoluteDeadline)
          ? contextAbsoluteDeadline
          : streamIoAbsoluteDeadline;
      
      await stream.setDeadline(effectiveDeadline);

      final localPeerInfo = AddrInfo(_host.id, _addrFunc()); // Used _host.id
      final req = _newDialMessage(localPeerInfo);

      await writeDelimited(stream, req); // Pass stream directly, and await

      // Read the response using the delimited reader
      final res = await readDelimited(stream, pb.Message.fromBuffer); // Pass stream directly

      if (res.type != pb.Message_MessageType.DIAL_RESPONSE) {
        throw Exception('Unexpected response: ${res.type}');
      }

      final status = res.dialResponse.status;
      _metricsTracer?.receivedDialResponse(status);

      switch (status) {
        case pb.Message_ResponseStatus.OK:
          return;
        default:
          throw AutoNATError(status, res.dialResponse.statusText);
      }
    } catch (e) {
      // In Go, s.Reset() is called in several error paths.
      // In Dart, closing the stream or letting it be garbage collected is typical.
      // If specific reset logic is needed, it would be part of P2PStream.
      rethrow;
    } finally {
      if (stream != null) {
        stream.scope().releaseMemory(_autoNATClientMaxMessageScopeReservation);
        await stream.close();
      }
    }
  }

  pb.Message _newDialMessage(AddrInfo pi) {
    final msg = pb.Message();
    msg.type = pb.Message_MessageType.DIAL;
    final dial = pb.Message_Dial();
    final peerInfo = pb.Message_PeerInfo();

    peerInfo.id = pi.id.toBytes(); // Used pi.id
    peerInfo.addrs.addAll(pi.addrs.map((addr) => addr.toBytes()).toList());
    dial.peer = peerInfo;
    msg.dial = dial;
    return msg;
  }
}

/// Error wraps errors signalled by AutoNAT services
class AutoNATError implements Exception {
  final pb.Message_ResponseStatus status;
  final String text;

  AutoNATError(this.status, String? statusText) : text = statusText ?? '';

  @override
  String toString() {
    return 'AutoNAT error: $text (${status.name})';
  }

  /// IsDialError returns true if the error was due to a dial back failure
  bool get isDialError => status == pb.Message_ResponseStatus.E_DIAL_ERROR;

  /// IsDialRefused returns true if the error was due to a refusal to dial back
  bool get isDialRefused => status == pb.Message_ResponseStatus.E_DIAL_REFUSED;
}

/// IsDialError returns true if the AutoNAT peer signalled an error dialing back
bool isDialError(Object e) {
  return e is AutoNATError && e.isDialError;
}

/// IsDialRefused returns true if the AutoNAT peer signalled refusal to dial back
bool isDialRefused(Object e) {
  return e is AutoNATError && e.isDialRefused;
}
