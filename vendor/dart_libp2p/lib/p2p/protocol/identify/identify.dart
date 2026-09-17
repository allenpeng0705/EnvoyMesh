/// Identify service for libp2p.
///
/// This file contains the implementation of the identify service, which is
/// responsible for exchanging peer information with other peers.
///
/// This is a port of the Go implementation from go-libp2p/p2p/protocol/identify/id.go
/// to Dart, using native Dart idioms.

import 'dart:async';
import 'dart:convert';
import 'dart:io'; // Added for IOException
import 'dart:typed_data';

import 'package:dart_libp2p/core/alias.dart';
import 'package:dart_libp2p/core/crypto/keys.dart';
import 'package:dart_libp2p/core/event/bus.dart';
import 'package:dart_libp2p/core/event/identify.dart';
import 'package:dart_libp2p/core/host/host.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/network/context.dart';
import 'package:dart_libp2p/core/network/network.dart';
import 'package:dart_libp2p/core/network/notifiee.dart';
import 'package:dart_libp2p/core/network/stream.dart';
import 'package:dart_libp2p/p2p/peerstore.dart';
import 'package:dart_libp2p/core/protocol/protocol.dart';
import 'package:dart_libp2p/p2p/host/autorelay/autorelay.dart'; // For EvtAutoRelayAddrsUpdated
import 'package:logging/logging.dart';
import 'package:synchronized/synchronized.dart';
import 'package:dart_libp2p/p2p/protocol/multistream/multistream.dart'; // Added import
import 'package:dart_libp2p/p2p/multiaddr/codec.dart' show MultiAddrCodec; // For varint encoding
import 'package:dart_libp2p/p2p/protocol/identify/identify_exceptions.dart';

import 'package:dart_libp2p/core/certified_addr_book.dart';
import 'package:dart_libp2p/core/event/addrs.dart';
import 'package:dart_libp2p/core/event/protocol.dart';
import 'package:dart_libp2p/core/network/common.dart';
import 'package:dart_libp2p/core/network/rcmgr.dart';
import 'package:dart_libp2p/core/peer/record.dart';
import 'package:dart_libp2p/core/record/envelope.dart';
import 'package:dart_libp2p/p2p/multiaddr/protocol.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/p2p/protocol/identify/id_service.dart';
import 'package:dart_libp2p/p2p/protocol/identify/metrics.dart';
import 'package:dart_libp2p/p2p/protocol/identify/nat_emitter.dart';
import 'package:dart_libp2p/p2p/protocol/identify/observed_addr_manager.dart';
import 'package:dart_libp2p/p2p/protocol/identify/options.dart';
import 'package:dart_libp2p/p2p/protocol/identify/pb/identify.pb.dart';
import 'package:dart_libp2p/core/peer/pb/peer_record.pb.dart' as pr;
import 'package:dart_libp2p/core/crypto/pb/crypto.pb.dart' as crypto;
import 'package:dart_libp2p/p2p/protocol/identify/user_agent.dart';

// TTL constants from peerstore.dart
const RecentlyConnectedAddrTTL = AddressTTL.recentlyConnectedAddrTTL;
const ConnectedAddrTTL = AddressTTL.connectedAddrTTL;
const TempAddrTTL = AddressTTL.tempAddrTTL;

// Exception for stream closed
class StreamClosedException implements Exception {
  final String message;
  const StreamClosedException([this.message = 'stream closed']);
  @override
  String toString() => 'StreamClosedException: $message';
}

final _log = Logger('identify');

/// Timeout for all incoming Identify interactions
const timeout = Duration(seconds: 30);

/// Protocol IDs for the identify protocol
const id = '/ipfs/id/1.0.0';
const idPush = '/ipfs/id/push/1.0.0';
const serviceName = 'libp2p.identify';

/// Maximum sizes for identify messages
const legacyIDSize = 2 * 1024;
const signedIDSize = 8 * 1024;
const maxOwnIdentifyMsgSize = 4 * 1024; // smaller than what we accept. This is 4k to be compatible with rust-libp2p
const maxMessages = 10;
const maxPushConcurrency = 32;

/// Number of addresses to keep for peers we have disconnected from for peerstore.RecentlyConnectedTTL time
/// This number can be small as we already filter peer addresses based on whether the peer is connected to us over
/// localhost, private IP or public IP address
const recentlyConnectedPeerMaxAddrs = 20;
const connectedPeerMaxAddrs = 500;


/// A snapshot of the identify information for a peer
class IdentifySnapshot {
  /// Sequence number for this snapshot
  int _seq;

  /// Protocols supported by the peer
  final List<ProtocolID> protocols;

  /// Addresses the peer is listening on
  final List<MultiAddr> addrs;

  /// Signed peer record
  final dynamic record;

  /// Creates a new identify snapshot
  IdentifySnapshot({
    required int seq,
    required this.protocols,
    required this.addrs,
    this.record,
  }) : _seq = seq;

  /// Returns true if this snapshot is equal to another snapshot
  Future<bool> equals(IdentifySnapshot other) async {
    final currentRecord = record is Future ? await record : record;
    final otherRecord = other.record is Future ? await other.record : other.record;

    final hasRecord = currentRecord != null;
    final otherHasRecord = otherRecord != null;

    if (hasRecord != otherHasRecord) {
      return false;
    }

    if (hasRecord) {
      // Assuming Envelope has an 'equals' method or can be compared directly
      // If Envelope.equals is also async, it needs to be awaited.
      // For now, assuming it's synchronous or direct comparison is valid.
      bool recordsAreEqual;
      if (currentRecord is Envelope && otherRecord is Envelope) {
        // If Envelope has a proper 'equals' method:
        // recordsAreEqual = currentRecord.equals(otherRecord); 
        // For now, let's assume direct comparison or a placeholder if no .equals()
        // This might need further refinement based on Envelope's actual API
        // For a simple placeholder, if they are not the same instance, assume not equal
        // A proper deep comparison or hash comparison would be better.
        // Let's assume Envelope has a synchronous .equals() for now.
        // If not, this part needs to be adapted.
        // Based on core/record/envelope.dart, Envelope does not have an equals method.
        // We might need to compare marshalled bytes or specific fields.
        // For now, to fix the immediate Future.equals error, we'll compare marshalled bytes.
        try {
          final currentRecordBytes = await currentRecord.marshal();
          final otherRecordBytes = await otherRecord.marshal();
          if (currentRecordBytes.length != otherRecordBytes.length) {
            recordsAreEqual = false;
          } else {
            recordsAreEqual = true;
            for (int i = 0; i < currentRecordBytes.length; i++) {
              if (currentRecordBytes[i] != otherRecordBytes[i]) {
                recordsAreEqual = false;
                break;
              }
            }
          }
        } catch (e) {
          // If marshalling fails, consider them not equal
          recordsAreEqual = false;
        }
      } else {
        recordsAreEqual = (currentRecord == otherRecord); // Fallback for non-Envelope or if one is null
      }
      if (!recordsAreEqual) {
        return false;
      }
    }

    if (protocols.length != other.protocols.length) {
      return false;
    }

    for (var i = 0; i < protocols.length; i++) {
      if (protocols[i] != other.protocols[i]) {
        return false;
      }
    }

    if (addrs.length != other.addrs.length) {
      return false;
    }

    for (var i = 0; i < addrs.length; i++) {
      if (!addrs[i].equals(other.addrs[i])) {
        return false;
      }
    }

    return true;
  }
}

/// Entry for a connection in the identify service
class Entry {
  /// Completer for the identify wait operation
  Completer<void>? identifyWaitCompleter;

  /// Whether identify has completed successfully for this connection.
  /// When true, subsequent calls to identifyWait will return immediately
  /// without re-running the identify protocol.
  bool identifySucceeded = false;

  /// Push support status for the peer
  IdentifyPushSupport pushSupport = IdentifyPushSupport.unknown;

  /// Sequence number of the last snapshot sent to this peer
  int sequence = 0;
}

/// Implementation of the identify service
class IdentifyService implements IDService {
  /// The host this service is running on
  final Host host;

  /// The user agent to advertise
  final String userAgent;

  /// The protocol version to advertise
  final String protocolVersion;

  /// Metrics tracer
  final MetricsTracer? metricsTracer;

  /// Whether to disable signed peer records
  final bool disableSignedPeerRecord;

  /// Whether to disable the observed address manager
  final bool disableObservedAddrManager;

  /// Setup completed completer
  final _setupCompleted = Completer<void>();

  /// Connections being handled by the identify service
  final _conns = <Conn, Entry>{};
  final _connsMutex = Lock();
  final _currentSnapshotMutex = Lock();


  /// Observed address manager
  ObservedAddrManager? _observedAddrMgr;

  /// NAT emitter
  NATEmitter? _natEmitter;

  /// Event emitters
  late final Emitter _evtPeerProtocolsUpdated;
  late final Emitter _evtPeerIdentificationCompleted;
  late final Emitter _evtPeerIdentificationFailed;

  /// Current snapshot
  IdentifySnapshot _currentSnapshot = IdentifySnapshot(
    seq: 0,
    protocols: [],
    addrs: [],
  );

  /// Whether the service is closed
  bool _closed = false;
  final _closedCompleter = Completer<void>();

  // Resources to be cleaned up on close
  Subscription? _eventBusSubscription; // Changed type here
  StreamController<void>? _triggerPushController;
  
  // PUSH lifecycle coordination
  final _activePushOperations = <Conn, Future<void>>{};
  final _pushOperationsMutex = Lock();
  bool _shutdownInProgress = false;

  /// Creates a new identify service
  IdentifyService(this.host, {
    IdentifyOptions? options,
  }) : 
    userAgent = options?.userAgent ?? defaultUserAgent,
    protocolVersion = options?.protocolVersion ?? '0.0.1',
    metricsTracer = options?.metricsTracer,
    disableSignedPeerRecord = options?.disableSignedPeerRecord ?? false,
    disableObservedAddrManager = options?.disableObservedAddrManager ?? false {

    // Set up observed address manager if enabled
    if (!disableObservedAddrManager) {
      _setupObservedAddrManager();
    }

    // Initialize event emitters in start() method
  }

