// Model provider settings — editable on EnvoyGo, synced to the home node
// via `updateNodeConfig` / `config:updated`.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/l10n_helpers.dart';
import '../models/model_provider_config.dart';
import '../providers/node_provider.dart';
import '../services/node_service_client.dart';

/// Cloud-friendly provider modes (matches Social `cloud-only` scope).
const _kModeIds = ['mock', 'openai-compatible', 'anthropic-compatible', 'disabled'];

class ModelProviderSection extends ConsumerStatefulWidget {
  const ModelProviderSection({super.key});

  @override
  ConsumerState<ModelProviderSection> createState() =>
      _ModelProviderSectionState();
}

class _ModelProviderSectionState extends ConsumerState<ModelProviderSection> {
  ModelProviderConfig? _config;
  bool _loading = true;
  bool _saving = false;
  String? _error;
  String? _savedHint;

  final _endpointCtrl = TextEditingController();
  final _modelCtrl = TextEditingController();
  final _apiKeyCtrl = TextEditingController();

  NodeServiceClient? _service;
  void Function()? _unsubConfig;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _attach());
  }

  @override
  void dispose() {
    _unsubConfig?.call();
    _endpointCtrl.dispose();
    _modelCtrl.dispose();
    _apiKeyCtrl.dispose();
    super.dispose();
  }

  void _attach() {
    _unsubConfig?.call();
    _unsubConfig = null;
    _service = null;

    final client = ref.read(nodeProvider.notifier).client;
    if (client == null || !client.isConnected) {
      setState(() {
        _loading = false;
        _config = null;
      });
      return;
    }

    final service = NodeServiceClient(client);
    _service = service;
    _unsubConfig = client.on('config:updated', (data) {
      if (data is! Map) return;
      final mp = data['modelProviders'];
      if (mp is! Map) return;
      _applyConfig(ModelProviderConfig.fromJson(Map<String, dynamic>.from(mp)));
    });

    _refresh();
  }

  void _applyConfig(ModelProviderConfig cfg) {
    setState(() {
      _config = cfg;
      _endpointCtrl.text = cfg.endpoint ?? '';
      _modelCtrl.text = cfg.modelName ?? '';
      _apiKeyCtrl.text = cfg.apiKey ?? '';
    });
  }

  Future<void> _refresh() async {
    final service = _service;
    if (service == null) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final raw = await service.getNodeConfig();
      final mp = raw['modelProviders'];
      if (!mounted) return;
      _applyConfig(ModelProviderConfig.fromJson(
        mp is Map ? Map<String, dynamic>.from(mp) : null,
      ));
      setState(() => _loading = false);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = '$e';
      });
    }
  }

  Future<void> _saveMode(String mode) async {
    final service = _service;
    final current = _config;
    if (service == null || current == null) return;
    final savedMsg = context.l10n.savedSyncedToHome;
    setState(() {
      _saving = true;
      _error = null;
      _savedHint = null;
    });
    try {
      await service.updateNodeConfig({
        'modelProviders': current.copyWith(mode: mode).toJson(),
      });
      if (!mounted) return;
      setState(() {
        _saving = false;
        _savedHint = savedMsg;
      });
      await _refresh();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = '$e';
      });
    }
  }

  Future<void> _saveFields() async {
    final service = _service;
    final current = _config;
    if (service == null || current == null) return;
    final savedMsg = context.l10n.savedSyncedToHome;
    setState(() {
      _saving = true;
      _error = null;
      _savedHint = null;
    });
    try {
      await service.updateNodeConfig({
        'modelProviders': current
            .copyWith(
              endpoint: _endpointCtrl.text.trim(),
              modelName: _modelCtrl.text.trim(),
              apiKey: _apiKeyCtrl.text.trim(),
            )
            .toJson(),
      });
      if (!mounted) return;
      setState(() {
        _saving = false;
        _savedHint = savedMsg;
      });
      await _refresh();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = '$e';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    ref.listen(nodeProvider, (prev, next) {
      if (prev?.connectionState != next.connectionState ||
          prev?.activeNode?.id != next.activeNode?.id) {
        _attach();
      }
    });

    if (_loading && _config == null) {
      return const Card(
        child: Padding(
          padding: EdgeInsets.all(16),
          child: Center(child: CircularProgressIndicator()),
        ),
      );
    }

    if (_service == null || _config == null) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Text(
            l10n.modelProviderConnectFirst,
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ),
      );
    }

    final cfg = _config!;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(l10n.modelProviderTitle,
                      style: Theme.of(context).textTheme.titleSmall),
                ),
                IconButton(
                  icon: const Icon(Icons.refresh, size: 18),
                  tooltip: l10n.modelProviderRefreshTooltip,
                  onPressed: _loading || _saving ? null : _refresh,
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              l10n.modelProviderSyncHint,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Colors.grey,
                    fontSize: 11,
                  ),
            ),
            const SizedBox(height: 12),
            Text(l10n.providerLabel, style: Theme.of(context).textTheme.labelMedium),
            const SizedBox(height: 4),
            DropdownButtonFormField<String>(
              value: cfg.mode,
              isExpanded: true,
              decoration: const InputDecoration(
                isDense: true,
                border: OutlineInputBorder(),
              ),
              items: _kModeIds
                  .map((id) => DropdownMenuItem(
                        value: id,
                        child: Text(localizedModelProviderMode(l10n, id)),
                      ))
                  .toList(),
              onChanged: _saving
                  ? null
                  : (v) {
                      if (v == null || v == cfg.mode) return;
                      _saveMode(v);
                    },
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _endpointCtrl,
              decoration: InputDecoration(
                labelText: l10n.endpointUrlLabel,
                hintText: localizedEndpointHint(l10n, cfg.mode),
                border: const OutlineInputBorder(),
                isDense: true,
              ),
              enabled: !_saving,
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _modelCtrl,
              decoration: InputDecoration(
                labelText: l10n.modelNameLabel,
                hintText: l10n.modelNameHint,
                border: const OutlineInputBorder(),
                isDense: true,
              ),
              enabled: !_saving,
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _apiKeyCtrl,
              decoration: InputDecoration(
                labelText: l10n.apiKeyLabel,
                border: const OutlineInputBorder(),
                isDense: true,
              ),
              obscureText: true,
              enabled: !_saving,
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                FilledButton(
                  onPressed: _saving ? null : _saveFields,
                  child: Text(_saving ? l10n.saving : l10n.save),
                ),
                if (_savedHint != null) ...[
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      _savedHint!,
                      style: Theme.of(context)
                          .textTheme
                          .bodySmall
                          ?.copyWith(color: Colors.green),
                    ),
                  ),
                ],
              ],
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(
                _error!,
                style: Theme.of(context)
                    .textTheme
                    .bodySmall
                    ?.copyWith(color: Colors.red),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
