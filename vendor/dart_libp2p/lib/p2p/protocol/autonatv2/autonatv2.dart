import 'dart:async';
import 'dart:math';

import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/p2p/protocol/autonatv2/client.dart';
import 'package:dart_libp2p/p2p/protocol/autonatv2/options.dart';
import 'package:dart_libp2p/p2p/protocol/autonatv2/server.dart';
import 'package:dart_libp2p/core/host/host.dart';
import 'package:dart_libp2p/core/network/network.dart';
import 'package:dart_libp2p/core/protocol/autonatv2/autonatv2.dart';
import 'package:dart_libp2p/p2p/multiaddr/protocol.dart' show Protocols;
import 'package:logging/logging.dart';

import '../../../core/event/bus.dart';
import '../../../core/event/identify.dart';
import '../../../core/event/protocol.dart';

final _log = Logger('autonatv2');

/// Implementation of the AutoNAT v2 service
class AutoNATv2Impl implements AutoNATv2 {
  final Host host;
  final bool allowPrivateAddrs;

  final AutoNATv2Server server;
  final AutoNATv2Client client;

  final _PeersMap _peers = _PeersMap();
  final Subscription? _subscription;

  /// Create a new AutoNAT v2 service
  ///
  /// [host] and [dialerHost] should have the same dialing capabilities. In case the host doesn't support
  /// a transport, dial back requests for address for that transport will be ignored.
  AutoNATv2Impl(Host host, Host dialerHost, {List<AutoNATv2Option>? options})
      : host = host,
        allowPrivateAddrs = _applyOptions(options).allowPrivateAddrs,
        server = AutoNATv2ServerImpl(host, dialerHost, _applyOptions(options)),
        client = AutoNATv2ClientImpl(host),
        _subscription = _subscribeToEvents(host);

  /// Apply options to the default settings
  static AutoNATv2Settings _applyOptions(List<AutoNATv2Option>? options) {
    var settings = defaultSettings();
    if (options != null) {
      for (final option in options) {
        settings = option(settings);
      }
    }
    return settings;
  }

  /// Subscribe to events for peer discovery
  static Subscription? _subscribeToEvents(Host host) {
    try {
      return host.eventBus.subscribe([
        EvtPeerIdentificationCompleted,
        EvtPeerProtocolsUpdated,
      ]);
    } catch (e) {
      _log.warning('Failed to subscribe to events: $e');
      return null;
    }
  }

  @override
  Future<void> start() async {
    client.start();
    server.start();

    // Process events for peer discovery
    _subscription?.stream.listen((event) {
      if (event is EvtPeerIdentificationCompleted) {
        _log.fine('Peer ${event.peer} identification completed, updating peer map');
        _updatePeer(event.peer);
      } else if (event is EvtPeerProtocolsUpdated) {
        _log.fine('Peer ${event.peer} protocols updated, updating peer map');
        _updatePeer(event.peer);
      }
    });
  }

  @override
  Future<void> close() async {
    await _subscription?.close();
    server.close();
    client.close();
  }

  @override
  bool get hasPeers => _peers._peers.isNotEmpty;

  @override
  Future<Result> getReachability(List<Request> requests) async {
    // Check if addresses are public
    if (!allowPrivateAddrs) {
      for (final request in requests) {
        if (!request.addr.isPublic()) {
          throw Exception('Private address cannot be verified by autonatv2: ${request.addr}');
        }
      }
    }

    // Get a random peer that supports AutoNAT v2
    final peerId = _peers.getRandom();
    if (peerId == null) {
      throw ClientErrors.noValidPeers;
    }

    // Filter out circuit addresses that route through the AutoNAT server peer
    // This prevents circular dependency where the server tries to dial through itself
    final filteredRequests = requests.where((req) {
      // Check if this is a circuit address
      final components = req.addr.components;
      for (int i = 0; i < components.length; i++) {
        final (protocol, value) = components[i];
        // If we find p2p-circuit, check the previous component for the relay peer ID
        if (protocol.code == Protocols.circuit.code && i > 0) {
          final (prevProtocol, prevValue) = components[i - 1];
          // If the previous component is a p2p peer ID, check if it matches our AutoNAT server
          if (prevProtocol.code == Protocols.p2p.code) {
            try {
              final relayPeerId = PeerId.fromString(prevValue);
              if (relayPeerId == peerId) {
                _log.fine('Filtering out circuit address that routes through AutoNAT server $peerId: ${req.addr}');
                return false; // Exclude this address
              }
            } catch (e) {
              // Invalid peer ID in address, skip filtering
            }
          }
        }
      }
      return true; // Include this address
    }).toList();

    if (filteredRequests.isEmpty) {
      throw Exception('No valid addresses to check after filtering circuit addresses through AutoNAT server $peerId');
    }

    try {
      // Get reachability from the peer with filtered requests
      final result = await client.getReachability(peerId, filteredRequests);
      _log.fine('Reachability check with $peerId successful');
      return result;
    } catch (e) {
      _log.fine('Reachability check with $peerId failed, err: $e');
      throw Exception('Reachability check with $peerId failed: $e');
    }
  }

  /// Update a peer in the peers map
  Future<void> _updatePeer(PeerId peerId) async {
    // Check if the peer supports the AutoNAT v2 protocol
    final protocols = await host.peerStore.protoBook.getProtocols(peerId);
    final connectedness = host.network.connectedness(peerId);

    _log.fine('Updating peer $peerId: protocols=$protocols, connectedness=$connectedness');

    if (protocols.contains(AutoNATv2Protocols.dialProtocol) && connectedness == Connectedness.connected) {
      _log.fine('Adding peer $peerId to AutoNAT v2 peer map (supports ${AutoNATv2Protocols.dialProtocol})');
      _peers.put(peerId);
    } else {
      _log.fine('Removing peer $peerId from AutoNAT v2 peer map');
      _peers.delete(peerId);
    }
  }
}

/// Map of peers that support AutoNAT v2
class _PeersMap {
  final Map<PeerId, int> _peerIdx = {};
  final List<PeerId> _peers = [];

  /// Get a random peer from the map
  PeerId? getRandom() {
    if (_peers.isEmpty) {
      return null;
    }
    return _peers[Random().nextInt(_peers.length)];
  }

  /// Add a peer to the map
  void put(PeerId peerId) {
    if (_peerIdx.containsKey(peerId)) {
      return;
    }
    _peers.add(peerId);
    _peerIdx[peerId] = _peers.length - 1;
  }

  /// Remove a peer from the map
  void delete(PeerId peerId) {
    final idx = _peerIdx[peerId];
    if (idx == null) {
      return;
    }

    // Move the last peer to the position of the removed peer
    _peers[idx] = _peers.last;
    _peerIdx[_peers[idx]] = idx;

    // Remove the last peer
    _peers.removeLast();
    _peerIdx.remove(peerId);
  }
}