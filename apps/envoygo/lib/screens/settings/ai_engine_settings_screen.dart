import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/contact_provider.dart' show nodeServiceProvider;
import '../../services/node_service_client.dart';

/// AI Engine settings — Ext Agent selection with bidirectional sync.
///
/// Mirrors the Social UI's Settings → AI → AI Engine section. Changes
/// from either surface persist on the home node and propagate via
/// `home:config-updated`.
class AiEngineSettingsScreen extends ConsumerStatefulWidget {
  const AiEngineSettingsScreen({super.key});

  @override
  ConsumerState<AiEngineSettingsScreen> createState() =>
      _AiEngineSettingsScreenState();
}

class _AiEngineSettingsScreenState
    extends ConsumerState<AiEngineSettingsScreen> {
  static const _defaultAgents = <Map<String, dynamic>>[
    {
      'id': 'homeclaw',
      'name': 'HomeClaw',
      'adapter': 'envoymesh-message',
      'url': 'http://127.0.0.1:8010/message',
      'enabled': true,
    },
    {
      'id': 'hermes',
      'name': 'Hermes',
      'adapter': 'envoymesh-message',
      'url': 'http://127.0.0.1:8020/message',
      'enabled': true,
    },
    {
      'id': 'openhuman',
      'name': 'OpenHuman',
      'adapter': 'envoymesh-message',
      'url': 'http://127.0.0.1:8021/message',
      'enabled': false,
    },
  ];

  bool _loading = true;
  String? _error;
  Map<String, dynamic>? _openClawStatus;
  Map<String, dynamic>? _bridgeStatus;
  bool _bridgeEnabled = false;
  bool _openclawEnabled = true;
  String _activeExtAgentId = 'homeclaw';
  List<Map<String, dynamic>> _extAgents = List.from(_defaultAgents);
  int _bridgeListenPort = 3031;
  bool _saving = false;
  ProviderSubscription<NodeServiceClient?>? _clientSub;
  void Function()? _configUnsub;

  @override
  void initState() {
    super.initState();
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

  List<Map<String, dynamic>> _mergeAgents(List<dynamic>? configured) {
    final byId = <String, Map<String, dynamic>>{
      for (final agent in _defaultAgents)
        agent['id'] as String: Map<String, dynamic>.from(agent),
    };
    for (final raw in configured ?? const []) {
      if (raw is! Map) continue;
      final id = raw['id']?.toString().trim();
      if (id == null || id.isEmpty) continue;
      final preset = byId[id];
      byId[id] = preset == null
          ? Map<String, dynamic>.from(raw)
          : {...preset, ...Map<String, dynamic>.from(raw), 'id': id};
    }
    return byId.values.toList();
  }

  Future<void> _load() async {
    if (!mounted) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    final client = ref.read(nodeServiceProvider);
    if (client == null) {
      setState(() {
        _loading = false;
        _error = 'Not connected to a home node';
      });
      return;
    }
    try {
      final results = await Future.wait([
        client.getOpenClawStatus(),
        client.getBridgeStatus(),
        client.getNodeConfig(),
      ]);
      final openClaw = results[0] as Map<String, dynamic>?;
      final bridge = results[1] as Map<String, dynamic>;
      final cfg = results[2] as Map<String, dynamic>;
      final extAgents = _mergeAgents(
        (bridge['extAgents'] as List<dynamic>?) ?? (cfg['extAgents'] as List<dynamic>?),
      );
      final activeId = (bridge['activeExtAgentId'] ?? cfg['activeExtAgentId'] ?? 'homeclaw')
          .toString();
      if (!mounted) return;
      setState(() {
        _openClawStatus = openClaw;
        _bridgeStatus = bridge;
        _bridgeEnabled = cfg['bridgeEnabled'] == true;
        _openclawEnabled =
            cfg['openclawEnabled'] == null ? true : cfg['openclawEnabled'] == true;
        _extAgents = extAgents;
        _activeExtAgentId = extAgents.any((a) => a['id'] == activeId)
            ? activeId
            : (extAgents.first['id'] as String? ?? 'homeclaw');
        _bridgeListenPort = (bridge['listenPort'] as num?)?.toInt() ??
            (cfg['bridgeListenPort'] as num?)?.toInt() ??
            3031;
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

  Map<String, dynamic>? get _activeAgent {
    for (final agent in _extAgents) {
      if (agent['id'] == _activeExtAgentId) return agent;
    }
    return _extAgents.isNotEmpty ? _extAgents.first : null;
  }

  Future<void> _save() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    setState(() => _saving = true);
    try {
      await client.updateAiEngineSettings(
        bridgeEnabled: _bridgeEnabled,
        openclawEnabled: _openclawEnabled,
        activeExtAgentId: _activeExtAgentId,
        extAgents: _extAgents,
        bridgeListenPort: _bridgeListenPort,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('AI Engine saved')),
      );
      await _load();
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
    final active = _activeAgent;
    return Scaffold(
      appBar: AppBar(
        title: const Text('AI Engine'),
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
              ? _ErrorView(message: _error!, onRetry: _load)
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    Text(
                      'Choose which external agent the home node forwards '
                      'assistant turns to. Changes sync with the Social UI.',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    const SizedBox(height: 16),
                    _StatusCard(status: _openClawStatus),
                    const SizedBox(height: 12),
                    if (_bridgeStatus != null)
                      _BridgeStatusCard(
                        status: _bridgeStatus!,
                        activeName: active?['name']?.toString(),
                      ),
                    const SizedBox(height: 16),
                    Card(
                      child: Column(
                        children: [
                          Padding(
                            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                            child: DropdownButtonFormField<String>(
                              value: _activeExtAgentId,
                              decoration: const InputDecoration(
                                labelText: 'External agent',
                                border: OutlineInputBorder(),
                              ),
                              items: _extAgents
                                  .map(
                                    (agent) => DropdownMenuItem<String>(
                                      value: agent['id'] as String,
                                      child: Text(agent['name']?.toString() ?? agent['id'] as String),
                                    ),
                                  )
                                  .toList(),
                              onChanged: (value) {
                                if (value == null) return;
                                setState(() => _activeExtAgentId = value);
                              },
                            ),
                          ),
                          if (active != null)
                            ListTile(
                              title: const Text('Webhook URL'),
                              subtitle: Text(
                                active['url']?.toString() ?? '',
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ListTile(
                            title: const Text('Bridge listen port'),
                            subtitle: Text('$_bridgeListenPort'),
                          ),
                          SwitchListTile(
                            title: const Text('Bridge enabled'),
                            subtitle: const Text(
                              'Forward assistant turns to the selected external agent.',
                            ),
                            value: _bridgeEnabled,
                            onChanged: (v) => setState(() => _bridgeEnabled = v),
                          ),
                          const Divider(height: 1),
                          SwitchListTile(
                            title: const Text('OpenClaw enabled'),
                            subtitle: const Text(
                              'Built-in OpenClaw gateway (EnvoyAI) on next node start.',
                            ),
                            value: _openclawEnabled,
                            onChanged: (v) => setState(() => _openclawEnabled = v),
                          ),
                        ],
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
    );
  }

  @override
  void dispose() {
    _configUnsub?.call();
    _configUnsub = null;
    _clientSub?.close();
    _clientSub = null;
    super.dispose();
  }
}

class _StatusCard extends StatelessWidget {
  final Map<String, dynamic>? status;
  const _StatusCard({required this.status});

  @override
  Widget build(BuildContext context) {
    if (status == null) {
      return Card(
        child: ListTile(
          leading: const Icon(Icons.info_outline),
          title: const Text('OpenClaw status unavailable'),
        ),
      );
    }
    final enabled = status!['enabled'] == true;
    final running = status!['running'] == true;
    final url = status!['url']?.toString() ?? '';
    return Card(
      child: ListTile(
        leading: Icon(
          running ? Icons.check_circle : Icons.circle_outlined,
          color: running ? Colors.green : Colors.grey,
        ),
        title: Text(
          'OpenClaw ${enabled ? "enabled" : "disabled"}'
          '${running ? " · running" : (enabled ? " · not running" : "")}',
        ),
        subtitle: url.isNotEmpty ? Text('URL: $url', maxLines: 2, overflow: TextOverflow.ellipsis) : null,
      ),
    );
  }
}

class _BridgeStatusCard extends StatelessWidget {
  final Map<String, dynamic> status;
  final String? activeName;
  const _BridgeStatusCard({required this.status, this.activeName});

  @override
  Widget build(BuildContext context) {
    final enabled = status['enabled'] == true;
    final url = status['agentUrl']?.toString() ?? '';
    return Card(
      child: ListTile(
        leading: Icon(
          enabled ? Icons.link : Icons.link_off,
          color: enabled ? Colors.blue : Colors.grey,
        ),
        title: Text(
          'Ext Agent ${enabled ? "enabled" : "disabled"}'
          '${activeName != null ? " · $activeName" : ""}',
        ),
        subtitle: url.isNotEmpty ? Text(url, maxLines: 2, overflow: TextOverflow.ellipsis) : null,
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  final String message;
  final Future<void> Function() onRetry;
  const _ErrorView({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.error_outline, color: Colors.red, size: 32),
          const SizedBox(height: 12),
          Text(message, textAlign: TextAlign.center),
          const SizedBox(height: 16),
          FilledButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
  }
}
