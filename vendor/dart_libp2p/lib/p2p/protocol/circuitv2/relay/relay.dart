// Copyright (c) 2022 The dart-libp2p Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/p2p/protocol/circuitv2/pb/circuit.pb.dart';
import 'package:dart_libp2p/p2p/protocol/circuitv2/proto.dart';
import 'package:dart_libp2p/p2p/protocol/circuitv2/relay/resources.dart';
import 'package:dart_libp2p/p2p/protocol/circuitv2/util/io.dart';
import 'package:dart_libp2p/p2p/protocol/circuitv2/util/buffered_reader.dart';
import 'package:dart_libp2p/p2p/protocol/circuitv2/util/prepended_stream.dart';
import 'package:dart_libp2p/p2p/protocol/circuitv2/util/pbconv.dart';
import 'package:dart_libp2p/p2p/protocol/circuitv2/voucher.dart';
import 'package:dart_libp2p/p2p/protocol/multistream/client.dart'; // For encodeVarint
import 'package:dart_libp2p/core/network/network.dart' show Connectedness, EvtPeerConnectednessChanged;
import 'package:fixnum/fixnum.dart';
import 'package:logging/logging.dart';
import 'package:meta/meta.dart';

import '../../../../core/host/host.dart';
import '../../../../core/network/stream.dart';
import '../../../../core/network/context.dart';
import '../../../../core/multiaddr.dart';
import '../../../discovery/peer_info.dart';
import 'relay_metrics_observer.dart';

final _log = Logger('Relay');

/// Relay implements the relay service for the p2p-circuit/v2 protocol.
class Relay {
  final Host _host;
  final Resources _resources;
  final Map<String, DateTime> _reservations = {};
  final Map<String, int> _connections = {};
  final Map<String, String?> _sessionIds = {}; // Store session IDs for active connections
  Timer? _gcTimer;
  bool _closed = false;
  StreamSubscription? _peerDisconnectSub;

  /// Optional metrics observer for tracking relay server operations
  RelayServerMetricsObserver? metricsObserver;

  /// Creates a new relay service.
  Relay(this._host, this._resources);

  /// Starts the relay service.
  void start() {
    _host.setStreamHandler(CircuitV2Protocol.protoIDv2Hop, (stream, remotePeer) => _handleStream(stream));
    _startGarbageCollection();
    _startPeerDisconnectMonitor();
  }

  /// Closes the relay service.
  Future<void> close() async {
    if (_closed) return;
    _closed = true;
    _host.removeStreamHandler(CircuitV2Protocol.protoIDv2Hop);
    _gcTimer?.cancel();
    await _peerDisconnectSub?.cancel();
  }

  /// Handles incoming streams for the relay protocol.
  Future<void> _handleStream(P2PStream stream) async {
    try {
      // Read the length-delimited message (client sends with length prefix)
      // CRITICAL: Use manual reading to preserve any data that follows the HopMessage
      final bufferedReader = BufferedP2PStreamReader(stream);
      
      // Read length-delimited message manually (instead of using DelimitedReader)
      final messageLength = await bufferedReader.readVarint();
      if (messageLength > 4096) {
        throw Exception('HopMessage too large: $messageLength bytes');
      }
      final messageBytes = await bufferedReader.readExact(messageLength);
      final pb = HopMessage.fromBuffer(messageBytes);
      
      
      // CRITICAL FIX: If client sent extra data with HopMessage, prepend it to the stream
      final remainingBytes = bufferedReader.remainingBuffer;
      final P2PStream finalStream;
      
      if (remainingBytes.isNotEmpty) {
        finalStream = PrependedStream(stream, remainingBytes);
      } else {
        finalStream = stream;
      }

      // Handle the message based on its type
      switch (pb.type) {
        case HopMessage_Type.RESERVE:
          await _handleReserve(finalStream, pb);
          break;
        case HopMessage_Type.CONNECT:
          await _handleConnect(finalStream, pb);
          break;
        default:
          await _writeResponse(finalStream, Status.UNEXPECTED_MESSAGE);
          try {
            await finalStream.close();
          } catch (closeError) {
          }
      }
    } catch (e, stackTrace) {
      try {
        await _writeResponse(stream, Status.MALFORMED_MESSAGE);
        await stream.close();
      } catch (closeError) {
      }
    }
  }

