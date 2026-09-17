import 'dart:async';
import 'dart:math';
import 'dart:typed_data';

import 'package:dart_libp2p/core/host/host.dart';
import 'package:dart_libp2p/core/network/context.dart';
import 'package:dart_libp2p/core/network/network.dart';
import 'package:dart_libp2p/core/network/conn.dart'; // Import for Conn
import 'package:dart_libp2p/core/network/stream.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart' as core_peer; // Import for concrete PeerId
import 'package:dart_libp2p/core/peerstore.dart';
import 'package:dart_libp2p/core/protocol/autonatv1/autonatv1.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/peer/addr_info.dart';
import './pb/autonat.pb.dart' as pb;
import './client.dart' show MetricsTracer; // Import MetricsTracer
import './options.dart'; // Import AutoNATConfig and DialPolicy
import '../../../p2p/multiaddr/protocol.dart' as mp_protocol; // Import for mp_protocol.Protocol
import '../../../utils/protobuf_utils.dart'; // Import for delimited messaging
import '../../../core/network/rcmgr.dart' show ReservationPriority; // Import ReservationPriority for stream scoping

// Placeholders from client.dart, might need to be centralized
const String serviceName = 'libp2p.autonat';
// const int maxMsgSize = 4 * 1024 * 1024; // Defined in options.dart or specific to usage
const Duration streamTimeout = Duration(seconds: 60);


class AutoNATService {
  final AutoNATConfig _config;
  bool _isEnabled = false;
  StreamSubscription? _backgroundSubscription;
  Timer? _throttleResetTimer;

  // Rate limiter state
  final Map<String, int> _requestsByPeer = {}; // PeerId.toString() -> count
  int _globalRequests = 0;
  final _mutex = Mutex(); // Simple mutex placeholder

  AutoNATService(this._config);

  // Changed signature to match StreamHandler typedef
  Future<void> handleStream(P2PStream stream, PeerId remotePeerIdParam) async { 
    final serviceMaxMsgSize = 4096; // As in Go for service side

    await stream.scope().setService(serviceName);
    await stream.scope().reserveMemory(serviceMaxMsgSize, ReservationPriority.always);

    await stream.setDeadline(DateTime.now().add(streamTimeout));

    try {
      // Use the remotePeerId from the stream connection, as in Go, not the param from handler if it's different.
      final remotePeerId = stream.conn.remotePeer;
      _autonatServiceLog('AutoNATService: New stream from $remotePeerId');

      final req = await readDelimited(stream, pb.Message.fromBuffer);

      if (req.type != pb.Message_MessageType.DIAL) {
        _autonatServiceLog('AutoNATService: Unexpected message from $remotePeerId: ${req.type}');
        await stream.reset(); // Reset before releasing memory if possible
        return;
      }

      final dialResponse = await _handleDial(remotePeerId, stream.conn.remoteMultiaddr, req.dial.peer); // await here
      final resMsg = pb.Message()
        ..type = pb.Message_MessageType.DIAL_RESPONSE
        ..dialResponse = dialResponse;

      await writeDelimited(stream, resMsg);
      _config.metricsTracer?.receivedDialResponse(dialResponse.status); // Assuming similar metric event

    } catch (e) {
      _autonatServiceLog('AutoNATService: Error handling stream: $e');
      await stream.reset(); // Reset before releasing memory if possible
    } finally {
      stream.scope().releaseMemory(serviceMaxMsgSize);
      await stream.close();
    }
  }

