import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../ext_agent/ext_agent_presets.dart';
import '../providers/contact_provider.dart' show nodeServiceProvider;

/// Icon-button switcher for the active Ext Agent (Pi / HomeClaw / …).
///
/// Switches via `activeExtAgentId` only. Soft-probes after switch.
class ExtAgentSwitcher extends ConsumerStatefulWidget {
  /// When true, only the swap icon is shown (list row). Name lives elsewhere.
  final bool iconOnly;

  const ExtAgentSwitcher({super.key, this.iconOnly = false});

  @override
  ConsumerState<ExtAgentSwitcher> createState() => _ExtAgentSwitcherState();
}

class _ExtAgentSwitcherState extends ConsumerState<ExtAgentSwitcher> {
  bool _busy = false;
  String? _pendingId;
  String _activeId = 'pi';
  bool _bridgeEnabled = false;
  List<Map<String, dynamic>> _agents = mergeExtAgentPresets(null);
  ProviderSubscription? _clientSub;
  void Function()? _bridgeUnsub;
  void Function()? _configUnsub;

  @override
  void initState() {
    super.initState();
    _clientSub = ref.listenManual(
      nodeServiceProvider,
      (prev, next) {
        _bridgeUnsub?.call();
        _configUnsub?.call();
        _bridgeUnsub = null;
        _configUnsub = null;
        if (next != null) {
          _bridgeUnsub = next.on('bridge:status', (_) => _reload());
          _configUnsub = next.on('home:config-updated', (_) => _reload());
        }
      },
      fireImmediately: true,
    );
    _reload();
  }

  Future<void> _reload() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null || !mounted) return;
    try {
      final bridge = await client.getBridgeStatus();
      if (!mounted) return;
      final agents = mergeExtAgentPresets(bridge['extAgents'] as List?);
      final active =
          (bridge['activeExtAgentId'] as String?)?.trim().isNotEmpty == true
              ? bridge['activeExtAgentId'] as String
              : 'pi';
      setState(() {
        _bridgeEnabled = bridge['enabled'] == true;
        _agents = agents;
        _activeId = active;
        if (_pendingId != null && _pendingId == active) {
          _pendingId = null;
        }
      });
    } catch (_) {
      // keep last-known
    }
  }

  String get _displayId => _pendingId ?? _activeId;

  Map<String, dynamic>? get _current {
    for (final a in _agents) {
      if (a['id'] == _displayId) return a;
    }
    return _agents.isNotEmpty ? _agents.first : null;
  }

  Future<void> _openPicker() async {
    if (_busy || _agents.length < 2) return;
    final selected = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (ctx) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
                child: Text(
                  'Switch Ext Agent',
                  style: Theme.of(ctx).textTheme.titleMedium,
                ),
              ),
              for (final agent in _agents)
                ListTile(
                  leading: Icon(
                    agent['id'] == _displayId
                        ? Icons.radio_button_checked
                        : Icons.radio_button_off,
                  ),
                  title: Text(agent['name']?.toString() ?? agent['id'].toString()),
                  subtitle: Text(
                    getExtAgentInstallInfo(agent['id'].toString()).startHint,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  onTap: () => Navigator.of(ctx).pop(agent['id'] as String),
                ),
              const SizedBox(height: 8),
            ],
          ),
        );
      },
    );
    if (selected == null || selected == _displayId) return;
    await _select(selected);
  }

  Future<void> _select(String nextId) async {
    final client = ref.read(nodeServiceProvider);
    if (client == null || _busy) return;
    setState(() {
      _busy = true;
      _pendingId = nextId;
    });
    try {
      await client.setActiveExtAgentId(nextId);
      try {
        final bridge = await client.getBridgeStatus();
        if (bridge['activeExtAgentId'] == nextId && mounted) {
          setState(() => _pendingId = null);
        }
      } catch (_) {}
      try {
        final reach = await client.probeExtAgent(agentId: nextId);
        if (!mounted) return;
        if (reach['builtIn'] != true && reach['reachable'] != true) {
          final name =
              (reach['agentName'] as String?)?.trim().isNotEmpty == true
                  ? reach['agentName'] as String
                  : nextId;
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('$name is not running — start it before chatting.'),
            ),
          );
        }
      } catch (_) {}
      await _reload();
    } catch (e) {
      if (mounted) {
        setState(() => _pendingId = null);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Switch failed: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void dispose() {
    _bridgeUnsub?.call();
    _configUnsub?.call();
    _clientSub?.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_bridgeEnabled || _agents.length < 2) {
      return const SizedBox.shrink();
    }
    final name = _current?['name']?.toString() ?? _displayId;
    if (widget.iconOnly) {
      return IconButton(
        tooltip: 'Switch Ext Agent ($name)',
        onPressed: _busy ? null : _openPicker,
        icon: _busy
            ? const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : const Icon(Icons.swap_horiz),
      );
    }
    return TextButton.icon(
      onPressed: _busy ? null : _openPicker,
      icon: _busy
          ? const SizedBox(
              width: 16,
              height: 16,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : const Icon(Icons.swap_horiz, size: 18),
      label: Text(name),
    );
  }
}
