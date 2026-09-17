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

final _logger = Logger('stomp.client');

/// STOMP client connection state
enum StompClientState {
  disconnected,
  connecting,
  connected,
  disconnecting,
  error
}

/// STOMP client for connecting to STOMP servers over libp2p
class StompClient {
  final Host _host;
  final PeerId _serverPeerId;
  final String _hostName;
  final String? _login;
  final String? _passcode;
  final Duration _timeout;
  final Random _random = Random.secure();

  P2PStream? _stream;
  StompClientState _state = StompClientState.disconnected;
  String? _sessionId;
  String? _serverInfo;
  final Map<String, String> _serverHeaders = {};

  // Managers
  final StompSubscriptionManager _subscriptionManager = StompSubscriptionManager();
  final StompTransactionManager _transactionManager = StompTransactionManager();
  final StompAckManager _ackManager = StompAckManager();

  // Receipt tracking
  final Map<String, Completer<StompFrame>> _pendingReceipts = {};
  int _receiptCounter = 0;

  // Heart-beat support
  Timer? _heartBeatTimer;
  Duration? _heartBeatInterval;

  // Event streams
  final StreamController<StompClientState> _stateController = StreamController<StompClientState>.broadcast();
  final StreamController<StompFrame> _frameController = StreamController<StompFrame>.broadcast();
  final StreamController<StompServerErrorException> _errorController = StreamController<StompServerErrorException>.broadcast();

  StompClient({
    required Host host,
    required PeerId serverPeerId,
    required String hostName,
    String? login,
    String? passcode,
    Duration timeout = StompConstants.defaultTimeout,
  }) : _host = host,
       _serverPeerId = serverPeerId,
       _hostName = hostName,
       _login = login,
       _passcode = passcode,
       _timeout = timeout;

  /// Current connection state
  StompClientState get state => _state;

  /// Whether the client is connected
  bool get isConnected => _state == StompClientState.connected;

  /// Session ID from the server
  String? get sessionId => _sessionId;

  /// Server information
  String? get serverInfo => _serverInfo;

  /// Server headers from CONNECTED frame
  Map<String, String> get serverHeaders => Map<String, String>.unmodifiable(_serverHeaders);

  /// Stream of state changes
  Stream<StompClientState> get onStateChange => _stateController.stream;

  /// Stream of all frames (for debugging/monitoring)
  Stream<StompFrame> get onFrame => _frameController.stream;

  /// Stream of server errors
  Stream<StompServerErrorException> get onError => _errorController.stream;

  /// Subscription manager
  StompSubscriptionManager get subscriptions => _subscriptionManager;

  /// Transaction manager
  StompTransactionManager get transactions => _transactionManager;

  /// Connects to the STOMP server
  Future<void> connect() async {
    if (_state != StompClientState.disconnected) {
      throw StompStateException('Cannot connect', _state.name, 'disconnected');
    }

    _setState(StompClientState.connecting);

    try {
      // Create stream to server
      _stream = await _host.newStream(_serverPeerId, [StompProtocols.stomp], Context());
      await _stream!.scope().setService(StompProtocols.serviceName);
      await _stream!.setDeadline(DateTime.now().add(_timeout));

      // Start frame reading
      _startFrameReader();

      // Send CONNECT frame
      final connectFrame = StompFrameFactory.connect(
        host: _hostName,
        login: _login,
        passcode: _passcode,
      );

      await _sendFrame(connectFrame);

      // Wait for CONNECTED frame
      final connectedFrame = await _waitForFrame(StompCommands.connected, _timeout);
      await _handleConnectedFrame(connectedFrame);

      _setState(StompClientState.connected);
      _logger.info('Connected to STOMP server $_serverPeerId');

    } catch (e) {
      _setState(StompClientState.error);
      await _cleanup();
      rethrow;
    }
  }

