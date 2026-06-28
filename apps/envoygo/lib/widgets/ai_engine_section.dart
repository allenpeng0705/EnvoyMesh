// Phase 32 — AI Engine status mirror (read-only overview).
//
// Built-in OpenClaw status is read-only here. External Agent Bridge is
// configured in [ExtAgentSection] below (synced to the home node).

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../l10n/l10n_helpers.dart';
import '../providers/node_provider.dart';
import '../services/node_service_client.dart';

/// Computed mode mirroring `AiEngineMode` in `@envoymesh/api`.
enum AiEngineMode { both, openclawOnly, extOnly, off }

AiEngineMode computeAiEngineMode({
  required bool bridgeEnabled,
  required bool openclawEnabled,
}) {
  if (bridgeEnabled && openclawEnabled) return AiEngineMode.both;
  if (openclawEnabled) return AiEngineMode.openclawOnly;
  if (bridgeEnabled) return AiEngineMode.extOnly;
  return AiEngineMode.off;
}

/// Formats the Ext Agent subtitle from home `getBridgeStatus()` JSON.
String formatExtAgentBridgeSubtitle(Map<String, dynamic>? bridge) {
  if (bridge == null) return '';
  final name = bridge['agentName'] as String? ?? '';
  final adapter = bridge['adapter'] as String? ?? '';
  if (name.isEmpty && adapter.isEmpty) return '';
  if (adapter.isEmpty) return name;
  return '$name · $adapter';
}

class AiEngineSection extends ConsumerStatefulWidget {
  const AiEngineSection({super.key});

  @override
  ConsumerState<AiEngineSection> createState() => _AiEngineSectionState();
}

class _AiEngineSectionState extends ConsumerState<AiEngineSection> {
  Map<String, dynamic>? _openClaw;
  Map<String, dynamic>? _bridge;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _refresh());
  }

  Future<void> _refresh() async {
    if (!mounted) return;
    setState(() => _loading = true);
    final nodeNotifier = ref.read(nodeProvider.notifier);
    final homeClient = nodeNotifier.client;
    if (homeClient == null || !homeClient.isConnected) {
      setState(() {
        _loading = false;
        _openClaw = null;
        _bridge = null;
      });
      return;
    }
    final client = NodeServiceClient(homeClient);
    try {
      final results = await Future.wait([
        client.getOpenClawStatus(),
        client.getBridgeStatus(),
      ]);
      if (!mounted) return;
      setState(() {
        _openClaw = results[0];
        _bridge = results[1];
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
      });
    }
  }

  String _bridgeSubtitle() => formatExtAgentBridgeSubtitle(_bridge);

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final bridgeEnabled = _bridge?['enabled'] == true;
    final openclawEnabled = _openClaw?['enabled'] == true;
    final openclawRunning = _openClaw?['running'] == true;
    final mode = computeAiEngineMode(
      bridgeEnabled: bridgeEnabled,
      openclawEnabled: openclawEnabled,
    );

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(l10n.aiEngineTitle,
                      style: Theme.of(context).textTheme.titleSmall),
                ),
                IconButton(
                  icon: const Icon(Icons.refresh, size: 18),
                  tooltip: l10n.refresh,
                  onPressed: _loading ? null : _refresh,
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(localizedAiEngineMode(l10n, mode),
                style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 8),
            _EngineRow(
              label: l10n.builtInOpenClaw,
              enabled: openclawEnabled,
              running: openclawRunning,
              readOnly: true,
            ),
            const SizedBox(height: 4),
            _EngineRow(
              label: l10n.externalAgentBridge,
              enabled: bridgeEnabled,
              running: _bridge != null && (_bridge!['agentPeerId'] as String? ?? '').isNotEmpty,
              readOnly: true,
              subtitle: _bridgeSubtitle(),
            ),
            const SizedBox(height: 8),
            Text(
              l10n.aiEngineReadOnlyHint,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Colors.grey,
                    fontSize: 11,
                  ),
            ),
          ],
        ),
      ),
    );
  }
}

class _EngineRow extends StatelessWidget {
  final String label;
  final bool enabled;
  final bool running;
  final bool readOnly;
  final String subtitle;
  const _EngineRow({
    required this.label,
    required this.enabled,
    required this.running,
    this.readOnly = false,
    this.subtitle = '',
  });

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final color = !enabled
        ? Colors.grey
        : (running ? Colors.green : Colors.orange);
    final statusText = !enabled
        ? l10n.statusDisabled
        : (running ? l10n.statusRunning : l10n.statusConfiguredNotRunning);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(Icons.circle, size: 10, color: color),
            const SizedBox(width: 8),
            Expanded(child: Text(label, style: Theme.of(context).textTheme.bodySmall)),
            if (!readOnly)
              Switch(value: enabled, onChanged: (_) {})
            else
              Text(statusText,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(color: color)),
          ],
        ),
        if (subtitle.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(left: 18, top: 2),
            child: Text(
              subtitle,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Colors.grey,
                    fontSize: 11,
                  ),
            ),
          ),
      ],
    );
  }
}
