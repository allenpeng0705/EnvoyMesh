import 'dart:async';
import 'dart:typed_data';
import 'dart:io';

import 'package:dart_libp2p/core/network/transport_conn.dart';
import 'package:dart_libp2p/p2p/security/security_protocol.dart';
import 'package:dart_libp2p/p2p/security/secured_connection.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/crypto/keys.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/network/rcmgr.dart';
import 'package:dart_libp2p/core/network/common.dart';
import 'package:dart_libp2p/core/network/context.dart';
import 'package:dart_libp2p/core/network/stream.dart';
import 'package:logging/logging.dart';
import 'package:cryptography/cryptography.dart' hide PublicKey;

import 'enhanced_mock_transport_conn.dart';
import 'streamlined_mock_transport_conn.dart';

/// Mock secured connection that passes through data without encryption for testing
class MockSecuredConnection extends SecuredConnection {
  final Logger _logger = Logger('MockSecuredConnection');
  final TransportConn _underlying;

  MockSecuredConnection(
    this._underlying,
    PeerId? establishedRemotePeer,
    PublicKey? establishedRemotePublicKey,
    String securityProtocolId,
  ) : super(
          _underlying,
          _DummySecretKey(), // dummy encryption key
          _DummySecretKey(), // dummy decryption key
          establishedRemotePeer: establishedRemotePeer,
          establishedRemotePublicKey: establishedRemotePublicKey,
          securityProtocolId: securityProtocolId,
        );

  // Override read/write to pass through without encryption for testing
  @override
  Future<Uint8List> read([int? length]) async {
    _logger.fine('MockSecuredConnection.read: pass-through to underlying connection');
    return await _underlying.read(length);
  }

  @override
  Future<void> write(Uint8List data) async {
    _logger.fine('MockSecuredConnection.write: pass-through to underlying connection');
    await _underlying.write(data);
  }
}

/// Dummy secret key for testing that doesn't actually encrypt
class _DummySecretKey implements SecretKey {
  @override
  Future<List<int>> extractBytes() async => List.filled(32, 0);

  @override
  Future<SecretKeyData> extract() async => SecretKeyData(List.filled(32, 0));

  @override
  bool get allowDecrypt => true;

  @override
  bool get allowEncrypt => true;

  @override
  bool get isDestroyed => false;

  @override
  bool get isExtractable => true;

  @override
  Future<void> destroy() async {}
}

/// Mock security protocol for testing
class MockSecurityProtocol implements SecurityProtocol {
  final Logger _logger = Logger('MockSecurityProtocol');
  
  @override
  String get protocolId => '/noise';

  @override
  Future<SecuredConnection> secureInbound(TransportConn conn) async {
    _logger.fine('MockSecurityProtocol: Securing inbound connection ${conn.id}');
    
    if (conn is EnhancedMockTransportConn || conn is StreamlinedMockTransportConn) {
      // Return a mock secured connection that doesn't encrypt for testing
      return MockSecuredConnection(
        conn,
        conn.remotePeer,
        null,
        protocolId,
      );
    }
    
    throw Exception('MockSecurityProtocol can only secure EnhancedMockTransportConn or StreamlinedMockTransportConn');
  }

  @override
  Future<SecuredConnection> secureOutbound(TransportConn conn) async {
    _logger.fine('MockSecurityProtocol: Securing outbound connection ${conn.id}');
    
    if (conn is EnhancedMockTransportConn || conn is StreamlinedMockTransportConn) {
      // Return a mock secured connection that doesn't encrypt for testing
      return MockSecuredConnection(
        conn,
        conn.remotePeer,
        null,
        protocolId,
      );
    }
    
    throw Exception('MockSecurityProtocol can only secure EnhancedMockTransportConn or StreamlinedMockTransportConn');
  }
}
