import 'dart:async';
import 'dart:math';
import 'dart:collection'; // For HashSet

import 'package:dart_libp2p/core/event/bus.dart';
import 'package:dart_libp2p/core/event/addrs.dart'; // For EvtLocalAddressesUpdated
import 'package:dart_libp2p/core/event/identify.dart'; // For EvtPeerIdentificationCompleted
import 'package:dart_libp2p/core/host/host.dart';
import 'package:dart_libp2p/core/network/network.dart' show Reachability, Network; // Conn is in its own file
import 'package:dart_libp2p/core/network/conn.dart'; // Import Conn explicitly
// Direction is now in common.dart
import 'package:dart_libp2p/core/network/notifiee.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import '../../../core/network/common.dart' show Direction; // Import Direction from common.dart
import 'package:dart_libp2p/core/peer/addr_info.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/protocol/autonatv1/autonatv1.dart'; // For AutoNATProto and AutoNATV1Client
import 'package:dart_libp2p/core/peerstore.dart';


import './options.dart';
import './client.dart';
import './service.dart';
import './dial_policy.dart';
import './metrics.dart';

// Logging function for this file
void _log(String message) {
}

const int maxConfidence = 3;

// Interface AutoNAT (from Go's interface.go)
abstract class AutoNAT implements Closable {
  Reachability get status;
}

// Interface Closable (helper, similar to io.Closer)
abstract class Closable {
  Future<void> close();
}


class AmbientAutoNAT implements AutoNAT, Notifiee {
  final Host _host;
  final AutoNATConfig _config;
  
  late final AutoNATV1ClientImpl _client;
  final AutoNATService? _service; // Nullable if service not enabled

  // Context and cancellation for background tasks
  final StreamController<void> _ctxController = StreamController.broadcast();
  bool _isClosed = false;

  // StreamControllers to mimic Go channels
  final StreamController<Conn> _inboundConnController = StreamController<Conn>.broadcast(); // Conn should be fine now
  final StreamController<Exception?> _dialResponsesController = StreamController<Exception?>.broadcast();
  final StreamController<Reachability> _observationsController = StreamController<Reachability>.broadcast();

  Reachability _currentStatus = Reachability.unknown;
  int _confidence = 0;
  DateTime _lastInbound = DateTime.fromMillisecondsSinceEpoch(0);
  DateTime _lastProbe = DateTime.fromMillisecondsSinceEpoch(0);
  final Map<String, DateTime> _recentProbes = {}; // PeerId.toString() -> DateTime
  int _pendingProbes = 0;
  final Set<String> _ourAddrs = HashSet<String>(); // Set of Multiaddr strings

  StreamSubscription? _eventBusSubscription;
  Timer? _probeTimer;
  Timer? _addrChangeTicker; // For fallback address checking

  // Event emitter for reachability changes
  // Assuming Host has an eventBus that can emit EvtLocalReachabilityChanged
  // This part needs to align with how dart-libp2p handles event emission.
  // For now, placeholder:
  // late final EventBusEmitter<EvtLocalReachabilityChanged> _emitReachabilityChanged;


  AmbientAutoNAT._(this._host, this._config, this._service) {
    _client = AutoNATV1ClientImpl(_host, _config.addressFunc, _config.metricsTracer, _config.requestTimeout);
    // _emitReachabilityChanged = _host.eventBus.emitter<EvtLocalReachabilityChanged>(EvtLocalReachabilityChanged()); // Placeholder
    _updateOurAddrs(); // Initial population
    _background(); // Start background processing
    _host.network.notify(this); // Register for network events
  }

