import 'package:envoygo/ext_agent/ext_agent_slash_commands.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('parses /model actions', () {
    expect(parseExtAgentModelCommand('/model')?.type, 'show');
    expect(parseExtAgentModelCommand('/model list')?.type, 'list');
    expect(parseExtAgentModelCommand('/model default')?.type, 'default');
    expect(parseExtAgentModelCommand('/model sonnet')?.model, 'sonnet');
    expect(parseExtAgentModelCommand('/help'), isNull);
  });

  test('filters slash and model suggestions', () {
    final commands = [
      {'slash': '/help', 'summary': 'help'},
      {'slash': '/model', 'summary': 'model'},
    ];
    expect(
      filterExtAgentSlashCommands(commands, '/mo').map((c) => c['slash']),
      ['/model'],
    );
    final models = [
      {'id': 'sonnet'},
      {'id': 'opus'},
    ];
    expect(filterExtAgentModels(models, '/model so').map((m) => m['id']), ['sonnet']);
    expect(filterExtAgentModels(models, '/model'), isEmpty);
  });

  test('formats help', () {
    final text = formatExtAgentSlashHelp({
      'agentName': 'Hermes',
      'commands': [
        {'slash': '/help', 'summary': 'List commands'},
      ],
      'supportsSessionModel': true,
      'defaultModel': 'hermes-agent',
      'limitations': ['Note'],
    });
    expect(text, contains('Hermes slash commands:'));
    expect(text, contains('/help'));
    expect(text, contains('Current model: hermes-agent'));
    expect(text, contains('• Note'));
  });

  test('parses MiniMax media slash', () {
    expect(parseMmxMediaCommand('/image a cat')?.ok, isTrue);
    expect(parseMmxMediaCommand('/image a cat')?.params?['kind'], 'image');
    expect(parseMmxMediaCommand('/image a cat')?.params?['prompt'], 'a cat');
    expect(parseMmxMediaCommand('/mmx-auth')?.params?['kind'], 'auth');
    expect(parseMmxMediaCommand('/quota')?.ok, isTrue);
    expect(parseMmxMediaCommand('/image')?.ok, isFalse);
    expect(parseMmxMediaCommand('/vision')?.error, contains('Usage'));
    expect(parseMmxMediaCommand('/model list'), isNull);
    expect(
      formatMmxMediaResult({
        'ok': true,
        'kind': 'image',
        'path': '/tmp/x.png',
      }),
      contains('Saved: /tmp/x.png'),
    );
  });
}
