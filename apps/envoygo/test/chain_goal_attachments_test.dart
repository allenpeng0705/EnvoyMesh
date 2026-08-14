import 'package:envoygo/chain_goal_attachments.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('buildChainGoalWithAttachments', () {
    test('returns trimmed goal when there are no attachments', () {
      expect(
        buildChainGoalWithAttachments('  Hello world  ', const []),
        'Hello world',
      );
    });

    test('puts short labels first in the Attachments block', () {
      final goal = buildChainGoalWithAttachments('Research the brief', [
        const ChainGoalAttachment(
          relativePath: 'imports/team-jobs/tj_abc/a.pdf',
          label: 'brief',
        ),
        const ChainGoalAttachment(
          relativePath: 'imports/team-jobs/tj_abc/b.csv',
        ),
      ]);
      expect(
        goal,
        [
          'Research the brief',
          '',
          'Attachments:',
          '- [brief] imports/team-jobs/tj_abc/a.pdf',
          '- imports/team-jobs/tj_abc/b.csv',
        ].join('\n'),
      );
    });

    test('skips attachments without a path', () {
      expect(
        buildChainGoalWithAttachments('Goal only', [
          const ChainGoalAttachment(relativePath: '  ', label: 'ignored'),
        ]),
        'Goal only',
      );
    });
  });

  group('sanitizeAttachmentLabel', () {
    test('trims, strips brackets/newlines, and caps length', () {
      expect(sanitizeAttachmentLabel('  source brief  '), 'source brief');
      expect(sanitizeAttachmentLabel('[brief]\ndata'), 'brief data');
      expect(sanitizeAttachmentLabel('x' * 50)?.length, 40);
      expect(sanitizeAttachmentLabel('   '), isNull);
    });
  });

  group('sanitizeTeamJobFileName', () {
    test('strips path separators', () {
      expect(
        sanitizeTeamJobFileName('../../evil/name.pdf'),
        '.._.._evil_name.pdf',
      );
      expect(sanitizeTeamJobFileName('plain.txt'), 'plain.txt');
    });
  });
}
