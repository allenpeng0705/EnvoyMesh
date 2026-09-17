import 'dart:async';
import 'dart:io';
import 'package:logging/logging.dart'; // Added for logging

import '../../core/connmgr/conn_manager.dart';
import '../../core/multiaddr.dart';
import '../../core/network/conn.dart';
import '../../core/network/transport_conn.dart';
import '../../core/network/mux.dart' show Multiplexer;
import '../../core/network/rcmgr.dart' show ResourceManager;
import 'listener.dart';
import 'transport_config.dart';
// import 'connection_manager.dart'; // ConnManager is imported from core

/// TCP implementation of the Listener interface
class TCPListener implements Listener {
  final Logger _logger = Logger('TCPListener'); // Added logger
  final ServerSocket _server;
  final MultiAddr _addr;
  final TransportConfig _config;
  final ConnManager _connManager;
  // final Multiplexer _multiplexer; // Removed
  final ResourceManager _resourceManager; // Kept, as _onConnection might need it for raw TCPConnection
  final Future<TransportConn> Function(Socket socket, MultiAddr localAddr, MultiAddr remoteAddr) _onConnection;
  final _connectionController = StreamController<TransportConn>();
  bool _closed = false;

  /// Creates a new TCP listener
  TCPListener(
    this._server, {
    required MultiAddr addr,
    required TransportConfig config,
    required ConnManager connManager,
    // required Multiplexer multiplexer, // Removed
    required ResourceManager resourceManager, // Kept
    required Future<TransportConn> Function(Socket socket, MultiAddr localAddr, MultiAddr remoteAddr) onConnection,
  })  : _addr = addr,
        _config = config,
        _connManager = connManager,
        // _multiplexer = multiplexer, // Removed
        _resourceManager = resourceManager, // Kept
        _onConnection = onConnection {
    _server.listen(_handleConnection);
  }

  void _handleConnection(Socket socket) async {
    // Create multiaddrs for local and remote endpoints from the accepted socket
    final localRealAddr = MultiAddr('/ip4/${socket.address.address}/tcp/${socket.port}');
    final remoteRealAddr = MultiAddr('/ip4/${socket.remoteAddress.address}/tcp/${socket.remotePort}');
    
    try {
      final connection = await _onConnection(socket, localRealAddr, remoteRealAddr);
      if (!_connectionController.isClosed) {
        _connectionController.add(connection);
      } else {
        // Controller is closed, so close the accepted connection as it can't be processed
        await connection.close();
      }
    } catch (e) {
      // Ensure socket is closed if connection handling fails
      try {
        await socket.close();
      } catch (closeError) {
      }
    }
  }

  @override
  MultiAddr get addr => _addr;

  @override
  Stream<TransportConn> get connectionStream => _connectionController.stream;

  @override
  bool get isClosed => _closed;

  @override
  Future<void> close() async {
    if (_closed) {
      _logger.fine('TCPListener for ${_addr.toString()} already closed.');
      return;
    }
    _logger.info('TCPListener for ${_addr.toString()} closing. Stack trace:\n${StackTrace.current}');
    _closed = true;
    try {
      await _server.close();
      _logger.fine('TCPListener for ${_addr.toString()}: ServerSocket closed.');
    } catch (e, s) {
      _logger.warning('TCPListener for ${_addr.toString()}: Error closing ServerSocket: $e', e, s);
    }
    try {
      await _connectionController.close();
      _logger.fine('TCPListener for ${_addr.toString()}: ConnectionController closed.');
    } catch (e, s) {
      _logger.warning('TCPListener for ${_addr.toString()}: Error closing ConnectionController: $e', e, s);
    }
  }

  @override
  Future<TransportConn?> accept() async {
    if (_closed) return null;

    try {
      return await connectionStream.first;
    } on StateError {
      return null;
    }
  }

  @override
  bool supportsAddr(MultiAddr addr) {
    final hasIP = addr.hasProtocol('ip4') || addr.hasProtocol('ip6');
    final hasTCP = addr.hasProtocol('tcp');
    return hasIP && hasTCP;
  }
}