  static Future<AmbientAutoNAT> create(Host h, List<AutoNATOption> options) async {
    final dialPolicy = DialPolicyImpl(host: h); // Default dial policy
    final conf = AutoNATConfig(host: h, dialPolicy: dialPolicy);
    applyOptions(conf, options); // Apply user-provided options

    if (conf.addressFunc == null) {
      // In Go: if aa, ok := h.(interface{ AllAddrs() []ma.Multiaddr }); ok { conf.addressFunc = aa.AllAddrs } else { conf.addressFunc = h.Addrs }
      // Assuming Host has `allAddrs` or similar, or fallback to `addrs`
      // For now, directly use h.addrs as AddrFunc
      conf.addressFunc = () => h.addrs;
    }
    
    AutoNATService? serviceInstance;
    if ((!conf.forceReachability || conf.reachability == Reachability.public) && conf.dialer != null) {
      // The AutoNATService constructor in service.dart expects an AutoNATConfig.
      // We need to ensure the config passed to AutoNATService is consistent.
      // The Go code creates `newAutoNATService(conf)`.
      // We might need to pass `conf` (this config) to the AutoNATService.
      // For now, assuming AutoNATService can be constructed with the main config.
      serviceInstance = AutoNATService(conf); 
      serviceInstance.enable();
    }

    final as = AmbientAutoNAT._(h, conf, serviceInstance);
    
    // Subscribe to event bus events
    // Assuming h.eventBus is the correct way to access the EventBus instance.
    // This might need adjustment if Host interface provides eventBus differently.
    try {
      // Note: Passing instances like EvtLocalAddressesUpdated() to subscribe
      // is unusual. Typically, you pass the Type itself.
      // The event_bus.dart example shows `eventbus.subscribe(EventType)`.
      // Let's assume it means `Type` objects.
      as._eventBusSubscription = h.eventBus.subscribe(
        [EvtLocalAddressesUpdated, EvtPeerIdentificationCompleted], // Pass Types
        // opts: [SubscriptionOptName('autonat')] // Assuming an option for naming if available
        // The `name` parameter was a guess from the placeholder.
        // The actual API for `SubscriptionOpt` would be needed if naming is desired.
        // For now, omitting `opts` if `name` is not a standard option.
      ).stream.listen(as._handleEventBusEvent); // Access .stream property first
      _log('Subscribed to EvtLocalAddressesUpdated and EvtPeerIdentificationCompleted.');
    } catch (e) {
      _log('Failed to subscribe to event bus: $e. Event bus integration might be incomplete.');
      // Proceeding without event bus if subscription fails, functionality will be degraded.
    }

    return as;
  }


  @override
  Reachability get status => _currentStatus;

  void _emitStatus() {
    _log('Status changed to: $_currentStatus, Confidence: $_confidence');
    // _emitReachabilityChanged.emit(EvtLocalReachabilityChanged(reachability: _currentStatus)); // Placeholder
    _config.metricsTracer?.reachabilityStatus(_currentStatus);
    _config.metricsTracer?.reachabilityStatusConfidence(_confidence);
  }

  bool _ipInList(MultiAddr candidate, List<MultiAddr> list) {
    final candidateIP = candidate.toIP();
    if (candidateIP == null) return false;
    for (final item in list) {
      final itemIP = item.toIP();
      if (itemIP != null && itemIP.address == candidateIP.address) {
        return true;
      }
    }
    return false;
  }

  void _background() async {
    _log('Background task started.');
    await Future.delayed(_config.bootDelay); // Initial boot delay

    // Fallback timer for address changes
    _addrChangeTicker = Timer.periodic(const Duration(minutes: 30), (_) {
      if (_isClosed) {
        _addrChangeTicker?.cancel();
        return;
      }
      _log('AddrChangeTicker: checking addresses.');
      _onAddressOrPeerChange(); // Trigger probe scheduling logic
    });

    _scheduleNextProbe(false); // Schedule the first probe

    // Listen to streams mimicking Go channels
    StreamSubscription? inboundConnSub;
    StreamSubscription? dialResponsesSub;
    StreamSubscription? observationsSub;

    inboundConnSub = _inboundConnController.stream.listen((conn) {
      if (_isClosed) return;
      final localAddrs = _host.addrs;
      if (conn.remoteMultiaddr.isPublic() && !_ipInList(conn.remoteMultiaddr, localAddrs)) {
        _lastInbound = DateTime.now();
        _log('Inbound public connection recorded from ${conn.remoteMultiaddr}');
      }
      _onAddressOrPeerChange(); // Re-evaluate probe schedule
    });

    dialResponsesSub = _dialResponsesController.stream.listen((err) {
      if (_isClosed) return;
      _pendingProbes--;
      if (err != null && isDialRefused(err)) { // isDialRefused from client.dart
         _log('Dialback refused, forcing probe.');
        _scheduleNextProbe(true); // Force probe
      } else {
        _handleDialResponse(err);
      }
    });

    observationsSub = _observationsController.stream.listen((obs) {
      if (_isClosed) return;
      _recordObservation(obs);
      _scheduleNextProbe(false); // Re-schedule after observation
    });
    
    await _ctxController.stream.first; // Wait for close signal

    // Cleanup
    _log('Background task stopping.');
    _probeTimer?.cancel();
    _addrChangeTicker?.cancel();
    await inboundConnSub?.cancel();
    await dialResponsesSub?.cancel();
    await observationsSub?.cancel();
    // await _emitReachabilityChanged.close(); // Placeholder
    await _eventBusSubscription?.cancel(); 
  }
  
