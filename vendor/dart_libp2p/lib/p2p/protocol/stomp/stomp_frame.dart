import 'dart:convert';
import 'dart:typed_data';

import 'stomp_constants.dart';
import 'stomp_exceptions.dart';

/// Represents a STOMP frame with command, headers, and body
class StompFrame {
  final String command;
  final Map<String, String> headers;
  final Uint8List? body;

  StompFrame({
    required this.command,
    Map<String, String>? headers,
    this.body,
  }) : headers = headers ?? <String, String>{};

  /// Creates a STOMP frame from raw bytes
  static StompFrame fromBytes(Uint8List data) {
    return StompFrameParser.parse(data);
  }

  /// Converts the frame to bytes for transmission
  Uint8List toBytes() {
    return StompFrameSerializer.serialize(this);
  }

  /// Gets a header value
  String? getHeader(String name) {
    return headers[name];
  }

  /// Sets a header value
  void setHeader(String name, String value) {
    headers[name] = value;
  }

  /// Removes a header
  void removeHeader(String name) {
    headers.remove(name);
  }

  /// Gets the body as a string (UTF-8 decoded)
  String? getBodyAsString() {
    if (body == null) return null;
    return utf8.decode(body!);
  }

  /// Sets the body from a string (UTF-8 encoded)
  void setBodyFromString(String content) {
    final bytes = utf8.encode(content);
    setHeader(StompHeaders.contentLength, bytes.length.toString());
  }

  /// Gets the content length from headers
  int? getContentLength() {
    final lengthStr = getHeader(StompHeaders.contentLength);
    if (lengthStr == null) return null;
    return int.tryParse(lengthStr);
  }

  /// Validates the frame according to STOMP specification
  void validate() {
    StompFrameValidator.validate(this);
  }

  /// Creates a copy of this frame
  StompFrame copy() {
    return StompFrame(
      command: command,
      headers: Map<String, String>.from(headers),
      body: body != null ? Uint8List.fromList(body!) : null,
    );
  }

  @override
  String toString() {
    final buffer = StringBuffer();
    buffer.writeln('StompFrame {');
    buffer.writeln('  command: $command');
    buffer.writeln('  headers: {');
    for (final entry in headers.entries) {
      buffer.writeln('    ${entry.key}: ${entry.value}');
    }
    buffer.writeln('  }');
    if (body != null) {
      buffer.writeln('  body: ${body!.length} bytes');
    } else {
      buffer.writeln('  body: null');
    }
    buffer.write('}');
    return buffer.toString();
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! StompFrame) return false;
    
    if (command != other.command) return false;
    if (headers.length != other.headers.length) return false;
    
    for (final entry in headers.entries) {
      if (other.headers[entry.key] != entry.value) return false;
    }
    
    if (body == null && other.body == null) return true;
    if (body == null || other.body == null) return false;
    if (body!.length != other.body!.length) return false;
    
    for (int i = 0; i < body!.length; i++) {
      if (body![i] != other.body![i]) return false;
    }
    
    return true;
  }

  @override
  int get hashCode {
    var hash = command.hashCode;
    for (final entry in headers.entries) {
      hash ^= entry.key.hashCode ^ entry.value.hashCode;
    }
    if (body != null) {
      for (final byte in body!) {
        hash ^= byte.hashCode;
      }
    }
    return hash;
  }
}

