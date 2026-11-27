/// Wire harness ids aligned with `@envoymesh/api` `coding-harness.ts`.
library;

const kCodingTierAHarnessIds = {'envoy-harness', 'pi'};

/// Featured radios + composer snapshot (FH-P0-C); grows with Mesh catalog.
/// DeepSeek Harness shares CodeWhale — featured face is CodeWhale only.
const kCodingFeaturedHarnessIds = [
  'envoy-harness',
  'pi',
  'claudecode',
  'codex',
  'opencode',
  'cursor',
  'codewhale',
  'minimax-code',
  'grok',
  'gemini',
  'traecli',
  'qoder',
  'copilot',
];

const kCodingTierBCatalogIds = {
  'claudecode',
  'codex',
  'opencode',
  'cursor',
  'codewhale',
  'deepseek-harness',
  'deepseek-tui',
  'minimax-code',
  'grok',
  'gemini',
  'traecli',
  'qoder',
  'copilot',
  'omp',
};

/// Ext Agent / sidecar probe id for a Coding harness wire id.
String? codingHarnessToExtAgentWireId(String harness) {
  final id = harness.trim();
  if (kCodingTierAHarnessIds.contains(id)) return null;
  const sidecarByHarness = {
    'claudecode': 'claudecode',
    'codex': 'codex',
    'opencode': 'opencode',
    'cursor': 'cursor',
    'codewhale': 'codewhale',
    'deepseek-harness': 'codewhale',
    'deepseek-tui': 'codewhale',
  };
  final sidecar = sidecarByHarness[id];
  if (sidecar != null) return sidecar;
  if (kCodingTierBCatalogIds.contains(id)) return id;
  return null;
}

bool isCodingTierBHarnessWireId(String harness) =>
    kCodingTierBCatalogIds.contains(harness.trim());

String resolveCodingComposerAgentKey(String harness) {
  final id = harness.trim();
  if (id == 'envoy-harness' || id == 'pi') return id;
  return codingHarnessToExtAgentWireId(id) ?? id;
}