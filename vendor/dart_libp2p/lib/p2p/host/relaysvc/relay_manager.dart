// Copyright (c) 2024 The dart-libp2p Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

import 'dart:async';
import 'package:synchronized/synchronized.dart';
import 'package:logging/logging.dart';

import 'package:dart_libp2p/core/host/host.dart';
import 'package:dart_libp2p/core/event/bus.dart';
import 'package:dart_libp2p/core/event/reachability.dart';
import 'package:dart_libp2p/core/network/network.dart'; // For Reachability enum
import 'package:dart_libp2p/p2p/protocol/circuitv2/relay/relay.dart';
import 'package:dart_libp2p/p2p/protocol/circuitv2/relay/resources.dart';

/// RelayManager monitors the host's reachability and manages a Circuit Relay v2 service.
/// If the host becomes publicly reachable, it starts the relay service.
/// If the host is not publicly reachable, it stops the service.
class RelayManager {
  final Host _host;
  final Resources _relayResourcesConfig; // Configuration for the Relay service

  Relay? _activeRelay; // The managed instance of the Relay service
  final Lock _lock = Lock();
  Subscription? _eventBusSubscription; // To hold the subscription object from EventBus
  StreamSubscription<dynamic>? _reachabilityStreamSubscription; // To hold the listener on the stream
  bool _isClosed = false;
  Completer<void>? _backgroundCompleter;

  static final _log = Logger('RelayManager');
  
  /// Returns the active relay service instance, if running
  Relay? get activeRelay => _activeRelay;

  /// Private constructor for RelayManager.
  RelayManager._(this._host, this._relayResourcesConfig);

  /// Creates and initializes a new RelayManager.
  ///
  /// The manager will listen for reachability changes and start/stop the
  /// underlying Circuit Relay v2 service accordingly.
  ///
  /// [host] is the libp2p host instance.
  /// Optional parameters [maxReservations], [maxConnections], [reservationTtl],
  /// [connectionDuration], and [connectionData] are used to configure the
  /// [Resources] for the managed relay service.
  static Future<RelayManager> create(
    Host host, {
    int maxReservations = 128,
    int maxConnections = 128,
    int reservationTtl = 3600, // seconds
    int connectionDuration = 3600, // seconds
    int connectionData = 1 << 20, // 1 MiB
  }) async {
    final relayResources = Resources(
      maxReservations: maxReservations,
      maxConnections: maxConnections,
      reservationTtl: reservationTtl,
      connectionDuration: connectionDuration,
      connectionData: connectionData,
    );

    final manager = RelayManager._(host, relayResources);
    manager._backgroundCompleter = Completer<void>();
    manager._startBackgroundListener();
    _log.fine('RelayManager created and service monitoring started.');
    return manager;
  }

  /// Starts listening to reachability events from the host's event bus.
  void _startBackgroundListener() {
    // Subscribe to the event type.
    // Note: The stream from EventBus.subscribe is dynamic, so we cast the event.
    _eventBusSubscription = _host.eventBus.subscribe(EvtLocalReachabilityChanged);
    _reachabilityStreamSubscription = _eventBusSubscription!.stream.listen(
      (dynamic event) async { // Event is dynamic, needs casting
        if (_isClosed) return;
        if (event is EvtLocalReachabilityChanged) {
          _log.fine('Received EvtLocalReachabilityChanged: ${event.reachability}');
          await _handleReachabilityChanged(event.reachability);
        } else {
          _log.warning('Received unknown event type on reachability stream: ${event.runtimeType}');
        }
      },
      onDone: () {
        if (!_isClosed && _backgroundCompleter != null && !_backgroundCompleter!.isCompleted) {
          _log.fine('Reachability event stream closed.');
          _backgroundCompleter!.complete();
        }
      },
      onError: (e, StackTrace s) {
        _log.severe('Error in reachability listener.', e, s);
        if (!_isClosed && _backgroundCompleter != null && !_backgroundCompleter!.isCompleted) {
          _backgroundCompleter!.completeError(e, s);
        }
      }
    );
    _log.fine('Subscribed to reachability events.');
  }

  /// Handles changes in network reachability by starting or stopping the relay service.
  Future<void> _handleReachabilityChanged(Reachability reachability) async {
    await _lock.synchronized(() async {
      if (_isClosed) return;

      switch (reachability) {
        case Reachability.public:
          if (_activeRelay == null) {
            _log.fine('Host is public, starting Circuit Relay v2 service.');
            try {
              _activeRelay = Relay(_host, _relayResourcesConfig);
              _activeRelay!.start(); // Call start() on the Dart Relay
              _log.fine('Circuit Relay v2 service started successfully.');
            } catch (e, s) {
              _log.severe('Failed to start Circuit Relay v2 service.', e, s);
              _activeRelay = null; // Ensure it's null if start failed
            }
          } else {
            _log.fine('Host is public, Circuit Relay v2 service already running.');
          }
          break;
        default: // private, unknown
          if (_activeRelay != null) {
            _log.fine('Host is not public ($reachability), stopping Circuit Relay v2 service.');
            try {
              await _activeRelay!.close();
              _log.fine('Circuit Relay v2 service stopped successfully.');
            } catch (e, s) {
              _log.severe('Failed to stop Circuit Relay v2 service.', e, s);
            }
            _activeRelay = null;
          } else {
            _log.fine('Host is not public ($reachability), Circuit Relay v2 service already stopped.');
          }
          break;
      }
    });
  }

  /// Closes the RelayManager, stopping the relay service and cleaning up resources.
  Future<void> close() async {
    if (_isClosed) return;
    _isClosed = true;
    _log.fine('Closing RelayManager...');

    // Cancel the stream subscription
    await _reachabilityStreamSubscription?.cancel();
    _reachabilityStreamSubscription = null;
    _log.fine('Cancelled reachability stream subscription.');

    // Close the EventBus subscription
    await _eventBusSubscription?.close();
    _eventBusSubscription = null;
    _log.fine('Closed EventBus subscription for reachability.');

    await _lock.synchronized(() async {
      if (_activeRelay != null) {
        _log.fine('Closing active Circuit Relay v2 service.');
        try {
          await _activeRelay!.close();
        } catch (e,s) {
            _log.warning('Error closing active Circuit Relay during RelayManager close.', e, s);
        }
        _activeRelay = null;
      }
    });
    
    if (_backgroundCompleter != null && !_backgroundCompleter!.isCompleted) {
        _backgroundCompleter!.complete();
    }
    _log.fine('RelayManager closed.');
  }
}
