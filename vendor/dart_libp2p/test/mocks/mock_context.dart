import 'dart:async';

import 'package:dart_libp2p/core/network/context.dart';

/// A mock implementation of Context for testing
class MockContext implements Context {
  /// Whether the context is done
  bool _isDone = false;

  /// The completer for the done future
  final Completer<void> _doneCompleter = Completer<void>();

  /// Values stored in the context
  final Map<Object, Object?> _values = {};

  /// Timeout for the context
  final Duration? _timeout;

  /// Creates a new MockContext
  MockContext({Duration? timeout}) : _timeout = timeout {
    if (timeout != null) {
      Timer(timeout, () {
        if (!_doneCompleter.isCompleted) {
          _doneCompleter.completeError(TimeoutException('Context timed out', timeout));
        }
      });
    }
  }

  @override
  Future<void> get done => _doneCompleter.future;

  @override
  bool get isDone => _doneCompleter.isCompleted;

  @override
  Object? getValue(Object key) => _values[key];

  @override
  Context withValue(Object key, Object? value) {
    final newContext = MockContext(timeout: _timeout);
    newContext._values.addAll(_values);
    newContext._values[key] = value;
    return newContext;
  }

  @override
  Context withForceDirectDial(String reason) {
    return withValue(_forceDirectDialKey, reason);
  }

  @override
  (bool, String) getForceDirectDial() {
    final value = getValue(_forceDirectDialKey);
    if (value != null) {
      return (true, value as String);
    }
    return (false, '');
  }

  @override
  Context withSimultaneousConnect(bool isClient, String reason) {
    return withValue(
      isClient ? _simConnectIsClientKey : _simConnectIsServerKey,
      reason,
    );
  }

  @override
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

  @override
  Context withNoDial(String reason) {
    return withValue(_noDialKey, reason);
  }

  @override
  (bool, String) getNoDial() {
    final value = getValue(_noDialKey);
    if (value != null) {
      return (true, value as String);
    }
    return (false, '');
  }

  @override
  Duration getDialPeerTimeout() {
    final timeout = getValue(_dialPeerTimeoutKey);
    if (timeout != null) {
      return timeout as Duration;
    }
    return Context.dialPeerTimeout;
  }

  @override
  Context withDialPeerTimeout(Duration timeout) {
    return withValue(_dialPeerTimeoutKey, timeout);
  }

  @override
  Context withAllowLimitedConn(String reason) {
    return withValue(_allowLimitedConnKey, reason);
  }

  @override
  (bool, String) getAllowLimitedConn() {
    final value = getValue(_allowLimitedConnKey);
    if (value != null) {
      return (true, value as String);
    }
    return (false, '');
  }

  @override
  Context withUseTransient(String reason) {
    return withAllowLimitedConn(reason);
  }

  @override
  (bool, String) getUseTransient() {
    return getAllowLimitedConn();
  }

  @override
  void cancel([Object? reason]) {
    if (!_doneCompleter.isCompleted) {
      _doneCompleter.completeError(reason ?? 'Context cancelled');
    }
  }

  /// Completes the context (for testing purposes)
  void complete() {
    if (!_doneCompleter.isCompleted) {
      _doneCompleter.complete();
    }
  }

  /// Completes the context with an error (for testing purposes)
  void completeError(Object error, [StackTrace? stackTrace]) {
    if (!_doneCompleter.isCompleted) {
      _doneCompleter.completeError(error, stackTrace);
    }
  }
}

// Context keys (copied from Context class)
const _noDialKey = 'noDial';
const _forceDirectDialKey = 'forceDirectDial';
const _allowLimitedConnKey = 'allowLimitedConn';
const _simConnectIsServerKey = 'simConnectIsServer';
const _simConnectIsClientKey = 'simConnectIsClient';
const _dialPeerTimeoutKey = 'dialPeerTimeout';
