import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'dart:collection';

import 'package:cryptography/cryptography.dart' hide PublicKey;
import 'package:dart_libp2p/core/peer/peer_id.dart';
import '../../core/multiaddr.dart';
import '../../core/network/conn.dart';
import '../../core/network/transport_conn.dart';
import '../../core/crypto/keys.dart';
import '../../core/network/context.dart';
import '../../core/network/stream.dart';
import '../../core/network/rcmgr.dart' show ConnScope; // Import ConnScope
import 'package:cryptography/cryptography.dart' as crypto;
import 'package:logging/logging.dart'; // Added for logging
import 'package:convert/convert.dart';

final _log = Logger('SecuredConnection');

/// Optimized buffer for handling large payload transfers
class _DecryptedDataBuffer {
  final Queue<Uint8List> _chunks = Queue<Uint8List>();
  int _totalLength = 0;
  
  void add(Uint8List chunk) {
    if (chunk.isNotEmpty) {
      _chunks.add(chunk);
      _totalLength += chunk.length;
    }
  }
  
  bool get isEmpty => _chunks.isEmpty;
  int get length => _totalLength;
  
  Uint8List takeBytes(int count) {
    if (count <= 0 || _totalLength == 0) {
      return Uint8List(0);
    }
    
    final actualCount = count > _totalLength ? _totalLength : count;
    final result = Uint8List(actualCount);
    var resultOffset = 0;
    
    while (resultOffset < actualCount && _chunks.isNotEmpty) {
      final chunk = _chunks.first;
      final needed = actualCount - resultOffset;
      
      if (chunk.length <= needed) {
        // Take entire chunk
        result.setRange(resultOffset, resultOffset + chunk.length, chunk);
        resultOffset += chunk.length;
        _totalLength -= chunk.length;
        _chunks.removeFirst();
      } else {
        // Take partial chunk
        result.setRange(resultOffset, resultOffset + needed, chunk);
        final remaining = chunk.sublist(needed);
        _chunks.removeFirst();
        _chunks.addFirst(remaining);
        _totalLength -= needed;
        resultOffset += needed;
      }
    }
    
    return result;
  }
  
  Uint8List takeAll() {
    if (_totalLength == 0) {
      return Uint8List(0);
    }
    
    final result = Uint8List(_totalLength);
    var offset = 0;
    
    while (_chunks.isNotEmpty) {
      final chunk = _chunks.removeFirst();
      result.setRange(offset, offset + chunk.length, chunk);
      offset += chunk.length;
    }
    
    _totalLength = 0;
    return result;
  }
  
  void clear() {
    _chunks.clear();
    _totalLength = 0;
  }
}

/// A connection secured by a security protocol
class SecuredConnection implements TransportConn {
  final TransportConn _connection;
  final crypto.SecretKey _encryptionKey;
  final crypto.SecretKey _decryptionKey;
  final PeerId? establishedRemotePeer;
  final PublicKey? establishedRemotePublicKey;
  final String securityProtocolId; // Added to resolve circular dependency
  int _sendNonce;
  int _recvNonce;
  final _DecryptedDataBuffer _decryptedBuffer = _DecryptedDataBuffer(); // Optimized buffer
  
  // Read lock to serialize read operations and prevent framing desync
  // This is critical for chunked transports (UDP/UDX) where data arrives
  // in arbitrary boundaries. Without serialization, concurrent reads can
  // cause one read to consume part of another's length prefix or encrypted data.
  final Queue<Completer<void>> _readLockQueue = Queue<Completer<void>>();
  bool _readLockHeld = false;
  
  // Write lock to serialize write operations and prevent data interleaving
  // Without this, multiple concurrent writes can interleave their chunks,
  // causing the reader to see mixed encrypted data from different messages.
  final Queue<Completer<void>> _writeLockQueue = Queue<Completer<void>>();
  bool _writeLockHeld = false;