  void _setupObservedAddrManager() {
    // Create observed address manager
    _observedAddrMgr = ObservedAddrManager(
      listenAddrs: () => host.network.listenAddresses,
      hostAddrs: () => host.addrs,
      interfaceListenAddrs: () async => await host.network.interfaceListenAddresses,
    );

    // Create NAT emitter - use factory method
    NATEmitter.create(host, _observedAddrMgr!, const Duration(minutes: 1))
      .then((emitter) => _natEmitter = emitter);
  }

  @override
  Future<void> start() async {
    // Initialize event emitters
    _evtPeerProtocolsUpdated = await host.eventBus.emitter(EvtPeerProtocolsUpdated);
    _evtPeerIdentificationCompleted = await host.eventBus.emitter(EvtPeerIdentificationCompleted);
    _evtPeerIdentificationFailed = await host.eventBus.emitter(EvtPeerIdentificationFailed);

    // Register as a network notifiee
    host.network.notify(_NetNotifiee(this));

    // Set stream handlers
    host.setStreamHandler(id, handleIdentifyRequest); 
    host.setStreamHandler(idPush, handlePush); 

    // Update snapshot
    _updateSnapshot();

    // Mark setup as completed
    _setupCompleted.complete();

    // Start listening for events
    await _startEventLoop();
  }

  Future<void> _startEventLoop() async {
    _log.fine('IdentifyService._startEventLoop: Starting event loop.');
    // Subscribe to events
    _eventBusSubscription = await host.eventBus.subscribe([
      EvtLocalProtocolsUpdated,
      EvtLocalAddressesUpdated,
      EvtAutoRelayAddrsUpdated,
    ]);

    // Set up a stream controller for pushes
    _triggerPushController = StreamController<void>.broadcast();

    // Listen for events
    _eventBusSubscription!.stream.listen((event) async {
      // Early shutdown check
      if (_shutdownInProgress || _closed) {
        return;
      }

      _log.finer('IdentifyService._startEventLoop: Received event: ${event.runtimeType}');
      final updated = await _updateSnapshot();
      if (!updated) {
        _log.finer('IdentifyService._startEventLoop: Snapshot not updated, not triggering push.');
        return;
      }

      // Double-check shutdown state after snapshot update
      if (_shutdownInProgress || _closed) {
        return;
      }

      if (metricsTracer != null) {
        metricsTracer!.triggeredPushes(event);
      }

      _log.fine('IdentifyService._startEventLoop: Snapshot updated, triggering push.');
      // Trigger a push
      if (_triggerPushController != null && !_triggerPushController!.isClosed) {
        _triggerPushController!.add(null);
      }
    });

    // Listen for push triggers
    _triggerPushController!.stream.listen((_) {
      // Check shutdown state before executing PUSH
      if (_shutdownInProgress || _closed) {
        return;
      }

      _log.fine('IdentifyService._startEventLoop: Push trigger received, calling _sendPushes.');
      _sendPushes();
    });
  }


  Future<bool> _updateSnapshot() async {
    _log.fine('IdentifyService._updateSnapshot: Called. Querying host.addrs. Host: ${host.id.toString()}, Host hashCode: ${host.hashCode}');
    final addrs = host.addrs;
    _log.finer('IdentifyService._updateSnapshot: host.addrs returned: $addrs for host ${host.id.toString()}');
    final protocols = await host.mux.protocols();
    protocols.sort(); // Ensure consistent order for comparison
    addrs.sort((a, b) => _compareBytes(a.toBytes(), b.toBytes()));

    // Calculate used space
    var usedSpace = protocolVersion.length + userAgent.length;
    for (final proto in protocols) {
      usedSpace += proto.toString().length;
    }

    // Trim address list if needed
    final trimmedAddrs = _trimHostAddrList(addrs, maxOwnIdentifyMsgSize - usedSpace - 256); // 256 bytes of buffer

    // Create new snapshot
    dynamic record;
    if (!disableSignedPeerRecord) {
      final cab = host.peerStore.addrBook as CertifiedAddrBook?;
      if (cab != null) {
        record = cab.getPeerRecord(host.id);
      }
    }

    return await _currentSnapshotMutex.synchronized(() async {
      final snapshot = IdentifySnapshot(
        seq: 0, // Temporary seq, will be updated
        protocols: protocols,
        addrs: trimmedAddrs,
        record: record, // This is a Future<Envelope?>
      );

      // Await the comparison since 'equals' is now async
      if (await _currentSnapshot.equals(snapshot)) {
        _log.finer('IdentifyService._updateSnapshot: New snapshot is identical to current one. No update.');
        return false; // Indicate no update was made
      }

      // If different, update the sequence number and the current snapshot
      snapshot._seq = _currentSnapshot._seq + 1; // Increment sequence number
      _currentSnapshot = snapshot;

      _log.fine('IdentifyService._updateSnapshot: Snapshot updated. New seq=${snapshot._seq}, addrs=${snapshot.addrs.length}, protocols=${snapshot.protocols.length}');
      return true;
    });
  }

  int _compareBytes(Uint8List a, Uint8List b) {
    final len = a.length < b.length ? a.length : b.length;
    for (var i = 0; i < len; i++) {
      final diff = a[i] - b[i];
      if (diff != 0) return diff;
    }
    return a.length - b.length;
  }

  List<MultiAddr> _trimHostAddrList(List<MultiAddr> addrs, int maxSize) {
    // Calculate total size
    var totalSize = 0;
    for (final addr in addrs) {
      totalSize += addr.toBytes().length;
    }

    if (totalSize <= maxSize) {
      return addrs;
    }

    // Score function for addresses
    int score(MultiAddr addr) {
      var res = 0;
      if (addr.isPublic()) {
        res |= 1 << 12;
      } else if (!addr.isLoopback()) {
        res |= 1 << 11;
      }

      var protocolWeight = 0;
      for (final proto in addr.protocols) {
        if (proto.code == Protocols.p2p.code) {
          return res;
        } else if (proto.code == Protocols.quicV1.code) {
          protocolWeight = 5;
        } else if (proto.code == Protocols.tcp.code) {
          protocolWeight = 4;
        } else if (proto.code == Protocols.webtransport.code) {
          protocolWeight = 2;
        } else if (proto.name == 'wss') {
          protocolWeight = 3;
        } else if (proto.name == 'webrtc-direct') {
          protocolWeight = 1;
        }
      }

      res |= 1 << protocolWeight;
      return res;
    }

    // Sort addresses by score (descending)
    final sortedAddrs = List<MultiAddr>.from(addrs);
    sortedAddrs.sort((a, b) => score(b) - score(a));

    // Take addresses up to max size
    final result = <MultiAddr>[];
    totalSize = 0;
    for (final addr in sortedAddrs) {
      totalSize += addr.toBytes().length;
      if (totalSize > maxSize) {
        break;
      }
      result.add(addr);
    }

    return result;
  }

  Future<void> _sendPushes() async {
    // Early shutdown check
    if (_shutdownInProgress || _closed) {
      return;
    }

    // Get connections that support push
    final conns = <Conn>[];
    await _connsMutex.synchronized( () async {
      for (final entry in _conns.entries) {
        final conn = entry.key;
        final e = entry.value;

        // Enhanced connection health check
        if (conn.isClosed) {
          continue;
        }

        // Push even if we don't know if push is supported.
        // This will be only the case while the IdentifyWait call is in flight.
        if (e.pushSupport == IdentifyPushSupport.supported ||
            e.pushSupport == IdentifyPushSupport.unknown) {
          conns.add(conn);
        }
      }
    });

    // Limit concurrency
    final sem = Semaphore(maxPushConcurrency);

    // Send pushes with lifecycle coordination
    for (final conn in conns) {
      // Double-check shutdown state before each PUSH
      if (_shutdownInProgress || _closed) {
        break;
      }
      
      // Check if the connection is still alive and valid
      Entry? e;
      await _connsMutex.synchronized( () async {
        e = _conns[conn];
      });

      if (e == null) {
        continue;
      }

      if (conn.isClosed) {
        continue;
      }

      // Check if we already sent the current snapshot to this peer
      final snapshot = await _currentSnapshotMutex.synchronized(() async {
        return _currentSnapshot;
      });

      if (e!.sequence >= snapshot._seq) {
        continue;
      }
      
      // Coordinate PUSH operation lifecycle
      sem.acquire().then((_) async {
        try {
          await _sendPushWithLifecycleCoordination(conn);
        } finally {
          sem.release();
        }
      });
    }
  }

  Future<void> _sendPushWithLifecycleCoordination(Conn conn) async {
    // Register active PUSH operation
    final pushFuture = _sendPush(conn);
    await _pushOperationsMutex.synchronized(() async {
      if (_shutdownInProgress || _closed) {
        return;
      }
      _activePushOperations[conn] = pushFuture;
    });

    try {
      await pushFuture;
    } finally {
      // Unregister PUSH operation
      await _pushOperationsMutex.synchronized(() async {
        _activePushOperations.remove(conn);
      });
    }
  }

