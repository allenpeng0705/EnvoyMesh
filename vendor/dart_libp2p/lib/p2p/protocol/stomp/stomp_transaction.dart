import 'dart:async';

import 'stomp_constants.dart';
import 'stomp_exceptions.dart';
import 'stomp_frame.dart';

/// Represents a STOMP transaction
class StompTransaction {
  final String id;
  final DateTime startTime;
  final List<StompFrame> _frames = [];
  
  bool _isCommitted = false;
  bool _isAborted = false;

  StompTransaction({required this.id}) : startTime = DateTime.now();

  /// Whether this transaction is active (not committed or aborted)
  bool get isActive => !_isCommitted && !_isAborted;

  /// Whether this transaction has been committed
  bool get isCommitted => _isCommitted;

  /// Whether this transaction has been aborted
  bool get isAborted => _isAborted;

  /// Gets the frames in this transaction
  List<StompFrame> get frames => List<StompFrame>.unmodifiable(_frames);

  /// Adds a frame to this transaction
  void addFrame(StompFrame frame) {
    if (!isActive) {
      throw StompTransactionException('Cannot add frame to inactive transaction', id);
    }

    // Validate that the frame can be part of a transaction
    if (!_canBeTransactional(frame)) {
      throw StompTransactionException('Frame ${frame.command} cannot be part of a transaction', id);
    }

    _frames.add(frame.copy());
  }

  /// Marks this transaction as committed
  void markCommitted() {
    if (!isActive) {
      throw StompTransactionException('Transaction is not active', id);
    }
    _isCommitted = true;
  }

  /// Marks this transaction as aborted
  void markAborted() {
    if (!isActive) {
      throw StompTransactionException('Transaction is not active', id);
    }
    _isAborted = true;
    _frames.clear(); // Clear frames on abort
  }

  /// Gets the duration of this transaction
  Duration get duration => DateTime.now().difference(startTime);

  static bool _canBeTransactional(StompFrame frame) {
    // Only SEND, ACK, and NACK frames can be part of a transaction
    return [
      StompCommands.send,
      StompCommands.ack,
      StompCommands.nack,
    ].contains(frame.command);
  }

  @override
  String toString() {
    return 'StompTransaction(id: $id, active: $isActive, frames: ${_frames.length}, duration: ${duration.inMilliseconds}ms)';
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is StompTransaction && other.id == id;
  }

  @override
  int get hashCode => id.hashCode;
}

/// Manager for STOMP transactions
class StompTransactionManager {
  final Map<String, StompTransaction> _transactions = {};
  final StreamController<StompTransaction> _beginController = StreamController<StompTransaction>.broadcast();
  final StreamController<StompTransaction> _commitController = StreamController<StompTransaction>.broadcast();
  final StreamController<StompTransaction> _abortController = StreamController<StompTransaction>.broadcast();

  /// Stream of transaction begin events
  Stream<StompTransaction> get onBegin => _beginController.stream;

  /// Stream of transaction commit events
  Stream<StompTransaction> get onCommit => _commitController.stream;

  /// Stream of transaction abort events
  Stream<StompTransaction> get onAbort => _abortController.stream;

  /// Gets all active transactions
  List<StompTransaction> get activeTransactions => 
      _transactions.values.where((t) => t.isActive).toList();

  /// Gets a transaction by ID
  StompTransaction? getTransaction(String id) {
    return _transactions[id];
  }

  /// Begins a new transaction
  StompTransaction beginTransaction(String id) {
    if (_transactions.containsKey(id)) {
      throw StompTransactionException('Transaction with ID already exists', id);
    }

    if (_transactions.length >= StompConstants.maxTransactions) {
      throw StompTransactionException('Maximum number of transactions reached', id);
    }

    final transaction = StompTransaction(id: id);
    _transactions[id] = transaction;
    _beginController.add(transaction);

    return transaction;
  }

