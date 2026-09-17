import 'dart:math';

// Export all backoff functionality
export 'backoff_cache.dart';
export 'backoff_connector.dart';
export 'lru_cache.dart';

/// A factory function that creates a BackoffStrategy
typedef BackoffFactory = BackoffStrategy Function();

/// Describes how backoff will be implemented. BackoffStrategies are stateful.
abstract class BackoffStrategy {
  /// Calculates how long the next backoff duration should be, given the prior calls to delay
  Duration delay();

  /// Clears the internal state of the BackoffStrategy
  void reset();
}

/// Jitter implementations taken roughly from https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/

/// Jitter must return a duration between min and max. Min must be lower than, or equal to, max.
typedef Jitter = Duration Function(Duration duration, Duration min, Duration max, Random rng);

/// FullJitter returns a random number, uniformly chosen from the range [min, boundedDur].
/// boundedDur is the duration bounded between min and max.
Duration fullJitter(Duration duration, Duration min, Duration max, Random rng) {
  if (duration <= min) {
    return min;
  }

  final normalizedDur = boundedDuration(duration, min, max) - min;

  return boundedDuration(
    Duration(microseconds: rng.nextInt(normalizedDur.inMicroseconds)) + min,
    min,
    max
  );
}

/// NoJitter returns the duration bounded between min and max
Duration noJitter(Duration duration, Duration min, Duration max, Random rng) {
  return boundedDuration(duration, min, max);
}

/// A base class for randomized backoff strategies
class RandomizedBackoff {
  final Duration min;
  final Duration max;
  final Random rng;

  RandomizedBackoff(this.min, this.max, this.rng);

  Duration boundedDelay(Duration duration) {
    return boundedDuration(duration, min, max);
  }
}

/// Returns a duration bounded between min and max
Duration boundedDuration(Duration d, Duration min, Duration max) {
  if (d < min) {
    return min;
  }
  if (d > max) {
    return max;
  }
  return d;
}

/// A base class for backoff strategies that track attempt numbers
class AttemptBackoff extends RandomizedBackoff {
  int attempt = 0;
  final Jitter jitter;

  AttemptBackoff(Duration min, Duration max, this.jitter, Random rng)
      : super(min, max, rng);

  @override
  void reset() {
    attempt = 0;
  }
}

/// Creates a BackoffFactory with a constant backoff duration
BackoffFactory newFixedBackoff(Duration delay) {
  return () => FixedBackoff(delay);
}

/// A backoff strategy with a constant delay
class FixedBackoff implements BackoffStrategy {
  final Duration delay_;

  FixedBackoff(this.delay_);

  @override
  Duration delay() {
    return delay_;
  }

  @override
  void reset() {}
}

/// Creates a BackoffFactory with backoff of the form c0*x^0, c1*x^1, ...cn*x^n where x is the attempt number
/// jitter is the function for adding randomness around the backoff
/// timeUnits are the units of time the polynomial is evaluated in
/// polyCoefs is the array of polynomial coefficients from [c0, c1, ... cn]
BackoffFactory newPolynomialBackoff(
    Duration min,
    Duration max,
    Jitter jitter,
    Duration timeUnits,
    List<double> polyCoefs,
    Random rng) {
  return () => PolynomialBackoff(
    AttemptBackoff(min, max, jitter, rng),
    timeUnits,
    polyCoefs,
  );
}

/// A backoff strategy based on a polynomial function of the attempt number
class PolynomialBackoff implements BackoffStrategy {
  final AttemptBackoff attemptBackoff;
  final Duration timeUnits;
  final List<double> poly;

  PolynomialBackoff(this.attemptBackoff, this.timeUnits, this.poly);

  @override
  Duration delay() {
    double polySum;
    switch (poly.length) {
      case 0:
        return Duration.zero;
      case 1:
        polySum = poly[0];
        break;
      default:
        polySum = poly[0];
        final attempt = attemptBackoff.attempt;
        attemptBackoff.attempt++;

        for (int i = 1; i < poly.length; i++) {
          polySum += pow(attempt, i) * poly[i];
        }
    }

    return attemptBackoff.jitter(
      Duration(microseconds: (timeUnits.inMicroseconds * polySum).round()),
      attemptBackoff.min,
      attemptBackoff.max,
      attemptBackoff.rng
    );
  }

  @override
  void reset() {
    attemptBackoff.reset();
  }
}

/// Creates a BackoffFactory with backoff of the form base^x + offset where x is the attempt number
/// jitter is the function for adding randomness around the backoff
/// timeUnits are the units of time the base^x is evaluated in
BackoffFactory newExponentialBackoff(
    Duration min,
    Duration max,
    Jitter jitter,
    Duration timeUnits,
    double base,
    Duration offset,
    Random rng) {
  return () => ExponentialBackoff(
    AttemptBackoff(min, max, jitter, rng),
    timeUnits,
    base,
    offset,
  );
}

/// A backoff strategy based on an exponential function of the attempt number
class ExponentialBackoff implements BackoffStrategy {
  final AttemptBackoff attemptBackoff;
  final Duration timeUnits;
  final double base;
  final Duration offset;

  ExponentialBackoff(this.attemptBackoff, this.timeUnits, this.base, this.offset);

  @override
  Duration delay() {
    final attempt = attemptBackoff.attempt;
    attemptBackoff.attempt++;

    final durationMicros = (pow(base, attempt) * timeUnits.inMicroseconds).round();
    return attemptBackoff.jitter(
      Duration(microseconds: durationMicros) + offset,
      attemptBackoff.min,
      attemptBackoff.max,
      attemptBackoff.rng
    );
  }

  @override
  void reset() {
    attemptBackoff.reset();
  }
}

/// Creates a BackoffFactory with backoff of the roughly of the form base^x where x is the attempt number.
/// Delays start at the minimum duration and after each attempt delay = rand(min, delay * base), bounded by the max
/// See https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/ for more information
BackoffFactory newExponentialDecorrelatedJitter(
    Duration min,
    Duration max,
    double base,
    Random rng) {
  return () => ExponentialDecorrelatedJitter(
    RandomizedBackoff(min, max, rng),
    base,
  );
}

/// A backoff strategy that uses decorrelated jitter with exponential backoff
class ExponentialDecorrelatedJitter implements BackoffStrategy {
  final RandomizedBackoff randomizedBackoff;
  final double base;
  Duration lastDelay = Duration.zero;

  ExponentialDecorrelatedJitter(this.randomizedBackoff, this.base);

  @override
  Duration delay() {
    if (lastDelay < randomizedBackoff.min) {
      lastDelay = randomizedBackoff.min;
      return lastDelay;
    }

    final nextMax = (lastDelay.inMicroseconds * base).round();
    lastDelay = boundedDuration(
      Duration(microseconds: randomizedBackoff.rng.nextInt(nextMax - randomizedBackoff.min.inMicroseconds) + randomizedBackoff.min.inMicroseconds),
      randomizedBackoff.min,
      randomizedBackoff.max
    );

    return lastDelay;
  }

  @override
  void reset() {
    lastDelay = Duration.zero;
  }
}
