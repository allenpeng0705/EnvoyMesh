import 'dart:async';
import 'dart:collection';
import 'dart:typed_data';

import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/p2p/transport/listener.dart';
import 'package:dart_libp2p/p2p/transport/transport.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/network/transport_conn.dart'; // Added import
import 'package:dart_libp2p/core/network/context.dart';
import 'package:dart_libp2p/core/network/network.dart';
import 'package:dart_libp2p/core/network/notifiee.dart';
import 'package:dart_libp2p/core/network/rcmgr.dart';
import 'package:dart_libp2p/core/network/stream.dart';
import 'package:dart_libp2p/core/host/host.dart'; // Added import for Host
import 'package:dart_libp2p/core/peerstore.dart';
import 'package:logging/logging.dart';
import 'package:synchronized/synchronized.dart';
import 'dart:io' show NetworkInterface, InternetAddressType; // For NetworkInterface.list
import 'package:dart_libp2p/p2p/multiaddr/protocol.dart' show Protocols;
import 'package:dart_libp2p/core/network/mux.dart' as core_mux; // Changed to package import

import '../../../core/network/common.dart' show Direction;
import '../../../config/config.dart'; // Added for Config
import '../../transport/basic_upgrader.dart'; // Added for BasicUpgrader
import 'connection_health.dart'; // For event-driven health monitoring
import 'swarm_conn.dart';
import 'swarm_stream.dart';
import 'swarm_dial.dart'; // For AddrDialer and DelayDialRanker
import 'address_filter.dart'; // For AddressFilter
import 'package:dart_libp2p/p2p/host/basic/basic_host.dart'; // For OutboundCapabilityInfo

/// Swarm is a Network implementation that manages connections to peers and
/// handles streams over those connections.
class Swarm implements Network {
  final Logger _logger = Logger('Swarm');

  /// The host this swarm is part of
  Host? _host; // Added Host instance, made nullable

  /// The local peer ID
  final PeerId _localPeer;

  /// The peerstore for looking up peer addresses
  final Peerstore _peerstore;

  /// The resource manager for managing resources
  final ResourceManager _resourceManager;

  /// The connection upgrader
  final BasicUpgrader _upgrader;

  /// The host configuration
  final Config _config;

  /// List of transports used to dial out
  final List<Transport> _transports = [];

  /// List of listeners
  final List<Listener> _listeners = [];

  /// List of listen addresses
  final List<MultiAddr> _listenAddrs = [];

  /// Map of connections by peer ID
  final Map<String, List<SwarmConn>> _connections = {};

  /// Lock for connections map
  final Lock _connLock = Lock();

  /// Map of protocol IDs to stream handlers
  final Map<String, Future<void> Function(dynamic stream, PeerId remotePeer)> _protocolHandlers = {};

  /// Default stream handler for backward compatibility
  StreamHandler? _defaultStreamHandler;

  /// List of notifiees
  final List<Notifiee> _notifiees = [];

  /// Lock for notifiees list
  final Lock _notifieeLock = Lock();

  final Lock _transportsLock = Lock();
  
  /// Track last activity time for connections (for relay health monitoring)
  final Map<String, DateTime> _connectionLastActivity = {};

  /// Track connection creation time (for grace period logic)
  final Map<String, DateTime> _connectionCreatedAt = {};

  /// Track consecutive probe failures per peer (for recovery logic)
  final Map<String, int> _consecutiveProbeFailures = {};

  /// Track peers that connected via relay (prefer relay addresses for them)
  final Set<String> _relayConnectedPeers = {};

  /// Track connections being upgraded (to avoid race condition during upgrade)
  final Map<String, Completer<SwarmConn>> _upgradingConnections = {};

  /// Whether the swarm is closed
  bool _isClosed = false;

  /// Lock for closed state
  final Lock _closedLock = Lock();

  /// Next connection ID
  int _nextConnID = 0;

  /// Event-driven connection health tracking
  final Map<String, ConnectionHealthState> _connectionHealthStates = {};


  /// Creates a new Swarm
  Swarm({
    required Host? host, // Added Host parameter, made nullable
    required PeerId localPeer,
    required Peerstore peerstore,
    required ResourceManager resourceManager,
    required BasicUpgrader upgrader, // Added upgrader
    required Config config, // Added config
    List<Transport>? transports,
  }) : 
    _host = host, // Initialize Host
    _localPeer = localPeer,
    _peerstore = peerstore,
    _resourceManager = resourceManager,
    _upgrader = upgrader, // Initialize upgrader
    _config = config { // Initialize config
    if (transports != null) {
      _transports.addAll(transports);
    }
    
    // Start connection health monitoring
    _startConnectionHealthMonitoring();
  }

  /// Adds a transport to the swarm
  void addTransport(Transport transport) {
    _transports.add(transport);
  }

  @override
  Future<void> close() async {
    await _closedLock.synchronized(() async {
      if (_isClosed) return;
      _isClosed = true;


      // Close all listeners
      final listenersToClose = List<Listener>.from(_listeners); // Create a copy
      for (final listener in listenersToClose) {
        await listener.close(); // This might trigger onDone/onError, modifying original _listeners
      }
      _listeners.clear(); // Clear original list after all are processed

      // Close all connections
      await _connLock.synchronized(() async {
        final allConnsToClose = <SwarmConn>[];
        // Iterate over a copy of values if modification during iteration is possible
        // or clear the map after collecting all connections.
        final connectionLists = List<List<SwarmConn>>.from(_connections.values);
        for (final connsList in connectionLists) {
          allConnsToClose.addAll(connsList);
        }
        // It's safer to clear the original map after collecting all items if conn.close()
        // could lead to re-entrant calls that modify _connections.
        // However, if conn.close() only triggers notifiees that don't modify _connections directly,
        // iterating _connections.values and then _connections.clear() might be okay.
        // For max safety, let's clear after collecting.
        // _connections.clear(); // Moved down

        for (final conn in allConnsToClose) {
          await conn.close();
        }
        _connections.clear(); // Clear after all connections are processed and closed.
      });

      // Notify all notifiees about closed listeners and connections
      await _notifieeLock.synchronized(() async {
        // Create copies of lists to iterate over, to prevent concurrent modification
        final currentListenAddrs = List<MultiAddr>.from(_listenAddrs);
        
        // For connections, we need a deep enough copy if the inner lists could change.
        // However, connections should have been closed and removed from _connections by now.
        // The _connections map should be empty here if the above logic is correct.
        // Let's assume _notifiees list itself is stable during this block.
        final notifieesCopy = List<Notifiee>.from(_notifiees);

        for (final notifiee in notifieesCopy) {
          // Notify about closed listeners
          for (final addr in currentListenAddrs) {
            notifiee.listenClose(this, addr);
          }

          // Notify about closed connections
          // Since _connections should be empty, this loop might not run.
          // If it can run, we need to be careful.
          // The previous block iterates a copy of connections and closes them.
          // Here, we should notify based on what *was* closed.
          // This notification logic might be better integrated into the actual closing loops.
          // For now, let's assume this is for any remaining state.
          // The original code iterated _connections.values directly.
          // If _connections is cleared above, this loop is problematic.

          // Re-thinking: The notification for disconnected should happen when a conn is actually closed.
          // SwarmConn.close() calls swarm.removeConnection(), which calls notifiee.disconnected.
          // So, this explicit loop here might be redundant or even racy if removeConnection also iterates _notifiees.

          // Let's stick to notifying about listenClose for addresses that were active.
          // The disconnected notifications are handled by removeConnection.
        }
      });

      await _transportsLock.synchronized(() async {

        for (final transport in _transports){
          await transport.dispose();
        }
      });
    });
  }