  Future<pb.Message_DialResponse> _handleDial(PeerId p, MultiAddr obsAddr, pb.Message_PeerInfo mpi) async { // Made async
    if (!mpi.hasId()) {
      return _newDialResponseError(pb.Message_ResponseStatus.E_BAD_REQUEST, 'missing peer info');
    }

    PeerId msgPeerId; // Revert to PeerId, as PeerId.fromBytes returns PeerId
    try {
      msgPeerId = core_peer.PeerId.fromBytes(Uint8List.fromList(mpi.id)); 
    } catch (e) {
      return _newDialResponseError(pb.Message_ResponseStatus.E_BAD_REQUEST, 'bad peer id');
    }

    if (msgPeerId.toString() != p.toString()) { // Compare string representations
      return _newDialResponseError(pb.Message_ResponseStatus.E_BAD_REQUEST, 'peer id mismatch');
    }

    final List<MultiAddr> addrsToDial = [];
    final Set<String> seenAddrs = {};

    if (_config.dialPolicy.skipDial(obsAddr)) {
      // _config.metricsTracer?.outgoingDialRefused(DialBlockedReason.dialBlocked); // TODO: Define DialBlockedReason
      return _newDialResponseError(pb.Message_ResponseStatus.E_DIAL_REFUSED, 'refusing to dial peer with blocked observed address');
    }
    
    MultiAddr? hostIpComponent;
    String? hostIpComponentValue;
    for (final comp in obsAddr.components) {
      if (comp.$1.name == 'ip4' || comp.$1.name == 'ip6') { // Use .$1 and .$2
        hostIpComponent = MultiAddr('/${comp.$1.name}/${comp.$2}'); // Create a Multiaddr from the component
        hostIpComponentValue = comp.$2;
        break;
      }
    }

    if (hostIpComponent == null || hostIpComponentValue == null) {
        return _newDialResponseError(pb.Message_ResponseStatus.E_INTERNAL_ERROR, 'observed address has no IP component');
    }

    addrsToDial.add(obsAddr);
    seenAddrs.add(obsAddr.toString());

    for (final maddrBytes in mpi.addrs) {
      if (addrsToDial.length >= _config.maxPeerAddresses) break;
      try {
        MultiAddr originalAddr = MultiAddr.fromBytes(Uint8List.fromList(maddrBytes));
        MultiAddr addrToProcess = originalAddr;
        
        bool ipReplaced = false;
        List<(mp_protocol.Protocol, String)> newComponents = []; // Use mp_protocol.Protocol
        bool firstComponent = true;

        for (final comp in originalAddr.components) {
          if (firstComponent && (comp.$1.name == 'ip4' || comp.$1.name == 'ip6')) { // Use .$1 and .$2
            if (comp.$2 != hostIpComponentValue) {
              // Replace with observed IP
              newComponents.add((hostIpComponent.protocols.first, hostIpComponentValue!)); // Added ! for hostIpComponentValue
              ipReplaced = true;
            } else {
              newComponents.add(comp);
            }
          } else {
            newComponents.add(comp);
          }
          firstComponent = false;
        }

        if (ipReplaced) {
          // Reconstruct addr if IP was replaced
          if (newComponents.isNotEmpty) {
            addrToProcess = MultiAddr('/${newComponents.first.$1.name}/${newComponents.first.$2}'); // Use .$1 and .$2
            for (int i = 1; i < newComponents.length; i++) {
              addrToProcess = addrToProcess.encapsulate(newComponents[i].$1.name, newComponents[i].$2); // Use .$1 and .$2
            }
          } else {
            // Should not happen if originalAddr was valid
            continue;
          }
        }


        if (_config.dialPolicy.skipDial(addrToProcess)) {
          continue;
        }

        final addrStr = addrToProcess.toString(); // Use addrToProcess
        if (seenAddrs.contains(addrStr)) {
          continue;
        }

        addrsToDial.add(addrToProcess); // Use addrToProcess
        seenAddrs.add(addrStr);
      } catch (e) {
        _autonatServiceLog('AutoNATService: Error parsing multiaddr: $e');
        continue;
      }
    }

    if (addrsToDial.isEmpty) {
      // _config.metricsTracer?.outgoingDialRefused(DialBlockedReason.noValidAddress); // TODO: Define DialBlockedReason
      return _newDialResponseError(pb.Message_ResponseStatus.E_DIAL_REFUSED, 'no dialable addresses');
    }
    
    return await _doDial(AddrInfo(p, addrsToDial)); // await here
  }

