import 'dart:async';
import 'dart:io'; // For Socket (though unimplemented)
import 'dart:typed_data';

import 'package:dart_libp2p/core/crypto/keys.dart';
import 'package:dart_libp2p/core/host/host.dart'; // Needed for CircuitV2Client.host
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/common.dart'; // For ScopeStat, ResourceScopeSpan if needed by ConnScope
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/network/connection_context.dart';
import 'package:dart_libp2p/core/network/context.dart';
import 'package:dart_libp2p/core/network/stream.dart';
import 'package:dart_libp2p/core/network/transport_conn.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/protocol/protocol.dart'; // For ProtocolID in ConnState

// Forward declaration for CircuitV2Client, will be defined in client.dart
// This import will be resolved once client.dart is implemented.
import 'package:dart_libp2p/p2p/protocol/circuitv2/client/client.dart';

import '../../../../core/network/rcmgr.dart';
import 'package:logging/logging.dart';

final _log = Logger('RelayedConn');

/// _RelayedConnStats implements ConnStats for a RelayedConn.
class _RelayedConnStats implements ConnStats {
  final StreamStats _streamStats; // Stats from the underlying P2PStream to the relay
  final Stats _stats;

  _RelayedConnStats(this._streamStats)
      : _stats = Stats(
          direction: _streamStats.direction,
          opened: _streamStats.opened,
          limited: _streamStats.limited,
          extra: _streamStats.extra,
        );

  @override
  Stats get stats => _stats;

  @override
  // A RelayedConn represents a single logical connection/stream path.
  // It doesn't multiplex further streams itself.
  int get numStreams => 1;
}

/// RelayedConn is a connection to a remote peer through a relay.
/// It implements the [TransportConn] interface.
class RelayedConn implements TransportConn {
  final P2PStream<Uint8List> _stream; // Stream to the relay
  final CircuitV2Client _transport; // The transport that created this connection
  final PeerId _localPeer;
  final PeerId _remotePeer; // The actual remote peer, not the relay
  final MultiAddr _localMultiaddr;
  final MultiAddr _remoteMultiaddr; // Multiaddr of the remote peer, potentially a circuit addr
  final _RelayedConnStats _connStats;
  final void Function()? _onClose; // Callback for cleanup when connection closes
  // final bool _isInitiator; // Captured by _stream.stat().direction
  
  /// Diagnostic session ID for cross-node correlation
  final String? diagnosticSessionId;

  /// Connection context for event correlation across layers
  ConnectionContext? _context;

  RelayedConn({
    required P2PStream<Uint8List> stream,
    required CircuitV2Client transport,
    required PeerId localPeer,
    required PeerId remotePeer,
    required MultiAddr localMultiaddr,
    required MultiAddr remoteMultiaddr,
    void Function()? onClose,
    this.diagnosticSessionId,
    String? outerConnectionId,
    String? relayPeerId,
    int? hopStreamId,
    // required bool isInitiator, // isInitiator can be derived from stream.stat().direction
  })  : _stream = stream,
        _transport = transport,
        _localPeer = localPeer,
        _remotePeer = remotePeer,
        _localMultiaddr = localMultiaddr,
        _remoteMultiaddr = remoteMultiaddr,
        _onClose = onClose,
        // _isInitiator = isInitiator,
        _connStats = _RelayedConnStats(stream.stat()) {
    // Generate connection context for relay inner connection
    if (outerConnectionId != null && relayPeerId != null) {
      _context = ConnectionContext.relayInner(
        remotePeerId: remotePeer.toBase58(),
        outerConnectionId: outerConnectionId,
        relayPeerId: relayPeerId,
        sessionId: diagnosticSessionId,
        hopStreamId: hopStreamId,
      );
    }
  }

  // == Conn Methods ==
  @override
  Future<void> close() async {
    await _stream.close();
    // Notify the transport to remove this connection from tracking
    _onClose?.call();
  }

