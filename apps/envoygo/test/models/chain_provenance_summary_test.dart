import 'package:envoygo/models/chain_active.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('ChainProvenanceSummary and live step attempt fields parse from JSON', () {
    final step = ChainLiveStep.fromJson({
      'subtaskId': 's1',
      'objective': 'Research',
      'state': 'running',
      'attemptCount': 2,
      'selectedAttemptId': 'a2',
      'workerPeerId': 'peer-1',
    });
    expect(step.attemptCount, 2);
    expect(step.selectedAttemptId, 'a2');

    final summary = ChainActiveSummary.fromJson({
      'chainId': 'c1',
      'chainMandateId': 'm1',
      'subtaskCount': 1,
      'bidCount': 0,
      'awardedCount': 1,
      'partialCount': 0,
      'chainCancelled': false,
      'published': false,
      'budgetSpentUsd': 0,
      'budgetMaxUsd': 10,
      'steps': [
        {
          'subtaskId': 's1',
          'objective': 'Research',
          'state': 'running',
          'attemptCount': 2,
          'selectedAttemptId': 'a2',
        },
      ],
      'provenanceSummary': [
        {
          'subtaskId': 's1',
          'selectedAttemptId': 'a2',
          'workerPeerId': 'peer-1',
          'attemptCount': 2,
          'state': 'running',
          'lastReason': 'heartbeat_ok',
        },
      ],
    });
    expect(summary.provenanceSummary, hasLength(1));
    expect(summary.provenanceSummary.first.lastReason, 'heartbeat_ok');
    expect(summary.steps.first.attemptCount, 2);
  });

  test('ChainActiveSummary parses optional teamStrategy.id', () {
    final withStrategy = ChainActiveSummary.fromJson({
      'chainId': 'c1',
      'chainMandateId': 'm1',
      'subtaskCount': 1,
      'bidCount': 0,
      'awardedCount': 0,
      'partialCount': 0,
      'chainCancelled': false,
      'published': false,
      'budgetSpentUsd': 0,
      'budgetMaxUsd': 10,
      'teamStrategy': {'id': 'highest-confidence', 'version': 1},
    });
    expect(withStrategy.teamStrategyId, 'highest-confidence');

    final without = ChainActiveSummary.fromJson({
      'chainId': 'c2',
      'chainMandateId': 'm2',
      'subtaskCount': 1,
      'bidCount': 0,
      'awardedCount': 0,
      'partialCount': 0,
      'chainCancelled': false,
      'published': false,
      'budgetSpentUsd': 0,
      'budgetMaxUsd': 10,
    });
    expect(without.teamStrategyId, isNull);
  });

  test('ChainActiveSummary parses recovery.phase', () {
    final recovering = ChainActiveSummary.fromJson({
      'chainId': 'c3',
      'chainMandateId': 'm3',
      'subtaskCount': 1,
      'bidCount': 0,
      'awardedCount': 1,
      'partialCount': 0,
      'chainCancelled': false,
      'published': false,
      'budgetSpentUsd': 0,
      'budgetMaxUsd': 10,
      'recovery': {
        'phase': 'recovering',
        'orchestratorEpoch': 'orch_1',
        'startedAt': '2030-01-01T00:00:00.000Z',
        'graceDeadlineAt': '2030-01-01T00:00:15.000Z',
        'pendingPeers': 1,
        'conflictCount': 0,
      },
    });
    expect(recovering.recoveryPhase, 'recovering');
  });
}
