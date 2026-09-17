/// Observed address manager for libp2p.
///
/// This file contains the implementation of the observed address manager, which
/// tracks addresses that peers have observed for us.
///
/// This is a port of the Go implementation from go-libp2p/p2p/protocol/identify/obsaddr.go
/// to Dart, using native Dart idioms.

import 'dart:async';
import 'dart:collection';
import 'dart:io';
import 'dart:typed_data';

import 'package:dart_libp2p/p2p/multiaddr/protocol.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/network/network.dart';
import 'package:logging/logging.dart';

import '../../../core/event/nattype.dart';

final _log = Logger('identify.obsaddr');

/// ActivationThresh sets how many times an address must be seen as "activated"
/// and therefore advertised to other peers as an address that the local peer
/// can be contacted on. The "seen" events expire by default after 40 minutes
/// (OwnObservedAddressTTL * ActivationThreshold). The are cleaned up during
/// the GC rounds set by GCInterval.
const activationThresh = 4;

/// observedAddrManagerWorkerChannelSize defines how many addresses can be enqueued
/// for adding to an ObservedAddrManager.
const observedAddrManagerWorkerChannelSize = 16;

const maxExternalThinWaistAddrsPerLocalAddr = 3;

/// thinWaist is a class that stores the address along with it's thin waist prefix and rest of the multiaddr
class ThinWaist {
  final MultiAddr addr;
  final MultiAddr tw;
  final MultiAddr rest;

  ThinWaist({required this.addr, required this.tw, required this.rest});
}

/// thinWaistWithCount is a thinWaist along with the count of the connection that have it as the local address
class ThinWaistWithCount {
  final ThinWaist thinWaist;
  int count;

  ThinWaistWithCount({required this.thinWaist, this.count = 0});
}

/// Creates a thin waist form of a multiaddress.
/// 
/// A thin waist address is an address that contains an IP and a TCP/UDP port.
ThinWaist? thinWaistForm(MultiAddr a) {
  int i = 0;
  final components = a.components;

  if (components.length < 2) {
    _log.fine('Not a thinwaist address: $a (too few components)');
    return null;
  }

  // Check first component is IP
  final (protocol1, _ ) = components[0];
  if (protocol1.code != Protocols.ip4 &&
      protocol1.code != Protocols.ip6) {
    _log.fine('Not a thinwaist address: $a (first component not IP)');
    return null;
  }

  final (protocol2, _ ) = components[1];
  // Check second component is TCP or UDP
  if (protocol2.code != Protocols.tcp &&
      protocol2.code != Protocols.udp) {
    _log.fine('Not a thinwaist address: $a (second component not TCP/UDP)');
    return null;
  }

  // Split the address into thin waist and rest
  // Create a multiaddr with just the first two components
  final twStr = "/${protocol1.name}/${components[0].$2}/${protocol2.name}/${components[1].$2}";
  final tw = MultiAddr(twStr);

  final restComponents = components.sublist(2);
  final rest = restComponents.isEmpty 
      ? MultiAddr("") 
      : MultiAddr(restComponents.map((c) => "/${c.$1.name}/${c.$2}").join(""));

  return ThinWaist(addr: a, tw: tw, rest: rest);
}

/// getObserver returns the observer for the multiaddress
/// For an IPv4 multiaddress the observer is the IP address
/// For an IPv6 multiaddress the observer is the first /56 prefix of the IP address
String? getObserver(MultiAddr ma) {
  try {
    InternetAddress? ip = ma.toIP();
    if (ip == null) {
      return null;
    }

    if (ip.type == InternetAddressType.IPv4) {
      return ip.address;
    } else {
      // For IPv6, use the /56 prefix as the observer
      // This is a simplification - in a real implementation we would need to mask the IP
      // with a /56 CIDR mask, but for now we'll just use the first 7 bytes (56 bits)
      final bytes = ip.rawAddress;
      if (bytes.length >= 7) {
        return bytes.sublist(0, 7).toString();
      }
      return ip.address;
    }
  } catch (e) {
    _log.fine('Error getting observer for $ma: $e');
    return null;
  }
}

