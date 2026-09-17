/// Metrics implementation for the memory-based peerstore.

import 'dart:collection';

import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/peerstore.dart';
import 'package:synchronized/synchronized.dart';


/// The smoothing factor for the exponentially weighted moving average.
const latencyEWMASmoothing = 0.1;

/// A memory-based implementation of the Metrics interface.
class MemoryMetrics implements Metrics {
  final _latencyMap = HashMap<String, Duration>();
  final _lock = Lock();

  /// Creates a new memory-based metrics implementation.
  MemoryMetrics();

  @override
  Future<Duration> latencyEWMA(PeerId id) async {
    return await _lock.synchronized(() async {
      return _latencyMap[id.toString()] ?? Duration.zero;
    });
  }

  @override
  Future<void> recordLatency(PeerId id, Duration latency) async {
    await _lock.synchronized(() async {
      final key = id.toString();
      final oldLatency = _latencyMap[key] ?? Duration.zero;

      // Calculate the new exponentially weighted moving average
      final oldNanos = oldLatency.inMicroseconds;
      final newNanos = latency.inMicroseconds;
      final updatedNanos = (oldNanos * (1 - latencyEWMASmoothing) + newNanos * latencyEWMASmoothing).round();

      _latencyMap[key] = Duration(microseconds: updatedNanos);
    });
  }

  @override
  void removePeer(PeerId id) {
    // Using synchronous lock to match interface
    _lock.synchronized(() {
      _latencyMap.remove(id.toString());
    });
  }
}

/// Creates a new memory-based metrics implementation.
MemoryMetrics newMetrics() {
  return MemoryMetrics();
}
