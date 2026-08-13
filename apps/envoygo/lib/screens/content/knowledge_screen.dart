import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/app_localizations.dart';
import '../../providers/contact_provider.dart' show nodeServiceProvider;
import '../../providers/node_provider.dart';
import '../../screens/chat/chat_detail_screen.dart';
import 'content_files_tab.dart';

/// Knowledge hub — Content → Knowledge (Browse+Ask | Plugins | Setup).
/// Mirrors Social [KnowledgeView].
class KnowledgeScreen extends ConsumerStatefulWidget {
  const KnowledgeScreen({super.key});

  @override
  ConsumerState<KnowledgeScreen> createState() => _KnowledgeScreenState();
}

class _KnowledgeScreenState extends ConsumerState<KnowledgeScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;
  bool _obsidianAutoTried = false;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 3, vsync: this);
    WidgetsBinding.instance.addPostFrameCallback((_) => _autoActivateObsidian());
  }

  Future<void> _autoActivateObsidian() async {
    if (_obsidianAutoTried) return;
    _obsidianAutoTried = true;
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    try {
      final plugins = await client.listKbPlugins();
      Map<String, dynamic>? obsidian;
      for (final p in plugins) {
        if (p['pluginId'] == 'obsidian') {
          obsidian = p;
          break;
        }
      }
      if (obsidian == null || obsidian['status'] == 'active') return;
      await client.activateKbPlugin(pluginId: 'obsidian');
    } catch (_) {
      // Manual activate remains on Plugins tab.
    }
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                l10n.knowledgeTitle,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 4),
              Text(
                l10n.knowledgeLede,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
        ),
        TabBar(
          controller: _tabs,
          isScrollable: true,
          indicatorSize: TabBarIndicatorSize.label,
          tabs: [
            Tab(text: l10n.knowledgePanelBrowse),
            Tab(text: l10n.knowledgePanelPlugins),
            Tab(text: l10n.knowledgePanelSetup),
          ],
        ),
        const Divider(height: 1),
        Expanded(
          child: TabBarView(
            controller: _tabs,
            children: const [
              _KnowledgeBrowsePanel(),
              _KnowledgePluginsPanel(),
              _KnowledgeSetupPanel(),
            ],
          ),
        ),
      ],
    );
  }
}

/// Browse files + Ask vault (combined; mirrors Social Knowledge Browse panel).
class _KnowledgeBrowsePanel extends StatelessWidget {
  const _KnowledgeBrowsePanel();

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                l10n.knowledgeAskHeading,
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                l10n.knowledgeAskHint,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
        const _KnowledgeAskPanel(compact: true),
        const Divider(height: 24),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                l10n.knowledgeLibraryHeading,
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                l10n.knowledgeLibraryCaption,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
        const Expanded(child: ContentFilesTab(knowledgeBrowse: true)),
      ],
    );
  }
}

class _KnowledgeAskPanel extends ConsumerStatefulWidget {
  const _KnowledgeAskPanel({this.compact = false});

  final bool compact;

  @override
  ConsumerState<_KnowledgeAskPanel> createState() => _KnowledgeAskPanelState();
}