  /// Handles a reservation request.
  Future<void> _handleReserve(P2PStream stream, HopMessage msg) async {
    // For RESERVE requests, the peer making the reservation is the remote peer of the stream
    final peerId = stream.conn.remotePeer;
    
    metricsObserver?.onReservationRequested(peerId);
    
    // Check if we have resources for a new reservation
    if (!_resources.canReserve(peerId)) {
      metricsObserver?.onReservationDenied(peerId, 'resource_limit_exceeded');
      metricsObserver?.onResourceLimitExceeded(peerId, 'reservation');
      await _writeResponse(stream, Status.RESOURCE_LIMIT_EXCEEDED);
      return;
    }

    // Create a reservation
    final expire = DateTime.now().add(Duration(seconds: _resources.reservationTtl));
    _reservations[peerId.toString()] = expire;
    
    metricsObserver?.onReservationGranted(peerId, expire);

    // Create a reservation voucher
    final voucher = ReservationVoucherData(
      relay: _host.id,
      peer: peerId,
      expiration: expire,
    );

    // Create a reservation message
    final reservation = Reservation()
      ..expire = Int64(expire.millisecondsSinceEpoch ~/ 1000)
      ..addrs.addAll(
          _host.addrs
              .where((addr) => !addr.toString().contains('/p2p-circuit'))  // ← Filter!
              .map((addr) => addr.toBytes())
      )
      ..voucher = voucher.marshalRecord();

  // Create a limit message
  final limit = Limit()
    ..duration = _resources.connectionDuration
    ..data = Int64(_resources.connectionData);

  // Write the response (length-delimited)
  final response = HopMessage()
    ..type = HopMessage_Type.STATUS
    ..status = Status.OK
    ..reservation = reservation
    ..limit = limit;
  
  // Write the message with a custom writer that tracks the write operation
  final writeCompleter = Completer<void>();
  final writer = StreamSinkFromP2PStream(stream, writeCompleter);
  writeDelimitedMessage(writer, response);
  
  // Wait for the write to complete before returning
  await writeCompleter.future;
  
  // Add a small delay to ensure the data is transmitted
  await Future.delayed(Duration(milliseconds: 50));
}