  SecuredConnection(
      this._connection,
      this._encryptionKey,
      this._decryptionKey, {
        this.establishedRemotePeer,
        this.establishedRemotePublicKey,
        required this.securityProtocolId, // Make it required
        int initialSendNonce = 0,
        int initialRecvNonce = 0,
      }) : _sendNonce = initialSendNonce, _recvNonce = initialRecvNonce {
    // ADDED LOGGING
    _log.finer('SecuredConnection Constructor: Peer ${establishedRemotePeer?.toString() ?? 'unknown'}, initialSendNonce=$initialSendNonce, initialRecvNonce=$initialRecvNonce');
    _log.finer('  - _encryptionKey.hashCode: ${_encryptionKey.hashCode}');
    _encryptionKey.extractBytes().then((bytes) => _log.finer('  - _encryptionKey.bytes: $bytes'));
    _log.finer('  - _decryptionKey.hashCode: ${_decryptionKey.hashCode}');
    _decryptionKey.extractBytes().then((bytes) => _log.finer('  - _decryptionKey.bytes: $bytes'));

  }
  
  /// Get the current send nonce value (useful for continuing nonces after handshake)
  int get currentSendNonce => _sendNonce;
  
  /// Get the current recv nonce value (useful for continuing nonces after handshake)
  int get currentRecvNonce => _recvNonce;

  /// Builds a 12-byte nonce per Noise spec for ChaChaPoly:
  /// 4 bytes of zeros followed by 8-byte little-endian counter.
  Uint8List _getNonce(int counter) {
    final nonce = Uint8List(12);
    // Bytes 0-3: zeros
    // Bytes 4-11: little-endian counter
    nonce[4] = counter & 0xFF;
    nonce[5] = (counter >> 8) & 0xFF;
    nonce[6] = (counter >> 16) & 0xFF;
    nonce[7] = (counter >> 24) & 0xFF;
    nonce[8] = (counter >> 32) & 0xFF;
    nonce[9] = (counter >> 40) & 0xFF;
    nonce[10] = (counter >> 48) & 0xFF;
    nonce[11] = (counter >> 56) & 0xFF;
    return nonce;
  }

  /// Acquire read lock to serialize read operations.
  /// 
  /// This prevents concurrent reads from interfering with each other's message boundaries.
  /// Without this, chunked transports (UDX/UDP) can cause one read to consume bytes
  /// intended for another read's length prefix or encrypted data payload.
  ///
  /// Example failure without lock:
  /// 1. Read A starts: reads 2-byte length prefix (expecting 96KB message)
  /// 2. Data arrives in chunks due to UDP fragmentation (~70 packets)
  /// 3. Read B starts concurrently: reads next 2 bytes
  /// 4. Those 2 bytes are actually from the MIDDLE of Read A's encrypted data!
  /// 5. Read B interprets 0x78CE (30,926) as length instead of encrypted payload
  /// 6. MAC authentication fails: "wrong message authentication code"
  Future<void> _acquireReadLock() async {
    final completer = Completer<void>();
    _readLockQueue.add(completer);
    _log.fine('SecuredConnection: 🔒 QUEUED for read lock. Queue length: ${_readLockQueue.length}, Lock held: $_readLockHeld');
    
    // Try to grant lock immediately if available
    _tryGrantReadLock();
    
    // Wait for our turn
    await completer.future;
    _log.fine('SecuredConnection: 🔒 GRANTED read lock. Queue length: ${_readLockQueue.length}');
  }

  /// Attempts to grant the read lock to the next waiter if the lock is free.
  /// This method is synchronous to ensure atomic check-and-grant.
  void _tryGrantReadLock() {
    if (!_readLockHeld && _readLockQueue.isNotEmpty) {
      _readLockHeld = true;
      final next = _readLockQueue.removeFirst();
      _log.fine('SecuredConnection: 🔒 GRANTING read lock to next waiter. Remaining queue: ${_readLockQueue.length}');
      next.complete();
    }
  }

