import 'dart:async';
import 'dart:math';
import 'dart:typed_data';

import 'package:logging/logging.dart';

import '../../../core/interfaces.dart';
import '../../../core/peer/peer_id.dart';
import 'stomp_constants.dart';
import 'stomp_exceptions.dart';
import 'stomp_frame.dart';
import 'stomp_subscription.dart';
import 'stomp_transaction.dart';

final _logger = Logger('stomp.server');

/// STOMP server connection state
enum StompServerConnectionState {
  connecting,
  connected,
  disconnecting,
  disconnected,
  error
}

/// Represents a client connection to the STOMP server
class StompServerConnection {
  final PeerId peerId;
  final P2PStream stream;
  final String sessionId;
  final DateTime connectedAt;
  final Map<String, String> clientHeaders;

  StompServerConnectionState _state = StompServerConnectionState.connecting;
  final StompSubscriptionManager _subscriptionManager = StompSubscriptionManager();
  final StompTransactionManager _transactionManager = StompTransactionManager();
  final StompAckManager _ackManager = StompAckManager();

  // Frame processing
  final StreamController<StompFrame> _frameController = StreamController<StompFrame>.broadcast();
  final List<int> _readBuffer = [];

  StompServerConnection({
    required this.peerId,
    required this.stream,
    required this.sessionId,
    required this.clientHeaders,
  }) : connectedAt = DateTime.now();

  /// Current connection state
  StompServerConnectionState get state => _state;

  /// Whether the connection is active
  bool get isActive => _state == StompServerConnectionState.connected;

  /// Subscription manager for this connection
  StompSubscriptionManager get subscriptions => _subscriptionManager;

  /// Transaction manager for this connection
  StompTransactionManager get transactions => _transactionManager;

  /// Acknowledgment manager for this connection
  StompAckManager get acknowledgments => _ackManager;

  /// Stream of frames from this connection
  Stream<StompFrame> get onFrame => _frameController.stream;

  /// Sets the connection state
  void setState(StompServerConnectionState newState) {
    _state = newState;
  }

  /// Sends a frame to the client
  Future<void> sendFrame(StompFrame frame) async {
    if (stream.isClosed) {
      throw const StompConnectionException('Connection is closed');
    }

    final frameBytes = frame.toBytes();
    await stream.write(frameBytes);
    _logger.finest('Sent frame to ${peerId}: ${frame.command}');
  }

  /// Starts reading frames from the client
  void startReading() {
    _readFrames().catchError((e) {
      _logger.warning('Error reading frames from ${peerId}: $e');
      setState(StompServerConnectionState.error);
    });
  }

  Future<void> _readFrames() async {
    while (!stream.isClosed && _state != StompServerConnectionState.disconnected) {
      try {
        final data = await stream.read();
        if (data.isEmpty) break; // EOF

        _readBuffer.addAll(data);

        // Look for complete frames (terminated by NULL byte)
        while (true) {
          final nullIndex = _readBuffer.indexOf(StompConstants.nullByte);
          if (nullIndex == -1) break; // No complete frame yet

          // Extract frame data including the NULL byte
          final frameData = Uint8List.fromList(_readBuffer.sublist(0, nullIndex + 1));
          _readBuffer.removeRange(0, nullIndex + 1);

          // Parse and emit frame
          try {
            final frame = StompFrame.fromBytes(frameData);
            _frameController.add(frame);
            _logger.finest('Received frame from ${peerId}: ${frame.command}');
          } catch (e) {
            _logger.warning('Error parsing frame from ${peerId}: $e');
          }
        }
      } catch (e) {
        if (_state != StompServerConnectionState.disconnecting && 
            _state != StompServerConnectionState.disconnected) {
          _logger.warning('Error reading from ${peerId}: $e');
          break;
        }
      }
    }
  }

  /// Closes the connection
  Future<void> close() async {
    if (_state == StompServerConnectionState.disconnected) return;

    setState(StompServerConnectionState.disconnecting);

    // Abort all active transactions
    _transactionManager.abortAllTransactions();

    // Clear subscriptions
    _subscriptionManager.clear();
    _ackManager.clear();

    // Close stream
    if (!stream.isClosed) {
      try {
        await stream.close();
      } catch (e) {
        _logger.warning('Error closing stream for ${peerId}: $e');
      }
    }

    _frameController.close();
    setState(StompServerConnectionState.disconnected);
  }

