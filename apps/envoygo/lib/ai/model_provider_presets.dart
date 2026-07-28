/// Cloud model-provider presets for EnvoyGo (mirrors packages/api model-provider-presets).
/// Local-only presets (ollama / litellm) are omitted — home-node desktop owns those.
library;

class ModelProviderPreset {
  final String id;
  final String label;
  final String mode;
  final String? defaultEndpoint;
  final List<String> models;
  final bool endpointEditable;
  final String? endpointPlaceholder;
  final bool utility;

  const ModelProviderPreset({
    required this.id,
    required this.label,
    required this.mode,
    this.defaultEndpoint,
    this.models = const [],
    this.endpointEditable = true,
    this.endpointPlaceholder,
    this.utility = false,
  });
}

const cloudModelProviderPresets = <ModelProviderPreset>[
  ModelProviderPreset(
    id: 'minimax-cn',
    label: 'MiniMax CN',
    mode: 'openai-compatible',
    defaultEndpoint: 'https://api.minimaxi.com/v1',
    models: ['MiniMax-M3', 'MiniMax-M2.7', 'MiniMax-M2.7-highspeed'],
    endpointPlaceholder: 'https://api.minimaxi.com/v1',
  ),
  ModelProviderPreset(
    id: 'minimax',
    label: 'MiniMax',
    mode: 'openai-compatible',
    defaultEndpoint: 'https://api.minimax.io/v1',
    models: ['MiniMax-M3', 'MiniMax-M2.7', 'MiniMax-M2.7-highspeed'],
    endpointPlaceholder: 'https://api.minimax.io/v1',
  ),
  ModelProviderPreset(
    id: 'anthropic',
    label: 'Anthropic',
    mode: 'anthropic-compatible',
    defaultEndpoint: 'https://api.anthropic.com',
    models: ['claude-sonnet-4-6', 'claude-sonnet-4-5', 'claude-opus-4-6', 'claude-haiku-4-5'],
    endpointPlaceholder: 'https://api.anthropic.com',
  ),
  ModelProviderPreset(
    id: 'openai',
    label: 'OpenAI',
    mode: 'openai-compatible',
    defaultEndpoint: 'https://api.openai.com/v1',
    models: ['gpt-5', 'gpt-5-mini', 'gpt-4o', 'gpt-4o-mini', 'gpt-4.1'],
    endpointPlaceholder: 'https://api.openai.com/v1',
  ),
  ModelProviderPreset(
    id: 'deepseek',
    label: 'DeepSeek',
    mode: 'openai-compatible',
    defaultEndpoint: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    endpointPlaceholder: 'https://api.deepseek.com/v1',
  ),
  ModelProviderPreset(
    id: 'glm',
    label: 'GLM (Zhipu)',
    mode: 'openai-compatible',
    defaultEndpoint: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4.5', 'glm-4.5-air', 'glm-4-plus', 'glm-4-flash'],
    endpointPlaceholder: 'https://open.bigmodel.cn/api/paas/v4',
  ),
  ModelProviderPreset(
    id: 'qwen',
    label: 'Qwen (DashScope)',
    mode: 'openai-compatible',
    defaultEndpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen-long'],
    endpointPlaceholder: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  ),
  ModelProviderPreset(
    id: 'moonshot-cn',
    label: 'Moonshot CN (Kimi)',
    mode: 'openai-compatible',
    defaultEndpoint: 'https://api.moonshot.cn/v1',
    models: ['kimi-k2.5', 'moonshot-v1-auto', 'moonshot-v1-128k'],
    endpointPlaceholder: 'https://api.moonshot.cn/v1',
  ),
  ModelProviderPreset(
    id: 'xai',
    label: 'xAI (Grok)',
    mode: 'openai-compatible',
    defaultEndpoint: 'https://api.x.ai/v1',
    models: ['grok-3', 'grok-3-mini', 'grok-2'],
    endpointPlaceholder: 'https://api.x.ai/v1',
  ),
  ModelProviderPreset(
    id: 'openrouter',
    label: 'OpenRouter',
    mode: 'openai-compatible',
    defaultEndpoint: 'https://openrouter.ai/api/v1',
    models: [],
    endpointPlaceholder: 'https://openrouter.ai/api/v1',
  ),
  ModelProviderPreset(
    id: 'openai-compatible',
    label: 'Custom OpenAI-compatible',
    mode: 'openai-compatible',
    models: [],
    endpointPlaceholder: 'https://api.example.com/v1',
  ),
  ModelProviderPreset(
    id: 'anthropic-compatible',
    label: 'Custom Anthropic-compatible',
    mode: 'anthropic-compatible',
    models: [],
    endpointPlaceholder: 'https://api.anthropic.com',
  ),
  ModelProviderPreset(
    id: 'mock',
    label: 'Mock (no external calls)',
    mode: 'mock',
    endpointEditable: false,
    utility: true,
  ),
  ModelProviderPreset(
    id: 'disabled',
    label: 'Disabled',
    mode: 'disabled',
    endpointEditable: false,
    utility: true,
  ),
];

ModelProviderPreset? getModelProviderPreset(String? id) {
  if (id == null || id.trim().isEmpty) return null;
  for (final p in cloudModelProviderPresets) {
    if (p.id == id.trim()) return p;
  }
  return null;
}

String _endpointHost(String? endpoint) {
  final raw = endpoint?.trim() ?? '';
  if (raw.isEmpty) return '';
  try {
    return Uri.parse(raw).host.toLowerCase();
  } catch (_) {
    return '';
  }
}

ModelProviderPreset? _inferFromHost(String mode, String host) {
  if (host.isEmpty) return null;
  if (mode == 'openai-compatible') {
    if (host.contains('minimaxi.com')) return getModelProviderPreset('minimax-cn');
    if (host.contains('minimax.io')) return getModelProviderPreset('minimax');
    if (host.contains('deepseek.com')) return getModelProviderPreset('deepseek');
    if (host.contains('bigmodel.cn')) return getModelProviderPreset('glm');
    if (host.contains('dashscope.aliyuncs.com')) return getModelProviderPreset('qwen');
    if (host.contains('moonshot.cn')) return getModelProviderPreset('moonshot-cn');
    if (host == 'api.x.ai' || host.endsWith('.x.ai')) return getModelProviderPreset('xai');
    if (host.contains('openrouter.ai')) return getModelProviderPreset('openrouter');
    if (host.contains('openai.com')) return getModelProviderPreset('openai');
  }
  if (mode == 'anthropic-compatible') {
    if (host.contains('anthropic.com')) return getModelProviderPreset('anthropic');
  }
  return null;
}

ModelProviderPreset inferModelProviderPreset({
  String? mode,
  String? endpoint,
  String? presetId,
}) {
  final m = mode ?? 'mock';
  final fromHost = _inferFromHost(m, _endpointHost(endpoint));
  if (fromHost != null) return fromHost;
  final byId = getModelProviderPreset(presetId);
  if (byId != null) return byId;
  if (m == 'openai-compatible') return getModelProviderPreset('openai-compatible')!;
  if (m == 'anthropic-compatible') return getModelProviderPreset('anthropic')!;
  return getModelProviderPreset(m) ?? getModelProviderPreset('mock')!;
}
