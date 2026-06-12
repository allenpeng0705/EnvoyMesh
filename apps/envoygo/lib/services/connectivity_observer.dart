import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';

/// Wraps `connectivity_plus` so the rest of the app does not need
/// to know which platform channel to call. Exposes a single
/// `onBecameOnline` stream that fires **only on the offline →
/// online edge**, ignoring noisy transitions like WiFi ↔ 5G that
/// the inner [HomeRemoteClient] reconnect loop already handles.
///
/// The observer is constructed once at app start and disposed
/// when the last paired node is unpaired. The
/// [ReconnectSupervisor] subscribes to it and calls its own
/// `kick()` on each emission.
abstract class ConnectivityObserver {
  /// Fires once per offline → online transition.
  Stream<void> get onBecameOnline;

  /// Begin observing. Must be called before [onBecameOnline] is
  /// listened to (the stream will not emit anything if the device
  /// is already online at startup — that case is handled
  /// separately by the initial `loadPairedNodes` connect).
  Future<void> start();

  /// Cancel the underlying subscription and close the stream.
  /// Idempotent.
  Future<void> dispose();

  /// True when the device is connected via WiFi.
  /// False when on mobile data or disconnected.
  /// Returns null if the network type is unknown (e.g. before
  /// the first connectivity check completes).
  bool? get isOnWifi;
}

/// Production implementation backed by `connectivity_plus`.
class RealConnectivityObserver implements ConnectivityObserver {
  final Connectivity _connectivity;
  final StreamController<void> _controller =
      StreamController<void>.broadcast();
  StreamSubscription<List<ConnectivityResult>>? _sub;
  bool _wasOnline = false;
  bool _started = false;

  /// True when the device is connected via WiFi.
  /// Null before the first connectivity check completes.
  bool? _isOnWifi;

  RealConnectivityObserver({Connectivity? connectivity})
      : _connectivity = connectivity ?? Connectivity();

  @override
  Stream<void> get onBecameOnline => _controller.stream;

  @override
  bool? get isOnWifi => _isOnWifi;

  @override
  Future<void> start() async {
    if (_started) return;
    _started = true;
    try {
      final initial = await _connectivity.checkConnectivity();
      _wasOnline = _isOnline(initial);
      _isOnWifi = _checkIsOnWifi(initial);
    } catch (_) {
      // If the platform channel isn't ready (rare — typically only
      // on web), assume online so we don't miss the first edge.
      _wasOnline = true;
    }
    _sub = _connectivity.onConnectivityChanged.listen(_onChange);
  }

  @override
  Future<void> dispose() async {
    await _sub?.cancel();
    _sub = null;
    if (!_controller.isClosed) {
      await _controller.close();
    }
  }

  void _onChange(List<ConnectivityResult> results) {
    final online = _isOnline(results);
    if (online && !_wasOnline) {
      if (!_controller.isClosed) _controller.add(null);
    }
    _wasOnline = online;
    _isOnWifi = _checkIsOnWifi(results);
  }

  static bool _isOnline(List<ConnectivityResult> results) {
    if (results.isEmpty) return false;
    return results.any((r) => r != ConnectivityResult.none);
  }

  /// Returns true if any result indicates WiFi.
  static bool _checkIsOnWifi(List<ConnectivityResult> results) {
    return results.any((r) => r == ConnectivityResult.wifi);
  }
}
