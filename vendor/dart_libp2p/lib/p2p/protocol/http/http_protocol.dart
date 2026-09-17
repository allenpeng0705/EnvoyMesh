import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:logging/logging.dart';

import '../../../core/interfaces.dart';
import '../../../core/network/stream.dart';
import '../../../core/peer/peer_id.dart';
import '../../../core/protocol/protocol.dart';

final _logger = Logger('http_protocol');

/// Constants for the HTTP-like protocol
class HttpProtocolConstants {
  static const String protocolId = '/p2p/http/1.0.0';
  static const String serviceName = 'libp2p.http';
  static const Duration requestTimeout = Duration(seconds: 30);
  static const Duration responseTimeout = Duration(seconds: 30);
  static const int maxHeaderSize = 8192; // 8KB max headers
  static const int maxBodySize = 1024 * 1024; // 1MB max body
  static const String crlf = '\r\n';
  static const String headerSeparator = '\r\n\r\n';
}

/// HTTP-like methods
enum HttpMethod {
  get('GET'),
  post('POST'),
  put('PUT'),
  delete('DELETE'),
  head('HEAD'),
  options('OPTIONS'),
  patch('PATCH');

  const HttpMethod(this.value);
  final String value;

  static HttpMethod fromString(String method) {
    return HttpMethod.values.firstWhere(
      (m) => m.value == method.toUpperCase(),
      orElse: () => throw ArgumentError('Unknown HTTP method: $method'),
    );
  }
}

/// HTTP-like status codes
enum HttpStatus {
  ok(200, 'OK'),
  created(201, 'Created'),
  accepted(202, 'Accepted'),
  noContent(204, 'No Content'),
  badRequest(400, 'Bad Request'),
  unauthorized(401, 'Unauthorized'),
  forbidden(403, 'Forbidden'),
  notFound(404, 'Not Found'),
  methodNotAllowed(405, 'Method Not Allowed'),
  conflict(409, 'Conflict'),
  internalServerError(500, 'Internal Server Error'),
  notImplemented(501, 'Not Implemented'),
  serviceUnavailable(503, 'Service Unavailable');

  const HttpStatus(this.code, this.message);
  final int code;
  final String message;

  static HttpStatus fromCode(int code) {
    return HttpStatus.values.firstWhere(
      (s) => s.code == code,
      orElse: () => throw ArgumentError('Unknown HTTP status code: $code'),
    );
  }
}

/// HTTP-like request
class HttpRequest {
  final HttpMethod method;
  final String path;
  final String version;
  final Map<String, String> headers;
  final Uint8List? body;
  final PeerId remotePeer;

  HttpRequest({
    required this.method,
    required this.path,
    this.version = 'HTTP/1.1',
    Map<String, String>? headers,
    this.body,
    required this.remotePeer,
  }) : headers = headers ?? {};

  /// Get content length from headers or body
  int get contentLength {
    final headerLength = headers['content-length'];
    if (headerLength != null) {
      return int.tryParse(headerLength) ?? 0;
    }
    return body?.length ?? 0;
  }

  /// Get content type from headers
  String get contentType => headers['content-type'] ?? 'application/octet-stream';

  /// Get body as string (assumes UTF-8 encoding)
  String? get bodyAsString {
    if (body == null) return null;
    try {
      return utf8.decode(body!);
    } catch (e) {
      _logger.warning('Failed to decode body as UTF-8: $e');
      return null;
    }
  }

  /// Get body as JSON
  Map<String, dynamic>? get bodyAsJson {
    final bodyString = bodyAsString;
    if (bodyString == null) return null;
    
    try {
      return jsonDecode(bodyString) as Map<String, dynamic>;
    } catch (e) {
      _logger.warning('Failed to decode body as JSON: $e');
      return null;
    }
  }

