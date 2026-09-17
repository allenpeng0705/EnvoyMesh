/// Constants for the STOMP protocol implementation.

/// Protocol IDs for STOMP
class StompProtocols {
  static const String stomp = '/libp2p/stomp/1.2.0';
  static const String serviceName = 'libp2p.stomp';
}

/// STOMP frame commands
class StompCommands {
  // Client commands
  static const String connect = 'CONNECT';
  static const String stomp = 'STOMP';
  static const String send = 'SEND';
  static const String subscribe = 'SUBSCRIBE';
  static const String unsubscribe = 'UNSUBSCRIBE';
  static const String ack = 'ACK';
  static const String nack = 'NACK';
  static const String begin = 'BEGIN';
  static const String commit = 'COMMIT';
  static const String abort = 'ABORT';
  static const String disconnect = 'DISCONNECT';

  // Server commands
  static const String connected = 'CONNECTED';
  static const String message = 'MESSAGE';
  static const String receipt = 'RECEIPT';
  static const String error = 'ERROR';

  /// Returns true if the command is a client command
  static bool isClientCommand(String command) {
    return [
      connect,
      stomp,
      send,
      subscribe,
      unsubscribe,
      ack,
      nack,
      begin,
      commit,
      abort,
      disconnect,
    ].contains(command);
  }

  /// Returns true if the command is a server command
  static bool isServerCommand(String command) {
    return [
      connected,
      message,
      receipt,
      error,
    ].contains(command);
  }
}

/// STOMP header names
class StompHeaders {
  // Connection headers
  static const String acceptVersion = 'accept-version';
  static const String host = 'host';
  static const String login = 'login';
  static const String passcode = 'passcode';
  static const String heartBeat = 'heart-beat';
  static const String version = 'version';
  static const String session = 'session';
  static const String server = 'server';

  // Message headers
  static const String destination = 'destination';
  static const String contentLength = 'content-length';
  static const String contentType = 'content-type';
  static const String receipt = 'receipt';
  static const String receiptId = 'receipt-id';
  static const String messageId = 'message-id';
  static const String subscription = 'subscription';
  static const String ack = 'ack';
  static const String id = 'id';
  static const String transaction = 'transaction';
  static const String message = 'message';

  // Acknowledgment modes
  static const String ackAuto = 'auto';
  static const String ackClient = 'client';
  static const String ackClientIndividual = 'client-individual';
}

/// STOMP protocol constants
class StompConstants {
  /// Supported STOMP version
  static const String version = '1.2';

  /// Default timeout for STOMP operations
  static const Duration defaultTimeout = Duration(seconds: 30);

  /// Maximum frame size
  static const int maxFrameSize = 64 * 1024; // 64KB

  /// Maximum number of headers per frame
  static const int maxHeaders = 100;

  /// Maximum header line length
  static const int maxHeaderLength = 1024;

  /// Maximum body size
  static const int maxBodySize = 8 * 1024 * 1024; // 8MB

  /// Frame delimiters
  static const int nullByte = 0;
  static const int lineFeed = 10;
  static const int carriageReturn = 13;

  /// Default heart-beat settings (0,0 means no heart-beating)
  static const String defaultHeartBeat = '0,0';

  /// Maximum number of concurrent subscriptions
  static const int maxSubscriptions = 1000;

  /// Maximum number of concurrent transactions
  static const int maxTransactions = 100;
}

/// STOMP escape sequences for header values
class StompEscaping {
  /// Escape sequences mapping
  static const Map<String, String> escapeSequences = {
    '\r': r'\r',
    '\n': r'\n',
    ':': r'\c',
    '\\': r'\\',
  };

  /// Reverse escape sequences mapping
  static const Map<String, String> unescapeSequences = {
    r'\r': '\r',
    r'\n': '\n',
    r'\c': ':',
    r'\\': '\\',
  };

  /// Escapes header value according to STOMP specification
  static String escape(String value) {
    var result = value;
    for (final entry in escapeSequences.entries) {
      result = result.replaceAll(entry.key, entry.value);
    }
    return result;
  }

  /// Unescapes header value according to STOMP specification
  static String unescape(String value) {
    var result = value;
    for (final entry in unescapeSequences.entries) {
      result = result.replaceAll(entry.key, entry.value);
    }
    return result;
  }
}
