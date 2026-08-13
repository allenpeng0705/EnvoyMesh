import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../ext_agent/ext_agent_presets.dart';
import '../l10n/app_localizations.dart';
import '../providers/chat_provider.dart';
import '../providers/contact_provider.dart' show nodeServiceProvider;
import '../providers/node_provider.dart';
import '../services/node_service_client.dart';

/// Icon-button switcher for the active Ext Agent (Pi / HomeClaw / …).
///
/// Switches via `activeExtAgentId` only. Soft-probes after switch.
/// **Owner-only:** family profiles never see or invoke this control
/// (home node `updateNodeConfig` is owner-gated; one active agent for all).
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
            if (mounted) _reload();
          });
          _configUnsub = next.on('home:config-updated', (_) {
            if (mounted) _reload();
          });
          // Reconnect: pull fresh state immediately. The next `bridge:status`
          // event from home may never come (nothing changed in home's view),
          // so we must NOT rely on it. Adding a new Ext Agent on home
          // becomes visible here the next time the user (re)connects.
          if (mounted) _reload();
        }
      },
      fireImmediately: true,
    );
    _reload();
  }

  Future<void> _reload() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null || !mounted) return;
    // Family members cannot switch — skip bridge reload work.
    if (!ref.read(nodeProvider).isOwnerProfile) return;
    try {
      final bridge = await client.getBridgeStatus();
      if (!mounted) return;
      final agents = mergeExtAgentPresets(bridge['extAgents'] as List?);
      final raw = (bridge['activeExtAgentId'] as String?)?.trim() ?? '';
      final active = raw.isNotEmpty ? raw : 'pi';
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
    if (!ref.read(nodeProvider).isOwnerProfile) return;
    if (_busy || _agents.length < 2) return;
    final l10n = AppLocalizations.of(context);
    final selected = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      // `isScrollControlled: true` lets the bottom sheet grow past
      // the default ~50% screen height so the inner ListView can
      // use the full available space (and scroll inside it). Without
      // this, the default 9/16-height sheet truncates long agent
      // lists — see "EnvoyGo Ext Agent switcher cannot scroll"
      // bug report (Phase 56+ follow-up).
      isScrollControlled: true,
      builder: (ctx) {
        return SafeArea(
          // Outer Column pins the title + drag handle. The inner
          // Flexible + ListView scrolls when the agent list exceeds
          // the sheet height. Constraints(maxHeight: …) keeps the
          // sheet from covering the entire screen — leaves a hint
          // of the underlying chat so the user knows the sheet is
          // modal and dismissible.
          child: ConstrainedBox(
            constraints: BoxConstraints(
              maxHeight: MediaQuery.of(ctx).size.height * 0.75,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
                  child: Text(
                    l10n.extSwitchTitle,
                    style: Theme.of(ctx).textTheme.titleMedium,
                  ),
                ),
                Flexible(
                  child: ListView.builder(
                    shrinkWrap: true,
                    itemCount: _agents.length,
                    itemBuilder: (_, i) {
                      final agent = _agents[i];
                      return ListTile(
                        leading: Icon(
                          agent['id'] == _displayId
                              ? Icons.radio_button_checked
                              : Icons.radio_button_off,
                        ),
                        title: Text(
                          agent['name']?.toString() ?? agent['id'].toString(),
                        ),
                        subtitle: Text(
                          getExtAgentInstallInfo(
                            agent['id'].toString(),
                          ).startHint,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        onTap: () =>
                            Navigator.of(ctx).pop(agent['id'] as String),
                      );
                    },
                  ),
                ),
                const SizedBox(height: 8),
              ],
            ),
          ),
        );
      },
    );
    if (selected == null || selected == _displayId) return;
    await _select(selected);
  }

  Future<void> _select(String nextId) async {
    if (!ref.read(nodeProvider).isOwnerProfile) return;
    final client = ref.read(nodeServiceProvider);
    if (client == null || _busy) return;
    final trimmed = nextId.trim();
    if (trimmed.isEmpty || trimmed == _displayId) return;
    setState(() {
      _busy = true;
      _pendingId = trimmed;
    });
    try {
      await client.setActiveExtAgentId(trimmed);
      try {
        final bridge = await client.getBridgeStatus();
        ref.read(chatProvider.notifier).onBridgeStatus(bridge);
        if (bridge['activeExtAgentId'] == trimmed && mounted) {
          setState(() => _pendingId = null);
        }
      } catch (_) {}
      try {
        final reach = await client.probeExtAgent(agentId: trimmed);
        if (!mounted) return;
        if (reach['builtIn'] != true && reach['reachable'] != true) {
          final name =
              (reach['agentName'] as String?)?.trim().isNotEmpty == true
                  ? reach['agentName'] as String
                  : trimmed;
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                AppLocalizations.of(context).extNotRunningChat(name),
              ),
            ),
          );
        }
      } catch (_) {}
      await _reload();
    } catch (e) {
      if (mounted) {
        setState(() => _pendingId = null);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(AppLocalizations.of(context).extSwitchFailed('$e')),
          ),
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
    // Defense in depth: never show switcher to family profiles.
    if (!ref.watch(nodeProvider).isOwnerProfile) {
      return const SizedBox.shrink();
    }
    if (!_bridgeEnabled || _agents.length < 2) {
      return const SizedBox.shrink();
    }
    final l10n = AppLocalizations.of(context);
    final name = _current?['name']?.toString() ?? _displayId;
    if (widget.iconOnly) {
      return IconButton(
        tooltip: l10n.extSwitchTooltip(name),
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
