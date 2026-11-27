import 'package:envoygo/providers/social_intro_provider.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('SocialIntroApproveOutcome covers approve vs hello failure', () {
    expect(SocialIntroApproveOutcome.values, [
      SocialIntroApproveOutcome.success,
      SocialIntroApproveOutcome.approveFailed,
      SocialIntroApproveOutcome.helloFailed,
    ]);
  });

  test('SocialIntroProposal.fromJson reads candidate fields', () {
    final p = SocialIntroProposal.fromJson({
      'messageId': 'm1',
      'candidateOwnerId': 'owner_a',
      'candidateDisplayName': 'Ada',
      'candidatePeerId': 'peer_a',
    });
    expect(p.messageId, 'm1');
    expect(p.candidateOwnerId, 'owner_a');
    expect(p.candidateDisplayName, 'Ada');
    expect(p.candidatePeerId, 'peer_a');
  });

  test('SocialIntroProposal.fromJson accepts legacy fromOwnerId', () {
    final p = SocialIntroProposal.fromJson({
      'messageId': 'm2',
      'fromOwnerId': 'owner_b',
      'fromDisplayName': 'Bob',
    });
    expect(p.candidateOwnerId, 'owner_b');
    expect(p.candidateDisplayName, 'Bob');
  });
}
