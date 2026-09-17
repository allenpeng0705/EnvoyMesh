import 'dart:async';

import 'package:dart_libp2p/core/peer/addr_info.dart'; // For AddrInfo
import 'package:dart_libp2p/core/host/host.dart'; // For Host interface
import './autorelay_metrics.dart'; // For MetricsTracer


// Equivalent to Go's PeerSource func(ctx context.Context, num int) <-chan peer.AddrInfo
// The context is handled by Stream cancellation.
typedef PeerSource = Stream<AddrInfo> Function(int numPeers);

// ClockWithInstantTimer and InstantTimer interfaces
abstract class InstantTimer {
  Stream<DateTime> get stream; // Equivalent to Ch()
  bool reset(DateTime d);
  bool stop();
}

abstract class Clock {
  DateTime now();
  Duration since(DateTime t);
  InstantTimer createInstantTimer(DateTime when);
}

class RealInstantTimer implements InstantTimer {
  final StreamController<DateTime> _controller = StreamController<DateTime>.broadcast();
  Timer? _timer;
  DateTime _triggerTime;

  RealInstantTimer(this._triggerTime) {
    _scheduleTimer();
  }

  void _scheduleTimer() {
    _timer?.cancel();
    final delay = _triggerTime.difference(DateTime.now());
    if (!delay.isNegative) {
      _timer = Timer(delay, () {
        if (!_controller.isClosed) {
          _controller.add(_triggerTime);
          // For a one-shot timer, we might close it or require re-arming.
          // Go's time.Timer typically needs Reset for reuse.
          // This simple version just fires. For periodic, use Timer.periodic.
        }
      });
    }
  }

  @override
  Stream<DateTime> get stream => _controller.stream;

  @override
  bool reset(DateTime d) {
    final bool isActive = _timer?.isActive ?? false;
    _triggerTime = d;
    _scheduleTimer();
    return isActive;
  }

  @override
  bool stop() {
    final bool isActive = _timer?.isActive ?? false;
    _timer?.cancel();
    _controller.close();
    return isActive;
  }
}

class RealClock implements Clock {
  const RealClock();

  @override
  DateTime now() => DateTime.now();

  @override
  Duration since(DateTime t) => DateTime.now().difference(t);

  @override
  InstantTimer createInstantTimer(DateTime when) => RealInstantTimer(when);
}

class AutoRelayConfig {
  final Clock clock;
  final PeerSource? peerSourceCallback;
  final List<AddrInfo>? staticRelays;
  final Duration minInterval;
  final int minCandidates;
  final int maxCandidates;
  final Duration bootDelay;
  final Duration backoff;
  final int desiredRelays;
  final Duration maxCandidateAge;
  final bool setMinCandidatesFlag; // Corresponds to setMinCandidates in Go
  final MetricsTracer? metricsTracer;

  AutoRelayConfig({
    Clock? clock,
    this.peerSourceCallback,
    this.staticRelays,
    Duration? minInterval,
    int? minCandidates,
    int? maxCandidates,
    Duration? bootDelay,
    Duration? backoff,
    int? desiredRelays,
    Duration? maxCandidateAge,
    this.metricsTracer,
  })  : clock = clock ?? const RealClock(),
        minInterval = minInterval ?? const Duration(seconds: 30),
        minCandidates = minCandidates ?? 4,
        maxCandidates = maxCandidates ?? 20,
        bootDelay = bootDelay ?? const Duration(minutes: 3),
        backoff = backoff ?? const Duration(hours: 1),
        desiredRelays = desiredRelays ?? 2,
        maxCandidateAge = maxCandidateAge ?? const Duration(minutes: 30),
        // Internal consistency checks
        setMinCandidatesFlag = minCandidates != null {
    if (peerSourceCallback != null && staticRelays != null) {
      throw ArgumentError(
          'Cannot provide both peerSourceCallback and staticRelays. They are mutually exclusive.');
    }
    if (this.minCandidates > this.maxCandidates) {
      throw ArgumentError(
          'minCandidates cannot be greater than maxCandidates. Got min: ${this.minCandidates}, max: ${this.maxCandidates}');
    }
    if (this.desiredRelays == 0 && (staticRelays == null || staticRelays!.isEmpty)) {
        // If desiredRelays is 0, it usually means it's derived from staticRelays.
        // If staticRelays is also empty/null, this might be an issue unless peerSource is very effective.
        // The Go code adjusts desiredRelays in WithStaticRelays.
    }
     if (staticRelays != null && staticRelays!.isNotEmpty) {
        // If static relays are provided, they often dictate min/max candidates and desired relays.
        // The Go WithStaticRelays option adjusts these.
        // Here, we assume if they are passed, they are the source of truth,
        // and the user should set other params accordingly or we use defaults that might be overridden
        // by a more specific factory method if we create one later.
        // For simplicity now, direct assignment.
     }
  }

  // Factory constructor for static relays to mimic Go's WithStaticRelays behavior more closely
  factory AutoRelayConfig.static(
    List<AddrInfo> staticRelays, {
    Clock? clock,
    Duration? bootDelay, // bootDelay is not set by Go's WithStaticRelays
    Duration? backoff,   // backoff is not set by Go's WithStaticRelays
    Duration? maxCandidateAge, // maxCandidateAge is not set by Go's WithStaticRelays
    Duration? minInterval, // minInterval is not set by Go's WithStaticRelays
    MetricsTracer? metricsTracer,
  }) {
    if (staticRelays.isEmpty) {
      throw ArgumentError('staticRelays list cannot be empty if provided.');
    }
    return AutoRelayConfig(
      clock: clock,
      staticRelays: staticRelays,
      // In Go, WithStaticRelays sets peerSource, minCandidates, maxCandidates, and desiredRelays.
      // minCandidates, maxCandidates, desiredRelays are set to len(staticRelays).
      minCandidates: staticRelays.length,
      maxCandidates: staticRelays.length,
      desiredRelays: staticRelays.length,
      // Other parameters use defaults or provided values
      bootDelay: bootDelay,
      backoff: backoff,
      maxCandidateAge: maxCandidateAge,
      minInterval: minInterval,
      metricsTracer: metricsTracer,
    );
  }

  // Effective PeerSource considering static relays
  PeerSource get effectivePeerSource {
    if (staticRelays != null && staticRelays!.isNotEmpty) {
      return (int numPeers) {
        final controller = StreamController<AddrInfo>();
        final effectiveNum = numPeers < staticRelays!.length ? numPeers : staticRelays!.length;
        for (int i = 0; i < effectiveNum; i++) {
          controller.add(staticRelays![i]);
        }
        controller.close();
        return controller.stream;
      };
    }
    if (peerSourceCallback != null) {
      return peerSourceCallback!;
    }
    throw StateError('AutoRelayConfig must have either staticRelays or a peerSourceCallback.');
  }
}