  /// Release read lock, allowing the next queued read to proceed
  void _releaseReadLock() {
    _readLockHeld = false;
    _log.fine('SecuredConnection: 🔓 Released read lock. Queue length: ${_readLockQueue.length}');
    _tryGrantReadLock();
  }

  /// Acquire write lock to serialize write operations.
  /// 
  /// Prevents concurrent writes from interleaving their encrypted data chunks.
  /// Without this, chunked transports can deliver mixed data from different messages.
  Future<void> _acquireWriteLock() async {
    final completer = Completer<void>();
    _writeLockQueue.add(completer);
    
    // Try to grant lock immediately if available
    _tryGrantWriteLock();
    
    // Wait for our turn
    await completer.future;
  }

  /// Attempts to grant the write lock to the next waiter if the lock is free.
  void _tryGrantWriteLock() {
    if (!_writeLockHeld && _writeLockQueue.isNotEmpty) {
      _writeLockHeld = true;
      final next = _writeLockQueue.removeFirst();
      next.complete();
    }
  }

  /// Release write lock, allowing the next queued write to proceed
  void _releaseWriteLock() {
    _writeLockHeld = false;
    _tryGrantWriteLock();
  }

  @override
  Future<void> close() => _connection.close();

  @override
  Future<Uint8List> read([int? length]) async {
    // Acquire read lock to ensure message framing integrity
    _log.fine('SecuredConnection.read: 🔒 ACQUIRING read lock for length=$length');
    await _acquireReadLock();
    _log.fine('SecuredConnection.read: 🔒 READ LOCK ACQUIRED for length=$length');
    
    try {
      _log.finer('SecuredConnection.read: Called with length: $length, _decryptedBuffer.length: ${_decryptedBuffer.length}'); // ADDED
      if (length == 0) {
        _log.finer('SecuredConnection.read: Requested length is 0, returning empty Uint8List.'); // ADDED
        return Uint8List(0); // Handle zero length request immediately
      }

      if (length == null) {
        if (!_decryptedBuffer.isEmpty) {
          final data = _decryptedBuffer.takeAll();
          _log.finer('SecuredConnection.read (length=null): Returning buffered data of length ${data.length}. Data preview: ${data.take(20).toList()}'); // ADDED
          return data;
        }
        final decryptedMessage = await _readAndDecryptMessage();
        _log.finer('SecuredConnection.read (length=null): Returning directly from _readAndDecryptMessage, length ${decryptedMessage.length}. Data preview: ${decryptedMessage.take(20).toList()}'); // ADDED
        return decryptedMessage;
      }

    // length is not null here
    while (_decryptedBuffer.length < length) {
      Uint8List decryptedChunk;
      try {
        _log.finer('SecuredConnection.read (length=$length): _decryptedBuffer.length (${_decryptedBuffer.length}) < requested ($length). Calling _readAndDecryptMessage().'); // ADDED
        decryptedChunk = await _readAndDecryptMessage();
      } catch (e) {
        _log.finer('SecuredConnection.read (length=$length): Error in _readAndDecryptMessage: $e. Current _decryptedBuffer.length: ${_decryptedBuffer.length}'); // ADDED
        if (_decryptedBuffer.length < length) {
          rethrow;
        }
        // If we have enough buffered data despite the error, we can proceed to return it.
        break;
      }

      if (decryptedChunk.isEmpty) { // EOF from _readAndDecryptMessage
        _log.finer('SecuredConnection.read (length=$length): _readAndDecryptMessage returned empty (EOF). Breaking loop.'); // ADDED
        break;
      }

      // Use optimized buffer - no more array reallocations!
      _decryptedBuffer.add(decryptedChunk);
      _log.finer('SecuredConnection.read (length=$length): Added ${decryptedChunk.length} bytes to _decryptedBuffer. New _decryptedBuffer.length: ${_decryptedBuffer.length}'); // ADDED
    }

      if (_decryptedBuffer.isEmpty) {
        _log.finer('SecuredConnection.read (length=$length): _decryptedBuffer is empty after loop. Returning empty Uint8List.'); // ADDED
        return Uint8List(0);
      }

      if (_decryptedBuffer.length >= length) {
        final dataToReturn = _decryptedBuffer.takeBytes(length);
        _log.finer('SecuredConnection.read (length=$length): Returning ${dataToReturn.length} bytes. Remaining _decryptedBuffer.length: ${_decryptedBuffer.length}. Data preview: ${dataToReturn.take(20).toList()}'); // ADDED
        return dataToReturn;
      } else { // Less data than requested due to EOF
        final dataToReturn = _decryptedBuffer.takeAll();
        _log.finer('SecuredConnection.read (length=$length): Returning ${dataToReturn.length} bytes (less than requested due to EOF). _decryptedBuffer is now empty. Data preview: ${dataToReturn.take(20).toList()}'); // ADDED
        return dataToReturn;
      }
    } finally {
      // Always release the read lock, even if an exception occurs
      _log.fine('SecuredConnection.read: 🔓 RELEASING read lock for length=$length');
      _releaseReadLock();
    }
  }

