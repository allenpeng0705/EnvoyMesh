import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../ext_agent/ext_agent_presets.dart';
import '../providers/contact_provider.dart' show nodeServiceProvider;
import '../services/node_service_client.dart';

/// Banner when the active non-built-in Ext Agent is unreachable.
class ExtAgentOfflineBanner extends ConsumerStatefulWidget {
  const ExtAgentOfflineBanner({super.key});

  @override
  ConsumerState<ExtAgentOfflineBanner> createState() =>
      _ExtAgentOfflineBannerState();
}

class _ExtAgentOfflineBannerState
    extends ConsumerState<ExtAgentOfflineBanner> {
  static const _pollMs = 5000;

  Map<String, dynamic>? _status;
  bool _checking = false;
  bool _bridgeEnabled = false;
  String _activeId = 'pi';
  Timer? _poll;
  int _probeEpoch = 0;
  ProviderSubscription<NodeServiceClient?>? _clientSub;
  void Function()? _bridgeUnsub;
  void Function()? _configUnsub;

  @override
  void initState() {
    super.initState();
    _clientSub = ref.listenManual<NodeServiceClient?>(
      nodeServiceProvider,
      (prev, next) {
        _bridgeUnsub?.call();
        _configUnsub?.call();
        _bridgeUnsub = null;
        _configUnsub = null;
        if (next != null) {
          _bridgeUnsub = next.on('bridge:status', (_) {
            if (mounted) _refreshBridgeThenProbe();
          });
          _configUnsub = next.on('home:config-updated', (_) {
            if (mounted) _refreshBridgeThenProbe();
          });
        }
      },
      fireImmediately: true,
    );
    // fireImmediately already triggers when client is non-null; still probe
    // once in case the client was already set before listenManual.
    _refreshBridgeThenProbe();
  }

  Future<void> _refreshBridgeThenProbe() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    try {
      final bridge = await client.getBridgeStatus();
      if (!mounted) return;
      setState(() {
        _bridgeEnabled = bridge['enabled'] == true;
        final raw = (bridge['activeExtAgentId'] as String?)?.trim() ?? '';
        _activeId = raw.isNotEmpty ? raw : 'pi';
      });
    } catch (_) {
      // keep last-known
    }
    await _probe();
  }

  Future<void> _probe() async {
    if (_checking) return;
    final client = ref.read(nodeServiceProvider);
    if (client == null || !_bridgeEnabled) {
      _stopPoll();
      if (mounted) setState(() => _status = null);
      return;
    }
    final epoch = ++_probeEpoch;
    setState(() => _checking = true);
    try {
      final next = await client.probeExtAgent(agentId: _activeId);
      if (!mounted || epoch != _probeEpoch) return;
      setState(() => _status = next);
      _syncPoll(next);
    } catch (_) {
      // keep last-known; leave poll running if already offline
    } finally {
      if (mounted && epoch == _probeEpoch) {
        setState(() => _checking = false);
      }
    }
  }

  void _syncPoll(Map<String, dynamic> status) {
    final builtIn = status['builtIn'] == true;
    final reachable = status['reachable'] == true;
    if (builtIn || reachable) {
      _stopPoll();
      return;
    }
    _poll ??= Timer.periodic(const Duration(milliseconds: _pollMs), (_) {
      _probe();
    });
  }

  void _stopPoll() {
    _poll?.cancel();
    _poll = null;
  }

  @override
  void dispose() {
    _probeEpoch++;
    _stopPoll();
    _bridgeUnsub?.call();
    _configUnsub?.call();
    _clientSub?.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final status = _status;
    if (!_bridgeEnabled ||
        status == null ||
        status['builtIn'] == true ||
        status['reachable'] == true) {
      return const SizedBox.shrink();
    }

    final name = (status['agentName'] as String?)?.trim().isNotEmpty == true
        ? status['agentName'] as String
        : _activeId;
    final agentId = (status['agentId'] as String?) ?? _activeId;
    final hint = (status['hint'] as String?)?.trim().isNotEmpty == true
        ? status['hint'] as String
        : defaultExtAgentStartHint(agentId);
    final scheme = Theme.of(context).colorScheme;

    return Material(
      color: scheme.errorContainer.withValues(alpha: 0.55),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.cloud_off, color: scheme.onErrorContainer, size: 20),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '$name is not running',
                    style: TextStyle(
                      fontWeight: FontWeight.w600,
                      color: scheme.onErrorContainer,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    hint,
                    style: TextStyle(
                      fontSize: 13,
                      color: scheme.onErrorContainer.withValues(alpha: 0.9),
                    ),
                  ),
                ],
              ),
            ),
            TextButton(
              onPressed: _checking ? null : _probe,
              child: Text(_checking ? 'Checking…' : 'Check again'),
            ),
          ],
        ),
      ),
    );
  }
}