  Future<void> _sendPush(Conn conn) async {
    final peerId = conn.remotePeer;
    
    // Enhanced connection health checks
    if (conn.isClosed) {
      return;
    }
    
    // Check if connection is in a healthy state for new streams
    try {
      // Additional health check - verify connection can accept new streams
      final connState = conn.state;
      if (connState.toString().contains('closing') || connState.toString().contains('closed')) {
        return;
      }
    } catch (e) {
      // Proceed cautiously if state check fails
    }
    
    try {
      // Pre-emptive check to avoid triggering session-level errors
      if (conn.isClosed) {
        return;
      }
      
      final stream = await _newStreamAndNegotiate(conn, idPush);
      if (stream == null) {
        return;
      }
      await sendIdentifyResp(stream, true);
    } catch (e, st) {
      // Comprehensive error isolation to prevent session-level cascades
      final errorStr = e.toString();
      
      // Connection/Stream closure errors - expected during cleanup
      if (errorStr.contains('Stream is closed') || 
          errorStr.contains('closed by remote') ||
          errorStr.contains('Session is closed') ||
          errorStr.contains('Connection is closed') ||
          errorStr.contains('Bad state: Stream is closed') ||
          errorStr.contains('Stream closed by remote') ||
          errorStr.contains('No element') ||
          errorStr.contains('Stream YamuxStreamState.reset') ||
          errorStr.contains('Stream YamuxStreamState.closed')) {
        // Completely absorb the error - do not rethrow or propagate
        return;
      }
      
      // Network/Transport errors - also expected during cleanup
      if (errorStr.contains('SocketException') ||
          errorStr.contains('Connection refused') ||
          errorStr.contains('Connection reset') ||
          errorStr.contains('Broken pipe') ||
          errorStr.contains('Network is unreachable')) {
        return;
      }
      
      // Timeout errors - can happen during connection cleanup
      if (errorStr.contains('TimeoutException') ||
          errorStr.contains('timeout') ||
          errorStr.contains('Timeout')) {
        return;
      }
      
      // Only log unexpected errors as warnings, but still don't propagate
      _log.warning('IdentifyService._sendPush: Unexpected error sending PUSH to $peerId (isolated): $e');
      // Note: We still don't rethrow - PUSH is non-critical and should never break other operations
    }
  }

  Future<P2PStream?> _newStreamAndNegotiate(Conn conn, String protoIDString) async {
    final peerId = conn.remotePeer;
    final connAge = DateTime.now().difference(conn.stat.stats.opened);

    P2PStream? stream;
    final streamCreateStart = DateTime.now();

    try {
      _log.fine('[IDENTIFY-DIAG] _newStreamAndNegotiate: BEFORE conn.newStream() peer=$peerId proto=$protoIDString connAge=${connAge.inMilliseconds}ms');
      stream = await conn.newStream(Context());
      final streamCreateDuration = DateTime.now().difference(streamCreateStart);
      _log.fine('[IDENTIFY-DIAG] _newStreamAndNegotiate: AFTER conn.newStream() peer=$peerId stream=${stream.id()} duration=${streamCreateDuration.inMilliseconds}ms');

      stream.setDeadline(DateTime.now().add(timeout));

      _log.fine('[IDENTIFY-DIAG] _newStreamAndNegotiate: BEFORE selectOneOf() peer=$peerId stream=${stream.id()} proto=$protoIDString');
      final protocolMuxer = host.mux as MultistreamMuxer;
      final selectedProtocol = await protocolMuxer.selectOneOf(stream, [protoIDString as ProtocolID]);

      if (selectedProtocol == null) {
        _log.warning('Protocol negotiation failed for peer=$peerId, protocol=$protoIDString. Resetting stream.');
        await stream.reset();
        return null;
      }

      // Reset stream deadline after successful protocol negotiation
      stream.setDeadline(DateTime.now().add(timeout));

      await stream.scope().setProtocol(selectedProtocol);
      await stream.setProtocol(selectedProtocol);
      _log.fine(' [IDENTIFY-STREAM-READY] peer=$peerId, stream_id=${stream.id()}, protocol=$selectedProtocol');

      return stream;
    } catch (e, st) {
      final totalDuration = DateTime.now().difference(streamCreateStart);
      _log.severe('[IdentifyService] STREAM_ERROR: peer=$peerId, error=$e, duration=${totalDuration.inMilliseconds}ms, stream_state=${stream?.isClosed ?? 'null'}');
      
      // Enhanced error detection for the target race condition
      if (e.toString().contains('closed by remote') || e.toString().contains('Stream is closed') || e.toString().contains('Stream closed by remote')) {
        _log.severe('[IdentifyService] PREMATURE_CLOSURE: This is the target error! Conn details: ${conn.id}, ${conn.state}, conn_age=${connAge.inMilliseconds}ms');
        _log.severe('[IdentifyService] PREMATURE_CLOSURE_CONTEXT: stream_id=${stream?.id() ?? 'null'}, protocol=$protoIDString, error_detail=$e');
      }
      
      // Cleanup the stream if it was opened
      if (stream != null && !stream.isClosed) {
        _log.warning('IdentifyService._newStreamAndNegotiate: Resetting stream due to error for ${conn.remotePeer}.');
        await stream.reset();
      }
      
      // Check if this is a timeout-related exception
      if (isTimeoutException(e)) {
        _log.severe('[IdentifyService] TIMEOUT_DETECTED: peer=$peerId, duration=${totalDuration.inMilliseconds}ms');
        throw IdentifyTimeoutException(
          peerId: peerId,
          message: 'Identify stream negotiation timed out for peer $peerId',
          timeout: timeout,
          cause: e,
        );
      }
      
      // This is a common race condition on shutdown, where the connection is closed
      // between the check and the stream creation. It's not a critical error.
      if (e.toString().contains('Bad state: Stream is closed')) {
        _log.warning('IdentifyService._newStreamAndNegotiate: Handled race condition for ${conn.remotePeer} for $protoIDString: $e');
        return null;
      }
      
      // For other errors, wrap in typed exception
      _log.severe('IdentifyService._newStreamAndNegotiate: Error opening or negotiating stream with ${conn.remotePeer} for $protoIDString: $e\n$st');
      throw IdentifyStreamException(
        peerId: peerId,
        message: 'Error opening or negotiating stream with $peerId for $protoIDString',
        cause: e,
      );
    }
  }

  // Made public for testing
  Future<void> handleIdentifyRequest(P2PStream stream, PeerId peerId) async {
    _log.fine('IdentifyService.handleIdentifyRequest: SERVER received identify request from ${stream.conn.remotePeer} (reported as $peerId) on stream ${stream.id()}');
    await sendIdentifyResp(stream, false);
  }

  // Made public for testing
  Future<void> handlePush(P2PStream stream, PeerId peerId) async {
    _log.fine('IdentifyService.handlePush: SERVER received identify PUSH from ${stream.conn.remotePeer} (reported as $peerId) on stream ${stream.id()}');
    _log.finer('IdentifyService.handlePush: Setting deadline for PUSH stream from ${stream.conn.remotePeer}');
    stream.setDeadline(DateTime.now().add(timeout));
    await handleIdentifyResponse(stream, true); 
  }

  // Made public for testing
  Future<void> sendIdentifyResp(P2PStream stream, bool isPush) async {
    final peer = stream.conn.remotePeer;
    // #########################################################################
    _log.fine('IdentifyService.sendIdentifyResp: SERVER ENTRY POINT for peer $peer. IsPush: $isPush. Stream ID: ${stream.id()}');
    // #########################################################################
    _log.fine('IdentifyService.sendIdentifyResp: Preparing to send identify response to $peer. IsPush: $isPush. Stream ID: ${stream.id()}');
    try {
      _log.finer('IdentifyService.sendIdentifyResp: Setting service scope for stream to $peer.');
      await stream.scope().setService(serviceName);
    } catch (e) {
      _log.warning('IdentifyService.sendIdentifyResp: Failed to attach stream to identify service for $peer: $e. Resetting stream.');
      await stream.reset();
      throw Exception('Failed to attach stream to identify service for $peer: $e');
    }

    try {
      _log.finer('IdentifyService.sendIdentifyResp: Acquiring current snapshot for $peer.');
      final snapshot = await _currentSnapshotMutex.synchronized( () => _currentSnapshot);
      _log.fine('IdentifyService.sendIdentifyResp: Sending snapshot to $peer: seq=${snapshot._seq}, protocols=${snapshot.protocols.length}, addrs=${snapshot.addrs.length}');
      
      final mes = await _createBaseIdentifyResponse(stream.conn, snapshot);
      final signedRecordBytes = await _getSignedRecord(snapshot); // Await the async call
      if (signedRecordBytes != null) {
        // signedRecordBytes is already Uint8List?, no need to await again
        mes.signedPeerRecord = signedRecordBytes.toList(); 
        _log.finer('IdentifyService.sendIdentifyResp: Added signed peer record (${mes.signedPeerRecord.length} bytes) to response for $peer.');
      } else {
        _log.warning("IdentifyService.sendIdentifyResp: No Signed record was found or could be marshalled. This could cause problems.");
        // mes.signedPeerRecord will remain empty by default
      }
      
      _log.fine('IdentifyService.sendIdentifyResp: SERVER About to write identify message to $peer on stream ${stream.id()} (remote addr: ${stream.conn.remoteMultiaddr})');
      await _writeChunkedIdentifyMsg(stream, mes);
      _log.fine('IdentifyService.sendIdentifyResp: SERVER Identify message written to $peer.');

      if (metricsTracer != null) {
        metricsTracer!.identifySent(isPush, mes.protocols.length, mes.listenAddrs.length);
      }

      _log.finer('IdentifyService.sendIdentifyResp: Updating sequence number for connection to $peer.');
      await _connsMutex.synchronized(() async {
        final e = _conns[stream.conn];
        if (e != null) {
          e.sequence = snapshot._seq;
          _log.finer('IdentifyService.sendIdentifyResp: Updated sequence for $peer to ${snapshot._seq}.');
        } else {
          _log.finer('IdentifyService.sendIdentifyResp: Connection to $peer not found in _conns map while trying to update sequence.');
        }
      });

      _log.fine('IdentifyService.sendIdentifyResp: SERVER Signalling end of writes (calling stream.closeWrite()) on stream to $peer.');
      await stream.closeWrite(); // Signal that we are done writing.
      _log.fine('IdentifyService.sendIdentifyResp: SERVER stream.closeWrite() completed for $peer. Stream will NOT be fully closed by sendIdentifyResp anymore.');
      // DO NOT CALL stream.close() here anymore. Let Yamux handle full closure based on FINs from both sides.
      _log.fine('IdentifyService.sendIdentifyResp: Successfully sent identify response and signalled closeWrite to $peer. IsPush: $isPush.');
    } catch (e, st) {
      _log.warning('IdentifyService.sendIdentifyResp: Error sending identify response to $peer. IsPush: $isPush. Error: $e\n$st');
      await stream.reset();
      rethrow;
    }
  }

