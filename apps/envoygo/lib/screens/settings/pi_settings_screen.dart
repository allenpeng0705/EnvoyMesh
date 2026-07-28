import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../ai/pi_native_providers.dart';
import '../../providers/contact_provider.dart' show nodeServiceProvider;
import '../../services/node_service_client.dart';

/// Pi agent settings — enable/disable + model override (mirrors Social UI).
///
/// `piSettings` is shallow-replaced on the home node — always merge with the
/// current object before save (same as SettingsAITab).
class PiSettingsScreen extends ConsumerStatefulWidget {
  const PiSettingsScreen({super.key});

  @override
  ConsumerState<PiSettingsScreen> createState() => _PiSettingsScreenState();
}

class _PiSettingsScreenState extends ConsumerState<PiSettingsScreen> {
  bool _loading = true;
  bool _saving = false;
  bool _restarting = false;
  String? _error;
  bool _piEnabled = true;
  String _provider = 'minimax-cn';
  late TextEditingController _modelCtl;
  late TextEditingController _endpointCtl;
  late TextEditingController _apiKeyCtl;
  bool _obscureApiKey = true;
  Map<String, dynamic>? _status;
  Map<String, dynamic> _existingPiSettings = const {};
  bool _hasSavedApiKey = false;
  ProviderSubscription<NodeServiceClient?>? _clientSub;
  void Function()? _configUnsub;

  PiNativeProvider? get _providerInfo => getPiNativeProvider(_provider);

  List<DropdownMenuItem<String>> get _providerItems {
    final items = piNativeProviders
        .map(
          (p) => DropdownMenuItem(value: p.id, child: Text(p.label)),
        )
        .toList();
    // Unknown provider from desktop (e.g. groq) — keep selectable so the
    // dropdown does not assert.
    if (getPiNativeProvider(_provider) == null && _provider.isNotEmpty) {
      items.insert(
        0,
        DropdownMenuItem(value: _provider, child: Text('$_provider (custom)')),
      );
    }
    return items;
  }

  @override
  void initState() {
    super.initState();
    _modelCtl = TextEditingController();
    _endpointCtl = TextEditingController();
    _apiKeyCtl = TextEditingController();
    _clientSub = ref.listenManual<NodeServiceClient?>(
      nodeServiceProvider,
      (prev, next) {
        _configUnsub?.call();
        _configUnsub = null;
        if (next != null) {
          _configUnsub = next.on('home:config-updated', (_) {
            if (mounted) _load();
          });
        }
      },
      fireImmediately: true,
    );
    _load();
  }