  /// Serialize request to wire format
  Uint8List serialize() {
    final buffer = StringBuffer();
    
    // Request line
    buffer.write('${method.value} $path $version${HttpProtocolConstants.crlf}');
    
    // Headers
    for (final entry in headers.entries) {
      buffer.write('${entry.key}: ${entry.value}${HttpProtocolConstants.crlf}');
    }
    
    // Content-Length header if body exists
    if (body != null && !headers.containsKey('content-length')) {
      buffer.write('content-length: ${body!.length}${HttpProtocolConstants.crlf}');
    }
    
    // End of headers
    buffer.write(HttpProtocolConstants.crlf);
    
    final headerBytes = utf8.encode(buffer.toString());
    
    if (body != null) {
      final result = Uint8List(headerBytes.length + body!.length);
      result.setRange(0, headerBytes.length, headerBytes);
      result.setRange(headerBytes.length, result.length, body!);
      return result;
    }
    
    return headerBytes;
  }

  /// Parse request from wire format
  static HttpRequest parse(Uint8List data, PeerId remotePeer) {
    final dataString = utf8.decode(data);
    final headerEndIndex = dataString.indexOf(HttpProtocolConstants.headerSeparator);
    
    if (headerEndIndex == -1) {
      throw FormatException('Invalid HTTP request: no header separator found');
    }
    
    final headerSection = dataString.substring(0, headerEndIndex);
    final lines = headerSection.split(HttpProtocolConstants.crlf);
    
    if (lines.isEmpty) {
      throw FormatException('Invalid HTTP request: no request line');
    }
    
    // Parse request line
    final requestLine = lines[0].split(' ');
    if (requestLine.length != 3) {
      throw FormatException('Invalid HTTP request line: ${lines[0]}');
    }
    
    final method = HttpMethod.fromString(requestLine[0]);
    final path = requestLine[1];
    final version = requestLine[2];
    
    // Parse headers
    final headers = <String, String>{};
    for (int i = 1; i < lines.length; i++) {
      final line = lines[i];
      if (line.isEmpty) continue;
      
      final colonIndex = line.indexOf(':');
      if (colonIndex == -1) {
        throw FormatException('Invalid HTTP header: $line');
      }
      
      final key = line.substring(0, colonIndex).trim().toLowerCase();
      final value = line.substring(colonIndex + 1).trim();
      headers[key] = value;
    }
    
    // Extract body if present
    Uint8List? body;
    final bodyStartIndex = headerEndIndex + HttpProtocolConstants.headerSeparator.length;
    if (bodyStartIndex < data.length) {
      body = data.sublist(bodyStartIndex);
    }
    
    return HttpRequest(
      method: method,
      path: path,
      version: version,
      headers: headers,
      body: body,
      remotePeer: remotePeer,
    );
  }

  @override
  String toString() {
    return 'HttpRequest(method: $method, path: $path, headers: $headers, bodyLength: ${body?.length ?? 0})';
  }
}

/// HTTP-like response
class HttpResponse {
  final HttpStatus status;
  final String version;
  final Map<String, String> headers;
  final Uint8List? body;

  HttpResponse({
    required this.status,
    this.version = 'HTTP/1.1',
    Map<String, String>? headers,
    this.body,
  }) : headers = headers ?? {};

  /// Create a successful response with JSON body
  factory HttpResponse.json(Map<String, dynamic> data, {HttpStatus status = HttpStatus.ok}) {
    final jsonString = jsonEncode(data);
    final body = utf8.encode(jsonString);
    
    return HttpResponse(
      status: status,
      headers: {
        'content-type': 'application/json',
        'content-length': body.length.toString(),
      },
      body: body,
    );
  }

