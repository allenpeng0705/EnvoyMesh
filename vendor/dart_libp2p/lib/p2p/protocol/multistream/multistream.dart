/// Package multistream implements a simple stream router for the
/// multistream-select protocol. The protocol is defined at
/// https://github.com/multiformats/multistream-select

import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dart_libp2p/p2p/multiaddr/codec.dart';
import 'package:dart_libp2p/core/interfaces.dart';
import 'package:dart_libp2p/core/network/stream.dart';
import 'package:dart_libp2p/core/protocol/protocol.dart';
import 'package:dart_libp2p/config/multistream_config.dart';
import 'package:synchronized/synchronized.dart';
import 'package:logging/logging.dart'; // Added import for Logger

import '../../../core/network/conn.dart'; // Added import for Conn
import '../../transport/multiplexing/yamux/yamux_exceptions.dart'; // Import Yamux exception handling
import '../../transport/multiplexing/yamux/stream.dart'; // For YamuxStream.pushData
import '../../network/swarm/swarm_stream.dart'; // For SwarmStream.incoming

final _log = Logger('multistream'); // Added logger instance

/// ErrTooLarge is an error to signal that an incoming message was too large
class MessageTooLargeException implements Exception {
  final String message;
  const MessageTooLargeException([this.message = 'Incoming message was too large']);
  
  @override
  String toString() => 'MessageTooLargeException: $message';
}

/// IncorrectVersionException is an error reported when the muxer protocol negotiation
/// fails because of a ProtocolID mismatch.
class IncorrectVersionException implements Exception {
  final String message;
  const IncorrectVersionException([this.message = 'Client connected with incorrect version']);
  
  @override
  String toString() => 'IncorrectVersionException: $message';
}

/// ProtocolID identifies the multistream protocol itself and makes sure
/// the multistream muxers on both sides of a channel can work with each other.
const String protocolID = '/multistream/1.0.0';

/// A handler for a specific protocol
class Handler {
  /// Function to determine if this handler matches a given protocol
  final bool Function(ProtocolID) matchFunc;
  
  /// Function to handle the protocol
  final HandlerFunc handle;
  
  /// The protocol name this handler was registered with
  final ProtocolID addName;
  
  Handler({
    required this.matchFunc,
    required this.handle,
    required this.addName,
  });
}

/// MultistreamMuxer is a muxer for multistream. Depending on the stream
/// protocol tag it will select the right handler and hand the stream off to it.
class MultistreamMuxer implements ProtocolSwitch {
  final _handlerLock = Lock();
  final List<Handler> _handlers = [];
  
  /// Configuration for multistream operations
  final MultistreamConfig config;

  /// Leftover bytes from _actualReadDelimited, keyed by stream ID.
  /// When a single read returns multiple messages, the extra bytes are stored here.
  final Map<String, Uint8List> _leftoverMap = {};
  
  /// Creates a new MultistreamMuxer with optional configuration
  MultistreamMuxer({
    MultistreamConfig? config,
  }) : config = config ?? const MultistreamConfig();
  
  /// Timeout for read operations (from config)
  Duration get readTimeout => config.readTimeout;
  
  /// Maximum number of retry attempts for transient failures (from config)
  int get maxRetries => config.maxRetries;
  
  /// Helper function to create a full text match function
  static bool Function(ProtocolID) _fulltextMatch(ProtocolID s) {
    return (ProtocolID a) => a == s;
  }
  
  @override
  void addHandler(ProtocolID protocol, HandlerFunc handler) {
    addHandlerWithFunc(protocol, _fulltextMatch(protocol), handler);
  }

  @override
  Future<void> addHandlerWithFunc(ProtocolID protocol, bool Function(ProtocolID) match, HandlerFunc handler) async {
    await _handlerLock.synchronized(() async {
      _removeHandler(protocol);
      _handlers.add(Handler(
        matchFunc: match,
        handle: handler,
        addName: protocol,
      ));
    });
  }
  
  @override
  void removeHandler(ProtocolID protocol) {
    _handlerLock.synchronized(() {
      _removeHandler(protocol);
    });
  }
  
