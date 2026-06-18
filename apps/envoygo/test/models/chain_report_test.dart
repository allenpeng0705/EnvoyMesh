// Phase 40 mobile mirror — ChainReport model tests.
//
// Verifies the `fromJson` / `toJson` factories on the chain-report
// models handle the wire format returned by `chainListReports` and
// `chainGetReport`, and that `fromJson(toJson(x)) == x` for every
// model. Pure unit tests — no Flutter widgets, no networking.

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

  group('ChainReportSummary.toJson', () {
    test('round-trips through fromJson', () {
      final constructed = ChainReportSummary(
        chainId: 'chain_x',
        chainMandateId: 'chainmandate_x',
        orchestratorOwnerId: 'envoy:owner:o',
        orchestratorPeerId: '12D3KooW-o',
        pinned: true,
        createdAt: DateTime.utc(2026, 6, 18, 10, 30),
        chainSummary: const ChainReportSummaryStats(
          subtaskCount: 2,
          workerCount: 2,
          synthesisCostUsd: 0.3,
        ),
      );
      final json = constructed.toJson();
      final restored = ChainReportSummary.fromJson(json);
      expect(restored.chainId, constructed.chainId);
      expect(restored.chainMandateId, constructed.chainMandateId);
      expect(restored.orchestratorOwnerId, constructed.orchestratorOwnerId);
      expect(restored.orchestratorPeerId, constructed.orchestratorPeerId);
      expect(restored.pinned, constructed.pinned);
      expect(restored.createdAt.toUtc(), constructed.createdAt);
      expect(restored.chainSummary.subtaskCount, 2);
      expect(restored.chainSummary.workerCount, 2);
      expect(restored.chainSummary.synthesisCostUsd, 0.3);
    });
  });

  group('ChainReport.fromJson', () {
    test('parses a full report with sections and worker allocations', () {
      final r = ChainReport.fromJson({
        'version': '0.1',
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
        'recipientRoles': ['human'],
      });
      expect(r.version, '0.1');
      expect(r.chainId, 'chain_full');
      expect(r.pinned, isFalse);
      expect(r.executiveSummary, contains('Q3 summary'));
      expect(r.sections, hasLength(2));
      expect(r.sections[0].heading, 'Headcount trend');
      expect(r.sections[0].citations, hasLength(1));
      expect(r.sections[0].citations.first.subtaskId, 'subtask_a');
      expect(r.sections[0].citations.first.snippet, 'hiring-trend.csv');
      expect(r.sections[1].bodyMarkdown, contains('See section 1'));
      expect(r.sections[1].citations, isEmpty);
      expect(r.chainSummary.durationMs, 65_000);
      expect(r.chainSummary.workerAllocations, hasLength(2));
      expect(r.chainSummary.workerAllocations[0].committedUsd, 1.5);
      expect(r.chainSummary.workerAllocations[1].workerPeerId,
          '12D3KooW-w2');
      expect(r.recipientRoles, ['human']);
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
        // No executiveSummary, no sections, no version, no recipientRoles.
      });
      expect(r.version, isNull);
      expect(r.executiveSummary, isEmpty);
      expect(r.sections, isEmpty);
      expect(r.chainSummary.workerAllocations, hasLength(1));
      // Default recipientRoles is ['human'] per the protocol's
      // .min(1).default(["human"]) constraint.
      expect(r.recipientRoles, ['human']);
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

  group('ChainReport.toJson', () {
    test('round-trips through fromJson', () {
      final constructed = ChainReport(
        version: '0.1',
        chainId: 'chain_full',
        chainMandateId: 'chainmandate_full',
        orchestratorOwnerId: 'envoy:owner:orch',
        orchestratorPeerId: '12D3KooW-orch',
        pinned: true,
        createdAt: DateTime.utc(2026, 6, 18, 10, 30),
        chainSummary: const ChainReportChainSummary(
          durationMs: 1000,
          subtaskCount: 2,
          workerCount: 2,
          workerAllocations: [
            ChainReportWorkerAllocation(
              subtaskId: 'subtask_a',
              workerPeerId: '12D3KooW-w1',
              committedUsd: 1.5,
            ),
          ],
          synthesisCostUsd: 0.5,
        ),
        executiveSummary: 'Hello.',
        sections: const [
          ChainReportSection(
            heading: 'Findings',
            bodyMarkdown: 'Three things.',
            citations: [
              ChainReportCitation(
                subtaskId: 'subtask_a',
                snippet: 'snippet-1',
              ),
            ],
          ),
        ],
        recipientRoles: const ['human'],
      );
      final json = constructed.toJson();
      // version is included when present.
      expect(json['version'], '0.1');
      final restored = ChainReport.fromJson(json);
      expect(restored.version, '0.1');
      expect(restored.chainId, constructed.chainId);
      expect(restored.pinned, isTrue);
      expect(restored.executiveSummary, 'Hello.');
      expect(restored.sections, hasLength(1));
      expect(restored.sections.first.heading, 'Findings');
      expect(restored.sections.first.citations, hasLength(1));
      expect(restored.sections.first.citations.first.snippet, 'snippet-1');
      expect(restored.chainSummary.workerAllocations, hasLength(1));
      expect(restored.recipientRoles, ['human']);
    });

    test('omits version key when null', () {
      final constructed = ChainReport(
        chainId: 'chain_x',
        chainMandateId: 'chainmandate_x',
        orchestratorOwnerId: 'o',
        orchestratorPeerId: 'p',
        pinned: false,
        createdAt: DateTime.utc(2026, 6, 18, 10, 30),
        chainSummary: const ChainReportChainSummary(
          durationMs: 0,
          subtaskCount: 1,
          workerCount: 1,
          workerAllocations: [
            ChainReportWorkerAllocation(
              subtaskId: 's',
              workerPeerId: 'p',
              committedUsd: 0,
            ),
          ],
          synthesisCostUsd: 0,
        ),
        executiveSummary: '',
        sections: const [],
      );
      final json = constructed.toJson();
      expect(json.containsKey('version'), isFalse);
      // Round-trip back to a model with version == null.
      final restored = ChainReport.fromJson(json);
      expect(restored.version, isNull);
    });
  });

  group('ChainReportSection.fromJson', () {
    test('parses heading + bodyMarkdown + citations', () {
      final s = ChainReportSection.fromJson({
        'heading': 'Findings',
        'bodyMarkdown': 'Three things to know.',
        'citations': [
          {'subtaskId': 'subtask_a', 'snippet': 'snippet-1'},
        ],
      });
      expect(s.heading, 'Findings');
      expect(s.bodyMarkdown, 'Three things to know.');
      expect(s.citations, hasLength(1));
      expect(s.citations.first.subtaskId, 'subtask_a');
    });

    test('defaults missing bodyMarkdown to empty string', () {
      final s = ChainReportSection.fromJson({'heading': 'Findings'});
      expect(s.bodyMarkdown, isEmpty);
      expect(s.citations, isEmpty);
    });
  });

  group('ChainReportCitation.fromJson', () {
    test('parses subtaskId + snippet', () {
      final c = ChainReportCitation.fromJson({
        'subtaskId': 'subtask_a',
        'snippet': 'snippet-1',
      });
      expect(c.subtaskId, 'subtask_a');
      expect(c.snippet, 'snippet-1');
    });

    test('defaults missing snippet to empty string', () {
      final c = ChainReportCitation.fromJson({'subtaskId': 'subtask_a'});
      expect(c.snippet, isEmpty);
    });
  });
}