class _KnowledgeAskPanelState extends ConsumerState<_KnowledgeAskPanel> {
  final _controller = TextEditingController();
  String? _answer;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _controller.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _ask() async {
    final q = _controller.text.trim();
    if (q.isEmpty) return;
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    setState(() {
      _busy = true;
      _answer = null;
    });
    try {
      final text = await client.knowledgeQuery(q);
      if (!mounted) return;
      setState(() {
        _answer = text.trim().isNotEmpty
            ? text
            : AppLocalizations.of(context).knowledgeAskEmptyAnswer;
      });
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('$e')),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _openEnvoyAi() {
    final nodeId = ref.read(nodeProvider).activeNode?.id;
    if (nodeId == null || nodeId.isEmpty) return;
    final draft = _controller.text.trim();
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ChatDetailScreen(
          threadId: '$nodeId:envoyai',
          displayName: 'EnvoyAI',
          agentType: 'envoyai',
          initialComposerText: draft.isEmpty ? null : draft,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final askFields = <Widget>[
      TextField(
        controller: _controller,
        maxLines: widget.compact ? 1 : 3,
        textInputAction: TextInputAction.search,
        onSubmitted: (_) => _ask(),
        decoration: InputDecoration(
          labelText: l10n.knowledgeAskLabel,
          hintText: l10n.knowledgeAskPlaceholder,
          border: const OutlineInputBorder(),
          isDense: widget.compact,
        ),
        enabled: !_busy,
      ),
      const SizedBox(height: 8),
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          FilledButton(
            onPressed: _busy || _controller.text.trim().isEmpty ? null : _ask,
            child: Text(_busy ? l10n.knowledgeAskBusy : l10n.knowledgeAskSubmit),
          ),
          OutlinedButton(
            onPressed: _openEnvoyAi,
            child: Text(l10n.knowledgeAskContinueEnvoyAi),
          ),
        ],
      ),
      const SizedBox(height: 6),
      Text(l10n.knowledgeAskHint, style: Theme.of(context).textTheme.bodySmall),
      if (_answer != null) ...[
        const SizedBox(height: 12),
        Text(l10n.knowledgeAskAnswerHeading,
            style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: 6),
        SelectableText(_answer!),
      ],
    ];

    if (widget.compact) {
      return Material(
        color: Theme.of(context).colorScheme.surfaceContainerHighest.withValues(alpha: 0.35),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: _controller,
                maxLines: 1,
                textInputAction: TextInputAction.search,
                onSubmitted: (_) => _ask(),
                decoration: InputDecoration(
                  hintText: l10n.knowledgeAskPlaceholder,
                  border: const OutlineInputBorder(),
                  isDense: true,
                  filled: true,
                ),
                enabled: !_busy,
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  FilledButton(
                    onPressed:
                        _busy || _controller.text.trim().isEmpty ? null : _ask,
                    child: Text(
                      _busy ? l10n.knowledgeAskBusy : l10n.knowledgeAskSubmit,
                    ),
                  ),
                  const SizedBox(width: 12),
                  TextButton(
                    onPressed: _openEnvoyAi,
                    child: Text(l10n.knowledgeAskContinueEnvoyAi),
                  ),
                ],
              ),
              if (_answer != null) ...[
                const SizedBox(height: 12),
                Text(
                  l10n.knowledgeAskAnswerHeading,
                  style: Theme.of(context).textTheme.titleSmall,
                ),
                const SizedBox(height: 6),
                SelectableText(_answer!),
              ],
            ],
          ),
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: askFields,
    );
  }
}

class _KnowledgePluginsPanel extends ConsumerStatefulWidget {
  const _KnowledgePluginsPanel();

  @override
  ConsumerState<_KnowledgePluginsPanel> createState() =>
      _KnowledgePluginsPanelState();
}

