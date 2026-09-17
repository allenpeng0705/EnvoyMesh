/// Implementation of the holepunch service.

import 'dart:async';
import 'dart:typed_data';

import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/p2p/protocol/holepunch/holepunch_service.dart';
import 'package:dart_libp2p/p2p/protocol/holepunch/holepuncher.dart';
import 'package:dart_libp2p/p2p/protocol/holepunch/pb/holepunch.pb.dart';
import 'package:dart_libp2p/p2p/protocol/holepunch/util.dart';
import 'package:dart_libp2p/p2p/protocol/identify/id_service.dart';
import 'package:dart_libp2p/core/host/host.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:logging/logging.dart';
import 'package:synchronized/synchronized.dart';

import '../../../core/network/context.dart';
import '../../../core/network/rcmgr.dart';
import '../../../core/network/stream.dart'; // For P2PStream
import '../../../core/network/common.dart' show Direction; // Import Direction
import '../../../core/peer/addr_info.dart';
import '../../discovery/peer_info.dart';

/// Logger for the holepunch service
final _log = Logger('p2p-holepunch');

/// Options for the holepunch service
class HolePunchOptions {
  /// Tracer for the holepunch service
  final HolePunchTracer? tracer;

  /// Address filter for the holepunch service
  final AddrFilter? filter;

  /// Creates new holepunch options
  const HolePunchOptions({
    this.tracer,
    this.filter,
  });
}


/// Result of an incoming hole punch
class IncomingHolePunchResult {
  final int rtt;
  final List<MultiAddr> remoteAddrs;
  final List<MultiAddr> ownAddrs;

  IncomingHolePunchResult(this.rtt, this.remoteAddrs, this.ownAddrs);
}

/// Implementation of the holepunch service
class HolePunchServiceImpl implements HolePunchService {
  /// The context for the service
  final _ctx = Completer<void>();
  final _ctxCancel = Completer<void>();

  /// The host this service is running on
  final Host _host;

  /// The identify service
  final IDService _ids;

  /// Function to get listen addresses
  final List<MultiAddr> Function() _listenAddrs;

  /// Holepuncher
  HolePuncher? _holePuncher;
  final _holePuncherMutex = Lock();

  /// Channel for when we have public addresses
  final _hasPublicAddrsChan = Completer<void>();

  /// Tracer for the service
  final HolePunchTracer? _tracer;

  /// Address filter
  final AddrFilter? _filter;

  /// Reference count for async operations
  final _refCount = Completer<void>();
  var _refCountValue = 0;
  final _refCountMutex = Lock();

  /// Creates a new holepunch service
  ///
  /// listenAddrs should return public/observed addresses when available.
  /// The service will start immediately and work with available addresses.
  HolePunchServiceImpl(this._host, this._ids, this._listenAddrs, {
    HolePunchOptions? options,
  }) : 
    _tracer = options?.tracer,
    _filter = options?.filter {

    _incrementRefCount();
    // Note: _initializeService() is called asynchronously here and will complete
    // _hasPublicAddrsChan when ready. directConnect() will wait for this.
    _initializeService();
  }

  /// Increments the reference count
  Future<void> _incrementRefCount() async {
    await _refCountMutex.synchronized(() {
      _refCountValue++;
    });
  }

  /// Decrements the reference count
  Future<void> _decrementRefCount() async {
    await _refCountMutex.synchronized(() {
      _refCountValue--;
      if (_refCountValue == 0) {
        _refCount.complete();
      }
    });
  }