  Future<Identify> _createBaseIdentifyResponse(Conn conn, IdentifySnapshot snapshot) async {
    _log.finer('IdentifyService._createBaseIdentifyResponse: Creating base response for peer ${conn.remotePeer}. Snapshot seq: ${snapshot._seq}');
    final mes = Identify();
    final remoteAddr = conn.remoteMultiaddr;
    final localAddr = conn.localMultiaddr;
    mes.protocols.addAll(snapshot.protocols.map((p) => p.toString()));
    mes.observedAddr = remoteAddr.toBytes();
    _log.finer('IdentifyService._createBaseIdentifyResponse: ObservedAddr set to ${remoteAddr.toString()} for ${conn.remotePeer}');
    
    final viaLoopback = localAddr.isLoopback() || remoteAddr.isLoopback();
    _log.finer('IdentifyService._createBaseIdentifyResponse: LocalAddr: $localAddr, RemoteAddr: $remoteAddr, ViaLoopback: $viaLoopback for ${conn.remotePeer}');
    for (final addr in snapshot.addrs) {
      if (!viaLoopback && addr.isLoopback()) {
        _log.finer('IdentifyService._createBaseIdentifyResponse: Skipping loopback listen address $addr for non-loopback connection to ${conn.remotePeer}');
        continue;
      }
      mes.listenAddrs.add(addr.toBytes());
    }
    _log.finer('IdentifyService._createBaseIdentifyResponse: Added ${mes.listenAddrs.length} listen addresses for ${conn.remotePeer}');

    final ownKey = await host.peerStore.keyBook.pubKey(host.id);
    if (ownKey == null) {
      if (await host.peerStore.keyBook.privKey(host.id) != null) {
        _log.fine('IdentifyService._createBaseIdentifyResponse: Did not have own public key in Peerstore for ${host.id}');
      } else {
        _log.fine('IdentifyService._createBaseIdentifyResponse: No public or private key found for self (${host.id}) in Peerstore.');
      }
    } else {
      try {
        final kb = ownKey.marshal();
        mes.publicKey = kb;
        _log.finer('IdentifyService._createBaseIdentifyResponse: Added public key (${mes.publicKey.length} bytes) for ${host.id}');
      } catch (e) {
        _log.severe('IdentifyService._createBaseIdentifyResponse: Failed to marshal own public key for ${host.id}: $e');
      }
    }
    mes.protocolVersion = protocolVersion;
    mes.agentVersion = userAgent;
    _log.finer('IdentifyService._createBaseIdentifyResponse: ProtocolVersion: $protocolVersion, AgentVersion: $userAgent for ${conn.remotePeer}');
    return mes;
  }

  // Change to async and await the record
  Future<Uint8List?> _getSignedRecord(IdentifySnapshot snapshot) async { // Made async, returns Future<Uint8List?>
    _log.finer('IdentifyService._getSignedRecord: Attempting to get signed record. DisableSignedPeerRecord: $disableSignedPeerRecord, Snapshot record type: ${snapshot.record.runtimeType}');
    if (disableSignedPeerRecord) {
      _log.finer('IdentifyService._getSignedRecord: Signed peer record disabled.');
      return null;
    }

    // Await the record if it's a Future
    final actualRecord = snapshot.record is Future ? await snapshot.record : snapshot.record;

    if (actualRecord == null) {
      _log.finer('IdentifyService._getSignedRecord: Actual record is null after await.');
      return null;
    }

    // At this point, actualRecord should be an Envelope
    if (actualRecord is! Envelope) {
        _log.warning('IdentifyService._getSignedRecord: Record is not an Envelope. Type: ${actualRecord.runtimeType}');
        return null;
    }

    try {
      // Now actualRecord is confirmed to be an Envelope
      final marshalledRecord = await actualRecord.marshal(); // Envelope.marshal() is async
      if (marshalledRecord == null) { // Check if marshal itself returned null
          _log.warning('IdentifyService._getSignedRecord: Marshalled record is null.');
          return null;
      }
      _log.finer('IdentifyService._getSignedRecord: Marshalled signed record successfully (${marshalledRecord.length} bytes).');
      return marshalledRecord;
    } catch (e, st) {
      _log.severe('IdentifyService._getSignedRecord: Failed to marshal signed record: $e\n$st');
      return null;
    }
  }

  /// Writes a varint-length-prefixed protobuf message to the stream.
  /// This matches go-libp2p's protoio.NewDelimitedWriter format.
  Future<void> _writeDelimitedMsg(P2PStream stream, List<int> msgBytes) async {
    final lenPrefix = MultiAddrCodec.encodeVarint(msgBytes.length);
    final frame = Uint8List(lenPrefix.length + msgBytes.length);
    frame.setRange(0, lenPrefix.length, lenPrefix);
    frame.setRange(lenPrefix.length, frame.length, msgBytes);
    await stream.write(frame);
  }

  Future<void> _writeChunkedIdentifyMsg(P2PStream stream, Identify mes) async {
    final msgBytes = mes.writeToBuffer();
    _log.finer('IdentifyService._writeChunkedIdentifyMsg: Writing to stream ${stream.id()} for peer ${stream.conn.remotePeer}. Total message size: ${msgBytes.length} bytes. SignedPeerRecord present: ${mes.signedPeerRecord.isNotEmpty}');
    if (mes.signedPeerRecord.isEmpty || msgBytes.length <= legacyIDSize) {
      _log.finer('IdentifyService._writeChunkedIdentifyMsg: Sending as single delimited message (size ${msgBytes.length}).');
      await _writeDelimitedMsg(stream, msgBytes);
      _log.fine('IdentifyService._writeChunkedIdentifyMsg: Single message sent to ${stream.conn.remotePeer}.');
      return;
    }

    _log.finer('IdentifyService._writeChunkedIdentifyMsg: Message size ${msgBytes.length} > $legacyIDSize and has signed record. Sending in chunks.');
    final sr = mes.signedPeerRecord;
    mes.signedPeerRecord = []; // Clear signed record for the first chunk
    final firstChunkBytes = mes.writeToBuffer();
    _log.finer('IdentifyService._writeChunkedIdentifyMsg: Writing first chunk (${firstChunkBytes.length} bytes, without signed record) to ${stream.conn.remotePeer}.');
    await _writeDelimitedMsg(stream, firstChunkBytes);
    _log.fine('IdentifyService._writeChunkedIdentifyMsg: First chunk sent to ${stream.conn.remotePeer}.');

    final srMsg = Identify()..signedPeerRecord = sr;
    final secondChunkBytes = srMsg.writeToBuffer();
    _log.finer('IdentifyService._writeChunkedIdentifyMsg: Writing second chunk (${secondChunkBytes.length} bytes, only signed record) to ${stream.conn.remotePeer}.');
    await _writeDelimitedMsg(stream, secondChunkBytes);
    _log.fine('IdentifyService._writeChunkedIdentifyMsg: Second chunk (signed record) sent to ${stream.conn.remotePeer}.');
  }

  // Made public for testing
  Future<void> handleIdentifyResponse(P2PStream stream, bool isPush) async {
    final peer = stream.conn.remotePeer;
    final String side = stream.conn.localPeer == host.id ? "CLIENT" : "SERVER";
    final handleStart = DateTime.now();

    
    try {

      await stream.scope().setService(serviceName);
      final serviceScopeTime = DateTime.now().difference(handleStart);

    } catch (e) {
      _log.warning(' [HANDLE-IDENTIFY-RESPONSE-PHASE-1-ERROR] ($side) Error attaching stream to identify service for peer=$peer: $e. Resetting stream.');
      await stream.reset();
      throw e;
    }
    
    try {

      await stream.scope().reserveMemory(signedIDSize, ReservationPriority.always);
      final memoryReserveTime = DateTime.now().difference(handleStart);

    } catch (e) {
      _log.warning(' [HANDLE-IDENTIFY-RESPONSE-PHASE-2-ERROR] ($side) Error reserving memory for identify stream for peer=$peer: $e. Resetting stream.');
      await stream.reset();
      throw e;
    }
    
    try {
      final conn = stream.conn;

      final mes = await _readAllIDMessages(stream);
      final readMessagesTime = DateTime.now().difference(handleStart);

      

      await _consumeMessage(mes, conn, isPush);
      final consumeMessageTime = DateTime.now().difference(handleStart);


      if (metricsTracer != null) {
        metricsTracer!.identifyReceived(isPush, mes.protocols.length, mes.listenAddrs.length);
      }


      await _connsMutex.synchronized( () async {
        final e = _conns[conn];
        if (e == null) {
          _log.fine('IdentifyService.handleIdentifyResponse ($side): Connection entry for $peer already removed (disconnected). Cannot update push support.');
          return;
        }
        _log.finer('IdentifyService.handleIdentifyResponse ($side): Checking push support for $peer in peerstore.');
        final sup = await host.peerStore.protoBook.supportsProtocols(conn.remotePeer, [idPush]);
        if (sup.isNotEmpty) {
          e.pushSupport = IdentifyPushSupport.supported;
          _log.fine('IdentifyService.handleIdentifyResponse ($side): Peer $peer supports push.');
        } else {
          e.pushSupport = IdentifyPushSupport.unsupported;
          _log.fine('IdentifyService.handleIdentifyResponse ($side): Peer $peer does not support push.');
        }
        if (metricsTracer != null) {
          metricsTracer!.connPushSupport(e.pushSupport);
        }
      });
      final pushSupportTime = DateTime.now().difference(handleStart);



      await stream.closeWrite();
      final totalTime = DateTime.now().difference(handleStart);

    } catch (e, st) {
      final errorTime = DateTime.now().difference(handleStart);
      _log.severe(' [HANDLE-IDENTIFY-RESPONSE-ERROR] ($side) Error reading or processing identify message from peer=$peer, duration=${errorTime.inMilliseconds}ms, error=$e\n$st');
      await stream.reset();
      rethrow;
    } finally {

      stream.scope().releaseMemory(signedIDSize);
    }
  }

