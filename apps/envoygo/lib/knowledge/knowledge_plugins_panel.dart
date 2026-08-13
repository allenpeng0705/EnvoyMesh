// Knowledge → Plugins panel with extensible registry (Social parity).
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/app_localizations.dart';
import '../providers/contact_provider.dart' show nodeServiceProvider;
import '../widgets/home_folder_browser.dart';
import 'knowledge_plugin.dart';
import 'knowledge_plugin_card_shell.dart';

class KnowledgePluginsPanel extends ConsumerStatefulWidget {
  const KnowledgePluginsPanel({super.key});

  @override
  ConsumerState<KnowledgePluginsPanel> createState() =>
      _KnowledgePluginsPanelState();
}

class _KnowledgePluginsPanelState extends ConsumerState<KnowledgePluginsPanel> {
  List<KnowledgePluginInfo> _plugins = const [];
  Map<String, dynamic> _kb = {};
  bool _loading = true;
  String? _busyId;
  final _mcpUrl = TextEditingController();
  final _mcpTool = TextEditingController();
  List<String> _linkedPaths = const [];
  bool _mcpEnabled = true;
  bool _autoLinkTried = false;

  @override
  void initState() {
    super.initState();
    // Always overwrite registry with this State's builders (never keep a
    // previous mount's disposed tear-offs).
    _registerBuilders();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadAll());
  }

  @override
  void dispose() {
    _mcpUrl.dispose();
    _mcpTool.dispose();
    // Drop tear-offs so a later remount cannot call this disposed State.
    knowledgePluginRegistry.unregister('obsidian');
    if (identical(knowledgePluginRegistry.genericBuilder, _buildGenericCard)) {
      knowledgePluginRegistry.genericBuilder = null;
    }
    super.dispose();
  }

  void _registerBuilders() {
    knowledgePluginRegistry.register('obsidian', _buildObsidianCard);
    knowledgePluginRegistry.genericBuilder = _buildGenericCard;
  }

  List<String> _pathsFromKb(Map<String, dynamic> kb) {
    final linked = kb['linkedObsidianVaultPaths'];
    if (linked is List) {
      return linked
          .map((e) => e.toString().trim())
          .where((s) => s.isNotEmpty)
          .toList();
    }
    if (linked is String && linked.trim().isNotEmpty) {
      return linked
          .split(',')
          .map((s) => s.trim())
          .where((s) => s.isNotEmpty)
          .toList();
    }
    return const [];
  }

  List<String> _dismissedFromKb(Map<String, dynamic> kb) {
    final dismissed = kb['dismissedObsidianVaultPaths'];
    if (dismissed is! List) return const [];
    return dismissed
        .map((e) => e.toString().trim())
        .where((s) => s.isNotEmpty)
        .toList();
  }

  Future<void> _commitLinkedPaths(List<String> paths) async {
    final prev = _linkedPaths.toSet();
    final unique = <String>[];
    for (final raw in paths) {
      final p = raw.trim();
      if (p.isEmpty || unique.contains(p)) continue;
      unique.add(p);
    }
    final nextSet = unique.toSet();
    final removed = prev.where((p) => !nextSet.contains(p)).toList();
    final added = unique.where((p) => !prev.contains(p)).toList();
    var dismissed = [..._dismissedFromKb(_kb)];
    for (final r in removed) {
      if (!dismissed.contains(r)) dismissed.add(r);
    }
    dismissed = dismissed.where((d) => !added.contains(d)).toList();
    setState(() => _linkedPaths = unique);
    await _actions().patchKnowledgeBase({
      'linkedObsidianVaultPaths': unique.isEmpty ? null : unique,
      'dismissedObsidianVaultPaths': dismissed.isEmpty ? null : dismissed,
    });
  }

  Future<void> _autoLinkVaults() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null || _autoLinkTried) return;
    try {
      final discovered = await client.discoverObsidianVaults();
      if (!mounted) return;
      final dismissed = _dismissedFromKb(_kb).toSet();
      final toAdd = discovered
          .where((p) => p.isNotEmpty && !_linkedPaths.contains(p) && !dismissed.contains(p))
          .toList();
      if (toAdd.isNotEmpty) {
        await _commitLinkedPaths([..._linkedPaths, ...toAdd]);
        if (!mounted) return;
        final l10n = AppLocalizations.of(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              toAdd.length == 1
                  ? l10n.knowledgePluginsLinkedVaultAutoOne
                  : l10n.knowledgePluginsLinkedVaultAutoMany(toAdd.length),
            ),
          ),
        );
      }
      _autoLinkTried = true;
    } catch (_) {
      // Leave _autoLinkTried false so a later reload can retry.
    }
  }

  Future<void> _openDesktopApp(String app) async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    final l10n = AppLocalizations.of(context);
    setState(() => _busyId = 'open:$app');
    try {
      final result = await client.openDesktopApp(app: app);
      if (!mounted) return;
      if (result['ok'] != true) {
        final err = result['error']?.toString().trim();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              (err != null && err.isNotEmpty)
                  ? err
                  : l10n.knowledgePluginsOpenAppFailed,
            ),
          ),
        );
        return;
      }
      if (result['openedWebsite'] == true) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.knowledgePluginsOpenedWebsite)),
        );
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('$e')),
      );
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  Future<void> _addLinkedVault() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    final l10n = AppLocalizations.of(context);
    final picked = await HomeFolderBrowser.open(
      context,
      client: client,
      initialPath: _linkedPaths.isNotEmpty ? _linkedPaths.last : null,
      title: l10n.knowledgePluginsLinkedVaultPickTitle,
    );
    if (picked == null || !mounted) return;
    await _commitLinkedPaths([..._linkedPaths, picked]);
  }

  Future<void> _removeLinkedVault(String path) async {
    await _commitLinkedPaths(
      _linkedPaths.where((p) => p != path).toList(),
    );
  }

  Future<void> _loadAll() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) {
      setState(() {
        _loading = false;
        _plugins = const [];
      });
      return;
    }
    setState(() => _loading = true);
    try {
      final list = await client.listKbPlugins();
      final cfg = await client.getNodeConfig();
      final ai = cfg['aiSettings'];
      final kbRaw = ai is Map ? ai['knowledgeBase'] : null;
      final kb = kbRaw is Map
          ? Map<String, dynamic>.from(
              kbRaw.map((k, v) => MapEntry('$k', v)),
            )
          : <String, dynamic>{};
      if (!mounted) return;
      final provider = kb['externalProvider'] as String?;
      setState(() {
        _plugins = list.map(KnowledgePluginInfo.fromJson).toList();
        _kb = kb;
        _mcpEnabled = provider == null || provider == 'mcp';
        _mcpUrl.text = (kb['mcpServerUrl'] as String?) ?? '';
        _mcpTool.text = (kb['mcpSearchTool'] as String?) ?? '';
        _linkedPaths = _pathsFromKb(kb);
        _loading = false;
      });
      await _autoLinkVaults();
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _plugins = const [];
      });
    }
  }

  KnowledgePluginActions _actions() {
    final client = ref.read(nodeServiceProvider)!;
    return KnowledgePluginActions(
      client: client,
      reloadPlugins: _loadAll,
      patchKnowledgeBase: (patch) async {
        final cfg = await client.getNodeConfig();
        final ai = Map<String, dynamic>.from(
          (cfg['aiSettings'] as Map?)?.map((k, v) => MapEntry('$k', v)) ?? {},
        );
        final kb = Map<String, dynamic>.from(
          (ai['knowledgeBase'] as Map?)?.map((k, v) => MapEntry('$k', v)) ?? {},
        );
        kb.addAll(patch);
        ai['knowledgeBase'] = kb;
        await client.updateNodeConfig({'aiSettings': ai});
        if (!mounted) return;
        setState(() {
          _kb = kb;
          _linkedPaths = _pathsFromKb(kb);
        });
      },
      notify: (message, {bool error = false}) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(message)),
        );
      },
    );
  }

  Widget _buildObsidianCard({
    required BuildContext context,
    required KnowledgePluginInfo? info,
    required KnowledgePluginActions actions,
    required Map<String, dynamic> knowledgeBase,
    required bool busy,
  }) {
    final l10n = AppLocalizations.of(context);
    final active = info?.isActive == true;
    return KnowledgePluginCardShell(
      title: l10n.knowledgePluginsObsidianTitle,
      tagline: l10n.knowledgePluginsObsidianDesc,
      statusLabel: info?.status,
      initiallyExpanded: true,
      trailing: busy
          ? const SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : Switch(
              value: active,
              onChanged: info == null
                  ? null
                  : (v) async {
                      setState(() => _busyId = 'obsidian');
                      try {
                        if (v) {
                          await actions.activate('obsidian');
                        } else {
                          await actions.deactivate('obsidian');
                        }
                      } finally {
                        if (mounted) setState(() => _busyId = null);
                      }
                    },
            ),
      children: [
        if (active)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              onPressed: busy
                  ? null
                  : () async {
                      setState(() => _busyId = 'obsidian');
                      try {
                        await actions.sync('obsidian');
                      } finally {
                        if (mounted) setState(() => _busyId = null);
                      }
                    },
              child: Text(l10n.knowledgePluginsSyncNow),
            ),
          ),
        Align(
          alignment: Alignment.centerLeft,
          child: OutlinedButton.icon(
            onPressed: _busyId == 'open:obsidian'
                ? null
                : () => _openDesktopApp('obsidian'),
            icon: const Icon(Icons.open_in_new),
            label: Text(
              _busyId == 'open:obsidian'
                  ? l10n.knowledgePluginsOpeningApp
                  : l10n.knowledgePluginsOpenObsidian,
            ),
          ),
        ),
        Text(
          l10n.knowledgePluginsLinkedVaultLabel,
          style: Theme.of(context).textTheme.titleSmall,
        ),
        const SizedBox(height: 4),
        Text(
          l10n.knowledgePluginsLinkedVaultHelper,
          style: Theme.of(context).textTheme.bodySmall,
        ),
        const SizedBox(height: 8),
        if (_linkedPaths.isEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(
              l10n.knowledgePluginsLinkedVaultEmpty,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Theme.of(context).colorScheme.outline,
                  ),
            ),
          ),
        for (final path in _linkedPaths)
          Card(
            margin: const EdgeInsets.only(bottom: 6),
            child: ListTile(
              dense: true,
              leading: const Icon(Icons.folder_special_outlined),
              title: Text(
                path.split(RegExp(r'[/\\]')).where((s) => s.isNotEmpty).last,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              subtitle: Text(
                path,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontFamily: 'monospace', fontSize: 11),
              ),
              trailing: IconButton(
                tooltip: l10n.knowledgePluginsLinkedVaultRemove,
                icon: const Icon(Icons.close),
                onPressed: busy ? null : () => _removeLinkedVault(path),
              ),
            ),
          ),
        Align(
          alignment: Alignment.centerLeft,
          child: OutlinedButton.icon(
            onPressed: busy ? null : _addLinkedVault,
            icon: const Icon(Icons.create_new_folder_outlined),
            label: Text(l10n.knowledgePluginsLinkedVaultAdd),
          ),
        ),
      ],
    );
  }

  Widget _buildGenericCard({
    required BuildContext context,
    required KnowledgePluginInfo? info,
    required KnowledgePluginActions actions,
    required Map<String, dynamic> knowledgeBase,
    required bool busy,
  }) {
    if (info == null) return const SizedBox.shrink();
    final title = info.title?.trim().isNotEmpty == true
        ? info.title!
        : info.pluginId;
    return KnowledgePluginCardShell(
      title: title,
      tagline: info.status,
      trailing: Switch(
        value: info.isActive,
        onChanged: (v) async {
          setState(() => _busyId = info.pluginId);
          try {
            if (v) {
              await actions.activate(info.pluginId);
            } else {
              await actions.deactivate(info.pluginId);
            }
          } finally {
            if (mounted) setState(() => _busyId = null);
          }
        },
      ),
    );
  }

  Future<void> _saveMcp(bool enabled) async {
    final actions = _actions();
    setState(() {
      _busyId = 'mcp';
      _mcpEnabled = enabled;
    });
    try {
      await actions.patchKnowledgeBase({
        'externalProvider': enabled ? 'mcp' : 'none',
        if (_mcpUrl.text.trim().isNotEmpty) 'mcpServerUrl': _mcpUrl.text.trim(),
        if (_mcpTool.text.trim().isNotEmpty)
          'mcpSearchTool': _mcpTool.text.trim(),
      });
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    final client = ref.watch(nodeServiceProvider);
    if (client == null) {
      return Center(child: Text(l10n.filesConnectHint));
    }
    // Re-bind builders each build so remounts after hot-reload stay fresh.
    _registerBuilders();
    final actions = _actions();
    final knownIds = knowledgePluginRegistry.registeredIds.toSet();

    KnowledgePluginInfo? obsidian;
    for (final p in _plugins) {
      if (p.pluginId == 'obsidian') {
        obsidian = p;
        break;
      }
    }
    final others = _plugins
        .where((p) => p.pluginId != 'obsidian' && !knownIds.contains(p.pluginId))
        .toList();

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(l10n.knowledgePluginsLede,
            style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(height: 12),
        knowledgePluginRegistry.builderFor('obsidian')!(
          context: context,
          info: obsidian,
          actions: actions,
          knowledgeBase: _kb,
          busy: _busyId == 'obsidian',
        ),
        const SizedBox(height: 8),
        KnowledgePluginCardShell(
          title: l10n.knowledgePluginsNotionTitle,
          tagline: l10n.knowledgePluginsNotionDesc,
          initiallyExpanded: true,
          trailing: _busyId == 'mcp'
              ? const SizedBox(
                  width: 24,
                  height: 24,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : Switch(
                  value: _mcpEnabled,
                  onChanged: _saveMcp,
                ),
          children: [
            Align(
              alignment: Alignment.centerLeft,
              child: OutlinedButton.icon(
                onPressed: _busyId == 'open:notion'
                    ? null
                    : () => _openDesktopApp('notion'),
                icon: const Icon(Icons.open_in_new),
                label: Text(
                  _busyId == 'open:notion'
                      ? l10n.knowledgePluginsOpeningApp
                      : l10n.knowledgePluginsOpenNotion,
                ),
              ),
            ),
            TextField(
              controller: _mcpUrl,
              decoration: InputDecoration(
                labelText: l10n.knowledgePluginsMcpUrl,
              ),
              onEditingComplete: () => _saveMcp(_mcpEnabled),
            ),
            TextField(
              controller: _mcpTool,
              decoration: InputDecoration(
                labelText: l10n.knowledgePluginsMcpTool,
              ),
              onEditingComplete: () => _saveMcp(_mcpEnabled),
            ),
          ],
        ),
        for (final p in others) ...[
          const SizedBox(height: 8),
          knowledgePluginRegistry.genericBuilder!(
            context: context,
            info: p,
            actions: actions,
            knowledgeBase: _kb,
            busy: _busyId == p.pluginId,
          ),
        ],
      ],
    );
  }
}
