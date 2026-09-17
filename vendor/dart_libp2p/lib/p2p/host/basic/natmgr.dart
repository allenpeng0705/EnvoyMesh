/// NAT manager implementation for the basic host.
/// 
/// This is a port of the Go implementation from go-libp2p/p2p/host/basic/natmgr.go
/// to Dart, using native Dart idioms.

import 'dart:async';
import 'dart:io';

import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/network.dart';
import 'package:dart_libp2p/core/network/notifiee.dart';
import 'package:logging/logging.dart';
import 'package:synchronized/synchronized.dart';

import '../../../core/network/conn.dart';
import 'package:dart_libp2p/p2p/nat/nat_behavior_tracker.dart';
import 'package:dart_libp2p/p2p/nat/nat_behavior.dart';
import 'package:dart_libp2p/p2p/nat/nat_traversal_strategy.dart';
import 'package:dart_libp2p/p2p/nat/stun/stun_client_pool.dart';

final _log = Logger('natmgr');

/// NATManager is a production-ready interface to manage NAT devices and mappings.
/// It leverages advanced NAT discovery, behavior tracking, and mapping logic.
abstract class NATManager {
  /// Gets the external mapping for a given multiaddress.
  MultiAddr? getMapping(MultiAddr addr);

  /// Returns true if a NAT device has been discovered.
  bool hasDiscoveredNAT();

  /// Returns the current NAT behavior.
  NatBehavior get currentBehavior;

  /// Returns the recommended NAT traversal strategy.
  TraversalStrategy get traversalStrategy;

  /// Registers a callback for NAT behavior changes.
  void addBehaviorChangeCallback(NatBehaviorChangeCallback callback);

  /// Removes a callback for NAT behavior changes.
  void removeBehaviorChangeCallback(NatBehaviorChangeCallback callback);

  /// Closes the NAT manager and releases any resources.
  Future<void> close();
}

/// Creates a new NAT manager.
NATManager newNATManager(Network net, {
  StunClientPool? stunClientPool,
  Duration? behaviorCheckInterval,
}) {
  return _NATManager(
    net,
    stunClientPool: stunClientPool,
    behaviorCheckInterval: behaviorCheckInterval,
  );
}

/// Entry represents a protocol and port combination.
class _Entry {
  final String protocol;
  final int port;

  _Entry(this.protocol, this.port);

  static _Entry? fromMultiaddr(MultiAddr addr) {
    final parts = addr.toString().split('/');
    String? protocol;
    int? port;
    for (int i = 0; i < parts.length - 1; i++) {
      if (parts[i] == 'tcp' || parts[i] == 'udp') {
        protocol = parts[i];
        if (i + 1 < parts.length) {
          port = int.tryParse(parts[i + 1]);
        }
        break;
      }
    }
    if (protocol == null || port == null) return null;
    return _Entry(protocol, port);
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is _Entry &&
          runtimeType == other.runtimeType &&
          protocol == other.protocol &&
          port == other.port;

  @override
  int get hashCode => protocol.hashCode ^ port.hashCode;

  @override
  String toString() => '$protocol:$port';
}

/// NATManager implementation.
class _NATManager implements NATManager {
  final Network _net;
  final Lock _lock = Lock();
  final StunClientPool _stunClientPool;
  late final NatBehaviorTracker _behaviorTracker;
  final Map<_Entry, MultiAddr> _externalMappings = {};
  final Map<_Entry, MultiAddr> _internalMappings = {};
  bool _closed = false;
  StreamSubscription? _trackerSub;

  _NATManager(
    this._net, {
    StunClientPool? stunClientPool,
    Duration? behaviorCheckInterval,
  }) : _stunClientPool = stunClientPool ?? StunClientPool(),
       _behaviorTracker = NatBehaviorTracker(
         stunClientPool: stunClientPool ?? StunClientPool(),
         checkInterval: behaviorCheckInterval ?? const Duration(minutes: 10),
       ) {
    _start();
  }

  void _start() async {
    await _behaviorTracker.initialize();
    _net.notify(_NATManagerNetNotifiee(this));
    await _syncMappings();
    // Listen for NAT behavior changes
    _behaviorTracker.addBehaviorChangeCallback((oldB, newB) async {
      _log.fine('NAT behavior changed: $newB');
      await _syncMappings();
    });
  }