  Future<Identify> _readAllIDMessages(P2PStream stream) async {
    final peer = stream.conn.remotePeer;
    final readStart = DateTime.now();

    // Read a single varint-length-prefixed identify message.
    // go-libp2p sends exactly one delimited protobuf message per identify exchange.
    final buffer = BytesBuilder();
    final msgBytes = await _readDelimitedMsg(stream, buffer);
    final totalReadTime = DateTime.now().difference(readStart);

    if (msgBytes == null || msgBytes.isEmpty) {
      _log.severe(' [READ-ALL-ID-MESSAGES] No identify message received from peer=$peer, duration=${totalReadTime.inMilliseconds}ms');
      return Identify();
    }

    _log.fine(' [READ-ALL-ID-MESSAGES] Parsed identify from peer=$peer, ${msgBytes.length} bytes, duration=${totalReadTime.inMilliseconds}ms');
    return Identify.fromBuffer(msgBytes);
  }

  /// Reads a single varint-length-prefixed message from the stream.
  /// Uses [buffer] to accumulate partial reads and handle leftover bytes.
  /// Returns null on EOF.
  Future<Uint8List?> _readDelimitedMsg(P2PStream stream, BytesBuilder buffer) async {
    while (true) {
      final accumulated = buffer.toBytes();

      // Try to decode varint length prefix from accumulated bytes
      if (accumulated.isNotEmpty) {
        try {
          final (length, consumed) = MultiAddrCodec.decodeVarint(accumulated);
          if (consumed > 0 && accumulated.length >= consumed + length) {
            // We have the full message
            final msgBytes = Uint8List.fromList(
                accumulated.sublist(consumed, consumed + length));
            // Put leftover bytes back in buffer
            buffer.clear();
            if (accumulated.length > consumed + length) {
              buffer.add(accumulated.sublist(consumed + length));
            }
            return msgBytes;
          }
        } catch (e) {
          // Incomplete varint, need more data
          if (e is! RangeError) rethrow;
        }
      }

      // Need more data from stream
      try {
        final chunk = await stream.read();
        if (chunk.isEmpty) {
          return null;
        }
        buffer.add(chunk);
      } catch (e) {
        if (accumulated.isNotEmpty) {
          // Stream closed with data in buffer — try parsing as-is
          // (fallback for Dart-to-Dart which may not use length framing yet)
          buffer.clear();
          return Uint8List.fromList(accumulated);
        }
        rethrow;
      }
    }
  }

  void _mergeIdentify(Identify target, Identify source) {
    _log.finer('IdentifyService._mergeIdentify: Merging source into target. Target (before): P:${target.protocols.length},LA:${target.listenAddrs.length},SR:${target.signedPeerRecord.isNotEmpty}. Source: P:${source.protocols.length},LA:${source.listenAddrs.length},SR:${source.signedPeerRecord.isNotEmpty}');
    target.protocols.addAll(source.protocols);
    target.listenAddrs.addAll(source.listenAddrs);
    if (source.hasObservedAddr() && source.observedAddr.isNotEmpty) { // Check if not empty
      target.observedAddr = source.observedAddr;
    }
    if (source.hasPublicKey() && source.publicKey.isNotEmpty) { // Check if not empty
      target.publicKey = source.publicKey;
    }
    if (source.hasProtocolVersion()) {
      target.protocolVersion = source.protocolVersion;
    }
    if (source.hasAgentVersion()) {
      target.agentVersion = source.agentVersion;
    }
    if (source.hasSignedPeerRecord() && source.signedPeerRecord.isNotEmpty) { // Check if not empty
      target.signedPeerRecord = source.signedPeerRecord;
    }
    _log.finer('IdentifyService._mergeIdentify: Target (after): P:${target.protocols.length},LA:${target.listenAddrs.length},SR:${target.signedPeerRecord.isNotEmpty}');
  }

  Future<void> _consumeMessage(Identify mes, Conn conn, bool isPush) async {
    final p = conn.remotePeer;
    _log.fine('IdentifyService._consumeMessage: Consuming identify message from $p. IsPush: $isPush.');

    final supported = await host.peerStore.protoBook.getProtocols(p);
    _log.finer('IdentifyService._consumeMessage: Current known protocols for $p: ${supported.length}');
    final mesProtocols = mes.protocols.map((s) => s).toList(); // Already List<String>
    _log.finer('IdentifyService._consumeMessage: Received protocols from $p: ${mesProtocols.length}');

    final (added, removed) = _diff(supported, mesProtocols);
    _log.fine('IdentifyService._consumeMessage: For peer $p - Added protocols: ${added.length}, Removed protocols: ${removed.length}');
    host.peerStore.protoBook.setProtocols(p, mesProtocols);

    if (isPush) {
      _log.fine('IdentifyService._consumeMessage: Emitting EvtPeerProtocolsUpdated for $p due to PUSH.');
      _evtPeerProtocolsUpdated.emit(EvtPeerProtocolsUpdated(
        peer: p,
        added: added,
        removed: removed,
      ));
    }

    MultiAddr? obsAddr;
    if (mes.observedAddr.isNotEmpty) {
        try {
            obsAddr = MultiAddr.fromBytes(Uint8List.fromList(mes.observedAddr));
            _log.fine('IdentifyService._consumeMessage: Parsed observed address for $p: $obsAddr');
        } catch (e) {
            _log.warning('IdentifyService._consumeMessage: Error parsing received observed addr for $p from conn ${conn.id}: $e');
        }
    } else {
        _log.fine('IdentifyService._consumeMessage: No observed address in message from $p.');
    }


    if (obsAddr != null && !disableObservedAddrManager) {
      _log.fine('IdentifyService._consumeMessage: Recording observed address $obsAddr for $p via conn ${conn.id}.');
      _observedAddrMgr!.record(conn, obsAddr);
    }

    final laddrs = mes.listenAddrs;
    final lmaddrs = <MultiAddr>[];
    _log.finer('IdentifyService._consumeMessage: Processing ${laddrs.length} listen addresses from $p.');
    for (final addrBytes in laddrs) {
      try {
        final maddr = MultiAddr.fromBytes(Uint8List.fromList(addrBytes));
        lmaddrs.add(maddr);
      } catch (e) {
        _log.warning('IdentifyService._consumeMessage: Failed to parse listen multiaddr from $p (conn ${conn.id}, remote ${conn.remoteMultiaddr}): $e. AddrBytes: $addrBytes');
      }
    }
    _log.fine('IdentifyService._consumeMessage: Parsed ${lmaddrs.length} listen addresses for $p.');

    Envelope? signedPeerRecord;
    if (mes.signedPeerRecord.isNotEmpty) {
        try {
            _log.finer('IdentifyService._consumeMessage: Attempting to parse signed peer record for $p (${mes.signedPeerRecord.length} bytes).');
            signedPeerRecord = await signedPeerRecordFromMessage(mes);
            _log.fine('IdentifyService._consumeMessage: Parsed signed peer record for $p: ${signedPeerRecord != null}');
        } catch (e) {
            _log.warning('IdentifyService._consumeMessage: Error getting peer record from Identify message for $p: $e');
        }
    } else {
        _log.finer('IdentifyService._consumeMessage: No signed peer record in message from $p.');
    }


    Duration ttl = RecentlyConnectedAddrTTL;
    final connectedness = host.network.connectedness(p);
    _log.finer('IdentifyService._consumeMessage: Connectedness for $p: $connectedness. Default TTL: $ttl');
    switch (connectedness) {
      case Connectedness.limited:
      case Connectedness.connected:
        ttl = ConnectedAddrTTL;
        _log.finer('IdentifyService._consumeMessage: Peer $p is connected/limited, using TTL: $ttl');
        break;
      default:
        _log.finer('IdentifyService._consumeMessage: Peer $p not connected/limited, using default TTL: $ttl');
        break;
    }

    _log.finer('IdentifyService._consumeMessage: Updating address book for $p. Current TTLs: RecentlyConnectedAddrTTL=$RecentlyConnectedAddrTTL, ConnectedAddrTTL=$ConnectedAddrTTL, TempAddrTTL=$TempAddrTTL.');
    await host.peerStore.addrBook.updateAddrs(p, RecentlyConnectedAddrTTL, TempAddrTTL);
    await host.peerStore.addrBook.updateAddrs(p, ConnectedAddrTTL, TempAddrTTL);

    var addrsToStore = <MultiAddr>[];
    if (signedPeerRecord != null) {
      try {
        _log.finer('IdentifyService._consumeMessage: Consuming signed peer record for $p.');
        final signedAddrs = await _consumeSignedPeerRecord(conn.remotePeer, signedPeerRecord);
        addrsToStore = signedAddrs;
        _log.fine('IdentifyService._consumeMessage: Addresses from signed peer record for $p: ${addrsToStore.length}');
      } catch (e) {
        _log.warning('IdentifyService._consumeMessage: Failed to consume signed peer record for $p: $e. Falling back to listen addresses from message.');
        signedPeerRecord = null; // Invalidate if consumption failed
        addrsToStore = lmaddrs;
      }
    } else {
      addrsToStore = lmaddrs;
      _log.finer('IdentifyService._consumeMessage: Using listen addresses from message for $p as no valid signed record was processed.');
    }

    _log.finer('IdentifyService._consumeMessage: Filtering addresses for $p based on remote connection address ${conn.remoteMultiaddr}. Before filter: ${addrsToStore.length}');
    addrsToStore = _filterAddrs(addrsToStore, conn.remoteMultiaddr);
    _log.finer('IdentifyService._consumeMessage: After filter for $p: ${addrsToStore.length}');

    if (addrsToStore.length > connectedPeerMaxAddrs) {
      _log.fine('IdentifyService._consumeMessage: Too many addresses for $p (${addrsToStore.length} > $connectedPeerMaxAddrs). Trimming.');
      addrsToStore = addrsToStore.sublist(0, connectedPeerMaxAddrs);
    }

    _log.fine('IdentifyService._consumeMessage: Adding ${addrsToStore.length} addresses for $p to peerstore with TTL $ttl.');
    await host.peerStore.addrBook.addAddrs(p, addrsToStore, ttl);
    _log.finer('IdentifyService._consumeMessage: Updating TempAddrTTL to zero for $p.');
    await host.peerStore.addrBook.updateAddrs(p, TempAddrTTL, Duration.zero);

    final pv = mes.protocolVersion;
    final av = mes.agentVersion;
    _log.fine('IdentifyService._consumeMessage: Storing metadata for $p: ProtocolVersion=$pv, AgentVersion=$av');
    host.peerStore.peerMetadata.put(p, 'ProtocolVersion', pv);
    host.peerStore.peerMetadata.put(p, 'AgentVersion', av);

    _log.finer('IdentifyService._consumeMessage: Consuming received public key for $p.');
    await _consumeReceivedPubKey(conn, Uint8List.fromList(mes.publicKey)); // Await this

    if (obsAddr != null) {
      _evtPeerIdentificationCompleted.emit(EvtPeerIdentificationCompleted(
        peer: conn.remotePeer,
        conn: conn,
        listenAddrs: lmaddrs, // Use the initially parsed listen addrs for the event
        protocols: mesProtocols,
        signedPeerRecord: signedPeerRecord, // Use the potentially invalidated one if consumption failed
        agentVersion: av,
        protocolVersion: pv,
        observedAddr: obsAddr,
      ));
    } else {
      // Still emit event, but obsAddr will be null in it.
      _evtPeerIdentificationCompleted.emit(EvtPeerIdentificationCompleted(
        peer: conn.remotePeer,
        conn: conn,
        listenAddrs: lmaddrs,
        protocols: mesProtocols,
        signedPeerRecord: signedPeerRecord,
        agentVersion: av,
        protocolVersion: pv,
        observedAddr: null, // Explicitly null
      ));
    }
    _log.fine('IdentifyService._consumeMessage: Finished consuming message from $p.');
  }

