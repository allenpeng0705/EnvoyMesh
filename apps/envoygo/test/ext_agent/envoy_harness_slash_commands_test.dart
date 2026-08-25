import 'package:envoygo/ext_agent/envoy_harness_slash_commands.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('envoy harness slash catalog includes review and compact', () {
    final slashes = envoyHarnessSlashCommands
        .map((c) => c['slash']?.toString())
        .toList();
    expect(slashes, contains('/review'));
    expect(slashes, contains('/compact'));
    expect(slashes, contains('/help'));
  });

  test('local slash detection', () {
    expect(isEnvoyHarnessLocalSlashCommand('/help'), isTrue);
    expect(isEnvoyHarnessLocalSlashCommand('/review'), isFalse);
    expect(isEnvoyHarnessLocalSlashCommand('/status'), isTrue);
    expect(parseEnvoyHarnessCdCommand('/cd /tmp')?.type, 'set');
    expect(parseEnvoyHarnessModelCommand('/model show')?.type, 'show');
  });

  test('slash help formatting', () {
    final text = formatEnvoyHarnessSlashHelp(
      model: 'gpt-test',
      cwd: '/Users/dev/project',
    );
    expect(text, contains('envoy-harness slash commands:'));
    expect(text, contains('Project folder: /Users/dev/project'));
  });
}