  /// Initializes the holepunch service and waits for address discovery.
  /// Unlike the previous implementation, this doesn't wait indefinitely for "public addresses"
  /// that may never come for NAT peers. Instead, it starts immediately and becomes ready
  /// as soon as we have any addresses to work with (including observed addresses from identify).
  Future<void> _initializeService() async {
    _log.fine('Initializing holepunch service for host ${_host.id}');

    // Start the service immediately - don't wait for public addresses
    // Holepunching is specifically designed for peers that DON'T have public addresses!
    _host.setStreamHandler(protocolId, _handleNewStream);

    await _holePuncherMutex.synchronized(() {
      if (_ctxCancel.isCompleted) {
        // Service is closed
        return;
      }
      _holePuncher = HolePuncher(_host, _ids, _listenAddrs, tracer: _tracer, filter: _filter);
    });

    // The service is now ready to accept holepunch requests
    _hasPublicAddrsChan.complete();
    _log.fine('Holepunch service initialized and ready for host ${_host.id}');
    
    // Start monitoring for address changes to improve holepunching as addresses become available
    _startAddressMonitoring();
    
    await _decrementRefCount();
  }
  
  /// Monitors for address changes and logs them for debugging
  void _startAddressMonitoring() {
    // This is a simple monitoring approach - in a production implementation,
    // you might want to listen to specific events from the identify service
    Timer.periodic(Duration(seconds: 10), (timer) {
      if (_ctxCancel.isCompleted) {
        timer.cancel();
        return;
      }
      
      final currentAddrs = _listenAddrs();
      if (currentAddrs.isNotEmpty) {
        _log.fine('Holepunch service for host ${_host.id} has ${currentAddrs.length} addresses available: $currentAddrs');
      } else {
        _log.fine('Holepunch service for host ${_host.id} waiting for addresses to be discovered');
      }
    });
  }

  @override
  Future<void> start() async {
    // Wait for service initialization to complete
    await _hasPublicAddrsChan.future;
  }

  @override
  Future<void> close() async {
    _ctxCancel.complete();

    await _holePuncherMutex.synchronized(() {
      if (_holePuncher != null) {
        return _holePuncher!.close();
      }
    });

    _tracer?.close();
    _host.removeStreamHandler(protocolId);

    await _refCount.future;
    _ctx.complete();
    return _ctx.future;
  }


  /// Handles an incoming hole punch
  Future<IncomingHolePunchResult> _incomingHolePunch(P2PStream str) async {
    // Sanity check: a hole punch request should only come from peers behind a relay
    if (!isRelayAddress(str.conn.remoteMultiaddr)) {
      throw Exception('Received hole punch stream: ${str.conn.remoteMultiaddr}');
    }

    var ownAddrs = _listenAddrs();
    if (_filter != null) {
      ownAddrs = _filter.filterLocal(str.conn.remotePeer, ownAddrs);
    }

    // If we can't tell the peer where to dial us, try to use any available addresses
    if (ownAddrs.isEmpty) {
      _log.warning('No public addresses available for incoming hole punch, trying all available addresses. Peer: ${str.conn.remotePeer}');
      // Try to use any addresses we have - the peer can decide if they're reachable
      ownAddrs = _host.addrs.where((addr) => !isRelayAddress(addr)).toList();
      if (ownAddrs.isEmpty) {
        throw Exception('No addresses available for hole punch response');
      }
    }

    await str.scope().reserveMemory(maxMsgSize, ReservationPriority.always);
    try {
      str.setDeadline(DateTime.now().add(streamTimeout));

      // Read Connect message
      final msgBytes = await str.read();
      final msg = HolePunch.fromBuffer(msgBytes);
      if (msg.type != HolePunch_Type.CONNECT) {
        throw Exception('Expected CONNECT message from initiator but got ${msg.type}');
      }

      var obsDial = removeRelayAddrs(addrsFromBytes(msg.obsAddrs));
      if (_filter != null) {
        obsDial = _filter.filterRemote(str.conn.remotePeer, obsDial);
      }

      _log.fine('Received hole punch request from ${str.conn.remotePeer} with addresses: $obsDial');
      if (obsDial.isEmpty) {
        throw Exception('Expected CONNECT message to contain at least one address');
      }

      // Write CONNECT message
      final response = HolePunch()
        ..type = HolePunch_Type.CONNECT
        ..obsAddrs.addAll(addrsToBytes(ownAddrs));

      final tstart = DateTime.now();
      final responseBytes = response.writeToBuffer();
      await str.write(Uint8List.fromList(responseBytes));

      // Read SYNC message
      final syncMsgBytes = await str.read();
      final syncMsg = HolePunch.fromBuffer(syncMsgBytes);
      if (syncMsg.type != HolePunch_Type.SYNC) {
        throw Exception('Expected SYNC message from initiator but got ${syncMsg.type}');
      }

      return IncomingHolePunchResult(
        DateTime.now().difference(tstart).inMilliseconds,
        obsDial,
        ownAddrs,
      );
    } finally {
      str.scope().releaseMemory(maxMsgSize);
    }
  }

