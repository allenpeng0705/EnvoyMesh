import 'dart:async';
import 'dart:typed_data';
import 'dart:io';

import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/p2p/transport/listener.dart';
import 'package:dart_libp2p/p2p/transport/transport.dart';
import 'package:dart_libp2p/p2p/transport/transport_config.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/network/transport_conn.dart';

import 'mock_connection.dart';

/// A mock implementation of TransportConn for testing
class MockTransportConn extends MockConnection implements TransportConn {
  MockTransportConn({
    required MultiAddr localAddr,
    required MultiAddr remoteAddr,
    required PeerId remotePeer,
    PeerId? localPeer,
    String id = 'mock-transport-connection',
  }) : super(
          localAddr: localAddr,
          remoteAddr: remoteAddr,
          remotePeer: remotePeer,
          localPeer: localPeer,
          id: id,
        );

  @override
  void notifyActivity() {
    // Mock implementation, can be empty or log
  }
}

/// A mock implementation of Transport for testing
class MockTransport implements Transport {
  /// Addresses that this transport can dial
  final List<MultiAddr> canDialAddrs = [];

  /// Addresses that this transport can listen on
  final List<MultiAddr> canListenAddrs = [];

  /// Connections created by this transport
  final List<Conn> connections = [];

  /// Listeners created by this transport
  final List<Listener> listeners = [];

  /// Mock transport configuration
  final TransportConfig _config = TransportConfig();

  @override
  TransportConfig get config => _config;

  @override
  List<String> get protocols => ['/ip4/tcp', '/ip6/tcp'];

  @override
  bool canDial(MultiAddr addr) {
    return canDialAddrs.any((a) => a.toString() == addr.toString());
  }

  @override
  bool canListen(MultiAddr addr) {
    return canListenAddrs.any((a) => a.toString() == addr.toString());
  }

  @override
  Future<Conn> dial(MultiAddr addr, {Duration? timeout}) async {
    if (!canDial(addr)) {
      throw Exception('Cannot dial address: $addr');
    }

    final conn = MockTransportConn(
      localAddr: MultiAddr('/ip4/127.0.0.1/tcp/1234'),
      remoteAddr: addr,
      remotePeer: PeerId.fromString('QmMockPeerId'),
    );

    connections.add(conn);
    return conn;
  }

  @override
  Future<Listener> listen(MultiAddr addr) async {
    if (!canListen(addr)) {
      throw Exception('Cannot listen on address: $addr');
    }

    final listener = MockListener(addr: addr);
    listeners.add(listener);
    return listener;
  }

  @override
  Future<void> dispose() {
    // TODO: implement dispose
    throw UnimplementedError();
  }
}

/// A mock implementation of Listener for testing
class MockListener implements Listener {
  /// The address this listener is listening on
  final MultiAddr addr;

  /// The controller for the connection stream
  final StreamController<TransportConn> _connectionController = StreamController<TransportConn>.broadcast();
  
  /// Flag to track if the listener is closed
  bool _closed = false;

  MockListener({
    required this.addr,
  });

  @override
  Future<void> close() async {
    _closed = true;
    await _connectionController.close();
  }

  @override
  Stream<TransportConn> get connectionStream => _connectionController.stream;

  @override
  bool get isClosed => _closed || _connectionController.isClosed;

  @override
  Future<TransportConn?> accept() async {
    if (isClosed) return null;
    
    // Return the next connection from the stream, or null if the stream is closed
    try {
      return await connectionStream.first;
    } catch (e) {
      return null;
    }
  }

  @override
  bool supportsAddr(MultiAddr addr) {
    // Simple implementation - supports the address it was created with
    return this.addr.toString() == addr.toString();
  }

  /// Simulates a new incoming connection
  void simulateConnection(TransportConn conn) {
    if (!_connectionController.isClosed) {
      _connectionController.add(conn);
    }
  }
}
