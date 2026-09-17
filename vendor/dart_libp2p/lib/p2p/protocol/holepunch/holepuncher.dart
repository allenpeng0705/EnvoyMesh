/// The holepuncher implementation for the holepunch protocol.

import 'dart:async';
import 'dart:typed_data';

import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/p2p/protocol/holepunch/pb/holepunch.pb.dart';
import 'package:dart_libp2p/p2p/protocol/holepunch/util.dart';
import 'package:dart_libp2p/p2p/protocol/identify/id_service.dart';
import 'package:dart_libp2p/core/host/host.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/network/network.dart';
import 'package:dart_libp2p/core/network/stream.dart'; // For P2PStream
import 'package:dart_libp2p/core/network/common.dart' show Direction; // Import Direction
import 'package:logging/logging.dart';
import 'package:synchronized/synchronized.dart';

import '../../../core/network/context.dart';
import '../../../core/network/notifiee.dart';
import '../../../core/network/rcmgr.dart';
import '../../../core/peer/addr_info.dart';
import '../../../core/protocol/protocol.dart';
import '../../discovery/peer_info.dart';

/// Logger for the holepuncher
final _log = Logger('p2p-holepunch');


/// Result of initiating a hole punch
class HolePunchResult {
  final List<MultiAddr> addrs;
  final List<MultiAddr> obsAddrs;
  final int rtt;

  HolePunchResult(this.addrs, this.obsAddrs, this.rtt);
}

/// Error thrown when another hole punching attempt is currently running
class HolePunchActiveError implements Exception {
  @override
  String toString() => 'Another hole punching attempt to this peer is active';
}

/// Error thrown when the holepunch service is closed
class ClosedError implements Exception {
  @override
  String toString() => 'Hole punching service closing';
}

/// Address filter for the holepuncher
abstract class AddrFilter {
  /// Filters local addresses
  List<MultiAddr> filterLocal(PeerId peerId, List<MultiAddr> addrs);

  /// Filters remote addresses
  List<MultiAddr> filterRemote(PeerId peerId, List<MultiAddr> addrs);
}

/// The holepuncher is run on the peer that's behind a NAT / Firewall.
/// It observes new incoming connections via a relay that it has a reservation with,
/// and initiates the DCUtR protocol with them.
/// It then first tries to establish a direct connection, and if that fails, it
/// initiates a hole punch.
class HolePuncher {
  /// The context for the holepuncher
  final _ctx = Completer<void>();

  /// The host this holepuncher is running on
  final Host _host;

  /// The identify service
  final IDService _ids;

  /// Function to get listen addresses
  final List<MultiAddr> Function() _listenAddrs;

  /// Active hole punches for deduplicating
  final _active = <PeerId>{};
  final _activeMutex = Lock();

  /// Whether the holepuncher is closed
  bool _closed = false;
  final _closedMutex = Lock();

  /// Tracer for the holepuncher
  final HolePunchTracer? _tracer;

  /// Address filter
  final AddrFilter? _filter;

  /// Creates a new holepuncher
  HolePuncher(this._host, this._ids, this._listenAddrs, {
    HolePunchTracer? tracer,
    AddrFilter? filter,
  }) : 
    _tracer = tracer,
    _filter = filter {
    _host.network.notify(_NetNotifiee(this));
  }

  /// Begins a direct connect attempt
  Future<void> _beginDirectConnect(PeerId peerId) async {
    await _closedMutex.synchronized(() {
      if (_closed) {
        throw ClosedError();
      }
    });

    await _activeMutex.synchronized(() {
      if (_active.contains(peerId)) {
        throw HolePunchActiveError();
      }
      _active.add(peerId);
    });
  }

  /// Attempts to make a direct connection with a remote peer.
  /// It first attempts a direct dial (if we have a public address of that peer), and then
  /// coordinates a hole punch over the given relay connection.
  Future<void> directConnect(PeerId peerId) async {
    try {
      await _beginDirectConnect(peerId);
      await _directConnect(peerId);
    } finally {
      await _activeMutex.synchronized(() {
        _active.remove(peerId);
      });
    }
  }