  /// Commits a transaction
  StompTransaction commitTransaction(String id) {
    final transaction = _transactions[id];
    if (transaction == null) {
      throw StompTransactionException('Transaction not found', id);
    }

    if (!transaction.isActive) {
      throw StompTransactionException('Transaction is not active', id);
    }

    transaction.markCommitted();
    _commitController.add(transaction);

    return transaction;
  }

  /// Aborts a transaction
  StompTransaction abortTransaction(String id) {
    final transaction = _transactions[id];
    if (transaction == null) {
      throw StompTransactionException('Transaction not found', id);
    }

    if (!transaction.isActive) {
      throw StompTransactionException('Transaction is not active', id);
    }

    transaction.markAborted();
    _abortController.add(transaction);

    return transaction;
  }

  /// Adds a frame to a transaction
  void addFrameToTransaction(String transactionId, StompFrame frame) {
    final transaction = _transactions[transactionId];
    if (transaction == null) {
      throw StompTransactionException('Transaction not found', transactionId);
    }

    transaction.addFrame(frame);
  }

  /// Removes a transaction (typically after commit/abort processing)
  bool removeTransaction(String id) {
    return _transactions.remove(id) != null;
  }

  /// Aborts all active transactions
  void abortAllTransactions() {
    final activeIds = activeTransactions.map((t) => t.id).toList();
    for (final id in activeIds) {
      try {
        abortTransaction(id);
      } catch (e) {
        // Continue aborting other transactions even if one fails
      }
    }
  }

  /// Clears all transactions
  void clear() {
    abortAllTransactions();
    _transactions.clear();
  }

  /// Closes the transaction manager
  void close() {
    clear();
    _beginController.close();
    _commitController.close();
    _abortController.close();
  }

  @override
  String toString() {
    return 'StompTransactionManager(transactions: ${_transactions.length}, active: ${activeTransactions.length})';
  }
}

/// Transaction state for tracking
enum StompTransactionState {
  active,
  committed,
  aborted;

  /// Creates from a transaction
  static StompTransactionState fromTransaction(StompTransaction transaction) {
    if (transaction.isCommitted) return StompTransactionState.committed;
    if (transaction.isAborted) return StompTransactionState.aborted;
    return StompTransactionState.active;
  }
}

/// Transaction statistics
class StompTransactionStats {
  final int totalTransactions;
  final int activeTransactions;
  final int committedTransactions;
  final int abortedTransactions;
  final Duration averageTransactionDuration;
  final Duration longestTransactionDuration;

  StompTransactionStats({
    required this.totalTransactions,
    required this.activeTransactions,
    required this.committedTransactions,
    required this.abortedTransactions,
    required this.averageTransactionDuration,
    required this.longestTransactionDuration,
  });

  /// Creates statistics from a transaction manager
  factory StompTransactionStats.fromManager(StompTransactionManager manager) {
    final transactions = manager._transactions.values.toList();
    final active = transactions.where((t) => t.isActive).length;
    final committed = transactions.where((t) => t.isCommitted).length;
    final aborted = transactions.where((t) => t.isAborted).length;

    Duration totalDuration = Duration.zero;
    Duration longestDuration = Duration.zero;

    for (final transaction in transactions) {
      final duration = transaction.duration;
      totalDuration += duration;
      if (duration > longestDuration) {
        longestDuration = duration;
      }
    }

    final averageDuration = transactions.isNotEmpty
        ? Duration(microseconds: totalDuration.inMicroseconds ~/ transactions.length)
        : Duration.zero;

    return StompTransactionStats(
      totalTransactions: transactions.length,
      activeTransactions: active,
      committedTransactions: committed,
      abortedTransactions: aborted,
      averageTransactionDuration: averageDuration,
      longestTransactionDuration: longestDuration,
    );
  }

  @override
  String toString() {
    return 'StompTransactionStats('
        'total: $totalTransactions, '
        'active: $activeTransactions, '
        'committed: $committedTransactions, '
        'aborted: $abortedTransactions, '
        'avgDuration: ${averageTransactionDuration.inMilliseconds}ms, '
        'maxDuration: ${longestTransactionDuration.inMilliseconds}ms'
        ')';
  }
}

