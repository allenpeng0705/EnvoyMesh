import 'dart:async';
import 'dart:typed_data';
import 'dart:convert';

import 'package:cryptography/cryptography.dart';
import 'package:meta/meta.dart';

import 'handshake_state.dart';

/// Represents the immutable state of a Noise handshake
class HandshakeState {
  final Uint8List chainKey;
  final Uint8List handshakeHash;
  final XXHandshakeState state;
  /// Current cipher key during handshake (updated by MixKey/DH operations).
  /// null means "empty key" = encryption is identity (pass-through).
  final SecretKey? cipherKey;
  /// Cipher nonce, reset to 0 after each MixKey.
  final int cipherNonce;
  /// Final send key (only set after Split at handshake completion).
  final SecretKey? sendKey;
  /// Final recv key (only set after Split at handshake completion).
  final SecretKey? recvKey;
  final Uint8List? remoteEphemeralKey;
  final Uint8List? remoteStaticKey;

  const HandshakeState({
    required this.chainKey,
    required this.handshakeHash,
    required this.state,
    this.cipherKey,
    this.cipherNonce = 0,
    this.sendKey,
    this.recvKey,
    this.remoteEphemeralKey,
    this.remoteStaticKey,
  });

  HandshakeState copyWith({
    Uint8List? chainKey,
    Uint8List? handshakeHash,
    XXHandshakeState? state,
    SecretKey? cipherKey,
    bool clearCipherKey = false,
    int? cipherNonce,
    SecretKey? sendKey,
    SecretKey? recvKey,
    Uint8List? remoteEphemeralKey,
    Uint8List? remoteStaticKey,
  }) {
    return HandshakeState(
      chainKey: chainKey ?? this.chainKey,
      handshakeHash: handshakeHash ?? this.handshakeHash,
      state: state ?? this.state,
      cipherKey: clearCipherKey ? null : (cipherKey ?? this.cipherKey),
      cipherNonce: cipherNonce ?? this.cipherNonce,
      sendKey: sendKey ?? this.sendKey,
      recvKey: recvKey ?? this.recvKey,
      remoteEphemeralKey: remoteEphemeralKey ?? this.remoteEphemeralKey,
      remoteStaticKey: remoteStaticKey ?? this.remoteStaticKey,
    );
  }
}

/// Message type for length validation
enum NoiseMessageType {
  ephemeralKey,
  secondMessage,
  finalMessage,
}

/// Implementation of the Noise XX pattern for libp2p
/// 
/// The XX pattern:
///   -> e                    // Initial: Initiator sends ephemeral key
///   <- e, ee, s, es        // Response: Responder sends ephemeral key, performs ee+es
///   -> s, se               // Final: Initiator sends static key, performs se
class NoiseXXPattern {
  static const PROTOCOL_NAME = 'Noise_XX_25519_ChaChaPoly_SHA256';
  static const KEY_LEN = 32;
  static const MAC_LEN = 16;
  
  // Core components
  final bool _isInitiator;
  final SimpleKeyPair _staticKeys;
  final SimpleKeyPair _ephemeralKeys;
  
  // Current handshake state
  HandshakeState _state;
  
  NoiseXXPattern._(
    this._isInitiator,
    this._staticKeys,
    this._ephemeralKeys,
    this._state,
  );