/// connMultiaddrs provides isClosed along with network.ConnMultiaddrs. It is easier to mock this than network.Conn
abstract class ConnMultiaddrs {
  MultiAddr get localMultiaddr;
  MultiAddr get remoteMultiaddr;
  bool isClosed();
}

/// Adapter to make Conn implement ConnMultiaddrs
class ConnAdapter implements ConnMultiaddrs {
  final Conn conn;

  ConnAdapter(this.conn);

  @override
  MultiAddr get localMultiaddr => conn.localMultiaddr;

  @override
  MultiAddr get remoteMultiaddr => conn.remoteMultiaddr;

  @override
  bool isClosed() => conn.isClosed;

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! ConnAdapter) return false;
    return conn == other.conn;
  }

  @override
  int get hashCode => conn.hashCode;
}

/// observerSetCacheSize is the number of transport sharing the same thinwaist (tcp, ws, wss), (quic, webtransport, webrtc-direct)
/// This is 3 in practice right now, but keep a buffer of 3 extra elements
const observerSetCacheSize = 5;

/// observerSet is the set of observers who have observed ThinWaistAddr
class ObserverSet {
  final MultiAddr observedTWAddr;
  final Map<String, int> observedBy = {};

  // Cache of localMultiaddr rest(addr - thinwaist) => output multiaddr
  final Map<String, MultiAddr> _cachedMultiaddrs = {};

  ObserverSet({required this.observedTWAddr});

  MultiAddr cacheMultiaddr(MultiAddr? addr) {
    if (addr == null) {
      return observedTWAddr;
    }

    final addrStr = String.fromCharCodes(addr.toBytes());
    if (_cachedMultiaddrs.containsKey(addrStr)) {
      return _cachedMultiaddrs[addrStr]!;
    }

    if (_cachedMultiaddrs.length == observerSetCacheSize) {
      // Remove one entry if we will go over the limit
      _cachedMultiaddrs.remove(_cachedMultiaddrs.keys.first);
    }

    // Extract the components from the addr parameter
    final addrComponents = addr.components.map((c) => "/${c.$1.name}/${c.$2}").join("");

    // Create a new Multiaddr by combining the observed thin waist address with the components from addr
    final result = MultiAddr(observedTWAddr.toString() + addrComponents);
    _cachedMultiaddrs[addrStr] = result;
    return result;
  }
}

class Observation {
  final ConnMultiaddrs conn;
  final MultiAddr observed;

  Observation({required this.conn, required this.observed});
}

/// ObservedAddrManager maps connection's local multiaddrs to their externally observable multiaddress
class ObservedAddrManager {
  // Our listen addrs
  final List<MultiAddr> Function() _listenAddrs;

  // Our listen addrs with interface addrs for unspecified addrs
  final Future<List<MultiAddr>> Function() _interfaceListenAddrs;

  // All host addrs
  final List<MultiAddr> Function() _hostAddrs;

  // Any normalization required before comparing. Useful to remove certhash
  final MultiAddr Function(MultiAddr) _normalize;

  // Worker channel for new observations
  final _observationController = StreamController<Observation>();

  // Notified on recording an observation
  final _addrRecordedController = StreamController<void>.broadcast();

  // For closing
  final _completer = Completer<void>();
  bool _closed = false;

  // local thin waist => external thin waist => observerSet
  final Map<String, Map<String, ObserverSet>> _externalAddrs = {};

  // connObservedTWAddrs maps the connection to the last observed thin waist multiaddr on that connection
  final Map<ConnMultiaddrs, MultiAddr> _connObservedTWAddrs = {};

  // localMultiaddr => thin waist form with the count of the connections the multiaddr
  // was seen on for tracking our local listen addresses
  final Map<String, ThinWaistWithCount> _localAddrs = {};

