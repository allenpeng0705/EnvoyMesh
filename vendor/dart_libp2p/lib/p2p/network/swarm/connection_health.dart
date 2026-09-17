import 'dart:async';
import 'package:logging/logging.dart';

// Import existing error types
import '../../../core/exceptions.dart';
import '../../../core/network/errors.dart';

/// Connection health states for event-driven monitoring
enum ConnectionHealthState {
  /// Connection is working normally
  healthy,
  
  /// Connection has some issues but is still functional
  degraded,
  
  /// Connection has failed and should be removed
  failed,
  
  /// Health state is not yet determined
  unknown,
}

/// Connection health metrics and tracking
class ConnectionHealthMetrics {
  final Logger _logger = Logger('ConnectionHealthMetrics');
  
  /// Current health state
  ConnectionHealthState _state = ConnectionHealthState.unknown;
  
  /// Last time connection was confirmed healthy
  DateTime _lastHealthyTime = DateTime.now();
  
  /// Number of consecutive errors
  int _consecutiveErrors = 0;
  
  /// Number of successful operations since last error
  int _successfulOperations = 0;
  
  /// Last error that occurred
  dynamic _lastError;
  
  /// Time of last error
  DateTime? _lastErrorTime;
  
  /// Stream of health state changes
  final StreamController<ConnectionHealthState> _healthStateController = 
      StreamController<ConnectionHealthState>.broadcast();
  
  ConnectionHealthMetrics();
  
  /// Current health state
  ConnectionHealthState get state => _state;
  
  /// Stream of health state changes
  Stream<ConnectionHealthState> get healthStateChanges => _healthStateController.stream;
  
  /// Last time connection was healthy
  DateTime get lastHealthyTime => _lastHealthyTime;
  
  /// Number of consecutive errors
  int get consecutiveErrors => _consecutiveErrors;
  
  /// Number of successful operations
  int get successfulOperations => _successfulOperations;
  
  /// Last error that occurred
  dynamic get lastError => _lastError;
  
  /// Time of last error
  DateTime? get lastErrorTime => _lastErrorTime;
  
  /// Record a successful operation
  void recordSuccess() {
    _successfulOperations++;
    _consecutiveErrors = 0;
    _lastHealthyTime = DateTime.now();
    
    if (_state != ConnectionHealthState.healthy) {
      _updateState(ConnectionHealthState.healthy);
    }
  }
  
  /// Record an error
  void recordError(dynamic error) {
    _consecutiveErrors++;
    _successfulOperations = 0;
    _lastError = error;
    _lastErrorTime = DateTime.now();
    
    _logger.warning('Connection error recorded: $error (consecutive: $_consecutiveErrors)');
    
    // Determine new state based on error count and type
    ConnectionHealthState newState;
    if (_consecutiveErrors >= 3) {
      newState = ConnectionHealthState.failed;
    } else {
      newState = ConnectionHealthState.degraded;
    }
    
    _updateState(newState);
  }
  
  /// Record connection closure
  void recordClosure() {
    _updateState(ConnectionHealthState.failed);
  }
  
  /// Record path update (connection migration success)
  void recordPathUpdate() {
    _logger.info('Connection path updated - resetting health metrics');
    _consecutiveErrors = 0;
    _successfulOperations++;
    _lastHealthyTime = DateTime.now();
    _updateState(ConnectionHealthState.healthy);
  }
  
  /// Check if connection is considered healthy
  bool get isHealthy => _state == ConnectionHealthState.healthy;
  
  /// Check if connection has failed
  bool get hasFailed => _state == ConnectionHealthState.failed;
  
  /// Update health state and notify listeners
  void _updateState(ConnectionHealthState newState) {
    if (_state != newState) {
      final oldState = _state;
      _state = newState;
      _logger.info('Connection health state changed: $oldState -> $newState');
      _healthStateController.add(newState);
    }
  }
  
  /// Dispose of resources
  void dispose() {
    _healthStateController.close();
  }
  
  @override
  String toString() {
    return 'ConnectionHealthMetrics(state: $_state, consecutiveErrors: $_consecutiveErrors, '
           'successfulOps: $_successfulOperations, lastHealthy: $_lastHealthyTime)';
  }
}

/// Event-driven connection health monitor
class ConnectionHealthMonitor {
  final Logger _logger = Logger('ConnectionHealthMonitor');
  final ConnectionHealthMetrics _metrics = ConnectionHealthMetrics();
  
  /// Stream subscriptions for monitoring
  final List<StreamSubscription> _subscriptions = [];
  