  /// Creates a new NoiseXXPattern instance
  static Future<NoiseXXPattern> create(bool isInitiator, SimpleKeyPair staticKeys) async {
    // Generate ephemeral keys
    final ephemeralKeys = await X25519().newKeyPair();

    // Initialize symmetric state per Noise spec:
    // If len(protocol_name) <= HASHLEN: h = protocol_name (zero-padded to HASHLEN)
    // Else: h = HASH(protocol_name)
    // ck = h
    // k = empty (no cipher key yet)
    final protocolName = utf8.encode(PROTOCOL_NAME);
    _validateProtocolName(protocolName);

    // Step 1: h = protocol_name (zero-padded to HASHLEN if shorter)
    Uint8List initialH;
    if (protocolName.length <= 32) {
      initialH = Uint8List(32);
      initialH.setAll(0, protocolName);
    } else {
      final hash = await Sha256().hash(protocolName);
      initialH = Uint8List.fromList(hash.bytes);
    }

    // Step 2: ck = h
    final ck = Uint8List.fromList(initialH);

    // Step 3: MixHash(prologue) where prologue is empty for libp2p
    // h = HASH(h || prologue) = HASH(h || "") = HASH(h)
    final hAfterPrologue = await Sha256().hash(initialH);
    final state = HandshakeState(
      chainKey: ck,
      handshakeHash: Uint8List.fromList(hAfterPrologue.bytes),
      state: XXHandshakeState.initial,
    );

    return NoiseXXPattern._(isInitiator, staticKeys, ephemeralKeys, state);
  }

  /// Process an incoming handshake message.
  /// Returns the decrypted payload if present (msg2 and msg3 may contain payloads).
  Future<Uint8List?> readMessage(Uint8List message) async {
    if (_state.state == XXHandshakeState.error) {
      throw StateError('Cannot read message in error state');
    }
    
    try {
      _validateReadState();

      Uint8List? payload;
      switch (_state.state) {
        case XXHandshakeState.initial:
          _state = await _processInitialMessage(message);
          break;
        case XXHandshakeState.sentE:
          final result = await _processSecondMessageWithPayload(message);
          _state = result.$1;
          payload = result.$2;
          break;
        case XXHandshakeState.sentEES:
          final result = await _processFinalMessageWithPayload(message);
          _state = result.$1;
          payload = result.$2;
          break;
        default:
          throw StateError('Cannot read message in state: ${_state.state}');
      }
      return payload;
    } catch (e) {
      // Only set error state for non-validation errors
      if (e is! StateError) {
        _state = _state.copyWith(state: XXHandshakeState.error);
      }
      rethrow;
    }
  }

  /// Generate the next handshake message with optional payload.
  /// For XX pattern: msg1 has no payload, msg2 has responder payload, msg3 has initiator payload.
  Future<Uint8List> writeMessage(List<int> payload) async {
    if (_state.state == XXHandshakeState.error) {
      throw StateError('Cannot write message in error state');
    }

    try {
      _validateWriteState();

      final result = await switch (_state.state) {
        XXHandshakeState.initial => _writeInitialMessage(),
        XXHandshakeState.sentE => _writeSecondMessage(payload),
        XXHandshakeState.sentEES => _writeFinalMessage(payload),
        _ => throw StateError('Cannot write message in state: ${_state.state}'),
      };
      
      _state = result.$2;  // Update state
      return result.$1;    // Return message
    } catch (e) {
      // Only set error state for non-validation errors
      if (e is! StateError) {
        _state = _state.copyWith(state: XXHandshakeState.error);
      }
      rethrow;
    }
  }

  /// Validates that we can read in the current state
  void _validateReadState() {
    if (_state.state == XXHandshakeState.complete) {
      throw StateError('Handshake already complete');
    }

    if (_isInitiator && _state.state == XXHandshakeState.initial) {
      throw StateError('Initiator cannot read first message');
    }
  }

  /// Validates that we can write in the current state
  void _validateWriteState() {
    if (_state.state == XXHandshakeState.complete) {
      throw StateError('Handshake already complete');
    }

    if (!_isInitiator && _state.state == XXHandshakeState.initial) {
      throw StateError('Responder cannot write first message');
    }

    if (_isInitiator && _state.state == XXHandshakeState.sentE) {
      throw StateError('Initiator cannot write second message');
    }

    if (!_isInitiator && _state.state == XXHandshakeState.sentE) {
      if (_state.remoteEphemeralKey == null) {
        throw StateError('Cannot write second message without remote ephemeral key');
      }
    }

    if (_isInitiator && _state.state == XXHandshakeState.sentEES) {
      if (_state.remoteStaticKey == null) {
        throw StateError('Cannot write final message without remote static key');
      }
    }
  }