  void _handleEventBusEvent(dynamic event) {
    if (_isClosed) return;
    
    _log('Received event: ${event.runtimeType}');

    if (event is EvtLocalAddressesUpdated) {
      _log('Handling EvtLocalAddressesUpdated.');
      _onAddressOrPeerChange();
    } else if (event is EvtPeerIdentificationCompleted) {
      _log('Handling EvtPeerIdentificationCompleted for peer ${event.peer.toString()}.');
      // Check if the identified peer supports the AutoNAT protocol
      _host.peerStore.protoBook.getProtocols(event.peer).then((supportedProtocols) {
        if (_isClosed) return; // Check again in async callback
        if (supportedProtocols.contains(autoNATV1Proto)) {
          _log('Peer ${event.peer.toString()} supports AutoNAT. Forcing probe schedule update.');
          _onAddressOrPeerChange(forceProbeOverride: true);
        } else {
          _log('Peer ${event.peer.toString()} does not support AutoNAT.');
        }
      }).catchError((e) {
        if (_isClosed) return;
        _log('Error checking protocols for peer ${event.peer.toString()}: $e');
      });
    } else {
      _log('Received unknown event type on AutoNAT bus: ${event.runtimeType}');
    }
  }

  void _onAddressOrPeerChange({bool forceProbeOverride = false}) {
    if (_isClosed) return;
    final hasNewAddr = _updateOurAddrs();
    if (hasNewAddr && _confidence == maxConfidence) {
      _confidence--;
      _log('Address change detected, reducing confidence to $_confidence.');
    }
    _scheduleNextProbe(forceProbeOverride);
  }


  bool _updateOurAddrs() {
    final currentAddrsList = (_config.addressFunc ?? () => _host.addrs)();
    final currentAddrStrings = currentAddrsList.where((a) => a.isPublic()).map((a) => a.toString()).toSet();
    
    bool hasNewAddr = false;
    for (final addrStr in currentAddrStrings) {
      if (!_ourAddrs.contains(addrStr)) {
        hasNewAddr = true;
        break;
      }
    }
    if (!hasNewAddr && currentAddrStrings.length != _ourAddrs.length) {
        // Some address might have been removed
        hasNewAddr = true;
    }

    _ourAddrs.clear();
    _ourAddrs.addAll(currentAddrStrings);
    return hasNewAddr;
  }

  void _scheduleNextProbe(bool forceProbe) {
    if (_isClosed) return;
    _probeTimer?.cancel(); // Cancel any existing timer

    final now = DateTime.now();
    Duration nextProbeAfter = _config.refreshInterval;
    final receivedInboundRecently = _lastInbound.isAfter(_lastProbe);

    if (forceProbe && _currentStatus == Reachability.unknown) {
      nextProbeAfter = const Duration(seconds: 2);
       _log('Forcing probe quickly (unknown status).');
    } else if (_currentStatus == Reachability.unknown ||
        _confidence < maxConfidence ||
        (_currentStatus != Reachability.public && receivedInboundRecently)) {
      nextProbeAfter = _config.retryInterval;
      _log('Scheduling retry probe. Status: $_currentStatus, Confidence: $_confidence, Inbound: $receivedInboundRecently');
    } else if (_currentStatus == Reachability.public && receivedInboundRecently) {
      nextProbeAfter = Duration(microseconds: _config.refreshInterval.inMicroseconds * 2);
      if (nextProbeAfter > AutoNATConfig.maxRefreshInterval) {
        nextProbeAfter = AutoNATConfig.maxRefreshInterval;
      }
      _log('Public, received inbound. Scheduling probe further out.');
    }

    DateTime nextProbeTime = _lastProbe.add(nextProbeAfter);
    if (nextProbeTime.isBefore(now)) {
      nextProbeTime = now;
    }
    
    final delay = nextProbeTime.difference(now);
    _log('Next probe scheduled in $delay. Forced: $forceProbe');
    _config.metricsTracer?.nextProbeTime(nextProbeTime);

    _probeTimer = Timer(delay, () {
      if (_isClosed) return;
      _lastProbe = DateTime.now();
      _getPeerToProbe().then((peerId) {
        if (peerId != null) {
          _tryProbe(peerId);
        } else {
           _log('No suitable peer found to probe.');
          _scheduleNextProbe(false); // Reschedule if no peer found
        }
      }).catchError((e) {
        _log('Error getting peer to probe: $e');
        _scheduleNextProbe(false); // Reschedule on error
      });
    });
  }