  /// Creates a new observed address manager.
  ObservedAddrManager({
    required List<MultiAddr> Function() listenAddrs,
    required List<MultiAddr> Function() hostAddrs,
    required Future<List<MultiAddr>> Function() interfaceListenAddrs,
    MultiAddr Function(MultiAddr)? normalize,
  }) : 
    _listenAddrs = listenAddrs,
    _hostAddrs = hostAddrs,
    _interfaceListenAddrs = interfaceListenAddrs,
    _normalize = normalize ?? ((addr) => addr) {

    // Start the worker
    _startWorker();
  }

  void _startWorker() {
    _observationController.stream.listen((observation) {
      _maybeRecordObservation(observation.conn, observation.observed);
    }, onDone: () {
      if (!_completer.isCompleted) {
        _completer.complete();
      }
    });
  }

  /// AddrsFor return all activated observed addresses associated with the given
  /// (resolved) listen address.
  List<MultiAddr> addrsFor(MultiAddr? addr) {
    if (addr == null) {
      return [];
    }

    final tw = thinWaistForm(_normalize(addr));
    if (tw == null) {
      return [];
    }

    final observerSets = _getTopExternalAddrs(String.fromCharCodes(tw.tw.toBytes()));
    final result = <MultiAddr>[];

    for (final s in observerSets) {
      result.add(s.cacheMultiaddr(tw.rest));
    }

    return result;
  }

  /// Addrs return all activated observed addresses
  List<MultiAddr> addrs() {
    final m = <String, List<ObserverSet>>{};

    for (final localTWStr in _externalAddrs.keys) {
      m[localTWStr] = [...?m[localTWStr], ..._getTopExternalAddrs(localTWStr)];
    }

    final addrs = <MultiAddr>[];

    for (final t in _localAddrs.values) {
      final twStr = String.fromCharCodes(t.thinWaist.tw.toBytes());
      for (final s in m[twStr] ?? []) {
        addrs.add(s.cacheMultiaddr(t.thinWaist.rest));
      }
    }

    return _appendInferredAddrs(m, addrs);
  }

  /// appendInferredAddrs infers the external address of other transports that
  /// share the local thin waist with a transport that we have do observations for.
  ///
  /// e.g. If we have observations for a QUIC address on port 9000, and we are
  /// listening on the same interface and port 9000 for WebTransport, we can infer
  /// the external WebTransport address.
  List<MultiAddr> _appendInferredAddrs(
    Map<String, List<ObserverSet>>? twToObserverSets, 
    List<MultiAddr> addrs
  ) {
    twToObserverSets ??= {};

    for (final localTWStr in _externalAddrs.keys) {
      twToObserverSets[localTWStr] = [
        ...?twToObserverSets[localTWStr],
        ..._getTopExternalAddrs(localTWStr)
      ];
    }

    List<MultiAddr> lAddrs = [];
    try {
      // This is async in Dart, but we need to make it sync for this method
      // In a real implementation, we would make this method async
      // For now, we'll just use the listen addresses
      lAddrs = _listenAddrs();
    } catch (e) {
      _log.warning('Failed to get interface resolved listen addrs. Using just the listen addrs: $e');
    }

    final seenTWs = <String>{};

    for (final a in lAddrs) {
      final aStr = String.fromCharCodes(a.toBytes());

      if (_localAddrs.containsKey(aStr)) {
        // We already have this address in the list
        continue;
      }

      if (seenTWs.contains(aStr)) {
        // We've already added this
        continue;
      }

      seenTWs.add(aStr);
      final normalizedAddr = _normalize(a);
      final t = thinWaistForm(normalizedAddr);

      if (t == null) {
        continue;
      }

      final twStr = String.fromCharCodes(t.tw.toBytes());
      for (final s in twToObserverSets[twStr] ?? []) {
        addrs.add(s.cacheMultiaddr(t.rest));
      }
    }

    return addrs;
  }