  void _removeHandler(ProtocolID protocol) {
    for (var i = 0; i < _handlers.length; i++) {
      if (_handlers[i].addName == protocol) {
        _handlers.removeAt(i);
        return;
      }
    }
  }
  
  @override
  Future<List<ProtocolID>> protocols() async {
    return await _handlerLock.synchronized(() async {
      return _handlers.map((h) => h.addName).toList();
    });
  }
  
  Future<Handler?> _findHandler(ProtocolID proto) async {
    return await _handlerLock.synchronized(() async {
      for (var h in _handlers) {
        if (h.matchFunc(proto)) {
          return h;
        }
      }
      return null;
    });
  }
  
  @override
  Future<(ProtocolID, HandlerFunc)> negotiate(P2PStream<dynamic> stream) async {
    try {
      // 1. Read the initiator's multistream protocol ID
      _log.fine("[multistreamMuxer - negotiate] Waiting to read initiator's protocol ID.");
      final initiatorProtoID = await _readNextToken(stream);
      _log.fine("[multistreamMuxer - negotiate] Read initiator's protocol ID: $initiatorProtoID");
      if (initiatorProtoID != protocolID) {
        _log.warning("[multistreamMuxer - negotiate] Initiator sent wrong protocol ID: $initiatorProtoID. Expected: $protocolID");
        await stream.reset();
        throw IncorrectVersionException('Initiator sent wrong protocol ID: $initiatorProtoID');
      }

      // 2. Send our multistream protocol ID back
      _log.fine("[multistreamMuxer - negotiate] Sending our protocol ID: $protocolID");
      await _writeDelimited(stream, utf8.encode(protocolID));
      _log.fine("[multistreamMuxer - negotiate] Sent our protocol ID.");
      
      // Now proceed with protocol selection
      while (true) {
        _log.fine('[multistreamMuxer - negotiate] Waiting to read next protocol offer from initiator.');
        final tok = await _readNextToken(stream);
        _log.fine('[multistreamMuxer - negotiate] Received protocol offer from initiator: "$tok"');
        
        // Find a handler for this protocol
        _log.fine('[multistreamMuxer - negotiate] Finding handler for token: "$tok"');
        final h = await _findHandler(tok);
        if (h == null) {
          // No handler found, send "na" (not available)
          _log.warning('[multistreamMuxer - negotiate] No handler for "$tok". Sending "na".');
          await _writeDelimited(stream, utf8.encode('na'));
          _log.fine('[multistreamMuxer - negotiate] Sent "na" for "$tok". Continuing loop.');
          continue;
        }
        
        // Handler found, send the protocol name back
        _log.fine('[multistreamMuxer - negotiate] Handler found for "$tok". Sending acknowledgment: "$tok".');
        await _writeDelimited(stream, utf8.encode(tok));
        _log.fine('[multistreamMuxer - negotiate] Sent acknowledgment for "$tok".');
        
        // Return the protocol and handler
        _log.fine('[multistreamMuxer - negotiate] Returning protocol "$tok" and its handler.');
        return (tok, h.handle);
      }
    } catch (e) {
      _log.severe('[multistreamMuxer - negotiate for ${protocolID}] Error during negotiation: $e');
      await stream.reset();
      rethrow;
    }
  }
  
  @override
  Future<void> handle(P2PStream<dynamic> stream) async {
    late final ProtocolID proto;
    late final HandlerFunc handler;
    try {
      final result = await negotiate(stream);
      proto = result.$1;
      handler = result.$2;
    } catch (e) {
      // Clean up any leftover bytes on negotiation failure
      _leftoverMap.remove(stream.id());
      rethrow;
    }

    // After negotiation, inject any leftover bytes back into the stream.
    // This handles the case where Go sends protocol negotiation + application data
    // in the same TCP segment.
    _injectLeftover(stream);

    // Ensure the stream is valid before proceeding
    if (stream.isClosed) {
        _log.warning('[multistreamMuxer - handle] Stream for protocol $proto was closed during or immediately after negotiation. Aborting handler call.');
        return;
    }

    try {
             _log.fine('[multistreamMuxer - handle] Protocol $proto negotiated. Attempting to set protocol on stream scope and stream itself.');
             await stream.scope().setProtocol(proto);
             await stream.setProtocol(proto);
             _log.fine('[multistreamMuxer - handle] Successfully set protocol $proto on stream scope and stream. Proceeding to call handler.');
           } catch (e, s) {
             _log.severe('[multistreamMuxer - handle] CRITICAL: Error occurred while setting protocol $proto on stream scope/stream: $e\n$s. Resetting stream and not calling handler.');
      await stream.reset();
      rethrow;
    }

    // Only call the handler if setProtocol was successful
    return handler(proto, stream);
  }