  /// Process the initial message (e)
  Future<HandshakeState> _processInitialMessage(Uint8List message) async {
    _validateMessageLength(message, KEY_LEN, NoiseMessageType.ephemeralKey);
    
    var state = _state;
    
    // Extract remote ephemeral key
    final remoteEphemeral = message.sublist(0, KEY_LEN);
    await _validatePublicKey(remoteEphemeral);

    // e token: MixHash(e)
    var newHash = await _mixHash(state.handshakeHash, remoteEphemeral);
    state = state.copyWith(
      handshakeHash: newHash,
      remoteEphemeralKey: remoteEphemeral,
    );

    // Empty payload: EncryptAndHash("") with k=empty → MixHash("")
    newHash = await _mixHash(state.handshakeHash, []);
    state = state.copyWith(handshakeHash: newHash);

    return state.copyWith(
      state: XXHandshakeState.sentE,
    );
  }

  /// Process the second message (e, ee, s, es) and return decrypted payload.
  Future<(HandshakeState, Uint8List?)> _processSecondMessageWithPayload(Uint8List message) async {
    if (!_isInitiator && _state.state == XXHandshakeState.sentE) {
      throw StateError('Responder cannot receive second message');
    }

    final minLen = KEY_LEN + KEY_LEN + MAC_LEN;
    _validateMessageLength(message, minLen, NoiseMessageType.secondMessage);

    var state = _state;

    // e: read remote ephemeral
    final remoteEphemeral = message.sublist(0, KEY_LEN);
    await _validatePublicKey(remoteEphemeral);
    var newHash = await _mixHash(state.handshakeHash, remoteEphemeral);
    state = state.copyWith(handshakeHash: newHash, remoteEphemeralKey: remoteEphemeral);

    // ee: MixKey(DH(e_local, e_remote))
    final (ck1, k1) = await _dh(_ephemeralKeys, remoteEphemeral, state.chainKey);
    state = state.copyWith(chainKey: ck1, cipherKey: k1, cipherNonce: 0);

    // s: DecryptAndHash(encrypted_static) with current nonce
    final encryptedStatic = message.sublist(KEY_LEN, KEY_LEN + KEY_LEN + MAC_LEN);
    final remoteStatic = await _decryptWithAd(encryptedStatic, state.handshakeHash, state.cipherKey!, nonce: state.cipherNonce);
    await _validatePublicKey(remoteStatic);
    newHash = await _mixHash(state.handshakeHash, encryptedStatic);
    state = state.copyWith(handshakeHash: newHash, remoteStaticKey: remoteStatic, cipherNonce: state.cipherNonce + 1);

    // es: MixKey(DH(e_initiator, s_responder))
    if (_isInitiator) {
      final (ck2, k2) = await _dh(_ephemeralKeys, remoteStatic, state.chainKey);
      state = state.copyWith(chainKey: ck2, cipherKey: k2, cipherNonce: 0);
    }

    // Decrypt payload if present
    Uint8List? payload;
    if (message.length > minLen) {
      final encryptedPayload = message.sublist(minLen);
      payload = await _decryptWithAd(encryptedPayload, state.handshakeHash, state.cipherKey!, nonce: state.cipherNonce);
      newHash = await _mixHash(state.handshakeHash, encryptedPayload);
      state = state.copyWith(handshakeHash: newHash, cipherNonce: state.cipherNonce + 1);
    }

    return (state.copyWith(state: XXHandshakeState.sentEES), payload);
  }