  List<ObserverSet> _getTopExternalAddrs(String localTWStr) {
    final observerSets = <ObserverSet>[];

    for (final v in _externalAddrs[localTWStr]?.values ?? <ObserverSet>[]) {
      if (v.observedBy.length >= activationThresh) {
        observerSets.add(v);
      }
    }

    // Sort by number of observers (descending)
    observerSets.sort((a, b) {
      final diff = b.observedBy.length - a.observedBy.length;
      if (diff != 0) {
        return diff;
      }

      // In case we have elements with equal counts,
      // keep the address list stable by using the lexicographically smaller address
      final as = a.observedTWAddr.toString();
      final bs = b.observedTWAddr.toString();
      return as.compareTo(bs);
    });

    final n = observerSets.length > maxExternalThinWaistAddrsPerLocalAddr
        ? maxExternalThinWaistAddrsPerLocalAddr
        : observerSets.length;

    return observerSets.sublist(0, n);
  }

  /// Record enqueues an observation for recording
  void record(Conn conn, MultiAddr observed) {
    if (_closed) return;

    try {
      _observationController.add(Observation(
        conn: ConnAdapter(conn),
        observed: observed,
      ));
    } catch (e) {
      _log.fine('Dropping address observation due to full buffer: $e');
    }
  }

  bool _isRelayedAddress(MultiAddr a) {
    try {
      a.valueForProtocol(Protocols.circuit.name);
      return true;
    } catch (_) {
      return false;
    }
  }

  bool _shouldRecordObservation(
    ConnMultiaddrs? conn, 
    MultiAddr? observed, 
    {required ThinWaist? localTW, required ThinWaist? observedTW}
  ) {
    if (conn == null || observed == null) {
      return false;
    }

    // Ignore observations from loopback nodes. We already know our loopback addresses.
    if (observed.isLoopback()) {
      return false;
    }

    // Ignore NAT64 addresses (not implemented in Dart yet)
    // TODO: Implement NAT64 check

    // Ignore p2p-circuit addresses. These are the observed address of the relay.
    // Not useful for us.
    if (_isRelayedAddress(observed)) {
      return false;
    }

    // we should only use ObservedAddr when our connection's LocalAddr is one
    // of our ListenAddrs. If we Dial out using an ephemeral addr, knowing that
    // address's external mapping is not very useful because the port will not be
    // the same as the listen addr.
    List<MultiAddr> ifaceaddrs = [];
    try {
      // This is async in Dart, but we need to make it sync for this method
      // In a real implementation, we would make this method async
      // For now, we'll just use the listen addresses
      ifaceaddrs = _listenAddrs();
    } catch (e) {
      _log.fine('Failed to get interface listen addrs: $e');
      return false;
    }

    for (var i = 0; i < ifaceaddrs.length; i++) {
      ifaceaddrs[i] = _normalize(ifaceaddrs[i]);
    }

    final local = _normalize(conn.localMultiaddr);

    final listenAddrs = _listenAddrs();
    for (var i = 0; i < listenAddrs.length; i++) {
      listenAddrs[i] = _normalize(listenAddrs[i]);
    }

    if (!ifaceaddrs.contains(local) && !listenAddrs.contains(local)) {
      // not in our list
      return false;
    }

    final localThinWaist = thinWaistForm(local);
    if (localThinWaist == null) {
      return false;
    }
    localTW = localThinWaist;

    final observedThinWaist = thinWaistForm(_normalize(observed));
    if (observedThinWaist == null) {
      return false;
    }
    observedTW = observedThinWaist;

    final hostAddrs = _hostAddrs();
    for (var i = 0; i < hostAddrs.length; i++) {
      hostAddrs[i] = _normalize(hostAddrs[i]);
    }

    // We should reject the connection if the observation doesn't match the
    // transports of one of our advertised addresses.
    if (!_hasConsistentTransport(observed, hostAddrs) &&
        !_hasConsistentTransport(observed, listenAddrs)) {
      _log.fine(
        'Observed multiaddr doesn\'t match the transports of any announced addresses: '
        'from ${conn.remoteMultiaddr}, observed $observed'
      );
      return false;
    }

    return true;
  }

