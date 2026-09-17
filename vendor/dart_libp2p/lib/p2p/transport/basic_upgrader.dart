import 'dart:async';
import 'dart:typed_data'; // Added for Uint8List

import 'package:logging/logging.dart';

import '../../core/multiaddr.dart';
import '../../core/network/connection_context.dart';
import '../../core/network/transport_conn.dart';
import '../../core/network/conn.dart';
// core_peer_id.dart is usually aliased or PeerId is directly from core/peer_id.dart
// For now, assuming PeerId and PeerId are available from this import.
import '../../core/peer/peer_id.dart';
import '../../config/config.dart';
import '../security/secured_connection.dart';
import './upgrader.dart'; // For Upgrader interface
import '../protocol/multistream/multistream.dart'; // For MultistreamMuxer
import '../../p2p/security/security_protocol.dart'; // For SecurityProtocol and SecuredConnection
// Use a specific alias for config.StreamMuxer to avoid conflict if StreamMuxer name is used elsewhere
import '../../config/stream_muxer.dart' as config_stream_muxer;
// Use a specific alias for core_mux.Multiplexer
import '../../core/network/mux.dart' as core_mux; // For MuxedConn, and potentially core Multiplexer if different
import '../../p2p/transport/multiplexing/multiplexer.dart' as p2p_mux; // For the Multiplexer type from the factory
import '../../core/crypto/ed25519.dart'; // For generating a default KeyPair
import '../../core/protocol/protocol.dart' show ProtocolID; // For ProtocolID type
import '../../core/network/stream.dart'; // For P2PStream, StreamStats
import '../../core/network/rcmgr.dart'; // For ResourceManager, PeerScope, ConnScope, StreamScope
import '../../core/network/context.dart'; // For Context
import '../../core/crypto/keys.dart'; // For PublicKey
// Corrected path for multiaddr protocol constants
import '../../p2p/multiaddr/protocol.dart' as multiaddr_protocol;
import '../protocol/circuitv2/client/conn.dart' show RelayedConn;
import './udx_transport.dart' show UDXSessionConn;
import './tcp_connection.dart' show TCPConnection;

final _log = Logger('BasicUpgrader');


// --- Helper: NegotiationStreamWrapper ---
class NegotiationStreamWrapper implements P2PStream<Uint8List> {
  final TransportConn _conn;
  final String _protocolId;

  NegotiationStreamWrapper(this._conn, [this._protocolId = 'negotiator']);

  @override
  Future<void> close() => _conn.close();

  @override
  bool get isClosed => _conn.isClosed;

  @override
  bool get isWritable => !_conn.isClosed;

  @override
  Future<Uint8List> read([int? maxLength]) async {
    if (maxLength == null || maxLength == 0) {
      return await _conn.read();
    }
    try {
      return await _conn.read(maxLength);
    } catch (e) {
      rethrow;
    }
  }

  @override
  Future<void> reset() => _conn.close();

  @override
  Future<void> write(Uint8List data) => _conn.write(data);

  @override
  String id() => _conn.id;

  @override
  String protocol() => _protocolId;

  @override
  Future<void> setProtocol(String id) async {}

  @override
  StreamStats stat() => throw UnimplementedError('stat not needed for negotiation wrapper');
  @override
  Conn get conn => throw UnimplementedError('conn not needed for negotiation wrapper');
  @override
  StreamManagementScope scope() => NullScope();
  @override
  Future<void> closeWrite() => throw UnimplementedError('closeWrite not needed for negotiation wrapper');
  @override
  Future<void> closeRead() => throw UnimplementedError('closeRead not needed for negotiation wrapper');

  @override
  Future<void> setDeadline(DateTime? time) async {
    if (time != null) {
      final now = DateTime.now();
      final duration = time.isAfter(now) ? time.difference(now) : Duration.zero;
      _conn.setReadTimeout(duration);
      _conn.setWriteTimeout(duration);
    }
  }

  @override
  Future<void> setReadDeadline(DateTime time) async {
    final now = DateTime.now();
    final duration = time.isAfter(now) ? time.difference(now) : Duration.zero;
    _conn.setReadTimeout(duration);
  }

  @override
  Future<void> setWriteDeadline(DateTime time) async {
    final now = DateTime.now();
    final duration = time.isAfter(now) ? time.difference(now) : Duration.zero;
    _conn.setWriteTimeout(duration);
  }

  @override
  P2PStream<Uint8List> get incoming => throw UnimplementedError('incoming not supported by negotiation wrapper');
}

// --- Helper: UpgradedConnectionImpl ---
class UpgradedConnectionImpl implements Conn, core_mux.MuxedConn {
  final core_mux.MuxedConn _muxedConn;
  final SecuredConnection _securedConn;
  final ProtocolID _negotiatedSecurityProto;
  final ProtocolID _negotiatedMuxerProto;
  final PeerId _localPeerId;
  final PeerId _remotePeerId;
  
