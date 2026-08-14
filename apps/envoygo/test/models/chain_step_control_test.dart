import 'package:envoygo/chain_step_control.dart';
import 'package:envoygo/models/chain_active.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('EnvoyGo step control gates (Phase 58C)', () {
    test('cancel allowed on active non-terminal states', () {
      expect(canCancelChainStep('pending'), isTrue);
      expect(canCancelChainStep('offered'), isTrue);
      expect(canCancelChainStep('awarded'), isTrue);
      expect(canCancelChainStep('running'), isTrue);
      expect(canCancelChainStep('done'), isFalse);
      expect(canCancelChainStep('cancelled'), isFalse);
      expect(canCancelChainStep('failed'), isFalse);
    });

    test('reassign allowed on awarded/running/failed', () {
      expect(canReassignChainStep('awarded'), isTrue);
      expect(canReassignChainStep('running'), isTrue);
      expect(canReassignChainStep('failed'), isTrue);
      expect(canReassignChainStep('pending'), isFalse);
      expect(canReassignChainStep('offered'), isFalse);
      expect(canReassignChainStep('done'), isFalse);
    });

    test('live steps still parse for control UI', () {
      final step = ChainLiveStep.fromJson({
        'subtaskId': 'sub_a',
        'objective': 'Do the thing',
        'state': 'running',
        'dependsOn': <String>[],
      });
      expect(canCancelChainStep(step.state), isTrue);
      expect(canReassignChainStep(step.state), isTrue);
    });
  });

  group('canRetryChainInputDelivery', () {
    test('allows failed and transferring always', () {
      expect(
        canRetryChainInputDelivery(phase: 'failed', updatedAt: null),
        isTrue,
      );
      expect(
        canRetryChainInputDelivery(phase: 'transferring', updatedAt: null),
        isTrue,
      );
      expect(
        canRetryChainInputDelivery(phase: 'verified', updatedAt: '2020-01-01T00:00:00.000Z'),
        isFalse,
      );
    });

    test('gates pending by updatedAt age', () {
      final now = DateTime.parse('2026-08-14T12:00:30.000Z');
      expect(
        canRetryChainInputDelivery(phase: 'pending', updatedAt: null, now: now),
        isFalse,
      );
      expect(
        canRetryChainInputDelivery(
          phase: 'pending',
          updatedAt: '2026-08-14T12:00:20.000Z',
          now: now,
        ),
        isFalse,
      );
      expect(
        canRetryChainInputDelivery(
          phase: 'pending',
          updatedAt: '2026-08-14T12:00:00.000Z',
          now: now,
        ),
        isTrue,
      );
    });
  });
}