  /// Create a successful response with text body
  factory HttpResponse.text(String text, {HttpStatus status = HttpStatus.ok}) {
    final body = utf8.encode(text);
    
    return HttpResponse(
      status: status,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'content-length': body.length.toString(),
      },
      body: body,
    );
  }

  /// Create an error response
  factory HttpResponse.error(HttpStatus status, [String? message]) {
    final errorMessage = message ?? status.message;
    final body = utf8.encode(errorMessage);
    
    return HttpResponse(
      status: status,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'content-length': body.length.toString(),
      },
      body: body,
    );
  }

  /// Get content length from headers or body
  int get contentLength {
    final headerLength = headers['content-length'];
    if (headerLength != null) {
      return int.tryParse(headerLength) ?? 0;
    }
    return body?.length ?? 0;
  }

  /// Get content type from headers
  String get contentType => headers['content-type'] ?? 'application/octet-stream';

  /// Get body as string (assumes UTF-8 encoding)
  String? get bodyAsString {
    if (body == null) return null;
    try {
      return utf8.decode(body!);
    } catch (e) {
      _logger.warning('Failed to decode body as UTF-8: $e');
      return null;
    }
  }

  /// Get body as JSON
  Map<String, dynamic>? get bodyAsJson {
    final bodyString = bodyAsString;
    if (bodyString == null) return null;
    
    try {
      return jsonDecode(bodyString) as Map<String, dynamic>;
    } catch (e) {
      _logger.warning('Failed to decode body as JSON: $e');
      return null;
    }
  }

  /// Serialize response to wire format
  Uint8List serialize() {
    final buffer = StringBuffer();
    
    // Status line
    buffer.write('$version ${status.code} ${status.message}${HttpProtocolConstants.crlf}');
    
    // Headers
    for (final entry in headers.entries) {
      buffer.write('${entry.key}: ${entry.value}${HttpProtocolConstants.crlf}');
    }
    
    // Content-Length header if body exists
    if (body != null && !headers.containsKey('content-length')) {
      buffer.write('content-length: ${body!.length}${HttpProtocolConstants.crlf}');
    }
    
    // End of headers
    buffer.write(HttpProtocolConstants.crlf);
    
    final headerBytes = utf8.encode(buffer.toString());
    
    if (body != null) {
      final result = Uint8List(headerBytes.length + body!.length);
      result.setRange(0, headerBytes.length, headerBytes);
      result.setRange(headerBytes.length, result.length, body!);
      return result;
    }
    
    return headerBytes;
  }

  /// Parse response from wire format
  static HttpResponse parse(Uint8List data) {
    final dataString = utf8.decode(data);
    final headerEndIndex = dataString.indexOf(HttpProtocolConstants.headerSeparator);
    
    if (headerEndIndex == -1) {
      throw FormatException('Invalid HTTP response: no header separator found');
    }
    
    final headerSection = dataString.substring(0, headerEndIndex);
    final lines = headerSection.split(HttpProtocolConstants.crlf);
    
    if (lines.isEmpty) {
      throw FormatException('Invalid HTTP response: no status line');
    }
    
    // Parse status line
    final statusLine = lines[0].split(' ');
    if (statusLine.length < 3) {
      throw FormatException('Invalid HTTP status line: ${lines[0]}');
    }
    
    final version = statusLine[0];
    final statusCode = int.tryParse(statusLine[1]);
    if (statusCode == null) {
      throw FormatException('Invalid HTTP status code: ${statusLine[1]}');
    }
    
    final status = HttpStatus.fromCode(statusCode);
    
    // Parse headers
    final headers = <String, String>{};
    for (int i = 1; i < lines.length; i++) {
      final line = lines[i];
      if (line.isEmpty) continue;
      
      final colonIndex = line.indexOf(':');
      if (colonIndex == -1) {
        throw FormatException('Invalid HTTP header: $line');
      }
      
      final key = line.substring(0, colonIndex).trim().toLowerCase();
      final value = line.substring(colonIndex + 1).trim();
      headers[key] = value;
    }
    
    // Extract body if present
    Uint8List? body;
    final bodyStartIndex = headerEndIndex + HttpProtocolConstants.headerSeparator.length;
    if (bodyStartIndex < data.length) {
      body = data.sublist(bodyStartIndex);
    }
    
    return HttpResponse(
      status: status,
      version: version,
      headers: headers,
      body: body,
    );
  }

  @override
  String toString() {
    return 'HttpResponse(status: ${status.code} ${status.message}, headers: $headers, bodyLength: ${body?.length ?? 0})';
  }
}

/// HTTP request handler function type
typedef HttpRequestHandler = Future<HttpResponse> Function(HttpRequest request);

/// Route definition for HTTP-like protocol
class HttpRoute {
  final HttpMethod method;
  final String path;
  final HttpRequestHandler handler;
  final RegExp? pathPattern;