  @override
  void setStreamHandler(String protocol, Future<void> Function(dynamic stream, PeerId remotePeer) handler) {
    _protocolHandlers[protocol] = handler;

    // For backward compatibility, set the default stream handler to use the protocol handler
    _defaultStreamHandler = (stream, remotePeer) async {
      // Call the protocol handler with the stream and remote peer
      await handler(stream, remotePeer);
    };
  }

  @override
  Future<P2PStream> newStream(Context context, PeerId peerId) async {
    _logger.warning('Swarm.newStream: Entered for peer ${peerId.toString()}. Context HashCode: ${context.hashCode}');
    // Check if we're closed
    if (_isClosed) {
      _logger.warning('Swarm.newStream: Swarm is closed for peer ${peerId.toString()}. Throwing exception.');
      throw Exception('Swarm is closed');
    }
    _logger.warning('Swarm.newStream: Swarm is open for peer ${peerId.toString()}.');

    // Get or create a connection to the peer
    _logger.warning('Swarm.newStream: Calling dialPeer(context, ${peerId.toString()}).');
    final Conn conn; // Type is Conn, but runtime type should be SwarmConn
    try {
      conn = await dialPeer(context, peerId);
    } catch (e, st) {
      _logger.severe('Swarm.newStream: Error from dialPeer for ${peerId.toString()}: $e\n$st');
      rethrow;
    }
    _logger.warning('Swarm.newStream: Successfully dialed peer ${peerId.toString()}. Conn runtimeType: ${conn.runtimeType}, Conn ID: ${conn.id}, Conn local: ${conn.localPeer}, Conn remote: ${conn.remotePeer}');

    if (conn is! SwarmConn) {
        _logger.severe('Swarm.newStream: conn from dialPeer is NOT SwarmConn. Actual type: ${conn.runtimeType}. Peer: ${peerId.toString()}');
        throw StateError('Connection from dialPeer is not a SwarmConn. Type: ${conn.runtimeType}');
    }

    // Create a new stream - let the underlying connection manage stream IDs
    _logger.warning('Swarm.newStream: About to call (conn as SwarmConn).newStream() for peer ${peerId.toString()} on SwarmConn ${conn.id}.');
    
    final P2PStream stream;
    try {
      stream = await conn.newStream(context);
    } catch (e, st) {
      _logger.severe('Swarm.newStream: Error from (conn as SwarmConn).newStream() for peer ${peerId.toString()}: $e\n$st');
      rethrow;
    }
    
    _logger.warning('Swarm.newStream: Successfully called (conn as SwarmConn).newStream() for peer ${peerId.toString()}. Returned Stream ID: ${stream.id()}, Stream protocol: ${stream.protocol}');
    // Note: Protocol negotiation (multistreamMuxer.selectOneOf) happens in BasicHost.newStream *after* this Swarm.newStream returns.
    // So, a log for "Protocol negotiation complete" belongs in BasicHost.newStream.

    return stream;
  }

  @override
  Future<void> listen(List<MultiAddr> addrs) async {
    _logger.fine('[Swarm listen] Called with addrs: $addrs for peer ${_localPeer.toString()}'); // Changed from _localPeer.short()
    _logger.fine('Swarm.listen called with addrs: $addrs');
    // Check if we're closed
    if (_isClosed) {
      _logger.fine('[Swarm listen] Swarm is closed. Throwing exception. Peer: ${_localPeer.toString()}');
      throw Exception('Swarm is closed');
    }

    for (final addr in addrs) {
      _logger.fine('[Swarm listen] Processing address: $addr for peer ${_localPeer.toString()}');
      // Find a transport that can listen on this address
      Transport? transport;
      for (final t in _transports) {
        if (t.canListen(addr)) {
          transport = t;
          break;
        }
      }

      if (transport == null) {
        _logger.fine('[Swarm listen] No transport found for address: $addr for peer ${_localPeer.toString()}');
        _logger.warning('No transport found for address: $addr');
        continue;
      }

      // Listen on the address
      _logger.fine('[Swarm listen] Attempting transport.listen() for $addr with transport ${transport.runtimeType} for peer ${_localPeer.toString()}');
      _logger.fine('Swarm.listen: Attempting to listen on $addr with transport ${transport.runtimeType}');
      final Listener listener;
      try {
        listener = await transport.listen(addr);
      } catch (e) {
        _logger.fine('[Swarm listen] Error calling transport.listen() for $addr: $e for peer ${_localPeer.toString()}');
        _logger.severe('Error listening on $addr with transport $transport: $e'); // Use logger.severe for errors
        continue; // Continue to next address if listen fails
      }
      
      final actualListenAddr = listener.addr; // Get the actual address the listener bound to
      // The Listener interface does not have a 'listenAddrs' getter.
      // We already log actualListenAddr which comes from listener.addr.
      _logger.fine('[Swarm listen] transport.listen() successful for $addr. Listener: ${listener.runtimeType}, Listener.addr: $actualListenAddr for peer ${_localPeer.toString()}');
      _logger.fine('Swarm.listen: transport.listen for $addr returned listener ${listener.runtimeType} with actual addr: $actualListenAddr');
      _listeners.add(listener);
      _listenAddrs.add(actualListenAddr); // Store the actual listen address
      _logger.fine('[Swarm listen] Added listener for $actualListenAddr. Current _listeners count: ${_listeners.length}, _listenAddrs: $_listenAddrs for peer ${_localPeer.toString()}');
      _logger.fine('Swarm.listen: Added listener. Current _listeners count: ${_listeners.length}, _listenAddrs: $_listenAddrs');

      // Add our own listen address to our own peerstore, but only if it's not unspecified
      // Use a long TTL, like permanent, for own addresses.
      // Assuming AddressTTL.permanentAddrTTL is accessible or use an appropriate Duration.
      // The Peerstore interface defines AddressTTL, so it should be available.
      if (!_isUnspecifiedAddress(actualListenAddr)) {
        await _peerstore.addrBook.addAddrs(_localPeer, [actualListenAddr], AddressTTL.permanentAddrTTL);
        _logger.fine('[Swarm listen] Added concrete listen address to peerstore: $actualListenAddr for peer ${_localPeer.toString()}');
      } else {
        _logger.warning('[Swarm listen] Skipping addition of unspecified listen address to peerstore: $actualListenAddr for peer ${_localPeer.toString()}. This should be resolved to concrete addresses by the host.');
      }

      // Notify listeners
      await _notifieeLock.synchronized(() async {
        for (final notifiee in _notifiees) {
          notifiee.listen(this, actualListenAddr); // Notify with the actual listen address
        }
      });


      // Handle incoming connections
      _handleIncomingConnections(listener);
    }
    _logger.fine('[Swarm listen] listen() method finished for peer ${_localPeer.toString()}.');
  }

