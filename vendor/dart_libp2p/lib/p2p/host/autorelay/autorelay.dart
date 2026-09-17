import 'dart:async';

import 'package:dart_libp2p/core/host/host.dart';
import 'package:dart_libp2p/core/network/network.dart' show Reachability; // Only import Reachability
import 'package:dart_libp2p/core/event/reachability.dart' show EvtLocalReachabilityChanged; // Import the correct event
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/p2p/transport/upgrader.dart' show Upgrader;
import 'package:logging/logging.dart';

import './autorelay_config.dart';
import './relay_finder.dart';
import './autorelay_metrics.dart';

// Event emitted when AutoRelay determines the new set of advertisable addresses.
class EvtAutoRelayAddrsUpdated {
  final List<MultiAddr> advertisableAddrs;
  EvtAutoRelayAddrsUpdated(this.advertisableAddrs);

  @override
  String toString() {
    return "EvtAutoRelayAddrsUpdated";
  }
}

class AutoRelay {
  static final Logger _log = Logger('AutoRelay');
  
  final Host host;
  final AutoRelayConfig config;
  final RelayFinder relayFinder;
  final WrappedMetricsTracer metricsTracer;

  Reachability _status = Reachability.unknown;
  StreamSubscription<dynamic>? _reachabilitySubscription;
  StreamSubscription<void>? _relayFinderRelayUpdatedSubscription;
  
  Completer<void>? _backgroundCompleter;
  StreamController<void>? _stopController;
  bool _isRunning = false;

  // Original AddrFactory to be wrapped or replaced.
  // This is complex in Dart. Go's direct modification is not typical.
  // List<Multiaddr> Function(List<Multiaddr>)? _originalAddrsFactory;

  AutoRelay(this.host, Upgrader upgrader, {AutoRelayConfig? userConfig})
      : config = userConfig ?? AutoRelayConfig(), // Simplistic merge, real one might be deeper
        relayFinder = RelayFinder(host, upgrader, userConfig ?? AutoRelayConfig()),
        metricsTracer = WrappedMetricsTracer(userConfig?.metricsTracer ?? AutoRelayConfig().metricsTracer) {
    // TODO: Address advertising. The Go version modifies host.AddrsFactory.
    // A Dart-idiomatic way would be preferable, perhaps via events or a dedicated service.
    // For now, this aspect is a placeholder.
    // If host is BasicHost, one might try to access and wrap its AddrsFactory,
    // but that breaks abstraction if Host is just an interface.
  }

  Future<void> start() async {
    if (_isRunning) {
      return;
    }
    _isRunning = true;
    _stopController = StreamController<void>.broadcast(); // broadcast if multiple listeners, otherwise regular
    _backgroundCompleter = Completer<void>();

    _log.fine('AutoRelay starting');

    // Start the background process
    _background(_stopController!.stream);
    
    _log.fine('AutoRelay started, waiting for reachability events');

    // Start RelayFinder immediately since initial status is unknown.
    // We can't wait for a reachability CHANGE event because AutoNAT probes
    // behind CGNAT fail with unknown, and unknown→unknown is not a change.
    if (_status == Reachability.private || _status == Reachability.unknown) {
      _log.fine('AutoRelay: Initial reachability is $_status, starting RelayFinder immediately');
      await relayFinder.start().catchError((e) {
        _log.severe('AutoRelay: Failed to start RelayFinder on init: $e');
      });
      metricsTracer.relayFinderStatus(true);
    }
  }

  Future<void> _updateAndEmitAdvertisableAddrs() async {
    try {
      List<MultiAddr> currentHostAddrs = await host.network.interfaceListenAddresses;
      List<MultiAddr> newAddrs;
      if (_status == Reachability.private || _status == Reachability.unknown) {
        newAddrs = await relayFinder.getRelayAddrs(currentHostAddrs);
      } else {
        newAddrs = currentHostAddrs;
      }
      // log.debug('AutoRelay: Emitting new advertisable addresses: $newAddrs'); // TODO: Add logging
      final emitter = await host.eventBus.emitter(EvtAutoRelayAddrsUpdated);
      await emitter.emit(EvtAutoRelayAddrsUpdated(newAddrs));
      await emitter.close();
    } catch (e) {
      // log.error('AutoRelay: Failed to update and emit advertisable addresses: $e'); // TODO: Add logging
    }
  }

  void _background(Stream<void> stopSignal) async {
    _log.fine('AutoRelay background task started, subscribing to reachability events');
    final reachabilityEventBusSub = host.eventBus.subscribe(EvtLocalReachabilityChanged);
    _reachabilitySubscription = reachabilityEventBusSub.stream.takeUntil(stopSignal).listen(
      (event) async { // Make listener async
        if (event is EvtLocalReachabilityChanged) {
          _status = event.reachability;
          _log.fine('AutoRelay: Reachability changed to $_status');
          if (_status == Reachability.private || _status == Reachability.unknown) {
            _log.fine('AutoRelay: Reachability is Private/Unknown, starting RelayFinder');
            await relayFinder.start().catchError((e) {
              _log.severe('AutoRelay: Failed to start RelayFinder: $e');
            });
            metricsTracer.relayFinderStatus(true);
          } else { // Public
            _log.fine('AutoRelay: Reachability is Public, stopping RelayFinder');
            await relayFinder.stop().catchError((e) {
              _log.severe('AutoRelay: Failed to stop RelayFinder: $e');
            });
            metricsTracer.relayFinderStatus(false);
          }
          await _updateAndEmitAdvertisableAddrs(); // Update addrs on any reachability change
        }
      },
      onError: (e) {
        _log.severe('AutoRelay: Error on reachability event stream: $e');
      },
      onDone: () {
        _log.fine('AutoRelay: Reachability event stream closed');
      }
    );

    // Listen to relayFinder's relayUpdated stream
    _relayFinderRelayUpdatedSubscription = relayFinder.onRelaysUpdated.takeUntil(stopSignal).listen((_) async {
      // log.debug('AutoRelay: RelayFinder relays updated, re-evaluating advertisable addresses.'); // TODO: Add logging
      await _updateAndEmitAdvertisableAddrs();
    });


    await stopSignal.first; // Wait for the stop signal

    // Cleanup
    await _reachabilitySubscription?.cancel();
    _reachabilitySubscription = null;
    await reachabilityEventBusSub.close(); 
    
    await _relayFinderRelayUpdatedSubscription?.cancel();
    _relayFinderRelayUpdatedSubscription = null;

    if (_backgroundCompleter != null && !_backgroundCompleter!.isCompleted) {
      _backgroundCompleter!.complete();
    }
    // log.debug('AutoRelay background task stopped.');
  }

  Future<void> close() async {
    if (!_isRunning) {
      return;
    }
    // log.debug('AutoRelay closing...');

    if (_stopController != null && !_stopController!.isClosed) {
      _stopController!.add(null); // Signal background to stop
      await _backgroundCompleter?.future; // Wait for background to complete
      _stopController!.close();
    }
    
    await relayFinder.stop().catchError((e) {
      // log.error('AutoRelay: Error stopping RelayFinder during close: $e');
    });

    _isRunning = false;
    // log.debug('AutoRelay closed.');
  }

  // This method can be removed if address advertising is fully event-driven.
  // Or kept for manual/direct queries if needed.
  Future<List<MultiAddr>> getAdvertisableAddrs() async {
    List<MultiAddr> currentHostAddrs = await host.network.interfaceListenAddresses;
    if (_status == Reachability.private || _status == Reachability.unknown) {
      return relayFinder.getRelayAddrs(currentHostAddrs);
    }
    return currentHostAddrs;
  }
}