  HttpRoute({
    required this.method,
    required this.path,
    required this.handler,
  }) : pathPattern = _createPathPattern(path);

  /// Create regex pattern from path (supports simple path parameters like /users/:id)
  static RegExp? _createPathPattern(String path) {
    if (!path.contains(':')) return null;
    
    // Convert path parameters to regex groups
    final pattern = path.replaceAllMapped(
      RegExp(r':([a-zA-Z_][a-zA-Z0-9_]*)'),
      (match) => '([^/]+)',
    );
    
    return RegExp('^$pattern\$');
  }

  /// Check if this route matches the given method and path
  bool matches(HttpMethod method, String path) {
    if (this.method != method) return false;
    
    if (pathPattern != null) {
      return pathPattern!.hasMatch(path);
    }
    
    return this.path == path;
  }

  /// Extract path parameters from the given path
  Map<String, String> extractParams(String path) {
    if (pathPattern == null) return {};
    
    final match = pathPattern!.firstMatch(path);
    if (match == null) return {};
    
    final params = <String, String>{};
    final paramNames = RegExp(r':([a-zA-Z_][a-zA-Z0-9_]*)')
        .allMatches(this.path)
        .map((m) => m.group(1)!)
        .toList();
    
    for (int i = 0; i < paramNames.length && i + 1 < match.groupCount + 1; i++) {
      params[paramNames[i]] = match.group(i + 1)!;
    }
    
    return params;
  }
}

/// HTTP-like protocol service
class HttpProtocolService {
  final Host host;
  final List<HttpRoute> _routes = [];
  final Map<String, String> _defaultHeaders = {
    'server': 'libp2p-http/1.0.0',
    'connection': 'close',
  };

  HttpProtocolService(this.host) {
    host.setStreamHandler(HttpProtocolConstants.protocolId, _handleRequest);
    _logger.info('HTTP protocol service initialized');
  }

  /// Add a route handler
  void addRoute(HttpMethod method, String path, HttpRequestHandler handler) {
    _routes.add(HttpRoute(method: method, path: path, handler: handler));
    _logger.info('Added route: ${method.value} $path');
  }

  /// Convenience methods for common HTTP methods
  void get(String path, HttpRequestHandler handler) => addRoute(HttpMethod.get, path, handler);
  void post(String path, HttpRequestHandler handler) => addRoute(HttpMethod.post, path, handler);
  void put(String path, HttpRequestHandler handler) => addRoute(HttpMethod.put, path, handler);
  void delete(String path, HttpRequestHandler handler) => addRoute(HttpMethod.delete, path, handler);

  /// Set default headers that will be added to all responses
  void setDefaultHeader(String key, String value) {
    _defaultHeaders[key.toLowerCase()] = value;
  }

