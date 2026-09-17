import 'dart:async';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart' as crypto; // Renamed to avoid conflict
import 'package:meta/meta.dart';

import '../../../core/crypto/keys.dart' as keys;
import '../../../core/crypto/ed25519.dart' as ed25519_keys; // Added for Ed25519PublicKey
import '../../../core/crypto/pb/crypto.pbenum.dart' as crypto_pb; // Renamed
import '../../../core/network/transport_conn.dart';
import '../../../core/peer/peer_id.dart';
import '../secured_connection.dart';
import '../security_protocol.dart';
import 'xx_pattern.dart';
import '../../../pb/noise/payload.pb.dart' as noise_pb; // Added
import 'package:logging/logging.dart'; // Added for logging

final _log = Logger('NoiseProtocol');

/// Exceptions specific to the Noise Protocol implementation
class NoiseProtocolException implements Exception {
  final String message;
  final Object? cause;

  NoiseProtocolException(this.message, [this.cause]);

  @override
  String toString() => 'NoiseProtocolException: $message${cause != null ? ' ($cause)' : ''}';
}

/// Implementation of the Noise Protocol (XX pattern) for libp2p
class NoiseSecurity implements SecurityProtocol {
  static const String protocolIdForState = '/noise'; // Made public for SecuredConnection
  static const _protocolString = protocolIdForState;

  final keys.KeyPair _identityKey;
  bool _isDisposed = false;

  NoiseSecurity._(this._identityKey);

  /// Creates a new NoiseXXProtocol instance
  static Future<NoiseSecurity> create(keys.KeyPair identityKey) async {
    // Verify Ed25519 compatibility
    final pubKey = identityKey.publicKey;
    if (pubKey.type != crypto_pb.KeyType.Ed25519) { // Changed keyType to type
      throw NoiseProtocolException('Identity key must be Ed25519 compatible (got ${pubKey.type})');
    }
    return NoiseSecurity._(identityKey);
  }

  /// The prefix used when signing the Noise static public key per libp2p spec.
  static const String _signaturePrefix = 'noise-libp2p-static-key:';

  /// Writes a Noise handshake message with 2-byte big-endian length prefix.
  Future<void> _writeHandshakeMessage(TransportConn conn, Uint8List msg) async {
    final framed = Uint8List(2 + msg.length);
    framed[0] = (msg.length >> 8) & 0xFF;
    framed[1] = msg.length & 0xFF;
    framed.setAll(2, msg);
    await conn.write(framed);
  }

  /// Reads a Noise handshake message with 2-byte big-endian length prefix.
  Future<Uint8List> _readHandshakeMessage(TransportConn conn) async {
    final lengthBytes = await conn.read(2);
    if (lengthBytes.length < 2) throw NoiseProtocolException('Failed to read handshake message length prefix');
    final length = (lengthBytes[0] << 8) | lengthBytes[1];
    if (length > 65535) {
      final hexPrefix = lengthBytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join(' ');
      _log.severe('Noise handshake framing desync: length prefix bytes [0x$hexPrefix] decoded to $length (> 65535). '
          'This likely means the multistream-select leftover bytes were lost and Noise is reading raw key material as a length prefix.');
    }
    if (length == 0) return Uint8List(0);
    final data = await conn.read(length);
    if (data.length < length) {
      final hexPrefix = lengthBytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join(' ');
      _log.severe('Noise short read: length prefix [0x$hexPrefix] = $length, but only got ${data.length} bytes. '
          'Probable framing desync from lost multistream leftover bytes.');
      throw NoiseProtocolException('Short read on handshake message: expected $length, got ${data.length}');
    }
    return data;
  }