  @override
  String toString() {
    return 'StompServerConnection(peerId: $peerId, sessionId: $sessionId, state: $_state)';
  }
}

/// STOMP server for handling client connections over libp2p
class StompServer {
  final Host _host;
  final String _serverName;
  final Duration _timeout;
  final Random _random = Random.secure();

  // Connection management
  final Map<String, StompServerConnection> _connections = {};
  final Map<PeerId, StompServerConnection> _peerConnections = {};

  // Message routing
  final Map<String, Set<StompServerConnection>> _destinationSubscriptions = {};
  final Map<String, List<StompFrame>> _destinationMessages = {};

  // Event streams
  final StreamController<StompServerConnection> _connectionController = StreamController<StompServerConnection>.broadcast();
  final StreamController<StompServerConnection> _disconnectionController = StreamController<StompServerConnection>.broadcast();
  final StreamController<StompMessage> _messageController = StreamController<StompMessage>.broadcast();

  bool _isRunning = false;

  StompServer({
    required Host host,
    String? serverName,
    Duration timeout = StompConstants.defaultTimeout,
  }) : _host = host,
       _serverName = serverName ?? 'dart-libp2p-stomp/1.0',
       _timeout = timeout;

  /// Whether the server is running
  bool get isRunning => _isRunning;

  /// Stream of new connections
  Stream<StompServerConnection> get onConnection => _connectionController.stream;

  /// Stream of disconnections
  Stream<StompServerConnection> get onDisconnection => _disconnectionController.stream;

  /// Stream of messages sent to destinations
  Stream<StompMessage> get onMessage => _messageController.stream;

  /// Gets all active connections
  List<StompServerConnection> get connections => 
      _connections.values.where((c) => c.isActive).toList();

  /// Gets a connection by session ID
  StompServerConnection? getConnection(String sessionId) {
    return _connections[sessionId];
  }

  /// Gets a connection by peer ID
  StompServerConnection? getConnectionByPeer(PeerId peerId) {
    return _peerConnections[peerId];
  }

  /// Starts the STOMP server
  Future<void> start() async {
    if (_isRunning) {
      throw const StompStateException('Server already running', 'running', 'stopped');
    }

    // Register stream handler
    _host.setStreamHandler(StompProtocols.stomp, _handleNewConnection);
    _isRunning = true;

    _logger.info('STOMP server started on ${_host.id}');
  }

  /// Stops the STOMP server
  Future<void> stop() async {
    if (!_isRunning) return;

    _isRunning = false;

    // Close all connections
    final connectionList = List<StompServerConnection>.from(_connections.values);
    for (final connection in connectionList) {
      await connection.close();
    }

    _connections.clear();
    _peerConnections.clear();
    _destinationSubscriptions.clear();
    _destinationMessages.clear();

    _connectionController.close();
    _disconnectionController.close();
    _messageController.close();

    _logger.info('STOMP server stopped');
  }

  /// Sends a message to a destination
  Future<void> sendToDestination({
    required String destination,
    String? body,
    Uint8List? bodyBytes,
    String? contentType,
    Map<String, String>? headers,
  }) async {
    if (!_isRunning) {
      throw const StompStateException('Server not running', 'stopped', 'running');
    }

    final messageId = _generateMessageId();
    final messageHeaders = <String, String>{
      StompHeaders.destination: destination,
      StompHeaders.messageId: messageId,
    };

    if (contentType != null) messageHeaders[StompHeaders.contentType] = contentType;
    if (headers != null) messageHeaders.addAll(headers);

    Uint8List? frameBody;
    if (body != null) {
      frameBody = Uint8List.fromList(body.codeUnits);
    } else if (bodyBytes != null) {
      frameBody = bodyBytes;
    }

    if (frameBody != null) {
      messageHeaders[StompHeaders.contentLength] = frameBody.length.toString();
    }

    // Store message for the destination
    final messageFrame = StompFrame(
      command: StompCommands.message,
      headers: messageHeaders,
      body: frameBody,
    );

    _destinationMessages.putIfAbsent(destination, () => <StompFrame>[]).add(messageFrame);

    // Send to all subscribers
    final subscribers = _destinationSubscriptions[destination];
    if (subscribers != null) {
      for (final connection in subscribers) {
        if (connection.isActive) {
          await _sendMessageToConnection(connection, messageFrame, destination);
        }
      }
    }

    // Emit message event
    final message = StompMessage.fromFrame(messageFrame);
    _messageController.add(message);

    _logger.info('Sent message to destination $destination (${subscribers?.length ?? 0} subscribers)');
  }