  /// Reads exactly the expected number of bytes, handling partial reads from the underlying transport
  Future<Uint8List> _readFullMessage(int expectedLength, {Duration? timeout}) async {
    timeout ??= Duration(seconds: 30); // Default timeout for message reads
    final startTime = DateTime.now();
    
    if (expectedLength == 0) {
      return Uint8List(0);
    }
    
    var buffer = Uint8List(0);
    int readAttempts = 0;
    
    while (buffer.length < expectedLength) {
      readAttempts++;
      
      // Check timeout
      if (DateTime.now().difference(startTime) > timeout) {
        _log.warning('SecuredConnection: Timeout reading message after ${readAttempts} attempts. Expected: $expectedLength, Got: ${buffer.length}');
        throw TimeoutException('Timeout reading message', timeout);
      }
      
      final remaining = expectedLength - buffer.length;
      _log.fine('SecuredConnection: _readFullMessage attempt $readAttempts: need $remaining more bytes (have ${buffer.length}/$expectedLength)');
      
      final chunk = await _connection.read(remaining);
      
      if (chunk.isEmpty) {
        _log.fine('SecuredConnection: _readFullMessage got EOF after $readAttempts attempts. Expected: $expectedLength, Got: ${buffer.length}');
        break; // EOF - return what we have
      }
      
      _log.fine('SecuredConnection: _readFullMessage attempt $readAttempts: received ${chunk.length} bytes. First 4 bytes: ${chunk.take(4).toList()}');
      
      // Efficiently append chunk to buffer
      final newBuffer = Uint8List(buffer.length + chunk.length);
      newBuffer.setAll(0, buffer);
      newBuffer.setAll(buffer.length, chunk);
      buffer = newBuffer;
    }
    
    _log.finer('SecuredConnection: _readFullMessage completed after $readAttempts attempts. Expected: $expectedLength, Got: ${buffer.length}');
    
    // Sanity check: if we got more bytes than expected, truncate and warn
    if (buffer.length > expectedLength) {
      _log.warning('SecuredConnection: _readFullMessage got ${buffer.length} bytes but only expected $expectedLength. This should not happen - check UDXP2PStreamAdapter.read()');
      return Uint8List.fromList(buffer.sublist(0, expectedLength));
    }
    return buffer;
  }