  @override
  Future<void> close() async {
    if (_closed) return;
    _closed = true;
    await _trackerSub?.cancel();
    _behaviorTracker.stopPeriodicChecks();
    _externalMappings.clear();
    _internalMappings.clear();
  }

  @override
  bool hasDiscoveredNAT() {
    return _behaviorTracker.currentBehavior.mappingBehavior != NatMappingBehavior.unknown;
  }

  @override
  NatBehavior get currentBehavior => _behaviorTracker.currentBehavior;

  @override
  TraversalStrategy get traversalStrategy => NatTraversalStrategy.selectStrategy(currentBehavior);

  @override
  void addBehaviorChangeCallback(NatBehaviorChangeCallback callback) {
    _behaviorTracker.addBehaviorChangeCallback(callback);
  }

  @override
  void removeBehaviorChangeCallback(NatBehaviorChangeCallback callback) {
    _behaviorTracker.removeBehaviorChangeCallback(callback);
  }

  /// Synchronizes NAT mappings for all listen addresses.
  Future<void> _syncMappings() async {
    await _lock.synchronized(() async {
      _externalMappings.clear();
      _internalMappings.clear();
      for (final maddr in _net.listenAddresses) {
        final entry = _Entry.fromMultiaddr(maddr);
        if (entry == null) continue;
        _internalMappings[entry] = maddr;
        // Discover external mapping for this address
        final ext = await _discoverExternalMapping(entry);
        if (ext != null) {
          _externalMappings[entry] = ext;
        }
      }
    });
  }

  /// Attempts to discover the external mapping for a given protocol/port.
  Future<MultiAddr?> _discoverExternalMapping(_Entry entry) async {
    try {
      // Use the STUN client pool to discover external address/port
      // For UDP, we need to bind to the specific port we want to map
      if (entry.protocol == 'udp') {
        RawDatagramSocket? socket;
        try {
          // First try to bind to the requested port
          try {
            socket = await RawDatagramSocket.bind(InternetAddress.anyIPv4, entry.port);
          } catch (e) {
            // If that fails, bind to a random port
            socket = await RawDatagramSocket.bind(InternetAddress.anyIPv4, 0);
          }
          
          final response = await _stunClientPool.discover();
          if (response.externalAddress != null && response.externalPort != null) {
            final ipPart = response.externalAddress!.type == InternetAddressType.IPv4
                ? '/ip4/${response.externalAddress!.address}'
                : '/ip6/${response.externalAddress!.address}';
            final protocolPart = '/${entry.protocol}/${response.externalPort}';
            return MultiAddr('$ipPart$protocolPart');
          }
        } finally {
          socket?.close();
        }
      } else {
        // For TCP, we can use the default STUN discovery
        final response = await _stunClientPool.discover();
        if (response.externalAddress != null && response.externalPort != null) {
          final ipPart = response.externalAddress!.type == InternetAddressType.IPv4
              ? '/ip4/${response.externalAddress!.address}'
              : '/ip6/${response.externalAddress!.address}';
          final protocolPart = '/${entry.protocol}/${response.externalPort}';
          return MultiAddr('$ipPart$protocolPart');
        }
      }
    } catch (e) {
      _log.warning('Failed to discover external mapping for $entry: $e');
    }
    return null;
  }

  @override
  MultiAddr? getMapping(MultiAddr addr) {
    final entry = _Entry.fromMultiaddr(addr);
    if (entry == null) return null;
    return _externalMappings[entry];
  }

  // Called by the notifiee when listen addresses change
  void onListenChanged() {
    _syncMappings();
  }
}

/// Network notifiee for the NAT manager.
class _NATManagerNetNotifiee implements Notifiee {
  final _NATManager _mgr;

  _NATManagerNetNotifiee(this._mgr);

  @override
  void listen(Network network, MultiAddr addr) {
    _mgr.onListenChanged();
  }

  @override
  void listenClose(Network network, MultiAddr addr) {
    _mgr.onListenChanged();
  }

  @override
  Future<void> connected(Network network, Conn conn, {Duration? dialLatency}) async {
    return await Future.delayed(Duration(milliseconds: 10));
  }

  @override
  Future<void> disconnected(Network network, Conn conn) async {
    return await Future.delayed(Duration(milliseconds: 10));
  }
}