  /// Connection context for event correlation
  final ConnectionContext? _context;

  UpgradedConnectionImpl({
    required core_mux.MuxedConn muxedConn,
    required SecuredConnection securedConn,
    required ProtocolID negotiatedSecurityProto,
    required ProtocolID negotiatedMuxerProto,
    required PeerId localPeerId,
    required PeerId remotePeerId,
    ConnectionContext? context,
  })  : _muxedConn = muxedConn,
        _securedConn = securedConn,
        _negotiatedSecurityProto = negotiatedSecurityProto,
        _negotiatedMuxerProto = negotiatedMuxerProto,
        _localPeerId = localPeerId,
        _remotePeerId = remotePeerId,
        _context = context;

  @override
  Future<void> close() => _muxedConn.close();

  @override
  String get id => _securedConn.id;

  @override
  bool get isClosed => _muxedConn.isClosed;

  @override
  MultiAddr get localMultiaddr => _securedConn.localMultiaddr;

  @override
  PeerId get localPeer => _localPeerId;

  @override
  Future<P2PStream> newStream(Context context) async {
    // This is the client-side opening of a stream.
    // It maps to MuxedConn.openStream
    final core_mux.MuxedStream muxedStream = await _muxedConn.openStream(context);
    if (muxedStream is P2PStream) {
      return muxedStream as P2PStream;
    } else {
      // This path should ideally not be hit if YamuxStream correctly implements P2PStream
      throw Exception('MuxedStream from _muxedConn.openStream() is not a P2PStream. Type: ${muxedStream.runtimeType}');
    }
  }

  // Implementation for MuxedConn.openStream
  @override
  Future<core_mux.MuxedStream> openStream(Context context) async {
    return await _muxedConn.openStream(context);
  }

  // Implementation for MuxedConn.acceptStream
  @override
  Future<core_mux.MuxedStream> acceptStream() async {
    return await _muxedConn.acceptStream();
  }

  @override
  PeerId get remotePeer => _remotePeerId;

  @override
  Future<PublicKey?> get remotePublicKey async => _securedConn.remotePublicKey;

  @override
  MultiAddr get remoteMultiaddr => _securedConn.remoteMultiaddr;

  @override
  ConnScope get scope => _securedConn.scope;

  /// Gets the connection context for event correlation
  ConnectionContext? get context => _context;

  // Attempting to make the method static to see if it resolves the persistent linter error.
  static String _extractTransportProtocol(MultiAddr addr) {
    for (final p in addr.protocols) {
      final protocolName = p.name; // Use name for comparisons primarily

      // Check for specific Libp2p protocol names
      if (protocolName == multiaddr_protocol.Protocols.tcp.name) {
        return 'tcp';
      } else if (protocolName == multiaddr_protocol.Protocols.udp.name) {
        // Check for QUIC specifically using its defined name from the Protocols class
        // Multiaddr.hasProtocol expects a String (protocol name)
        if (addr.hasProtocol(multiaddr_protocol.Protocols.quicV1.name)) { 
          return 'quic';
        }
        return 'udp';
      } else if (protocolName == 'ws') { // ws and wss might not be in Protocols class, check by name
        return 'ws';
      } else if (protocolName == 'wss') {
        return 'wss';
      } else if (protocolName == multiaddr_protocol.Protocols.webtransport.name) { 
        return 'webtransport';
      } else if (protocolName == 'webrtc' || protocolName == 'webrtc-direct') { // webrtc related protocols
        return 'webrtc';
      }
    }
    return 'unknown'; // Default if no recognized transport is found
  }

  @override
  ConnState get state {
    // Preserve transport from the underlying connection if it's already set
    // (e.g., RelayedConn sets transport='circuit-relay' which SecuredConnection propagates).
    // Only fall back to multiaddr extraction for direct connections.
    final underlyingTransport = _securedConn.state.transport;
    final transportProtocol = (underlyingTransport.isNotEmpty && underlyingTransport != 'unknown')
        ? underlyingTransport
        : _extractTransportProtocol(_securedConn.remoteMultiaddr);
    return ConnState(
      streamMultiplexer: _negotiatedMuxerProto,
      security: _negotiatedSecurityProto,
      transport: transportProtocol,
      usedEarlyMuxerNegotiation: false,
    );
  }

  @override
  ConnStats get stat => _securedConn.stat; 

  @override
  Future<List<P2PStream>> get streams async {
    if (_muxedConn is p2p_mux.Multiplexer) {
      return (_muxedConn as p2p_mux.Multiplexer).streams;
    } else {
      return []; 
    }
  }
}

