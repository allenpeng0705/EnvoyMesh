import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/contact_provider.dart' show nodeServiceProvider;
import '../../services/node_service_client.dart';

/// AI Model settings — Phase EnvoyGo settings (slice 1).
///
/// Lets the user configure the model provider that the home node
/// uses to run the assistant. The home node already accepts a
/// `Partial<NodeConfig>` update with a `modelProviders` block; this
/// screen is a thin mobile wrapper that:
///   1. reads the current `modelProviders` from `getNodeConfig()`
///   2. lets the user edit mode / endpoint / modelName / apiKey /
///      requireApprovalForCloud
///   3. pushes a partial `updateNodeConfig({modelProviders: ...})`
///
/// Phase 2 (External Agents) is in `external_agents_settings_screen.dart`.
///
/// Mode options — must mirror the server-side `ModelProviderMode`
/// in `packages/api/src/ws-protocol.d.ts`. Keep in sync if the server
/// grows new modes.
const _modeOptions = <_ModeOption>[
  _ModeOption('disabled', 'Disabled (no AI calls)'),
  _ModeOption('mock', 'Mock (no external calls)'),
  _ModeOption('ollama', 'Ollama (local)'),
  _ModeOption('litellm', 'LiteLLM (local/cloud)'),
  _ModeOption('openai-compatible', 'OpenAI-compatible'),
  _ModeOption('anthropic-compatible', 'Anthropic-compatible'),
];

class _ModeOption {
  final String value;
  final String label;
  const _ModeOption(this.value, this.label);
}

class AiModelSettingsScreen extends ConsumerStatefulWidget {
  const AiModelSettingsScreen({super.key});

  @override
  ConsumerState<AiModelSettingsScreen> createState() =>
      _AiModelSettingsScreenState();
}

class _AiModelSettingsScreenState
    extends ConsumerState<AiModelSettingsScreen> {
  final _formKey = GlobalKey<FormState>();
  late TextEditingController _endpointCtl;
  late TextEditingController _modelNameCtl;
  late TextEditingController _apiKeyCtl;
  String _mode = 'mock';
  bool _obscureApiKey = true;
  bool _saving = false;
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    _endpointCtl = TextEditingController();
    _modelNameCtl = TextEditingController();
    _apiKeyCtl = TextEditingController();
    _loadCurrent();
  }

  Future<void> _loadCurrent() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) {
      if (mounted) setState(() => _loaded = true);
      return;
    }
    try {
      final cfg = await client.getNodeConfig();
      final mp = (cfg['modelProviders'] as Map?)?.cast<String, dynamic>() ??
          const <String, dynamic>{};
      final mode = (mp['mode'] as String?) ?? 'mock';
      final endpoint = (mp['endpoint'] as String?) ?? '';
      final modelName = (mp['modelName'] as String?) ?? '';
      final apiKey = (mp['apiKey'] as String?) ?? '';
      if (!mounted) return;
      setState(() {
        _mode = mode;
        _endpointCtl.text = endpoint;
        _modelNameCtl.text = modelName;
        _apiKeyCtl.text = apiKey;
        _loaded = true;
      });
    } catch (_) {
      if (mounted) setState(() => _loaded = true);
    }
  }

  @override
  void dispose() {
    _endpointCtl.dispose();
    _modelNameCtl.dispose();
    _apiKeyCtl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    setState(() => _saving = true);
    try {
      final patch = <String, dynamic>{
        'mode': _mode,
        if (_endpointCtl.text.trim().isNotEmpty)
          'endpoint': _endpointCtl.text.trim(),
        if (_modelNameCtl.text.trim().isNotEmpty)
          'modelName': _modelNameCtl.text.trim(),
        if (_apiKeyCtl.text.isNotEmpty) 'apiKey': _apiKeyCtl.text,
      };
      final ok = await client.updateModelProviders(patch);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(ok ? 'AI model saved' : 'Save failed')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Save failed: $e')),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('AI Model')),
      body: !_loaded
          ? const Center(child: CircularProgressIndicator())
          : Form(
              key: _formKey,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Text(
                    'Configure the model provider the home node uses '
                    'to run the assistant. Changes apply on the next '
                    'assistant turn.',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  const SizedBox(height: 16),
                  DropdownButtonFormField<String>(
                    initialValue: _mode,
                    decoration: const InputDecoration(
                      labelText: 'Provider mode',
                      border: OutlineInputBorder(),
                    ),
                    items: _modeOptions
                        .map(
                          (o) => DropdownMenuItem<String>(
                            value: o.value,
                            child: Text(o.label),
                          ),
                        )
                        .toList(),
                    onChanged: (v) {
                      if (v != null) setState(() => _mode = v);
                    },
                  ),
                  const SizedBox(height: 16),
                  TextFormField(
                    controller: _endpointCtl,
                    decoration: const InputDecoration(
                      labelText: 'Endpoint URL',
                      helperText:
                          'Ollama: http://127.0.0.1:11434/v1  ·  '
                          'LiteLLM: http://127.0.0.1:4000/v1  ·  '
                          'OpenAI/Anthropic: provider host (no /v1)',
                      border: OutlineInputBorder(),
                    ),
                    keyboardType: TextInputType.url,
                  ),
                  const SizedBox(height: 16),
                  TextFormField(
                    controller: _modelNameCtl,
                    decoration: const InputDecoration(
                      labelText: 'Model name',
                      helperText: 'e.g. llama3.1, gpt-4o-mini, claude-3-5-sonnet',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 16),
                  TextFormField(
                    controller: _apiKeyCtl,
                    obscureText: _obscureApiKey,
                    decoration: InputDecoration(
                      labelText: 'API key',
                      helperText: 'Required for LiteLLM, OpenAI, Anthropic',
                      border: const OutlineInputBorder(),
                      suffixIcon: IconButton(
                        icon: Icon(
                          _obscureApiKey
                              ? Icons.visibility
                              : Icons.visibility_off,
                        ),
                        onPressed: () => setState(
                          () => _obscureApiKey = !_obscureApiKey,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),
                  FilledButton.icon(
                    onPressed: _saving ? null : _save,
                    icon: _saving
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.save),
                    label: const Text('Save'),
                  ),
                ],
              ),
            ),
    );
  }
}