  Future<Envelope?> signedPeerRecordFromMessage(Identify msg) async {
    _log.finer('IdentifyService.signedPeerRecordFromMessage: Checking for signed peer record.');
    if (msg.signedPeerRecord.isEmpty) {
      _log.finer('IdentifyService.signedPeerRecordFromMessage: No signed peer record in message.');
      return null;
    }
    _log.finer('IdentifyService.signedPeerRecordFromMessage: Attempting to consume envelope from ${msg.signedPeerRecord.length} bytes.');
    try {
      final (envelope, _ ) = await Envelope.consumeEnvelope(Uint8List.fromList(msg.signedPeerRecord), PeerRecordEnvelopeDomain);
      _log.fine('IdentifyService.signedPeerRecordFromMessage: Successfully consumed envelope.');
      return envelope;
    } catch (e) {
      _log.warning('IdentifyService.signedPeerRecordFromMessage: Failed to parse signed peer record: $e');
      return null;
    }
  }

  Future<List<MultiAddr>> _consumeSignedPeerRecord(PeerId p, Envelope? signedPeerRecord) async {
    _log.finer('IdentifyService._consumeSignedPeerRecord: Consuming signed record for peer $p.');
    if (signedPeerRecord == null || signedPeerRecord.publicKey == null) {
      _log.warning('IdentifyService._consumeSignedPeerRecord: Missing signed peer record or public key for $p.');
      throw Exception("missing pubkey or record");
    }
    PeerId id;
    try {
      id = await PeerId.fromPublicKey(signedPeerRecord.publicKey); // Added null check operator
      _log.finer('IdentifyService._consumeSignedPeerRecord: Derived PeerId $id from record public key for $p.');
    } catch (e) {
      _log.warning('IdentifyService._consumeSignedPeerRecord: Failed to derive peer ID from record public key for $p: $e');
      throw Exception("failed to derive peer ID: $e");
    }
    if (id != p) {
      _log.warning('IdentifyService._consumeSignedPeerRecord: Signed peer record envelope for unexpected peer ID. Expected $p, got $id.');
      throw Exception("received signed peer record envelope for unexpected peer ID. expected $p, got $id");
    }
    pr.PeerRecord record;
    try {
      record = await signedPeerRecord.record();
      _log.finer('IdentifyService._consumeSignedPeerRecord: Obtained record from envelope for $p.');
    } catch (e) {
      _log.warning('IdentifyService._consumeSignedPeerRecord: Failed to obtain record from envelope for $p: $e');
      throw Exception("failed to obtain record: $e");
    }
    // final peerRecord = record as PeerRecord?; // Already casted
    if (PeerId.fromBytes(Uint8List.fromList(record.peerId)) != p) { // Use 'record' directly
      _log.warning('IdentifyService._consumeSignedPeerRecord: Record peer ID mismatch. Expected $p, got ${record.peerId}.');
      throw Exception("received signed peer record for unexpected peer ID. expected $p, got ${record.peerId}");
    }
    _log.fine('IdentifyService._consumeSignedPeerRecord: Successfully consumed signed peer record for $p. Found ${record.addresses.length} addresses.');
    return record.addresses.map((el) => MultiAddr.fromBytes(Uint8List.fromList(el.multiaddr))).toList();
  }

  Future<void> _consumeReceivedPubKey(Conn conn, Uint8List? kb) async {
    final lp = conn.localPeer;
    final rp = conn.remotePeer;
    _log.finer('IdentifyService._consumeReceivedPubKey: Consuming public key for remote peer $rp from local peer $lp.');

    if (kb == null || kb.isEmpty) {
      _log.fine('IdentifyService._consumeReceivedPubKey: $lp did not receive public key for remote peer $rp (key bytes null or empty).');
      return;
    }
    _log.finer('IdentifyService._consumeReceivedPubKey: Received ${kb.length} bytes for public key of $rp.');

    PublicKey newKey;
    try {
      final pmesg = crypto.PublicKey.fromBuffer(kb);
      newKey = await publicKeyFromProto(pmesg);
      _log.finer('IdentifyService._consumeReceivedPubKey: Successfully unmarshalled public key for $rp.');
    } catch (e) {
      _log.warning('IdentifyService._consumeReceivedPubKey: $lp cannot unmarshal key from remote peer $rp: $e');
      return;
    }

    PeerId np;
    try {
      np = await PeerId.fromPublicKey(newKey); // Await this
      _log.finer('IdentifyService._consumeReceivedPubKey: Derived PeerId $np from received public key for $rp.');
    } catch (e) {
      _log.warning('IdentifyService._consumeReceivedPubKey: $lp cannot get peer.ID from key of remote peer $rp: $e');
      return;
    }

    if (np != rp) {
      // This case might be complex: if rp was initially empty (e.g. from an inbound connection without full handshake yet)
      // and np is now a valid ID.
      if (rp.toString().isEmpty && np.toString().isNotEmpty) {
        _log.fine('IdentifyService._consumeReceivedPubKey: Remote peer $rp was initially empty, now identified as $np. Attempting to add key.');
        try {
          host.peerStore.keyBook.addPubKey(rp, newKey); // Use original rp if it's a placeholder that needs updating
          _log.fine('IdentifyService._consumeReceivedPubKey: Added key for initially-empty $rp (now $np) to peerstore.');
        } catch (e) {
          _log.warning('IdentifyService._consumeReceivedPubKey: $lp could not add key for initially-empty $rp (now $np) to peerstore: $e');
        }
      } else {
        _log.severe('IdentifyService._consumeReceivedPubKey: $lp received key for remote peer $rp, but derived PeerId $np MISMATCHES!');
      }
      return;
    }

    _log.finer('IdentifyService._consumeReceivedPubKey: Derived PeerId $np matches expected remote peer $rp.');
    final currKey = await host.peerStore.keyBook.pubKey(rp);

    if (currKey == null) {
      _log.fine('IdentifyService._consumeReceivedPubKey: No existing public key for $rp in peerstore. Adding received key.');
      try {
        host.peerStore.keyBook.addPubKey(rp, newKey);
        _log.fine('IdentifyService._consumeReceivedPubKey: Added new public key for $rp to peerstore.');
      } catch (e) {
        _log.warning('IdentifyService._consumeReceivedPubKey: $lp could not add new key for $rp to peerstore: $e');
      }
      return;
    }

    _log.finer('IdentifyService._consumeReceivedPubKey: Existing public key found for $rp. Comparing with received key.');
    if (await currKey.equals(newKey)) {
      _log.fine('IdentifyService._consumeReceivedPubKey: Received public key for $rp matches existing key in peerstore.');
      return;
    }

    _log.warning('IdentifyService._consumeReceivedPubKey: $lp identify got a DIFFERENT key for $rp, but derived PeerID matches. This is unusual.');
    // Additional check: ensure current key in store also derives to rp
    PeerId? cp;
    try {
      cp = await PeerId.fromPublicKey(currKey);
    } catch (e) {
      _log.severe('IdentifyService._consumeReceivedPubKey: $lp cannot get peer.ID from LOCAL key of remote peer $rp: $e. This indicates peerstore corruption or a major issue.');
      return;
    }
    if (cp != rp) {
      _log.severe('IdentifyService._consumeReceivedPubKey: $lp local key for remote peer $rp yields different peer.ID $cp. Peerstore might be inconsistent for $rp.');
      return;
    }
    _log.severe('IdentifyService._consumeReceivedPubKey: Both local key and received key for $rp derive to the same PeerID $rp, but the keys themselves are different. This should ideally not happen if keys are canonical.');
  }

  List<MultiAddr> _filterAddrs(List<MultiAddr> addrs, MultiAddr remote) {
    _log.finer('IdentifyService._filterAddrs: Filtering ${addrs.length} addresses based on remote address type: ${remote.toString()} (Loopback: ${remote.isLoopback()}, Private: ${remote.isPrivate()}, Public: ${remote.isPublic()})');
    if (remote.isLoopback()) {
      _log.finer('IdentifyService._filterAddrs: Remote is loopback, returning all addresses.');
      return addrs;
    } else if (remote.isPrivate()) {
      final filtered = addrs.where((a) => !a.isLoopback()).toList();
      _log.finer('IdentifyService._filterAddrs: Remote is private, filtering out loopback. Before: ${addrs.length}, After: ${filtered.length}');
      return filtered;
    } else if (remote.isPublic()) {
      final filtered = addrs.where((a) => a.isPublic()).toList();
      _log.finer('IdentifyService._filterAddrs: Remote is public, filtering for public only. Before: ${addrs.length}, After: ${filtered.length}');
      return filtered;
    } else {
      _log.finer('IdentifyService._filterAddrs: Remote address type unknown or not handled, returning all addresses.');
      return addrs;
    }
  }

