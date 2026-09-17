// Copyright (c) 2022 The dart-libp2p Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

import 'dart:async';
import 'dart:typed_data';

import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/context.dart';
import 'package:dart_libp2p/core/network/stream.dart' show P2PStream; // Explicit import for P2PStream
import 'package:dart_libp2p/p2p/protocol/circuitv2/client/client.dart';
import 'package:dart_libp2p/p2p/protocol/circuitv2/pb/circuit.pb.dart' as pb; // Alias for protobuf messages
import 'package:dart_libp2p/p2p/protocol/circuitv2/proto.dart';
import 'package:dart_libp2p/p2p/protocol/circuitv2/util/io.dart';
import 'package:dart_libp2p/p2p/protocol/circuitv2/util/buffered_reader.dart';

const Duration reserveTimeout = Duration(minutes: 1);

// Custom error class for reservation failures
class ReservationError implements Exception {
  final pb.Status status; // Ensure pb.Status is correctly imported/aliased
  final String reason;
  final Exception? cause;

  ReservationError({required this.status, required this.reason, this.cause});

  @override
  String toString() {
    return 'ReservationError: status: ${status.name}, reason: $reason${cause != null ? ', cause: $cause' : ''}';
  }
}

/// Extension methods for the CircuitV2Client class to handle reservations.
extension ReservationExtension on CircuitV2Client { // Changed from Client to CircuitV2Client
  /// Reserves a slot on a relay.
  Future<Reservation> reserve(PeerId relayPeerId) async {
    // Notify metrics observer that reservation is starting
    final reservationStartTime = DateTime.now();
    metricsObserver?.onReservationRequested(relayPeerId, reservationStartTime);
    
    try {
      // Open a stream to the relay using Hop protocol
      // 'this.host' or simply 'host' refers to the host field of CircuitV2Client
      final stream = await host.newStream(relayPeerId, [CircuitV2Protocol.protoIDv2Hop], Context());

      // Set deadline for the entire operation, including stream opening, write, and read.
      // Dart's newStream doesn't have a per-operation deadline like Go's s.SetDeadline.
      // We'll rely on the timeout for the Future.
      final reservation = await _reserveStream(stream, relayPeerId).timeout(reserveTimeout, onTimeout: () {
        stream.close(); // Ensure stream is closed on timeout
        throw ReservationError(status: pb.Status.CONNECTION_FAILED, reason: 'reservation timed out');
      });
      
      // Notify metrics observer of successful reservation
      final reservationCompleteTime = DateTime.now();
      final reservationDuration = reservationCompleteTime.difference(reservationStartTime);
      metricsObserver?.onReservationCompleted(
        relayPeerId,
        reservationStartTime,
        reservationCompleteTime,
        reservationDuration,
        true,
        null,
      );
      
      return reservation;
    } catch (e) {
      // Notify metrics observer of failed reservation
      final reservationCompleteTime = DateTime.now();
      final reservationDuration = reservationCompleteTime.difference(reservationStartTime);
      metricsObserver?.onReservationCompleted(
        relayPeerId,
        reservationStartTime,
        reservationCompleteTime,
        reservationDuration,
        false,
        e.toString(),
      );
      rethrow;
    }
  }