  /// Handles a connection request.
  Future<void> _handleConnect(P2PStream stream, HopMessage msg) async {
    // The SOURCE peer is the one who opened this HOP stream (the peer dialing)
    final srcPeerId = stream.conn.remotePeer;
    
    // Extract diagnostic session ID if present
    final sessionId = msg.hasDiagnosticSessionId()
        ? utf8.decode(msg.diagnosticSessionId)
        : null;
    
    // Check rate limiting for HOP requests from this peer
    if (!_resources.canMakeHopRequest(srcPeerId)) {
      metricsObserver?.onResourceLimitExceeded(srcPeerId, 'hop_request_rate');
      await _writeResponse(stream, Status.RESOURCE_LIMIT_EXCEEDED);
      return;
    }
    
    // The DESTINATION peer is in msg.peer (the peer being dialed)
    if (!msg.hasPeer()) {
      await _writeResponse(stream, Status.MALFORMED_MESSAGE);
      return;
    }
    
    final dstInfo = peerToPeerInfoV2(msg.peer);
    if (dstInfo.peerId.toString().isEmpty) {
      await _writeResponse(stream, Status.MALFORMED_MESSAGE);
      return;
    }
    
    metricsObserver?.onRelayConnectRequested(srcPeerId, dstInfo.peerId, sessionId: sessionId);

    // Check if the DESTINATION peer has a reservation
    // (the peer being dialed TO needs the reservation, not the one dialing FROM)
    final reservation = _reservations[dstInfo.peerId.toString()];
    if (reservation == null || reservation.isBefore(DateTime.now())) {
      metricsObserver?.onRelayConnectFailed(srcPeerId, dstInfo.peerId, 'no_reservation', sessionId: sessionId);
      await _writeResponse(stream, Status.NO_RESERVATION);
      return;
    }

    // Note: We do NOT pre-check connectedness here anymore. Even if a peer
    // appears "notConnected", it might be in the middle of connecting/upgrading.
    // The actual STOP stream creation below will naturally fail if the peer
    // is truly unreachable, giving a more accurate error. This prevents race
    // conditions where we reject valid relay requests just because the
    // destination is still completing its connection handshake.
    // Having a reservation is sufficient proof that the peer intends to be reachable.

    // Check if we have resources for a new connection
    if (!_resources.canConnect(srcPeerId, dstInfo.peerId)) {
      metricsObserver?.onRelayConnectFailed(srcPeerId, dstInfo.peerId, 'resource_limit_exceeded', sessionId: sessionId);
      metricsObserver?.onResourceLimitExceeded(srcPeerId, 'connection');
      await _writeResponse(stream, Status.RESOURCE_LIMIT_EXCEEDED);
      return;
    }

    try {
      // Open a STOP stream to the destination peer
      // Host.newStream() will:
      // 1. Check for existing connection (via connect())
      // 2. Create stream on that connection (via network.newStream())  
      // 3. Wait for identify
      // 4. Negotiate protocol
      // 5. Register protocol in peerstore
      final dstStream = await _host.newStream(
        dstInfo.peerId, 
        [CircuitV2Protocol.protoIDv2Stop], 
        Context()
      );
      
      // Set handshake deadline for the STOP protocol handshake messages
      // This gives enough time for the STOP handshake to complete
      await dstStream.setDeadline(DateTime.now().add(Duration(minutes: 1)));

      // Create a stop message with SOURCE peer info
      final stopMsg = StopMessage()
        ..type = StopMessage_Type.CONNECT
        ..peer = peerInfoToPeerV2(PeerInfo(peerId: srcPeerId, addrs: <MultiAddr>[].toSet()));
      
      // Forward session ID to destination if present
      if (sessionId != null) {
        stopMsg.diagnosticSessionId = utf8.encode(sessionId);
      }

      // Write the message with length prefix (required for DelimitedReader on the receiving end)
      // We write manually to ensure both the length and message are sent before reading response
      final messageBytes = stopMsg.writeToBuffer();
      final lengthBytes = encodeVarint(messageBytes.length);
      await dstStream.write(lengthBytes);
      await dstStream.write(messageBytes);
      // Flush the stream to ensure data is sent immediately
      if (dstStream is Sink) {
        // Most streams don't have a flush method, so we can't call it
        // The write should already flush automatically
      }

      // Read the response (destination sends with length prefix)
      // CRITICAL: Use manual reading to preserve any data that follows the STOP message
      final bufferedReader = BufferedP2PStreamReader(dstStream);
      
      // Read length-delimited message manually (instead of using DelimitedReader)
      final responseLength = await bufferedReader.readVarint();
      if (responseLength > 4096) {
        throw Exception('STOP message too large: $responseLength bytes');
      }
      final responseBytes = await bufferedReader.readExact(responseLength);
      final pb = StopMessage.fromBuffer(responseBytes);
      

      // Check the status
      if (pb.status != Status.OK) {
        metricsObserver?.onRelayConnectFailed(srcPeerId, dstInfo.peerId, 'stop_handshake_failed');
        await _writeResponse(stream, Status.CONNECTION_FAILED);
        await dstStream.close();
        return;
      }
      
      metricsObserver?.onRelayConnectEstablished(srcPeerId, dstInfo.peerId, sessionId: sessionId);
      
      // CRITICAL FIX: Forward any buffered data that was read along with STOP message
      // This prevents data loss when relay data immediately follows handshake
      final remainingBytes = bufferedReader.remainingBuffer;
      if (remainingBytes.isNotEmpty) {
        try {
          await stream.write(remainingBytes);
        } catch (e) {
        }
      }

      // Write the response to the source
      await _writeResponse(stream, Status.OK);

      // Clear stream deadlines to allow unlimited relay time (like go-libp2p)
      // This prevents yamux read timeouts from closing the relay connection prematurely
      await stream.setDeadline(null);
      await dstStream.setDeadline(null);

      // Add the connection to the active connections
      final connKey = '${srcPeerId}-${dstInfo.peerId}';
      final currentCount = _connections[connKey] ?? 0;
      _connections[connKey] = currentCount + 1;
      
      // Store session ID for this connection
      _sessionIds[connKey] = sessionId;
      
      if (currentCount > 0) {
      }

      // Relay data between the peers
      _relayData(stream, dstStream, srcPeerId, dstInfo.peerId);
    } catch (e) {
      metricsObserver?.onRelayConnectFailed(srcPeerId, dstInfo.peerId, 'connection_error: $e', sessionId: sessionId);
      await _writeResponse(stream, Status.CONNECTION_FAILED);
    }
  }

