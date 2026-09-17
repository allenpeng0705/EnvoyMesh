import 'dart:async';
import 'dart:collection';

import '../../../core/peer/addr_info.dart';
import '../../../core/discovery.dart';
import '../../../core/peer/peer_id.dart';
import 'backoff.dart';

/// BackoffDiscovery is an implementation of discovery that caches peer data and attenuates repeated queries
class BackoffDiscovery implements Discovery {
  final Discovery _disc;
  final BackoffFactory _stratFactory;
  final Map<String, BackoffCache> _peerCache = {};
  
  final int _parallelBufSz;
  final int _returnedBufSz;
  
  final Clock _clock;
  
  /// Creates a new BackoffDiscovery
  BackoffDiscovery(
    this._disc,
    this._stratFactory, {
    int parallelBufferSize = 32,
    int returnedBufferSize = 32,
    Clock? clock,
  })  : _parallelBufSz = parallelBufferSize,
        _returnedBufSz = returnedBufferSize,
        _clock = clock ?? RealClock();
  
  @override
  Future<Duration> advertise(String ns, [List<DiscoveryOption> options = const []]) {
    return _disc.advertise(ns, options);
  }
  
  @override
  Future<Stream<AddrInfo>> findPeers(String ns, [List<DiscoveryOption> options = const []]) async {
    // Get options
    final opts = DiscoveryOptions().apply(options);
    
    // Get cached peers
    var c = _peerCache[ns];
    
    /*
      Overall plan:
      If it's time to look for peers, look for peers, then return them
      If it's not time then return cache
      If it's time to look for peers, but we have already started looking. Get up to speed with ongoing request
    */
    
    // Setup cache if we don't have one yet
    if (c == null) {
      final pc = BackoffCache(
        _stratFactory(),
        _clock,
      );
      
      c = _peerCache.putIfAbsent(ns, () => pc);
    }
    
    final timeExpired = _clock.now().isAfter(c.nextDiscover);
    
    // If it's not yet time to search again and no searches are in progress then return cached peers
    if (!(timeExpired || c.ongoing)) {
      var chLen = opts.limit ?? c.prevPeers.length;
      
      if (chLen > c.prevPeers.length) {
        chLen = c.prevPeers.length;
      }
      
      final controller = StreamController<AddrInfo>(sync: true);
      
      for (final ai in c.prevPeers.values) {
        if (controller.isClosed || (opts.limit != null && controller.hasListener && controller.sink is StreamSink<AddrInfo> && (controller.sink as dynamic).count >= opts.limit!)) {
          break;
        }
        controller.add(ai);
      }
      
      controller.close();
      return controller.stream;
    }
    
    // If a request is not already in progress setup a dispatcher for dispatching incoming peers
    if (!c.ongoing) {
      final peerStream = await _disc.findPeers(ns, options);
      
      c.ongoing = true;
      findPeerDispatcher(c, peerStream);
    }
    
    // Setup receiver channel for receiving peers from ongoing requests
    final evtController = StreamController<AddrInfo>();
    final peerController = StreamController<AddrInfo>();
    final rcvPeers = c.peers.values.toList();
    c.sendingChs[evtController] = opts.limit;
    
    findPeerReceiver(peerController, evtController.stream, rcvPeers);
    
    return peerController.stream;
  }
}

/// Interface for getting the current time
abstract class Clock {
  DateTime now();
}

/// Real implementation of Clock using system time
class RealClock implements Clock {
  @override
  DateTime now() {
    return DateTime.now();
  }
}

/// Cache for peer information with backoff
class BackoffCache {
  final BackoffStrategy strat;
  final Clock clock;
  
  DateTime nextDiscover = DateTime.fromMicrosecondsSinceEpoch(0);
  Map<PeerId, AddrInfo> prevPeers = {};
  Map<PeerId, AddrInfo> peers = {};
  Map<StreamController<AddrInfo>, int?> sendingChs = {};
  bool ongoing = false;
  
  BackoffCache(this.strat, this.clock);
}

/// Dispatches peers from a discovery query to all registered channels
void findPeerDispatcher(BackoffCache c, Stream<AddrInfo> peerStream) async {
  try {
    await for (final ai in peerStream) {
      // If we receive the same peer multiple times return the address union
      AddrInfo sendAi;
      if (c.peers.containsKey(ai.id)) {
        final prevAi = c.peers[ai.id]!;
        final combinedAi = AddrInfo.mergeAddrInfos(prevAi, ai);
        if (combinedAi != null) {
          sendAi = combinedAi;
        } else {
          continue;
        }
      } else {
        sendAi = ai;
      }
      
      c.peers[ai.id] = sendAi;
      
      for (final entry in c.sendingChs.entries) {
        final ch = entry.key;
        final rem = entry.value;
        if (rem == null || rem > 0) {
          ch.add(sendAi);
          if (rem != null) {
            c.sendingChs[ch] = rem - 1;
          }
        }
      }
    }
  } finally {
    // If the peer addresses have changed reset the backoff
    if (checkUpdates(c.prevPeers, c.peers)) {
      c.strat.reset();
      c.prevPeers = Map.from(c.peers);
    }
    c.nextDiscover = c.clock.now().add(c.strat.delay());
    
    c.ongoing = false;
    c.peers = {};
    
    for (final ch in c.sendingChs.keys) {
      await ch.close();
    }
    c.sendingChs = {};
  }
}

/// Receives peers from a dispatcher and forwards them to a result channel
void findPeerReceiver(
    StreamController<AddrInfo> peerController,
    Stream<AddrInfo> evtStream,
    List<AddrInfo> rcvPeers) async {
  try {
    await for (final ai in evtStream) {
      rcvPeers.add(ai);
      
      var sentAll = true;
      var i = 0;
      while (i < rcvPeers.length) {
        if (peerController.isClosed) {
          return;
        }
        
        try {
          peerController.add(rcvPeers[i]);
          i++;
        } catch (e) {
          rcvPeers = rcvPeers.sublist(i);
          sentAll = false;
          break;
        }
      }
      
      if (sentAll) {
        rcvPeers = [];
      }
    }
  } finally {
    for (final p in rcvPeers) {
      if (peerController.isClosed) {
        return;
      }
      peerController.add(p);
    }
    await peerController.close();
  }
}

/// Checks if the peer addresses have changed
bool checkUpdates(Map<PeerId, AddrInfo> orig, Map<PeerId, AddrInfo> update) {
  if (orig.length != update.length) {
    return true;
  }
  
  for (final entry in update.entries) {
    final p = entry.key;
    final ai = entry.value;
    
    if (orig.containsKey(p)) {
      final prevAi = orig[p]!;
      if (AddrInfo.mergeAddrInfos(prevAi, ai) != null) {
        return true;
      }
    } else {
      return true;
    }
  }
  
  return false;
}