  /// Injects any leftover bytes from multistream negotiation back into the stream's
  /// read buffer, so that application-level reads get the correct data.
  ///
  /// If injection fails (stream type does not support pushData), the leftover
  /// is retained in [_leftoverMap] so the caller can retrieve it via [drainLeftover].
  void _injectLeftover(P2PStream<dynamic> stream) {
    final streamId = stream.id();
    final leftover = _leftoverMap[streamId];
    if (leftover == null || leftover.isEmpty) {
      _leftoverMap.remove(streamId);
      return;
    }

    _log.fine('[multistreamMuxer] Injecting ${leftover.length} leftover bytes back into stream $streamId');
    // Navigate through SwarmStream wrapper to get the underlying YamuxStream
    dynamic target = stream;
    // SwarmStream wraps _underlyingMuxedStream, which delegates to YamuxStream
    if (target is SwarmStream) {
      target = target.incoming;
    }
    if (target is YamuxStream) {
      target.pushData(leftover);
      _leftoverMap.remove(streamId); // Only remove after successful injection
    } else {
      // Retain in map so caller can retrieve via drainLeftover()
      _log.warning('[multistreamMuxer] Cannot inject leftover bytes into stream type ${target.runtimeType}. '
          'Retaining ${leftover.length} bytes in leftoverMap for drainLeftover().');
    }
  }

  /// Drains any leftover bytes accumulated during multistream negotiation
  /// for the given [streamId]. Returns null if no leftover exists.
  ///
  /// Used by the connection upgrader to recover bytes that were read during
  /// multistream-select but belong to the next protocol layer (e.g., Noise
  /// handshake bytes that arrived in the same transport chunk as the final
  /// multistream negotiation message).
  Uint8List? drainLeftover(String streamId) {
    final leftover = _leftoverMap.remove(streamId);
    if (leftover != null && leftover.isNotEmpty) {
      _log.fine('[multistreamMuxer] Drained ${leftover.length} leftover bytes for stream $streamId');
    }
    return leftover;
  }

  /// Selects one of the given protocols with the remote peer.
  ///
  /// This method implements the initiator side of the multistream-select protocol.
  /// It will try each protocol in [protocolsToSelect] in order until the remote
  /// peer acknowledges one or indicates it does not support any of them.
  ///
  /// Returns the selected [ProtocolID] or `null` if no protocol could be agreed upon.
  Future<ProtocolID?> selectOneOf(P2PStream<dynamic> stream, List<ProtocolID> protocolsToSelect) async {
    final startTime = DateTime.now();
    final streamId = stream.id();
    
    // Safely get peer ID - during negotiation, conn might not be available
    String peerInfo;
    try {
      peerInfo = stream.conn.remotePeer.toString();
    } catch (e) {
      peerInfo = 'unknown_peer';
    }
    
    try {
      // 1. Send our multistream protocol ID
      _log.fine('[MSS-DIAG] selectOneOf: BEFORE first _writeDelimited (multistream header) stream=$streamId peer=$peerInfo');
      await _writeDelimited(stream, utf8.encode(protocolID));
      _log.fine('[MSS-DIAG] selectOneOf: AFTER first _writeDelimited, BEFORE _readNextToken stream=$streamId peer=$peerInfo');

      // 2. Read their multistream protocol ID
      final remoteProtoID = await _readNextToken(stream);
      _log.fine('[MSS-DIAG] selectOneOf: AFTER _readNextToken got="$remoteProtoID" stream=$streamId peer=$peerInfo');

      if (remoteProtoID != protocolID) {

        await stream.reset();
        throw IncorrectVersionException(
            'Remote peer responded with wrong multistream version: $remoteProtoID, expected $protocolID');
      }

      // 3. Iterate through the protocols we want to select
      for (int i = 0; i < protocolsToSelect.length; i++) {
        final p = protocolsToSelect[i];
        final protocolStart = DateTime.now();

        await _writeDelimited(stream, utf8.encode(p));
        final response = await _readNextToken(stream);

        if (response == p) {
          // Protocol selected
          final totalDuration = DateTime.now().difference(startTime);

          return p;
        } else if (response == 'na') {
          // Protocol not available, try next
          continue;
        } else {
          // Unexpected response
          await stream.reset();
          throw IncorrectVersionException(
              'Remote peer sent unexpected response: "$response" when trying to negotiate protocol "$p"');
        }
      }

      // No protocol was selected
      final totalDuration = DateTime.now().difference(startTime);

      await stream.reset(); // Ensure stream is reset if no protocol is selected
      return null;
    } catch (e, st) {
      final totalDuration = DateTime.now().difference(startTime);

      await stream.reset();
      rethrow;
    }
  }
  
