import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:logging/logging.dart';
import 'package:dart_libp2p/core/network/stream.dart' as core_p2p_stream;

import 'obp_frame.dart';

/// OverNode Binary Protocol (OBP) Handler
/// 
/// Provides reliable, framed communication over libp2p streams with:
/// - Protocol handshaking and version negotiation
/// - Reliable message framing and delivery
/// - Error handling and recovery
/// - Flow control and acknowledgments
class OBPProtocolHandler {
  static final Logger _logger = Logger('OBPProtocolHandler');
  
  /// Default timeout for protocol operations
  static const Duration defaultTimeout = Duration(seconds: 30);
  
  /// Maximum number of retry attempts
  static const int maxRetries = 3;
  
  /// Stream ID counter for generating unique stream IDs
  static int _streamIdCounter = 1;
  
  /// Per-stream read buffers to handle frame boundaries
  static final Map<String, List<int>> _streamBuffers = <String, List<int>>{};
  
  /// Generate next stream ID
  static int _nextStreamId() => _streamIdCounter++;
  
  /// Get a unique key for the stream buffer
  static String _getStreamKey(core_p2p_stream.P2PStream stream) {
    return stream.hashCode.toString();
  }
  
  /// Perform protocol handshake
  /// 
  /// Client initiates handshake, server responds with acknowledgment.
  /// Returns true if handshake successful, false otherwise.
  static Future<bool> performHandshake(
    core_p2p_stream.P2PStream stream, {
    required bool isClient,
    Duration timeout = defaultTimeout,
    String context = 'unknown',
  }) async {
    try {
      if (isClient) {
        return await _performClientHandshake(stream, timeout: timeout, context: context);
      } else {
        return await _performServerHandshake(stream, timeout: timeout, context: context);
      }
    } catch (e, stackTrace) {
      _logger.severe('[$context] Handshake failed: $e', e, stackTrace);
      return false;
    }
  }
  
  /// Send a request frame and wait for response
  /// 
  /// Handles retries, timeouts, and acknowledgments automatically.
  static Future<OBPFrame?> sendRequest(
    core_p2p_stream.P2PStream stream,
    OBPFrame request, {
    Duration timeout = defaultTimeout,
    int maxRetries = maxRetries,
    String context = 'unknown',
  }) async {
    for (int attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        _logger.fine('[$context] Sending request (attempt $attempt/$maxRetries): ${request.type}');
        
        // Send request frame
        await _writeFrame(stream, request, timeout: timeout, context: context);
        
        // Wait for response
        final response = await _readFrame(stream, timeout: timeout, context: context);
        
        if (response == null) {
          _logger.warning('[$context] No response received for ${request.type} (attempt $attempt)');
          if (attempt < maxRetries) continue;
          return null;
        }
        
        // Check for error response
        if (response.type == OBPMessageType.error) {
          final errorMsg = utf8.decode(response.payload);
          _logger.warning('[$context] Received error response: $errorMsg');
          return response; // Return error response for caller to handle
        }
        
        _logger.fine('[$context] Received response: ${response.type}');
        return response;
        
      } catch (e) {
        _logger.warning('[$context] Request attempt $attempt failed: $e');
        if (attempt >= maxRetries) {
          _logger.severe('[$context] All request attempts failed for ${request.type}');
          rethrow;
        }
        
        // Wait before retry
        await Future.delayed(Duration(milliseconds: 100 * attempt));
      }
    }
    
