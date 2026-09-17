import 'dart:async';
import 'dart:math';

import 'package:dart_libp2p/core/event/bus.dart';
import 'package:dart_libp2p/core/event/addrs.dart';
import 'package:dart_libp2p/core/event/identify.dart';
import 'package:dart_libp2p/core/event/reachability.dart';
import 'package:dart_libp2p/core/host/host.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/network.dart';
import 'package:dart_libp2p/core/protocol/autonatv2/autonatv2.dart';
import 'package:logging/logging.dart';

import 'ambient_config.dart';

final _log = Logger('ambient_autonat_v2');

const int maxConfidence = 3;

/// Ambient AutoNAT v2 orchestrator that wraps AutoNATv2 with automatic
/// background probing and reachability detection.
/// 
/// This class:
/// - Listens for peer identification events
/// - Automatically probes peers that support AutoNAT v2
/// - Tracks confidence in reachability status
/// - Emits EvtLocalReachabilityChanged events
class AmbientAutoNATv2 {
  final Host _host;
  final AutoNATv2 _autoNATv2;
  final AmbientAutoNATv2Config _config;
  
  // State tracking
  Reachability _currentStatus = Reachability.unknown;
  int _confidence = 0;
  bool _hasEmittedInitial = false;
  int _noPeersAttempts = 0; // Track consecutive no-peers failures for backoff
  
  // Event emission
  late final Emitter _emitter;
  
  // Background processing
  Future<void>? _scheduledProbe;
  StreamSubscription? _eventSubscription;
  bool _closed = false;
  int _probeGeneration = 0; // Track probe generations for cancellation
  
  AmbientAutoNATv2._(this._host, this._autoNATv2, this._config);
  
  /// Create and start a new AmbientAutoNATv2 orchestrator
  static Future<AmbientAutoNATv2> create(
    Host host,
    AutoNATv2 autoNATv2, {
    AmbientAutoNATv2Config? config,
  }) async {
    final ambient = AmbientAutoNATv2._(
      host,
      autoNATv2,
      config ?? const AmbientAutoNATv2Config(),
    );
    
    await ambient._initialize();
    return ambient;
  }
  
  /// Current reachability status
  Reachability get status => _currentStatus;
  
  /// Current confidence level (0-3)
  int get confidence => _confidence;
  
  Future<void> _initialize() async {
    // Initialize event emitter
    _emitter = await _host.eventBus.emitter(EvtLocalReachabilityChanged);
    
    // Subscribe to relevant events
    _eventSubscription = _host.eventBus.subscribe([
      EvtLocalAddressesUpdated,
      EvtPeerIdentificationCompleted,
    ]).stream.listen(_handleEvent);
    
    _log.fine('AmbientAutoNATv2 initialized, scheduling first probe after boot delay (${_config.bootDelay.inSeconds}s)');
    
    // Schedule first probe after boot delay (non-blocking)
    _scheduleNextProbe(false, delay: _config.bootDelay);
  }
  
  void _handleEvent(dynamic event) {
    if (_closed) return;
    
    if (event is EvtLocalAddressesUpdated) {
      _log.fine('Address change detected, reducing confidence and rescheduling probe');
      if (_confidence == maxConfidence) {
        _confidence--;
      }
      _scheduleNextProbe(false);
    } else if (event is EvtPeerIdentificationCompleted) {
      _handlePeerIdentified(event.peer);
    }
  }
  
  Future<void> _handlePeerIdentified(dynamic peerId) async {
    if (_closed) return;
    
    try {
      final protocols = await _host.peerStore.protoBook.getProtocols(peerId);
      
      // Check if peer supports AutoNAT v2 dial protocol
      if (protocols.contains(AutoNATv2Protocols.dialProtocol)) {
        _log.fine('Peer $peerId supports AutoNAT v2, scheduling probe');
        _noPeersAttempts = 0; // Reset backoff since we have a peer now
        _scheduleNextProbe(true);
      }
    } catch (e) {
      _log.warning('Error checking protocols for peer $peerId: $e');
    }
  }
  
  void _scheduleNextProbe(bool forceProbe, {Duration? delay}) {
    if (_closed) return;
    
    // Increment generation to invalidate any pending probes
    _probeGeneration++;
    final probeGeneration = _probeGeneration;
    
    // Determine delay
    final Duration nextProbeAfter = delay ?? _getProbeInterval(forceProbe);
    
    _log.fine('Scheduling probe in ${nextProbeAfter.inSeconds}s '
              '(force: $forceProbe, status: $_currentStatus, confidence: $_confidence)');
    
    // Schedule probe using Future.delayed for better error handling
    _scheduledProbe = Future.delayed(nextProbeAfter).then((_) async {
      // Check if this probe is still valid (not superseded by a newer schedule)
      if (_closed || probeGeneration != _probeGeneration) {
        _log.fine('Probe generation $probeGeneration cancelled (current: $_probeGeneration)');
        return;
      }
      
      try {
        await _executeProbe();
      } catch (e) {
        _log.warning('Error executing probe: $e');
        // Treat errors as unknown observations
        _handleProbeError(e);
      }
    });
  }
  
  Duration _getProbeInterval(bool forceProbe) {
    if (forceProbe && _currentStatus == Reachability.unknown) {
      return const Duration(seconds: 2);
    } else if (_currentStatus == Reachability.unknown ||
               _confidence < maxConfidence) {
      return _config.retryInterval;
    } else {
      return _config.refreshInterval;
    }
  }
  