  /// Process the final message (s, se) and return decrypted payload.
  Future<(HandshakeState, Uint8List?)> _processFinalMessageWithPayload(Uint8List message) async {
    final minLen = KEY_LEN + MAC_LEN;
    _validateMessageLength(message, minLen, NoiseMessageType.finalMessage);

    var state = _state;

    // s: DecryptAndHash(encrypted_static)
    final encryptedStatic = message.sublist(0, KEY_LEN + MAC_LEN);
    if (state.cipherKey == null) {
      throw StateError('Cipher key is null during static key decryption');
    }
    final remoteStatic = await _decryptWithAd(
      encryptedStatic, state.handshakeHash, state.cipherKey!, nonce: state.cipherNonce);
    await _validatePublicKey(remoteStatic);

    var newHash = await _mixHash(state.handshakeHash, encryptedStatic);
    state = state.copyWith(handshakeHash: newHash, remoteStaticKey: remoteStatic, cipherNonce: state.cipherNonce + 1);

    // se: MixKey(DH)
    if (state.remoteEphemeralKey == null) {
      throw StateError('Remote ephemeral key is null during se operation');
    }
    final remoteEphemeral = state.remoteEphemeralKey as List<int>;
    final (ck, k) = await _dh(
      _isInitiator ? _staticKeys : _ephemeralKeys,
      _isInitiator ? remoteEphemeral : remoteStatic,
      state.chainKey,
    );
    state = state.copyWith(chainKey: ck, cipherKey: k, cipherNonce: 0);

    // Decrypt payload if present
    Uint8List? payload;
    if (message.length > minLen) {
      final encryptedPayload = message.sublist(minLen);
      payload = await _decryptWithAd(
        encryptedPayload, state.handshakeHash, state.cipherKey!, nonce: state.cipherNonce);
      newHash = await _mixHash(state.handshakeHash, encryptedPayload);
      state = state.copyWith(handshakeHash: newHash, cipherNonce: state.cipherNonce + 1);
    }

    // Derive final keys via Split
    final (sendKey, recvKey) = await _deriveKeys(state.chainKey);

    return (state.copyWith(
      sendKey: sendKey,
      recvKey: recvKey,
      state: XXHandshakeState.complete,
    ), payload);
  }

  /// Write the initial message (e)
  Future<(Uint8List message, HandshakeState state)> _writeInitialMessage() async {
    // Get our ephemeral public key
    final ephemeralPub = await _ephemeralKeys.extractPublicKey();
    final ephemeralBytes = await ephemeralPub.bytes;

    // e token: MixHash(e)
    var newHash = await _mixHash(_state.handshakeHash, ephemeralBytes);

    // Empty payload: EncryptAndHash("") with k=empty → MixHash("")
    newHash = await _mixHash(newHash, []);

    return (
      Uint8List.fromList(ephemeralBytes),
      _state.copyWith(
        handshakeHash: newHash,
        state: XXHandshakeState.sentE,
      ),
    );
  }

  /// Write the second message (e, ee, s, es) with optional payload.
  Future<(Uint8List message, HandshakeState state)> _writeSecondMessage(List<int> payload) async {
    var state = _state;
    final messageBytes = <int>[];

    if (state.remoteEphemeralKey == null) {
      throw StateError('Cannot write second message without remote ephemeral key');
    }

    // e: write ephemeral public key
    final ephemeralPub = await _ephemeralKeys.extractPublicKey();
    final ephemeralBytes = await ephemeralPub.bytes;
    messageBytes.addAll(ephemeralBytes);
    var newHash = await _mixHash(state.handshakeHash, ephemeralBytes);
    state = state.copyWith(handshakeHash: newHash);

    // ee: MixKey(DH(e_local, e_remote))
    final (ck1, k1) = await _dh(_ephemeralKeys, state.remoteEphemeralKey as List<int>, state.chainKey);
    state = state.copyWith(chainKey: ck1, cipherKey: k1, cipherNonce: 0);

    // s: EncryptAndHash(static_public_key)
    final staticPub = await _staticKeys.extractPublicKey();
    final staticBytes = await staticPub.bytes;
    final encryptedStatic = await _encryptWithAd(staticBytes, state.handshakeHash, state.cipherKey!, nonce: state.cipherNonce);
    messageBytes.addAll(encryptedStatic);
    newHash = await _mixHash(state.handshakeHash, encryptedStatic);
    state = state.copyWith(handshakeHash: newHash, cipherNonce: state.cipherNonce + 1);

    // es: MixKey(DH(s_responder, e_initiator))
    if (!_isInitiator) {
      final (ck2, k2) = await _dh(_staticKeys, state.remoteEphemeralKey as List<int>, state.chainKey);
      state = state.copyWith(chainKey: ck2, cipherKey: k2, cipherNonce: 0);
    }

    // Encrypt and append payload if present
    if (payload.isNotEmpty) {
      final encryptedPayload = await _encryptWithAd(payload, state.handshakeHash, state.cipherKey!, nonce: state.cipherNonce);
      messageBytes.addAll(encryptedPayload);
      newHash = await _mixHash(state.handshakeHash, encryptedPayload);
      state = state.copyWith(handshakeHash: newHash, cipherNonce: state.cipherNonce + 1);
    }

    return (
      Uint8List.fromList(messageBytes),
      state.copyWith(state: XXHandshakeState.sentEES),
    );
  }