  /// Writes a delimited message to the stream
  Future<void> _writeDelimited(P2PStream<dynamic> stream, List<int> message) async {
    // Encode the length as a varint
    final lengthBytes = MultiAddrCodec.encodeVarint(message.length + 1);
    
    // Create the full message: length + message + newline
    final fullMessage = Uint8List(lengthBytes.length + message.length + 1);
    fullMessage.setRange(0, lengthBytes.length, lengthBytes);
    fullMessage.setRange(lengthBytes.length, lengthBytes.length + message.length, message);
    fullMessage[lengthBytes.length + message.length] = 10; // '\n'
    
    // Write to the stream
    await stream.write(fullMessage);
  }
  
  /// Reads a delimited message from the stream with comprehensive error handling
  Future<Uint8List> _readDelimited(P2PStream<dynamic> stream) async {
    return await _safeStreamOperation<Uint8List>(
      () async => _performReadDelimited(stream),
      stream,
      'readDelimited',
    );
  }

  /// Internal implementation of read delimited with timeout and retry logic
  Future<Uint8List> _performReadDelimited(P2PStream<dynamic> stream) async {
    int retryCount = 0;
    
    while (retryCount <= maxRetries) {
      try {
        return await _performSingleReadDelimited(stream);
      } on TimeoutException catch (e) {
        retryCount++;
        _log.warning('[multistream] Read timeout (attempt $retryCount/${maxRetries + 1}): ${e.message}');
        
        if (retryCount > maxRetries) {
          _log.severe('[multistream] Max retries exceeded for read operation');
          rethrow;
        }
        
        // Check if stream is still viable for retry
        if (stream.isClosed) {
          _log.warning('[multistream] Stream closed during retry, aborting');
          throw FormatException('Stream closed during retry attempts');
        }
        
        // Brief delay before retry to allow stream to recover
        await Future.delayed(config.retryDelay * retryCount);
        if (config.enableTimeoutLogging) {

        }
      }
    }
    
    // Should never reach here due to rethrow above, but for safety
    throw TimeoutException('Read operation failed after $maxRetries retries', readTimeout);
  }
  
  /// Performs a single read delimited operation with timeout
  Future<Uint8List> _performSingleReadDelimited(P2PStream<dynamic> stream) async {
    // Validate stream state before starting
    if (stream.isClosed) {
      throw FormatException('Cannot read from closed stream');
    }
    
    // Use Future.timeout() instead of Timer for proper exception handling
    return await _actualReadDelimited(stream).timeout(
      readTimeout,
      onTimeout: () => throw TimeoutException('Multistream read operation timed out', readTimeout),
    );
  }

