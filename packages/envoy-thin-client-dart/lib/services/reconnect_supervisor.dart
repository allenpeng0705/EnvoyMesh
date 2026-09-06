import 'dart:async';
import 'dart:developer' as developer;
import 'dart:math';

import 'package:envoy_thin_client/models/stored_node.dart';
import 'package:envoy_thin_client/services/exceptions.dart';

/// Persistent retry loop for an `initial` connection attempt to a
/// paired home node.
///
/// Responsibility split with [HomeRemoteClient] (which has its own
/// post-connect reconnect loop):
///   - `HomeRemoteClient` retries forever *after* a successful first
///     connect, handling WS drops while the app is online.
///   - `ReconnectSupervisor` retries forever *until* a first
///     successful connect, handling app-start failures, transient
///     network outages, and the case where the home node was offline
///     when the user opened the app.
///
/// Lifetime:
///   - The supervisor is owned by [NodeNotifier]. It is constructed
///     in [NodeNotifier.loadPairedNodes] (right after the first
///     `connectToNode` call) and stopped in [NodeNotifier.unpairNode]
///     and [NodeNotifier.switchToNode].
///   - It is **stopped** (not retried forever) when the home node
///     returns [UnauthorizedException] — the token is provably dead,
///     so further attempts are wasted.
///   - It is **stopped** after the first successful connect — the
///     inner client takes over.
///
/// Backoff:
///   - Initial 1s, doubles on each failure, capped at 30s.
///   - `±jitter` (default 20%) is applied to break up thundering herds
///     when many clients reconnect simultaneously (e.g. after a relay
///     restart).
///   - [kick] resets the backoff to the initial delay and schedules
///     an immediate attempt.
class ReconnectSupervisor {
  /// Reads the current target nodeId the supervisor should be
  /// working on. The notifier updates this when the user switches
  /// nodes. If the value changes mid-supervision, the supervisor
  /// bails out (the notifier is responsible for creating a fresh
  /// supervisor with the new target).
  final String? Function() _currentTargetNodeIdProvider;

  /// Reads the `StoredNode` matching the current target nodeId.
  /// Returns null if the node has been unpaired.
  final StoredNode? Function() _getTargetNode;

  /// Invokes the notifier's `connectToNode` for the given node.
  /// Should resolve normally on a successful connect or throw on
  /// failure.
  final Future<void> Function(StoredNode node) _attemptConnect;

  /// Hook for tests and the notifier to observe per-attempt
  /// progress. Called exactly once per attempt, before
  /// [_attemptConnect] is invoked.
  final void Function()? _onAttemptStarted;

  /// Hook for tests and the notifier to observe per-attempt
  /// outcomes. `code` is the typed error category from the
  /// notifier's perspective; the supervisor itself does not
  /// inspect it.
  final void Function(String code, String message)? _onAttemptFailed;

  /// Hook for tests and the notifier. Called after the first
  /// successful connect. The supervisor stops itself on the next
  /// tick (no further retries).
  final void Function()? _onConnected;

  final Duration _initialDelay;
  final Duration _maxDelay;
  final double _jitter;
  final Random _random;

  Timer? _timer;
  Duration _nextDelay;
  bool _stopped = false;
  bool _inFlight = false;
  int _attempt = 0;

  ReconnectSupervisor({
    required String? Function() currentTargetNodeIdProvider,
    required StoredNode? Function() getTargetNode,
    required Future<void> Function(StoredNode node) attemptConnect,
    void Function()? onAttemptStarted,
    void Function(String code, String message)? onAttemptFailed,
    void Function()? onConnected,
    Duration initialDelay = const Duration(seconds: 1),
    Duration maxDelay = const Duration(seconds: 30),
    double jitter = 0.2,
    Random? random,
  })  : _currentTargetNodeIdProvider = currentTargetNodeIdProvider,
        _getTargetNode = getTargetNode,
        _attemptConnect = attemptConnect,
        _onAttemptStarted = onAttemptStarted,
        _onAttemptFailed = onAttemptFailed,
        _onConnected = onConnected,
        _initialDelay = initialDelay,
        _maxDelay = maxDelay,
        _jitter = jitter.clamp(0.0, 1.0),
        _nextDelay = initialDelay,
        _random = random ?? Random();