  /// Handles incoming connections from a listener
  void _handleIncomingConnections(Listener listener) {
    _logger.fine('Swarm._handleIncomingConnections called for listener: ${listener.runtimeType} on addr ${listener.addr}');
    // Explicitly type the stream's data event
    listener.connectionStream.listen((TransportConn transportConn) async { 
      // FIX: For relay connections, extract peer ID and mark as upgrading
      // This prevents race condition where dialPeer() doesn't see the connection during upgrade
      String? remotePeerIdStr;
      Completer<SwarmConn>? upgradingCompleter;
      
      try {
        // Check if this is a relay connection with peer ID in address
        if (transportConn.remoteMultiaddr.toString().contains('/p2p-circuit')) {
          // Extract destination peer ID from circuit address
          // Format: /ip4/.../p2p/RELAY_ID/p2p-circuit/p2p/DEST_ID
          final addrStr = transportConn.remoteMultiaddr.toString();
          final parts = addrStr.split('/');
          for (int i = parts.length - 1; i >= 0; i--) {
            if (parts[i] == 'p2p' && i + 1 < parts.length) {
              remotePeerIdStr = parts[i + 1];
              break;
            }
          }
          
          if (remotePeerIdStr != null) {
            // Mark this peer as being upgraded to prevent race condition
            final peerIdStr = remotePeerIdStr; // Capture non-null value
            upgradingCompleter = Completer<SwarmConn>();
            await _connLock.synchronized(() {
              _upgradingConnections[peerIdStr] = upgradingCompleter!;
              _relayConnectedPeers.add(peerIdStr);
            });
            _logger.info('Swarm: Marked peer $peerIdStr as upgrading (relay connection)');
          }
        }
      } catch (e) {
        _logger.warning('Swarm: Error extracting peer ID from relay address: $e');
      }
      
      try {
        // Obtain a ConnManagementScope for the new inbound connection
        // Assuming 'usefd' is true for real connections.
        // The endpoint is the remote multiaddress of the incoming transport connection.
        // Upgrade the raw transport connection
        final Conn upgradedConn;
        try {
          upgradedConn = await _upgrader.upgradeInbound(
            connection: transportConn, 
            config: _config,
          );
        } catch (e, s) {
          _logger.warning('Inbound connection upgrade failed for ${transportConn.remoteMultiaddr}: $e\n$s');
          await transportConn.close();
          
          // Clean up upgrading state
          if (remotePeerIdStr != null && upgradingCompleter != null) {
            await _connLock.synchronized(() {
              _upgradingConnections.remove(remotePeerIdStr);
            });
            upgradingCompleter.completeError(e);
          }
          return; 
        }

        final connManagementScope = await _resourceManager.openConnection(
          Direction.inbound,
          true, 
          upgradedConn.remoteMultiaddr, 
        );
        
        await connManagementScope.setPeer(upgradedConn.remotePeer);

        final connID = _nextConnID++;
        final swarmConn = SwarmConn(
          id: connID.toString(),
          conn: upgradedConn, 
          localPeer: _localPeer, 
          remotePeer: upgradedConn.remotePeer, 
          direction: Direction.inbound,
          swarm: this,
          managementScope: connManagementScope,
        );
        
        // Set connection context if available from upgraded connection
        if (upgradedConn is UpgradedConnectionImpl && upgradedConn.context != null) {
          swarmConn.setContext(upgradedConn.context!);
        }

        // Use upgradedConn.remotePeer for the map key
        // Note: remotePeerIdStr may already be set from relay address extraction above
        final String actualPeerIdStr = upgradedConn.remotePeer.toString();
        _logger.fine('Storing inbound connection for peer=$actualPeerIdStr, conn_id=${swarmConn.id}');
        
        // For relayed connections, deduplicate older connections to same peer via same relay
        if (_isRelayedConnection(swarmConn)) {
          final relayId = _extractRelayFromCircuitAddr(swarmConn.remoteMultiaddr);
          if (relayId != null) {
            await _connLock.synchronized(() async {
              final existingConns = _connections[actualPeerIdStr] ?? [];
              final staleRelayConns = existingConns.where((existing) {
                if (!_isRelayedConnection(existing)) return false;
                final existingRelayId = _extractRelayFromCircuitAddr(existing.remoteMultiaddr);
                return existingRelayId == relayId && existing.id != swarmConn.id;
              }).toList();
              
              // Close stale connections through the same relay
              for (final stale in staleRelayConns) {
                _logger.warning('[CONN-DEDUP-DIAG] Closing stale relay connection ${stale.id} to peer $actualPeerIdStr via relay $relayId in favor of new connection ${swarmConn.id}');
                existingConns.remove(stale);
                Future.microtask(() => stale.close());
              }
            });
          }
        }
        
        await _connLock.synchronized(() {
          if (!_connections.containsKey(actualPeerIdStr)) {
            _connections[actualPeerIdStr] = [];
          }
          _connections[actualPeerIdStr]!.add(swarmConn);
          _logger.fine('Connection stored. Total connections for "$actualPeerIdStr": ${_connections[actualPeerIdStr]!.length}');
          
          // Fix 1.1 & 1.2: Initialize activity tracking and creation time for incoming connections
          _connectionLastActivity[swarmConn.id] = DateTime.now();
          _connectionCreatedAt[swarmConn.id] = DateTime.now();
          _connectionHealthStates[actualPeerIdStr] = ConnectionHealthState.healthy;
          
          // Complete upgrading completer if this was a relay connection
          final completer = _upgradingConnections.remove(actualPeerIdStr);
          if (completer != null && !completer.isCompleted) {
            completer.complete(swarmConn);
            _logger.info('Swarm: Completed upgrade for peer $actualPeerIdStr');
          }
        });

        await _notifieeLock.synchronized(() async {
          for (final notifiee in _notifiees) {
            notifiee.connected(this, swarmConn);
          }
        });

        _handleIncomingStreams(swarmConn);
      } catch (e, s) { // Catch for processing an individual transportConn
        _logger.severe('Error processing individual incoming transportConn on listener ${listener.addr}: $e. TransportConn remote: ${transportConn.remoteMultiaddr}', e, s);
        if (!transportConn.isClosed) {
            await transportConn.close();
        }
      }
    }, onError: (e, s) async { // For errors on the listener.connectionStream itself
        _logger.severe('Listener ${listener.addr} connectionStream encountered an error: $e. Removing listener.', e, s);
        _listeners.remove(listener);
        // Safe to call close on listener, it should be idempotent or handle already being closed.
        await listener.close(); 
        removeListenAddress(listener.addr); // Also remove from _listenAddrs and notify
    }, onDone: () async { // When the listener.connectionStream is done
        _logger.fine('Listener ${listener.addr} connectionStream is done. Removing listener.');
        _listeners.remove(listener);
        await listener.close();
        removeListenAddress(listener.addr); // Also remove from _listenAddrs and notify
    });
  }