    return null;
  }
  
  /// Send a response frame
  /// 
  /// Used by servers to respond to client requests.
  static Future<void> sendResponse(
    core_p2p_stream.P2PStream stream,
    OBPFrame response, {
    Duration timeout = defaultTimeout,
    String context = 'unknown',
  }) async {
    try {
      _logger.fine('[$context] Sending response: ${response.type}');
      await _writeFrame(stream, response, timeout: timeout, context: context);
      _logger.fine('[$context] Response sent successfully');
    } catch (e, stackTrace) {
      _logger.severe('[$context] Failed to send response: $e', e, stackTrace);
      rethrow;
    }
  }
  
  /// Send an error response
  /// 
  /// Convenience method for sending standardized error responses.
  static Future<void> sendError(
    core_p2p_stream.P2PStream stream,
    String errorMessage,
    int errorCode, {
    Duration timeout = defaultTimeout,
    String context = 'unknown',
  }) async {
    final errorPayload = jsonEncode({
      'error_code': errorCode,
      'error_message': errorMessage,
      'timestamp': DateTime.now().toIso8601String(),
    });
    
    final errorFrame = OBPFrame(
      type: OBPMessageType.error,
      streamId: _nextStreamId(),
      payload: Uint8List.fromList(utf8.encode(errorPayload)),
    );
    
    await sendResponse(stream, errorFrame, timeout: timeout, context: context);
  }
  
  /// Read a single frame from stream
  /// 
  /// Handles partial reads and frame validation.
  static Future<OBPFrame?> readFrame(
    core_p2p_stream.P2PStream stream, {
    Duration timeout = defaultTimeout,
    String context = 'unknown',
  }) async {
    return await _readFrame(stream, timeout: timeout, context: context);
  }
  
  /// Write a single frame to stream
  /// 
  /// Handles frame encoding and ensures complete write.
  static Future<void> writeFrame(
    core_p2p_stream.P2PStream stream,
    OBPFrame frame, {
    Duration timeout = defaultTimeout,
    String context = 'unknown',
  }) async {
    await _writeFrame(stream, frame, timeout: timeout, context: context);
  }
  
  /// Safe stream close with proper cleanup
  static Future<void> closeStream(
    core_p2p_stream.P2PStream stream, {
    String context = 'unknown',
  }) async {
    try {
      if (!stream.isClosed) {
        await stream.close();
        _logger.fine('[$context] Stream closed successfully');
      }
    } catch (e) {
      _logger.warning('[$context] Error closing stream: $e');
      // Don't rethrow close errors
    }
  }
  
  /// Safe stream reset with proper cleanup
  static Future<void> resetStream(
    core_p2p_stream.P2PStream stream, {
    String context = 'unknown',
  }) async {
    try {
      await stream.reset();
      _logger.fine('[$context] Stream reset successfully');
    } catch (e) {
      _logger.warning('[$context] Error resetting stream: $e');
      // Don't rethrow reset errors
    }
  }
  
  // Private implementation methods
  
  static Future<bool> _performClientHandshake(
    core_p2p_stream.P2PStream stream, {
    required Duration timeout,
    required String context,
  }) async {
    _logger.info('[$context] CLIENT: Starting OBP handshake - sending HandshakeReq');
    
    // Send handshake request
    final handshakeReq = OBPFrame(
      type: OBPMessageType.handshakeReq,
      streamId: _nextStreamId(),
      payload: Uint8List.fromList(utf8.encode(jsonEncode({
        'version': OBPFrame.VERSION,
        'client_id': 'overnode-mobile',
        'capabilities': ['prekey-broadcast', 'prekey-fetch', 'crdt-sync'],
        'timestamp': DateTime.now().toIso8601String(),
      }))),
    );
    
    _logger.fine('[$context] CLIENT: Writing HandshakeReq frame to server');
    await _writeFrame(stream, handshakeReq, timeout: timeout, context: context);
    
    _logger.fine('[$context] CLIENT: Waiting for HandshakeAck from server');
    // Wait for handshake acknowledgment
    final handshakeAck = await _readFrame(stream, timeout: timeout, context: context);
    
    if (handshakeAck == null || handshakeAck.type != OBPMessageType.handshakeAck) {
      _logger.warning('[$context] Invalid handshake response: ${handshakeAck?.type}');
      return false;
    }
    
    // Parse server capabilities
    try {
      final ackData = jsonDecode(utf8.decode(handshakeAck.payload)) as Map<String, dynamic>;
      final serverCapabilities = List<String>.from(ackData['capabilities'] as List);
      _logger.info('[$context] Handshake successful, server capabilities: $serverCapabilities');
      return true;
    } catch (e) {
      _logger.warning('[$context] Failed to parse handshake acknowledgment: $e');
      return false;
    }
  }
  
  static Future<bool> _performServerHandshake(
    core_p2p_stream.P2PStream stream, {
    required Duration timeout,
    required String context,
  }) async {
    // Wait for handshake request
    final handshakeReq = await _readFrame(stream, timeout: timeout, context: context);
    
    if (handshakeReq == null || handshakeReq.type != OBPMessageType.handshakeReq) {
      _logger.warning('[$context] Invalid handshake request: ${handshakeReq?.type}');
      return false;
    }
    
    // Parse client capabilities
    try {
      final reqData = jsonDecode(utf8.decode(handshakeReq.payload)) as Map<String, dynamic>;
      final clientCapabilities = List<String>.from(reqData['capabilities'] as List);
      _logger.info('[$context] Handshake request received, client capabilities: $clientCapabilities');
    } catch (e) {
      _logger.warning('[$context] Failed to parse handshake request: $e');
      return false;
    }
    
    // Send handshake acknowledgment
    final handshakeAck = OBPFrame(
      type: OBPMessageType.handshakeAck,
      streamId: handshakeReq.streamId, // Use same stream ID
      payload: Uint8List.fromList(utf8.encode(jsonEncode({
        'version': OBPFrame.VERSION,
        'server_id': 'overnode-sf-server',
        'capabilities': ['prekey-storage', 'prekey-fetch', 'crdt-pin'],
        'timestamp': DateTime.now().toIso8601String(),
      }))),
    );
    
    await _writeFrame(stream, handshakeAck, timeout: timeout, context: context);
    _logger.info('[$context] Handshake completed successfully');
    return true;
  }
  
  static Future<OBPFrame?> _readFrame(
    core_p2p_stream.P2PStream stream, {
    required Duration timeout,
    required String context,
  }) async {
    try {
      // Read frame header first
      final headerData = await _readExactBytes(stream, OBPFrame.HEADER_SIZE, timeout: timeout, context: context);
      if (headerData == null) {
        _logger.fine('[$context] EOF while reading frame header');
        return null;
      }
      
      // Parse header to get payload length
      final headerBuffer = ByteData.sublistView(headerData);
      final payloadLength = headerBuffer.getUint32(8, Endian.big); // Length field at offset 8
      
      // Read payload if present
      Uint8List? payloadData;
      if (payloadLength > 0) {
        payloadData = await _readExactBytes(stream, payloadLength, timeout: timeout, context: context);
        if (payloadData == null) {
          throw FormatException('EOF while reading frame payload');
        }
      }
      
      // Combine header and payload
      final frameData = Uint8List(OBPFrame.HEADER_SIZE + payloadLength);
      frameData.setRange(0, OBPFrame.HEADER_SIZE, headerData);
      if (payloadData != null) {
        frameData.setRange(OBPFrame.HEADER_SIZE, frameData.length, payloadData);
      }
      
      // Decode frame
      final frame = OBPFrame.decode(frameData);
      _logger.fine('[$context] Read frame: ${frame.type} (${frame.length} bytes)');
      return frame;
      
    } catch (e, stackTrace) {
      _logger.severe('[$context] Error reading frame: $e', e, stackTrace);
      rethrow;
    }
  }
  
  static Future<void> _writeFrame(
    core_p2p_stream.P2PStream stream,
    OBPFrame frame, {
    required Duration timeout,
    required String context,
  }) async {
    try {
      final frameData = frame.encode();
      
      // PHASE 1 LOGGING: Pre-write verification
      _logger.info('[$context] WRITE_VERIFY: About to write ${frame.type} frame');
      _logger.info('[$context] WRITE_VERIFY: Frame size: ${frameData.length} bytes');
      _logger.info('[$context] WRITE_VERIFY: Frame header (first 16 bytes): ${frameData.take(16).map((b) => b.toRadixString(16).padLeft(2, '0')).join(' ')}');
      _logger.info('[$context] WRITE_VERIFY: Stream state before write - isClosed: ${stream.isClosed}');
      
      // Perform the write operation
      _logger.info('[$context] WRITE_VERIFY: Calling stream.write() now...');
      final writeStartTime = DateTime.now();
      
      await stream.write(frameData).timeout(timeout);
      
      final writeEndTime = DateTime.now();
      final writeDuration = writeEndTime.difference(writeStartTime);
      
      // PHASE 1 LOGGING: Post-write verification
      _logger.info('[$context] WRITE_VERIFY: stream.write() completed successfully in ${writeDuration.inMilliseconds}ms');
      _logger.info('[$context] WRITE_VERIFY: Stream state after write - isClosed: ${stream.isClosed}');
      
      // Attempt to flush the stream if possible
      try {
        _logger.info('[$context] WRITE_VERIFY: Attempting to flush stream...');
        // Note: P2PStream may not have a flush method, so we'll try to access it dynamically
        final dynamic streamDynamic = stream;
        if (streamDynamic.runtimeType.toString().contains('flush')) {
          await streamDynamic.flush?.call();
          _logger.info('[$context] WRITE_VERIFY: Stream flushed successfully');
        } else {
          _logger.info('[$context] WRITE_VERIFY: Stream does not support flush operation');
        }
      } catch (flushError) {
        _logger.warning('[$context] WRITE_VERIFY: Stream flush failed (non-critical): $flushError');
      }
      
      _logger.info('[$context] WRITE_VERIFY: Frame write operation completed - ${frame.type} (${frameData.length} bytes) sent successfully');
      
    } catch (e, stackTrace) {
      _logger.severe('[$context] WRITE_VERIFY: CRITICAL - Frame write failed for ${frame.type}: $e', e, stackTrace);
      _logger.severe('[$context] WRITE_VERIFY: Stream state on error - isClosed: ${stream.isClosed}');
      rethrow;
    }
  }
  
  static Future<Uint8List?> _readExactBytes(
    core_p2p_stream.P2PStream stream,
    int expectedBytes, {
    required Duration timeout,
    required String context,
  }) async {
    final streamKey = _getStreamKey(stream);
    
    // PHASE 1 LOGGING: Pre-read verification
    _logger.info('[$context] READ_VERIFY: About to read $expectedBytes bytes from stream');
    _logger.info('[$context] READ_VERIFY: Stream state before read - isClosed: ${stream.isClosed}');
    
    // Get or create buffer for this stream
    final streamBuffer = _streamBuffers.putIfAbsent(streamKey, () => <int>[]);
    _logger.info('[$context] READ_VERIFY: Stream buffer contains ${streamBuffer.length} bytes from previous reads');
    
    final deadline = DateTime.now().add(timeout);
    int readAttempts = 0;
    
    // Keep reading until we have enough bytes
    while (streamBuffer.length < expectedBytes) {
      if (DateTime.now().isAfter(deadline)) {
        _logger.severe('[$context] READ_VERIFY: Read timeout after ${readAttempts} attempts, got ${streamBuffer.length}/$expectedBytes bytes');
        throw TimeoutException('Read timeout', timeout);
      }
      
      try {
        readAttempts++;
        _logger.info('[$context] READ_VERIFY: Read attempt $readAttempts - calling stream.read()...');
        final readStartTime = DateTime.now();
        
        final chunk = await stream.read().timeout(timeout);
        
        final readEndTime = DateTime.now();
        final readDuration = readEndTime.difference(readStartTime);
        
        _logger.info('[$context] READ_VERIFY: stream.read() returned ${chunk.length} bytes in ${readDuration.inMilliseconds}ms');
        
        if (chunk.isNotEmpty) {
          _logger.info('[$context] READ_VERIFY: Received data chunk (first 16 bytes): ${chunk.take(16).map((b) => b.toRadixString(16).padLeft(2, '0')).join(' ')}');
          
          // Add all received bytes to the stream buffer
          streamBuffer.addAll(chunk);
          _logger.info('[$context] READ_VERIFY: Stream buffer now contains ${streamBuffer.length} bytes (need $expectedBytes)');
        }
        
        if (chunk.isEmpty) {
          // EOF reached
          if (streamBuffer.isEmpty) {
            _logger.info('[$context] READ_VERIFY: Clean EOF - no data received');
            return null; // Clean EOF
          } else {
            _logger.severe('[$context] READ_VERIFY: Unexpected EOF - got ${streamBuffer.length}/$expectedBytes bytes');
            throw FormatException('Unexpected EOF: got ${streamBuffer.length}/$expectedBytes bytes');
          }
        }
        
      } catch (e) {
        if (e is TimeoutException) {
          _logger.warning('[$context] READ_VERIFY: Read attempt $readAttempts timed out, continuing...');
          // Continue trying until overall timeout
          continue;
        }
        _logger.severe('[$context] READ_VERIFY: Read attempt $readAttempts failed: $e');
        rethrow;
      }
    }
    
    // Extract exactly the requested number of bytes
    final result = Uint8List.fromList(streamBuffer.take(expectedBytes).toList());
    
    // Remove the extracted bytes from the buffer, keeping any excess for next read
    streamBuffer.removeRange(0, expectedBytes);
    
    _logger.info('[$context] READ_VERIFY: Successfully extracted $expectedBytes bytes after $readAttempts attempts');
    _logger.info('[$context] READ_VERIFY: ${streamBuffer.length} bytes remain in stream buffer for next read');
    
    // Clean up empty buffers to prevent memory leaks
    if (streamBuffer.isEmpty) {
      _streamBuffers.remove(streamKey);
      _logger.info('[$context] READ_VERIFY: Cleaned up empty stream buffer');
    }
    
    return result;
  }
}

/// OBP Error Codes
class OBPErrorCodes {
  static const int protocolError = 1000;
  static const int invalidMessage = 1001;
  static const int unsupportedVersion = 1002;
  static const int handshakeFailed = 1003;
  static const int timeout = 1004;
  static const int internalError = 1005;
  static const int invalidPayload = 1006;
  static const int resourceNotFound = 1007;
  static const int accessDenied = 1008;
  static const int rateLimited = 1009;
}