  Future<void> _executeProbe() async {
    if (_closed) return;

    // Check if any peers support AutoNAT v2 before attempting probe
    if (!_autoNATv2.hasPeers) {
      _noPeersAttempts++;
      // Backoff: 10s, 20s, 40s, 60s, 60s, ... (capped at 60s)
      final backoffSeconds = min(60, 10 * (1 << min(_noPeersAttempts - 1, 3)));
      _log.fine('No peers support AutoNAT v2 yet, retrying in ${backoffSeconds}s '
                '(attempt $_noPeersAttempts)');
      // Emit initial unknown so AutoRelay can start even without AutoNAT peers
      if (!_hasEmittedInitial) {
        _log.info('No AutoNAT v2 peers available, emitting initial UNKNOWN reachability');
        _hasEmittedInitial = true;
        _emitStatusChange();
      }
      _scheduleNextProbe(false, delay: Duration(seconds: backoffSeconds));
      return;
    }
    _noPeersAttempts = 0;

    _log.info('Executing reachability probe');

    // Get addresses to probe
    final addrs = _getAddressesToProbe();

    if (addrs.isEmpty) {
      _log.fine('No addresses to probe');
      _scheduleNextProbe(false);
      return;
    }

    // Create requests for each address
    final requests = addrs.map((addr) => Request(
      addr: addr,
      sendDialData: false,
    )).toList();

    _log.fine('Probing ${requests.length} addresses');

    // Use AutoNATv2 to check reachability
    // Errors are caught at the scheduling level
    final result = await _autoNATv2.getReachability(requests);
    _handleProbeResult(result);
  }
  
  List<MultiAddr> _getAddressesToProbe() {
    if (_config.addressFunc != null) {
      return _config.addressFunc!();
    }
    
    // Use host addresses, filtering for public addresses
    var addrs = _host.addrs.where((addr) => addr.isPublic());
    
    // If ipv4Only is set, filter out IPv6 addresses.
    // This ensures relay reservations are created even if device has public IPv6,
    // for compatibility with IPv4-only peers.
    if (_config.ipv4Only) {
      addrs = addrs.where((addr) => addr.ip6 == null);
      _log.fine('ipv4Only mode: filtered to ${addrs.length} IPv4-only addresses for probing');
    }
    
    return addrs.toList();
  }
  
  void _handleProbeResult(Result result) {
    _log.fine('Probe result: addr=${result.addr}, reachability=${result.reachability}, status=${result.status}');
    
    // Record observation based on result
    if (result.reachability == Reachability.public) {
      _recordObservation(Reachability.public);
    } else if (result.reachability == Reachability.private) {
      _recordObservation(Reachability.private);
    } else {
      _recordObservation(Reachability.unknown);
    }
    
    // Schedule next probe
    _scheduleNextProbe(false);
  }
  
  void _handleProbeError(dynamic error) {
    _log.warning('Probe error, treating as unknown: $error');
    
    // Treat errors as unknown observations
    _recordObservation(Reachability.unknown);
    
    // Schedule next probe
    _scheduleNextProbe(false);
  }
  
  void _recordObservation(Reachability observation) {
    if (_closed) return;
    
    if (observation == Reachability.public) {
      // Aggressively switch to public
      if (_currentStatus != Reachability.public) {
        _log.info('Reachability changed from $_currentStatus to PUBLIC');
        _confidence = 0;
        _currentStatus = observation;
        _emitStatusChange();
      } else if (_confidence < maxConfidence) {
        _confidence++;
        _log.fine('Public reachability confirmed, confidence now $_confidence');
      }
    } else if (observation == Reachability.private) {
      // Gradually switch to private
      if (_currentStatus != Reachability.private) {
        if (_confidence > 0) {
          _confidence--;
          _log.fine('Private observation, reducing confidence to $_confidence');
        } else {
          _log.info('Reachability changed from $_currentStatus to PRIVATE');
          _confidence = 0;
          _currentStatus = observation;
          _emitStatusChange();
        }
      } else if (_confidence < maxConfidence) {
        _confidence++;
        _log.fine('Private reachability confirmed, confidence now $_confidence');
      }
    } else if (observation == Reachability.unknown) {
      // Reduce confidence on unknown observations
      if (_confidence > 0) {
        _confidence--;
        _log.fine('Unknown observation, reducing confidence to $_confidence');
      } else if (_currentStatus != Reachability.unknown) {
        _log.info('Reachability changed from $_currentStatus to UNKNOWN');
        _currentStatus = observation;
        _emitStatusChange();
      } else if (!_hasEmittedInitial) {
        // First probe confirmed unknown status — emit so AutoRelay can react
        _log.info('Initial reachability confirmed as UNKNOWN, emitting event');
        _hasEmittedInitial = true;
        _emitStatusChange();
      }
    }
  }
  
  Future<void> _emitStatusChange() async {
    if (_closed) return;
    
    _log.info('Emitting reachability change event: $_currentStatus');
    
    try {
      await _emitter.emit(
        EvtLocalReachabilityChanged(reachability: _currentStatus),
      );
    } catch (e) {
      _log.severe('Failed to emit reachability change event: $e');
    }
  }
  
  /// Close the ambient orchestrator and clean up resources
  Future<void> close() async {
    if (_closed) return;
    _closed = true;
    
    _log.fine('Closing AmbientAutoNATv2');
    
    // Increment generation to cancel any pending probes
    _probeGeneration++;
    
    // Wait for any in-flight probe to complete (with timeout)
    if (_scheduledProbe != null) {
      try {
        await _scheduledProbe!.timeout(const Duration(seconds: 5));
      } catch (e) {
        _log.fine('Timeout waiting for scheduled probe to complete: $e');
      }
    }
    
    await _eventSubscription?.cancel();
    await _emitter.close();
  }
}

