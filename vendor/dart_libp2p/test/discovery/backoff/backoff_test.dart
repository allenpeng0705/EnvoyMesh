import 'dart:math';
import 'package:test/test.dart';
import 'package:dart_libp2p/p2p/discovery/backoff/backoff.dart';

void main() {
  group('Backoff Strategies', () {
    test('FixedBackoff returns constant delay', () {
      final delay = Duration(milliseconds: 100);
      final backoff = newFixedBackoff(delay)();

      expect(backoff.delay(), equals(delay));
      expect(backoff.delay(), equals(delay));

      backoff.reset();
      expect(backoff.delay(), equals(delay));
    });

    test('PolynomialBackoff calculates correct delay', () {
      final min = Duration(milliseconds: 10);
      final max = Duration(milliseconds: 1000);
      final timeUnits = Duration(milliseconds: 1);
      final polyCoefs = [1.0, 2.0]; // 1 + 2x
      final rng = Random(42); // Fixed seed for reproducibility

      final backoff = newPolynomialBackoff(
        min,
        max,
        noJitter,
        timeUnits,
        polyCoefs,
        rng,
      )();

      // First delay: 1 + 2*0 = 1ms
      expect(backoff.delay(), equals(Duration(milliseconds: 10)));

      // Second delay: 1 + 2*1 = 3ms, but min is 10ms
      expect(backoff.delay(), equals(Duration(milliseconds: 10)));

      // Third delay: 1 + 2*2 = 5ms, but min is 10ms
      expect(backoff.delay(), equals(Duration(milliseconds: 10)));

      backoff.reset();

      // After reset, first delay: 1 + 2*0 = 1ms, but min is 10ms
      expect(backoff.delay(), equals(Duration(milliseconds: 10)));
    });

    test('ExponentialBackoff calculates correct delay', () {
      final min = Duration(milliseconds: 10);
      final max = Duration(milliseconds: 1000);
      final timeUnits = Duration(milliseconds: 1);
      final base = 2.0;
      final offset = Duration(milliseconds: 5);
      final rng = Random(42); // Fixed seed for reproducibility

      final backoff = newExponentialBackoff(
        min,
        max,
        noJitter,
        timeUnits,
        base,
        offset,
        rng,
      )();

      // First delay: 2^0 + 5 = 6ms, but min is 10ms
      expect(backoff.delay(), equals(Duration(milliseconds: 10)));

      // Second delay: 2^1 + 5 = 7ms, but min is 10ms
      expect(backoff.delay(), equals(Duration(milliseconds: 10)));

      // Third delay: 2^2 + 5 = 9ms, but min is 10ms
      expect(backoff.delay(), equals(Duration(milliseconds: 10)));

      backoff.reset();

      // After reset, first delay: 2^0 + 5 = 6ms, but min is 10ms
      expect(backoff.delay(), equals(Duration(milliseconds: 10)));
    });

    test('ExponentialDecorrelatedJitter calculates correct delay', () {
      final min = Duration(milliseconds: 10);
      final max = Duration(milliseconds: 1000);
      final base = 2.0;
      final rng = Random(42); // Fixed seed for reproducibility

      final backoff = newExponentialDecorrelatedJitter(
        min,
        max,
        base,
        rng,
      )();

      // First delay: min = 10ms
      expect(backoff.delay(), equals(min));

      // Second delay: random between min and min*base
      final secondDelay = backoff.delay();
      expect(secondDelay, greaterThanOrEqualTo(min));
      expect(secondDelay, lessThanOrEqualTo(Duration(milliseconds: (min.inMilliseconds * base).round())));

      backoff.reset();

      // After reset, first delay: min = 10ms
      expect(backoff.delay(), equals(min));
    });

    test('Jitter functions work correctly', () {
      final duration = Duration(milliseconds: 100);
      final min = Duration(milliseconds: 10);
      final max = Duration(milliseconds: 1000);
      final rng = Random(42); // Fixed seed for reproducibility

      // NoJitter returns the bounded duration
      expect(noJitter(duration, min, max, rng), equals(duration));
      expect(noJitter(Duration(milliseconds: 5), min, max, rng), equals(min));
      expect(noJitter(Duration(milliseconds: 2000), min, max, rng), equals(max));

      // FullJitter returns a random duration between min and bounded duration
      final jittered = fullJitter(duration, min, max, rng);
      expect(jittered, greaterThanOrEqualTo(min));
      expect(jittered, lessThanOrEqualTo(duration));
    });
  });

  group('LRU Cache', () {
    test('Basic operations work correctly', () {
      final cache = LRUCache<String, int>(3);

      cache.put('a', 1);
      cache.put('b', 2);
      cache.put('c', 3);

      expect(cache.get('a'), equals(1));
      expect(cache.get('b'), equals(2));
      expect(cache.get('c'), equals(3));

      // Add a new item, should evict the least recently used (a)
      cache.put('d', 4);

      expect(cache.get('a'), isNull);
      expect(cache.get('b'), equals(2));
      expect(cache.get('c'), equals(3));
      expect(cache.get('d'), equals(4));

      // Access b, making c the least recently used
      cache.get('b');

      // Add a new item, should evict the least recently used (c)
      cache.put('e', 5);

      expect(cache.get('c'), isNull);
      expect(cache.get('b'), equals(2));
      expect(cache.get('d'), equals(4));
      expect(cache.get('e'), equals(5));
    });
  });
}
