import 'dart:async';

import 'package:dart_libp2p/core/host/host.dart';
import 'package:dart_libp2p/core/peer/addr_info.dart';
import 'package:dart_libp2p/core/peerstore.dart';
import 'package:dart_libp2p/core/protocol/protocol.dart';
import 'package:dart_libp2p/core/protocol/switch.dart';
import 'package:dart_libp2p/core/routing/routing.dart';
import 'package:dart_libp2p/core/network/network.dart';
import 'package:dart_libp2p/core/network/stream.dart';
import 'package:dart_libp2p/core/network/context.dart';
import 'package:dart_libp2p/core/network/common.dart'; // For Connectedness
import 'package:dart_libp2p/core/connmgr/conn_manager.dart';
import 'package:dart_libp2p/core/event/bus.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/p2p/multiaddr/protocol.dart' as multiaddr_protocol;
import 'package:dart_libp2p/p2p/protocol/holepunch.dart'; // Added for HolePunchService

// User added this, assuming it brings PeerId class for PeerId.fromString
import '../../../core/peer/peer_id.dart'; 

// TODO: Consider if a logger is needed, similar to Go's `log = logging.Logger("routedhost")`
// import 'package:logging/logging.dart';
// final _log = Logger('RoutedHost');

/// RoutedHost is a p2p Host that includes a routing system.
/// This allows the Host to find the addresses for peers when
/// it does not have them.
class RoutedHost implements Host {
  final Host _host; // The host we're wrapping
  final PeerRouting _routing;

  RoutedHost(this._host, this._routing);

  @override
  PeerId get id => _host.id;

  @override
  Peerstore get peerStore => _host.peerStore;

  @override
  List<MultiAddr> get addrs => _host.addrs;

  @override
  Network get network => _host.network;

  @override
  ProtocolSwitch get mux => _host.mux;

  @override
  ConnManager get connManager => _host.connManager;

  @override
  EventBus get eventBus => _host.eventBus;

  @override
  HolePunchService? get holePunchService => _host.holePunchService;

  @override
  Future<void> close() {
    // No need to close _routing, as we don't own it.
    return _host.close();
  }

  @override
  Future<void> start() {
    return _host.start();
  }

  @override
  void setStreamHandler(ProtocolID pid, StreamHandler handler) {
    _host.setStreamHandler(pid, handler);
  }

  @override
  void setStreamHandlerMatch(ProtocolID pid, bool Function(ProtocolID) match, StreamHandler handler) {
    _host.setStreamHandlerMatch(pid, match, handler);
  }

  @override
  void removeStreamHandler(ProtocolID pid) {
    _host.removeStreamHandler(pid);
  }

  Future<List<MultiAddr>> _findPeerAddrs(Context? ctx, PeerId peerId) async {
    // TODO: In Go, context is passed to FindPeer.
    // The Dart PeerRouting.findPeer takes RoutingOptions.
    // We need to map ctx to RoutingOptions if necessary, or decide if ctx is needed here.
    // For now, not passing any specific RoutingOptions derived from Context.
    AddrInfo? peerInfo;
    try {
      // TODO: map context to RoutingOptions if needed for findPeer
      peerInfo = await _routing.findPeer(peerId); 
    } catch (e) {
      // _log.warning('Failed to find peer $peerId via routing: $e');
      rethrow; // Propagate the error
    }

    if (peerInfo == null) {
      // _log.severe('Routing failure: no info found for peer. Wanted $peerId');
      throw Exception('Routing failure: no info found for peer $peerId');
    }
    if (peerInfo.id != peerId) {
      // _log.severe('Routing failure: got info for wrong peer. Wanted $peerId, got ${peerInfo.id}');
      throw Exception('Routing failure: provided addrs for different peer. Wanted $peerId, got ${peerInfo.id}');
    }
    return peerInfo.addrs;
  }