  Future<Uint8List> _readAndDecryptMessage() async {
    // This method now encapsulates reading one full encrypted message and decrypting it.
    // It handles partial reads from the underlying transport robustly.
    // Uses 2-byte big-endian length prefix per libp2p Noise spec (max 65535 bytes per frame).
    _log.finer('SecuredConnection: Reading length prefix (2 bytes)');
    final lengthBytes = await _readFullMessage(2);
    _log.finer('SecuredConnection: Length prefix bytes: [${lengthBytes[0]}, ${lengthBytes[1]}]');
    _log.finer('SecuredConnection: FROM_UNDERLYING_READ (Length Prefix) - Bytes: ${hex.encode(lengthBytes)}');

    if (lengthBytes.isEmpty) {
      _log.finer('SecuredConnection: EOF when reading length prefix.');
      return Uint8List(0);
    }
    if (lengthBytes.length < 2) {
      _log.finer('SecuredConnection: Connection closed while reading length prefix, got ${lengthBytes.length} bytes.');
      throw StateError('Connection closed while reading length prefix');
    }

    final dataLength = (lengthBytes[0] << 8) | lengthBytes[1];
    _log.finer('SecuredConnection: Got length prefix: $dataLength');

    if (dataLength == 0) return Uint8List(0); // Valid empty message

    _log.finer('SecuredConnection: Reading combined data of length $dataLength');
    final combinedData = await _readFullMessage(dataLength);
    _log.finer('SecuredConnection: FROM_UNDERLYING_READ (Message Body) - Length: ${combinedData.length}, Bytes: ${hex.encode(combinedData)}');

    if (combinedData.length < dataLength) {
      _log.finer('SecuredConnection: Connection closed while reading message body. Expected: $dataLength, Got: ${combinedData.length}');
      throw StateError('Connection closed while reading message body. Expected: $dataLength, Got: ${combinedData.length}');
    }
    _log.finer('SecuredConnection: Got combined data of length ${combinedData.length}');

    final encrypted = combinedData.sublist(0, dataLength - 16);
    final mac = combinedData.sublist(dataLength - 16);
    _log.finer('SecuredConnection: Split into encrypted(${encrypted.length}) and MAC(${mac.length})');
    _log.finer('SecuredConnection:   Raw Received Ciphertext: ${hex.encode(encrypted)}');
    _log.finer('SecuredConnection:   Raw Received MAC: ${hex.encode(mac)}');
    _log.finer('SecuredConnection: First 4 bytes of encrypted: ${encrypted.take(4).toList()}');
    _log.finer('SecuredConnection: First 4 bytes of MAC: ${mac.take(4).toList()}');
    _log.finer('SecuredConnection: Full MAC: ${mac.toList()}');

    final algorithm = crypto.Chacha20.poly1305Aead();
    final nonceValue = _recvNonce++;
    final nonce = _getNonce(nonceValue);
    _log.fine('SecuredConnection: 🔑 DECRYPTING with RECV NONCE=$nonceValue (${nonce.toList()})');
    // ADDED LOGGING for hashCode
    _log.finer('SecuredConnection: Using decryption key (hashCode: ${_decryptionKey.hashCode}): ${await _decryptionKey.extractBytes()}');

    try {
      final plaintext = await algorithm.decrypt(
        crypto.SecretBox(
          encrypted,
          nonce: nonce,
          mac: crypto.Mac(mac),
        ),
        secretKey: _decryptionKey,
        aad: Uint8List(0),
      );
      _log.fine('SecuredConnection: ✅ DECRYPTION SUCCESS for RECV NONCE=$nonceValue, got ${plaintext.length} bytes');
      return Uint8List.fromList(plaintext);
    } catch (e) {
      _log.severe('SecuredConnection: ❌ DECRYPTION FAILED for RECV NONCE=$nonceValue with error: $e');
      _log.severe('SecuredConnection: Full message details:');
      _log.severe('  - Length prefix: ${lengthBytes.toList()}');
      _log.severe('  - Total data length: $dataLength');
      _log.severe('  - Encrypted data length: ${encrypted.length}');
      _log.severe('  - MAC length: ${mac.length}');
      _log.severe('  - Nonce used: ${nonce.toList()}');
      _log.severe('  - Current _recvNonce counter: $_recvNonce (after increment)');
      rethrow;
    }
  }

