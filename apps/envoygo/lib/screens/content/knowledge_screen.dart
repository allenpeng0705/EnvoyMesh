import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/app_localizations.dart';
import '../../knowledge/knowledge_nav.dart';
import '../../knowledge/knowledge_plugins_panel.dart';
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
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _autoActivateObsidian();
      _consumePanelRequest();
    });
  }

  void _consumePanelRequest() {
    final requested = ref.read(knowledgeHubPanelRequestProvider);
    if (requested == null) return;
    ref.read(knowledgeHubPanelRequestProvider.notifier).state = null;
    final index = switch (requested) {
      KnowledgeHubPanel.browse => 0,
      KnowledgeHubPanel.plugins => 1,
      KnowledgeHubPanel.setup => 2,
    };
    if (_tabs.index != index) _tabs.animateTo(index);
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
    ref.listen<KnowledgeHubPanel?>(knowledgeHubPanelRequestProvider, (_, next) {
      if (next == null || !mounted) return;
      WidgetsBinding.instance.addPostFrameCallback((_) => _consumePanelRequest());
    });
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
              KnowledgePluginsPanel(),
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

class _KnowledgeSetupPanel extends ConsumerStatefulWidget {
  const _KnowledgeSetupPanel();

  @override
  ConsumerState<_KnowledgeSetupPanel> createState() =>
      _KnowledgeSetupPanelState();
}

class _KnowledgeSetupPanelState extends ConsumerState<_KnowledgeSetupPanel> {
  Map<String, dynamic>? _status;
  bool _enabled = true;
  String _ragMode = 'hybrid';
  int _vaultSnippetLimit = 5;
  bool _busy = false;
  void Function()? _unsubRag;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _refreshStatus();
      _loadSettings();
      _subscribeRag();
    });
  }

  @override
  void dispose() {
    _unsubRag?.call();
    super.dispose();
  }

  void _subscribeRag() {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    _unsubRag?.call();
    _unsubRag = client.on('rag:reindex', (data) {
      if (!mounted) return;
      if (data is Map) {
        setState(() {
          _status = {
            ...?_status,
            ...Map<String, dynamic>.from(
              data.map((k, v) => MapEntry('$k', v)),
            ),
          };
        });
      } else {
        _refreshStatus();
      }
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

  Future<void> _loadSettings() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    try {
      final cfg = await client.getNodeConfig();
      final ai = cfg['aiSettings'];
      final kb = ai is Map ? ai['knowledgeBase'] : null;
      if (kb is Map && mounted) {
        setState(() {
          _enabled = kb['enabled'] != false;
          final mode = kb['ragMode']?.toString();
          if (mode == 'vector' || mode == 'hybrid' || mode == 'lexical') {
            _ragMode = mode!;
          }
          final limit = (kb['vaultSnippetLimit'] as num?)?.toInt();
          if (limit != null && limit > 0) _vaultSnippetLimit = limit;
        });
      }
    } catch (_) {}
  }

  Future<void> _patchKb(Map<String, dynamic> patch) async {
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
      kb.addAll(patch);
      ai['knowledgeBase'] = kb;
      await client.updateNodeConfig({'aiSettings': ai});
      if (!mounted) return;
      setState(() {
        if (patch.containsKey('enabled')) _enabled = patch['enabled'] == true;
        if (patch['ragMode'] is String) _ragMode = patch['ragMode'] as String;
        if (patch['vaultSnippetLimit'] is int) {
          _vaultSnippetLimit = patch['vaultSnippetLimit'] as int;
        }
      });
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _setEnabled(bool value) => _patchKb({'enabled': value});

  Future<void> _reindex() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    final l10n = AppLocalizations.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.knowledgeSetupReindex),
        content: Text(l10n.knowledgeSetupReindexConfirm),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(l10n.commonCancel),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(l10n.knowledgeSetupReindex),
          ),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _busy = true);
    try {
      final st = await client.reindexRagKnowledge(force: true);
      if (!mounted) return;
      setState(() => _status = st);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.knowledgeSetupReindexDone)),
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
    final linked = (_status?['linkedObsidianNoteCount'] as num?)?.toInt() ?? 0;
    final indexing = _status?['isIndexing'] == true;
    final processed = (_status?['processedDocuments'] as num?)?.toInt();
    final total = (_status?['totalDocuments'] as num?)?.toInt();
    final lastError = _status?['lastEmbedError']?.toString() ??
        _status?['lastExternalKbError']?.toString();
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
        DropdownButtonFormField<String>(
          value: _ragMode,
          decoration: InputDecoration(labelText: l10n.knowledgeSetupRagMode),
          items: [
            DropdownMenuItem(
              value: 'hybrid',
              child: Text(l10n.knowledgeSetupRagHybrid),
            ),
            DropdownMenuItem(
              value: 'vector',
              child: Text(l10n.knowledgeSetupRagVector),
            ),
            DropdownMenuItem(
              value: 'lexical',
              child: Text(l10n.knowledgeSetupRagLexical),
            ),
          ],
          onChanged: _busy
              ? null
              : (v) {
                  if (v != null) _patchKb({'ragMode': v});
                },
        ),
        const SizedBox(height: 8),
        ListTile(
          contentPadding: EdgeInsets.zero,
          title: Text(l10n.knowledgeSetupSnippetLimit),
          subtitle: Text('$_vaultSnippetLimit'),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              IconButton(
                onPressed: _busy || _vaultSnippetLimit <= 1
                    ? null
                    : () => _patchKb({'vaultSnippetLimit': _vaultSnippetLimit - 1}),
                icon: const Icon(Icons.remove),
              ),
              IconButton(
                onPressed: _busy || _vaultSnippetLimit >= 20
                    ? null
                    : () => _patchKb({'vaultSnippetLimit': _vaultSnippetLimit + 1}),
                icon: const Icon(Icons.add),
              ),
            ],
          ),
        ),
        ListTile(
          contentPadding: EdgeInsets.zero,
          title: Text(
            linked > 0
                ? l10n.knowledgeBrowseIndexReadyLinked(tracked, linked)
                : l10n.knowledgeBrowseIndexReady(tracked),
          ),
          subtitle: Text(
            indexing
                ? (processed != null && total != null && total > 0
                    ? l10n.knowledgeBrowseIndexIndexingProgress(processed, total)
                    : l10n.knowledgeBrowseIndexIndexing)
                : l10n.knowledgeSetupStatusHint,
          ),
        ),
        if (indexing && processed != null && total != null && total > 0)
          LinearProgressIndicator(value: processed / total),
        if (lastError != null && lastError.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              lastError,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ),
        const SizedBox(height: 12),
        FilledButton(
          onPressed: _busy ? null : _reindex,
          child: Text(l10n.knowledgeSetupReindex),
        ),
      ],
    );
  }
}
