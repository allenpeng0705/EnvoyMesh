import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';

/// Wraps `connectivity_plus` so the rest of the app does not need
/// to know which platform channel to call.
///
/// - [onBecameOnline] fires on offline → online.
/// - [onNetworkTypeChanged] fires when Wi‑Fi ↔ cellular flips while online
///   (needed so reconnect reorders candidates instead of sticking to LAN).
abstract class ConnectivityObserver {
  /// Fires once per offline → online transition.
  Stream<void> get onBecameOnline;

  /// Fires when [isOnWifi] changes while the device stays online.
  Stream<void> get onNetworkTypeChanged;

  /// Begin observing. Must be called before streams are listened to
  /// (the streams will not emit anything if the device is already
  /// online at startup — that case is handled separately by the
  /// initial `loadPairedNodes` connect).
  Future<void> start();

  /// Cancel the underlying subscription and close the streams.
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
  final StreamController<void> _onlineController =
      StreamController<void>.broadcast();
  final StreamController<void> _typeController =
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
  Stream<void> get onBecameOnline => _onlineController.stream;

  @override
  Stream<void> get onNetworkTypeChanged => _typeController.stream;

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
    if (!_onlineController.isClosed) {
      await _onlineController.close();
    }
    if (!_typeController.isClosed) {
      await _typeController.close();
    }
  }

  void _onChange(List<ConnectivityResult> results) {
    final online = _isOnline(results);
    if (online && !_wasOnline) {
      if (!_onlineController.isClosed) _onlineController.add(null);
    }
    final nextWifi = _checkIsOnWifi(results);
    if (online &&
        _wasOnline &&
        _isOnWifi != null &&
        nextWifi != _isOnWifi) {
      if (!_typeController.isClosed) _typeController.add(null);
    }
    _wasOnline = online;
    _isOnWifi = nextWifi;
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