class BasicUpgrader implements Upgrader {
  final ResourceManager resourceManager;

  BasicUpgrader({required this.resourceManager});

  /// Drains any leftover bytes from multistream negotiation and pushes them
  /// back into the transport connection's read buffer. This prevents data loss
  /// when multistream-select reads more bytes than needed (e.g., when protocol
  /// negotiation and Noise handshake data arrive in the same transport chunk).
  static void _drainAndPushBack(MultistreamMuxer mss, String streamId, dynamic connection) {
    final leftover = mss.drainLeftover(streamId);
    if (leftover == null || leftover.isEmpty) return;

    _log.info('[BasicUpgrader] Draining ${leftover.length} leftover bytes from multistream and pushing back to connection');
    if (connection is UDXSessionConn) {
      connection.pushBack(leftover);
    } else if (connection is TCPConnection) {
      connection.pushBack(leftover);
    } else {
      _log.warning('[BasicUpgrader] Cannot push back ${leftover.length} leftover bytes to connection type ${connection.runtimeType}');
    }
  }

  @override
  Future<Conn> upgradeOutbound({
    required TransportConn connection,
    required PeerId remotePeerId,
    required Config config,
    required MultiAddr remoteAddr,
  }) async {
    try {
      // Extract or generate connection context
      ConnectionContext? connContext;
      if (connection is RelayedConn) {
        // For relay connections, use the existing context from RelayedConn
        connContext = connection.context;
      } else {
        // For direct connections, generate a new context
        connContext = ConnectionContext.direct(
          remotePeerId: remotePeerId.toBase58(),
          transportConnectionId: connection.id,
        );
      }
      
      final mssForSecurity = MultistreamMuxer();
      final securityProtoIDs = config.securityProtocols.map((s) => s.protocolId).toList();
      final negotiationSecStream = NegotiationStreamWrapper(connection, '/sec-negotiator');

      final chosenSecurityIdStr = await mssForSecurity.selectOneOf(negotiationSecStream, securityProtoIDs);

      // Drain any leftover bytes from multistream negotiation and push them
      // back into the raw connection before Noise handshake reads from it.
      _drainAndPushBack(mssForSecurity, negotiationSecStream.id(), connection);

      if (chosenSecurityIdStr == null) {
        await connection.close();
        throw Exception("Failed to negotiate security protocol with $remotePeerId at $remoteAddr");
      }
      final chosenSecurityId = chosenSecurityIdStr;

      final securityModule = config.securityProtocols.firstWhere(
        (s) => s.protocolId == chosenSecurityId,
        orElse: () => throw Exception("Selected security protocol $chosenSecurityId not found in config"),
      );
      final SecuredConnection securedConn = await securityModule.secureOutbound(connection);

      final mssForMuxers = MultistreamMuxer();
      final muxerProtoIDs = config.muxers.map((m) => m.id).toList();
      final negotiationMuxStream = NegotiationStreamWrapper(securedConn, '/mux-negotiator');
      final chosenMuxerIdStr = await mssForMuxers.selectOneOf(negotiationMuxStream, muxerProtoIDs);

      // Drain muxer negotiation leftover (defensive; less likely over SecuredConnection)
      _drainAndPushBack(mssForMuxers, negotiationMuxStream.id(), securedConn);

      if (chosenMuxerIdStr == null) {
        await securedConn.close();
        throw Exception("Failed to negotiate stream multiplexer with ${securedConn.remotePeer} at $remoteAddr");
      }
      final chosenMuxerId = chosenMuxerIdStr;

      final muxerEntry = config.muxers.firstWhere(
        (m) => m.id == chosenMuxerId,
        orElse: () => throw Exception("Selected muxer protocol $chosenMuxerId not found in config"),
      );

      final p2p_mux.Multiplexer p2pMultiplexerInstance = muxerEntry.muxerFactory(
        securedConn,
        true, // isClient = true
      );
      
      final PeerScope peerScope = await resourceManager.viewPeer(
        securedConn.remotePeer, 
        (ps) async => ps 
      );

      final core_mux.MuxedConn muxedConnection = await p2pMultiplexerInstance.newConnOnTransport(
        securedConn, 
        false, // isServer = false for outbound
        peerScope, 
      );

      final PublicKey localPublicKey;
      if (config.peerKey != null) {
        localPublicKey = config.peerKey!.publicKey;
      } else {
        final tempKeyPair = await generateEd25519KeyPair();
        localPublicKey = tempKeyPair.publicKey;
      }
      final PeerId localPId = PeerId.fromPublicKey(localPublicKey); 

      return UpgradedConnectionImpl(
        muxedConn: muxedConnection,
        securedConn: securedConn,
        negotiatedSecurityProto: chosenSecurityId,
        negotiatedMuxerProto: chosenMuxerId,
        localPeerId: localPId,
        remotePeerId: securedConn.remotePeer,
        context: connContext,
      );

    } catch (e) {
      await connection.close();
      rethrow;
    }
  }

