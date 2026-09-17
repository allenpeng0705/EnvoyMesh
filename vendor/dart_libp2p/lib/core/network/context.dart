import 'dart:async';

/// Context class for network operations
class Context {
  final Map<Object, Object?> _values = {};
  final Duration? _timeout;
  final Completer<void> _completer = Completer<void>();

  /// Creates a new Context
  Context({Duration? timeout}) : _timeout = timeout {
    if (timeout != null) {
      Timer(timeout, () {
        if (!_completer.isCompleted) {
          _completer.completeError(TimeoutException('Context timed out', timeout));
        }
      });
      
      // Add error handler to prevent unhandled exceptions if nobody awaits context.done
      // This is defensive programming - ideally Context(timeout:) shouldn't be used,
      // but if it is, we prevent app crashes from unobserved errors
      _completer.future.catchError((error) {
        // Silently catch the error if nobody is listening
        // In production, you might want to log this
        return;
      });
    }
  }

  /// Default timeout for a single call to `DialPeer`
  static const Duration dialPeerTimeout = Duration(seconds: 60);

  /// Creates a new Context with a value
  Context withValue(Object key, Object? value) {
    final newContext = Context(timeout: _timeout);
    newContext._values.addAll(_values);
    newContext._values[key] = value;
    return newContext;
  }

  /// Gets a value from the Context
  Object? getValue(Object key) => _values[key];

  /// Creates a new Context with the force direct dial option
  Context withForceDirectDial(String reason) {
    return withValue(_forceDirectDialKey, reason);
  }

  /// Gets the force direct dial option from the Context
  (bool, String) getForceDirectDial() {
    final value = getValue(_forceDirectDialKey);
    if (value != null) {
      return (true, value as String);
    }
    return (false, '');
  }

  /// Creates a new Context with the simultaneous connect option
  Context withSimultaneousConnect(bool isClient, String reason) {
    return withValue(
      isClient ? _simConnectIsClientKey : _simConnectIsServerKey,
      reason,
    );
  }

  /// Gets the simultaneous connect option from the Context
  (bool, bool, String) getSimultaneousConnect() {
    final clientValue = getValue(_simConnectIsClientKey);
    if (clientValue != null) {
      return (true, true, clientValue as String);
    }
    
    final serverValue = getValue(_simConnectIsServerKey);
    if (serverValue != null) {
      return (true, false, serverValue as String);
    }
    
    return (false, false, '');
  }

  /// Creates a new Context with the no dial option
  Context withNoDial(String reason) {
    return withValue(_noDialKey, reason);
  }

  /// Gets the no dial option from the Context
  (bool, String) getNoDial() {
    final value = getValue(_noDialKey);
    if (value != null) {
      return (true, value as String);
    }
    return (false, '');
  }

  /// Gets the dial peer timeout from the Context
  Duration getDialPeerTimeout() {
    final timeout = getValue(_dialPeerTimeoutKey);
    if (timeout != null) {
      return timeout as Duration;
    }
    return dialPeerTimeout;
  }

  /// Creates a new Context with the dial peer timeout
  Context withDialPeerTimeout(Duration timeout) {
    return withValue(_dialPeerTimeoutKey, timeout);
  }

  /// Creates a new Context with the allow limited connection option
  Context withAllowLimitedConn(String reason) {
    return withValue(_allowLimitedConnKey, reason);
  }

  /// Gets the allow limited connection option from the Context
  (bool, String) getAllowLimitedConn() {
    final value = getValue(_allowLimitedConnKey);
    if (value != null) {
      return (true, value as String);
    }
    return (false, '');
  }

  /// Creates a new Context with the use transient option
  /// 
  /// Deprecated: Use withAllowLimitedConn instead
  Context withUseTransient(String reason) {
    return withAllowLimitedConn(reason);
  }

  /// Gets the use transient option from the Context
  /// 
  /// Deprecated: Use getAllowLimitedConn instead
  (bool, String) getUseTransient() {
    return getAllowLimitedConn();
  }

  /// Future that completes when the context is done
  Future<void> get done => _completer.future;

  /// Whether the context is done
  bool get isDone => _completer.isCompleted;

  /// Cancel the context
  void cancel([Object? reason]) {
    if (!_completer.isCompleted) {
      _completer.completeError(reason ?? 'Context cancelled');
    }
  }
}

// Context keys
const _noDialKey = 'noDial';
const _forceDirectDialKey = 'forceDirectDial';
const _allowLimitedConnKey = 'allowLimitedConn';
const _simConnectIsServerKey = 'simConnectIsServer';
const _simConnectIsClientKey = 'simConnectIsClient';
const _dialPeerTimeoutKey = 'dialPeerTimeout';