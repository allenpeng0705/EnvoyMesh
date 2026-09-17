import 'dart:async';
import 'dart:math';
import 'dart:typed_data';

import 'package:logging/logging.dart';

import '../../../core/interfaces.dart';
import '../../../core/network/stream.dart';
import '../../../core/peer/peer_id.dart';

final _logger = Logger('ping');

/// Constants for the ping protocol
class PingConstants {
  static const int pingSize = 32;
  static const Duration pingTimeout = Duration(seconds: 10);
  static const Duration pingDuration = Duration(seconds: 30);
  static const String protocolId = '/ipfs/ping/1.0.0';
  static const String serviceName = 'libp2p.ping';
}

/// Result of a ping attempt, either an RTT or an error
class PingResult {
  final Duration? rtt;
  final Object? error;

  PingResult({this.rtt, this.error});

  bool get hasError => error != null;
}

/// Service that handles ping protocol functionality
class PingService {
  final Host host;

  PingService(this.host) {
    host.setStreamHandler(PingConstants.protocolId, _pingHandler);
  }

  /// Handles incoming ping requests
  Future<void> _pingHandler(P2PStream stream, PeerId peerId) async {
    _logger.fine('Ping handler started for peer ${peerId.toString()} on stream ${stream.id()}');
    
    try {
      stream.scope().setService(PingConstants.serviceName);
      stream.scope().reserveMemory(
        PingConstants.pingSize,
        ReservationPriority.always,
      );

      // Set deadline for the entire ping session
      await stream.setDeadline(DateTime.now().add(PingConstants.pingDuration));

      // Handle ping requests until stream is closed or EOF received
      while (!stream.isClosed) {
        try {
          // Read ping data from remote with timeout
          final pingData = await stream.read(PingConstants.pingSize);
          
          // Check for EOF (empty data means stream closed)
          if (pingData.isEmpty) {
            _logger.fine('Ping handler received EOF for peer ${peerId.toString()}, ending ping session');
            break;
          }
          
          // Validate ping data size
          if (pingData.length != PingConstants.pingSize) {
            _logger.warning('Ping handler received ${pingData.length} bytes, expected ${PingConstants.pingSize} for peer ${peerId.toString()}');
            // Still echo back what we received for compatibility
          }
          
          _logger.finest('Ping handler received ${pingData.length} bytes from peer ${peerId.toString()}');
          
          // Echo the data back (pong)
          await stream.write(pingData);
          _logger.finest('Ping handler sent ${pingData.length} bytes back to peer ${peerId.toString()}');
          
        } catch (e) {
          // Handle stream errors gracefully
          if (stream.isClosed) {
            _logger.fine('Ping handler: Stream closed during operation for peer ${peerId.toString()}');
            break;
          }
          
          // Check for specific error types that indicate normal stream closure
          final errorString = e.toString().toLowerCase();
          if (errorString.contains('stream closed') || 
              errorString.contains('stream is closed') ||
              errorString.contains('stream is not open') ||
              errorString.contains('eof') ||
              errorString.contains('connection closed')) {
            _logger.fine('Ping handler: Stream closed normally for peer ${peerId.toString()}: $e');
            break;
          }
          
          _logger.warning('Ping handler error for peer ${peerId.toString()}: $e');
          rethrow;
        }
      }
      
      _logger.fine('Ping handler completed normally for peer ${peerId.toString()}');
      
    } catch (e) {
      _logger.warning('Error in ping handler for peer ${peerId.toString()}: $e');
      // Only reset if stream is still open and it's not a normal closure
      if (!stream.isClosed) {
        final errorString = e.toString().toLowerCase();
        if (!errorString.contains('stream closed') && 
            !errorString.contains('stream is closed') &&
            !errorString.contains('eof')) {
          _logger.warning('Resetting stream due to unexpected error: $e');
          try {
            await stream.reset();
          } catch (resetError) {
            _logger.warning('Error resetting stream: $resetError');
          }
        }
      }
    } finally {
      // Clean up resources
      try {
        stream.scope().releaseMemory(PingConstants.pingSize);
      } catch (e) {
        _logger.warning('Error releasing memory in ping handler: $e');
      }
      
      // Ensure stream is closed gracefully
      if (!stream.isClosed) {
        try {
          await stream.close();
          _logger.fine('Ping handler closed stream for peer ${peerId.toString()}');
        } catch (e) {
          _logger.warning('Error closing stream in ping handler: $e');
        }
      }
    }
  }

  /// Initiates a ping to the specified peer
  Stream<PingResult> ping(PeerId peerId) {
    return pingStream(host, peerId);
  }
}

/// Initiates a ping to the specified peer
Stream<PingResult> pingStream(Host host, PeerId peerId) async* {
  _logger.warning('PingService.pingStream: Entered for peer ${peerId.toString()}');
  _logger.warning('PingService.pingStream: Calling host.newStream for peer ${peerId.toString()} with protocol ${PingConstants.protocolId}');
  final stream = await host.newStream(
    peerId,
    [PingConstants.protocolId],
    Context()
  );

  try {
    _logger.warning('PingService.pingStream: Returned from host.newStream for peer ${peerId.toString()}. Stream ID (if successful): ${stream.id}');
    stream.scope().setService(PingConstants.serviceName);

    final random = Random.secure();
    final seed = random.nextInt(1 << 32);
    final randomReader = Random(seed);

    while (true) {
      final result = await _ping(stream, randomReader);
      if (result.hasError) {
        yield result;
        break;
      }

      if (result.rtt != null) {
        host.peerStore.metrics.recordLatency(peerId, result.rtt!);
      }

      yield result;
    }
  } catch (e) {
    yield PingResult(error: e);
  } finally {
    stream.reset();
  }
}

/// Performs a single ping operation
Future<PingResult> _ping(P2PStream stream, Random randomReader) async {
  try {
    stream.scope().reserveMemory(
      2 * PingConstants.pingSize,
      ReservationPriority.always,
    );

    final buffer = Uint8List(PingConstants.pingSize);
    for (var i = 0; i < buffer.length; i++) {
      buffer[i] = randomReader.nextInt(256);
    }

    final before = DateTime.now();
    try {
      await stream.write(buffer);
    } catch (e) {
      _logger.warning('[PING-DIAG] stream.write() FAILED after ${DateTime.now().difference(before).inMilliseconds}ms on stream ${stream.id()}: $e');
      rethrow;
    }
    final writeTime = DateTime.now().difference(before);

    try {
      final responseBuffer = await stream.read(PingConstants.pingSize);

      if (!_bytesEqual(buffer, responseBuffer)) {
        _logger.warning('[PING-DIAG] Ping data mismatch on stream ${stream.id()} after ${DateTime.now().difference(before).inMilliseconds}ms');
        return PingResult(error: 'ping packet was incorrect');
      }
    } catch (e) {
      _logger.warning('[PING-DIAG] stream.read() FAILED after ${DateTime.now().difference(before).inMilliseconds}ms (write took ${writeTime.inMilliseconds}ms) on stream ${stream.id()}: $e');
      rethrow;
    }

    return PingResult(rtt: DateTime.now().difference(before));
  } finally {
    stream.scope().releaseMemory(2 * PingConstants.pingSize);
  }
}

/// Compares two byte arrays for equality
bool _bytesEqual(Uint8List a, Uint8List b) {
  if (a.length != b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i] != b[i]) return false;
  }
  return true;
}
