/// Package backoff provides an exponential backoff implementation.

import 'dart:async';

/// Default delay for exponential backoff
const Duration defaultDelay = Duration(milliseconds: 100);

/// Default maximum delay for exponential backoff
const Duration defaultMaxDelay = Duration(minutes: 1);

/// ExpBackoff implements an exponential backoff mechanism.
class ExpBackoff {
  /// Initial delay duration
  Duration delay;

  /// Maximum delay duration
  Duration maxDelay;

  /// Number of consecutive failures
  int _failures = 0;

  /// Timestamp of the last run
  DateTime? _lastRun;

  /// Creates a new ExpBackoff instance with optional delay and maxDelay parameters.
  ExpBackoff({
    this.delay = defaultDelay,
    this.maxDelay = defaultMaxDelay,
  });

  /// Initializes default values if not set
  void _init() {
    if (delay == Duration.zero) {
      delay = defaultDelay;
    }
    if (maxDelay == Duration.zero) {
      maxDelay = defaultMaxDelay;
    }
  }

  /// Calculates the current delay based on the number of failures
  Duration _calcDelay() {
    final delayMillis = delay.inMilliseconds * (1 << (_failures - 1));
    final calculatedDelay = Duration(milliseconds: delayMillis);
    return calculatedDelay < maxDelay ? calculatedDelay : maxDelay;
  }

  /// Runs the provided function with exponential backoff.
  /// 
  /// Returns a tuple containing the error (if any) and a boolean indicating
  /// whether the function was actually run.
  Future<(Object?, bool)> run(Future<void> Function() f) async {
    _init();

    if (_failures != 0) {
      if (_lastRun != null) {
        final sinceLastRun = DateTime.now().difference(_lastRun!);
        if (sinceLastRun < _calcDelay()) {
          return (null, false);
        }
      }
    }

    _lastRun = DateTime.now();
    try {
      await f();
      _failures = 0;
      return (null, true);
    } catch (e) {
      _failures++;
      return (e, true);
    }
  }
}