  void _handleDialResponse(Exception? dialErr) {
    if (_isClosed) return;
    Reachability observation;
    if (dialErr == null) {
      observation = Reachability.public;
    } else if (isDialError(dialErr)) { // isDialError from client.dart
      observation = Reachability.private;
    } else {
      observation = Reachability.unknown;
    }
    _log('Dial response handled. Observation: $observation. Error: $dialErr');
    _recordObservation(observation);
  }

  void _recordObservation(Reachability observation) {
    if (_isClosed) return;
    _log('Recording observation: $observation. Current status: $_currentStatus, Confidence: $_confidence');

    bool statusChanged = false;
    if (observation == Reachability.public) {
      if (_currentStatus != Reachability.public) {
        _log('NAT status is now Public.');
        _confidence = 0;
        _service?.enable();
        statusChanged = true;
      } else if (_confidence < maxConfidence) {
        _confidence++;
      }
      _currentStatus = observation;
    } else if (observation == Reachability.private) {
      if (_currentStatus != Reachability.private) {
        if (_confidence > 0) {
          _confidence--;
           _log('Confidence reduced to $_confidence due to private observation.');
        } else {
          _log('NAT status is now Private.');
          _confidence = 0;
          _currentStatus = observation;
          _service?.disable();
          statusChanged = true;
        }
      } else if (_confidence < maxConfidence) {
        _confidence++;
        // _currentStatus = observation; // Only update if confidence was not maxed, or always? Go updates.
      }
       // If already private and confidence is max, status remains private.
      // If confidence was less than max, it increases. If it reaches max, status is confirmed private.
      // The Go code updates status.Store(&observation) even if confidence just increments.
      _currentStatus = observation;


    } else { // Unknown
      if (_confidence > 0) {
        _confidence--;
        _log('Confidence reduced to $_confidence due to unknown observation.');
      } else {
        if (_currentStatus != Reachability.unknown) {
           _log('NAT status is now Unknown.');
          _currentStatus = observation;
          _service?.enable(); // Enable service if unknown, as per Go logic
          statusChanged = true;
        }
      }
    }

    if (statusChanged) {
      _emitStatus();
    }
     _config.metricsTracer?.reachabilityStatus(_currentStatus); // Always update metric
     _config.metricsTracer?.reachabilityStatusConfidence(_confidence); // Always update metric
  }

  void _tryProbe(PeerId p) {
    if (_isClosed || _pendingProbes > 5) { // Max 5 pending probes from Go
      _log('Skipping probe for $p. Closed: $_isClosed, Pending: $_pendingProbes');
      return;
    }
    
    _log('Attempting probe with peer: $p');
    _recentProbes[p.toString()] = DateTime.now();
    _pendingProbes++;

    // Run probe in a separate async operation
    Future<void>(() async {
      Exception? err;
      try {
        // final addrInfo = await _host.peerStore.peerInfo(p); // Get AddrInfo for the peer
        // The client's DialBack takes PeerId directly.
        await _client.dialBack(p);
      } catch (e) {
        err = e is Exception ? e : Exception(e.toString());
      } finally {
        if (!_isClosed) {
          _dialResponsesController.add(err);
        }
      }
    });
  }

  Future<PeerId?> _getPeerToProbe() async {
    if (_isClosed) return null;
    final peers = _host.network.peers;
    if (peers.isEmpty) {
      _log('No connected peers to probe.');
      return null;
    }

    final now = DateTime.now();
    _recentProbes.removeWhere((key, value) => now.difference(value) > _config.throttlePeerPeriod);

    final shuffledPeers = List<PeerId>.from(peers)..shuffle(Random());

    for (final p in shuffledPeers) {
      if (_recentProbes.containsKey(p.toString())) {
        continue; // Already probed recently
      }
      
      AddrInfo info;
      try {
        info = await _host.peerStore.peerInfo(p);
      } catch (e) {
        _log('Error getting peer info for $p: $e');
        continue;
      }

      // Check if peer supports AutoNATProto
      List<String> supportedProtocols;
      try {
        supportedProtocols = await _host.peerStore.protoBook.getProtocols(p);
      } catch (e) {
         _log('Error getting protocols for $p: $e');
        continue;
      }

      if (!supportedProtocols.contains(autoNATV1Proto)) {
        continue;
      }

      if (_config.dialPolicy.skipPeer(info.addrs)) {
        continue;
      }
      _log('Selected peer to probe: $p');
      return p;
    }
    _log('No suitable peer found after filtering.');
    return null;
  }