  /// Broadcasts a message to all connected clients
  Future<void> broadcast({
    required String body,
    String? contentType,
    Map<String, String>? headers,
  }) async {
    for (final connection in connections) {
      // Send to a special broadcast destination for each client
      await sendToDestination(
        destination: '/broadcast/${connection.sessionId}',
        body: body,
        contentType: contentType,
        headers: headers,
      );
    }
  }

  Future<void> _handleNewConnection(P2PStream stream, PeerId peerId) async {
    _logger.info('New STOMP connection from $peerId');

    try {
      await stream.scope().setService(StompProtocols.serviceName);
      await stream.setDeadline(DateTime.now().add(_timeout));

      // Wait for CONNECT frame
      final connectFrame = await _readConnectFrame(stream);
      final sessionId = _generateSessionId();

      // Create connection
      final connection = StompServerConnection(
        peerId: peerId,
        stream: stream,
        sessionId: sessionId,
        clientHeaders: connectFrame.headers,
      );

      _connections[sessionId] = connection;
      _peerConnections[peerId] = connection;

      // Start reading frames from client
      connection.startReading();
      _setupConnectionHandlers(connection);

      // Send CONNECTED frame
      await _sendConnectedFrame(connection);

      connection.setState(StompServerConnectionState.connected);
      _connectionController.add(connection);

      _logger.info('STOMP client connected: $peerId (session: $sessionId)');

    } catch (e) {
      _logger.warning('Error handling new STOMP connection from $peerId: $e');
      if (!stream.isClosed) {
        await _sendErrorFrame(stream, 'Connection failed: $e');
        await stream.close();
      }
    }
  }

  Future<StompFrame> _readConnectFrame(P2PStream stream) async {
    final buffer = <int>[];
    final timeout = Timer(_timeout, () {
      throw StompTimeoutException('Timeout waiting for CONNECT frame', _timeout);
    });

    try {
      while (true) {
        final data = await stream.read();
        if (data.isEmpty) {
          throw const StompConnectionException('Stream closed before CONNECT frame');
        }

        buffer.addAll(data);

        // Look for complete frame
        final nullIndex = buffer.indexOf(StompConstants.nullByte);
        if (nullIndex != -1) {
          final frameData = Uint8List.fromList(buffer.sublist(0, nullIndex + 1));
          final frame = StompFrame.fromBytes(frameData);

          if (frame.command != StompCommands.connect && frame.command != StompCommands.stomp) {
            throw StompProtocolException('Expected CONNECT or STOMP frame, got ${frame.command}');
          }

          return frame;
        }
      }
    } finally {
      timeout.cancel();
    }
  }

  Future<void> _sendConnectedFrame(StompServerConnection connection) async {
    final connectedFrame = StompFrameFactory.connected(
      session: connection.sessionId,
      server: _serverName,
    );

    await connection.sendFrame(connectedFrame);
  }

  Future<void> _sendErrorFrame(P2PStream stream, String message) async {
    try {
      final errorFrame = StompFrameFactory.error(message: message);
      final frameBytes = errorFrame.toBytes();
      await stream.write(frameBytes);
    } catch (e) {
      _logger.warning('Error sending ERROR frame: $e');
    }
  }

  void _setupConnectionHandlers(StompServerConnection connection) {
    connection.onFrame.listen((frame) async {
      try {
        await _handleClientFrame(connection, frame);
      } catch (e) {
        _logger.warning('Error handling frame from ${connection.peerId}: $e');
        await _sendErrorFrameToConnection(connection, 'Frame processing error: $e');
      }
    });
  }