  /// Writes a single Noise transport frame: 2-byte big-endian length + encrypted data + MAC.
  Future<void> _writeFrame(Uint8List plaintext) async {
    final algorithm = crypto.Chacha20.poly1305Aead();
    final nonceValue = _sendNonce++;
    final nonce = _getNonce(nonceValue);
    _log.fine('SecuredConnection: 🔑 ENCRYPTING with SEND NONCE=$nonceValue');

    final secretBox = await algorithm.encrypt(
      plaintext,
      secretKey: _encryptionKey,
      nonce: nonce,
      aad: Uint8List(0),
    );

    final dataLength = secretBox.cipherText.length + secretBox.mac.bytes.length;
    _log.finer('SecuredConnection: Writing frame: $dataLength bytes (plaintext was ${plaintext.length})');

    // 2-byte big-endian length prefix per libp2p Noise spec
    final combinedData = Uint8List(2 + dataLength)
      ..[0] = (dataLength >> 8) & 0xFF
      ..[1] = dataLength & 0xFF
      ..setAll(2, secretBox.cipherText)
      ..setAll(2 + secretBox.cipherText.length, secretBox.mac.bytes);

    _log.finer('SecuredConnection: TO_UNDERLYING_WRITE - Length: ${combinedData.length}');
    await _connection.write(combinedData);
  }

  @override
  Future<void> write(Uint8List data) async {
    // Acquire write lock to ensure writes are atomic and don't interleave
    await _acquireWriteLock();
    
    try {
      _log.finer('SecuredConnection.write: Plaintext data received (length: ${data.length}, first 20 bytes: ${data.take(20).toList()})');

      // libp2p Noise spec: 2-byte length prefix, max 65535 bytes per frame.
      // Max plaintext per frame = 65535 - 16 (MAC) = 65519 bytes.
      const maxPlaintextPerFrame = 65535 - 16;

      // Chunk data if it exceeds max plaintext per frame
      var offset = 0;
      do {
        final chunkEnd = (offset + maxPlaintextPerFrame < data.length)
            ? offset + maxPlaintextPerFrame
            : data.length;
        final chunk = data.sublist(offset, chunkEnd);
        await _writeFrame(chunk);
        offset = chunkEnd;
      } while (offset < data.length);
    } finally {
      // Always release the write lock, even if an exception occurs
      _releaseWriteLock();
    }
  }

  @override
  bool get isClosed => _connection.isClosed;

  @override
  MultiAddr get localMultiaddr => _connection.localMultiaddr;

  @override
  MultiAddr get remoteMultiaddr => _connection.remoteMultiaddr;

  // Deprecated methods that should be replaced with localMultiaddr/remoteMultiaddr
  @override
  MultiAddr get localAddr => localMultiaddr;

  @override
  MultiAddr get remoteAddr => remoteMultiaddr;

  @override
  Socket get socket => throw UnimplementedError('Socket access not supported in SecuredConnection');

  @override
  void setReadTimeout(Duration timeout) => _connection.setReadTimeout(timeout);

  @override
  void setWriteTimeout(Duration timeout) => _connection.setWriteTimeout(timeout);

  @override
  String get id => _connection.id;

  @override
  Future<P2PStream> newStream(Context context) =>
      _connection.newStream(context);

  @override
  Future<List<P2PStream>> get streams => _connection.streams;

  @override
  PeerId get localPeer => _connection.localPeer;

  @override
  PeerId get remotePeer => establishedRemotePeer ?? _connection.remotePeer;

  @override
  Future<PublicKey?> get remotePublicKey async => establishedRemotePublicKey ?? await _connection.remotePublicKey;

  @override
  ConnState get state {
    // If secured, update the state to reflect the security protocol used
    // If secured, update the state to reflect the security protocol used
    // This state is now built using the provided securityProtocolId
    final originalState = _connection.state;
    return ConnState(
      streamMultiplexer: originalState.streamMultiplexer,
      security: securityProtocolId, // Use the passed-in ID
      transport: originalState.transport,
      usedEarlyMuxerNegotiation: originalState.usedEarlyMuxerNegotiation,
    );
  }

  @override
  ConnStats get stat => _connection.stat;

  @override
  ConnScope get scope => _connection.scope;

  @override
  void notifyActivity() {
    _connection.notifyActivity();
  }
}