  /// Creates the NoiseHandshakePayload for embedding inside a Noise handshake message.
  /// Per libp2p spec, each peer signs their OWN Noise static public key with
  /// the prefix "noise-libp2p-static-key:" using their libp2p identity key.
  Future<Uint8List> _createHandshakePayload(Uint8List ownStaticNoiseKey) async {
    final payload = noise_pb.NoiseHandshakePayload();
    payload.identityKey = await _identityKey.publicKey.marshal();

    // Sign: "noise-libp2p-static-key:" + own_static_noise_key
    final dataToSign = Uint8List.fromList([
      ..._signaturePrefix.codeUnits,
      ...ownStaticNoiseKey,
    ]);
    payload.identitySig = await _identityKey.privateKey.sign(dataToSign);

    return payload.writeToBuffer();
  }

  /// Verifies a remote peer's NoiseHandshakePayload.
  /// Returns the remote PeerId on success.
  Future<PeerId> _verifyHandshakePayload(
    Uint8List payloadBytes,
    Uint8List remoteStaticNoiseKey,
  ) async {
    final payload = noise_pb.NoiseHandshakePayload.fromBuffer(payloadBytes);

    if (!payload.hasIdentityKey()) throw NoiseProtocolException('Remote payload missing identity key');
    if (!payload.hasIdentitySig()) throw NoiseProtocolException('Remote payload missing signature');

    final remoteLibp2pPublicKey = ed25519_keys.Ed25519PublicKey.unmarshal(
        Uint8List.fromList(payload.identityKey));

    // Verify: "noise-libp2p-static-key:" + remote_static_noise_key
    final dataToVerify = Uint8List.fromList([
      ..._signaturePrefix.codeUnits,
      ...remoteStaticNoiseKey,
    ]);
    final sigVerified = await remoteLibp2pPublicKey.verify(
        dataToVerify, Uint8List.fromList(payload.identitySig));
    if (!sigVerified) throw NoiseProtocolException('Failed to verify remote signature');

    return PeerId.fromPublicKey(remoteLibp2pPublicKey);
  }


  @override
  Future<SecuredConnection> secureOutbound(TransportConn connection) async {
    if (_isDisposed) throw NoiseProtocolException('Protocol has been disposed');

    try {
      final staticKey = await crypto.X25519().newKeyPair();
      final pattern = await NoiseXXPattern.create(true, staticKey);

      // XX handshake with embedded identity payloads per libp2p Noise spec:
      //   msg1: -> e                (initiator sends ephemeral, empty payload)
      //   msg2: <- e, ee, s, es     (responder sends with identity payload)
      //   msg3: -> s, se            (initiator sends with identity payload)

      // 1. Send msg1 (empty payload)
      final msg1 = await pattern.writeMessage(Uint8List(0));
      _log.info('secureOutbound: Writing msg1 (e): ${msg1.length} bytes');
      await _writeHandshakeMessage(connection, msg1);

      // 2. Read msg2 (contains responder's identity payload)
      final msg2Raw = await _readHandshakeMessage(connection);
      _log.info('secureOutbound: Read msg2: ${msg2Raw.length} bytes');
      final msg2Payload = await pattern.readMessage(msg2Raw);

      // Verify responder's identity from msg2 payload
      if (msg2Payload == null || msg2Payload.isEmpty) {
        throw NoiseProtocolException('Responder msg2 did not contain identity payload');
      }
      if (pattern.remoteStaticKey == null) {
        throw NoiseProtocolException("Responder's static key is null after msg2");
      }
      final remotePeerId = await _verifyHandshakePayload(msg2Payload, pattern.remoteStaticKey!);

      // 3. Send msg3 with our identity payload
      final ownStaticKey = await pattern.getStaticPublicKey();
      final initiatorPayload = await _createHandshakePayload(ownStaticKey);
      final msg3 = await pattern.writeMessage(initiatorPayload);
      _log.info('secureOutbound: Writing msg3 (s,se + payload): ${msg3.length} bytes');
      await _writeHandshakeMessage(connection, msg3);

      _log.info('secureOutbound: Handshake complete. Remote peer: ${remotePeerId.toBase58()}');

      // Session keys are now derived. Nonces start at 0 (no post-handshake exchange).
      final remoteLibp2pPublicKey = ed25519_keys.Ed25519PublicKey.unmarshal(
          Uint8List.fromList(
              noise_pb.NoiseHandshakePayload.fromBuffer(msg2Payload).identityKey));

      return SecuredConnection(
        connection,
        pattern.sendKey,
        pattern.recvKey,
        establishedRemotePeer: remotePeerId,
        establishedRemotePublicKey: remoteLibp2pPublicKey,
        securityProtocolId: _protocolString,
      );
    } catch (e) {
      await connection.close();
      if (e is NoiseProtocolException) rethrow;
      throw NoiseProtocolException('Failed to secure outbound connection', e);
    }
  }