  Future<void> _handleClientFrame(StompServerConnection connection, StompFrame frame) async {
    switch (frame.command) {
      case StompCommands.send:
        await _handleSendFrame(connection, frame);
        break;
      case StompCommands.subscribe:
        await _handleSubscribeFrame(connection, frame);
        break;
      case StompCommands.unsubscribe:
        await _handleUnsubscribeFrame(connection, frame);
        break;
      case StompCommands.ack:
        await _handleAckFrame(connection, frame);
        break;
      case StompCommands.nack:
        await _handleNackFrame(connection, frame);
        break;
      case StompCommands.begin:
        await _handleBeginFrame(connection, frame);
        break;
      case StompCommands.commit:
        await _handleCommitFrame(connection, frame);
        break;
      case StompCommands.abort:
        await _handleAbortFrame(connection, frame);
        break;
      case StompCommands.disconnect:
        await _handleDisconnectFrame(connection, frame);
        break;
      default:
        await _sendErrorFrameToConnection(connection, 'Unknown command: ${frame.command}');
    }
  }

  Future<void> _handleSendFrame(StompServerConnection connection, StompFrame frame) async {
    final destination = frame.getHeader(StompHeaders.destination);
    if (destination == null) {
      await _sendErrorFrameToConnection(connection, 'SEND frame missing destination header');
      return;
    }

    final transactionId = frame.getHeader(StompHeaders.transaction);
    if (transactionId != null) {
      // Add to transaction
      connection.transactions.addFrameToTransaction(transactionId, frame);
    } else {
      // Send immediately
      await _processSendFrame(connection, frame, destination);
    }

    // Send receipt if requested
    final receiptId = frame.getHeader(StompHeaders.receipt);
    if (receiptId != null) {
      await _sendReceiptFrame(connection, receiptId);
    }
  }

  Future<void> _processSendFrame(StompServerConnection connection, StompFrame frame, String destination) async {
    final messageId = _generateMessageId();
    final messageHeaders = Map<String, String>.from(frame.headers);
    messageHeaders[StompHeaders.messageId] = messageId;

    final messageFrame = StompFrame(
      command: StompCommands.message,
      headers: messageHeaders,
      body: frame.body,
    );

    // Store message
    _destinationMessages.putIfAbsent(destination, () => <StompFrame>[]).add(messageFrame);

    // Send to subscribers
    final subscribers = _destinationSubscriptions[destination];
    if (subscribers != null) {
      for (final subscriber in subscribers) {
        if (subscriber.isActive && subscriber != connection) {
          await _sendMessageToConnection(subscriber, messageFrame, destination);
        }
      }
    }

    _logger.fine('Message sent to destination $destination from ${connection.peerId}');
  }

  Future<void> _handleSubscribeFrame(StompServerConnection connection, StompFrame frame) async {
    final destination = frame.getHeader(StompHeaders.destination);
    final subscriptionId = frame.getHeader(StompHeaders.id);

    if (destination == null || subscriptionId == null) {
      await _sendErrorFrameToConnection(connection, 'SUBSCRIBE frame missing required headers');
      return;
    }

    final ackMode = frame.getHeader(StompHeaders.ack) ?? StompHeaders.ackAuto;

    // Create subscription
    connection.subscriptions.addSubscription(
      id: subscriptionId,
      destination: destination,
      ackMode: ackMode,
      headers: frame.headers,
    );

    // Add to destination subscriptions
    _destinationSubscriptions.putIfAbsent(destination, () => <StompServerConnection>{}).add(connection);

    // Send any stored messages for this destination
    final storedMessages = _destinationMessages[destination];
    if (storedMessages != null) {
      for (final messageFrame in storedMessages) {
        await _sendMessageToConnection(connection, messageFrame, destination);
      }
    }

    // Send receipt if requested
    final receiptId = frame.getHeader(StompHeaders.receipt);
    if (receiptId != null) {
      await _sendReceiptFrame(connection, receiptId);
    }

    _logger.info('Client ${connection.peerId} subscribed to $destination (id: $subscriptionId)');
  }