  /// Disconnects from the STOMP server
  Future<void> disconnect() async {
    if (_state == StompClientState.disconnected || _state == StompClientState.disconnecting) {
      return;
    }

    _setState(StompClientState.disconnecting);

    try {
      if (_stream != null && !_stream!.isClosed) {
        // Send DISCONNECT frame with receipt
        final receiptId = _generateReceiptId();
        final disconnectFrame = StompFrameFactory.disconnect(receipt: receiptId);
        
        await _sendFrame(disconnectFrame);
        
        // Wait for receipt
        try {
          await _waitForReceipt(receiptId, const Duration(seconds: 5));
        } catch (e) {
          _logger.warning('Did not receive DISCONNECT receipt: $e');
        }
      }
    } catch (e) {
      _logger.warning('Error during disconnect: $e');
    } finally {
      await _cleanup();
      _setState(StompClientState.disconnected);
      _logger.info('Disconnected from STOMP server $_serverPeerId');
    }
  }

  /// Sends a message to a destination
  Future<String?> send({
    required String destination,
    String? body,
    Uint8List? bodyBytes,
    String? contentType,
    String? transactionId,
    bool requestReceipt = false,
    Map<String, String>? headers,
  }) async {
    _ensureConnected();

    String? receiptId;
    if (requestReceipt) {
      receiptId = _generateReceiptId();
    }

    final sendFrame = StompFrameFactory.send(
      destination: destination,
      body: body,
      bodyBytes: bodyBytes,
      contentType: contentType,
      receipt: receiptId,
      transaction: transactionId,
      additionalHeaders: headers,
    );

    await _sendFrame(sendFrame);

    // Add to transaction if specified
    if (transactionId != null) {
      _transactionManager.addFrameToTransaction(transactionId, sendFrame);
    }

    // Wait for receipt if requested
    if (receiptId != null) {
      await _waitForReceipt(receiptId, _timeout);
    }

    return receiptId;
  }

  /// Subscribes to a destination
  Future<StompSubscription> subscribe({
    required String destination,
    String? id,
    StompAckMode ackMode = StompAckMode.auto,
    bool requestReceipt = false,
    Map<String, String>? headers,
  }) async {
    _ensureConnected();

    final subscriptionId = id ?? _generateSubscriptionId();
    
    String? receiptId;
    if (requestReceipt) {
      receiptId = _generateReceiptId();
    }

    final subscribeFrame = StompFrameFactory.subscribe(
      destination: destination,
      id: subscriptionId,
      ack: ackMode.toHeaderValue(),
      receipt: receiptId,
      additionalHeaders: headers,
    );

    await _sendFrame(subscribeFrame);

    // Wait for receipt if requested
    if (receiptId != null) {
      await _waitForReceipt(receiptId, _timeout);
    }

    // Create subscription
    final subscription = _subscriptionManager.addSubscription(
      id: subscriptionId,
      destination: destination,
      ackMode: ackMode.toHeaderValue(),
      headers: headers,
    );

    _logger.info('Subscribed to $destination with ID $subscriptionId');
    return subscription;
  }

  /// Unsubscribes from a destination
  Future<void> unsubscribe({
    required String subscriptionId,
    bool requestReceipt = false,
  }) async {
    _ensureConnected();

    String? receiptId;
    if (requestReceipt) {
      receiptId = _generateReceiptId();
    }

    final unsubscribeFrame = StompFrameFactory.unsubscribe(
      id: subscriptionId,
      receipt: receiptId,
    );

    await _sendFrame(unsubscribeFrame);

    // Wait for receipt if requested
    if (receiptId != null) {
      await _waitForReceipt(receiptId, _timeout);
    }

    // Remove subscription
    _subscriptionManager.removeSubscription(subscriptionId);
    _ackManager.clearSubscription(subscriptionId);

    _logger.info('Unsubscribed from subscription $subscriptionId');
  }

