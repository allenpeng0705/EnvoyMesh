// Phase 32 — AI Engine mirror (read-only).
//
// Mobile is a thin client; the AI engine (built-in OpenClaw + Ext Agent
// bridge) lifecycle lives on the home node. This widget shows the user which
// engines are currently reachable through the home node's mesh, sourced from
// `getOpenClawStatus()` and `getBridgeStatus()`.
//
// The Built-in OpenClaw block is **read-only** here — the home-node owner
// edits `node-config.json` and restarts to change it. The External Agent
// Bridge block is **also** read-only in this phase (changes flow through
// the home-node Settings → AI → AI Engine screen). The home node's UI
// is the source of truth; this widget is a status mirror.
//
// (Note: the home-node's separate "Agent Network" tab in Settings is for
// onboarding other nodes — pairing, fleet manifest, company invites — not
// the AI engine on this home node.)
//
// Reflects the reframed Phase 32 design doc §1 / §4.4 / §4.5.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
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

  String _modeLabel(AiEngineMode mode) {
    switch (mode) {
      case AiEngineMode.both:
        return 'Built-in + Ext';
      case AiEngineMode.openclawOnly:
        return 'Built-in only';
      case AiEngineMode.extOnly:
        return 'Ext only';
      case AiEngineMode.off:
        return 'None';
    }
  }

  @override
  Widget build(BuildContext context) {
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
                  child: Text('AI Engine',
                      style: Theme.of(context).textTheme.titleSmall),
                ),
                IconButton(
                  icon: const Icon(Icons.refresh, size: 18),
                  tooltip: 'Refresh',
                  onPressed: _loading ? null : _refresh,
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(_modeLabel(mode),
                style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 8),
            _EngineRow(
              label: 'Built-in OpenClaw',
              enabled: openclawEnabled,
              running: openclawRunning,
              readOnly: true,
            ),
            const SizedBox(height: 4),
            _EngineRow(
              label: 'External Agent Bridge',
              enabled: bridgeEnabled,
              running: _bridge != null && (_bridge!['agentPeerId'] as String? ?? '').isNotEmpty,
              readOnly: true,
            ),
            const SizedBox(height: 8),
            Text(
              'Both blocks are read-only on mobile. Configure on the home node (Settings → AI → AI Engine). To disable Built-in OpenClaw, edit node-config.json on the home node and restart it.',
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
  const _EngineRow({required this.label, required this.enabled, required this.running, this.readOnly = false});

  @override
  Widget build(BuildContext context) {
    final color = !enabled
        ? Colors.grey
        : (running ? Colors.green : Colors.orange);
    final statusText = !enabled
        ? 'Disabled'
        : (running ? 'Running' : 'Configured (not running)');
    return Row(
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
    );
  }
}