  Future<void> _handleUnsubscribeFrame(StompServerConnection connection, StompFrame frame) async {
    final subscriptionId = frame.getHeader(StompHeaders.id);
    if (subscriptionId == null) {
      await _sendErrorFrameToConnection(connection, 'UNSUBSCRIBE frame missing id header');
      return;
    }

    final subscription = connection.subscriptions.getSubscription(subscriptionId);
    if (subscription != null) {
      // Remove from destination subscriptions
      final subscribers = _destinationSubscriptions[subscription.destination];
      subscribers?.remove(connection);
      if (subscribers?.isEmpty == true) {
        _destinationSubscriptions.remove(subscription.destination);
      }

      // Remove subscription
      connection.subscriptions.removeSubscription(subscriptionId);
      connection.acknowledgments.clearSubscription(subscriptionId);
    }

    // Send receipt if requested
    final receiptId = frame.getHeader(StompHeaders.receipt);
    if (receiptId != null) {
      await _sendReceiptFrame(connection, receiptId);
    }

    _logger.info('Client ${connection.peerId} unsubscribed from subscription $subscriptionId');
  }

  Future<void> _handleAckFrame(StompServerConnection connection, StompFrame frame) async {
    final ackId = frame.getHeader(StompHeaders.id);
    if (ackId == null) {
      await _sendErrorFrameToConnection(connection, 'ACK frame missing id header');
      return;
    }

    final transactionId = frame.getHeader(StompHeaders.transaction);
    if (transactionId != null) {
      // Add to transaction
      connection.transactions.addFrameToTransaction(transactionId, frame);
    } else {
      // Process immediately
      try {
        connection.acknowledgments.acknowledge(ackId);
      } catch (e) {
        await _sendErrorFrameToConnection(connection, 'ACK error: $e');
        return;
      }
    }

    // Send receipt if requested
    final receiptId = frame.getHeader(StompHeaders.receipt);
    if (receiptId != null) {
      await _sendReceiptFrame(connection, receiptId);
    }
  }

  Future<void> _handleNackFrame(StompServerConnection connection, StompFrame frame) async {
    final ackId = frame.getHeader(StompHeaders.id);
    if (ackId == null) {
      await _sendErrorFrameToConnection(connection, 'NACK frame missing id header');
      return;
    }

    final transactionId = frame.getHeader(StompHeaders.transaction);
    if (transactionId != null) {
      // Add to transaction
      connection.transactions.addFrameToTransaction(transactionId, frame);
    } else {
      // Process immediately
      try {
        connection.acknowledgments.nack(ackId);
      } catch (e) {
        await _sendErrorFrameToConnection(connection, 'NACK error: $e');
        return;
      }
    }

    // Send receipt if requested
    final receiptId = frame.getHeader(StompHeaders.receipt);
    if (receiptId != null) {
      await _sendReceiptFrame(connection, receiptId);
    }
  }

  Future<void> _handleBeginFrame(StompServerConnection connection, StompFrame frame) async {
    final transactionId = frame.getHeader(StompHeaders.transaction);
    if (transactionId == null) {
      await _sendErrorFrameToConnection(connection, 'BEGIN frame missing transaction header');
      return;
    }

    try {
      connection.transactions.beginTransaction(transactionId);
    } catch (e) {
      await _sendErrorFrameToConnection(connection, 'BEGIN error: $e');
      return;
    }

    // Send receipt if requested
    final receiptId = frame.getHeader(StompHeaders.receipt);
    if (receiptId != null) {
      await _sendReceiptFrame(connection, receiptId);
    }

    _logger.fine('Transaction $transactionId begun for ${connection.peerId}');
  }

  Future<void> _handleCommitFrame(StompServerConnection connection, StompFrame frame) async {
    final transactionId = frame.getHeader(StompHeaders.transaction);
    if (transactionId == null) {
      await _sendErrorFrameToConnection(connection, 'COMMIT frame missing transaction header');
      return;
    }

    try {
      final transaction = connection.transactions.commitTransaction(transactionId);
      
      // Process all frames in the transaction
      for (final txFrame in transaction.frames) {
        if (txFrame.command == StompCommands.send) {
          final destination = txFrame.getHeader(StompHeaders.destination);
          if (destination != null) {
            await _processSendFrame(connection, txFrame, destination);
          }
        } else if (txFrame.command == StompCommands.ack) {
          final ackId = txFrame.getHeader(StompHeaders.id);
          if (ackId != null) {
            connection.acknowledgments.acknowledge(ackId);
          }
        } else if (txFrame.command == StompCommands.nack) {
          final ackId = txFrame.getHeader(StompHeaders.id);
          if (ackId != null) {
            connection.acknowledgments.nack(ackId);
          }
        }
      }
    } catch (e) {
      await _sendErrorFrameToConnection(connection, 'COMMIT error: $e');
      return;
    }

    // Send receipt if requested
    final receiptId = frame.getHeader(StompHeaders.receipt);
    if (receiptId != null) {
      await _sendReceiptFrame(connection, receiptId);
    }

    _logger.fine('Transaction $transactionId committed for ${connection.peerId}');
  }