  /// Acknowledges a message
  Future<void> ack({
    required String messageId,
    String? transactionId,
    bool requestReceipt = false,
  }) async {
    _ensureConnected();

    String? receiptId;
    if (requestReceipt) {
      receiptId = _generateReceiptId();
    }

    final ackFrame = StompFrameFactory.ack(
      id: messageId,
      transaction: transactionId,
      receipt: receiptId,
    );

    await _sendFrame(ackFrame);

    // Add to transaction if specified
    if (transactionId != null) {
      _transactionManager.addFrameToTransaction(transactionId, ackFrame);
    }

    // Process acknowledgment
    try {
      _ackManager.acknowledge(messageId);
    } catch (e) {
      _logger.warning('Error processing ACK for message $messageId: $e');
    }

    // Wait for receipt if requested
    if (receiptId != null) {
      await _waitForReceipt(receiptId, _timeout);
    }
  }

  /// Negatively acknowledges a message
  Future<void> nack({
    required String messageId,
    String? transactionId,
    bool requestReceipt = false,
  }) async {
    _ensureConnected();

    String? receiptId;
    if (requestReceipt) {
      receiptId = _generateReceiptId();
    }

    final nackFrame = StompFrameFactory.nack(
      id: messageId,
      transaction: transactionId,
      receipt: receiptId,
    );

    await _sendFrame(nackFrame);

    // Add to transaction if specified
    if (transactionId != null) {
      _transactionManager.addFrameToTransaction(transactionId, nackFrame);
    }

    // Process negative acknowledgment
    try {
      _ackManager.nack(messageId);
    } catch (e) {
      _logger.warning('Error processing NACK for message $messageId: $e');
    }

    // Wait for receipt if requested
    if (receiptId != null) {
      await _waitForReceipt(receiptId, _timeout);
    }
  }

  /// Begins a transaction
  Future<StompTransaction> beginTransaction({
    String? transactionId,
    bool requestReceipt = false,
  }) async {
    _ensureConnected();

    final txId = transactionId ?? _generateTransactionId();
    
    String? receiptId;
    if (requestReceipt) {
      receiptId = _generateReceiptId();
    }

    final beginFrame = StompTransactionFrameFactory.begin(
      transactionId: txId,
      receipt: receiptId,
    );

    await _sendFrame(beginFrame);

    // Wait for receipt if requested
    if (receiptId != null) {
      await _waitForReceipt(receiptId, _timeout);
    }

    // Create transaction
    final transaction = _transactionManager.beginTransaction(txId);
    _logger.info('Began transaction $txId');
    return transaction;
  }

  /// Commits a transaction
  Future<void> commitTransaction({
    required String transactionId,
    bool requestReceipt = false,
  }) async {
    _ensureConnected();

    String? receiptId;
    if (requestReceipt) {
      receiptId = _generateReceiptId();
    }

    final commitFrame = StompTransactionFrameFactory.commit(
      transactionId: transactionId,
      receipt: receiptId,
    );

    await _sendFrame(commitFrame);

    // Wait for receipt if requested
    if (receiptId != null) {
      await _waitForReceipt(receiptId, _timeout);
    }

    // Commit transaction
    _transactionManager.commitTransaction(transactionId);
    _logger.info('Committed transaction $transactionId');
  }

  /// Aborts a transaction
  Future<void> abortTransaction({
    required String transactionId,
    bool requestReceipt = false,
  }) async {
    _ensureConnected();

    String? receiptId;
    if (requestReceipt) {
      receiptId = _generateReceiptId();
    }

    final abortFrame = StompTransactionFrameFactory.abort(
      transactionId: transactionId,
      receipt: receiptId,
    );

    await _sendFrame(abortFrame);

    // Wait for receipt if requested
    if (receiptId != null) {
      await _waitForReceipt(receiptId, _timeout);
    }

    // Abort transaction
    _transactionManager.abortTransaction(transactionId);
    _logger.info('Aborted transaction $transactionId');
  }

  /// Closes the client and cleans up resources
  Future<void> close() async {
    if (_state != StompClientState.disconnected) {
      await disconnect();
    }
    
    _subscriptionManager.close();
    _transactionManager.close();
    _ackManager.clear();
    
    _stateController.close();
    _frameController.close();
    _errorController.close();
  }

