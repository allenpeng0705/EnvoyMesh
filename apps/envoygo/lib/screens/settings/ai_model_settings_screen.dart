import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../ai/model_provider_presets.dart';
import '../../providers/contact_provider.dart' show nodeServiceProvider;
import '../../services/node_service_client.dart';

/// AI Model settings — cloud provider presets (EnvoyGo).
///
/// Local-only modes (ollama / litellm) are shown read-only here; edit those
/// on the home-node Social UI. Cloud saves merge into the existing
/// `modelProviders` object (server shallow-replaces the whole block).
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
  String _presetId = 'mock';
  /// Full modelProviders map from home — merged on save so we do not wipe
  /// fields like requireApprovalForCloud / mockResponseText.
  Map<String, dynamic> _existingMp = const {};
  bool _localOnly = false;
  String _localModeLabel = '';
  bool _obscureApiKey = true;
  bool _saving = false;
  bool _loaded = false;
  ProviderSubscription<NodeServiceClient?>? _clientSub;
  void Function()? _configUnsub;

  ModelProviderPreset get _preset =>
      getModelProviderPreset(_presetId) ?? getModelProviderPreset('mock')!;

  static bool _isLocalMode(String mode) =>
      mode == 'ollama' || mode == 'litellm';

  @override
  void initState() {
    super.initState();
    _endpointCtl = TextEditingController();
    _modelNameCtl = TextEditingController();
    _apiKeyCtl = TextEditingController();
    _clientSub = ref.listenManual<NodeServiceClient?>(
      nodeServiceProvider,
      (prev, next) {
        _configUnsub?.call();
        _configUnsub = null;
        if (next != null) {
          _configUnsub = next.on('home:config-updated', (_) {
            if (mounted) _loadCurrent();
          });
        }
      },
      fireImmediately: true,
    );
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
          <String, dynamic>{};
      final mode = (mp['mode'] as String?) ?? 'mock';
      final endpoint = (mp['endpoint'] as String?) ?? '';
      final modelName = (mp['modelName'] as String?) ?? '';
      final presetId = (mp['presetId'] as String?) ?? '';
      final localOnly = _isLocalMode(mode);
      final inferred = localOnly
          ? null
          : inferModelProviderPreset(
              mode: mode,
              endpoint: endpoint,
              presetId: presetId.isNotEmpty ? presetId : null,
            );
      if (!mounted) return;
      setState(() {
        _existingMp = Map<String, dynamic>.from(mp);
        _localOnly = localOnly;
        _localModeLabel = mode;
        if (localOnly) {
          _presetId = 'mock';
          _endpointCtl.text = endpoint;
          _modelNameCtl.text = modelName;
          // Never echo the API key into the field.
          _apiKeyCtl.clear();
        } else {
          _presetId = inferred!.id;
          _endpointCtl.text = endpoint.isNotEmpty
              ? endpoint
              : (inferred.defaultEndpoint ?? '');
          _modelNameCtl.text = modelName;
          _apiKeyCtl.clear();
        }
        _loaded = true;
      });
    } catch (_) {
      if (mounted) setState(() => _loaded = true);
    }
  }

  void _onPresetChanged(String? id) {
    if (id == null || _localOnly) return;
    final preset = getModelProviderPreset(id);
    if (preset == null) return;
    setState(() {
      _presetId = id;
      if (preset.defaultEndpoint != null) {
        _endpointCtl.text = preset.defaultEndpoint!;
      } else if (!preset.endpointEditable) {
        _endpointCtl.clear();
      }
      if (preset.models.isNotEmpty &&
          (_modelNameCtl.text.trim().isEmpty ||
              !preset.models.contains(_modelNameCtl.text.trim()))) {
        _modelNameCtl.text = preset.models.first;
      }
    });
  }

  @override
  void dispose() {
    _configUnsub?.call();
    _configUnsub = null;
    _clientSub?.close();
    _clientSub = null;
    _endpointCtl.dispose();
    _modelNameCtl.dispose();
    _apiKeyCtl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_localOnly) return;
    if (!(_formKey.currentState?.validate() ?? false)) return;
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    final preset = _preset;
    final showEndpoint = preset.endpointEditable;
    final showModel = preset.mode != 'disabled' && preset.mode != 'mock';
    setState(() => _saving = true);
    try {
      // Merge like Social UI — server shallow-replaces modelProviders.
      final next = <String, dynamic>{
        ..._existingMp,
        'presetId': preset.id,
        'mode': preset.mode,
      };
      if (preset.mode == 'mock' || preset.mode == 'disabled') {
        next.remove('endpoint');
        next.remove('modelName');
        next.remove('apiKey');
      } else {
        if (showEndpoint) {
          final ep = _endpointCtl.text.trim();
          if (ep.isNotEmpty) {
            next['endpoint'] = ep;
          } else {
            next.remove('endpoint');
          }
        }
        if (showModel) {
          final model = _modelNameCtl.text.trim();
          if (model.isNotEmpty) {
            next['modelName'] = model;
          } else {
            next.remove('modelName');
          }
          // Keep existing key if the field is left blank (do not wipe).
          if (_apiKeyCtl.text.isNotEmpty) {
            next['apiKey'] = _apiKeyCtl.text;
          }
        }
      }
      await client.updateModelProviders(next);
      if (!mounted) return;
      setState(() => _existingMp = next);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('AI model saved')),
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
    final preset = _preset;
    final showEndpoint = !_localOnly && preset.endpointEditable;
    final showModel =
        !_localOnly && preset.mode != 'disabled' && preset.mode != 'mock';
    final showApiKey = showModel;

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
                    'Cloud model provider for the home-node assistant. '
                    'Local Ollama/LiteLLM stay on the desktop Social UI.',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  if (_localOnly) ...[
                    const SizedBox(height: 16),
                    Card(
                      color: Theme.of(context).colorScheme.secondaryContainer,
                      child: ListTile(
                        leading: const Icon(Icons.computer),
                        title: Text('Home uses $_localModeLabel'),
                        subtitle: Text(
                          'Endpoint: ${_endpointCtl.text.isEmpty ? "(default)" : _endpointCtl.text}\n'
                          'Model: ${_modelNameCtl.text.isEmpty ? "(unset)" : _modelNameCtl.text}\n'
                          'Edit this provider on the home-node Social UI so '
                          'EnvoyGo does not overwrite your local setup.',
                        ),
                        isThreeLine: true,
                      ),
                    ),
                  ] else ...[
                    const SizedBox(height: 16),
                    DropdownButtonFormField<String>(
                      value: _presetId,
                      decoration: const InputDecoration(
                        labelText: 'Provider',
                        border: OutlineInputBorder(),
                      ),
                      items: cloudModelProviderPresets
                          .map(
                            (p) => DropdownMenuItem<String>(
                              value: p.id,
                              child: Text(p.label),
                            ),
                          )
                          .toList(),
                      onChanged: _onPresetChanged,
                    ),
                    if (showEndpoint) ...[
                      const SizedBox(height: 16),
                      TextFormField(
                        controller: _endpointCtl,
                        decoration: InputDecoration(
                          labelText: 'Endpoint URL',
                          hintText: preset.endpointPlaceholder,
                          border: const OutlineInputBorder(),
                        ),
                        keyboardType: TextInputType.url,
                      ),
                    ],
                    if (showModel) ...[
                      const SizedBox(height: 16),
                      if (preset.models.isNotEmpty)
                        DropdownButtonFormField<String>(
                          value:
                              preset.models.contains(_modelNameCtl.text.trim())
                                  ? _modelNameCtl.text.trim()
                                  : null,
                          decoration: const InputDecoration(
                            labelText: 'Model',
                            border: OutlineInputBorder(),
                          ),
                          items: [
                            ...preset.models.map(
                              (m) =>
                                  DropdownMenuItem(value: m, child: Text(m)),
                            ),
                          ],
                          onChanged: (v) {
                            if (v != null) {
                              setState(() => _modelNameCtl.text = v);
                            }
                          },
                        ),
                      if (preset.models.isEmpty ||
                          !preset.models
                              .contains(_modelNameCtl.text.trim())) ...[
                        SizedBox(height: preset.models.isEmpty ? 0 : 12),
                        TextFormField(
                          controller: _modelNameCtl,
                          decoration: InputDecoration(
                            labelText: preset.models.isEmpty
                                ? 'Model name'
                                : 'Custom model name',
                            hintText: preset.models.isNotEmpty
                                ? preset.models.first
                                : 'model-id',
                            border: const OutlineInputBorder(),
                          ),
                        ),
                      ],
                    ],
                    if (showApiKey) ...[
                      const SizedBox(height: 16),
                      TextFormField(
                        controller: _apiKeyCtl,
                        obscureText: _obscureApiKey,
                        decoration: InputDecoration(
                          labelText: 'API key',
                          helperText: _apiKeyCtl.text.isEmpty &&
                                  (_existingMp['apiKey'] as String?)
                                          ?.isNotEmpty ==
                                      true
                              ? 'A key is already saved on the home node'
                              : null,
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
                    ],
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
                ],
              ),
            ),
    );
  }
}