  ConnectionHealthMonitor();
  
  /// Get health metrics
  ConnectionHealthMetrics get metrics => _metrics;
  
  /// Monitor connection through existing error propagation and lifecycle events
  /// This is transport-agnostic and works with any connection type
  void monitorConnection(dynamic connection) {
    if (connection == null) return;
    
    try {
      _logger.fine('Setting up transport-agnostic connection health monitoring');
      
      // Monitor connection closure through onClose future if available
      _monitorConnectionClosure(connection);
      
      // Monitor through existing error patterns in stream operations
      // This will be handled in SwarmConn.newStream() where we already
      // record success/error based on stream creation results
      
    } catch (e) {
      _logger.warning('Error setting up connection monitoring: $e');
    }
  }
  
  /// Monitor connection closure events
  void _monitorConnectionClosure(dynamic connection) {
    try {
      // Check if connection has an onClose future
      if (connection.onClose != null) {
        _subscriptions.add(
          connection.onClose.asStream().listen(
            (_) {
              _logger.warning('Connection closed - recording closure');
              _metrics.recordClosure();
            },
            onError: (error) {
              _logger.warning('Connection closed with error: $error');
              _metrics.recordError(error);
            }
          )
        );
      }
    } catch (e) {
      _logger.fine('Connection does not support onClose monitoring: $e');
      // This is fine - not all connections may have onClose
    }
  }
  
  /// Record successful operation (called from SwarmConn)
  void recordSuccess(String reason) {
    _logger.fine('Recording health success: $reason');
    _metrics.recordSuccess();
  }
  
  /// Record error with classification (called from SwarmConn)
  void recordError(dynamic error, String context) {
    _logger.warning('Recording health error in $context: $error');
    
    // Classify error based on existing error types
    if (_isConnectionLevelError(error)) {
      _metrics.recordError(error);
    } else if (_isStreamLevelError(error)) {
      // Stream-level errors contribute to degraded health but don't immediately fail connection
      _recordStreamError(error);
    } else {
      // Unknown error type - treat as connection error to be safe
      _metrics.recordError(error);
    }
  }
  
  /// Record connection closure
  void recordClosure(String reason) {
    _logger.warning('Recording connection closure: $reason');
    _metrics.recordClosure();
  }
  
  /// Track stream-level errors for pattern detection
  int _streamErrorCount = 0;
  DateTime? _lastStreamError;
  
  void _recordStreamError(dynamic error) {
    final now = DateTime.now();
    
    // Reset counter if last error was more than 30 seconds ago
    if (_lastStreamError != null && 
        now.difference(_lastStreamError!).inSeconds > 30) {
      _streamErrorCount = 0;
    }
    
    _streamErrorCount++;
    _lastStreamError = now;
    
    // If we have multiple stream errors in a short time, it might indicate connection issues
    if (_streamErrorCount >= 3) {
      _logger.warning('Multiple stream errors detected ($_streamErrorCount), treating as connection degradation');
      _metrics.recordError('Multiple stream errors: $error');
      _streamErrorCount = 0; // Reset counter
    }
  }
  
  /// Classify if error is connection-level (affects entire connection)
  bool _isConnectionLevelError(dynamic error) {
    if (error == null) return false;
    
    final errorString = error.toString().toLowerCase();
    
    // Connection-level errors from existing error types
    if (error is ConnectionFailedException) return true;
    if (error is NoConnException) return true;
    if (error is LimitedConnException) return true;
    
    // UDX-specific connection errors
    if (error.runtimeType.toString().contains('UDXConnectionException')) return true;
    if (error.runtimeType.toString().contains('UDXPacketLossException')) return true;
    
    // Socket-level errors
    if (errorString.contains('socket closed') || 
        errorString.contains('connection closed') ||
        errorString.contains('session is closed') ||
        errorString.contains('bad state: session is closed')) {
      return true;
    }
    
    return false;
  }
  
  /// Classify if error is stream-level (affects individual stream)
  bool _isStreamLevelError(dynamic error) {
    if (error == null) return false;
    
    final errorString = error.toString().toLowerCase();
    
    // UDX-specific stream errors
    if (error.runtimeType.toString().contains('UDXStreamException')) return true;
    
    // Stream-level errors
    if (errorString.contains('stream') && !errorString.contains('session')) {
      return true;
    }
    
    return false;
  }
  
  /// Dispose of all monitoring resources
  void dispose() {
    for (final subscription in _subscriptions) {
      subscription.cancel();
    }
    _subscriptions.clear();
    _metrics.dispose();
  }
}