/// Parser for STOMP frames
class StompFrameParser {
  /// Parses a STOMP frame from bytes
  static StompFrame parse(Uint8List data) {
    if (data.isEmpty) {
      throw const StompFrameException('Empty frame data');
    }

    var position = 0;

    // Parse command
    final commandEnd = _findLineEnd(data, position);
    if (commandEnd == -1) {
      throw const StompFrameException('No command line found');
    }

    final command = _extractLine(data, position, commandEnd);
    if (command.isEmpty) {
      throw const StompFrameException('Empty command');
    }

    position = commandEnd + 1;
    if (position < data.length && data[position - 1] == StompConstants.carriageReturn) {
      position++; // Skip LF after CR
    }

    // Parse headers
    final headers = <String, String>{};
    while (position < data.length) {
      final lineEnd = _findLineEnd(data, position);
      if (lineEnd == -1) {
        throw const StompFrameException('Malformed headers section');
      }

      final line = _extractLine(data, position, lineEnd);
      
      // Empty line indicates end of headers
      if (line.isEmpty) {
        position = lineEnd + 1;
        if (position < data.length && data[position - 1] == StompConstants.carriageReturn) {
          position++; // Skip LF after CR
        }
        break;
      }

      // Parse header
      final colonIndex = line.indexOf(':');
      if (colonIndex == -1) {
        throw StompFrameException('Invalid header format: $line');
      }

      final name = line.substring(0, colonIndex);
      final value = line.substring(colonIndex + 1);

      // Handle repeated headers (use first occurrence)
      if (!headers.containsKey(name)) {
        headers[name] = _shouldEscapeHeaders(command) ? StompEscaping.unescape(value) : value;
      }

      position = lineEnd + 1;
      if (position < data.length && data[position - 1] == StompConstants.carriageReturn) {
        position++; // Skip LF after CR
      }
    }

    // Parse body
    Uint8List? body;
    if (position < data.length) {
      // Find NULL terminator
      var bodyEnd = data.length;
      for (int i = position; i < data.length; i++) {
        if (data[i] == StompConstants.nullByte) {
          bodyEnd = i;
          break;
        }
      }

      if (bodyEnd == data.length) {
        throw const StompFrameException('Frame not terminated with NULL byte');
      }

      // Check content-length if specified
      final contentLengthStr = headers[StompHeaders.contentLength];
      if (contentLengthStr != null) {
        final contentLength = int.tryParse(contentLengthStr);
        if (contentLength == null || contentLength < 0) {
          throw StompFrameException('Invalid content-length: $contentLengthStr');
        }
        
        if (position + contentLength > bodyEnd) {
          throw const StompFrameException('Content-length exceeds available body data');
        }
        
        bodyEnd = position + contentLength;
      }

      if (bodyEnd > position) {
        body = Uint8List.fromList(data.sublist(position, bodyEnd));
      }
    }

    final frame = StompFrame(
      command: command,
      headers: headers,
      body: body,
    );

    frame.validate();
    return frame;
  }

  static int _findLineEnd(Uint8List data, int start) {
    for (int i = start; i < data.length; i++) {
      if (data[i] == StompConstants.lineFeed) {
        return i;
      }
    }
    return -1;
  }

  static String _extractLine(Uint8List data, int start, int end) {
    var actualEnd = end;
    // Handle CRLF
    if (actualEnd > start && data[actualEnd - 1] == StompConstants.carriageReturn) {
      actualEnd--;
    }
    
    if (actualEnd <= start) return '';
    
    try {
      return utf8.decode(data.sublist(start, actualEnd));
    } catch (e) {
      throw StompFrameException('Invalid UTF-8 in frame line', e);
    }
  }

  static bool _shouldEscapeHeaders(String command) {
    // CONNECT and CONNECTED frames don't escape headers for backward compatibility
    return command != StompCommands.connect && command != StompCommands.connected;
  }
}

/// Serializer for STOMP frames
class StompFrameSerializer {
  /// Serializes a STOMP frame to bytes
  static Uint8List serialize(StompFrame frame) {
    frame.validate();

    final buffer = <int>[];

    // Add command
    buffer.addAll(utf8.encode(frame.command));
    buffer.add(StompConstants.lineFeed);

    // Add headers
    for (final entry in frame.headers.entries) {
      buffer.addAll(utf8.encode(entry.key));
      buffer.add(58); // ':'
      
      final value = _shouldEscapeHeaders(frame.command) 
          ? StompEscaping.escape(entry.value)
          : entry.value;
      buffer.addAll(utf8.encode(value));
      buffer.add(StompConstants.lineFeed);
    }

    // Add empty line to separate headers from body
    buffer.add(StompConstants.lineFeed);

    // Add body
    if (frame.body != null) {
      buffer.addAll(frame.body!);
    }

    // Add NULL terminator
    buffer.add(StompConstants.nullByte);

    return Uint8List.fromList(buffer);
  }

  static bool _shouldEscapeHeaders(String command) {
    // CONNECT and CONNECTED frames don't escape headers for backward compatibility
    return command != StompCommands.connect && command != StompCommands.connected;
  }
}

/// Validator for STOMP frames
class StompFrameValidator {
  /// Validates a STOMP frame according to STOMP specification
  static void validate(StompFrame frame) {
    _validateCommand(frame.command);
    _validateHeaders(frame);
    _validateBody(frame);
    _validateFrameSize(frame);
  }

  static void _validateCommand(String command) {
    if (command.isEmpty) {
      throw const StompFrameException('Command cannot be empty');
    }

    if (!StompCommands.isClientCommand(command) && !StompCommands.isServerCommand(command)) {
      throw StompFrameException('Unknown command: $command');
    }
  }