  /// Write the final message (s, se) with optional payload.
  Future<(Uint8List message, HandshakeState state)> _writeFinalMessage(List<int> payload) async {
    var state = _state;
    final messageBytes = <int>[];

    // s: EncryptAndHash(static_public_key)
    final staticPub = await _staticKeys.extractPublicKey();
    final staticBytes = await staticPub.bytes;
    if (state.cipherKey == null) {
      throw StateError('Cipher key is null during static key encryption');
    }
    final encryptedStatic = await _encryptWithAd(staticBytes, state.handshakeHash, state.cipherKey!, nonce: state.cipherNonce);
    messageBytes.addAll(encryptedStatic);
    var newHash = await _mixHash(state.handshakeHash, encryptedStatic);
    state = state.copyWith(handshakeHash: newHash, cipherNonce: state.cipherNonce + 1);

    // se: MixKey(DH(s_initiator, e_responder))
    if (state.remoteEphemeralKey == null) {
      throw StateError('Remote ephemeral key is null during se operation');
    }
    final remoteEphemeral = state.remoteEphemeralKey as List<int>;
    final (ck, k) = await _dh(
      _isInitiator ? _staticKeys : _ephemeralKeys,
      _isInitiator ? remoteEphemeral : state.remoteStaticKey!,
      state.chainKey,
    );
    state = state.copyWith(chainKey: ck, cipherKey: k, cipherNonce: 0);

    // Encrypt payload if present
    if (payload.isNotEmpty) {
      final encryptedPayload = await _encryptWithAd(payload, state.handshakeHash, state.cipherKey!, nonce: state.cipherNonce);
      messageBytes.addAll(encryptedPayload);
      newHash = await _mixHash(state.handshakeHash, encryptedPayload);
      state = state.copyWith(handshakeHash: newHash, cipherNonce: state.cipherNonce + 1);
    }

    // Derive final keys via Split
    final (sendKey, recvKey) = await _deriveKeys(state.chainKey);

    return (
      Uint8List.fromList(messageBytes),
      state.copyWith(
        sendKey: sendKey,
        recvKey: recvKey,
        state: XXHandshakeState.complete,
      ),
    );
  }

  // Cryptographic operations

  /// Validates a public key
  Future<void> _validatePublicKey(List<int> publicKey) async {
    if (publicKey.length != KEY_LEN) {
      throw StateError('Invalid public key length: ${publicKey.length}');
    }
    // Additional validation could be added here
  }

  /// Validates protocol name
  static void _validateProtocolName(List<int> protocolName) {
    if (protocolName.length != utf8.encode(PROTOCOL_NAME).length) {
      throw StateError('Invalid protocol name length');
    }
    if (!protocolName.every((b) => b >= 32 && b <= 126)) {
      throw StateError('Protocol name contains non-printable characters');
    }
    if (PROTOCOL_NAME != 'Noise_XX_25519_ChaChaPoly_SHA256') {
      throw StateError('Invalid protocol name');
    }
  }