  /// Handle incoming HTTP requests
  Future<void> _handleRequest(P2PStream stream, PeerId peerId) async {
    final startTime = DateTime.now();
    _logger.info('🎯 [HTTP-SERVER-START] HTTP request handler started for peer ${peerId.toString()}. Stream ID: ${stream.id}');
    
    try {
      // Phase 1: Stream Setup
      _logger.info('⚙️ [HTTP-SERVER-PHASE-1] Setting up stream service and deadline');
      stream.scope().setService(HttpProtocolConstants.serviceName);
      await stream.setDeadline(DateTime.now().add(HttpProtocolConstants.requestTimeout));
      _logger.info('✅ [HTTP-SERVER-PHASE-1] Stream setup completed with timeout: ${HttpProtocolConstants.requestTimeout.inSeconds}s');

      // Phase 2: Read Request Data
      _logger.info('📥 [HTTP-SERVER-PHASE-2] Reading HTTP request data from stream');
      final readStartTime = DateTime.now();
      
      final requestData = await _readHttpMessage(stream);
      
      final readTime = DateTime.now().difference(readStartTime);
      _logger.info('✅ [HTTP-SERVER-PHASE-2] Request data read in ${readTime.inMilliseconds}ms. Size: ${requestData.length} bytes');
      
      if (requestData.isEmpty) {
        _logger.warning('⚠️ [HTTP-SERVER-PHASE-2] Received empty request from peer ${peerId.toString()}');
        return;
      }

      // Phase 3: Parse Request
      _logger.info('🔍 [HTTP-SERVER-PHASE-3] Parsing HTTP request');
      final parseStartTime = DateTime.now();
      
      final request = HttpRequest.parse(requestData, peerId);
      
      final parseTime = DateTime.now().difference(parseStartTime);
      _logger.info('✅ [HTTP-SERVER-PHASE-3] Request parsed in ${parseTime.inMilliseconds}ms: ${request.method.value} ${request.path}');

      // Phase 4: Route Matching
      _logger.info('🔍 [HTTP-SERVER-PHASE-4] Finding route for ${request.method.value} ${request.path}');
      final route = _findRoute(request.method, request.path);
      HttpResponse response;

      if (route != null) {
        _logger.info('✅ [HTTP-SERVER-PHASE-4] Route found for ${request.method.value} ${request.path}');
        
        try {
          // Phase 5: Route Handler Execution
          _logger.info('🚀 [HTTP-SERVER-PHASE-5] Executing route handler');
          final handlerStartTime = DateTime.now();
          
          // Extract path parameters and add to request context
          final params = route.extractParams(request.path);
          if (params.isNotEmpty) {
            _logger.fine('📋 [HTTP-SERVER-PHASE-5] Extracted path parameters: $params');
          }

          // Call the route handler
          response = await route.handler(request);
          
          final handlerTime = DateTime.now().difference(handlerStartTime);
          _logger.info('✅ [HTTP-SERVER-PHASE-5] Route handler completed in ${handlerTime.inMilliseconds}ms. Status: ${response.status.code}');
        } catch (e, stackTrace) {
          _logger.severe('❌ [HTTP-SERVER-PHASE-5] Route handler error: $e\n$stackTrace');
          response = HttpResponse.error(HttpStatus.internalServerError, 'Internal server error');
        }
      } else {
        _logger.warning('❌ [HTTP-SERVER-PHASE-4] No route found for ${request.method.value} ${request.path}');
        response = HttpResponse.error(HttpStatus.notFound, 'Not found');
      }

      // Phase 6: Response Preparation
      _logger.info('📝 [HTTP-SERVER-PHASE-6] Preparing HTTP response');
      final prepStartTime = DateTime.now();
      
      // Add default headers
      for (final entry in _defaultHeaders.entries) {
        response.headers.putIfAbsent(entry.key, () => entry.value);
      }

      // Serialize response
      final responseData = response.serialize();
      final prepTime = DateTime.now().difference(prepStartTime);
      _logger.info('✅ [HTTP-SERVER-PHASE-6] Response prepared in ${prepTime.inMilliseconds}ms. Size: ${responseData.length} bytes');

      // Phase 7: Send Response
      _logger.info('📤 [HTTP-SERVER-PHASE-7] Sending HTTP response');
      final sendStartTime = DateTime.now();
      
      await stream.write(responseData);
      
      final sendTime = DateTime.now().difference(sendStartTime);
      final totalTime = DateTime.now().difference(startTime);
      _logger.info('✅ [HTTP-SERVER-PHASE-7] Response sent in ${sendTime.inMilliseconds}ms');
      _logger.info('🎉 [HTTP-SERVER-COMPLETE] Total server processing time: ${totalTime.inMilliseconds}ms. Status: ${response.status.code} ${response.status.message}');

    } catch (e, stackTrace) {
      final totalTime = DateTime.now().difference(startTime);
      _logger.severe('❌ [HTTP-SERVER-ERROR] Error handling HTTP request from peer ${peerId.toString()} after ${totalTime.inMilliseconds}ms: $e\n$stackTrace');
      
      try {
        // Send error response if possible
        _logger.info('🚨 [HTTP-SERVER-ERROR] Attempting to send error response');
        final errorResponse = HttpResponse.error(HttpStatus.internalServerError);
        final errorData = errorResponse.serialize();
        await stream.write(errorData);
        _logger.info('✅ [HTTP-SERVER-ERROR] Error response sent successfully');
      } catch (sendError) {
        _logger.severe('❌ [HTTP-SERVER-ERROR] Failed to send error response: $sendError');
      }
    } finally {
      // Phase 8: Cleanup
      try {
        _logger.info('🔒 [HTTP-SERVER-CLEANUP] Closing stream');
        await stream.close();
        _logger.info('✅ [HTTP-SERVER-CLEANUP] Stream closed successfully');
      } catch (e) {
        _logger.warning('⚠️ [HTTP-SERVER-CLEANUP] Error closing stream: $e');
      }
    }
  }