  @override
  Future<void> connect(AddrInfo pi, {Context? context}) async {
    final effectiveCtx = context ?? Context(); // Ensure context is not null

    // Use specific getters from Context
    bool forceDirect = effectiveCtx.getForceDirectDial().$1;
    bool canUseLimitedConn = effectiveCtx.getAllowLimitedConn().$1;

    if (!forceDirect) {
      final connectedness = network.connectedness(pi.id);
      if (connectedness == Connectedness.connected ||
          (canUseLimitedConn && connectedness == Connectedness.limited)) {
        return;
      }
    }

    if (pi.addrs.isNotEmpty) {
      // The Go version uses peerstore.TempAddrTTL.
      // Dart `AddressTTL.tempAddrTTL` (Duration(minutes: 2)) matches Go's `time.Second * 120`.
      await peerStore.addrBook.addAddrs(pi.id, pi.addrs, AddressTTL.tempAddrTTL);
    }

    List<MultiAddr> currentAddrs = await peerStore.addrBook.addrs(pi.id);
    if (currentAddrs.isEmpty) {
      try {
        currentAddrs = await _findPeerAddrs(effectiveCtx, pi.id);
        if (currentAddrs.isEmpty) {
          throw Exception('No addresses found for peer ${pi.id} after routing');
        }
        // Add these newly found addresses to the peerstore
        peerStore.addrBook.addAddrs(pi.id, currentAddrs, AddressTTL.tempAddrTTL);
      } catch (e) {
        // _log.warning('Failed to find peer addresses for ${pi.id}: $e');
        rethrow;
      }
    }
    
    // Issue 448: if our address set includes routed specific relay addrs,
    // we need to make sure the relay's addr itself is in the peerstore or else
    // we won't be able to dial it.
    for (final addr in currentAddrs) {
      if (addr.hasProtocol(multiaddr_protocol.Protocols.circuit.name)) { // Check if it's a relay address
        final String? relayIdStr = addr.valueForProtocol(multiaddr_protocol.Protocols.p2p.name);
        if (relayIdStr == null) {
            // _log.warning('Relay address $addr missing P2P component value');
            continue;
        }
        final PeerId relayId;
        try {
          relayId = PeerId.fromString(relayIdStr);
        } catch (e) {
          // _log.warning('Failed to parse relay ID in address $addr: $e');
          continue;
        }

        final relayAddrsInStore = await peerStore.addrBook.addrs(relayId);
        if (relayAddrsInStore.isNotEmpty) {
          continue; // We already have addrs for this relay
        }

        try {
          final foundRelayAddrs = await _findPeerAddrs(effectiveCtx, relayId);
          if (foundRelayAddrs.isNotEmpty) {
            peerStore.addrBook.addAddrs(relayId, foundRelayAddrs, AddressTTL.tempAddrTTL);
          } else {
            // _log.info('Could not find addresses for relay peer $relayId');
          }
        } catch (e) {
          // _log.warning('Failed to find relay $relayId addresses: $e');
          continue;
        }
      }
    }


    final addrInfoToConnect = AddrInfo(pi.id, currentAddrs);

    try {
      await _host.connect(addrInfoToConnect, context: effectiveCtx);
    } catch (connectError) {
      // We couldn't connect. Let's check if we have the most
      // up-to-date addresses for the given peer.
      List<MultiAddr> newAddrs;
      try {
        newAddrs = await _findPeerAddrs(effectiveCtx, pi.id);
      } catch (findErr) {
        // _log.debug('Failed to find more peer addresses for ${pi.id}: $findErr');
        rethrow ; // Original connect error is more relevant
      }

      if (newAddrs.isEmpty && currentAddrs.isEmpty) {
         rethrow ; // No addresses before, no new addresses now.
      }
      
      final currentAddrsSet = Set<String>.from(currentAddrs.map((a) => a.toString()));
      bool foundNewUniqueAddr = false;
      for (final newAddr in newAddrs) {
        if (!currentAddrsSet.contains(newAddr.toString())) {
          foundNewUniqueAddr = true;
          break;
        }
      }

      if (foundNewUniqueAddr) {
        // _log.info('Found new addresses for ${pi.id}, attempting to connect again.');
        // Add new addresses to peerstore before retrying
        peerStore.addrBook.addAddrs(pi.id, newAddrs, AddressTTL.tempAddrTTL);
        final updatedAddrInfo = AddrInfo(pi.id, newAddrs);
        // Retry connection with new addresses
        try {
          await _host.connect(updatedAddrInfo, context: effectiveCtx);
          return; // Successfully connected on retry
        } catch (retryError) {
          // _log.warning('Still failed to connect to ${pi.id} after finding new addresses: $retryError');
          rethrow ; // Throw the error from the retry attempt
        }
      }
      // No appropriate new address found, or all new addresses were already known.
      // Return the original dial error.
      rethrow;
    }
  }

  @override
  Future<P2PStream> newStream(PeerId p, List<ProtocolID> pids, Context context) async {
    final effectiveCtx = context; // context is now non-nullable due to interface
    
    // Use specific getter from Context
    bool noDial = effectiveCtx.getNoDial().$1;

    if (!noDial) {
      // Ensure we have a connection, with peer addresses resolved by the routing system.
      // It is not sufficient to let the underlying host connect, it will most likely not have
      // any addresses for the peer without any prior connections.
      try {
        // We only need the ID for connect, addresses will be resolved.
        await connect(AddrInfo(p, []), context: effectiveCtx);
      } catch (e) {
        // _log.warning('Failed to connect to peer $p before opening stream: $e');
        rethrow; // Propagate connection error
      }
    }
    // Call with positional context argument
    return _host.newStream(p, pids, effectiveCtx);
  }
}
