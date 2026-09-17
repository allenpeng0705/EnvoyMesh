// Represents the state of the candidate finding loop, from metrics.go
enum CandidateLoopState {
  peerSourceRateLimited,
  waitingOnPeerChan,
  waitingForTrigger,
  stopped,
}

// Represents the scheduledWorkTimes struct passed to ScheduledWorkUpdated
// Fields are based on the Go struct in relay_finder.go and usage in metrics.go
class ScheduledWorkTimes {
  final DateTime nextAllowedCallToPeerSource;
  final DateTime nextRefresh;
  final DateTime nextBackoff;
  final DateTime nextOldCandidateCheck;

  ScheduledWorkTimes({
    required this.nextAllowedCallToPeerSource,
    required this.nextRefresh,
    required this.nextBackoff,
    required this.nextOldCandidateCheck,
  });

  // Factory for empty/default state, useful for initialization or reset in metrics
  factory ScheduledWorkTimes.initial() => ScheduledWorkTimes(
        nextAllowedCallToPeerSource: DateTime.fromMillisecondsSinceEpoch(0),
        nextRefresh: DateTime.fromMillisecondsSinceEpoch(0),
        nextBackoff: DateTime.fromMillisecondsSinceEpoch(0),
        nextOldCandidateCheck: DateTime.fromMillisecondsSinceEpoch(0),
      );
}

abstract class MetricsTracer {
  void relayFinderStatus(bool isActive);

  void reservationEnded(int count);
  void reservationOpened(int count);
  // In Go, err is error. In Dart, this would be Exception?
  void reservationRequestFinished(bool isRefresh, Exception? err);

  void relayAddressCount(int count);
  void relayAddressUpdated();

  void candidateChecked(bool supportsCircuitV2);
  void candidateAdded(int count);
  void candidateRemoved(int count);
  void candidateLoopState(CandidateLoopState state);

  void scheduledWorkUpdated(ScheduledWorkTimes scheduledWork);

  void desiredReservations(int count);
}

// A no-op implementation that can be used if metrics are not configured.
class NoOpMetricsTracer implements MetricsTracer {
  const NoOpMetricsTracer();

  @override
  void relayFinderStatus(bool isActive) {}
  @override
  void reservationEnded(int count) {}
  @override
  void reservationOpened(int count) {}
  @override
  void reservationRequestFinished(bool isRefresh, Exception? err) {}
  @override
  void relayAddressCount(int count) {}
  @override
  void relayAddressUpdated() {}
  @override
  void candidateChecked(bool supportsCircuitV2) {}
  @override
  void candidateAdded(int count) {}
  @override
  void candidateRemoved(int count) {}
  @override
  void candidateLoopState(CandidateLoopState state) {}
  @override
  void scheduledWorkUpdated(ScheduledWorkTimes scheduledWork) {}
  @override
  void desiredReservations(int count) {}
}

// Wrapper to make the actual tracer optional, similar to Go's wrappedMetricsTracer
class WrappedMetricsTracer implements MetricsTracer {
  final MetricsTracer? _delegate;

  WrappedMetricsTracer(this._delegate);

  MetricsTracer get effectiveTracer => _delegate ?? const NoOpMetricsTracer();

  @override
  void relayFinderStatus(bool isActive) {
    effectiveTracer.relayFinderStatus(isActive);
  }

  @override
  void reservationEnded(int count) {
    effectiveTracer.reservationEnded(count);
  }

  @override
  void reservationOpened(int count) {
    effectiveTracer.reservationOpened(count);
  }

  @override
  void reservationRequestFinished(bool isRefresh, Exception? err) {
    effectiveTracer.reservationRequestFinished(isRefresh, err);
  }

  @override
  void relayAddressCount(int count) {
    effectiveTracer.relayAddressCount(count);
  }

  @override
  void relayAddressUpdated() {
    effectiveTracer.relayAddressUpdated();
  }

  @override
  void candidateChecked(bool supportsCircuitV2) {
    effectiveTracer.candidateChecked(supportsCircuitV2);
  }

  @override
  void candidateAdded(int count) {
    effectiveTracer.candidateAdded(count);
  }

  @override
  void candidateRemoved(int count) {
    effectiveTracer.candidateRemoved(count);
  }

  @override
  void candidateLoopState(CandidateLoopState state) {
    effectiveTracer.candidateLoopState(state);
  }

  @override
  void scheduledWorkUpdated(ScheduledWorkTimes scheduledWork) {
    effectiveTracer.scheduledWorkUpdated(scheduledWork);
  }

  @override
  void desiredReservations(int count) {
    effectiveTracer.desiredReservations(count);
  }
}
