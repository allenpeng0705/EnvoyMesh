import 'package:envoygo/ext_agent/envoy_ai_slash_commands.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('parses EnvoyAI slash actions', () {
    expect(parseEnvoyAiSlashCommand('/help')?.type, 'help');
    expect(parseEnvoyAiSlashCommand('/clear')?.type, 'clear');
    expect(parseEnvoyAiSlashCommand('/bonds')?.type, 'expand');
    expect(
      parseEnvoyAiSlashCommand('/knowledge parking')?.prompt,
      contains('parking'),
    );
  });

  test('expands feature guide prompts', () {
    expect(parseEnvoyAiSlashCommand('/about')?.type, 'expand');
    expect(parseEnvoyAiSlashCommand('/about')?.prompt, contains('EnvoyMesh'));
    expect(parseEnvoyAiSlashCommand('/terminal')?.prompt, contains('Terminals'));
    expect(parseEnvoyAiSlashCommand('/team')?.type, 'expand');
    expect(parseEnvoyAiSlashCommand('/team')?.prompt, contains('Office LAN'));
    expect(parseEnvoyAiSlashCommand('/team')?.prompt, contains('Manage workers'));
    expect(parseEnvoyAiSlashCommand('/team')?.prompt, contains('fleet token'));
    expect(parseEnvoyAiSlashCommand('/family')?.type, 'expand');
    expect(parseEnvoyAiSlashCommand('/extagent')?.type, 'expand');
    expect(parseEnvoyAiSlashCommand('/envoyai')?.type, 'expand');
    expect(parseEnvoyAiSlashCommand('/pi')?.type, 'expand');
    expect(parseEnvoyAiSlashCommand('/content')?.prompt, contains('Feed'));
  });

  test('formats help', () {
    final text = formatEnvoyAiSlashHelp({
      'commands': [
        {'slash': '/help', 'summary': 'List commands'},
        {'slash': '/report', 'summary': 'Mesh report'},
        {'slash': '/about', 'summary': 'Product overview'},
      ],
      'limitations': ['Note'],
    });
    expect(text, contains('EnvoyAI slash commands:'));
    expect(text, contains('/report'));
    expect(text, contains('/about'));
    expect(text, contains('• Note'));
  });
}