class _KnowledgePluginsPanelState extends ConsumerState<_KnowledgePluginsPanel> {
  List<Map<String, dynamic>> _plugins = const [];
  bool _loading = true;
  String? _busyId;
  bool _mcpEnabled = false;
  final _mcpUrl = TextEditingController();
  final _mcpTool = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _load();
      _loadMcp();
    });
  }

  @override
  void dispose() {
    _mcpUrl.dispose();
    _mcpTool.dispose();
    super.dispose();
  }

  Future<void> _load() async {
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
      if (!mounted) return;
      setState(() {
        _plugins = list;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _plugins = const [];
      });
    }
  }

  Future<void> _loadMcp() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    try {
      final cfg = await client.getNodeConfig();
      final ai = cfg['aiSettings'];
      final kb = ai is Map ? ai['knowledgeBase'] : null;
      if (kb is! Map || !mounted) return;
      setState(() {
        final provider = kb['externalProvider'] as String?;
        // Match Social / DEFAULT_AI_KNOWLEDGE_BASE: mcp when unset.
        _mcpEnabled = provider == null || provider == 'mcp';
        _mcpUrl.text = (kb['mcpServerUrl'] as String?) ?? '';
        _mcpTool.text = (kb['mcpSearchTool'] as String?) ?? '';
      });
    } catch (_) {}
  }

  Future<void> _setObsidianActive(bool active) async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    setState(() => _busyId = 'obsidian');
    try {
      if (active) {
        await client.activateKbPlugin(pluginId: 'obsidian');
      } else {
        await client.deactivateKbPlugin(pluginId: 'obsidian');
      }
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  Future<void> _saveMcp(bool enabled) async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    setState(() => _busyId = 'mcp');
    try {
      final cfg = await client.getNodeConfig();
      final ai = Map<String, dynamic>.from(
        (cfg['aiSettings'] as Map?)?.map((k, v) => MapEntry('$k', v)) ?? {},
      );
      final kb = Map<String, dynamic>.from(
        (ai['knowledgeBase'] as Map?)?.map((k, v) => MapEntry('$k', v)) ?? {},
      );
      kb['externalProvider'] = enabled ? 'mcp' : 'none';
      if (_mcpUrl.text.trim().isNotEmpty) {
        kb['mcpServerUrl'] = _mcpUrl.text.trim();
      }
      if (_mcpTool.text.trim().isNotEmpty) {
        kb['mcpSearchTool'] = _mcpTool.text.trim();
      }
      ai['knowledgeBase'] = kb;
      await client.updateNodeConfig({'aiSettings': ai});
      if (!mounted) return;
      setState(() => _mcpEnabled = enabled);
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
    Map<String, dynamic>? obsidian;
    for (final p in _plugins) {
      if (p['pluginId'] == 'obsidian') {
        obsidian = p;
        break;
      }
    }
    final obsidianActive = obsidian?['status'] == 'active';

    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(l10n.knowledgePluginsLede,
            style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(height: 12),
        Card(
          child: ListTile(
            title: Text(l10n.knowledgePluginsObsidianTitle),
            subtitle: Text(l10n.knowledgePluginsObsidianDesc),
            trailing: _busyId == 'obsidian'
                ? const SizedBox(
                    width: 24,
                    height: 24,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Switch(
                    value: obsidianActive,
                    onChanged: obsidian == null ? null : _setObsidianActive,
                  ),
          ),
        ),
        const SizedBox(height: 8),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(l10n.knowledgePluginsNotionTitle),
                  subtitle: Text(l10n.knowledgePluginsNotionDesc),
                  value: _mcpEnabled,
                  onChanged: _busyId == 'mcp' ? null : _saveMcp,
                ),
                TextField(
                  controller: _mcpUrl,
                  decoration: InputDecoration(
                    labelText: l10n.knowledgePluginsMcpUrl,
                    isDense: true,
                  ),
                  onEditingComplete: () => _saveMcp(_mcpEnabled),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _mcpTool,
                  decoration: InputDecoration(
                    labelText: l10n.knowledgePluginsMcpTool,
                    isDense: true,
                  ),
                  onEditingComplete: () => _saveMcp(_mcpEnabled),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _KnowledgeSetupPanel extends ConsumerStatefulWidget {
  const _KnowledgeSetupPanel();

  @override
  ConsumerState<_KnowledgeSetupPanel> createState() =>
      _KnowledgeSetupPanelState();
}

class _KnowledgeSetupPanelState extends ConsumerState<_KnowledgeSetupPanel> {
  Map<String, dynamic>? _status;
  bool _enabled = true;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _refreshStatus();
      _loadEnabled();
    });
  }

  Future<void> _refreshStatus() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    try {
      final st = await client.getRagIndexStatus();
      if (!mounted) return;
      setState(() => _status = st);
    } catch (_) {}
  }

  Future<void> _loadEnabled() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    try {
      final cfg = await client.getNodeConfig();
      final ai = cfg['aiSettings'];
      final kb = ai is Map ? ai['knowledgeBase'] : null;
      if (kb is Map && mounted) {
        setState(() => _enabled = kb['enabled'] != false);
      }
    } catch (_) {}
  }

  Future<void> _setEnabled(bool value) async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    setState(() => _busy = true);
    try {
      final cfg = await client.getNodeConfig();
      final ai = Map<String, dynamic>.from(
        (cfg['aiSettings'] as Map?)?.map((k, v) => MapEntry('$k', v)) ?? {},
      );
      final kb = Map<String, dynamic>.from(
        (ai['knowledgeBase'] as Map?)?.map((k, v) => MapEntry('$k', v)) ?? {},
      );
      kb['enabled'] = value;
      ai['knowledgeBase'] = kb;
      await client.updateNodeConfig({'aiSettings': ai});
      if (!mounted) return;
      setState(() => _enabled = value);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _reindex() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    setState(() => _busy = true);
    try {
      final st = await client.reindexRagKnowledge(force: true);
      if (!mounted) return;
      setState(() => _status = st);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(AppLocalizations.of(context).knowledgeSetupReindexDone),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final tracked = (_status?['trackedDocuments'] as num?)?.toInt() ?? 0;
    final indexing = _status?['isIndexing'] == true;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(l10n.knowledgeSetupHint, style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(height: 12),
        SwitchListTile(
          title: Text(l10n.knowledgeSetupEnabled),
          value: _enabled,
          onChanged: _busy ? null : _setEnabled,
        ),
        ListTile(
          title: Text(l10n.knowledgeBrowseIndexReady(tracked)),
          subtitle: indexing
              ? Text(l10n.knowledgeBrowseIndexIndexing)
              : Text(l10n.knowledgeSetupStatusHint),
        ),
        FilledButton(
          onPressed: _busy ? null : _reindex,
          child: Text(l10n.knowledgeSetupReindex),
        ),
      ],
    );
  }
}
