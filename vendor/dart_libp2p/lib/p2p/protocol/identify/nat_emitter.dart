/// NAT emitter for libp2p.
///
/// This file contains the implementation of the NAT emitter, which emits events
/// when the NAT type changes.
///
/// This is a port of the Go implementation from go-libp2p/p2p/protocol/identify/nat_emitter.go
/// to Dart, using native Dart idioms.

import 'dart:async';

import 'package:dart_libp2p/p2p/host/eventbus/eventbus.dart';
import 'package:dart_libp2p/core/event/bus.dart';
import 'package:dart_libp2p/core/event/nattype.dart';
import 'package:dart_libp2p/core/event/reachability.dart';
import 'package:dart_libp2p/core/host/host.dart';
import 'package:dart_libp2p/core/network/network.dart';
import 'package:logging/logging.dart';

import 'observed_addr_manager.dart';

final _log = Logger('identify.nat_emitter');

/// NATEmitter emits events when the NAT type changes.
class NATEmitter {
  final ObservedAddrManager _observedAddrMgr;
  final Duration _eventInterval;

  late final StreamSubscription<dynamic> _reachabilitySub;
  Reachability _reachability = Reachability.unknown;

  NATDeviceType _currentTCPNATDeviceType = NATDeviceType.unknown;
  NATDeviceType _currentUDPNATDeviceType = NATDeviceType.unknown;
  late final Emitter _emitNATDeviceTypeChanged;

  bool _closed = false;
  final _completer = Completer<void>();

  // For tracking update state
  bool _pendingUpdate = false;
  bool _enoughTimeSinceLastUpdate = true;
  Timer? _timer;

  /// Creates a new NAT emitter.
  NATEmitter._(Host host, this._observedAddrMgr, this._eventInterval);

  /// Factory constructor that creates and initializes a NAT emitter.
  static Future<NATEmitter> create(Host host, ObservedAddrManager observedAddrMgr, Duration eventInterval) async {
    final emitter = NATEmitter._(host, observedAddrMgr, eventInterval);
    await emitter._initialize(host);
    return emitter;
  }

  /// Initialize the NAT emitter.
  Future<void> _initialize(Host host) async {
    // Subscribe to reachability events
    Subscription subscription = await host.eventBus.subscribe(EvtLocalReachabilityChanged);
    _reachabilitySub = subscription.stream.listen((event) {
      _reachability = event.reachability;
    });

    // Create emitter for NAT device type changes
    _emitNATDeviceTypeChanged = await host.eventBus.emitter(EvtNATDeviceTypeChanged, opts: [stateful()]);

    // Start the worker
    _startWorker();
  }

  void _startWorker() {
    // Set up timer for periodic checks
    // We use the timer to periodically check for NAT type changes
    _timer = Timer.periodic(_eventInterval, (_) {
      _enoughTimeSinceLastUpdate = true;
      // Always check for updates on timer tick
      _maybeNotify();
      _pendingUpdate = false;
      _enoughTimeSinceLastUpdate = false;
    });
  }

  void _maybeNotify() {
    if (_reachability == Reachability.private) {
      final natTypes = _observedAddrMgr.getNATType();
      final tcpNATType = natTypes.$1;
      final udpNATType = natTypes.$2;

      if (tcpNATType != _currentTCPNATDeviceType) {
        _currentTCPNATDeviceType = tcpNATType;
        _emitNATDeviceTypeChanged.emit(EvtNATDeviceTypeChanged(
          transportProtocol: NATTransportProtocol.tcp,
          natDeviceType: _currentTCPNATDeviceType,
        ));
      }

      if (udpNATType != _currentUDPNATDeviceType) {
        _currentUDPNATDeviceType = udpNATType;
        _emitNATDeviceTypeChanged.emit(EvtNATDeviceTypeChanged(
          transportProtocol: NATTransportProtocol.udp,
          natDeviceType: _currentUDPNATDeviceType,
        ));
      }
    }
  }

  /// Closes the NAT emitter.
  Future<void> close() async {
    if (_closed) return;
    _closed = true;

    await _reachabilitySub.cancel();
    _timer?.cancel();
    await _emitNATDeviceTypeChanged.close();

    if (!_completer.isCompleted) {
      _completer.complete();
    }

    await _completer.future;
  }
}