  void _setState(StompClientState newState) {
    if (_state != newState) {
      _state = newState;
      _stateController.add(newState);
    }
  }

  void _ensureConnected() {
    if (!isConnected) {
      throw StompStateException('Client not connected', _state.name, 'connected');
    }
  }

  Future<void> _sendFrame(StompFrame frame) async {
    if (_stream == null || _stream!.isClosed) {
      throw const StompConnectionException('Stream is closed');
    }

    final frameBytes = frame.toBytes();
    await _stream!.write(frameBytes);
    _frameController.add(frame);
    
    _logger.finest('Sent frame: ${frame.command}');
  }

  void _startFrameReader() {
    _readFrames().catchError((e) {
      _logger.severe('Frame reader error: $e');
      _setState(StompClientState.error);
      _cleanup();
    });
  }

  Future<void> _readFrames() async {
    if (_stream == null) return;

    final buffer = <int>[];
    
    while (!_stream!.isClosed && _state != StompClientState.disconnected) {
      try {
        final data = await _stream!.read();
        if (data.isEmpty) break; // EOF
        
        buffer.addAll(data);
        
        // Look for complete frames (terminated by NULL byte)
        while (true) {
          final nullIndex = buffer.indexOf(StompConstants.nullByte);
          if (nullIndex == -1) break; // No complete frame yet
          
          // Extract frame data including the NULL byte
          final frameData = Uint8List.fromList(buffer.sublist(0, nullIndex + 1));
          buffer.removeRange(0, nullIndex + 1);
          
          // Parse and handle frame
          try {
            final frame = StompFrame.fromBytes(frameData);
            await _handleFrame(frame);
          } catch (e) {
            _logger.warning('Error parsing frame: $e');
          }
        }
      } catch (e) {
        if (_state != StompClientState.disconnecting && _state != StompClientState.disconnected) {
          _logger.warning('Error reading from stream: $e');
          break;
        }
      }
    }
  }

  Future<void> _handleFrame(StompFrame frame) async {
    _frameController.add(frame);
    _logger.finest('Received frame: ${frame.command}');

    switch (frame.command) {
      case StompCommands.connected:
        // Should only happen during connection
        break;
      case StompCommands.message:
        await _handleMessageFrame(frame);
        break;
      case StompCommands.receipt:
        _handleReceiptFrame(frame);
        break;
      case StompCommands.error:
        _handleErrorFrame(frame);
        break;
      default:
        _logger.warning('Unexpected frame command: ${frame.command}');
    }
  }

  Future<void> _handleConnectedFrame(StompFrame frame) async {
    _sessionId = frame.getHeader(StompHeaders.session);
    _serverInfo = frame.getHeader(StompHeaders.server);
    
    // Store all server headers
    _serverHeaders.clear();
    _serverHeaders.addAll(frame.headers);

    // Handle heart-beat
    final heartBeatHeader = frame.getHeader(StompHeaders.heartBeat);
    if (heartBeatHeader != null) {
      _setupHeartBeat(heartBeatHeader);
    }

    _logger.info('Connected to STOMP server: session=$_sessionId, server=$_serverInfo');
  }

  Future<void> _handleMessageFrame(StompFrame frame) async {
    try {
      final message = StompMessage.fromFrame(frame);
      
      // Add to ack manager if acknowledgment is required
      if (message.requiresAck) {
        final subscription = _subscriptionManager.getSubscription(message.subscriptionId);
        if (subscription != null) {
          final ackMode = StompAckMode.fromHeaderValue(subscription.ackMode);
          final pendingAck = PendingAck(
            messageId: message.messageId,
            subscriptionId: message.subscriptionId,
            ackId: message.ackId,
            ackMode: ackMode,
          );
          _ackManager.addPendingAck(pendingAck);
        }
      }
      
      // Deliver to subscription
      final delivered = _subscriptionManager.deliverMessage(message);
      if (!delivered) {
        _logger.warning('No subscription found for message: ${message.subscriptionId}');
      }
    } catch (e) {
      _logger.warning('Error handling MESSAGE frame: $e');
    }
  }