  /// Handles a new stream
  Future<void> _handleNewStream(P2PStream str, PeerId peerId) async {
    // Check directionality of the underlying connection.
    // Peer A receives an inbound connection from peer B.
    // Peer A opens a new hole punch stream to peer B.
    // Peer B receives this stream, calling this function.
    // Peer B sees the underlying connection as an outbound connection.

    if (str.conn.stat.stats.direction == Direction.inbound) {
      await str.reset();
      return;
    }

    try {
      await str.scope().setService(serviceName);
    } catch (err) {
      _log.fine('Error attaching stream to holepunch service: $err');
      await str.reset();
      return;
    }

    final rp = str.conn.remotePeer;
    IncomingHolePunchResult? result;
    try {
      result = await _incomingHolePunch(str);
      await str.close();
    } catch (err) {
      _tracer?.protocolError(rp, err);
      _log.fine('Error handling holepunching stream from ${rp}: $err');
      await str.reset();
      return;
    }

    // Hole punch now by forcing a connect
    final pi = PeerInfo(peerId: rp, addrs: result.remoteAddrs.toSet());
    _tracer?.startHolePunch(rp, result.remoteAddrs, result.rtt);
    _log.fine('Starting hole punch', rp);

    final start = DateTime.now();
    _tracer?.holePunchAttempt(pi.peerId);

    try {
      await _holePunchConnect(pi, false);
      final dt = DateTime.now().difference(start);
      _tracer?.endHolePunch(rp, dt, null);
      _tracer?.holePunchFinished('receiver', 1, result.remoteAddrs, result.ownAddrs, getDirectConnection(_host, rp));
    } catch (err) {
      final dt = DateTime.now().difference(start);
      _tracer?.endHolePunch(rp, dt, err);
    }
  }


  /// Performs a hole punch connection
  Future<void> _holePunchConnect(PeerInfo pi, bool isClient) async {
    final holePunchCtx = Context()
        .withValue('simultaneousConnect', true)
        .withValue('simultaneousConnectIsClient', isClient)
        .withValue('simultaneousConnectReason', 'hole-punching')
        .withValue('forceDirectDial', true)
        .withValue('forceDirectDialReason', 'hole-punching');

    try {
      final addrInfo = AddrInfo(pi.peerId, pi.addrs.toList());
      await _host.connect(addrInfo, context: holePunchCtx);
      _log.fine('Hole punch successful for peer ${pi.peerId}');
    } catch (err) {
      _log.fine('Hole punch attempt with peer ${pi.peerId} failed: $err');
      rethrow;
    }
  }

  @override
  Future<void> directConnect(PeerId peerId) async {
    // Wait for service initialization to complete with a reasonable timeout
    try {
      await _hasPublicAddrsChan.future.timeout(
        Duration(seconds: 10),
        onTimeout: () {
          _log.severe('Holepunch service initialization timed out after 10 seconds for host ${_host.id}');
          throw Exception('Holepunch service initialization timeout - service may not have started properly');
        },
      );
    } catch (e) {
      _log.severe('Failed to wait for holepunch service initialization: $e');
      rethrow;
    }

    final holePuncher = await _holePuncherMutex.synchronized(() => _holePuncher);
    if (holePuncher == null) {
      throw Exception('Holepunch service not initialized - holePuncher is null');
    }

    return holePuncher.directConnect(peerId);
  }
}

/// Extension for the HolePunchTracer
extension HolePunchTracerExt on HolePunchTracer {
  /// Closes the tracer
  void close() {}
}