  /// HasConsistentTransport returns true if the address 'a' shares a
  /// protocol set with any address in the green set. This is used
  /// to check if a given address might be one of the addresses a peer is
  /// listening on.
  bool _hasConsistentTransport(MultiAddr a, List<MultiAddr> green) {
    final aProtos = a.protocols;

    for (final ga in green) {
      final gaProtos = ga.protocols;

      if (aProtos.length != gaProtos.length) {
        continue;
      }

      bool match = true;
      for (var i = 0; i < aProtos.length; i++) {
        if (aProtos[i].code != gaProtos[i].code) {
          match = false;
          break;
        }
      }

      if (match) {
        return true;
      }
    }

    return false;
  }

  void _maybeRecordObservation(ConnMultiaddrs conn, MultiAddr observed) {
    ThinWaist? localTW;
    ThinWaist? observedTW;

    final shouldRecord = _shouldRecordObservation(
      conn, 
      observed, 
      localTW: localTW, 
      observedTW: observedTW
    );

    if (!shouldRecord || localTW == null || observedTW == null) {
      return;
    }

    _log.fine('Added own observed listen addr: conn=$conn, observed=$observed');

    _recordObservation(conn, localTW, observedTW);
    _addrRecordedController.add(null);
  }

  void _recordObservation(ConnMultiaddrs conn, ThinWaist localTW, ThinWaist observedTW) {
    if (conn.isClosed()) {
      // dont record if the connection is already closed. Any previous observations will be removed in
      // the disconnected callback
      return;
    }

    final localTWStr = String.fromCharCodes(localTW.tw.toBytes());
    final observedTWStr = String.fromCharCodes(observedTW.tw.toBytes());

    final observer = getObserver(conn.remoteMultiaddr);
    if (observer == null) {
      return;
    }

    final prevObservedTWAddr = _connObservedTWAddrs[conn];
    if (prevObservedTWAddr == null) {
      final localAddrStr = String.fromCharCodes(localTW.addr.toBytes());
      var t = _localAddrs[localAddrStr];
      if (t == null) {
        t = ThinWaistWithCount(thinWaist: localTW);
        _localAddrs[localAddrStr] = t;
      }
      t.count++;
    } else {
      if (prevObservedTWAddr.equals(observedTW.tw)) {
        // we have received the same observation again, nothing to do
        return;
      }
      // if we have a previous entry remove it from externalAddrs
      _removeExternalAddrs(observer, localTWStr, String.fromCharCodes(prevObservedTWAddr.toBytes()));
      // no need to change the localAddrs map here
    }

    _connObservedTWAddrs[conn] = observedTW.tw;
    _addExternalAddrs(observedTW.tw, observer, localTWStr, observedTWStr);
  }

  void _removeExternalAddrs(String observer, String localTWStr, String observedTWStr) {
    final s = _externalAddrs[localTWStr]?[observedTWStr];
    if (s == null) {
      return;
    }

    s.observedBy[observer] = (s.observedBy[observer] ?? 0) - 1;
    if (s.observedBy[observer] == null || s.observedBy[observer]! <= 0) {
      s.observedBy.remove(observer);
    }

    if (s.observedBy.isEmpty) {
      _externalAddrs[localTWStr]?.remove(observedTWStr);
    }

    if (_externalAddrs[localTWStr]?.isEmpty ?? false) {
      _externalAddrs.remove(localTWStr);
    }
  }

  void _addExternalAddrs(MultiAddr observedTWAddr, String observer, String localTWStr, String observedTWStr) {
    var s = _externalAddrs[localTWStr]?[observedTWStr];
    if (s == null) {
      s = ObserverSet(observedTWAddr: observedTWAddr);

      _externalAddrs[localTWStr] ??= {};
      _externalAddrs[localTWStr]![observedTWStr] = s;
    }

    s.observedBy[observer] = (s.observedBy[observer] ?? 0) + 1;
  }