  @override
  Future<void> close() async {
    if (_isClosed) return;
    _isClosed = true;
    _log('Closing AutoNAT...');
    _ctxController.add(null); // Signal background tasks to stop
    
    _probeTimer?.cancel();
    _addrChangeTicker?.cancel();
    
    await _inboundConnController.close();
    await _dialResponsesController.close();
    await _observationsController.close();
    
    _host.network.stopNotify(this);
    await _service?.close();
    // _eventBusSubscription is cancelled in _background's cleanup
    _log('AutoNAT closed.');
  }

  // Notifiee interface methods
  @override
  void listen(Network network, MultiAddr addr) {}

  @override
  void listenClose(Network network, MultiAddr addr) {}

  @override
  Future<void> connected(Network network, Conn conn, {Duration? dialLatency}) async {
    if (_isClosed) return;
    // This check is slightly different from Go's `manet.IsPublicAddr(c.RemoteMultiaddr())`
    // as `conn.remoteMultiaddr()` might not be directly public if it's e.g. a relay.
    // The Go code checks `manet.IsPublicAddr`. Our `Multiaddr.isPublic()` should be equivalent.
    // Adding null-aware access to remoteMultiaddr() based on previous errors, though Conn itself should be non-null here.
    if (conn.stat.stats.direction == Direction.inbound && conn.remoteMultiaddr.isPublic() == true) { // Corrected to conn.stat.stats.direction
      if (!_inboundConnController.isClosed) {
        _inboundConnController.add(conn);
      }
    }
  }

  @override
  Future<void> disconnected(Network network, Conn conn) async {}

  // Method to manually inject an observation, e.g., for testing (from Go)
  void recordObservationForTest(Reachability observation) {
      if (!_isClosed && !_observationsController.isClosed) {
          _observationsController.add(observation);
      }
  }
}


// StaticAutoNAT implementation
class StaticAutoNAT implements AutoNAT {
  final Host _host;
  final Reachability _reachability;
  final AutoNATService? _service; // Can have an associated service

  StaticAutoNAT(this._host, this._reachability, this._service);

  static Future<StaticAutoNAT> create(Host h, Reachability reachability, List<AutoNATOption> options) async {
    // Similar to AmbientAutoNAT.create, setup config and optional service
    final dialPolicy = DialPolicyImpl(host: h);
    final conf = AutoNATConfig(host: h, dialPolicy: dialPolicy);
    applyOptions(conf, options); // Apply user-provided options
    
    conf.forceReachability = true;
    conf.reachability = reachability;

    AutoNATService? serviceInstance;
    if (conf.reachability == Reachability.public && conf.dialer != null) {
       serviceInstance = AutoNATService(conf);
       serviceInstance.enable();
    }
    
    // Emit initial status
    // h.eventBus.emitter<EvtLocalReachabilityChanged>(EvtLocalReachabilityChanged()).emit(EvtLocalReachabilityChanged(reachability: reachability)); // Placeholder
    _log('StaticAutoNAT created. Status: $reachability');

    return StaticAutoNAT(h, reachability, serviceInstance);
  }

  @override
  Reachability get status => _reachability;

  @override
  Future<void> close() async {
    await _service?.close();
    _log('StaticAutoNAT closed.');
  }
}

// Top-level factory function `New` from Go
// It returns the AutoNAT interface type.
// The options parameter is a list of functions that modify the config.
// Future<AutoNAT> newAutoNAT(Host h, List<AutoNATOption> options) async {
//   // Create a default config. The DialPolicy needs the host.
//   final dialPolicy = DialPolicyImpl(host: h);
//   final conf = AutoNATConfig(host: h, dialPolicy: dialPolicy);
//
//   // Apply all options to the config
//   applyOptions(conf, options);
//
//   if (conf.forceReachability) {
//     return StaticAutoNAT.create(h, conf.reachability, options); // Pass options for service setup
//   } else {
//     return AmbientAutoNAT.create(h, options);
//   }
// }
