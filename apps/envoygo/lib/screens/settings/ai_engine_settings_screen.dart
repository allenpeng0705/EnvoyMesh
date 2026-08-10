import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../l10n/app_localizations.dart';
import '../../ext_agent/ext_agent_presets.dart';
import '../../providers/contact_provider.dart' show nodeServiceProvider;
import '../../services/node_service_client.dart';
import '../../utils/open_external_url.dart';

/// AI Engine settings — Ext Agent selection with bidirectional sync.
///
/// Mirrors Social UI Settings → AI → AI Engine. Includes Pi + install hints.
class AiEngineSettingsScreen extends ConsumerStatefulWidget {
  const AiEngineSettingsScreen({super.key});

  @override
  ConsumerState<AiEngineSettingsScreen> createState() =>
      _AiEngineSettingsScreenState();
}

class _AiEngineSettingsScreenState
    extends ConsumerState<AiEngineSettingsScreen> {
  bool _loading = true;
  String? _error;
  Map<String, dynamic>? _openClawStatus;
  Map<String, dynamic>? _bridgeStatus;
  bool _bridgeEnabled = false;
  bool _openclawEnabled = true;
  String _activeExtAgentId = 'pi';
  List<Map<String, dynamic>> _extAgents = mergeExtAgentPresets(null);
  int _bridgeListenPort = 3031;
  bool _saving = false;
  ProviderSubscription<NodeServiceClient?>? _clientSub;
  void Function()? _configUnsub;
  void Function()? _bridgeUnsub;

  @override
  void initState() {
    super.initState();
    _clientSub = ref.listenManual<NodeServiceClient?>(
      nodeServiceProvider,
      (prev, next) {
        _configUnsub?.call();
        _configUnsub = null;
        _bridgeUnsub?.call();
        _bridgeUnsub = null;
        if (next != null) {
          // `home:config-updated` fires when the user edits the home node's
          // own config (e.g. toggles bridgeEnabled).
          _configUnsub = next.on('home:config-updated', (_) {
            if (mounted) _load();
          });
          // `bridge:status` fires when the bridge agent reachability
          // changes — covers the case where a new Ext Agent was added on
          // home between the phone's syncs.
          _bridgeUnsub = next.on('bridge:status', (_) {
            if (mounted) _load();
          });
          // Reconnect: pull fresh state immediately so the picker reflects
          // any new Ext Agents the home node has added since last sync.
          if (mounted) _load();
        }
      },
      fireImmediately: true,
    );
    _load();
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
        _error = AppLocalizations.of(context).settingsNotConnectedNode;
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
      final extAgents = mergeExtAgentPresets(
        (bridge['extAgents'] as List<dynamic>?) ??
            (cfg['extAgents'] as List<dynamic>?),
      );
      final activeId =
          (bridge['activeExtAgentId'] ?? cfg['activeExtAgentId'] ?? 'pi')
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
            : (extAgents.first['id'] as String? ?? 'pi');
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
        SnackBar(content: Text(AppLocalizations.of(context).settingsAiEngineSaved)),
      );
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(AppLocalizations.of(context).settingsSaveFailed('$e'))),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final active = _activeAgent;
    final install = getExtAgentInstallInfo(_activeExtAgentId);
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.meAiEngine),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: l10n.commonRefresh,
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
                      l10n.settingsAiEngineIntro,
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
                              decoration: InputDecoration(
                                labelText: l10n.settingsExternalAgent,
                                border: const OutlineInputBorder(),
                              ),
                              items: _extAgents
                                  .map(
                                    (agent) => DropdownMenuItem<String>(
                                      value: agent['id'] as String,
                                      child: Text(
                                        agent['name']?.toString() ??
                                            agent['id'] as String,
                                      ),
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
                              title: Text(l10n.settingsWebhookUrl),
                              subtitle: Text(
                                active['url']?.toString() ?? '',
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ListTile(
                            title: Text(l10n.settingsHowToStart),
                            subtitle: Text(install.startHint),
                          ),
                          if (install.homepageUrl != null)
                            ListTile(
                              title: Text(install.homepageLabel),
                              subtitle: Text(
                                install.homepageUrl!,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              trailing: const Icon(Icons.open_in_new, size: 18),
                              onTap: () =>
                                  openExternalUrl(install.homepageUrl!),
                            ),
                          if (install.builtIn)
                            ListTile(
                              leading: const Icon(Icons.check_circle_outline),
                              title: Text(l10n.settingsBuiltIntoHome),
                              subtitle: Text(l10n.settingsNoExtProcess),
                            ),
                          ListTile(
                            title: Text(l10n.settingsBridgePort),
                            subtitle: Text('$_bridgeListenPort'),
                          ),
                          SwitchListTile(
                            title: Text(l10n.settingsBridgeEnabled),
                            subtitle: Text(l10n.settingsBridgeHint),
                            value: _bridgeEnabled,
                            onChanged: (v) =>
                                setState(() => _bridgeEnabled = v),
                          ),
                          const Divider(height: 1),
                          SwitchListTile(
                            title: Text(l10n.settingsOpenClawEnabled),
                            subtitle: Text(l10n.settingsOpenClawHint),
                            value: _openclawEnabled,
                            onChanged: (v) =>
                                setState(() => _openclawEnabled = v),
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
                      label: Text(l10n.commonSave),
                    ),
                  ],
                ),
    );
  }

  @override
  void dispose() {
    _configUnsub?.call();
    _configUnsub = null;
    _bridgeUnsub?.call();
    _bridgeUnsub = null;
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
    final l10n = AppLocalizations.of(context);
    if (status == null) {
      return Card(
        child: ListTile(
          leading: const Icon(Icons.info_outline),
          title: Text(l10n.settingsOpenClawUnavailable),
        ),
      );
    }
    final enabled = status!['enabled'] == true;
    final running = status!['running'] == true;
    final url = status!['url']?.toString() ?? '';
    final state = enabled ? l10n.settingsEnabled : l10n.settingsDisabled;
    final runningSuffix = running
        ? ' · ${l10n.settingsRunning}'
        : (enabled ? ' · ${l10n.settingsNotRunning}' : '');
    return Card(
      child: ListTile(
        leading: Icon(
          running ? Icons.check_circle : Icons.circle_outlined,
          color: running ? Colors.green : Colors.grey,
        ),
        title: Text(
          l10n.settingsOpenClawStatus('$state$runningSuffix'),
        ),
        subtitle: url.isNotEmpty
            ? Text(url, maxLines: 2, overflow: TextOverflow.ellipsis)
            : null,
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
    final l10n = AppLocalizations.of(context);
    final enabled = status['enabled'] == true;
    final url = status['agentUrl']?.toString() ?? '';
    final state = enabled ? l10n.settingsEnabled : l10n.settingsDisabled;
    final nameSuffix = activeName != null ? ' · $activeName' : '';
    return Card(
      child: ListTile(
        leading: Icon(
          enabled ? Icons.link : Icons.link_off,
          color: enabled ? Colors.blue : Colors.grey,
        ),
        title: Text(
          l10n.settingsExtAgentStatus('$state$nameSuffix'),
        ),
        subtitle: url.isNotEmpty
            ? Text(url, maxLines: 2, overflow: TextOverflow.ellipsis)
            : null,
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
          FilledButton(
            onPressed: onRetry,
            child: Text(AppLocalizations.of(context).commonRetry),
          ),
        ],
      ),
    );
  }
}