  /// removeConn removes a connection from the observed address manager.
  void removeConn(Conn? conn) {
    if (conn == null) {
      return;
    }

    final connAdapter = ConnAdapter(conn);
    final observedTWAddr = _connObservedTWAddrs[connAdapter];
    if (observedTWAddr == null) {
      return;
    }

    _connObservedTWAddrs.remove(connAdapter);

    // normalize before obtaining the thinWaist so that we are always dealing
    // with the normalized form of the address
    final localTW = thinWaistForm(_normalize(conn.localMultiaddr));
    if (localTW == null) {
      return;
    }

    final localAddrStr = String.fromCharCodes(localTW.addr.toBytes());
    final t = _localAddrs[localAddrStr];
    if (t == null) {
      return;
    }

    t.count--;
    if (t.count <= 0) {
      _localAddrs.remove(localAddrStr);
    }

    final observer = getObserver(conn.remoteMultiaddr);
    if (observer == null) {
      return;
    }

    _removeExternalAddrs(
      observer, 
      String.fromCharCodes(localTW.tw.toBytes()),
      String.fromCharCodes(observedTWAddr.toBytes())
    );

    _addrRecordedController.add(null);
  }

  /// getNATType returns the NAT type for TCP and UDP.
  (NATDeviceType, NATDeviceType) getNATType() {
    var tcpNATType = NATDeviceType.unknown;
    var udpNATType = NATDeviceType.unknown;

    final tcpCounts = <int>[];
    final udpCounts = <int>[];
    var tcpTotal = 0;
    var udpTotal = 0;

    for (final m in _externalAddrs.values) {
      bool? isTCP;

      for (final v in m.values) {
        try {
          v.observedTWAddr.valueForProtocol(Protocols.tcp.name);
          isTCP = true;
        } catch (_) {
          isTCP = false;
        }
        break;
      }

      for (final v in m.values) {
        if (isTCP == true) {
          tcpCounts.add(v.observedBy.length);
          tcpTotal += v.observedBy.length;
        } else {
          udpCounts.add(v.observedBy.length);
          udpTotal += v.observedBy.length;
        }
      }
    }

    // Sort in descending order
    tcpCounts.sort((a, b) => b.compareTo(a));
    udpCounts.sort((a, b) => b.compareTo(a));

    var tcpTopCounts = 0;
    var udpTopCounts = 0;

    for (var i = 0; i < maxExternalThinWaistAddrsPerLocalAddr && i < tcpCounts.length; i++) {
      tcpTopCounts += tcpCounts[i];
    }

    for (var i = 0; i < maxExternalThinWaistAddrsPerLocalAddr && i < udpCounts.length; i++) {
      udpTopCounts += udpCounts[i];
    }

    // If the top elements cover more than 1/2 of all the observations, there's a > 50% chance that
    // hole punching based on outputs of observed address manager will succeed
    if (tcpTotal >= 3 * maxExternalThinWaistAddrsPerLocalAddr) {
      if (tcpTopCounts >= tcpTotal ~/ 2) {
        tcpNATType = NATDeviceType.cone;
      } else {
        tcpNATType = NATDeviceType.symmetric;
      }
    }

    if (udpTotal >= 3 * maxExternalThinWaistAddrsPerLocalAddr) {
      if (udpTopCounts >= udpTotal ~/ 2) {
        udpNATType = NATDeviceType.cone;
      } else {
        udpNATType = NATDeviceType.symmetric;
      }
    }

    return (tcpNATType, udpNATType);
  }

  /// Close stops the observed address manager.
  Future<void> close() async {
    if (_closed) return;
    _closed = true;

    await _observationController.close();
    await _completer.future;
  }
}