  /// Relays data between two peers.
  @visibleForTesting
  void relayDataForTesting(
    P2PStream srcStream,
    P2PStream dstStream,
    PeerId srcPeer,
    PeerId dstPeer,
  ) {
    _relayData(srcStream, dstStream, srcPeer, dstPeer);
  }

  /// Relays data between two peers (internal).
  /// Implements bidirectional relay with proper EOF propagation and error handling.
  void _relayData(
    P2PStream srcStream,
    P2PStream dstStream,
    PeerId srcPeer,
    PeerId dstPeer,
  ) {
    final connKey = '${srcPeer}-${dstPeer}';
    final sessionId = _sessionIds[connKey]; // Retrieve session ID for this connection
    var cleanupDone = false;
    
    // Shared flag to track if either direction has encountered a fatal error
    // and requested termination of the relay
    var relayTerminated = false;
    
    // Bandwidth and duration tracking
    int totalBytesRelayed = 0;
    final maxBytes = _resources.connectionData;
    final startTime = DateTime.now();
    final maxDuration = Duration(seconds: _resources.connectionDuration);
    
    // Track initial connection establishment for metrics
    final relayStartTime = DateTime.now();

    // Idempotent cleanup function
    // Note: We do NOT close streams here - each direction closes its own write side via closeWrite()
    // and the streams will naturally close when both directions complete. Closing streams here
    // causes the other direction's blocking read() to fail with "stream closed" error.
    void cleanup() {
      if (cleanupDone) return;
      cleanupDone = true;
      
      // Update connection count
      final count = _connections[connKey] ?? 0;
      if (count <= 1) {
        _connections.remove(connKey);
        _sessionIds.remove(connKey); // Clean up session ID
      } else {
        _connections[connKey] = count - 1;
      }
      
      // Notify metrics observer
      final duration = DateTime.now().difference(relayStartTime);
      metricsObserver?.onRelayConnectionClosed(srcPeer, dstPeer, duration, totalBytesRelayed, sessionId: sessionId);
      
    }

    // Relay data from source to destination
    Future<void> relaySourceToDest() async {
      try {
        int bytesRelayed = 0;
        while (!relayTerminated) {
          // Check resource limits before reading more data
          if (totalBytesRelayed >= maxBytes) {
            relayTerminated = true;
            // Signal graceful termination
            await dstStream.closeWrite().catchError((e) {
            });
            break;
          }
          
          if (DateTime.now().difference(startTime) > maxDuration) {
            relayTerminated = true;
            // Signal graceful termination
            await dstStream.closeWrite().catchError((e) {
            });
            break;
          }
          
          final data = await srcStream.read();
          if (data.isEmpty) {
            // EOF received - propagate to destination via closeWrite
            await dstStream.closeWrite().catchError((e) {
            });
            break;
          }
          bytesRelayed += data.length;
          totalBytesRelayed += data.length;
          metricsObserver?.onBytesRelayed(srcPeer, dstPeer, data.length, sessionId: sessionId);
          await dstStream.write(data);
        }
      } catch (e) {
        // FIX: Only reset the streams involved in this direction's error
        // Don't immediately reset the other direction - let it complete gracefully
        // if possible. Only set the termination flag to signal the other direction
        // to stop after its current operation completes.
        relayTerminated = true;
        
        // Close our write side to signal EOF to the destination
        await dstStream.closeWrite().catchError((closeErr) {
        });
      } finally {
        cleanup();
      }
    }

    // Relay data from destination to source
    Future<void> relayDestToSource() async {
      try {
        int bytesRelayed = 0;
        while (!relayTerminated) {
          // Check resource limits before reading more data
          if (totalBytesRelayed >= maxBytes) {
            relayTerminated = true;
            // Signal graceful termination
            await srcStream.closeWrite().catchError((e) {
            });
            break;
          }
          
          if (DateTime.now().difference(startTime) > maxDuration) {
            relayTerminated = true;
            // Signal graceful termination
            await srcStream.closeWrite().catchError((e) {
            });
            break;
          }
          
          final data = await dstStream.read();
          if (data.isEmpty) {
            // EOF received - propagate to source via closeWrite
            await srcStream.closeWrite().catchError((e) {
            });
            break;
          }
          bytesRelayed += data.length;
          totalBytesRelayed += data.length;
          metricsObserver?.onBytesRelayed(srcPeer, dstPeer, data.length, sessionId: sessionId);
          await srcStream.write(data);
        }
      } catch (e) {
        // FIX: Only reset the streams involved in this direction's error
        // Don't immediately reset the other direction - let it complete gracefully
        // if possible. Only set the termination flag to signal the other direction
        // to stop after its current operation completes.
        relayTerminated = true;
        
        // Close our write side to signal EOF to the source
        await srcStream.closeWrite().catchError((closeErr) {
        });
      } finally {
        cleanup();
      }
    }

    // Start both relay tasks concurrently and wait for both to complete
    // before doing final stream cleanup
    Future<void> startRelay() async {
      await Future.wait([
        relaySourceToDest(),
        relayDestToSource(),
      ]);
      
      // Both directions completed - now it's safe to close any remaining open streams
      // This handles edge cases where closeWrite() didn't fully close the stream
      if (!srcStream.isClosed) {
        await srcStream.close().catchError((e) {
        });
      }
      if (!dstStream.isClosed) {
        await dstStream.close().catchError((e) {
        });
      }
    }
    
    // Start relay (fire and forget - errors are handled within each direction)
    startRelay().catchError((e) {
    });
  }