  @override
  Future<SecuredConnection> secureInbound(TransportConn connection) async {
    if (_isDisposed) throw NoiseProtocolException('Protocol has been disposed');

    try {
      final staticKey = await crypto.X25519().newKeyPair();
      final pattern = await NoiseXXPattern.create(false, staticKey);

      // XX handshake (responder side):
      //   msg1: <- e                (read initiator's ephemeral)
      //   msg2: -> e, ee, s, es     (send with our identity payload)
      //   msg3: <- s, se            (read with initiator's identity payload)

      // 1. Read msg1
      final msg1Raw = await _readHandshakeMessage(connection);
      _log.info('secureInbound: Read msg1 (e): ${msg1Raw.length} bytes');
      await pattern.readMessage(msg1Raw);

      // 2. Send msg2 with our identity payload
      final ownStaticKey = await pattern.getStaticPublicKey();
      final responderPayload = await _createHandshakePayload(ownStaticKey);
      final msg2 = await pattern.writeMessage(responderPayload);
      _log.info('secureInbound: Writing msg2 (e,ee,s,es + payload): ${msg2.length} bytes');
      await _writeHandshakeMessage(connection, msg2);

      // 3. Read msg3 (contains initiator's identity payload)
      final msg3Raw = await _readHandshakeMessage(connection);
      _log.info('secureInbound: Read msg3: ${msg3Raw.length} bytes');
      final msg3Payload = await pattern.readMessage(msg3Raw);

      // Verify initiator's identity from msg3 payload
      if (msg3Payload == null || msg3Payload.isEmpty) {
        throw NoiseProtocolException('Initiator msg3 did not contain identity payload');
      }
      if (pattern.remoteStaticKey == null) {
        throw NoiseProtocolException("Initiator's static key is null after msg3");
      }
      final remotePeerId = await _verifyHandshakePayload(msg3Payload, pattern.remoteStaticKey!);

      _log.info('secureInbound: Handshake complete. Remote peer: ${remotePeerId.toBase58()}');

      final remoteLibp2pPublicKey = ed25519_keys.Ed25519PublicKey.unmarshal(
          Uint8List.fromList(
              noise_pb.NoiseHandshakePayload.fromBuffer(msg3Payload).identityKey));

      // Nonces start at 0 (no post-handshake exchange needed).
      return SecuredConnection(
        connection,
        pattern.sendKey,
        pattern.recvKey,
        establishedRemotePeer: remotePeerId,
        establishedRemotePublicKey: remoteLibp2pPublicKey,
        securityProtocolId: _protocolString,
      );
    } catch (e) {
      await connection.close();
      if (e is NoiseProtocolException) rethrow;
      throw NoiseProtocolException('Failed to secure inbound connection', e);
    }
  }

  /// Signs a static key using the identity key
  // Future<Uint8List> signStaticKey(Uint8List staticKey) async {
  //   final message = 'noise-libp2p-static-key:${String.fromCharCodes(staticKey)}';
  //   final signature = await Ed25519().sign(
  //     message.codeUnits,
  //     keyPair: _identityKey,
  //   );
  //   return Uint8List.fromList(signature.bytes);
  // }

  Future<void> dispose() async {
    _isDisposed = true;
  }

  @override
  String get protocolId => _protocolString;

  // Testing support
  @visibleForTesting
  static Future<NoiseSecurity> createForTesting({
    required keys.KeyPair identityKey,
  }) async {
    return NoiseSecurity._(identityKey);
  }
}