  /// Closes the write side of the relayed connection (half-close support)
  /// This allows the remote peer to finish sending data while signaling
  /// that we won't send any more data.
  Future<void> closeWrite() async {
    await _stream.closeWrite();
  }

  /// Closes the read side of the relayed connection (half-close support)
  /// This signals that we won't read any more data from the remote peer.
  Future<void> closeRead() async {
    await _stream.closeRead();
  }

  @override
  String get id => _stream.id();

  @override
  bool get isClosed => _stream.isClosed;

  @override
  PeerId get localPeer => _localPeer;

  @override
  MultiAddr get localMultiaddr => _localMultiaddr;

  @override
  PeerId get remotePeer => _remotePeer;

  @override
  MultiAddr get remoteMultiaddr => _remoteMultiaddr;

  @override
  Future<PublicKey?> get remotePublicKey => _stream.conn.remotePublicKey;

  @override
  ConnState get state {
    // Return empty state to indicate this connection needs to be upgraded.
    // The Swarm will then negotiate Noise + Yamux on top of this relay stream.
    // This matches go-libp2p's behavior where the circuit relay Conn is upgraded.
    return ConnState(
      streamMultiplexer: '', // Empty = not yet multiplexed
      security: '',          // Empty = not yet secured
      transport: 'circuit-relay',
      usedEarlyMuxerNegotiation: false,
    );
  }

  @override
  ConnStats get stat => _connStats;

  @override
  ConnScope get scope => _stream.conn.scope;

  /// Gets the connection context for event correlation
  ConnectionContext? get context => _context;

  @override
  Future<P2PStream<dynamic>> newStream(Context context) {
    // A RelayedConn represents a single logical channel.
    // It does not support further multiplexing new streams over itself directly.
    // New streams to the same remote peer via a relay would be new RelayedConn instances.
    throw UnimplementedError(
        'newStream on RelayedConn is not supported. Create a new relayed connection via the transport.');
  }

  @override
  Future<List<P2PStream<dynamic>>> get streams {
    // A RelayedConn wraps a single P2PStream to the relay.
    // It does not manage a list of multiplexed streams itself.
    throw UnimplementedError(
        'streams getter on RelayedConn is not supported.');
    // If it were to represent the stream it wraps: return Future.value([_stream]);
    // But this conflicts with the semantics of Conn.streams.
  }

  // == TransportConn Methods ==
  @override
  Future<Uint8List> read([int? maxLength]) async {
    return _stream.read(maxLength);
  }

  @override
  Future<void> write(Uint8List data) async {
    _log.fine('[RELAY-CONN-WRITE] Writing ${data.length} bytes to relay pipe stream ${_stream.id()} for peer ${_remotePeer.toBase58().substring(0, 16)}');
    await _stream.write(data);
    _log.fine('[RELAY-CONN-WRITE-DONE] Wrote ${data.length} bytes to relay pipe stream ${_stream.id()}');
  }

  @override
  Socket get socket =>
      throw UnimplementedError('Socket access not supported on RelayedConn');

  @override
  void setReadTimeout(Duration timeout) {
    // P2PStream has setReadDeadline(DateTime time)
    _stream.setReadDeadline(DateTime.now().add(timeout));
  }

  @override
  void setWriteTimeout(Duration timeout) {
    // P2PStream has setWriteDeadline(DateTime time)
    _stream.setWriteDeadline(DateTime.now().add(timeout));
  }

  @override
  void notifyActivity() {
    // TODO: Implement if activity on a relayed connection should
    // keep the underlying physical connection to the relay alive.
    // This might involve propagating activity to _stream.conn.notifyActivity()
    // if _stream.conn is a TransportConn that implements it, or another mechanism.
    // For now, providing an empty implementation to satisfy the interface.
    // _transport.host.logger.finer('RelayedConn.notifyActivity called for stream ${_stream.id()} to peer $_remotePeer - currently a no-op.');
  }
}