  Future<void> _handleAbortFrame(StompServerConnection connection, StompFrame frame) async {
    final transactionId = frame.getHeader(StompHeaders.transaction);
    if (transactionId == null) {
      await _sendErrorFrameToConnection(connection, 'ABORT frame missing transaction header');
      return;
    }

    try {
      connection.transactions.abortTransaction(transactionId);
    } catch (e) {
      await _sendErrorFrameToConnection(connection, 'ABORT error: $e');
      return;
    }

    // Send receipt if requested
    final receiptId = frame.getHeader(StompHeaders.receipt);
    if (receiptId != null) {
      await _sendReceiptFrame(connection, receiptId);
    }

    _logger.fine('Transaction $transactionId aborted for ${connection.peerId}');
  }

  Future<void> _handleDisconnectFrame(StompServerConnection connection, StompFrame frame) async {
    // Send receipt if requested
    final receiptId = frame.getHeader(StompHeaders.receipt);
    if (receiptId != null) {
      await _sendReceiptFrame(connection, receiptId);
    }

    // Close connection
    await _closeConnection(connection);
  }

  Future<void> _sendMessageToConnection(StompServerConnection connection, StompFrame messageFrame, String destination) async {
    final subscription = connection.subscriptions.subscriptions
        .where((s) => s.destination == destination)
        .firstOrNull;

    if (subscription == null) return;

    final headers = Map<String, String>.from(messageFrame.headers);
    headers[StompHeaders.subscription] = subscription.id;

    // Add ack header if needed
    if (subscription.ackMode != StompHeaders.ackAuto) {
      final ackId = _generateAckId();
      headers[StompHeaders.ack] = ackId;

      // Track for acknowledgment
      final ackMode = StompAckMode.fromHeaderValue(subscription.ackMode);
      final pendingAck = PendingAck(
        messageId: headers[StompHeaders.messageId]!,
        subscriptionId: subscription.id,
        ackId: ackId,
        ackMode: ackMode,
      );
      connection.acknowledgments.addPendingAck(pendingAck);
    }

    final deliveryFrame = StompFrame(
      command: StompCommands.message,
      headers: headers,
      body: messageFrame.body,
    );

    await connection.sendFrame(deliveryFrame);
  }

  Future<void> _sendReceiptFrame(StompServerConnection connection, String receiptId) async {
    final receiptFrame = StompFrame(
      command: StompCommands.receipt,
      headers: {StompHeaders.receiptId: receiptId},
    );

    await connection.sendFrame(receiptFrame);
  }

  Future<void> _sendErrorFrameToConnection(StompServerConnection connection, String message) async {
    final errorFrame = StompFrameFactory.error(message: message);
    await connection.sendFrame(errorFrame);
  }

  Future<void> _closeConnection(StompServerConnection connection) async {
    // Remove from maps
    _connections.remove(connection.sessionId);
    _peerConnections.remove(connection.peerId);

    // Remove from destination subscriptions
    for (final subscribers in _destinationSubscriptions.values) {
      subscribers.remove(connection);
    }

    // Clean up empty destination subscriptions
    _destinationSubscriptions.removeWhere((_, subscribers) => subscribers.isEmpty);

    await connection.close();
    _disconnectionController.add(connection);

    _logger.info('STOMP client disconnected: ${connection.peerId} (session: ${connection.sessionId})');
  }

  String _generateSessionId() {
    return 'session-${DateTime.now().millisecondsSinceEpoch}-${_random.nextInt(1000000)}';
  }

  String _generateMessageId() {
    return 'msg-${DateTime.now().millisecondsSinceEpoch}-${_random.nextInt(1000000)}';
  }

  String _generateAckId() {
    return 'ack-${DateTime.now().millisecondsSinceEpoch}-${_random.nextInt(1000000)}';
  }
}

extension on Iterable<StompSubscription> {
  StompSubscription? get firstOrNull {
    return isEmpty ? null : first;
  }
}