  Future<Reservation> _reserveStream(P2PStream stream, PeerId relayPeerId) async {
    // 'host' is accessible here as 'this.host' from the CircuitV2Client instance
    try {
      // Create a completer to track when the async write completes
      final writeCompleter = Completer<void>();
      final writer = StreamSinkFromP2PStream(stream, writeCompleter);
      final bufferedReader = BufferedP2PStreamReader(stream);

      // Create a reserve message
      final requestMsg = pb.HopMessage()..type = pb.HopMessage_Type.RESERVE;

      // Write the message
      writeDelimitedMessage(writer, requestMsg);
      
      // CRITICAL: Wait for the write to complete before reading the response.
      // Without this, there's a race condition where we try to read before
      // the RESERVE message is fully transmitted, causing iOS to fail consistently.
      await writeCompleter.future;

      // Read the response using manual reading (instead of DelimitedReader)
      final responseLength = await bufferedReader.readVarint();
      if (responseLength > 4096) {
        throw Exception('RESERVE response message too large: $responseLength bytes');
      }
      final responseBytes = await bufferedReader.readExact(responseLength);
      final responseMsg = pb.HopMessage.fromBuffer(responseBytes);
      
      
      // Log any remaining buffered data (should not happen for reservations)
      final remainingBytes = bufferedReader.remainingBuffer;
      if (remainingBytes.isNotEmpty) {
      }

      if (responseMsg.type != pb.HopMessage_Type.STATUS) {
        throw ReservationError(
            status: pb.Status.MALFORMED_MESSAGE,
            reason: 'unexpected relay response: not a status message (${responseMsg.type})');
      }

      if (responseMsg.status != pb.Status.OK) {
        throw ReservationError(status: responseMsg.status, reason: 'reservation failed with status ${responseMsg.status.name}');
      }

      if (!responseMsg.hasReservation()) {
        throw ReservationError(status: pb.Status.MALFORMED_MESSAGE, reason: 'missing reservation info in response');
      }

      final rsvpData = responseMsg.reservation;
      final int expireInSeconds = rsvpData.expire.toInt();
      final expiration = DateTime.fromMillisecondsSinceEpoch(expireInSeconds * 1000);

      if (expiration.isBefore(DateTime.now())) {
        throw ReservationError(
            status: pb.Status.MALFORMED_MESSAGE,
            reason: 'received reservation with expiration date in the past: $expiration');
      }

      final addrs = <MultiAddr>[];
      for (final addrBytes in rsvpData.addrs) {
        try {
          final addr = MultiAddr.fromBytes(Uint8List.fromList(addrBytes));
          addrs.add(addr);
        } catch (e) {
        }
      }

      Uint8List? voucherBytes;
      if (rsvpData.hasVoucher()) {
        voucherBytes = Uint8List.fromList(rsvpData.voucher);
        // TODO: Implement voucher parsing and validation (record.ConsumeEnvelope equivalent)
        // For now, we store the raw voucher bytes.
      }
      
      Duration? limitDuration;
      BigInt? limitData;
      if (responseMsg.hasLimit()) {
        final limitPb = responseMsg.limit;
        if (limitPb.hasDuration()) {
          limitDuration = Duration(seconds: limitPb.duration);
        }
        if (limitPb.hasData()) {
          limitData = BigInt.from(limitPb.data.toInt());
        }
      }

      return Reservation(
        expiration,
        addrs,
        voucherBytes,
        limitDuration: limitDuration,
        limitData: limitData,
      );
    } catch (e) {
      // stream.reset(); // P2PStream might not have reset, close is more common.
      if (e is ReservationError) {
        rethrow;
      }
      throw ReservationError(status: pb.Status.CONNECTION_FAILED, reason: 'error during reservation stream handling', cause: e is Exception ? e : Exception(e.toString()));
    } finally {
      // Close the stream
      await stream.close();
    }
  }
}

/// Helper class to adapt P2PStream to a Sink<List<int>> for writeDelimitedMessage.
/// Tracks write completion via an optional Completer to ensure the async write
/// finishes before the caller proceeds (e.g., before reading the response).
class StreamSinkFromP2PStream implements Sink<List<int>> {
  final P2PStream _stream;
  final Completer<void>? _writeCompleter;
  
  StreamSinkFromP2PStream(this._stream, [this._writeCompleter]);

  @override
  void add(List<int> data) {
    // P2PStream.write() is async, so we need to track completion
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
    // Closing the sink doesn't necessarily close the underlying P2PStream here,
    // as the stream's lifecycle is managed by the reserve method.
    // If no writes were made and completer exists, complete it
    if (_writeCompleter != null && !_writeCompleter.isCompleted) {
      _writeCompleter.complete();
    }
  }
}


/// Represents a reservation on a relay.
class Reservation {
  /// The expiration time of the reservation.
  final DateTime expire;

  /// The addresses of the relay.
  final List<MultiAddr> addrs;

  /// The raw reservation voucher bytes.
  final Uint8List? voucher;

  /// LimitDuration is the time limit for which the relay will keep a relayed connection open.
  /// If null or zero duration, there is no limit.
  final Duration? limitDuration;

  /// LimitData is the number of bytes that the relay will relay in each direction before
  /// resetting a relayed connection. If null, there is no limit.
  final BigInt? limitData;


  /// Creates a new reservation.
  Reservation(this.expire, this.addrs, this.voucher, {this.limitDuration, this.limitData});
}