  /// Whether the supervisor is still scheduled to retry.
  bool get isStopped => _stopped;

  /// Number of attempts made so far (0 if none have fired yet).
  int get attemptCount => _attempt;

  /// Begin the retry loop. Schedules the first attempt after
  /// [_initialDelay]. Safe to call more than once — the second
  /// call is a no-op.
  void start() {
    developer.log('[ReconnectSupervisor.start] called, _stopped=$_stopped, _timer=${_timer != null}');
    if (_stopped) return;
    if (_timer != null) return;
    _scheduleNext(initial: true);
  }

  /// Reset the backoff and trigger an immediate attempt. Used by
  /// the notifier when the user taps "Reconnect now" or when the
  /// `connectivity_plus` listener fires an offline → online edge.
  void kick() {
    if (_stopped) return;
    _timer?.cancel();
    _timer = null;
    _nextDelay = _initialDelay;
    _attempt += 1;
    _onAttemptStarted?.call();
    developer.log('[ReconnectSupervisor.kick] attempt=$_attempt');
    _runAttempt();
  }

  /// Stop the supervisor. No further attempts will be made.
  /// Idempotent.
  void stop() {
    developer.log('[ReconnectSupervisor.stop] called, _stopped=$_stopped');
    if (_stopped) return;
    _stopped = true;
    _timer?.cancel();
    _timer = null;
  }

  // -- Internal --

  void _scheduleNext({bool initial = false}) {
    if (_stopped) return;
    var delay = initial ? _initialDelay : _nextDelay;
    if (_jitter > 0) {
      final low = 1.0 - _jitter;
      final high = 1.0 + _jitter;
      final multiplier = low + _random.nextDouble() * (high - low);
      delay = Duration(
        milliseconds: (delay.inMilliseconds * multiplier).round(),
      );
    }
    if (!initial) {
      // Double the backoff for the next call (capped). The current
      // attempt's delay is the one we just scheduled.
      _nextDelay = Duration(
        milliseconds: min(
          _nextDelay.inMilliseconds * 2,
          _maxDelay.inMilliseconds,
        ),
      );
    }
    developer.log('[_scheduleNext] scheduling next attempt in ${delay.inMilliseconds}ms (initial=$initial)');
    _timer = Timer(delay, () {
      _timer = null;
      if (_stopped) return;
      _attempt += 1;
      _onAttemptStarted?.call();
      _runAttempt();
    });
  }

  Future<void> _runAttempt() async {
    if (_stopped) return;
    if (_inFlight) return;
    _inFlight = true;
    final targetNodeId = _currentTargetNodeIdProvider();
    final node = targetNodeId == null ? null : _getTargetNode();
    developer.log('[_runAttempt] targetNodeId=$targetNodeId, node=${node?.id}, _inFlight=$_inFlight, _stopped=$_stopped');
    if (targetNodeId == null || node == null) {
      _inFlight = false;
      developer.log('[_runAttempt] null node or targetNodeId — stopping supervisor');
      stop();
      return;
    }
    try {
      await _attemptConnect(node);
      if (_stopped) return;
      _inFlight = false;
      _onConnected?.call();
      stop();
    } on UnauthorizedException catch (e) {
      if (_stopped) return;
      _onAttemptFailed?.call('unauthorized', e.toString());
      // Token is provably dead — no point retrying. Caller (the
      // notifier) has already deleted the token and set the
      // `homeNodeErrorCode` to `'unauthorized'`.
      _inFlight = false;
      stop();
    } catch (e) {
      if (_stopped) return;
      _onAttemptFailed?.call('transport', e.toString());
      _inFlight = false;
      _scheduleNext();
    }
  }
}