  /// Handles incoming streams from a connection
  void _handleIncomingStreams(SwarmConn conn) {
    // This streamHandler is set on the SwarmConn.
    // It's invoked by the underlying Conn when it accepts a new muxed stream.
    // The 'muxedStream' parameter is the P2PStream from the multiplexer.
    conn.streamHandler = (P2PStream muxedStream) async { // Ensure type is P2PStream
      // Obtain a StreamManagementScope for the new inbound stream
      final streamManagementScope = await _resourceManager.openStream(
        conn.remotePeer, // The peer this stream is from
        Direction.inbound, // This is an inbound stream
      );

      // Create a SwarmStream wrapper for the muxed stream using the actual stream ID
      final swarmStream = SwarmStream(
        id: muxedStream.id(), // Use the actual stream ID from the underlying muxed stream
        conn: conn,
        direction: Direction.inbound,
        opened: DateTime.now(), // Or get from muxedStream if available
        underlyingMuxedStream: muxedStream as P2PStream<Uint8List>, // Cast if necessary
        managementScope: streamManagementScope,
      );

      // Use the host's MultistreamMuxer to handle the incoming stream and negotiate the protocol
      // The host's mux is an instance of MultistreamMuxer and implements ProtocolSwitch.
      // The handle method performs the negotiation and dispatches to the correct handler.
      try {
        await _host?.mux.handle(swarmStream);
      } catch (e, s) {
        _logger.warning('Error handling incoming stream from ${conn.remotePeer} with multistream muxer: $e\n$s');
        await swarmStream.reset(); // Reset the SwarmStream, which closes scope
      }
    };

    // Start an asynchronous loop to accept streams from this connection.
    // This loop runs as long as the connection is not closed.
    Future.microtask(() async {
      try {
        while (!conn.isClosed) {
          // conn.conn is the UpgradedConnectionImpl, which implements MuxedConn
          // Cast to core_mux.MuxedConn to access acceptStream()
          if (conn.conn is! core_mux.MuxedConn) { // Use the alias
            _logger.severe('Underlying connection for SwarmConn ${conn.id} is not a MuxedConn. Type: ${conn.conn.runtimeType}. Cannot accept streams.');
            await conn.close(); // Close the problematic connection
            return; // Exit the loop
          }
          final core_mux.MuxedStream acceptedStreamBase = await (conn.conn as core_mux.MuxedConn).acceptStream(); // Use the alias

          if (acceptedStreamBase is! P2PStream) {
            _logger.severe('Accepted stream from conn ${conn.id} is not a P2PStream. Type: ${acceptedStreamBase.runtimeType}. Resetting it.');
            await acceptedStreamBase.reset();
            continue;
          }
          
          final P2PStream acceptedP2PStream = acceptedStreamBase as P2PStream;

          if (conn.streamHandler != null) {
            // Don't await this; let each stream be handled concurrently.
            // The handler itself is async.
            _logger.fine('Accepted inbound stream ${acceptedP2PStream.id()} from ${conn.remotePeer} on conn ${conn.id}');
            conn.streamHandler!(acceptedP2PStream);
          } else {
            // This case should ideally not happen if _handleIncomingStreams is always called
            // before streams can be accepted, or if streamHandler is set at conn construction.
            _logger.warning('SwarmConn for ${conn.remotePeer} (conn id ${conn.id}) has no streamHandler set. Resetting accepted stream ${acceptedP2PStream.id()}.');
            await acceptedP2PStream.reset();
          }
        }
      } catch (e) {
        if (!conn.isClosed) {
          _logger.warning('Error in acceptStream loop for conn ${conn.id} to ${conn.remotePeer}: $e. Loop terminating.');
          // Attempt to close the connection gracefully.
          // The error might be due to the connection being reset or closed abruptly.
          await conn.close(); 
        } else {
          _logger.fine('AcceptStream loop for conn ${conn.id} to ${conn.remotePeer} terminated due to connection closure.');
        }
      }
    });
  }

  @override
  List<MultiAddr> get listenAddresses {
    // _logger.fine('[Swarm listenAddresses GETTER ENTRY] Swarm hashCode: ${this.hashCode}, this._listenAddrs is currently: ${this._listenAddrs} for peer ${_localPeer.toString()}');
    // _logger.fine('[Swarm listenAddresses GETTER] Called for peer ${_localPeer.toString()} (Swarm hashCode: ${this.hashCode})');
    // The current implementation directly returns _listenAddrs, which is populated in the listen() method.
    // If _listeners were the source of truth, we'd iterate them here.
    // For now, we just log what's being returned.
    final result = List<MultiAddr>.unmodifiable(_listenAddrs);
    // _logger.fine('[Swarm listenAddresses GETTER] Returning: $result from _listenAddrs for peer ${_localPeer.toString()}');
    _logger.fine('Swarm.listenAddresses getter called. Returning: $_listenAddrs');
    return result;
  }

  @override
  Future<List<MultiAddr>> get interfaceListenAddresses async {
    // Expand "any interface" addresses (/ip4/0.0.0.0, /ip6/::) to use actual network interfaces
    final List<MultiAddr> result = [];
    
    // Get all network interfaces
    List<NetworkInterface> interfaces;
    try {
      interfaces = await NetworkInterface.list(
        includeLoopback: false,
        type: InternetAddressType.any,
      );
    } catch (e) {
      _logger.warning('Failed to list network interfaces: $e');
      // Fallback to returning listen addresses as-is
      return listenAddresses;
    }
    
    for (final listenAddr in listenAddresses) {
      final addrStr = listenAddr.toString();
      
      // Check if this is an unspecified address
      if (addrStr.contains('/ip4/0.0.0.0') || addrStr.contains('/ip6/::')) {
        // Expand to all interface addresses
        for (final interface in interfaces) {
          for (final addr in interface.addresses) {
            try {
              // Replace 0.0.0.0 or :: with the actual interface address
              String expandedAddrStr;
              if (addr.type == InternetAddressType.IPv4 && addrStr.contains('/ip4/0.0.0.0')) {
                expandedAddrStr = addrStr.replaceFirst('/ip4/0.0.0.0', '/ip4/${addr.address}');
              } else if (addr.type == InternetAddressType.IPv6 && addrStr.contains('/ip6/::')) {
                expandedAddrStr = addrStr.replaceFirst('/ip6/::', '/ip6/${addr.address}');
              } else {
                continue; // Skip if address type doesn't match
              }
              
              final expandedAddr = MultiAddr(expandedAddrStr);
              result.add(expandedAddr);
            } catch (e) {
              _logger.fine('Failed to create expanded address for ${addr.address}: $e');
            }
          }
        }
      } else {
        // Not an unspecified address, add as-is
        result.add(listenAddr);
      }
    }
    
    return result;
  }

  Future<List<MultiAddr>> getListenAddrs() async {
    _logger.fine('Swarm.getListenAddrs called. Current _listeners count: ${_listeners.length}, current _listenAddrs: $_listenAddrs');
    // For now, it simply returns the known _listenAddrs.
    // A more complex version might query listeners directly if _listenAddrs could be stale.
    final List<MultiAddr> currentAddrs = List.unmodifiable(_listenAddrs);
    _logger.fine('Swarm.getListenAddrs returning: $currentAddrs');
    return currentAddrs;
  }

  @override
  ResourceManager get resourceManager => _resourceManager;

  @override
  Peerstore get peerstore => _peerstore;

  @override
  PeerId get localPeer => _localPeer;

