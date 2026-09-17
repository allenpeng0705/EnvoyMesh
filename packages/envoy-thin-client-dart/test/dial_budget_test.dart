// The dial budget, tested where it lives.
//
// Each test moves the clock rather than sleeping: a budget that can only be observed by waiting out
// its own windows is a budget nobody will test, and a test that waits is a test that flakes.

import 'package:envoy_thin_client/services/dial_budget.dart';
import 'package:envoy_thin_client/services/home_remote_client.dart';
import 'package:test/test.dart';

HomeRemoteCandidate candidate(String name) =>
    HomeRemoteCandidate(name: name, url: 'ws://$name/ws');

const budget = DialBudget(
  perCandidateTimeout: Duration(milliseconds: 2500),
  maxAttemptsPerWalk: 3,
  pressureWindow: Duration(seconds: 30),
  pressureThreshold: 3,
  deferFor: Duration(seconds: 10),
);

void main() {
  test('the per-candidate timeout is the walk\'s, in milliseconds', () {
    expect(budget.perCandidateTimeoutMs, 2500);
  });

  test('a walk is capped at the attempt budget, highest priority first', () {
    final meter = DialBudgetMeter(budget);
    final planned = meter.plan(
      [candidate('lan'), candidate('p2p-direct'), candidate('relay'), candidate('relay-1')],
      now: DateTime(2026),
    );
    expect(planned.map((c) => c.name), ['lan', 'p2p-direct', 'relay']);
  });

  test('a walk shorter than the budget is returned whole and in order', () {
    final meter = DialBudgetMeter(budget);
    final planned = meter.plan(
      [candidate('lan'), candidate('relay')],
      now: DateTime(2026),
    );
    expect(planned.map((c) => c.name), ['lan', 'relay']);
  });

  test('pressure defers the whole walk, not just its tail', () {
    final meter = DialBudgetMeter(budget);
    final now = DateTime(2026, 1, 1, 12);

    meter.recordFailure(now: now);
    meter.recordFailure(now: now);
    expect(meter.isDeferredAt(now), isFalse, reason: 'two failures are not pressure');

    meter.recordFailure(now: now);
    expect(meter.isDeferredAt(now), isTrue);
    // Not even the cheapest rung: the deferral is the walk's, not the tail's.
    expect(meter.plan([candidate('lan'), candidate('relay')], now: now), isEmpty);
    expect(meter.deferralRemainingAt(now), const Duration(seconds: 10));
  });

  test('the deferral expires on the clock, and a success clears it early', () {
    final meter = DialBudgetMeter(budget);
    final start = DateTime(2026, 1, 1, 12);
    for (var i = 0; i < 3; i++) {
      meter.recordFailure(now: start);
    }

    expect(
      meter.isDeferredAt(start.add(const Duration(seconds: 9))),
      isTrue,
      reason: 'inside deferFor the walk is still held',
    );
    expect(
      meter.isDeferredAt(start.add(const Duration(seconds: 10))),
      isFalse,
      reason: 'at deferFor the hold is over',
    );
    expect(meter.deferralRemainingAt(start.add(const Duration(seconds: 10))), Duration.zero);

    // A success is proof the network works, so pressure is dropped immediately.
    meter.recordFailure(now: start.add(const Duration(seconds: 1)));
    meter.recordFailure(now: start.add(const Duration(seconds: 2)));
    meter.recordFailure(now: start.add(const Duration(seconds: 3)));
    expect(meter.isDeferredAt(start.add(const Duration(seconds: 3))), isTrue);
    meter.recordSuccess();
    expect(meter.isDeferredAt(start.add(const Duration(seconds: 3))), isFalse);
    expect(meter.failuresInWindow, 0);
  });

  test('failures older than the window stop counting, so pressure is not permanent', () {
    final meter = DialBudgetMeter(budget);
    final start = DateTime(2026, 1, 1, 12);
    meter.recordFailure(now: start);
    meter.recordFailure(now: start);
    // The first two age out; a third failure 31s later is the only one inside the window, which is
    // one short of the threshold.
    final later = start.add(const Duration(seconds: 31));
    meter.recordFailure(now: later);
    expect(meter.failuresInWindow, 1);
    expect(meter.isDeferredAt(later), isFalse);
  });

  test('a failure inside an existing deferral extends it rather than replacing it', () {
    final meter = DialBudgetMeter(budget);
    final start = DateTime(2026, 1, 1, 12);
    for (var i = 0; i < 3; i++) {
      meter.recordFailure(now: start);
    }
    final later = start.add(const Duration(seconds: 8));
    meter.recordFailure(now: later);
    // The extension is measured from the newer failure, so the walk rests 10s from it — not the
    // 2s left over from the first deferral.
    expect(meter.deferralRemainingAt(later), const Duration(seconds: 10));
  });
}