  /// Gracefully terminates a relay connection
  /// Signals EOF to both ends before closing streams
  Future<void> _terminateRelay(P2PStream srcStream, P2PStream dstStream, String reason) async {
    
    try {
      // Signal EOF to both ends gracefully via closeWrite
      await Future.wait([
        srcStream.closeWrite().catchError((e) {
        }),
        dstStream.closeWrite().catchError((e) {
        }),
      ]);
      
      // Give a brief moment for EOF to propagate
      await Future.delayed(Duration(milliseconds: 100));
      
      // Now fully close both streams
      await Future.wait([
        srcStream.close().catchError((e) {
        }),
        dstStream.close().catchError((e) {
        }),
      ]);
      
    } catch (e) {
    }
  }

  /// Writes a response with the given status.
  Future<void> _writeResponse(P2PStream stream, Status status) async {
    try {
      final response = HopMessage()
        ..type = HopMessage_Type.STATUS
        ..status = status;
      
      // Write with length prefix (required for DelimitedReader on the receiving end)
      final messageBytes = response.writeToBuffer();
      final lengthBytes = encodeVarint(messageBytes.length);
      await stream.write(lengthBytes);
      await stream.write(messageBytes);
    } catch (e) {
      // Don't rethrow - this is best-effort error reporting
    }
  }