  /// Internal implementation of directConnect
  Future<void> _directConnect(PeerId peerId) async {
    // Short-circuit check to see if we already have a direct connection
    if (getDirectConnection(_host, peerId) != null) {
      return;
    }

    // Short-circuit hole punching if a direct dial works.
    // Attempt a direct connection ONLY if we have a public address for the remote peer
    for (final addr in await _host.peerStore.addrBook.addrs(peerId)) {
      if (!isRelayAddress(addr) && addr.isPublic()) {
        final dialCtx = Context().withValue('forceDirectDial', 'hole-punching');

        final tstart = DateTime.now();
        try {
          // This dials *all* addresses, public and private, from the peerstore.
          final addrInfo = AddrInfo(peerId, [addr]);
          await _host.connect(addrInfo, context: dialCtx);

          final dt = DateTime.now().difference(tstart);
          _tracer?.directDialSuccessful(peerId, dt);
          _log.fine('Direct connection to peer successful, no need for a hole punch');
          return;
        } catch (err) {
          final dt = DateTime.now().difference(tstart);
          _tracer?.directDialFailed(peerId, dt, err);
          break;
        }
      }
    }

    _log.fine('Got inbound proxy conn');

    // Hole punch
    for (int i = 1; i <= maxRetries; i++) {
      try {
        final result = await _initiateHolePunch(peerId);
        final addrs = result.addrs;
        final obsAddrs = result.obsAddrs;
        final rtt = result.rtt;

        final synTime = rtt ~/ 2;
        _log.fine('Peer RTT is $rtt; starting hole punch in $synTime');

        // Wait for sync to reach the other peer and then punch a hole for it in our NAT
        // by attempting a connect to it.
        await Future.delayed(Duration(milliseconds: synTime));

        final pi = PeerInfo(peerId: peerId, addrs: addrs.toSet());
        _tracer?.startHolePunch(peerId, addrs, rtt);
        _tracer?.holePunchAttempt(pi.peerId);

        final start = DateTime.now();
        try {
          await _holePunchConnect(pi, true);
          final dt = DateTime.now().difference(start);
          _tracer?.endHolePunch(peerId, dt, null);
          _log.fine('Hole punching successful');
          _tracer?.holePunchFinished('initiator', i, addrs, obsAddrs, getDirectConnection(_host, peerId));
          return;
        } catch (err) {
          final dt = DateTime.now().difference(start);
          _tracer?.endHolePunch(peerId, dt, err);
        }
      } catch (err) {
        _tracer?.protocolError(peerId, err);
        rethrow;
      }

      if (i == maxRetries) {
        _tracer?.holePunchFinished('initiator', maxRetries, [], [], null);
      }
    }

    throw Exception('All retries for hole punch with peer $peerId failed');
  }


  /// Initiates a hole punch with a remote peer
  Future<HolePunchResult> _initiateHolePunch(PeerId peerId) async {
    // Create a context with the appropriate options
    final combinedCtx = Context()
        .withValue('allowLimitedConn', 'hole-punch')
        .withValue('noDial', 'hole-punch');

    // Convert protocolId to a ProtocolID list
    final protocols = [protocolId];

    final str = await _host.newStream(peerId, protocols, combinedCtx);
    try {
      final result = await _initiateHolePunchImpl(str);
      await str.close();
      return result;
    } catch (e) {
      await str.reset();
      throw Exception('Failed to initiateHolePunch: $e');
    }
  }

