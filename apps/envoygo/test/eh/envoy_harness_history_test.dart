import 'package:envoygo/eh/envoy_harness_history.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('parses the NodeService role/text history contract', () {
    final messages = parseEnvoyHarnessHistory([
      {'id': 'eh-msg-0', 'role': 'user', 'text': 'hello'},
      {'id': 'eh-msg-1', 'role': 'assistant', 'text': 'world'},
      {'id': 'hidden', 'role': 'tool', 'text': 'ignored'},
    ]);
    expect(messages.map((m) => m.id), ['eh-msg-0', 'eh-msg-1']);
    expect(messages.map((m) => m.role), ['user', 'assistant']);
    expect(messages.map((m) => m.text), ['hello', 'world']);
  });
}
