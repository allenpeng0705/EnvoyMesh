/// The dial budget for the thin client's candidate walk.
///
/// ## What this is, and what it is not
///
/// The family's home nodes meter dial pressure with `packages/network/src/dial-budget.ts`. That
/// meter reads a **libp2p dial queue** (up to 64 outstanding dials) and answers "may I enqueue one
/// more?"; it has no acquire/release and no timing. A phone has no such queue: its walk is
/// *sequential*, one candidate at a time, and its scarce resource is not queue depth but **elapsed
/// time** on a battery. So this is not a port of that meter, and it deliberately does not borrow its
/// vocabulary (`busy` / `congested` / `saturated` / `hardCap` name thresholds on a queue length).
/// A phone with one dial in flight is never "congested"; saying so would be a name for something
/// weaker than the thing named.
///
/// What it enforces, precisely:
///
///   1. **A per-candidate timeout.** Every candidate dial — open *and* the home's `connected`
///      event — must land inside [DialBudget.perCandidateTimeout]. The walk supplies the value to
///      `HomeRemoteClientOptions.perCandidateTimeoutMs`, which is where it is enforced; this class
///      owns the number so the three parts of the budget are decided in one place.
///   2. **A bounded number of attempts per walk.** A store can hold more addresses than are worth
///      dialling in one pass (a QR with a relay roster, several P2P hops and a community relay).
///      At most [DialBudget.maxAttemptsPerWalk] of the highest-priority candidates are tried per
///      walk; the tail waits for the next walk rather than keeping the phone's radio busy.
///   3. **Deferral under pressure.** After [DialBudget.pressureThreshold] candidate dials fail
///      inside a rolling [DialBudget.pressureWindow], the meter defers the **whole walk** for
///      [DialBudget.deferFor] from the most recent failure: `plan` returns no candidates at all, so
///      not even the cheapest rung is dialled. A successful connect clears both the failures and the
///      deferral. This is the one place this meter is *stricter* than the family's: that one still
///      lets `priorityDial`/`forceFreshDial` through below its hard cap, because a home node's
///      priority dial is a user action with its own answer. Here every walk is speculative — the
///      user is looking at a screen, not waiting on one specific call — so a bad network is allowed
///      to stop the walk, and the caller reschedules.
///
/// ## Where it lives
///
/// Here, next to [HomeRemoteClient], because the walk it meters is that client's — a second product
/// adopting the thin client gets the same policy rather than re-deriving it. It is **not** wired
/// into [HomeRemoteClient] itself: doing so would change EnvoyGo's dialling under the guise of
/// adding a knob. The caller builds the walk, so the caller holds the meter; EnvoyGo can adopt it
/// now without a flag day.
library;

import 'package:envoy_thin_client/services/home_remote_client.dart';

/// The three limits one candidate walk is held to. Immutable; see the library doc for what each
/// one enforces.
class DialBudget {
  const DialBudget({
    this.perCandidateTimeout = const Duration(seconds: 8),
    this.maxAttemptsPerWalk = 4,
    this.pressureWindow = const Duration(seconds: 30),
    this.pressureThreshold = 3,
    this.deferFor = const Duration(seconds: 10),
  }) : assert(maxAttemptsPerWalk > 0, 'a walk with no attempts can never connect'),
       assert(pressureThreshold > 0, 'a threshold of zero would defer on the first success');

  /// Wall-clock bound on one candidate: the transport opening **and** the home proving it is there.
  final Duration perCandidateTimeout;

  /// Most candidates one walk may attempt; the tail is left to the next walk.
  final int maxAttemptsPerWalk;

  /// How far back failures are counted.
  final Duration pressureWindow;

  /// Failures inside [pressureWindow] that put the meter under pressure.
  final int pressureThreshold;

  /// How long the walk is deferred after the most recent failure that tripped the threshold.
  final Duration deferFor;

  int get perCandidateTimeoutMs => perCandidateTimeout.inMilliseconds;
}

/// Mutable state for one budget: recent failures, and whether the walk is deferred right now.
///
/// Not thread-safe and not shared: one meter belongs to one client's walk. [now] is a parameter on
/// every timed method so a test can move the clock instead of sleeping through the window.
class DialBudgetMeter {
  DialBudgetMeter([this.budget = const DialBudget()]);

  final DialBudget budget;

  final List<int> _failureTimesMs = <int>[];
  int? _deferredUntilMs;

  /// Failures inside the rolling window, as of the last [plan] / [recordFailure] / [isDeferredAt]
  /// call. Exposed for the caller's diagnostics, not for control flow.
  int get failuresInWindow => _failureTimesMs.length;

  /// True when the walk must not be started.
  bool isDeferredAt(DateTime now) {
    _prune(now);
    final until = _deferredUntilMs;
    if (until == null) return false;
    if (until <= now.millisecondsSinceEpoch) {
      _deferredUntilMs = null;
      return false;
    }
    return true;
  }

  /// How much longer the walk stays deferred; [Duration.zero] when it is not.
  Duration deferralRemainingAt(DateTime now) {
    if (!isDeferredAt(now)) return Duration.zero;
    return Duration(milliseconds: _deferredUntilMs! - now.millisecondsSinceEpoch);
  }

  /// The candidates this walk may attempt, in the order it must attempt them.
  ///
  /// Empty while deferred — that is the deferral, not an error: the caller reschedules. Otherwise
  /// the highest-priority candidates, capped at [DialBudget.maxAttemptsPerWalk].
  List<HomeRemoteCandidate> plan(
    List<HomeRemoteCandidate> candidates, {
    DateTime? now,
  }) {
    if (isDeferredAt(now ?? DateTime.now())) return const <HomeRemoteCandidate>[];
    if (candidates.length <= budget.maxAttemptsPerWalk) return candidates;
    return candidates.take(budget.maxAttemptsPerWalk).toList();
  }

  /// One candidate dial failed. Counts it, and arms the deferral when the window is full.
  void recordFailure({DateTime? now}) {
    final at = now ?? DateTime.now();
    _prune(at);
    _failureTimesMs.add(at.millisecondsSinceEpoch);
    final until = at.millisecondsSinceEpoch + budget.deferFor.inMilliseconds;
    if (_failureTimesMs.length >= budget.pressureThreshold) {
      // `max` rather than assign: a failure inside an existing deferral extends it, so a walk that
      // keeps failing does not shorten its own rest.
      _deferredUntilMs =
          _deferredUntilMs == null || until > _deferredUntilMs! ? until : _deferredUntilMs;
    }
  }

  /// A candidate connected. The network is demonstrably fine, so nothing is deferred any more.
  void recordSuccess() {
    _failureTimesMs.clear();
    _deferredUntilMs = null;
  }

  void _prune(DateTime now) {
    final cutoff =
        now.millisecondsSinceEpoch - budget.pressureWindow.inMilliseconds;
    _failureTimesMs.removeWhere((t) => t <= cutoff);
  }
}