  void _handleReceiptFrame(StompFrame frame) {
    final receiptId = frame.getHeader(StompHeaders.receiptId);
    if (receiptId != null) {
      final completer = _pendingReceipts.remove(receiptId);
      completer?.complete(frame);
    }
  }

  void _handleErrorFrame(StompFrame frame) {
    final message = frame.getHeader(StompHeaders.message) ?? 'Unknown error';
    final receiptId = frame.getHeader(StompHeaders.receiptId);
    
    final error = StompServerErrorException(
      message,
      receiptId,
      frame.headers,
    );
    
    _errorController.add(error);
    
    // Complete any pending receipt with error
    if (receiptId != null) {
      final completer = _pendingReceipts.remove(receiptId);
      completer?.completeError(error);
    }
    
    _logger.severe('Server error: $message');
  }

  void _setupHeartBeat(String heartBeatHeader) {
    final parts = heartBeatHeader.split(',');
    if (parts.length != 2) return;
    
    final serverSend = int.tryParse(parts[0]) ?? 0;
    final serverReceive = int.tryParse(parts[1]) ?? 0;
    
    // For now, we don't implement heart-beating
    // In a full implementation, you would:
    // 1. Send heart-beats if serverReceive > 0
    // 2. Expect heart-beats if serverSend > 0
    
    _logger.info('Server heart-beat: send=$serverSend, receive=$serverReceive');
  }

  Future<StompFrame> _waitForFrame(String command, Duration timeout) async {
    final completer = Completer<StompFrame>();
    late StreamSubscription subscription;
    
    subscription = _frameController.stream.listen((frame) {
      if (frame.command == command) {
        subscription.cancel();
        completer.complete(frame);
      }
    });
    
    Timer(timeout, () {
      subscription.cancel();
      if (!completer.isCompleted) {
        completer.completeError(StompTimeoutException('Timeout waiting for $command frame', timeout));
      }
    });
    
    return completer.future;
  }

  Future<StompFrame> _waitForReceipt(String receiptId, Duration timeout) async {
    final completer = Completer<StompFrame>();
    _pendingReceipts[receiptId] = completer;
    
    Timer(timeout, () {
      final pendingCompleter = _pendingReceipts.remove(receiptId);
      if (pendingCompleter != null && !pendingCompleter.isCompleted) {
        pendingCompleter.completeError(StompTimeoutException('Timeout waiting for receipt $receiptId', timeout));
      }
    });
    
    return completer.future;
  }

  String _generateReceiptId() {
    return 'receipt-${++_receiptCounter}-${_random.nextInt(1000000)}';
  }

  String _generateSubscriptionId() {
    return 'sub-${DateTime.now().millisecondsSinceEpoch}-${_random.nextInt(1000000)}';
  }

  String _generateTransactionId() {
    return 'tx-${DateTime.now().millisecondsSinceEpoch}-${_random.nextInt(1000000)}';
  }

  Future<void> _cleanup() async {
    _heartBeatTimer?.cancel();
    _heartBeatTimer = null;
    
    // Complete all pending receipts with error
    for (final completer in _pendingReceipts.values) {
      if (!completer.isCompleted) {
        completer.completeError(const StompConnectionException('Connection closed'));
      }
    }
    _pendingReceipts.clear();
    
    // Abort all active transactions
    _transactionManager.abortAllTransactions();
    
    // Clear subscriptions
    _subscriptionManager.clear();
    _ackManager.clear();
    
    // Close stream
    if (_stream != null && !_stream!.isClosed) {
      try {
        await _stream!.close();
      } catch (e) {
        _logger.warning('Error closing stream: $e');
      }
      _stream = null;
    }
  }
}