  @override
  Future<Conn> upgradeInbound({
    required TransportConn connection,
    required Config config,
  }) async {
    try {
      // Extract or generate connection context
      ConnectionContext? connContext;
      if (connection is RelayedConn) {
        // For relay connections, use the existing context from RelayedConn
        connContext = connection.context;
      } else {
        // For direct connections, generate a new context
        // Note: We don't know the remote peer yet, will be set after security negotiation
        connContext = null; // Will be created after we know the remote peer
      }
      
      final mssForSecurity = MultistreamMuxer();
      final negotiationSecStream = NegotiationStreamWrapper(connection, '/sec-negotiator-in');

      final Completer<ProtocolID> securityProtoCompleter = Completer();
      if (config.securityProtocols.isEmpty) {
        await connection.close();
        throw Exception("No security protocols configured for inbound connection");
      }
      for (final sp in config.securityProtocols) {
        mssForSecurity.addHandler(sp.protocolId, (ProtocolID p, P2PStream s) async {
          if (!securityProtoCompleter.isCompleted) {
            securityProtoCompleter.complete(p);
          }
        });
      }
      await mssForSecurity.handle(negotiationSecStream);

      // Drain any leftover bytes from multistream negotiation and push them
      // back into the raw connection before Noise handshake reads from it.
      _drainAndPushBack(mssForSecurity, negotiationSecStream.id(), connection);

      final chosenSecurityId = await securityProtoCompleter.future;

      final securityModule = config.securityProtocols.firstWhere(
        (s) => s.protocolId == chosenSecurityId,
        orElse: () => throw Exception("Client proposed security protocol $chosenSecurityId not found/supported"),
      );
      final SecuredConnection securedConn = await securityModule.secureInbound(connection);

      final mssForMuxers = MultistreamMuxer();
      final negotiationMuxStream = NegotiationStreamWrapper(securedConn, '/mux-negotiator-in');
      final Completer<ProtocolID> muxerProtoCompleter = Completer();
      if (config.muxers.isEmpty) {
        await securedConn.close();
        throw Exception("No muxers configured for inbound connection");
      }
      for (final m in config.muxers) {
        mssForMuxers.addHandler(m.id, (ProtocolID p, P2PStream s) async {
          if (!muxerProtoCompleter.isCompleted) {
            muxerProtoCompleter.complete(p);
          }
        });
      }

      await mssForMuxers.handle(negotiationMuxStream);

      // Drain muxer negotiation leftover (defensive; less likely over SecuredConnection)
      _drainAndPushBack(mssForMuxers, negotiationMuxStream.id(), securedConn);

      final chosenMuxerId = await muxerProtoCompleter.future;

      final muxerEntry = config.muxers.firstWhere(
        (m) => m.id == chosenMuxerId,
        orElse: () => throw Exception("Client proposed muxer $chosenMuxerId not found/supported"),
      );
      
      final p2p_mux.Multiplexer p2pMultiplexerInstance = muxerEntry.muxerFactory(
        securedConn, 
        false, // isClient = false
      );

      final PeerScope peerScope = await resourceManager.viewPeer(
        securedConn.remotePeer, 
        (ps) async => ps 
      );
      
      final core_mux.MuxedConn muxedConnection = await p2pMultiplexerInstance.newConnOnTransport(
        securedConn, 
        true,  // isServer = true for inbound
        peerScope,
      );

      final PublicKey localPublicKey;
      if (config.peerKey != null) {
        localPublicKey = config.peerKey!.publicKey;
      } else {
        final tempKeyPair = await generateEd25519KeyPair();
        localPublicKey = tempKeyPair.publicKey;
      }
      final PeerId localPId = PeerId.fromPublicKey(localPublicKey); 

      // Generate context for direct inbound connections if not already set
      if (connContext == null && connection is! RelayedConn) {
        connContext = ConnectionContext.direct(
          remotePeerId: securedConn.remotePeer.toBase58(),
          transportConnectionId: connection.id,
        );
      }

      return UpgradedConnectionImpl(
        muxedConn: muxedConnection,
        securedConn: securedConn,
        negotiatedSecurityProto: chosenSecurityId,
        negotiatedMuxerProto: chosenMuxerId,
        localPeerId: localPId,
        remotePeerId: securedConn.remotePeer,
        context: connContext,
      );

    } catch (e) {
      await connection.close();
      rethrow;
    }
  }
}