  @override
  Future<Conn> dialPeer(Context context, PeerId peerId) async {
    _logger.fine('Swarm.dialPeer: peer=${peerId.toBase58()}, existing_conns=${_connections.length}');
    
    // Check if we're closed
    if (_isClosed) {
      throw Exception('Swarm is closed');
    }

    // Prevent self-dialing
    if (peerId == _localPeer) {
      _logger.fine('Preventing self-dial attempt to ${peerId}');
      throw Exception('Cannot dial self: $peerId');
    }

    // Check if we already have a connection to this peer
    final peerIDStr = peerId.toString();
    _logger.fine('Looking up connections for peer ID string: "$peerIDStr"');
    
    // FIX: Check if connection is being upgraded (race condition prevention)
    Completer<SwarmConn>? upgradingCompleter;
    await _connLock.synchronized(() {
      upgradingCompleter = _upgradingConnections[peerIDStr];
    });
    
    if (upgradingCompleter != null) {
      _logger.info('Swarm.dialPeer: Connection to $peerIDStr is being upgraded, waiting...');
      try {
        final swarmConn = await upgradingCompleter!.future.timeout(
          Duration(seconds: 10),
          onTimeout: () {
            _logger.warning('Swarm.dialPeer: Timeout waiting for upgrade to complete for $peerIDStr');
            throw TimeoutException('Upgrade timeout');
          },
        );
        _logger.info('Swarm.dialPeer: Upgrade complete for $peerIDStr, returning connection ${swarmConn.id}');
        return swarmConn;
      } catch (e) {
        _logger.warning('Swarm.dialPeer: Error waiting for upgrade: $e, proceeding with normal dial');
        // Fall through to normal dial if upgrade fails
      }
    }
    
    final existingConns = await _connLock.synchronized(() {
      return _connections[peerIDStr] ?? [];
    });
    _logger.fine('Found ${existingConns.length} existing connections for peer ID string: "$peerIDStr"');

    if (existingConns.isNotEmpty) {
      _logger.fine('Swarm.dialPeer: Found ${existingConns.length} existing connection(s) for peer ${peerId.toString()}. Validating health...');
      
      // Filter out closed/unhealthy connections
      final healthyConns = <SwarmConn>[];
      final staleConns = <SwarmConn>[];
      
      for (final conn in existingConns) {
        if (conn.isClosed || !_isConnectionHealthy(conn)) {
          staleConns.add(conn);
          _logger.warning('Swarm.dialPeer: Connection ${conn.id} to peer ${peerId.toString()} is stale/closed');
        } else {
          healthyConns.add(conn);
        }
      }
      
      // Clean up stale connections (validate protected ones by testing if still usable)
      if (staleConns.isNotEmpty) {
        _logger.warning('Swarm.dialPeer: Processing ${staleConns.length} stale connection(s) for peer ${peerId.toString()}');
        for (final staleConn in staleConns) {
          // For protected connections, validate by trying to create a test stream
          if (_host?.connManager.isProtected(staleConn.remotePeer, '') ?? false) {
            _logger.info('Swarm.dialPeer: Protected connection ${staleConn.id} appears stale, validating...');
            try {
              // Try to create a new stream - if connection is alive, this will succeed
              final testStream = await staleConn.newStream(Context()).timeout(const Duration(seconds: 5));
              // Connection is alive - close test stream and keep the connection
              await testStream.reset();
              _logger.info('Swarm.dialPeer: Protected connection ${staleConn.id} validated, keeping');
              healthyConns.add(staleConn);  // Move back to healthy list
              continue;  // Skip cleanup for this connection
            } catch (e) {
              _logger.warning('Swarm.dialPeer: Protected connection ${staleConn.id} failed validation: $e');
              // Continue to cleanup
            }
          }
          
          // Properly remove and close the stale connection so notifiees
          // (identify, etc.) are informed and the old accept loop terminates.
          try {
            await removeConnection(staleConn);
            await staleConn.close();
          } catch (e) {
            _logger.warning('Swarm.dialPeer: Error cleaning up stale connection ${staleConn.id}: $e');
          }
        }
      }
      
      if (healthyConns.isNotEmpty) {
        // Prefer newest connection - more likely to be alive for relayed paths
        // where the end-to-end path can break without local detection
        _logger.warning('Swarm.dialPeer: Found healthy connection for peer ${peerId.toString()}. Returning newest connection ID: ${healthyConns.last.id}');
        return healthyConns.last;
      } else {
        _logger.warning('Swarm.dialPeer: No healthy connections found for peer ${peerId.toString()}. Will create new connection.');
      }
    }
    _logger.fine('Swarm.dialPeer: No existing connection for peer ${peerId.toString()}. Dialing.');

    // Get addresses for the peer
    final allAddrs = await _peerstore.addrBook.addrs(peerId);
    if (allAddrs.isEmpty) {
      _logger.warning('Swarm.dialPeer: No addresses found in peerstore for peer: $peerId');
      throw Exception('No addresses found for peer: $peerId');
    }

    // 1. Get outbound capability from host (uses existing _host reference)
    OutboundCapabilityInfo capability;
    if (_host is BasicHost) {
      capability = (_host as BasicHost).outboundCapability;
    } else {
      // Fallback if host is not BasicHost (assume IPv4 only)
      capability = OutboundCapabilityInfo(
        hasIPv4: true, 
        hasIPv6: false, 
        detectedAt: DateTime.now()
      );
    }

    // 2. Filter addresses by capability
    var dialableAddrs = AddressFilter.filterReachable(allAddrs, capability);
    
    // 3. Deduplicate IPv6 addresses from same /64 prefix
    dialableAddrs = AddressFilter.deduplicateIPv6(dialableAddrs);

    // 4. Basic filtering (existing - remove 0.0.0.0, ::, bare circuit, self-routes)
    dialableAddrs = dialableAddrs.where((addr) {
      final ip4Val = addr.valueForProtocol('ip4');
      if (ip4Val == '0.0.0.0') {
        return false;
      }
      final ip6Val = addr.valueForProtocol('ip6');
      if (ip6Val == '::') {
        return false;
      }
      // Filter out bare /p2p-circuit (not dialable)
      final components = addr.components;
      if (components.length == 1 && 
          components[0].$1.code == Protocols.circuit.code) {
        return false;
      }
      // Filter out circuit addresses that route through this peer (self)
      // This prevents "Cannot dial self" errors when trying to relay through ourselves
      for (int i = 0; i < components.length; i++) {
        final (protocol, value) = components[i];
        if (protocol.code == Protocols.circuit.code && i > 0) {
          final (prevProtocol, prevValue) = components[i - 1];
          if (prevProtocol.code == Protocols.p2p.code) {
            try {
              final relayPeerId = PeerId.fromString(prevValue);
              if (relayPeerId == _localPeer) {
                _logger.fine('Swarm.dialPeer: Filtering out circuit address that routes through self: $addr');
                return false;
              }
            } catch (e) {
              // Invalid peer ID in address, skip filtering
            }
          }
        }
      }
      return true;
    }).toList();

    if (dialableAddrs.isEmpty) {
      _logger.warning('Swarm.dialPeer: No dialable addresses found for peer: $peerId. Original addrs: $allAddrs');
      throw Exception('No dialable addresses found for peer: $peerId');
    }

    // 4b. Deduplicate circuit relay addresses
    // Prevent Happy Eyeballs from creating multiple concurrent relay connections
    // through the same relay to the same destination
    dialableAddrs = _deduplicateCircuitAddrs(dialableAddrs);
    _logger.fine('Swarm.dialPeer: After circuit dedup: ${dialableAddrs.length} addresses');

    // 5. Rank by priority, with preference for relay if peer connected via relay
    final ranker = CapabilityAwarePriorityRanker();
    var scoredAddrs = ranker.rank(dialableAddrs, capability);
    
    // FIX: Prefer relay addresses for peers that connected via relay
    // If this peer connected to us via relay, their direct addresses are likely unreachable
    final isRelayPeer = await _connLock.synchronized(() {
      return _relayConnectedPeers.contains(peerIDStr);
    });
    
    if (isRelayPeer) {
      // Reorder: put circuit/relay addresses first
      final relayAddrs = scoredAddrs.where((addr) => 
        addr.toString().contains('/p2p-circuit')).toList();
      final nonRelayAddrs = scoredAddrs.where((addr) => 
        !addr.toString().contains('/p2p-circuit')).toList();
      
      if (relayAddrs.isNotEmpty) {
        scoredAddrs = [...relayAddrs, ...nonRelayAddrs];
        _logger.info('Swarm.dialPeer: Peer $peerIDStr connected via relay, prioritizing ${relayAddrs.length} relay addresses');
      }
    }

    _logger.fine('Dialing $peerId with ${scoredAddrs.length} addresses '
        '(capability: ${capability.capability}, relay-peer: $isRelayPeer)');

    // 6. Dial with Happy Eyeballs staggering
    try {
      final dialer = HappyEyeballsDialer(
        peerId: peerId,
        addrs: scoredAddrs,
        dialFunc: (ctx, addr, pid) => _dialSingleAddr(addr, pid, ctx),
        context: context,
      );
      
      // Track dial start time for metrics (just before actual network dial)
      final dialStartTime = DateTime.now();
      final conn = await dialer.dial();
      _logger.fine('Swarm.dialPeer: Successfully connected to $peerId');
      
      // Obtain a ConnManagementScope for the new connection
      final connManagementScope = await _resourceManager.openConnection(
        Direction.outbound,
        true,
        conn.remoteMultiaddr,
      );
      
      await connManagementScope.setPeer(conn.remotePeer);
      
      // Create a swarm connection
      final connID = _nextConnID++;
      final swarmConn = SwarmConn(
        id: connID.toString(),
        conn: conn,
        localPeer: _localPeer,
        remotePeer: conn.remotePeer,
        direction: Direction.outbound,
        swarm: this,
        managementScope: connManagementScope,
      );
      
      // Set connection context if available from upgraded connection
      if (conn is UpgradedConnectionImpl && conn.context != null) {
        swarmConn.setContext(conn.context!);
      }
      
      // Add to connections map
      await _connLock.synchronized(() {
        final peerIDStr = conn.remotePeer.toString();
        _connections.putIfAbsent(peerIDStr, () => []).add(swarmConn);
        
        // Fix 1.2: Initialize activity tracking and creation time for outbound connections
        _connectionLastActivity[swarmConn.id] = DateTime.now();
        _connectionCreatedAt[swarmConn.id] = DateTime.now();
        _connectionHealthStates[peerIDStr] = ConnectionHealthState.healthy;
      });
      
      // Calculate dial latency for metrics
      final dialLatency = DateTime.now().difference(dialStartTime);
      _logger.info('Swarm.dialPeer: Dial latency for $peerId: ${dialLatency.inMilliseconds}ms');
      
      // Notify connection with dial latency
      await _notifieeLock.synchronized(() async {
        for (final notifiee in _notifiees) {
          await notifiee.connected(this, swarmConn, dialLatency: dialLatency);
        }
      });
      
      // Handle incoming streams
      _handleIncomingStreams(swarmConn);
      
      _logger.fine('Swarm.dialPeer: Connection established for $peerId. Conn ID: ${swarmConn.id}');
      return swarmConn;
      
    } catch (e) {
      _logger.severe('Swarm.dialPeer: All parallel dial attempts failed for $peerId: $e');
      throw Exception('All dial attempts failed: $e');
    }
  }