  (List<ProtocolID>, List<ProtocolID>) _diff(List<ProtocolID> before, List<ProtocolID> after) {
    _log.finer('IdentifyService._diff: Calculating protocol diff. Before: ${before.length}, After: ${after.length}');
    final added = <ProtocolID>[];
    final removed = <ProtocolID>[];
    final Set<ProtocolID> beforeSet = Set.from(before);
    final Set<ProtocolID> afterSet = Set.from(after);

    for (final p in after) {
      if (!beforeSet.contains(p)) {
        added.add(p);
      }
    }
    for (final p in before) {
      if (!afterSet.contains(p)) {
        removed.add(p);
      }
    }
    _log.finer('IdentifyService._diff: Added: ${added.length}, Removed: ${removed.length}');
    return (added, removed);
  }

  @override
  Future<void> identifyConn(Conn conn) async {
    _log.fine('IdentifyService.identifyConn: Called for peer ${conn.remotePeer}. Delegating to identifyWait.');
    await identifyWait(conn);
    _log.fine('IdentifyService.identifyConn: identifyWait completed for peer ${conn.remotePeer}.');
  }

  @override
  Future<void> identifyWait(Conn conn) async {
    final peerId = conn.remotePeer;
    final identifyWaitStart = DateTime.now();

    
    Completer<void>? completerToAwait;


    await _connsMutex.synchronized( () async {
      final mutexAcquiredTime = DateTime.now().difference(identifyWaitStart);

      
      var entry = _conns[conn];

      if (entry != null) {
        // OPTIMIZATION: If identify already succeeded for this connection, return immediately.
        // This prevents re-running identify on every newStream call, which would cause
        // 30-second timeouts when the connection is stale.
        if (entry.identifySucceeded) {
          _log.fine(' [IDENTIFY-WAIT-ALREADY-SUCCEEDED] Peer $peerId already identified on this connection, skipping');
          // completerToAwait remains null, so function will return immediately
          return;
        }

        if (entry.identifyWaitCompleter != null && !entry.identifyWaitCompleter!.isCompleted) {

          completerToAwait = entry.identifyWaitCompleter;
          // No need to spawn _identifyConn again if one is already running for this entry.
        } else {

          entry.identifyWaitCompleter = Completer<void>();
          completerToAwait = entry.identifyWaitCompleter;
          // Spawn _identifyConn as this is a new request for this entry or previous one completed/failed.
          _spawnIdentifyConn(conn, entry);
        }
      } else {

        if (conn.isClosed) {
          _log.warning(' [IDENTIFY-WAIT-PHASE-1-CONN-CLOSED] Connection to peer=$peerId is already closed. Not creating entry or starting identify.');
          // Completer to await will remain null, function will return.
          return;
        }

        entry = _addConnWithLock(conn); // _addConnWithLock returns the new/existing entry
        entry.identifyWaitCompleter = Completer<void>();
        completerToAwait = entry.identifyWaitCompleter;
        _spawnIdentifyConn(conn, entry);
      }
    });
    
    final mutexReleasedTime = DateTime.now().difference(identifyWaitStart);


    if (completerToAwait == null) {
      _log.warning(' [IDENTIFY-WAIT-NO-COMPLETER] No completer to await for peer=$peerId (e.g., connection was closed). Identify will not complete.');
      return; // Or throw, depending on desired behavior for closed conns.
    }


    try {
      await completerToAwait!.future;
      final totalDuration = DateTime.now().difference(identifyWaitStart);

    } catch (e, st) {
      final totalDuration = DateTime.now().difference(identifyWaitStart);
      _log.warning(' [IDENTIFY-WAIT-ERROR] Identify completer for peer=$peerId completed with error, total_duration=${totalDuration.inMilliseconds}ms, error=$e\n$st');
      
      // Handle timeout exceptions gracefully.
      // A timeout indicates the peer is unreachable, not a security concern.
      // The failure event has already been emitted by _spawnIdentifyConn's catchError,
      // so applications can listen for EvtPeerIdentificationFailed if needed.
      // Rethrowing typed IdentifyTimeoutException allows callers to specifically handle timeouts.
      if (e is IdentifyTimeoutException) {
        _log.warning(' [IDENTIFY-WAIT-TIMEOUT] Identify timeout for peer=$peerId handled gracefully. Rethrowing typed exception for caller to handle.');
        rethrow;
      }
      
      // Also handle timeout detection from generic exceptions
      if (isTimeoutException(e)) {
        _log.warning(' [IDENTIFY-WAIT-TIMEOUT-DETECTED] Identify timeout detected for peer=$peerId. Converting to typed exception.');
        throw IdentifyTimeoutException(
          peerId: peerId,
          message: 'Identify timed out for peer $peerId',
          cause: e,
        );
      }
      
      // CRITICAL SECURITY FIX: For non-timeout errors, we MUST rethrow.
      // If identify fails (other than timeout), the connection is unverified 
      // and potentially insecure (missing keys/metadata).
      // Callers (like BasicHost.connect or newStream) expect identifyWait to complete successfully
      // before proceeding. If we swallow the error, they proceed with a degraded connection.
      // By rethrowing, we ensure BasicHost aborts the connection.
      rethrow;
    }
  }

  void _spawnIdentifyConn(Conn conn, Entry entry) {
    final peerId = conn.remotePeer;
    final spawnStart = DateTime.now();

    
    // Ensure completer exists, though it should by now.
    entry.identifyWaitCompleter ??= Completer<void>();



    _identifyConn(conn).then((_) {
      final duration = DateTime.now().difference(spawnStart);

      // Mark identify as succeeded - subsequent calls to identifyWait will skip re-identification
      entry.identifySucceeded = true;
      _log.fine(' [SPAWN-IDENTIFY-SUCCESS] Identify succeeded for peer=$peerId, duration=${duration.inMilliseconds}ms');

      if (!entry.identifyWaitCompleter!.isCompleted) {

        entry.identifyWaitCompleter!.complete();
      } else {
        _log.warning(' [SPAWN-IDENTIFY-ALREADY-COMPLETED] identifyWaitCompleter for peer=$peerId was already completed');
      }
    }).catchError((error, stackTrace) {
      final duration = DateTime.now().difference(spawnStart);
      _log.warning(' [SPAWN-IDENTIFY-ERROR] _identifyConn for peer=$peerId failed, duration=${duration.inMilliseconds}ms, error=$error\n$stackTrace');
      _evtPeerIdentificationFailed.emit(EvtPeerIdentificationFailed(
        peer: peerId,
        reason: Exception(error.toString()), // Standardize to Exception
      ));
      if (!entry.identifyWaitCompleter!.isCompleted) {

        entry.identifyWaitCompleter!.completeError(error, stackTrace);
      } else {
        _log.warning(' [SPAWN-IDENTIFY-ERROR-ALREADY-COMPLETED] identifyWaitCompleter for peer=$peerId was already completed when error occurred');
      }
    });

  }

  Future<void> _identifyConn(Conn conn) async {
    final peerId = conn.remotePeer;
    final connAge = DateTime.now().difference(conn.stat.stats.opened);
    final identifyStart = DateTime.now();

    
    P2PStream? stream;
    try {

      stream = await _newStreamAndNegotiate(conn, id);
      
      final streamNegotiationDuration = DateTime.now().difference(identifyStart);
      if (stream == null) {
        _log.severe(' [IDENTIFY-CONN-STREAM-FAILED] peer=$peerId, duration=${streamNegotiationDuration.inMilliseconds}ms, reason=stream_negotiation_failed');
        throw IdentifyStreamException(
          peerId: peerId,
          message: 'Failed to open or negotiate identify stream with $peerId',
        );
      }
      



      await handleIdentifyResponse(stream, false);
      
      final totalDuration = DateTime.now().difference(identifyStart);

    } catch (e, st) {
      final duration = DateTime.now().difference(identifyStart);
      _log.severe(' [IDENTIFY-CONN-ERROR] peer=$peerId, error=$e, duration=${duration.inMilliseconds}ms, stream_state=${stream?.isClosed ?? 'null'}');
      
      // Enhanced error detection for the target race condition
      if (e.toString().contains('closed by remote') || e.toString().contains('Stream is closed') || e.toString().contains('Stream closed by remote')) {
        _log.severe(' [IDENTIFY-CONN-PREMATURE-CLOSURE] This is the target error! peer=$peerId, conn_age=${connAge.inMilliseconds}ms, stream_id=${stream?.id() ?? 'null'}');
      }
      
      // Ensure stream is reset if it was opened
      if (stream != null && !stream.isClosed) {

        await stream.reset();
      }
      rethrow; // Rethrow to be caught by _spawnIdentifyConn
    }
  }

  Entry _addConnWithLock(Conn conn) { // Return type changed to Entry
    _log.finer('IdentifyService._addConnWithLock: Adding connection for ${conn.remotePeer}. Conn ID: ${conn.id}');
    var entry = _conns[conn];
    if (entry == null) {
      if (!_setupCompleted.isCompleted) {
        _log.severe('IdentifyService._addConnWithLock: Identify service not started, cannot add connection for ${conn.remotePeer}.');
        throw Exception('Identify service not started');
      }
      _log.finer('IdentifyService._addConnWithLock: Creating new Entry object for ${conn.remotePeer}.');
      entry = Entry();
      _conns[conn] = entry;
    } else {
      _log.finer('IdentifyService._addConnWithLock: Entry for ${conn.remotePeer} already exists.');
    }
    return entry;
  }

  @override
  List<MultiAddr> ownObservedAddrs() {
    if (disableObservedAddrManager) {
      _log.finer('IdentifyService.ownObservedAddrs: Observed address manager disabled, returning empty list.');
      return [];
    }
    final addrs = _observedAddrMgr!.addrs();
    _log.finer('IdentifyService.ownObservedAddrs: Returning ${addrs.length} observed addresses.');
    return addrs;
  }

