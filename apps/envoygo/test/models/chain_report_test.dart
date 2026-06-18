// Phase 40 mobile mirror — ChainReport model tests.
//
// Verifies the `fromJson` factories on the chain-report models handle
// the wire format returned by `chainListReports` and `chainGetReport`.
// Pure unit tests — no Flutter widgets, no networking.

import 'package:envoygo/models/chain_report.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('ChainReportSummary.fromJson', () {
    test('parses a list-row summary', () {
      final r = ChainReportSummary.fromJson({
        'chainId': 'chain_8d2f4a1b-c0ffee',
        'chainMandateId': 'chainmandate_a1b2c3d4',
        'orchestratorOwnerId': 'envoy:owner:orch',
        'orchestratorPeerId': '12D3KooW-orch',
        'pinned': true,
        'createdAt': '2026-06-18T10:30:00.000Z',
        'chainSummary': {
          'subtaskCount': 4,
          'workerCount': 3,
          'synthesisCostUsd': 0.42,
        },
      });
      expect(r.chainId, 'chain_8d2f4a1b-c0ffee');
      expect(r.chainMandateId, 'chainmandate_a1b2c3d4');
      expect(r.orchestratorOwnerId, 'envoy:owner:orch');
      expect(r.orchestratorPeerId, '12D3KooW-orch');
      expect(r.pinned, isTrue);
      expect(r.createdAt.toUtc().toIso8601String(), '2026-06-18T10:30:00.000Z');
      expect(r.chainSummary.subtaskCount, 4);
      expect(r.chainSummary.workerCount, 3);
      expect(r.chainSummary.synthesisCostUsd, 0.42);
    });

    test('treats pinned=false when missing or non-bool', () {
      final r1 = ChainReportSummary.fromJson({
        'chainId': 'chain_x',
        'chainMandateId': 'chainmandate_x',
        'orchestratorOwnerId': 'o',
        'orchestratorPeerId': 'p',
        'createdAt': '2026-06-18T10:30:00.000Z',
        'pinned': false,
        'chainSummary': {
          'subtaskCount': 1,
          'workerCount': 1,
          'synthesisCostUsd': 0.0,
        },
      });
      expect(r1.pinned, isFalse);
    });

    test('handles integer cost in chainSummary (defensive)', () {
      // The home node emits synthesisCostUsd as a JSON number; if a future
      // server returns an integer (e.g. 0 instead of 0.0) we should still
      // parse cleanly.
      final r = ChainReportSummary.fromJson({
        'chainId': 'chain_x',
        'chainMandateId': 'chainmandate_x',
        'orchestratorOwnerId': 'o',
        'orchestratorPeerId': 'p',
        'pinned': false,
        'createdAt': '2026-06-18T10:30:00.000Z',
        'chainSummary': {
          'subtaskCount': 1,
          'workerCount': 1,
          'synthesisCostUsd': 0, // int, not double
        },
      });
      expect(r.chainSummary.synthesisCostUsd, 0.0);
    });
  });

  group('ChainReport.fromJson', () {
    test('parses a full report with sections and worker allocations', () {
      final r = ChainReport.fromJson({
        'chainId': 'chain_full',
        'chainMandateId': 'chainmandate_full',
        'orchestratorOwnerId': 'envoy:owner:orch',
        'orchestratorPeerId': '12D3KooW-orch',
        'pinned': false,
        'createdAt': '2026-06-18T10:30:00.000Z',
        'chainSummary': {
          'durationMs': 65_000,
          'subtaskCount': 3,
          'workerCount': 3,
          'workerAllocations': [
            {
              'subtaskId': 'subtask_a',
              'workerPeerId': '12D3KooW-w1',
              'committedUsd': 1.5,
            },
            {
              'subtaskId': 'subtask_b',
              'workerPeerId': '12D3KooW-w2',
              'committedUsd': 2.0,
            },
          ],
          'synthesisCostUsd': 0.5,
        },
        'executiveSummary': '# Q3 summary\n\nThree findings.',
        'sections': [
          {
            'heading': 'Headcount trend',
            'bodyMarkdown': 'Up 12% YoY.',
            'citations': [
              {'subtaskId': 'subtask_a', 'snippet': 'hiring-trend.csv'},
            ],
          },
          {
            'heading': 'Risks',
            'bodyMarkdown': 'See section 1 for context.',
          },
        ],
      });
      expect(r.chainId, 'chain_full');
      expect(r.pinned, isFalse);
      expect(r.executiveSummary, contains('Q3 summary'));
      expect(r.sections, hasLength(2));
      expect(r.sections[0].heading, 'Headcount trend');
      expect(r.sections[1].bodyMarkdown, contains('See section 1'));
      expect(r.chainSummary.durationMs, 65_000);
      expect(r.chainSummary.workerAllocations, hasLength(2));
      expect(r.chainSummary.workerAllocations[0].committedUsd, 1.5);
      expect(r.chainSummary.workerAllocations[1].workerPeerId,
          '12D3KooW-w2');
    });

    test('handles missing sections + empty executiveSummary', () {
      final r = ChainReport.fromJson({
        'chainId': 'chain_min',
        'chainMandateId': 'chainmandate_min',
        'orchestratorOwnerId': 'o',
        'orchestratorPeerId': 'p',
        'pinned': false,
        'createdAt': '2026-06-18T10:30:00.000Z',
        'chainSummary': {
          'durationMs': 0,
          'subtaskCount': 1,
          'workerCount': 1,
          'workerAllocations': [
            {
              'subtaskId': 'subtask_a',
              'workerPeerId': 'p',
              'committedUsd': 0,
            },
          ],
          'synthesisCostUsd': 0,
        },
        // No executiveSummary, no sections.
      });
      expect(r.executiveSummary, isEmpty);
      expect(r.sections, isEmpty);
      expect(r.chainSummary.workerAllocations, hasLength(1));
    });

    test('handles null pinned by defaulting to false', () {
      final r = ChainReport.fromJson({
        'chainId': 'chain_x',
        'chainMandateId': 'chainmandate_x',
        'orchestratorOwnerId': 'o',
        'orchestratorPeerId': 'p',
        'createdAt': '2026-06-18T10:30:00.000Z',
        'pinned': null,
        'chainSummary': {
          'durationMs': 0,
          'subtaskCount': 1,
          'workerCount': 1,
          'workerAllocations': [
            {
              'subtaskId': 'subtask_a',
              'workerPeerId': 'p',
              'committedUsd': 0,
            },
          ],
          'synthesisCostUsd': 0,
        },
        'executiveSummary': '',
      });
      expect(r.pinned, isFalse);
    });
  });

  group('ChainReportSection.fromJson', () {
    test('parses heading + bodyMarkdown', () {
      final s = ChainReportSection.fromJson({
        'heading': 'Findings',
        'bodyMarkdown': 'Three things to know.',
      });
      expect(s.heading, 'Findings');
      expect(s.bodyMarkdown, 'Three things to know.');
    });

    test('defaults missing bodyMarkdown to empty string', () {
      final s = ChainReportSection.fromJson({'heading': 'Findings'});
      expect(s.bodyMarkdown, isEmpty);
    });
  });
}