  /// Helper method to dial a single address
  Future<Conn> _dialSingleAddr(MultiAddr addr, PeerId peerId, Context context) async {
    _logger.fine('Swarm._dialSingleAddr: Attempting to dial $peerId at $addr');
    
    // Find transport
    Transport? transport;
    for (final t in _transports) {
      if (t.canDial(addr)) {
        transport = t;
        break;
      }
    }
    
    if (transport == null) {
      throw Exception('No transport found for address: $addr');
    }
    
    // Dial the address
    final transportConn = await transport.dial(addr);
    
    // Upgrade the connection
    final upgradedConn = await _upgrader.upgradeOutbound(
      connection: transportConn as TransportConn,
      remotePeerId: peerId,
      config: _config,
      remoteAddr: transportConn.remoteMultiaddr,
    );
    
    _logger.fine('Swarm._dialSingleAddr: Successfully dialed and upgraded connection to $peerId at $addr');
    return upgradedConn;
  }

  @override
  Future<void> closePeer(PeerId peerId) async {
    final peerIDStr = peerId.toString();
    final conns = await _connLock.synchronized(() {
      final conns = _connections[peerIDStr] ?? [];
      _connections.remove(peerIDStr);
      return conns;
    });

    for (final conn in conns) {
      await conn.close();
    }
  }

  @override
  Connectedness connectedness(PeerId peerId) {
    final peerIDStr = peerId.toString();
    final conns = _connections[peerIDStr] ?? [];

    if (conns.isEmpty) {
      return Connectedness.notConnected;
    }

    // Check if any connection is fully established
    for (final conn in conns) {
      if (!conn.isClosed) {
        return Connectedness.connected;
      }
    }

    return Connectedness.notConnected;
  }

  @override
  List<PeerId> get peers {
    final result = <PeerId>[];

    for (final entry in _connections.entries) {
      // Only include peers with active connections
      final conns = entry.value;
      if (conns.any((conn) => !conn.isClosed)) {
        // Add the peer ID
        if (conns.isNotEmpty) {
          result.add(conns.first.remotePeer);
        }
      }
    }

    return result;
  }

  @override
  List<Conn> get conns {
    final result = <Conn>[];

    for (final conns in _connections.values) {
      for (final conn in conns) {
        if (!conn.isClosed) {
          result.add(conn);
        }
      }
    }

    return result;
  }

  @override
  List<Conn> connsToPeer(PeerId peerId) {
    final peerIDStr = peerId.toString();
    final conns = _connections[peerIDStr] ?? [];

    return conns.where((conn) => !conn.isClosed).toList();
  }

  @override
  void notify(Notifiee notifiee) {
    _notifieeLock.synchronized(() {
      _notifiees.add(notifiee);
    });
  }

  @override
  void stopNotify(Notifiee notifiee) {
    _notifieeLock.synchronized(() {
      _notifiees.remove(notifiee);
    });
  }

  @override
  bool canDial(PeerId peerId, MultiAddr addr) {
    // Check if any transport can dial this address
    for (final transport in _transports) {
      if (transport.canDial(addr)) {
        return true;
      }
    }

    return false;
  }

  /// Removes a connection from the swarm
  Future<void> removeConnection(SwarmConn conn) async {
    final peerIDStr = conn.remotePeer.toString();

    await _connLock.synchronized(() {
      final conns = _connections[peerIDStr] ?? [];
      conns.remove(conn);

      if (conns.isEmpty) {
        _connections.remove(peerIDStr);
      }
    });

    // Notify connection closed
    await _notifieeLock.synchronized(() async {
      for (final notifiee in _notifiees) {
        notifiee.disconnected(this, conn);
      }
    });
  }

