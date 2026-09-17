/// Package pstoremanager provides a manager for the peerstore that removes
/// peers that have disconnected and haven't reconnected within a grace period.
///
/// This is a port of the Go implementation from go-libp2p/p2p/host/pstoremanager/pstoremanager.go
/// to Dart, using native Dart idioms.

import 'dart:async';

import 'package:dart_libp2p/core/event/bus.dart';
import 'package:dart_libp2p/core/network/network.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/peerstore.dart';
import 'package:logging/logging.dart';

final _log = Logger('pstoremanager');

/// A function that configures a PeerstoreManager.
typedef Option = Function(PeerstoreManager);

/// WithGracePeriod sets the grace period.
/// If a peer doesn't reconnect during the grace period, its data is removed.
/// Default: 1 minute.
Option withGracePeriod(Duration period) {
  return (PeerstoreManager m) {
    m._gracePeriod = period;
    return;
  };
}

/// WithCleanupInterval set the clean up interval.
/// During a clean up run peers that disconnected before the grace period are removed.
/// If unset, the interval is set to half the grace period.
Option withCleanupInterval(Duration interval) {
  return (PeerstoreManager m) {
    m._cleanupInterval = interval;
    return;
  };
}

/// PeerstoreManager manages the peerstore by removing peers that have disconnected
/// and haven't reconnected within a grace period.
class PeerstoreManager {
  final Peerstore _pstore;
  final EventBus _eventBus;
  final Network _network;

  Duration _gracePeriod;
  Duration? _cleanupInterval;

  StreamSubscription<dynamic>? _subscription;
  Timer? _timer;
  final Map<PeerId, DateTime> _disconnected = {};
  final _lock = Completer<void>();
  bool _closed = false;

  /// Creates a new PeerstoreManager.
  PeerstoreManager(this._pstore, this._eventBus, this._network, {List<Option>? opts})
      : _gracePeriod = Duration(minutes: 1) {
    if (opts != null) {
      for (var opt in opts) {
        opt(this);
      }
    }
    _cleanupInterval ??= _gracePeriod ~/ 2;
  }

  /// Starts the PeerstoreManager.
  Future<void> start() async {
    if (_closed) {
      throw StateError('PeerstoreManager is closed');
    }

    try {
      final sub = await _eventBus.subscribe(EvtPeerConnectednessChanged);
      _subscription = sub.stream.listen(_handleConnectChangeEvent);
      _timer = Timer.periodic(_cleanupInterval ?? Duration(minutes: 5), _cleanup);
    } catch (e) {
      _log.warning('Subscription failed. Peerstore manager not activated. Error: $e');
    }
  }

  void _handleConnectChangeEvent(dynamic event) {
    if (!(event is EvtPeerConnectednessChanged)){
      return;
    }

    final peerId = event.peer;
    switch (event.connectedness) {
      case Connectedness.connected:
      case Connectedness.canConnect:
        // If we reconnect to the peer before we've cleared the information,
        // keep it. This is an optimization to keep the disconnected map
        // small. We still need to check that a peer is actually
        // disconnected before removing it from the peer store.
        _disconnected.remove(peerId);
        break;
      default:
        if (!_disconnected.containsKey(peerId)) {
          _disconnected[peerId] = DateTime.now();
        }
        break;
    }
  }

  void _cleanup(Timer timer) {
    final now = DateTime.now();
    final toRemove = <PeerId>[];

    for (var entry in _disconnected.entries) {
      final peerId = entry.key;
      final disconnectTime = entry.value;

      if (disconnectTime.add(_gracePeriod).isBefore(now)) {
        // Check that the peer is actually not connected at this point.
        // This avoids a race condition where the Connected notification
        // is processed after this time has fired.
        // Note: In Go, there's a Connectedness method on the network interface,
        // but in Dart we need to check the connections list.
        bool isConnected = _network.conns.any((conn) => conn.remotePeer == peerId);
        if (!isConnected) {
          _pstore.removePeer(peerId);
          toRemove.add(peerId);
        }
      }
    }

    for (var peerId in toRemove) {
      _disconnected.remove(peerId);
    }
  }

  /// Closes the PeerstoreManager.
  Future<void> close() async {
    if (_closed) return;
    _closed = true;

    await _subscription?.cancel();
    _timer?.cancel();

    // Remove all disconnected peers
    for (var peerId in _disconnected.keys) {
      await _pstore.removePeer(peerId);
    }
    _disconnected.clear();

    if (!_lock.isCompleted) {
      _lock.complete();
    }
  }
}
