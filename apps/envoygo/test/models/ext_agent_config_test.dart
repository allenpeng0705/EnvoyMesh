import 'package:envoygo/models/ext_agent_config.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('ext_agent_config', () {
    test('applyPresetToDraft fills hermes defaults', () {
      const draft = BridgeConfigView(
        enabled: true,
        listenPort: 3031,
        extAgents: [],
        agentUrl: 'http://127.0.0.1:8010/message',
        agentName: 'HomeClaw',
        activeExtAgentId: 'homeclaw',
      );
      final next = applyPresetToDraft(draft, 'hermes');
      expect(next.agentUrl, 'http://127.0.0.1:8020/message');
      expect(next.agentName, 'Hermes');
      expect(next.activeId, 'hermes');
    });

    test('finalizeExtAgentDraft adds custom agent', () {
      const draft = BridgeConfigView(
        enabled: true,
        listenPort: 3031,
        extAgents: [],
        agentUrl: '',
        agentName: '',
        activeExtAgentId: customExtAgentNewId,
      );
      final saved = finalizeExtAgentDraft(
        draft: draft,
        customAgentIdInput: 'my-bot',
        name: 'My Bot',
        url: 'http://127.0.0.1:9000/message',
      );
      expect(saved.activeId, 'my-bot');
      expect(saved.extAgents.single.url, 'http://127.0.0.1:9000/message');
    });

    test('slugifyExtAgentId normalizes input', () {
      expect(slugifyExtAgentId('My Custom Agent'), 'my-custom-agent');
    });
  });
}