  Future<void> _load() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) {
      setState(() {
        _loading = false;
        _error = 'Not connected to a home node';
      });
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        client.getNodeConfig(),
        client.getPiStatus(),
      ]);
      final cfg = results[0] as Map<String, dynamic>;
      final status = results[1] as Map<String, dynamic>;
      final settings =
          (cfg['piSettings'] as Map?)?.cast<String, dynamic>() ??
              <String, dynamic>{};
      final override =
          (settings['modelOverride'] as Map?)?.cast<String, dynamic>() ??
              <String, dynamic>{};
      final rawProvider =
          (override['provider'] as String?)?.trim().isNotEmpty == true
              ? override['provider'] as String
              : piProviderFromEnvoyMode(
                  override['mode'] as String?,
                  override['endpoint'] as String?,
                );
      if (!mounted) return;
      setState(() {
        _piEnabled = cfg['piEnabled'] != false;
        _existingPiSettings = Map<String, dynamic>.from(settings);
        _provider = rawProvider;
        _modelCtl.text = (override['model'] as String?) ?? '';
        _endpointCtl.text = (override['endpoint'] as String?) ?? '';
        _apiKeyCtl.clear();
        _hasSavedApiKey =
            (override['apiKey'] as String?)?.trim().isNotEmpty == true;
        _status = status;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  Future<void> _toggleEnabled(bool enabled) async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    setState(() {
      _piEnabled = enabled;
      _restarting = true;
    });
    try {
      await client.updatePiConfig(piEnabled: enabled);
      final s = await client.restartPi();
      if (mounted) setState(() => _status = s);
    } catch (e) {
      if (mounted) {
        setState(() => _piEnabled = !enabled);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _restarting = false);
    }
  }

  Future<void> _saveModel() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    final model = _modelCtl.text.trim();
    if (model.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Model name is required')),
      );
      return;
    }
    setState(() => _saving = true);
    try {
      final override = <String, dynamic>{
        'provider': _provider,
        'model': model,
        if (_endpointCtl.text.trim().isNotEmpty)
          'endpoint': _endpointCtl.text.trim(),
      };
      if (_apiKeyCtl.text.isNotEmpty) {
        override['apiKey'] = _apiKeyCtl.text;
      } else if (_hasSavedApiKey) {
        // Preserve existing key when the field is left blank.
        final prev = (_existingPiSettings['modelOverride'] as Map?)
            ?.cast<String, dynamic>();
        final prevKey = prev?['apiKey'] as String?;
        if (prevKey != null && prevKey.isNotEmpty) {
          override['apiKey'] = prevKey;
        }
      }
      final nextSettings = <String, dynamic>{
        ..._existingPiSettings,
        'modelOverride': override,
      };
      await client.updatePiConfig(piSettings: nextSettings);
      final s = await client.restartPi();
      if (!mounted) return;
      setState(() {
        _status = s;
        _existingPiSettings = nextSettings;
        _hasSavedApiKey = override['apiKey'] != null;
        _apiKeyCtl.clear();
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Pi model saved')),
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

  Future<void> _clearOverride() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    setState(() => _saving = true);
    try {
      final nextSettings = Map<String, dynamic>.from(_existingPiSettings)
        ..remove('modelOverride');
      await client.updatePiConfig(piSettings: nextSettings);
      final s = await client.restartPi();
      if (!mounted) return;
      setState(() {
        _status = s;
        _existingPiSettings = nextSettings;
        _modelCtl.clear();
        _endpointCtl.clear();
        _apiKeyCtl.clear();
        _hasSavedApiKey = false;
        _provider = 'minimax-cn';
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Pi inherits EnvoyMesh model settings')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Clear failed: $e')),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  void dispose() {
    _configUnsub?.call();
    _clientSub?.close();
    _modelCtl.dispose();
    _endpointCtl.dispose();
    _apiKeyCtl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final info = _providerInfo;
    final state = _status?['state']?.toString() ?? 'unknown';
    final modelSpec = _status?['modelSpec']?.toString();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Pi Agent'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loading ? null : _load,
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(_error!, textAlign: TextAlign.center),
                        const SizedBox(height: 12),
                        FilledButton(
                          onPressed: _load,
                          child: const Text('Retry'),
                        ),
                      ],
                    ),
                  ),
                )
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    Card(
                      child: ListTile(
                        leading: Icon(
                          state == 'ready'
                              ? Icons.check_circle
                              : Icons.circle_outlined,
                          color: state == 'ready' ? Colors.green : Colors.grey,
                        ),
                        title: Text('State: $state'),
                        subtitle: modelSpec != null && modelSpec.isNotEmpty
                            ? Text(modelSpec)
                            : const Text('Built-in local coding agent'),
                      ),
                    ),
                    const SizedBox(height: 12),
                    SwitchListTile(
                      title: const Text('Pi enabled'),
                      subtitle: const Text(
                        'Local-only coding agent (no mesh tools).',
                      ),
                      value: _piEnabled,
                      onChanged: _restarting ? null : _toggleEnabled,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Model override (optional). Clear to inherit AI Model settings.',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    const SizedBox(height: 12),
                    DropdownButtonFormField<String>(
                      value: _provider,
                      decoration: const InputDecoration(
                        labelText: 'Provider',
                        border: OutlineInputBorder(),
                      ),
                      items: _providerItems,
                      onChanged: !_piEnabled
                          ? null
                          : (v) {
                              if (v == null) return;
                              setState(() {
                                _provider = v;
                                final models = getPiNativeProvider(v)?.models;
                                if (models != null &&
                                    models.isNotEmpty &&
                                    (_modelCtl.text.trim().isEmpty ||
                                        !models
                                            .contains(_modelCtl.text.trim()))) {
                                  _modelCtl.text = models.first;
                                }
                              });
                            },
                    ),
                    const SizedBox(height: 12),
                    if (info != null && info.models.isNotEmpty)
                      DropdownButtonFormField<String>(
                        value: info.models.contains(_modelCtl.text.trim())
                            ? _modelCtl.text.trim()
                            : null,
                        decoration: const InputDecoration(
                          labelText: 'Model',
                          border: OutlineInputBorder(),
                        ),
                        items: info.models
                            .map(
                              (m) =>
                                  DropdownMenuItem(value: m, child: Text(m)),
                            )
                            .toList(),
                        onChanged: !_piEnabled
                            ? null
                            : (v) {
                                if (v != null) {
                                  setState(() => _modelCtl.text = v);
                                }
                              },
                      ),
                    if (info == null ||
                        info.models.isEmpty ||
                        !info.models.contains(_modelCtl.text.trim())) ...[
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _modelCtl,
                        enabled: _piEnabled,
                        decoration: const InputDecoration(
                          labelText: 'Model name',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ],
                    if (info?.supportsEndpoint == true) ...[
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _endpointCtl,
                        enabled: _piEnabled,
                        decoration: InputDecoration(
                          labelText: 'Endpoint',
                          hintText: info?.endpointPlaceholder,
                          border: const OutlineInputBorder(),
                        ),
                      ),
                    ],
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _apiKeyCtl,
                      enabled: _piEnabled,
                      obscureText: _obscureApiKey,
                      decoration: InputDecoration(
                        labelText: 'API key',
                        helperText: _hasSavedApiKey
                            ? 'Leave blank to keep the saved key'
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
                    const SizedBox(height: 20),
                    FilledButton.icon(
                      onPressed: (!_piEnabled || _saving) ? null : _saveModel,
                      icon: _saving
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.save),
                      label: const Text('Save model override'),
                    ),
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed:
                          (!_piEnabled || _saving) ? null : _clearOverride,
                      child: const Text('Clear override (inherit AI Model)'),
                    ),
                  ],
                ),
    );
  }
}