  Future<pb.Message_DialResponse> _doDial(AddrInfo pi) async { // Made async
    bool allowDial = false;
    await _mutex.lock(() async {
      final peerReqCount = _requestsByPeer[pi.id.toString()] ?? 0;
      if (peerReqCount < _config.throttlePeerMax && 
          (_config.throttleGlobalMax <= 0 || _globalRequests < _config.throttleGlobalMax)) {
        _requestsByPeer[pi.id.toString()] = peerReqCount + 1;
        _globalRequests++;
        allowDial = true;
      }
    });

    if (!allowDial) {
      // This path might be hit more frequently now without the lock
      // _config.metricsTracer?.outgoingDialRefused(DialBlockedReason.rateLimited); // TODO: Define DialBlockedReason
      return _newDialResponseError(pb.Message_ResponseStatus.E_DIAL_REFUSED, 'too many dials');
    }

    final dialer = _config.dialer;
    if (dialer == null) {
      _autonatServiceLog('AutoNATService: Dialer not available, cannot perform dial.');
      return _newDialResponseError(pb.Message_ResponseStatus.E_INTERNAL_ERROR, 'dialer not configured');
    }

    final ctx = Context(); // No timeout in Context to avoid unhandled exceptions
    
    // Add addresses to a temporary peerstore for this dial attempt.
    // The original Go code uses a separate dialer which might have its own peerstore.
    // Here, we're using the provided dialer's peerstore.
    // It's important that these addresses are temporary and don't pollute the main peerstore long-term.
    // Using tempAddrTTL is appropriate.
    await dialer.peerstore.addrBook.addAddrs(pi.id, pi.addrs, AddressTTL.tempAddrTTL);

    Conn? conn;
    try {
      _autonatServiceLog('AutoNATService: Attempting to dial ${pi.id} at ${pi.addrs} with timeout ${_config.dialTimeout}');
      conn = await dialer.dialPeer(ctx, pi.id).timeout(_config.dialTimeout);
      // If dialPeer succeeds, we have a connection.
      // The remote multiaddr from the connection is the one that worked.
      _autonatServiceLog('AutoNATService: Successfully dialed ${pi.id} at ${conn.remoteMultiaddr}');
      return _newDialResponseOK(conn.remoteMultiaddr);
    } catch (e) {
      _autonatServiceLog('AutoNATService: Error dialing ${pi.id}: $e');
      // In Go, there's a wait for the context to expire to mask timing information.
      // This can be achieved by ensuring the dial operation itself respects the context's timeout.
      // If dialPeer throws before the timeout, the context might not be fully done.
      // However, if dialPeer itself respects the timeout (e.g., throws TimeoutException),
      // then we don't need an explicit additional wait here.
      // For now, assume dialPeer respects the context timeout.
      return _newDialResponseError(pb.Message_ResponseStatus.E_DIAL_ERROR, 'dial failed: $e');
    } finally {
      // Close the connection if it was established, as it was only for the dial-back test.
      await conn?.close();
      // Clear the temporary addresses we added for this dial attempt.
      // This is important to avoid these (potentially unverified) addresses from sticking around.
      dialer.peerstore.addrBook.clearAddrs(pi.id);
      // The Go code also calls peerstore.RemovePeer(pi.ID()) in some contexts.
      // Clearing addrs might be sufficient if the peerstore handles GC of peers with no addrs/conns.
      // For now, clearing addrs is the direct equivalent of what was done with TempAddrTTL.
    }
  }

  pb.Message_DialResponse _newDialResponseOK(MultiAddr addr) {
    return pb.Message_DialResponse()
      ..status = pb.Message_ResponseStatus.OK
      ..addr = addr.toBytes();
  }

  pb.Message_DialResponse _newDialResponseError(pb.Message_ResponseStatus status, String text) {
    return pb.Message_DialResponse()
      ..status = status
      ..statusText = text;
  }

  Future<void> enable() async {
    await _mutex.lock(() async {
      if (_isEnabled) return;
      _isEnabled = true;
      // Ensure the lambda matches the StreamHandler type
      _config.host.setStreamHandler(autoNATV1Proto, 
        (P2PStream stream, PeerId remotePeerIdParam) async {
          await handleStream(stream, remotePeerIdParam); // Pass both params
      });
      _startBackgroundTasks();
      _autonatServiceLog('AutoNATService enabled.');
    });
  }

  Future<void> disable() async {
    await _mutex.lock(() async {
      if (!_isEnabled) return;
      _isEnabled = false;
      _config.host.removeStreamHandler(autoNATV1Proto);
      _stopBackgroundTasks();
      _autonatServiceLog('AutoNATService disabled.');
    });
  }

  Future<void> close() async {
    disable();
    // In Go, config.dialer.Close() is called. This depends on what dialer is.
    // If it's host.network, then host.close() handles it.
  }

  void _startBackgroundTasks() {
    _throttleResetTimer = Timer.periodic(_config.throttleResetPeriod, (timer) async {
      await _mutex.lock(() async {
        _requestsByPeer.clear();
        _globalRequests = 0;
        _autonatServiceLog('AutoNATService: Throttler reset.');
      });
      // Go code adds jitter.
      // For simplicity, fixed period for now.
      // TODO: Add jitter to timer period if necessary
    });
  }

  void _stopBackgroundTasks() {
    _throttleResetTimer?.cancel();
    _throttleResetTimer = null;
  }
}

// Basic Mutex placeholder for re-entrancy protection
class Mutex {
  Completer<void>? _completer;

  Future<void> lock(Future<void> Function() criticalSection) async { // Changed to Future<void> Function()
    while (_completer != null) {
      await _completer!.future;
    }
    _completer = Completer<void>();
    try {
      await criticalSection();
    } finally {
      if (_completer != null && !_completer!.isCompleted) {
        _completer!.complete();
      }
      _completer = null;
    }
  }
}

// Simple local log function, moved to be a static method of AutoNATService or top-level
// For now, let's make it a static method of AutoNATService for encapsulation.
// It was previously inside Mutex by mistake.
// static void _log(String message) { // This would be if it's part of AutoNATService
// }

// Top-level function for logging, as originally intended before moving to static.
void _autonatServiceLog(String message) { // Renamed function
}