  /// Find a route that matches the given method and path
  HttpRoute? _findRoute(HttpMethod method, String path) {
    for (final route in _routes) {
      if (route.matches(method, path)) {
        return route;
      }
    }
    return null;
  }

  /// Read a complete HTTP message from the stream
  Future<Uint8List> _readHttpMessage(P2PStream stream) async {
    final startTime = DateTime.now();
    _logger.info('📖 [HTTP-READ-START] Starting to read HTTP message from stream ${stream.id}');
    
    final buffer = <int>[];
    final headerSeparatorBytes = utf8.encode(HttpProtocolConstants.headerSeparator);
    int headerEndIndex = -1;
    int contentLength = 0;
    bool headersComplete = false;
    int readIterations = 0;

    // Read until we have complete headers
    _logger.info('📖 [HTTP-READ-HEADERS] Reading HTTP headers...');
    while (!headersComplete) {
      readIterations++;
      _logger.fine('📖 [HTTP-READ-HEADERS] Read iteration $readIterations - calling stream.read()');
      
      final readStartTime = DateTime.now();
      final chunk = await stream.read();
      final readTime = DateTime.now().difference(readStartTime);
      
      _logger.fine('📖 [HTTP-READ-HEADERS] Read iteration $readIterations completed in ${readTime.inMilliseconds}ms. Chunk size: ${chunk.length} bytes');
      
      if (chunk.isEmpty) {
        _logger.warning('📖 [HTTP-READ-HEADERS] Received empty chunk on iteration $readIterations, breaking header read loop');
        break;
      }

      buffer.addAll(chunk);
      _logger.fine('📖 [HTTP-READ-HEADERS] Buffer size after iteration $readIterations: ${buffer.length} bytes');

      // Look for header separator
      if (headerEndIndex == -1) {
        final bufferBytes = Uint8List.fromList(buffer);
        final separatorIndex = _findSequence(bufferBytes, headerSeparatorBytes);
        if (separatorIndex != -1) {
          headerEndIndex = separatorIndex;
          headersComplete = true;
          _logger.info('📖 [HTTP-READ-HEADERS] Found header separator at index $headerEndIndex after $readIterations iterations');

          // Parse headers to get content length
          final headerSection = utf8.decode(bufferBytes.sublist(0, headerEndIndex));
          final lines = headerSection.split(HttpProtocolConstants.crlf);
          
          for (final line in lines) {
            if (line.toLowerCase().startsWith('content-length:')) {
              final lengthStr = line.substring('content-length:'.length).trim();
              contentLength = int.tryParse(lengthStr) ?? 0;
              _logger.info('📖 [HTTP-READ-HEADERS] Found content-length header: $contentLength bytes');
              break;
            }
          }
          
          if (contentLength == 0) {
            _logger.info('📖 [HTTP-READ-HEADERS] No content-length header found or content-length is 0');
          }
        } else {
          _logger.fine('📖 [HTTP-READ-HEADERS] Header separator not found yet, buffer size: ${buffer.length}');
        }
      }

      // Prevent excessive memory usage
      if (buffer.length > HttpProtocolConstants.maxHeaderSize && !headersComplete) {
        _logger.severe('📖 [HTTP-READ-HEADERS] Headers too large: ${buffer.length} bytes > ${HttpProtocolConstants.maxHeaderSize}');
        throw FormatException('HTTP headers too large');
      }
    }

    final headerReadTime = DateTime.now().difference(startTime);
    _logger.info('📖 [HTTP-READ-HEADERS] Header reading completed in ${headerReadTime.inMilliseconds}ms after $readIterations iterations');

    // Read body if content length is specified
    if (contentLength > 0) {
      _logger.info('📖 [HTTP-READ-BODY] Reading HTTP body ($contentLength bytes)...');
      final bodyStartIndex = headerEndIndex + headerSeparatorBytes.length;
      final currentBodyLength = buffer.length - bodyStartIndex;
      
      _logger.info('📖 [HTTP-READ-BODY] Body start index: $bodyStartIndex, current body length: $currentBodyLength');
      
      if (contentLength > HttpProtocolConstants.maxBodySize) {
        _logger.severe('📖 [HTTP-READ-BODY] Body too large: $contentLength bytes > ${HttpProtocolConstants.maxBodySize}');
        throw FormatException('HTTP body too large');
      }

      // Read remaining body data
      int bodyReadIterations = 0;
      while (buffer.length - bodyStartIndex < contentLength) {
        bodyReadIterations++;
        final remainingBytes = contentLength - (buffer.length - bodyStartIndex);
        _logger.fine('📖 [HTTP-READ-BODY] Body read iteration $bodyReadIterations - need $remainingBytes more bytes');
        
        final bodyReadStartTime = DateTime.now();
        final chunk = await stream.read();
        final bodyReadTime = DateTime.now().difference(bodyReadStartTime);
        
        _logger.fine('📖 [HTTP-READ-BODY] Body read iteration $bodyReadIterations completed in ${bodyReadTime.inMilliseconds}ms. Chunk size: ${chunk.length} bytes');
        
        if (chunk.isEmpty) {
          _logger.warning('📖 [HTTP-READ-BODY] Received empty chunk during body read iteration $bodyReadIterations, breaking body read loop');
          break;
        }
        
        buffer.addAll(chunk);
      }
      
      final finalBodyLength = buffer.length - bodyStartIndex;
      _logger.info('📖 [HTTP-READ-BODY] Body reading completed after $bodyReadIterations iterations. Final body length: $finalBodyLength bytes');
    } else {
      _logger.info('📖 [HTTP-READ-BODY] No body to read (content-length: $contentLength)');
    }

    final totalTime = DateTime.now().difference(startTime);
    final result = Uint8List.fromList(buffer);
    _logger.info('📖 [HTTP-READ-COMPLETE] HTTP message reading completed in ${totalTime.inMilliseconds}ms. Total size: ${result.length} bytes');
    
    return result;
  }