/// Helper for creating transaction-related frames
class StompTransactionFrameFactory {
  /// Creates a BEGIN frame
  static StompFrame begin({
    required String transactionId,
    String? receipt,
    Map<String, String>? additionalHeaders,
  }) {
    final headers = <String, String>{
      StompHeaders.transaction: transactionId,
    };

    if (receipt != null) headers[StompHeaders.receipt] = receipt;
    if (additionalHeaders != null) headers.addAll(additionalHeaders);

    return StompFrame(command: StompCommands.begin, headers: headers);
  }

  /// Creates a COMMIT frame
  static StompFrame commit({
    required String transactionId,
    String? receipt,
    Map<String, String>? additionalHeaders,
  }) {
    final headers = <String, String>{
      StompHeaders.transaction: transactionId,
    };

    if (receipt != null) headers[StompHeaders.receipt] = receipt;
    if (additionalHeaders != null) headers.addAll(additionalHeaders);

    return StompFrame(command: StompCommands.commit, headers: headers);
  }

  /// Creates an ABORT frame
  static StompFrame abort({
    required String transactionId,
    String? receipt,
    Map<String, String>? additionalHeaders,
  }) {
    final headers = <String, String>{
      StompHeaders.transaction: transactionId,
    };

    if (receipt != null) headers[StompHeaders.receipt] = receipt;
    if (additionalHeaders != null) headers.addAll(additionalHeaders);

    return StompFrame(command: StompCommands.abort, headers: headers);
  }

  /// Adds transaction header to a frame
  static StompFrame addTransactionHeader(StompFrame frame, String transactionId) {
    final newFrame = frame.copy();
    newFrame.setHeader(StompHeaders.transaction, transactionId);
    return newFrame;
  }

  /// Removes transaction header from a frame
  static StompFrame removeTransactionHeader(StompFrame frame) {
    final newFrame = frame.copy();
    newFrame.removeHeader(StompHeaders.transaction);
    return newFrame;
  }

  /// Checks if a frame has a transaction header
  static bool hasTransactionHeader(StompFrame frame) {
    return frame.getHeader(StompHeaders.transaction) != null;
  }

  /// Gets the transaction ID from a frame
  static String? getTransactionId(StompFrame frame) {
    return frame.getHeader(StompHeaders.transaction);
  }
}

/// Transaction timeout manager
class StompTransactionTimeoutManager {
  final StompTransactionManager _transactionManager;
  final Duration _defaultTimeout;
  final Map<String, Timer> _timeouts = {};

  StompTransactionTimeoutManager(
    this._transactionManager, {
    Duration defaultTimeout = const Duration(minutes: 5),
  }) : _defaultTimeout = defaultTimeout {
    // Listen for transaction events
    _transactionManager.onBegin.listen(_onTransactionBegin);
    _transactionManager.onCommit.listen(_onTransactionEnd);
    _transactionManager.onAbort.listen(_onTransactionEnd);
  }

  /// Sets a timeout for a transaction
  void setTimeout(String transactionId, Duration timeout) {
    _clearTimeout(transactionId);
    
    final timer = Timer(timeout, () {
      try {
        _transactionManager.abortTransaction(transactionId);
      } catch (e) {
        // Transaction might already be completed
      }
    });
    
    _timeouts[transactionId] = timer;
  }

  /// Clears the timeout for a transaction
  void _clearTimeout(String transactionId) {
    final timer = _timeouts.remove(transactionId);
    timer?.cancel();
  }

  void _onTransactionBegin(StompTransaction transaction) {
    setTimeout(transaction.id, _defaultTimeout);
  }

  void _onTransactionEnd(StompTransaction transaction) {
    _clearTimeout(transaction.id);
  }

  /// Closes the timeout manager
  void close() {
    for (final timer in _timeouts.values) {
      timer.cancel();
    }
    _timeouts.clear();
  }
}