  static void _validateHeaders(StompFrame frame) {
    if (frame.headers.length > StompConstants.maxHeaders) {
      throw StompFrameSizeException(
        'Too many headers',
        frame.headers.length,
        StompConstants.maxHeaders,
      );
    }

    for (final entry in frame.headers.entries) {
      if (entry.key.isEmpty) {
        throw const StompFrameException('Header name cannot be empty');
      }

      if (entry.key.length > StompConstants.maxHeaderLength) {
        throw StompFrameSizeException(
          'Header name too long: ${entry.key}',
          entry.key.length,
          StompConstants.maxHeaderLength,
        );
      }

      if (entry.value.length > StompConstants.maxHeaderLength) {
        throw StompFrameSizeException(
          'Header value too long for ${entry.key}',
          entry.value.length,
          StompConstants.maxHeaderLength,
        );
      }

      // Validate header name doesn't contain invalid characters
      if (entry.key.contains(':') || entry.key.contains('\n') || entry.key.contains('\r')) {
        throw StompFrameException('Invalid characters in header name: ${entry.key}');
      }
    }

    _validateRequiredHeaders(frame);
  }

  static void _validateRequiredHeaders(StompFrame frame) {
    switch (frame.command) {
      case StompCommands.connect:
      case StompCommands.stomp:
        _requireHeader(frame, StompHeaders.acceptVersion);
        _requireHeader(frame, StompHeaders.host);
        break;
      case StompCommands.connected:
        _requireHeader(frame, StompHeaders.version);
        break;
      case StompCommands.send:
        _requireHeader(frame, StompHeaders.destination);
        break;
      case StompCommands.subscribe:
        _requireHeader(frame, StompHeaders.destination);
        _requireHeader(frame, StompHeaders.id);
        break;
      case StompCommands.unsubscribe:
        _requireHeader(frame, StompHeaders.id);
        break;
      case StompCommands.ack:
      case StompCommands.nack:
        _requireHeader(frame, StompHeaders.id);
        break;
      case StompCommands.begin:
      case StompCommands.commit:
      case StompCommands.abort:
        _requireHeader(frame, StompHeaders.transaction);
        break;
      case StompCommands.message:
        _requireHeader(frame, StompHeaders.destination);
        _requireHeader(frame, StompHeaders.messageId);
        _requireHeader(frame, StompHeaders.subscription);
        break;
      case StompCommands.receipt:
        _requireHeader(frame, StompHeaders.receiptId);
        break;
    }
  }

  static void _requireHeader(StompFrame frame, String headerName) {
    if (!frame.headers.containsKey(headerName)) {
      throw StompFrameException('Required header missing: $headerName');
    }
  }

  static void _validateBody(StompFrame frame) {
    // Only certain frames can have a body
    final canHaveBody = [
      StompCommands.send,
      StompCommands.message,
      StompCommands.error,
    ].contains(frame.command);

    if (!canHaveBody && frame.body != null && frame.body!.isNotEmpty) {
      throw StompFrameException('Frame ${frame.command} cannot have a body');
    }

    if (frame.body != null && frame.body!.length > StompConstants.maxBodySize) {
      throw StompFrameSizeException(
        'Body too large',
        frame.body!.length,
        StompConstants.maxBodySize,
      );
    }

    // Validate content-length if present
    final contentLengthStr = frame.getHeader(StompHeaders.contentLength);
    if (contentLengthStr != null) {
      final contentLength = int.tryParse(contentLengthStr);
      if (contentLength == null || contentLength < 0) {
        throw StompFrameException('Invalid content-length: $contentLengthStr');
      }

      if (frame.body != null && frame.body!.length != contentLength) {
        throw StompFrameException(
          'Body length (${frame.body!.length}) does not match content-length ($contentLength)'
        );
      }
    }
  }

  static void _validateFrameSize(StompFrame frame) {
    final frameBytes = frame.toBytes();
    if (frameBytes.length > StompConstants.maxFrameSize) {
      throw StompFrameSizeException(
        'Frame too large',
        frameBytes.length,
        StompConstants.maxFrameSize,
      );
    }
  }
}

/// Factory methods for creating common STOMP frames
class StompFrameFactory {
  /// Creates a CONNECT frame
  static StompFrame connect({
    required String host,
    String acceptVersion = StompConstants.version,
    String? login,
    String? passcode,
    String heartBeat = StompConstants.defaultHeartBeat,
    Map<String, String>? additionalHeaders,
  }) {
    final headers = <String, String>{
      StompHeaders.acceptVersion: acceptVersion,
      StompHeaders.host: host,
      StompHeaders.heartBeat: heartBeat,
    };

    if (login != null) headers[StompHeaders.login] = login;
    if (passcode != null) headers[StompHeaders.passcode] = passcode;
    if (additionalHeaders != null) headers.addAll(additionalHeaders);

    return StompFrame(command: StompCommands.connect, headers: headers);
  }

  /// Creates a CONNECTED frame
  static StompFrame connected({
    String version = StompConstants.version,
    String? session,
    String? server,
    String heartBeat = StompConstants.defaultHeartBeat,
    Map<String, String>? additionalHeaders,
  }) {
    final headers = <String, String>{
      StompHeaders.version: version,
      StompHeaders.heartBeat: heartBeat,
    };

    if (session != null) headers[StompHeaders.session] = session;
    if (server != null) headers[StompHeaders.server] = server;
    if (additionalHeaders != null) headers.addAll(additionalHeaders);

    return StompFrame(command: StompCommands.connected, headers: headers);
  }