  @override
  List<MultiAddr> observedAddrsFor(MultiAddr local) {
    if (disableObservedAddrManager) {
      _log.finer('IdentifyService.observedAddrsFor: Observed address manager disabled, returning empty list for local addr $local.');
      return [];
    }
    final addrs = _observedAddrMgr!.addrsFor(local);
    _log.finer('IdentifyService.observedAddrsFor: Returning ${addrs.length} observed addresses for local addr $local.');
    return addrs;
  }

  @override
  Future<void> close() async {
    _log.fine('IdentifyService.close: Closing identify service.');
    if (_closed) {
      _log.fine('IdentifyService.close: Already closed.');
      return;
    }
    
    // Signal shutdown to prevent new PUSH operations
    _shutdownInProgress = true;
    _log.fine('IdentifyService.close: Shutdown signal set, stopping new PUSH operations.');
    
    // Wait for active PUSH operations to complete or timeout
    final activePushFutures = <Future<void>>[];
    await _pushOperationsMutex.synchronized(() async {
      activePushFutures.addAll(_activePushOperations.values);
      _log.fine('IdentifyService.close: Found ${activePushFutures.length} active PUSH operations to wait for.');
    });
    
    if (activePushFutures.isNotEmpty) {
      _log.fine('IdentifyService.close: Waiting for ${activePushFutures.length} active PUSH operations to complete...');
      try {
        // Wait for all PUSH operations with a reasonable timeout
        await Future.wait(activePushFutures).timeout(const Duration(seconds: 5));
        _log.fine('IdentifyService.close: All active PUSH operations completed.');
      } catch (e) {
        _log.warning('IdentifyService.close: Some PUSH operations did not complete within timeout: $e');
        // Continue with shutdown - PUSH operations should handle their own cleanup
      }
    }
    
    _closed = true;
    
    if (!disableObservedAddrManager) {
      _log.finer('IdentifyService.close: Closing ObservedAddrManager and NATEmitter.');
      await _observedAddrMgr?.close(); // Use null-safe operator
      await _natEmitter?.close();    // Use null-safe operator
    }

    // Cancel event bus subscription
    if (_eventBusSubscription != null) {
      await _eventBusSubscription!.close(); // Changed cancel() to close()
      _eventBusSubscription = null;
      _log.fine('IdentifyService.close: Closed event bus subscription.');
    }

    // Close trigger push stream controller
    if (_triggerPushController != null) {
      await _triggerPushController!.close();
      _triggerPushController = null;
      _log.fine('IdentifyService.close: Closed triggerPush StreamController.');
    }

    _log.finer('IdentifyService.close: Completing _closedCompleter.');
    _closedCompleter.complete();
    await _closedCompleter.future;
    _log.fine('IdentifyService.close: Identify service closed.');
  }
}

/// Helper class for limiting concurrency
class Semaphore {
  final int _maxConcurrency;
  int _current = 0;
  final _queue = <Completer<void>>[];
  final _log = Logger('identify.semaphore'); // Specific logger for semaphore

  Semaphore(this._maxConcurrency);

  Future<void> acquire() async {
    _log.finest('Semaphore.acquire: Attempting to acquire. Current: $_current, Max: $_maxConcurrency, Queue: ${_queue.length}');
    if (_current < _maxConcurrency) {
      _current++;
      _log.finest('Semaphore.acquire: Acquired immediately. Current: $_current');
      return Future.value();
    }
    final completer = Completer<void>();
    _queue.add(completer);
    _log.finest('Semaphore.acquire: Queued. Current: $_current, Queue: ${_queue.length}');
    return completer.future;
  }

  void release() {
    _current--;
    _log.finest('Semaphore.release: Released. Current: $_current, Queue: ${_queue.length}');
    if (_queue.isNotEmpty) {
      final completer = _queue.removeAt(0);
      _current++;
      completer.complete();
      _log.finest('Semaphore.release: Dequeued and completed. Current: $_current');
    }
  }
}

/// Network notifiee for the identify service
class _NetNotifiee implements Notifiee {
  final IdentifyService _ids;
  final _log = Logger('identify.notifiee'); // Specific logger for notifiee

  _NetNotifiee(this._ids);

  @override
  Future<void> connected(Network network, Conn conn, {Duration? dialLatency}) async {
    final peerId = conn.remotePeer;
    _log.fine('[IDENTIFY-DIAG] Notifiee.connected: peer=$peerId connID=${conn.id} direction=${conn.stat.stats.direction} transport=${conn.state.transport} security=${conn.state.security} mux=${conn.state.streamMultiplexer}');
    await _ids._connsMutex.synchronized(() async {
      _log.finer('Identify.Notifiee.connected: Acquired _connsMutex for $peerId.');
      _ids._addConnWithLock(conn); // Ensure entry exists
      _log.finer('Identify.Notifiee.connected: Released _connsMutex for $peerId.');
    });

    // IDENTIFY PROTOCOL COORDINATION FIX:
    // Only the dialer (outbound connection initiator) should start identify protocol
    // to prevent bidirectional race conditions where both peers create identify streams simultaneously

    // Skip identify for relay connections. The inbound side's counter-identify
    // exchange fails (DATA frames don't arrive in time), causing a 30s timeout.
    // Relay connections are already Noise-authenticated, so identify is not required.
    final connTransport = conn.state.transport;
    final isRelayConn = connTransport == 'circuit-relay';
    if (isRelayConn) {
      _log.fine('[IDENTIFY-COORDINATION] Relay connection to $peerId (${conn.stat.stats.direction}) — skipping identify');
      // Mark identify as succeeded so identifyWait returns immediately
      await _ids._connsMutex.synchronized(() async {
        final entry = _ids._conns[conn];
        if (entry != null) {
          entry.identifySucceeded = true;
          if (entry.identifyWaitCompleter != null && !entry.identifyWaitCompleter!.isCompleted) {
            entry.identifyWaitCompleter!.complete();
          }
        }
      });
    } else if (conn.stat.stats.direction == Direction.outbound) {
      _log.fine('🔧 [IDENTIFY-COORDINATION] Outbound connection to $peerId. This peer is the DIALER - initiating identify protocol.');
      // Don't await here to avoid blocking the notifiee callback.
      // identifyWait itself handles its asynchronous nature.
      _ids.identifyWait(conn).catchError((e, st) {
        _log.warning('Identify.Notifiee.connected: identifyWait for outbound $peerId failed in background: $e\n$st');
        // Error is already handled and emitted by identifyWait/spawnIdentifyConn
      });
    } else {
      _log.fine('🔧 [IDENTIFY-COORDINATION] Inbound connection from $peerId. This peer is the LISTENER - waiting for remote to initiate identify protocol.');
      // Listener side: Do NOT initiate identify protocol
      // The remote dialer will initiate identify protocol and we'll handle it via handleIdentifyRequest()
    }
  }

  @override
  Future<void> disconnected(Network network, Conn conn) async {
    final peerId = conn.remotePeer;
    _log.fine('Identify.Notifiee.disconnected: Connection disconnected with $peerId. Conn ID: ${conn.id}');
    await _ids._connsMutex.synchronized( () async {
      _log.finer('Identify.Notifiee.disconnected: Acquired _connsMutex for $peerId.');
      final removedEntry = _ids._conns.remove(conn); // Removed await
      _log.finer('Identify.Notifiee.disconnected: Removed connection entry for $peerId (was present: ${removedEntry != null}). Released _connsMutex.');
    });

    if (!_ids.disableObservedAddrManager && _ids._observedAddrMgr != null) {
      _log.finer('Identify.Notifiee.disconnected: Removing conn ${conn.id} from ObservedAddrManager for $peerId.');
      _ids._observedAddrMgr!.removeConn(conn);
    }

    final connectedness = network.connectedness(peerId);
    _log.finer('Identify.Notifiee.disconnected: Current connectedness for $peerId: $connectedness.');
    switch (connectedness) {
      case Connectedness.connected:
      case Connectedness.limited:
        _log.finer('Identify.Notifiee.disconnected: Peer $peerId still connected/limited, no special addr processing.');
        return;
      default:
        _log.finer('Identify.Notifiee.disconnected: Peer $peerId not connected/limited. Processing addresses for recently disconnected.');
        break;
    }

    // Check if peer is protected (e.g., gossipsub mesh, DHT routing table, app services)
    // Protected peers should not have their addresses downgraded
    final isProtected = _ids.host.connManager.isProtected(peerId, '');
    if (isProtected) {
      _log.fine('Identify.Notifiee.disconnected: Peer $peerId is protected, preserving addresses at connectedAddrTTL');
      return;
    }

    final addrs = await _ids.host.peerStore.addrBook.addrs(peerId);
    _log.finer('Identify.Notifiee.disconnected: Found ${addrs.length} addresses for $peerId in peerstore.');
    var n = addrs.length;
    if (n > recentlyConnectedPeerMaxAddrs) {
      _log.finer('Identify.Notifiee.disconnected: Trimming addresses for $peerId from $n to $recentlyConnectedPeerMaxAddrs.');
      // Prioritize the address we were just disconnected from
      for (var i = 0; i < addrs.length; i++) {
        if (addrs[i].equals(conn.remoteMultiaddr)) {
          final temp = addrs[i];
          addrs[i] = addrs[0];
          addrs[0] = temp;
          _log.finer('Identify.Notifiee.disconnected: Prioritized disconnected addr ${conn.remoteMultiaddr} for $peerId.');
          break;
        }
      }
      n = recentlyConnectedPeerMaxAddrs;
    }
    _log.finer('Identify.Notifiee.disconnected: Updating address TTLs for $peerId.');
    await _ids.host.peerStore.addrBook.updateAddrs(peerId, ConnectedAddrTTL, TempAddrTTL);
    await _ids.host.peerStore.addrBook.addAddrs(peerId, addrs.sublist(0, n), RecentlyConnectedAddrTTL);
    await _ids.host.peerStore.addrBook.updateAddrs(peerId, TempAddrTTL, Duration.zero);
    _log.fine('Identify.Notifiee.disconnected: Address processing complete for $peerId.');
  }

  @override
  void listen(Network network, MultiAddr addr) {}
  @override
  void listenClose(Network network, MultiAddr addr) {}
}