  /// Internal implementation of initiating a hole punch
  Future<HolePunchResult> _initiateHolePunchImpl(P2PStream str) async {
    await str.scope().setService(serviceName);
    await str.scope().reserveMemory(maxMsgSize, ReservationPriority.always);

    try {
      // Create a delimited reader and writer for protobuf messages
      // Since pbWriter and pbReader are not available, we'll use the stream directly

      str.setDeadline(DateTime.now().add(streamTimeout));

      // Send a CONNECT and start RTT measurement
      var obsAddrs = removeRelayAddrs(_listenAddrs());
      if (_filter != null) {
        obsAddrs = _filter.filterLocal(str.conn.remotePeer, obsAddrs);
      }

      if (obsAddrs.isEmpty) {
        _log.warning('No public addresses available for hole punch initiation, but proceeding anyway. Peer: ${str.conn.remotePeer}');
        // Don't abort - use all available addresses and let the peer decide
        obsAddrs = _listenAddrs();
        if (obsAddrs.isEmpty) {
          throw Exception('No addresses available for hole punch initiation');
        }
      }

      final start = DateTime.now();
      final msg = HolePunch()
        ..type = HolePunch_Type.CONNECT
        ..obsAddrs.addAll(addrsToBytes(obsAddrs));

      // Serialize and write the message
      final msgBytes = msg.writeToBuffer();
      await str.write(Uint8List.fromList(msgBytes));

      // Wait for a CONNECT message from the remote peer
      final responseBytes = await str.read();
      final response = HolePunch.fromBuffer(responseBytes);
      final rtt = DateTime.now().difference(start).inMilliseconds;

      if (response.type != HolePunch_Type.CONNECT) {
        throw Exception('Expected CONNECT message, got ${response.type}');
      }

      var addrs = removeRelayAddrs(addrsFromBytes(response.obsAddrs));
      if (_filter != null) {
        addrs = _filter.filterRemote(str.conn.remotePeer, addrs);
      }

      if (addrs.isEmpty) {
        throw Exception('Didn\'t receive any public addresses in CONNECT');
      }

      final syncMsg = HolePunch()..type = HolePunch_Type.SYNC;
      // Serialize and write the sync message
      final syncMsgBytes = syncMsg.writeToBuffer();
      await str.write(Uint8List.fromList(syncMsgBytes));

      return HolePunchResult(addrs, obsAddrs, rtt);
    } finally {
      str.scope().releaseMemory(maxMsgSize);
    }
  }

  /// Performs a hole punch connection
  Future<void> _holePunchConnect(PeerInfo pi, bool isClient) async {
    // Create a context with the appropriate options

    final combinedCtx = Context()
        .withValue('simultaneousConnect', isClient ? 'client' : 'server')
        .withValue('forceDirectDial', 'hole-punching');

    try {
      // Convert PeerInfo to AddrInfo
      final addrInfo = AddrInfo(pi.peerId, pi.addrs.toList());

      await _host.connect(addrInfo, context: combinedCtx);
      _log.fine('Hole punch successful');
    } catch (err) {
      _log.fine('Hole punch attempt with peer failed: ${err.toString()}');
      rethrow;
    }
  }

  /// Closes the holepuncher
  Future<void> close() async {
    await _closedMutex.synchronized(() {
      _closed = true;
    });

    _ctx.complete();
    return _ctx.future;
  }
}

/// Network notifiee for the holepuncher
class _NetNotifiee implements Notifiee {
  final HolePuncher _hp;

  _NetNotifiee(this._hp);

  @override
  Future<void> connected(Network network, Conn conn, {Duration? dialLatency}) async {
    // Hole punch if it's an inbound proxy connection.
    // If we already have a direct connection with the remote peer, this will be a no-op.
    if (conn.stat.stats.direction == Direction.inbound && isRelayAddress(conn.remoteMultiaddr)) {
      // Waiting for Identify here will allow us to access the peer's public and observed addresses
      // that we can dial to for a hole punch.
      _hp._ids.identifyWait(conn).then((_) {
        _hp.directConnect(conn.remotePeer).catchError((err) {
          _log.fine('Attempt to perform DirectConnect to ${conn.remotePeer} failed: $err');
        });
      }).catchError((_) {
        // Ignore errors from identifyWait
      });
    }
  }

  @override
  Future<void> disconnected(Network network, Conn conn) async {
    return Future.delayed(Duration(milliseconds: 10));
  }

  @override
  void listen(Network network, MultiAddr addr) {}

  @override
  void listenClose(Network network, MultiAddr addr) {}
}

/// Tracer for the holepuncher
abstract class HolePunchTracer {
  /// Called when a direct dial is successful
  void directDialSuccessful(PeerId peerId, Duration dt);

  /// Called when a direct dial fails
  void directDialFailed(PeerId peerId, Duration dt, Object err);

  /// Called when a protocol error occurs
  void protocolError(PeerId peerId, Object err);

  /// Called when a hole punch starts
  void startHolePunch(PeerId peerId, List<MultiAddr> addrs, int rtt);

  /// Called when a hole punch attempt is made
  void holePunchAttempt(PeerId peerId);

  /// Called when a hole punch ends
  void endHolePunch(PeerId peerId, Duration dt, Object? err);

  /// Called when a hole punch finishes
  void holePunchFinished(String side, int attempts, List<MultiAddr> addrs, List<MultiAddr> obsAddrs, Conn? conn);

  /// Closes the tracer
  void close();
}
