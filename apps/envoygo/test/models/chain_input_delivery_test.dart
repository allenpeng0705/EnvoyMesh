import 'package:envoygo/models/chain_active.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('ChainActiveSummary input deliveries', () {
    test('merges attachment labels onto delivery rows', () {
      final st = ChainActiveSummary.fromJson({
        'chainId': 'chain_1',
        'chainMandateId': 'm1',
        'subtaskCount': 1,
        'bidCount': 0,
        'awardedCount': 0,
        'partialCount': 0,
        'chainCancelled': false,
        'published': false,
        'budgetSpentUsd': 0,
        'budgetMaxUsd': 10,
        'inputAttachments': [
          {
            'sourceRelativePath': 'imports/team-jobs/tj_a/brief.pdf',
            'label': 'brief',
            'fileName': 'brief.pdf',
          },
        ],
        'inputDeliveries': [
          {
            'chainId': 'chain_1',
            'workerPeerId': 'envoy_agent_worker_long_id',
            'sourceRelativePath': 'imports/team-jobs/tj_a/brief.pdf',
            'phase': 'pending',
            'updatedAt': '2026-08-14T12:00:00.000Z',
          },
        ],
      });

      expect(st.inputDeliveries, hasLength(1));
      final d = st.inputDeliveries.single;
      expect(d.displayName, 'brief');
      expect(d.phase, 'pending');
      expect(d.updatedAt, '2026-08-14T12:00:00.000Z');
      expect(d.shortWorker, 'envoy_agent_…');
    });

    test('falls back to basename when label missing', () {
      final st = ChainActiveSummary.fromJson({
        'chainId': 'chain_1',
        'chainMandateId': 'm1',
        'subtaskCount': 0,
        'bidCount': 0,
        'awardedCount': 0,
        'partialCount': 0,
        'chainCancelled': false,
        'published': false,
        'budgetSpentUsd': 0,
        'budgetMaxUsd': 1,
        'inputDeliveries': [
          {
            'chainId': 'chain_1',
            'workerPeerId': 'w1',
            'sourceRelativePath': 'imports/a/notes.txt',
            'phase': 'failed',
            'error': 'wan_down',
          },
        ],
      });
      expect(st.inputDeliveries.single.displayName, 'notes.txt');
      expect(st.inputDeliveries.single.error, 'wan_down');
    });
  });
}
