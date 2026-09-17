import 'dart:async';

import 'package:dart_libp2p/core/peer/peer_id.dart';

import '../../../core/peer/addr_info.dart';
import '../../../core/host/host.dart';
import '../../../core/network/context.dart';
import 'backoff.dart';
import 'lru_cache.dart';

/// A utility to connect to peers, but only if we have not recently tried connecting to them already
class BackoffConnector {
  final LRUCache<PeerId, ConnCacheData> _cache;
  final Host _host;
  final Duration _connTryDur;
  final BackoffFactory _backoff;

  /// Creates a utility to connect to peers, but only if we have not recently tried connecting to them already
  /// cacheSize is the size of the LRU cache
  /// connectionTryDuration is how long we attempt to connect to a peer before giving up
  /// backoff describes the strategy used to decide how long to backoff after previously attempting to connect to a peer
  BackoffConnector(
    Host host,
    int cacheSize,
    Duration connectionTryDuration,
    BackoffFactory backoff,
  )   : _host = host,
        _cache = LRUCache<PeerId, ConnCacheData>(cacheSize),
        _connTryDur = connectionTryDuration,
        _backoff = backoff;

  /// Connect attempts to connect to the peers passed in by peerStream. Will not connect to peers if they are within the backoff period.
  /// As Connect will attempt to dial peers as soon as it learns about them, the caller should try to keep the number,
  /// and rate, of inbound peers manageable.
  Future<void> connect(Stream<AddrInfo> peerStream) async {
    await for (final pi in peerStream) {
      if (pi.id == _host.id || pi.id.toString().isEmpty) {
        continue;
      }

      var cachedPeer = _cache.get(pi.id);
      final now = DateTime.now();

      if (cachedPeer != null) {
        if (now.isBefore(cachedPeer.nextTry)) {
          continue;
        }

        cachedPeer.nextTry = now.add(cachedPeer.strat.delay());
      } else {
        cachedPeer = ConnCacheData(_backoff());
        cachedPeer.nextTry = now.add(cachedPeer.strat.delay());
        _cache.put(pi.id, cachedPeer);
      }

      // Connect to the peer
      _connectToPeer(pi);
    }
  }

  Future<void> _connectToPeer(AddrInfo pi) async {
    // Create a timeout for the connection attempt
    final timeoutCompleter = Completer<void>();
    Timer(
      _connTryDur,
      () {
        if (!timeoutCompleter.isCompleted) {
          timeoutCompleter.complete();
        }
      },
    );

    try {
      // Add the peer's addresses to the peerstore
      for (final addr in pi.addrs) {
        _host.network.peerstore.addrBook.addAddr(pi.id, addr, Duration(hours: 1));
      }

      // Create a context without timeout (timeout handled by Future.timeout below)
      final context = Context();

      // Try to dial the peer with timeout
      try {
        await _host.network.dialPeer(context, pi.id).timeout(_connTryDur);
        return; // Successfully connected
      } catch (e) {
      }
    } catch (e) {
    } finally {
      if (!timeoutCompleter.isCompleted) {
        timeoutCompleter.complete();
      }
    }
  }
}

/// Data stored in the connection cache
class ConnCacheData {
  DateTime nextTry = DateTime.fromMicrosecondsSinceEpoch(0);
  final BackoffStrategy strat;

  ConnCacheData(this.strat);
}
