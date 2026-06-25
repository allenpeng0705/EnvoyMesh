// External Agent Bridge — editable on EnvoyGo, synced to the home node
// via `getBridgeConfig` / `updateBridgeConfig` and `updateNodeConfig`.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/app_localizations.dart';
import '../l10n/l10n_helpers.dart';
import '../models/ext_agent_config.dart';
import '../providers/node_provider.dart';
import '../services/node_service_client.dart';

class ExtAgentSection extends ConsumerStatefulWidget {
  const ExtAgentSection({super.key});

  @override
  ConsumerState<ExtAgentSection> createState() => _ExtAgentSectionState();
}

class _ExtAgentSectionState extends ConsumerState<ExtAgentSection> {
  bool _loading = true;
  bool _saving = false;
  bool _bridgeEnabled = false;
  BridgeConfigView? _config;
  Map<String, String> _reachability = {};
  String? _error;
  String? _savedHint;

  String _selectedAgentId = 'homeclaw';
  final _customIdCtrl = TextEditingController();
  final _nameCtrl = TextEditingController();
  final _urlCtrl = TextEditingController();

  NodeServiceClient? _service;
  void Function()? _unsubBridge;
  void Function()? _unsubConfig;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _attach());
  }

  @override
  void dispose() {
    _unsubBridge?.call();
    _unsubConfig?.call();
    _customIdCtrl.dispose();
    _nameCtrl.dispose();
    _urlCtrl.dispose();
    super.dispose();
  }

  void _attach() {
    _unsubBridge?.call();
    _unsubConfig?.call();
    _unsubBridge = null;
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
    _unsubBridge = client.on('bridge:status', (_) => _refresh());
    _unsubConfig = client.on('config:updated', (_) => _refresh());

    _refresh();
  }

  void _applyDraftFields(BridgeConfigView cfg) {
    _selectedAgentId = cfg.activeId;
    if (isCustomExtAgentSelection(_selectedAgentId) &&
        _selectedAgentId != customExtAgentNewId) {
      _customIdCtrl.text = _selectedAgentId;
    } else if (_selectedAgentId == customExtAgentNewId) {
      _customIdCtrl.text = '';
    }
    _nameCtrl.text = cfg.agentName;
    _urlCtrl.text = cfg.agentUrl;
  }

  Future<void> _refresh() async {
    final service = _service;
    if (service == null) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        service.getNodeConfig(),
        service.getBridgeConfig(),
        service.probeExtAgents(),
      ]);
      if (!mounted) return;
      final nodeCfg = Map<String, dynamic>.from(results[0] as Map);
      final bridgeCfg = BridgeConfigView.fromJson(
        Map<String, dynamic>.from(results[1] as Map),
      );
      final probe = Map<String, dynamic>.from(results[2] as Map);
      final reachability = <String, String>{};
      final entries = probe['entries'];
      if (entries is List) {
        for (final raw in entries) {
          if (raw is! Map) continue;
          final id = raw['id'] as String?;
          final r = raw['reachability'] as String?;
          if (id != null && r != null) reachability[id] = r;
        }
      }
      setState(() {
        _bridgeEnabled = nodeCfg['bridgeEnabled'] == true;
        _config = bridgeCfg;
        _reachability = reachability;
        _loading = false;
      });
      _applyDraftFields(bridgeCfg);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = '$e';
      });
    }
  }

  void _onAgentSelected(String? nextId) {
    if (nextId == null || _config == null) return;
    final base = _config!;
    final BridgeConfigView next;
    if (nextId == customExtAgentNewId || isCustomExtAgentSelection(nextId)) {
      if (nextId == customExtAgentNewId) {
        _customIdCtrl.text = '';
      } else {
        _customIdCtrl.text = nextId;
      }
      next = applyCustomAgentSelect(base, nextId);
    } else {
      _customIdCtrl.text = '';
      next = applyPresetToDraft(base, nextId);
    }
    setState(() {
      _selectedAgentId = nextId;
      _config = next;
    });
    _nameCtrl.text = next.agentName;
    _urlCtrl.text = next.agentUrl;

    if (nextId != customExtAgentNewId) {
      void quickSwitch() => _save();
      quickSwitch();
    }
  }

  Future<void> _save({bool bridgeEnabledOnly = false}) async {
    final service = _service;
    final cfg = _config;
    if (service == null || cfg == null) return;

    if (!bridgeEnabledOnly && _selectedAgentId == customExtAgentNewId) {
      final id = slugifyExtAgentId(
        _customIdCtrl.text.isNotEmpty ? _customIdCtrl.text : _nameCtrl.text,
      );
      if (id.isEmpty ||
          _nameCtrl.text.trim().isEmpty ||
          _urlCtrl.text.trim().isEmpty) {
        setState(() => _error = context.l10n.extAgentSaveError);
        return;
      }
    }

    final savedMsg = context.l10n.savedSyncedToHome;
    setState(() {
      _saving = true;
      _error = null;
      _savedHint = null;
    });

    try {
      await service.updateNodeConfig({'bridgeEnabled': _bridgeEnabled});

      if (!bridgeEnabledOnly) {
        final finalized = finalizeExtAgentDraft(
          draft: cfg,
          customAgentIdInput: _customIdCtrl.text,
          name: _nameCtrl.text,
          url: _urlCtrl.text,
        );
        final result = await service.updateBridgeConfig(
          bridgeConfigToUpdateParams(finalized),
        );
        if (result['ok'] != true) {
          throw StateError(result['reason'] as String? ?? 'Save failed');
        }
      }

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

  String _reachabilityLabel(AppLocalizations l10n, String id) {
    switch (_reachability[id]) {
      case 'running':
        return l10n.statusRunning;
      case 'stopped':
        return l10n.extAgentStatusStopped;
      case 'disabled':
        return l10n.statusDisabled;
      default:
        return l10n.extAgentStatusUnknown;
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
            l10n.extAgentConnectFirst,
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ),
      );
    }

    final options = listEditAgentSelectOptions(_config!.extAgents);
    final editingCustom = isCustomExtAgentSelection(_selectedAgentId);
    final preset = getExtAgentPreset(
      _selectedAgentId == customExtAgentNewId ? null : _selectedAgentId,
    );
    final dropdownValue = options.any((o) => o.id == _selectedAgentId) ||
            _selectedAgentId == customExtAgentNewId
        ? _selectedAgentId
        : options.first.id;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    l10n.extAgentTitle,
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.refresh, size: 18),
                  tooltip: l10n.extAgentRefreshTooltip,
                  onPressed: _loading || _saving ? null : _refresh,
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              l10n.extAgentSyncHint,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Colors.grey,
                    fontSize: 11,
                  ),
            ),
            const SizedBox(height: 12),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(l10n.extAgentEnableLabel),
              value: _bridgeEnabled,
              onChanged: _saving
                  ? null
                  : (v) {
                      setState(() => _bridgeEnabled = v);
                      _save(bridgeEnabledOnly: true);
                    },
            ),
            const SizedBox(height: 8),
            Text(
              l10n.extAgentActiveBackend,
              style: Theme.of(context).textTheme.labelMedium,
            ),
            const SizedBox(height: 4),
            DropdownButtonFormField<String>(
              value: dropdownValue,
              isExpanded: true,
              decoration: const InputDecoration(
                isDense: true,
                border: OutlineInputBorder(),
              ),
              items: [
                ...options
                    .where((o) => o.kind == 'bundled')
                    .map((o) => DropdownMenuItem(
                          value: o.id,
                          child: Text(
                            '${o.name}${_reachability.containsKey(o.id) ? ' — ${_reachabilityLabel(l10n, o.id)}' : ''}',
                          ),
                        )),
                ...options
                    .where((o) => o.kind == 'custom')
                    .map((o) => DropdownMenuItem(
                          value: o.id,
                          child: Text(
                            '${o.name}${_reachability.containsKey(o.id) ? ' — ${_reachabilityLabel(l10n, o.id)}' : ''}',
                          ),
                        )),
                DropdownMenuItem(
                  value: customExtAgentNewId,
                  child: Text(l10n.extAgentAddCustom),
                ),
              ],
              onChanged: _saving ? null : _onAgentSelected,
            ),
            if (preset != null) ...[
              const SizedBox(height: 8),
              Text(
                localizedExtAgentHint(l10n, preset.id),
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Colors.grey,
                      fontSize: 11,
                    ),
              ),
            ] else if (editingCustom) ...[
              const SizedBox(height: 8),
              Text(
                l10n.extAgentHintCustom,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Colors.grey,
                      fontSize: 11,
                    ),
              ),
            ],
            if (editingCustom) ...[
              const SizedBox(height: 12),
              TextField(
                controller: _customIdCtrl,
                readOnly: _selectedAgentId != customExtAgentNewId,
                enabled: _selectedAgentId == customExtAgentNewId && !_saving,
                decoration: InputDecoration(
                  labelText: l10n.extAgentIdLabel,
                  hintText: l10n.extAgentIdPlaceholder,
                  helperText: l10n.extAgentIdHint,
                  border: const OutlineInputBorder(),
                  isDense: true,
                ),
              ),
            ],
            const SizedBox(height: 12),
            TextField(
              controller: _nameCtrl,
              decoration: InputDecoration(
                labelText: l10n.extAgentNameLabel,
                hintText: preset?.name ?? l10n.extAgentNamePlaceholder,
                border: const OutlineInputBorder(),
                isDense: true,
              ),
              enabled: !_saving,
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _urlCtrl,
              decoration: InputDecoration(
                labelText: l10n.extAgentUrlLabel,
                hintText: preset?.url ?? 'http://127.0.0.1:8010/message',
                border: const OutlineInputBorder(),
                isDense: true,
              ),
              enabled: !_saving,
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                FilledButton(
                  onPressed: _saving ? null : () => _save(),
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