  /// Creates a SEND frame
  static StompFrame send({
    required String destination,
    String? body,
    Uint8List? bodyBytes,
    String? contentType,
    String? receipt,
    String? transaction,
    Map<String, String>? additionalHeaders,
  }) {
    final headers = <String, String>{
      StompHeaders.destination: destination,
    };

    if (contentType != null) headers[StompHeaders.contentType] = contentType;
    if (receipt != null) headers[StompHeaders.receipt] = receipt;
    if (transaction != null) headers[StompHeaders.transaction] = transaction;
    if (additionalHeaders != null) headers.addAll(additionalHeaders);

    Uint8List? frameBody;
    if (body != null) {
      frameBody = Uint8List.fromList(utf8.encode(body));
    } else if (bodyBytes != null) {
      frameBody = bodyBytes;
    }

    if (frameBody != null) {
      headers[StompHeaders.contentLength] = frameBody.length.toString();
    }

    return StompFrame(command: StompCommands.send, headers: headers, body: frameBody);
  }

  /// Creates a SUBSCRIBE frame
  static StompFrame subscribe({
    required String destination,
    required String id,
    String ack = StompHeaders.ackAuto,
    String? receipt,
    Map<String, String>? additionalHeaders,
  }) {
    final headers = <String, String>{
      StompHeaders.destination: destination,
      StompHeaders.id: id,
      StompHeaders.ack: ack,
    };

    if (receipt != null) headers[StompHeaders.receipt] = receipt;
    if (additionalHeaders != null) headers.addAll(additionalHeaders);

    return StompFrame(command: StompCommands.subscribe, headers: headers);
  }

  /// Creates an UNSUBSCRIBE frame
  static StompFrame unsubscribe({
    required String id,
    String? receipt,
    Map<String, String>? additionalHeaders,
  }) {
    final headers = <String, String>{
      StompHeaders.id: id,
    };

    if (receipt != null) headers[StompHeaders.receipt] = receipt;
    if (additionalHeaders != null) headers.addAll(additionalHeaders);

    return StompFrame(command: StompCommands.unsubscribe, headers: headers);
  }

  /// Creates an ACK frame
  static StompFrame ack({
    required String id,
    String? transaction,
    String? receipt,
    Map<String, String>? additionalHeaders,
  }) {
    final headers = <String, String>{
      StompHeaders.id: id,
    };

    if (transaction != null) headers[StompHeaders.transaction] = transaction;
    if (receipt != null) headers[StompHeaders.receipt] = receipt;
    if (additionalHeaders != null) headers.addAll(additionalHeaders);

    return StompFrame(command: StompCommands.ack, headers: headers);
  }

  /// Creates a NACK frame
  static StompFrame nack({
    required String id,
    String? transaction,
    String? receipt,
    Map<String, String>? additionalHeaders,
  }) {
    final headers = <String, String>{
      StompHeaders.id: id,
    };

    if (transaction != null) headers[StompHeaders.transaction] = transaction;
    if (receipt != null) headers[StompHeaders.receipt] = receipt;
    if (additionalHeaders != null) headers.addAll(additionalHeaders);

    return StompFrame(command: StompCommands.nack, headers: headers);
  }

  /// Creates a DISCONNECT frame
  static StompFrame disconnect({
    String? receipt,
    Map<String, String>? additionalHeaders,
  }) {
    final headers = <String, String>{};

    if (receipt != null) headers[StompHeaders.receipt] = receipt;
    if (additionalHeaders != null) headers.addAll(additionalHeaders);

    return StompFrame(command: StompCommands.disconnect, headers: headers);
  }

  /// Creates an ERROR frame
  static StompFrame error({
    required String message,
    String? receiptId,
    String? body,
    Uint8List? bodyBytes,
    Map<String, String>? additionalHeaders,
  }) {
    final headers = <String, String>{
      StompHeaders.message: message,
    };

    if (receiptId != null) headers[StompHeaders.receiptId] = receiptId;
    if (additionalHeaders != null) headers.addAll(additionalHeaders);

    Uint8List? frameBody;
    if (body != null) {
      frameBody = Uint8List.fromList(utf8.encode(body));
    } else if (bodyBytes != null) {
      frameBody = bodyBytes;
    }

    if (frameBody != null) {
      headers[StompHeaders.contentLength] = frameBody.length.toString();
      headers[StompHeaders.contentType] = 'text/plain';
    }

    return StompFrame(command: StompCommands.error, headers: headers, body: frameBody);
  }
}