  /// Sets the host for this swarm.
  /// This is used to resolve a circular dependency during initialization.
  setHost(Host host) {
    _host = host;
  }

  void removeListenAddress(MultiAddr addr) {
    _listenAddrs.remove(addr);

    // Notify listeners that address was removed
    _notifieeLock.synchronized(() {
      for (final notifiee in _notifiees) {
        notifiee.listenClose(this, addr);
      }
    });
  }

  /// Helper method to check if an address is unspecified (0.0.0.0 or ::)
  bool _isUnspecifiedAddress(MultiAddr addr) {
    final ip4Val = addr.valueForProtocol('ip4');
    final ip6Val = addr.valueForProtocol('ip6');
    
    // Check for IPv4 unspecified addresses
    if (ip4Val == '0.0.0.0' || ip4Val == '0.0.0.0.0.0') {
      return true;
    }
    
    // Check for IPv6 unspecified addresses
    if (ip6Val == '::' || ip6Val == '0:0:0:0:0:0:0:0') {
      return true;
    }
    
    return false;
  }

  /// Deduplicate circuit relay addresses to prevent Happy Eyeballs from creating
  /// multiple concurrent relay connections through the same relay to the same destination.
  /// 
  /// Without this, if a peer advertises multiple circuit addresses (IPv4 + IPv6) through
  /// the same relay, Happy Eyeballs will start 2+ parallel HOP requests. Since relay
  /// connections take ~1s to establish (vs ~100ms for direct), all requests complete
  /// before cancellation, causing the relay to see multiple concurrent connections.
  List<MultiAddr> _deduplicateCircuitAddrs(List<MultiAddr> addrs) {
    final seenRelayRoutes = <String>{};
    final deduplicated = <MultiAddr>[];
    
    for (final addr in addrs) {
      if (_isCircuitAddr(addr)) {
        // Extract relay route (relayPeerID -> destPeerID)
        final route = _extractRelayRoute(addr);
        if (route != null) {
          if (seenRelayRoutes.contains(route)) {
            _logger.fine('Swarm: Skipping duplicate circuit route: $addr (route: $route)');
            continue;  // Skip duplicate route through same relay
          }
          seenRelayRoutes.add(route);
          _logger.fine('Swarm: Keeping circuit route: $addr (route: $route)');
        }
      }
      deduplicated.add(addr);
    }
    
    return deduplicated;
  }

  /// Check if an address is a circuit relay address
  bool _isCircuitAddr(MultiAddr addr) {
    return addr.toString().contains('/p2p-circuit');
  }

  /// Extract relay route key from a circuit address
  /// Format: relayPeerID->destPeerID
  /// Returns null if address is not a valid circuit address
  String? _extractRelayRoute(MultiAddr addr) {
    try {
      final components = addr.components;
      String? relayPeerId;
      String? destPeerId;
      
      // Find /p2p/{relayId}/p2p-circuit/p2p/{destId} pattern
      for (int i = 0; i < components.length; i++) {
        final (protocol, value) = components[i];
        
        // Find relay peer ID (before /p2p-circuit)
        if (protocol.code == Protocols.p2p.code && 
            i + 1 < components.length &&
            components[i + 1].$1.code == Protocols.circuit.code) {
          relayPeerId = value;
        }
        
        // Find destination peer ID (after /p2p-circuit)
        if (protocol.code == Protocols.circuit.code &&
            i + 1 < components.length &&
            components[i + 1].$1.code == Protocols.p2p.code) {
          destPeerId = components[i + 1].$2;
        }
      }
      
      if (relayPeerId != null && destPeerId != null) {
        return '$relayPeerId->$destPeerId';
      }
      
      // If we have relay but no dest, use just relay (for relay-only circuit addrs)
      if (relayPeerId != null) {
        return relayPeerId;
      }
      
      return null;
    } catch (e) {
      _logger.warning('Swarm: Error extracting relay route from $addr: $e');
      return null;
    }
  }

  /// Event-driven connection health change handler
  void onConnectionHealthChanged(SwarmConn conn, ConnectionHealthState newState) {
    final peerIdStr = conn.remotePeer.toString();
    final oldState = _connectionHealthStates[peerIdStr];
    _connectionHealthStates[peerIdStr] = newState;
    
    _logger.info('Swarm: Connection health changed for ${conn.remotePeer} (${conn.id}): $oldState -> $newState');
    
    // Handle failed connections immediately
    if (newState == ConnectionHealthState.failed) {
      _logger.warning('Swarm: Connection ${conn.id} to ${conn.remotePeer} has failed - scheduling immediate removal');
      _removeFailedConnection(conn);
    }
  }
  
  /// Immediately removes a failed connection
  Future<void> _removeFailedConnection(SwarmConn conn) async {
    try {
      _logger.warning('Swarm: Removing failed connection ${conn.id} to ${conn.remotePeer}');
      await removeConnection(conn);
      await conn.close();
    } catch (e) {
      _logger.warning('Swarm: Error removing failed connection ${conn.id}: $e');
    }
  }

  /// Marks a connection to a peer as unhealthy
  /// Called by transport layers (e.g., CircuitV2Client) when they detect relay path failures
  void markConnectionUnhealthy(PeerId peer) {
    final peerIdStr = peer.toString();
    _connectionHealthStates[peerIdStr] = ConnectionHealthState.failed;
    _logger.warning('Swarm: Marked connection to ${peer.toBase58()} as unhealthy');
  }

  /// Enhanced connection health check using event-driven state
  bool _isConnectionHealthy(SwarmConn conn) {
    try {
      // Fix 1.3: Grace period - don't aggressively health-check brand new connections
      if (_isRelayedConnection(conn)) {
        final createdAt = _connectionCreatedAt[conn.id];
        if (createdAt != null) {
          final connAge = DateTime.now().difference(createdAt);
          if (connAge < Duration(seconds: 60)) {
            return true;  // Trust new connections for first 60 seconds
          }
        }
      }
      
      // First check if the SwarmConn itself is closed
      if (conn.isClosed) {
        return false;
      }

      // Check if the underlying connection is closed
      if (conn.conn.isClosed) {
        return false;
      }

      // Check event-driven health state
      final peerIdStr = conn.remotePeer.toString();
      final healthState = _connectionHealthStates[peerIdStr] ?? ConnectionHealthState.unknown;
      
      // If we have health state information, use it
      if (healthState == ConnectionHealthState.failed) {
        return false;
      }
      
      // For relayed connections, check if we've had recent activity
      if (_isRelayedConnection(conn)) {
        final lastActivity = _connectionLastActivity[conn.id];
        if (lastActivity != null) {
          final idleTime = DateTime.now().difference(lastActivity);
          // If relayed connection has been idle for too long without successful I/O,
          // and we have no positive health state, consider it potentially unhealthy
          if (idleTime > Duration(seconds: 60)) {
            _logger.fine('Swarm: Relayed connection ${conn.id} idle for ${idleTime.inSeconds}s');
            // Don't immediately mark as unhealthy - let health state decide
            // But if health state is already failed, return false
            if (healthState == ConnectionHealthState.failed) {
              return false;
            }
          }
        }
      }
      
      // For degraded connections, do additional checks
      if (healthState == ConnectionHealthState.degraded) {
        // Check if the connection has been degraded for too long
        if (conn.healthMetrics.consecutiveErrors >= 2) {
          return false;
        }
      }

      // If the underlying connection is an UpgradedConnectionImpl,
      // check if its muxed connection is closed
      if (conn.conn is UpgradedConnectionImpl) {
        final upgraded = conn.conn as UpgradedConnectionImpl;
        // The UpgradedConnectionImpl wraps a MuxedConn (YamuxSession)
        // Check if the muxed connection is closed
        if (upgraded.isClosed) {
          return false;
        }
      }

      return true;
    } catch (e) {
      // If any error occurs during health check, consider connection unhealthy
      _logger.warning('Swarm._isConnectionHealthy: Error checking connection health for ${conn.id}: $e');
      return false;
    }
  }