  /// Starts the garbage collection timer.
  void _startGarbageCollection() {
    _gcTimer = Timer.periodic(Duration(minutes: 1), (_) {
      _gc();
    });
  }

  /// Monitors peer disconnections and removes reservations for disconnected peers.
  void _startPeerDisconnectMonitor() {
    try {
      final sub = _host.eventBus.subscribe(EvtPeerConnectednessChanged);
      _peerDisconnectSub = sub.stream.listen((event) {
        if (event is EvtPeerConnectednessChanged &&
            event.connectedness == Connectedness.notConnected) {
          final peerStr = event.peer.toString();
          final hadReservation = _reservations.remove(peerStr) != null;
          if (hadReservation) {
            _log.warning('[RELAY] Peer $peerStr disconnected — removed reservation. Remaining reservations: ${_reservations.length}');
            metricsObserver?.onReservationExpired(event.peer);
          }
        }
      });
    } catch (e) {
      _log.warning('[RELAY] Failed to subscribe to peer disconnection events: $e');
    }
  }

  /// Garbage collects expired reservations.
  void _gc() {
    final now = DateTime.now();
    final expired = <String>[];
    for (final entry in _reservations.entries) {
      if (entry.value.isBefore(now)) {
        expired.add(entry.key);
      }
    }
    for (final key in expired) {
      _reservations.remove(key);
      // Notify metrics observer of expiration
      try {
        final peerId = PeerId.decode(key);
        metricsObserver?.onReservationExpired(peerId);
      } catch (e) {
        // If we can't parse the peer ID, skip metrics notification
      }
    }
  }

  // Test helpers
  @visibleForTesting
  void addReservationForTesting(String peerId, DateTime expiration) {
    _reservations[peerId] = expiration;
  }

  @visibleForTesting
  bool hasReservation(String peerId) {
    return _reservations.containsKey(peerId) &&
        _reservations[peerId]!.isAfter(DateTime.now());
  }

  @visibleForTesting
  void addConnectionForTesting(String srcPeer, String dstPeer) {
    final connKey = '$srcPeer-$dstPeer';
    final currentCount = _connections[connKey] ?? 0;
    _connections[connKey] = currentCount + 1;
  }

  @visibleForTesting
  int getConnectionCount(String srcPeer, String dstPeer) {
    final connKey = '$srcPeer-$dstPeer';
    return _connections[connKey] ?? 0;
  }

  @visibleForTesting
  Map<String, DateTime> get reservationsForTesting => Map.unmodifiable(_reservations);

  @visibleForTesting
  Map<String, int> get connectionsForTesting => Map.unmodifiable(_connections);
}

/// Helper class to adapt P2PStream to a Sink<List<int>> for writeDelimitedMessage
class StreamSinkFromP2PStream implements Sink<List<int>> {
  final P2PStream _stream;
  final Completer<void>? _writeCompleter;
  
  StreamSinkFromP2PStream(this._stream, [this._writeCompleter]);

  @override
  void add(List<int> data) {
    // P2PStream.write() is async, so we need to await it
    // But Sink.add() is synchronous, so we schedule it and track completion
    _stream.write(Uint8List.fromList(data)).then((_) {
      // Write completed successfully
      if (_writeCompleter != null && !_writeCompleter.isCompleted) {
        _writeCompleter.complete();
      }
    }).catchError((error) {
      // Write failed
      if (_writeCompleter != null && !_writeCompleter.isCompleted) {
        _writeCompleter.completeError(error);
      }
    });
  }

  @override
  void close() {
    // Closing the sink doesn't necessarily close the underlying P2PStream
    // as the stream's lifecycle is managed by the caller
    
    // If no writes were made and completer exists, complete it
    if (_writeCompleter != null && !_writeCompleter.isCompleted) {
      _writeCompleter.complete();
    }
  }
}