import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import '../../core/connmgr/conn_manager.dart';
import '../../core/multiaddr.dart';
import '../../core/network/conn.dart';
import '../../core/network/transport_conn.dart';
import 'listener.dart';
import 'transport.dart';
import 'transport_config.dart';
import 'connection_manager.dart'; // Re-added import for ConnectionManager
import '../../core/network/mux.dart'; // Multiplexer no longer directly used by TCPTransport constructor
import '../../core/network/rcmgr.dart' show ResourceManager;
import '../../core/peer/peer_id.dart'; // For concrete PeerId class
import 'tcp_connection.dart';
import 'tcp_listener.dart';
import 'package:meta/meta.dart';

/// TCP implementation of the Transport interface
class TCPTransport implements Transport {
  static const _supportedProtocols = ['/ip4/tcp', '/ip6/tcp'];

  @override
  final TransportConfig config;

  final ConnManager _connManager;
  // final Multiplexer multiplexer; // Removed, as TCPTransport now provides raw connections
  final ResourceManager resourceManager;

  @visibleForTesting
  ConnManager get connectionManager => _connManager;

  TCPTransport({
    // required this.multiplexer, // Removed
    required this.resourceManager,
    TransportConfig? config,
    ConnManager? connManager,
  }) : config = config ?? TransportConfig.defaultConfig,
       _connManager = connManager ?? ConnectionManager();

  @override
  Future<TransportConn> dial(MultiAddr addr, {Duration? timeout}) async {
    final host = addr.valueForProtocol('ip4') ?? addr.valueForProtocol('ip6');
    final port = int.parse(addr.valueForProtocol('tcp') ?? '0');

    if (host == null || port == 0) {
      throw ArgumentError('Invalid multiaddr: $addr');
    }

    // Use the provided timeout or fall back to the configured dial timeout
    final effectiveTimeout = timeout ?? config.dialTimeout;

    try {
      final socket = await Socket.connect(
        host, 
        port,
        timeout: effectiveTimeout,
      ).timeout(
        effectiveTimeout,
        onTimeout: () => throw TimeoutException(
          'Connection timed out after ${effectiveTimeout.inSeconds} seconds',
        ),
      );

      // Create multiaddrs for local and remote endpoints
      final localAddr = MultiAddr('/ip4/${socket.address.address}/tcp/${socket.port}');
      final remoteAddr = MultiAddr('/ip4/${socket.remoteAddress.address}/tcp/${socket.remotePort}');

      // Placeholder PeerIDs - these should be derived from a security handshake
      // which typically happens before or as part of the transport upgrade process.
      // For now, using fixed placeholders. This is a CRITICAL point for a real system.
      final localPeerId = await PeerId.random(); // Using PeerId.random()
      final remotePeerId = await PeerId.random(); // Placeholder for remote PeerId (SHOULD COME FROM HANDSHAKE)


      final connection = await TCPConnection.create(
        socket,
        localAddr,
        remoteAddr,
        localPeerId, 
        remotePeerId, 
        // multiplexer, // Removed
        resourceManager,
        false, // isServer = false for dial
        legacyConnManager: _connManager
        // onIncomingStream callback removed from TCPConnection.create
      );

      // Set read/write timeouts from config (these are for the raw socket, may be deprecated)
      // connection.setReadTimeout(config.readTimeout);
      // connection.setWriteTimeout(config.writeTimeout);
      // Stream-level deadlines are preferred with multiplexing.

      return connection;
    } on TimeoutException catch (e) {
      throw e;
    } catch (e) {
      throw Exception('Failed to connect: $e');
    }
  }

  @override
  Future<Listener> listen(MultiAddr addr) async {
    final host = addr.valueForProtocol('ip4') ?? addr.valueForProtocol('ip6');
    final port = int.parse(addr.valueForProtocol('tcp') ?? '0');

    if (host == null) {
      throw ArgumentError('Invalid multiaddr: $addr');
    }

    try {
      final server = await ServerSocket.bind(host, port);
      // Create a new multiaddr with the actual port that was assigned
      final boundAddr = MultiAddr('/ip4/$host/tcp/${server.port}');
      final listener = TCPListener(
        server,
        addr: boundAddr,
        config: config,
        connManager: _connManager,
        // multiplexer: multiplexer, // This line was correctly commented out, but TCPListener itself needs update
        resourceManager: resourceManager,
        onConnection: (Socket socket, MultiAddr localRealAddr, MultiAddr remoteRealAddr) async {
          final localInstancePeerId = await PeerId.random();
          PeerId? remoteReceivedPeerId;

          final connection = await TCPConnection.create(
            socket,
            localRealAddr,
            remoteRealAddr,
            localInstancePeerId,
            remoteReceivedPeerId,
            resourceManager,
            true, // isServer = true
            legacyConnManager: _connManager
            // onIncomingStream callback removed
          );

          return connection;
        },
      );
      return listener;
    } catch (e) {
      throw Exception('Failed to bind: $e');
    }
  }

  @override
  List<String> get protocols => _supportedProtocols;

  @override
  bool canDial(MultiAddr addr) {
    // Check if the address has either ip4 or ip6 and tcp protocols
    final hasIP = addr.hasProtocol('ip4') || addr.hasProtocol('ip6');
    final hasTCP = addr.hasProtocol('tcp');
    
    // Refuse circuit relay addresses - those should be handled by CircuitV2Client
    final hasCircuit = addr.hasProtocol('p2p-circuit');
    if (hasCircuit) {
      return false;
    }
    
    return hasIP && hasTCP;
  }

  /// Closes all connections and cleans up resources
  Future<void> dispose() async {
    // (_connManager as ConnectionManager).dispose(); // If it has a dispose method
    // Or iterate through active connections and close them if not managed by ConnManager directly.
    // For now, assuming ConnManager handles its own cleanup or this is done at a higher level.
  }

  @override
  bool canListen(MultiAddr addr) {
    // Check if the address has either ip4 or ip6 and tcp protocols
    final hasIP = addr.hasProtocol('ip4') || addr.hasProtocol('ip6');
    final hasTCP = addr.hasProtocol('tcp');
    return hasIP && hasTCP;
  }

}