  /// Find a byte sequence within a larger byte array
  int _findSequence(Uint8List haystack, Uint8List needle) {
    for (int i = 0; i <= haystack.length - needle.length; i++) {
      bool found = true;
      for (int j = 0; j < needle.length; j++) {
        if (haystack[i + j] != needle[j]) {
          found = false;
          break;
        }
      }
      if (found) return i;
    }
    return -1;
  }

  /// Make an HTTP request to a peer
  Future<HttpResponse> request(
    PeerId peerId,
    HttpMethod method,
    String path, {
    Map<String, String>? headers,
    Uint8List? body,
    Duration? timeout,
  }) async {
    final startTime = DateTime.now();
    _logger.info('🚀 [HTTP-REQUEST-START] Making HTTP request to peer ${peerId.toString()}: ${method.value} $path');

    // Phase 1: Stream Creation
    _logger.info('📡 [HTTP-REQUEST-PHASE-1] Creating new stream to peer ${peerId.toString()}');
    final streamStartTime = DateTime.now();
    
    final stream = await host.newStream(
      peerId,
      [HttpProtocolConstants.protocolId],
      Context(),
    );
    
    final streamCreationTime = DateTime.now().difference(streamStartTime);
    _logger.info('✅ [HTTP-REQUEST-PHASE-1] Stream created successfully in ${streamCreationTime.inMilliseconds}ms. Stream ID: ${stream.id}');

    try {
      // Phase 2: Stream Setup
      _logger.info('⚙️ [HTTP-REQUEST-PHASE-2] Setting up stream service and deadline');
      stream.scope().setService(HttpProtocolConstants.serviceName);
      
      final requestTimeout = timeout ?? HttpProtocolConstants.responseTimeout;
      await stream.setDeadline(DateTime.now().add(requestTimeout));
      _logger.info('✅ [HTTP-REQUEST-PHASE-2] Stream setup completed with timeout: ${requestTimeout.inSeconds}s');

      // Phase 3: Request Creation and Serialization
      _logger.info('📝 [HTTP-REQUEST-PHASE-3] Creating and serializing HTTP request');
      final requestCreateStartTime = DateTime.now();
      
      final request = HttpRequest(
        method: method,
        path: path,
        headers: headers ?? {},
        body: body,
        remotePeer: host.id,
      );

      final requestData = request.serialize();
      final requestCreateTime = DateTime.now().difference(requestCreateStartTime);
      _logger.info('✅ [HTTP-REQUEST-PHASE-3] Request serialized in ${requestCreateTime.inMilliseconds}ms. Size: ${requestData.length} bytes');

      // Phase 4: Send Request
      _logger.info('📤 [HTTP-REQUEST-PHASE-4] Sending HTTP request data to stream');
      final sendStartTime = DateTime.now();
      
      await stream.write(requestData);
      
      final sendTime = DateTime.now().difference(sendStartTime);
      _logger.info('✅ [HTTP-REQUEST-PHASE-4] Request sent successfully in ${sendTime.inMilliseconds}ms');

      // Phase 5: Read Response
      _logger.info('📥 [HTTP-REQUEST-PHASE-5] Reading HTTP response from stream');
      final readStartTime = DateTime.now();
      
      final responseData = await _readHttpMessage(stream);
      
      final readTime = DateTime.now().difference(readStartTime);
      _logger.info('✅ [HTTP-REQUEST-PHASE-5] Response data read in ${readTime.inMilliseconds}ms. Size: ${responseData.length} bytes');
      
      if (responseData.isEmpty) {
        throw Exception('Received empty response');
      }

      // Phase 6: Parse Response
      _logger.info('🔍 [HTTP-REQUEST-PHASE-6] Parsing HTTP response');
      final parseStartTime = DateTime.now();
      
      final response = HttpResponse.parse(responseData);
      
      final parseTime = DateTime.now().difference(parseStartTime);
      final totalTime = DateTime.now().difference(startTime);
      _logger.info('✅ [HTTP-REQUEST-PHASE-6] Response parsed in ${parseTime.inMilliseconds}ms');
      _logger.info('🎉 [HTTP-REQUEST-COMPLETE] Total request time: ${totalTime.inMilliseconds}ms. Status: ${response.status.code} ${response.status.message}');
      
      return response;

    } catch (e, stackTrace) {
      final totalTime = DateTime.now().difference(startTime);
      _logger.severe('❌ [HTTP-REQUEST-ERROR] Request failed after ${totalTime.inMilliseconds}ms: $e\n$stackTrace');
      rethrow;
    } finally {
      try {
        _logger.info('🔒 [HTTP-REQUEST-CLEANUP] Closing stream');
        await stream.close();
        _logger.info('✅ [HTTP-REQUEST-CLEANUP] Stream closed successfully');
      } catch (e) {
        _logger.warning('⚠️ [HTTP-REQUEST-CLEANUP] Error closing request stream: $e');
      }
    }
  }

  /// Convenience methods for making requests
  Future<HttpResponse> getRequest(PeerId peerId, String path, {Map<String, String>? headers}) {
    return request(peerId, HttpMethod.get, path, headers: headers);
  }

  Future<HttpResponse> postRequest(PeerId peerId, String path, {Map<String, String>? headers, Uint8List? body}) {
    return request(peerId, HttpMethod.post, path, headers: headers, body: body);
  }

  Future<HttpResponse> postJson(PeerId peerId, String path, Map<String, dynamic> data) {
    final body = utf8.encode(jsonEncode(data));
    final headers = {'content-type': 'application/json'};
    return request(peerId, HttpMethod.post, path, headers: headers, body: body);
  }
}
