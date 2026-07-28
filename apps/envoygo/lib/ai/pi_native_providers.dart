/// Pi-native providers for EnvoyGo Settings (mirrors packages/api/pi-native-providers).
library;

class PiNativeProvider {
  final String id;
  final String label;
  final List<String> models;
  final bool supportsEndpoint;
  final String? endpointPlaceholder;

  const PiNativeProvider({
    required this.id,
    required this.label,
    this.models = const [],
    this.supportsEndpoint = false,
    this.endpointPlaceholder,
  });
}

const piNativeProviders = <PiNativeProvider>[
  PiNativeProvider(
    id: 'minimax-cn',
    label: 'MiniMax CN',
    models: ['MiniMax-M3', 'MiniMax-M2.7', 'MiniMax-M2.7-highspeed'],
  ),
  PiNativeProvider(
    id: 'minimax',
    label: 'MiniMax',
    models: ['MiniMax-M3', 'MiniMax-M2.7', 'MiniMax-M2.7-highspeed'],
  ),
  PiNativeProvider(
    id: 'anthropic',
    label: 'Anthropic',
    models: ['claude-sonnet-4-6', 'claude-sonnet-4-5', 'claude-opus-4-6', 'claude-haiku-4-5'],
  ),
  PiNativeProvider(
    id: 'openai',
    label: 'OpenAI',
    models: ['gpt-5', 'gpt-5-mini', 'gpt-4o', 'gpt-4o-mini', 'gpt-4.1'],
    supportsEndpoint: true,
    endpointPlaceholder: 'https://api.openai.com/v1',
  ),
  PiNativeProvider(
    id: 'deepseek',
    label: 'DeepSeek',
    models: ['deepseek-v4-pro', 'deepseek-v4-flash'],
  ),
  PiNativeProvider(
    id: 'google',
    label: 'Google',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
  ),
  PiNativeProvider(
    id: 'openrouter',
    label: 'OpenRouter',
    models: [],
    supportsEndpoint: true,
    endpointPlaceholder: 'https://openrouter.ai/api/v1',
  ),
  PiNativeProvider(
    id: 'moonshotai-cn',
    label: 'Moonshot CN (Kimi)',
    models: ['kimi-k2.5', 'kimi-k2-thinking'],
  ),
  PiNativeProvider(
    id: 'xai',
    label: 'xAI (Grok)',
    models: ['grok-3', 'grok-3-mini', 'grok-2'],
  ),
];

PiNativeProvider? getPiNativeProvider(String? id) {
  if (id == null || id.trim().isEmpty) return null;
  for (final p in piNativeProviders) {
    if (p.id == id.trim()) return p;
  }
  return null;
}

/// Map legacy EnvoyMesh modes → a Pi-native provider for UI migration.
String piProviderFromEnvoyMode(String? mode, String? endpoint) {
  String host = '';
  final raw = endpoint?.trim() ?? '';
  if (raw.isNotEmpty) {
    try {
      host = Uri.parse(raw).host.toLowerCase();
    } catch (_) {}
  }
  if (mode == 'openai-compatible') {
    if (host.contains('minimaxi.com')) return 'minimax-cn';
    if (host.contains('minimax.io')) return 'minimax';
    if (host.contains('deepseek')) return 'deepseek';
    if (host.contains('moonshot.cn')) return 'moonshotai-cn';
    if (host == 'api.x.ai' || host.endsWith('.x.ai')) return 'xai';
    if (host.contains('openrouter.ai')) return 'openrouter';
    return 'openai';
  }
  if (mode == 'anthropic-compatible') return 'anthropic';
  return 'minimax-cn';
}