  /// Internal method that performs the actual read operation without timeout.
  /// Handles leftover bytes from previous reads to support multiple messages
  /// arriving in a single TCP segment (common with go-libp2p).
  Future<Uint8List> _actualReadDelimited(P2PStream<dynamic> stream) async {
    final buffer = BytesBuilder();
    int varintBytesRead = 0;
    bool lengthDecoded = false;
    int length = -1;

    // Start with any leftover bytes from previous call on this stream
    final streamId = stream.id();
    final leftover = _leftoverMap.remove(streamId);
    if (leftover != null && leftover.isNotEmpty) {
      buffer.add(leftover);
    }

    while (true) {
      // Try to decode from what we have before reading more
      final accumulated = buffer.toBytes();

      if (!lengthDecoded && accumulated.isNotEmpty) {
        try {
          final (decodedLength, consumed) = MultiAddrCodec.decodeVarint(accumulated);
          if (consumed > 0) {
            length = decodedLength;
            lengthDecoded = true;
            varintBytesRead = consumed;
            if (length > 1024) {
              await YamuxExceptionUtils.safeStreamReset(stream, context: 'message too large');
              throw MessageTooLargeException();
            }
          }
        } catch (e) {
          if (e is! RangeError) rethrow;
        }
      }

      if (lengthDecoded && accumulated.length >= length + varintBytesRead) {
        final totalMessageSize = varintBytesRead + length;
        // Save leftover bytes for next call
        if (accumulated.length > totalMessageSize) {
          _leftoverMap[streamId] = Uint8List.fromList(accumulated.sublist(totalMessageSize));
        }
        // Return message without varint prefix and trailing newline
        return Uint8List.fromList(
            accumulated.sublist(varintBytesRead, varintBytesRead + length - 1));
      }

      // Need more data
      if (stream.isClosed) {
        _log.warning('[multistream] Stream closed during read operation');
        throw FormatException('Stream closed during read operation');
      }

      final chunk = await stream.read();

      if (chunk.isEmpty) {
        if (stream.isClosed) {
          throw FormatException('Stream closed during read operation');
        }
        throw FormatException('Unexpected end of stream');
      }

      buffer.add(chunk);
    }
  }
  
  /// Reads the next token from the stream with error handling
  Future<String> _readNextToken(P2PStream<dynamic> stream) async {
    return await _safeStreamOperation<String>(
      () async {
        final bytes = await _readDelimited(stream);
        return utf8.decode(bytes);
      },
      stream,
      'readNextToken',
    );
  }

  /// Safely executes a stream operation with comprehensive error handling
  Future<T> _safeStreamOperation<T>(
    Future<T> Function() operation,
    P2PStream<dynamic> stream,
    String operationName,
  ) async {
    try {
      return await operation();
    } on YamuxException catch (e) {
      _log.warning('[multistream] Yamux exception during $operationName: ${e.message}');
      
      // Handle different types of Yamux exceptions
      if (e is YamuxStreamStateException) {
        // Stream state errors usually mean the stream is unusable
        await YamuxExceptionUtils.safeStreamReset(stream, context: operationName);
        throw FormatException('Stream in invalid state: ${e.currentState}');
      } else if (e is YamuxStreamTimeoutException) {
        // Timeout errors might be recoverable

        throw TimeoutException('Multistream operation timed out', e.timeout);
      } else {
        // Other Yamux errors
        await YamuxExceptionUtils.safeStreamReset(stream, context: operationName);
        throw FormatException('Stream protocol error: ${e.message}');
      }
    } on StateError catch (e) {
      _log.warning('[multistream] StateError during $operationName: ${e.message}');
      
      // Check if this is a Yamux stream state error
      if (e.message.contains('reset') || e.message.contains('closed')) {
        await YamuxExceptionUtils.safeStreamReset(stream, context: operationName);
        throw FormatException('Stream is in invalid state: ${e.message}');
      }
      
      // Generic state error
      rethrow;
    } on TimeoutException catch (e) {
      _log.warning('[multistream] Timeout during $operationName: ${e.message}');
      await YamuxExceptionUtils.safeStreamReset(stream, context: operationName);
      rethrow;
    } on FormatException catch (e) {
      _log.warning('[multistream] Format error during $operationName: ${e.message}');
      await YamuxExceptionUtils.safeStreamReset(stream, context: operationName);
      rethrow;
    } catch (e, stackTrace) {
      _log.severe('[multistream] Unexpected error during $operationName: $e\n$stackTrace');
      await YamuxExceptionUtils.safeStreamReset(stream, context: operationName);
      
      // Wrap unknown exceptions in a format exception for consistency
      throw FormatException('Multistream operation failed: $e');
    }
  }
}
