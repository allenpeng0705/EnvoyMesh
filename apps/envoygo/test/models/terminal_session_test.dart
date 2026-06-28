import 'package:envoygo/models/terminal_session.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('TerminalSession.fromJson', () {
    test('maps home node summary fields', () {
      final session = TerminalSession.fromJson({
        'sessionId': 'sess-1',
        'title': 'dev shell',
        'cwd': '/Users/me/proj',
        'shell': '/bin/zsh',
        'state': 'running',
        'createdAt': '2026-06-24T12:00:00.000Z',
      });

      expect(session.id, 'sess-1');
      expect(session.name, 'dev shell');
      expect(session.cwd, '/Users/me/proj');
      expect(session.runningProcess, '/bin/zsh');
      expect(session.state, 'running');
      expect(session.isRunning, isTrue);
    });

    test('prefers foregroundHint over shell for runningProcess', () {
      final session = TerminalSession.fromJson({
        'sessionId': 'sess-2',
        'title': 'deploy',
        'shell': '/bin/bash',
        'foregroundHint': 'npm run build',
        'state': 'running',
      });

      expect(session.runningProcess, 'npm run build');
    });

    test('isRunning is false when state is exited', () {
      final session = TerminalSession.fromJson({
        'sessionId': 'sess-3',
        'title': 'old',
        'state': 'exited',
      });

      expect(session.isRunning, isFalse);
    });
  });
}