  /// Validates message length
  void _validateMessageLength(Uint8List message, int minLength, NoiseMessageType type) {
    switch (type) {
      case NoiseMessageType.ephemeralKey:
        if (message.length < KEY_LEN) {
          throw StateError('Message too short to contain ephemeral key: ${message.length} < $KEY_LEN');
        }
        break;
      case NoiseMessageType.secondMessage:
        // First check for ephemeral key
        if (message.length < KEY_LEN) {
          throw StateError('Message too short to contain ephemeral key: ${message.length} < $KEY_LEN');
        }
        // Then check if we have enough space for the encrypted static key
        if (message.length < KEY_LEN + KEY_LEN) {
          throw StateError('Message too short to contain encrypted static key: ${message.length} < ${KEY_LEN + KEY_LEN}');
        }
        // Finally check for full message length including MAC
        if (message.length < minLength) {
          throw StateError('Second message too short: ${message.length} < $minLength (needs 32 bytes ephemeral key + 32 bytes encrypted static key + 16 bytes MAC)');
        }
        break;
      case NoiseMessageType.finalMessage:
        if (message.length < minLength) {
          throw StateError('Final message too short: ${message.length} < $minLength (needs 32 bytes encrypted static key + 16 bytes MAC)');
        }
        break;
    }
  }

  /// Performs Diffie-Hellman and MixKey per Noise spec.
  /// Returns (new_chain_key, new_cipher_key) from HKDF.
  ///
  /// MixKey(input_key_material):
  ///   ck, temp_k = HKDF(ck, ikm, 2)
  ///   k = temp_k, n = 0
  Future<(Uint8List chainKey, SecretKey cipherKey)> _dh(
    SimpleKeyPair privateKey,
    List<int> publicKey,
    List<int> currentChainKey,
  ) async {
    final algorithm = X25519();
    final shared = await algorithm.sharedSecretKey(
      keyPair: privateKey,
      remotePublicKey: SimplePublicKey(publicKey, type: KeyPairType.x25519),
    );
    final sharedBytes = await shared.extractBytes();

    return _hkdf2(currentChainKey, sharedBytes);
  }

  /// HKDF with 2 outputs per Noise spec:
  ///   temp_key = HMAC-HASH(chaining_key, input_key_material)
  ///   output1 = HMAC-HASH(temp_key, 0x01)
  ///   output2 = HMAC-HASH(temp_key, output1 || 0x02)
  Future<(Uint8List, SecretKey)> _hkdf2(List<int> chainingKey, List<int> inputKeyMaterial) async {
    final hmac = Hmac.sha256();
    final tempKeyMac = await hmac.calculateMac(
      inputKeyMaterial,
      secretKey: SecretKey(chainingKey),
    );
    final tempKey = SecretKey(Uint8List.fromList(tempKeyMac.bytes));

    final output1Mac = await hmac.calculateMac(
      [0x01],
      secretKey: tempKey,
    );
    final output1 = Uint8List.fromList(output1Mac.bytes);

    final output2Mac = await hmac.calculateMac(
      [...output1, 0x02],
      secretKey: tempKey,
    );
    final output2 = SecretKey(Uint8List.fromList(output2Mac.bytes));

    return (output1, output2);
  }

  /// Mixes data into the handshake hash
  Future<Uint8List> _mixHash(List<int> currentHash, List<int> data) async {
    final hash = await Sha256().hash([...currentHash, ...data]);
    return Uint8List.fromList(hash.bytes);
  }

  /// Builds a 12-byte nonce from a counter value (little-endian, per Noise spec for ChaCha20).
  Uint8List _buildNonce(int counter) {
    // Noise spec: nonce is 8 bytes, padded to 12 for ChaCha20.
    // The encoding is little-endian for the 8-byte counter, padded with 4 zero bytes.
    final nonce = Uint8List(12);
    nonce[4] = counter & 0xFF;
    nonce[5] = (counter >> 8) & 0xFF;
    nonce[6] = (counter >> 16) & 0xFF;
    nonce[7] = (counter >> 24) & 0xFF;
    return nonce;
  }

