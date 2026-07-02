import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/contact_provider.dart' show nodeServiceProvider;

/// AI Engine settings — Phase EnvoyGo settings (slice 2 — AI Engine).
///
/// Mirrors the Social UI's "AI Engine" section in
/// `apps/social/src/components/views/SettingsAITab.tsx`. Lets the
/// owner toggle the two AI-Engine knobs on the home node from
/// EnvoyGo:
///
///   - [bridgeEnabled] — whether the assistant bridge is active.
///   - [openclawEnabled] — whether the built-in OpenClaw gateway
///     is spawned on next node start.
///
/// The OpenClaw status (running flag, port, child pid, URL) is
/// displayed at the top of the screen so the owner can see the
/// effect of their changes after a node restart.
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
  bool _bridgeEnabled = false;
  bool _openclawEnabled = true;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    // Bidirectional sync: re-load when the home node's config changes
    // (e.g. via the Social UI or another mobile device).
    nodeServiceProvider
        .whenValueAvailable()
        .then((c) => c?.on("home:config-updated", (_) {
              if (mounted) _load();
            }));
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
        _error = 'Not connected to a home node';
      });
      return;
    }
    try {
      // Read both the OpenClaw status (live state) and the node
      // config (persisted toggles).
      final results = await Future.wait([
        client.getOpenClawStatus(),
        client.getNodeConfig(),
      ]);
      final status = results[0] as Map<String, dynamic>?;
      final cfg = results[1] as Map<String, dynamic>;
      if (!mounted) return;
      setState(() {
        _openClawStatus = status;
        _bridgeEnabled = cfg['bridgeEnabled'] == true;
        _openclawEnabled =
            cfg['openclawEnabled'] == null ? true : cfg['openclawEnabled'] == true;
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

  Future<void> _save() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    setState(() => _saving = true);
    try {
      final ok = await client.updateAiEngineSettings(
        bridgeEnabled: _bridgeEnabled,
        openclawEnabled: _openclawEnabled,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(ok ? 'AI Engine saved' : 'Save failed')),
      );
      // Reload so the OpenClaw status reflects the new state (if the
      // home node restarted the gateway on config change).
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
                      'Toggles for the home node\'s AI Engine. Changes '
                      'take effect on the next node start (or '
                      'immediately for the bridge toggle).',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    const SizedBox(height: 16),
                    _StatusCard(status: _openClawStatus),
                    const SizedBox(height: 16),
                    Card(
                      child: Column(
                        children: [
                          SwitchListTile(
                            title: const Text('Bridge enabled'),
                            subtitle: const Text(
                              'Assistant bridge is active. The Social UI '
                              'uses this to forward assistant turns between '
                              'devices.',
                            ),
                            value: _bridgeEnabled,
                            onChanged: (v) =>
                                setState(() => _bridgeEnabled = v ?? true),
                          ),
                          const Divider(height: 1),
                          SwitchListTile(
                            title: const Text('OpenClaw enabled'),
                            subtitle: const Text(
                              'Built-in OpenClaw gateway (EnvoyAI) is '
                              'spawned on next node start.',
                            ),
                            value: _openclawEnabled,
                            onChanged: (v) =>
                                setState(() => _openclawEnabled = v ?? true),
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
                              child:
                                  CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.save),
                      label: const Text('Save'),
                    ),
                  ],
                ),
    );
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
          subtitle: const Text(
            'The home node did not return a status. The gateway may '
            'be disabled or the node is not running.',
          ),
        ),
      );
    }
    final enabled = status!['enabled'] == true;
    final running = status!['running'] == true;
    final url = status!['url']?.toString() ?? '';
    final port = status!['port']?.toString();
    final childPid = status!['childPid']?.toString();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  running ? Icons.check_circle : Icons.circle_outlined,
                  color: running ? Colors.green : Colors.grey,
                ),
                const SizedBox(width: 8),
                Text(
                  'OpenClaw ${enabled ? "enabled" : "disabled"}'
                  '${running ? " · running" : (enabled ? " · not running" : "")}',
                  style: Theme.of(context).textTheme.titleSmall,
                ),
              ],
            ),
            if (url.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(
                'URL: $url',
                style: Theme.of(context).textTheme.bodySmall,
                overflow: TextOverflow.ellipsis,
              ),
            ],
            if (port != null && port.isNotEmpty) ...[
              Text(
                'Port: $port',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
            if (childPid != null && childPid.isNotEmpty) ...[
              Text(
                'Child PID: $childPid',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ],
        ),
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