  /// Checks if a connection is a circuit relay connection
  bool _isRelayedConnection(SwarmConn conn) {
    final addr = conn.remoteMultiaddr.toString();
    return addr.contains('/p2p-circuit');
  }

  /// Extracts the relay peer ID from a circuit multiaddr
  /// Returns null if not a circuit address or relay ID cannot be extracted
  String? _extractRelayFromCircuitAddr(MultiAddr addr) {
    final addrStr = addr.toString();
    if (!addrStr.contains('/p2p-circuit')) {
      return null;
    }
    
    // Circuit addresses have format: /ip4/x.x.x.x/tcp/port/p2p/relayId/p2p-circuit/p2p/destId
    // We want to extract the relayId (the p2p component before /p2p-circuit)
    final parts = addrStr.split('/');
    for (int i = 0; i < parts.length - 1; i++) {
      if (parts[i] == 'p2p-circuit' && i >= 2 && parts[i - 2] == 'p2p') {
        return parts[i - 1]; // Return the relay peer ID
      }
    }
    return null;
  }

  /// Starts the connection health monitoring system
  void _startConnectionHealthMonitoring() {
    // Start periodic probing for relayed connections
    _startRelayedConnectionProbing();
  }
  
  /// Periodically probes relayed connections to detect failures early
  void _startRelayedConnectionProbing() {
    Timer.periodic(Duration(seconds: 30), (_) async {
      if (_isClosed) return;
      
      await _connLock.synchronized(() async {
        for (final entry in _connections.entries) {
          for (final conn in entry.value) {
            if (_isRelayedConnection(conn) && !conn.isClosed) {
              _probeRelayedConnection(conn);
            }
          }
        }
      });
    });
  }
  
  /// Probes a relayed connection to verify liveness
  /// 
  /// Fix 2.3: Prefers UDX's native PING frame (1 byte, non-intrusive) over
  /// test stream creation for UDX connections. Falls back to test streams
  /// for non-UDX transports.
  Future<void> _probeRelayedConnection(SwarmConn conn) async {
    final peerStr = conn.remotePeer.toString();
    bool probeSuccess = false;
    
    try {
      // Try UDX native PING if available (1 byte, non-intrusive)
      // Check if the underlying connection supports ping (duck typing approach)
      // This works because SwarmConn.conn could be a UDXSessionConn which has ping()
      try {
        // Use dynamic call to ping() to avoid circular dependency
        final dynamic underlying = conn.conn;
        if (underlying.runtimeType.toString().contains('UDXSessionConn')) {
          probeSuccess = await underlying.ping(timeout: Duration(seconds: 5));
          _logger.fine('Swarm: Connection ${conn.id} UDX ping: ${probeSuccess ? "success" : "failed"}');
        }
      } catch (e) {
        // ping() not available or failed, will fall back to test stream
        _logger.fine('Swarm: UDX ping not available: $e');
      }
      
      // Fallback to test stream for non-UDX connections or if ping not supported
      if (!probeSuccess) {
        final testStream = await conn.newStream(Context())
            .timeout(Duration(seconds: 5));
        await testStream.reset();
        probeSuccess = true;
        _logger.fine('Swarm: Connection ${conn.id} test stream probe successful');
      }
      
      // Success - update last activity
      _connectionLastActivity[conn.id] = DateTime.now();
      
      // Fix 1.4: SUCCESS - Reset failure count and mark healthy
      _consecutiveProbeFailures[peerStr] = 0;
      _connectionHealthStates[peerStr] = ConnectionHealthState.healthy;
      
    } catch (e) {
      // Fix 1.4: Track consecutive failures and only mark as failed after 3 failures
      final failures = (_consecutiveProbeFailures[peerStr] ?? 0) + 1;
      _consecutiveProbeFailures[peerStr] = failures;
      
      if (failures >= 3) {
        _logger.warning('Swarm: Connection ${conn.id} probe failed $failures times: $e');
        _connectionHealthStates[peerStr] = ConnectionHealthState.failed;
      } else {
        _logger.fine('Swarm: Connection ${conn.id} probe failed ($failures/3): $e');
        // Don't mark as failed yet - allow recovery
      }
    }
  }

  /// Proactively cleans up stale connections
  Future<void> _cleanupStaleConnections() async {
    if (_isClosed) return;

    final staleConnections = <SwarmConn>[];
    int totalConnections = 0;
    int healthyConnections = 0;

    // Collect stale connections
    await _connLock.synchronized(() async {
      for (final entry in _connections.entries) {
        final peerIdStr = entry.key;
        final conns = entry.value;
        
        for (final conn in conns) {
          totalConnections++;
          
          if (conn.isClosed || !_isConnectionHealthy(conn)) {
            staleConnections.add(conn);
            _logger.fine('Swarm._cleanupStaleConnections: Found stale connection ${conn.id} to peer $peerIdStr');
          } else {
            healthyConnections++;
          }
        }
      }
    });

    // Clean up stale connections (validate protected ones by testing if still usable)
    if (staleConnections.isNotEmpty) {
      _logger.info('Swarm._cleanupStaleConnections: Processing ${staleConnections.length} stale connections (${healthyConnections}/${totalConnections} healthy)');
      
      for (final staleConn in staleConnections) {
        // For protected connections, validate by trying to create a test stream
        if (_host?.connManager.isProtected(staleConn.remotePeer, '') ?? false) {
          _logger.info('Swarm._cleanupStaleConnections: Protected connection ${staleConn.id} appears stale, validating...');
          try {
            // Try to create a new stream - if connection is alive, this will succeed
            final testStream = await staleConn.newStream(Context()).timeout(const Duration(seconds: 5));
            // Connection is alive - close test stream and keep the connection
            await testStream.reset();
            _logger.info('Swarm._cleanupStaleConnections: Protected connection ${staleConn.id} validated, keeping');
            continue;  // Skip cleanup - connection is actually healthy
          } catch (e) {
            _logger.warning('Swarm._cleanupStaleConnections: Protected connection ${staleConn.id} failed validation: $e');
            // Continue to cleanup
          }
        }
        
        try {
          await removeConnection(staleConn);
          await staleConn.close();
        } catch (e) {
          _logger.warning('Swarm._cleanupStaleConnections: Error cleaning up stale connection ${staleConn.id}: $e');
        }
      }
    } else if (totalConnections > 0) {
      _logger.fine('Swarm._cleanupStaleConnections: All $totalConnections connections are healthy');
    }
  }
}