  /// Encrypts data with additional data using the given key and nonce.
  Future<Uint8List> _encryptWithAd(
    List<int> plaintext,
    List<int> ad,
    SecretKey key, {
    int nonce = 0,
  }) async {
    final algorithm = Chacha20.poly1305Aead();
    final nonceBytes = _buildNonce(nonce);
    final secretBox = await algorithm.encrypt(
      plaintext,
      secretKey: key,
      nonce: nonceBytes,
      aad: ad,
    );
    return Uint8List.fromList([
      ...secretBox.cipherText,
      ...secretBox.mac.bytes,
    ]);
  }

  /// Decrypts data with additional data using the given key and nonce.
  Future<Uint8List> _decryptWithAd(
    List<int> data,
    List<int> ad,
    SecretKey key, {
    int nonce = 0,
  }) async {
    if (data.length < MAC_LEN) {
      throw StateError('Data too short to contain MAC');
    }

    final algorithm = Chacha20.poly1305Aead();
    final nonceBytes = _buildNonce(nonce);
    final cipherText = data.sublist(0, data.length - MAC_LEN);
    final mac = data.sublist(data.length - MAC_LEN);

    return Uint8List.fromList(await algorithm.decrypt(
      SecretBox(cipherText, nonce: nonceBytes, mac: Mac(mac)),
      secretKey: key,
      aad: ad,
    ));
  }

  /// Derives the final cipher keys via Noise Split():
  ///   temp_k1, temp_k2 = HKDF(ck, zerolen, 2)
  ///
  /// For XX pattern: initiator sends with k1, receives with k2.
  /// Responder sends with k2, receives with k1.
  Future<(SecretKey sendKey, SecretKey recvKey)> _deriveKeys(List<int> chainKey) async {
    final (k1Bytes, k2) = await _hkdf2(chainKey, []);
    final k1 = SecretKey(k1Bytes);

    return _isInitiator ? (k1, k2) : (k2, k1);
  }

  // Public API

  bool get isComplete => _state.state == XXHandshakeState.complete;
  XXHandshakeState get state => _state.state;

  Future<Uint8List> getStaticPublicKey() async {
    final pubKey = await _staticKeys.extractPublicKey();
    return Uint8List.fromList(await pubKey.bytes);
  }
  
  Uint8List get remoteStaticKey {
    final key = _state.remoteStaticKey;
    if (key == null) {
      throw StateError('Remote static key not available');
    }
    return key;
  }

  SecretKey get sendKey {
    final key = _state.sendKey;
    if (key == null) {
      throw StateError('Send key not initialized');
    }
    return key;
  }

  SecretKey get recvKey {
    final key = _state.recvKey;
    if (key == null) {
      throw StateError('Receive key not initialized');
    }
    return key;
  }

  // Testing support
  @visibleForTesting
  static Future<NoiseXXPattern> createForTesting(
    bool isInitiator,
    SimpleKeyPair staticKeys,
    SimpleKeyPair ephemeralKeys,
  ) async {
    final protocolName = utf8.encode(PROTOCOL_NAME);
    _validateProtocolName(protocolName);

    Uint8List initialH;
    if (protocolName.length <= 32) {
      initialH = Uint8List(32);
      initialH.setAll(0, protocolName);
    } else {
      final hash = await Sha256().hash(protocolName);
      initialH = Uint8List.fromList(hash.bytes);
    }
    final ck = Uint8List.fromList(initialH);
    final hAfterPrologue = await Sha256().hash(initialH);

    final state = HandshakeState(
      chainKey: ck,
      handshakeHash: Uint8List.fromList(hAfterPrologue.bytes),
      state: XXHandshakeState.initial,
    );

    return NoiseXXPattern._(isInitiator, staticKeys, ephemeralKeys, state);
  }

  @visibleForTesting
  Uint8List get debugChainKey => _state.chainKey;
  
  @visibleForTesting
  Uint8List get debugHandshakeHash => _state.handshakeHash;
  
  @visibleForTesting
  SimpleKeyPair get debugEphemeralKeys => _ephemeralKeys;
  
  @visibleForTesting
  Uint8List? get debugRemoteStaticKey => _state.remoteStaticKey;
}
