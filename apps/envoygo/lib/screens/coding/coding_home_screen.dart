import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../coding/coding_archive.dart';
import '../../coding/coding_projects.dart';
import '../../coding/coding_transcript_store.dart';
import '../../l10n/app_localizations.dart';
import '../../models/chat_thread.dart';
import '../../models/terminal_session.dart';
import '../../providers/chat_provider.dart';
import '../../providers/contact_provider.dart' show nodeServiceProvider;
import '../../providers/node_provider.dart';
import '../../providers/terminal_provider.dart';
import '../../services/coding_ext_sessions.dart';
import '../../widgets/connection_indicator.dart';
import '../../widgets/pair_required_panel.dart';
import '../chat/envoy_harness_chat_screen.dart';
import 'coding_add_project_sheet.dart';
import 'coding_heartbeat_ui.dart';
import 'coding_new_task_sheet.dart';
import 'coding_schedules_ui.dart';
import 'ext_agent_coding_screen.dart';
import 'pi_coding_chat_screen.dart';

/// Coding tab root — resume-first task list (Phase 68-C1b.2 / C1b.3).
///
/// EH stream chats + Pi coding sessions from the home node, plus local
/// Tier B Ext Agent sessions. Create via FAB ([showCodingNewTaskSheet]);
/// register folders via [showCodingAddProjectSheet] (Social parity).
class CodingHomeScreen extends ConsumerStatefulWidget {
  const CodingHomeScreen({super.key});

  @override
  ConsumerState<CodingHomeScreen> createState() => _CodingHomeScreenState();
}

class _CodingHomeScreenState extends ConsumerState<CodingHomeScreen> {
  var _refreshing = false;
  List<CodingExtSession> _extSessions = const [];
  List<CodingProject> _projects = const [];
  Set<String> _archivedKeys = {};
  CodingHistoryFilter _historyFilter = CodingHistoryFilter.all;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(_refresh());
    });
  }

  String _ehArchiveId(ChatThread thread) {
    final parts = thread.id.split(':eh:');
    return parts.length > 1 ? parts[1] : thread.id;
  }

  bool _passesHistoryFilter(String kind, String id) {
    final key = codingArchiveKey(kind, id);
    final archived = _archivedKeys.contains(key);
    if (_historyFilter == CodingHistoryFilter.archived) return archived;
    return !archived;
  }

  Future<void> _toggleArchive(String kind, String id) async {
    final key = codingArchiveKey(kind, id);
    if (_archivedKeys.contains(key)) {
      await unarchiveCodingTask(key);
    } else {
      await archiveCodingTask(key);
    }
    final next = await loadCodingArchivedKeys();
    if (!mounted) return;
    setState(() => _archivedKeys = next);
  }

  Future<void> _setHistoryFilter(CodingHistoryFilter filter) async {
    await saveCodingHistoryFilter(filter);
    if (!mounted) return;
    setState(() => _historyFilter = filter);
  }

  Future<void> _refresh() async {
    if (_refreshing) return;
    setState(() => _refreshing = true);
    try {
      final ext = await loadCodingExtSessions();
      final archived = await loadCodingArchivedKeys();
      final filter = await loadCodingHistoryFilter();
      await Future.wait([
        ref.read(chatProvider.notifier).syncEhChats(),
        ref.read(chatProvider.notifier).syncTerminals(),
      ]);
      final term = ref.read(terminalProvider);
      final cwds = <String>{
        for (final s in _piSessions(term))
          if ((s.cwd ?? '').trim().isNotEmpty) s.cwd!.trim(),
        for (final s in ext)
          if (s.cwd.trim().isNotEmpty) s.cwd.trim(),
      };
      await ensureCodingProjectsFromCwds(cwds);
      final projects = await loadCodingProjects();
      if (mounted) {
        setState(() {
          _extSessions = ext;
          _projects = projects;
          _archivedKeys = archived;
          _historyFilter = filter;
        });
      }
    } catch (_) {
      // Offline / older home node — keep showing local list.
      try {
        final ext = await loadCodingExtSessions();
        final archived = await loadCodingArchivedKeys();
        final filter = await loadCodingHistoryFilter();
        final projects = await loadCodingProjects();
        if (mounted) {
          setState(() {
            _extSessions = ext;
            _projects = projects;
            _archivedKeys = archived;
            _historyFilter = filter;
          });
        }
      } catch (_) {}
    } finally {
      if (mounted) setState(() => _refreshing = false);
    }
  }

  List<ChatThread> _ehThreads(ChatState chat) {
    return chat.threads
        .where((t) => t.type == ChatThreadType.envoyHarness)
        .toList()
      ..sort((a, b) {
        final at = a.lastMessageAt ?? DateTime.fromMillisecondsSinceEpoch(0);
        final bt = b.lastMessageAt ?? DateTime.fromMillisecondsSinceEpoch(0);
        return bt.compareTo(at);
      });
  }

  List<TerminalSession> _piSessions(TerminalState term) {
    return term.sessions.where((s) => s.isPi).toList();
  }

  Future<void> _openAddProject() async {
    final project = await showCodingAddProjectSheet(context, ref);
    if (!mounted) return;
    if (project == null) return;
    final projects = await loadCodingProjects();
    if (!mounted) return;
    setState(() => _projects = projects);
    // Match Social: after Add project, open New task with that folder.
    await _openNewTask(initialCwd: project.path);
  }

  Future<void> _openNewTask({String? initialCwd}) async {
    final ehCount = _ehThreads(ref.read(chatProvider)).length;
    await showCodingNewTaskSheet(
      context,
      ref,
      initialCwd: initialCwd,
      onConfirm: (harness, cwd, {model, providerKind, endpoint}) async {
        if (codingHarnessIsTierB(harness)) {
          final wireId = codingHarnessWireId(harness);
          final session = await createCodingExtSession(
            harness: wireId,
            cwd: cwd,
            title: codingHarnessDisplayName(harness),
            model: model,
            providerKind: providerKind,
            endpoint: endpoint,
          );
          try {
            final client = ref.read(nodeServiceProvider);
            if (client != null &&
                ((model ?? '').trim().isNotEmpty ||
                    (providerKind ?? '').trim().isNotEmpty ||
                    (endpoint ?? '').trim().isNotEmpty)) {
              await client.setCodingHarnessRuntime(
                codingSessionId: session.id,
                cwd: session.cwd,
                runtime: {
                  if ((model ?? '').trim().isNotEmpty) 'model': model!.trim(),
                  if ((providerKind ?? '').trim().isNotEmpty)
                    'providerKind': providerKind!.trim(),
                  if ((endpoint ?? '').trim().isNotEmpty)
                    'endpoint': endpoint!.trim(),
                },
              );
            } else if (client != null) {
              await client.setCodingHarnessRuntime(
                codingSessionId: session.id,
                cwd: session.cwd,
              );
            }
          } catch (_) {
            await removeCodingExtSession(session.id);
            rethrow;
          }
          if (!mounted) return;
          setState(() {
            _extSessions = [
              session,
              ..._extSessions.where((s) => s.id != session.id),
            ];
          });
          await Navigator.of(context).push(
            MaterialPageRoute<void>(
              builder: (_) => ExtAgentCodingScreen(
                sessionId: session.id,
                harness: session.harness,
                cwd: session.cwd,
                title: session.title,
              ),
            ),
          );
          await _refresh();
          return;
        }
        if (harness == CodingHarnessChoice.envoyHarness) {
          if (ehCount >= kMaxEnvoyHarnessChats) {
            throw StateError(
              'At most $kMaxEnvoyHarnessChats coding chats — remove one first.',
            );
          }
          final ehModel = codingModelToEhHostModel(model, providerKind);
          final threadId = await ref.read(chatProvider.notifier).createEhChat(
                projectPath: cwd,
                model: ehModel,
                endpoint: (endpoint ?? '').trim().isEmpty ? null : endpoint,
              );
          if (!mounted) return;
          final thread = ref
              .read(chatProvider)
              .threads
              .where((t) => t.id == threadId)
              .firstOrNull;
          final parts = threadId.split(':eh:');
          final chatId = parts.length > 1 ? parts[1] : null;
          await Navigator.of(context).push(
            MaterialPageRoute<void>(
              builder: (_) => EnvoyHarnessChatScreen(
                threadId: threadId,
                displayName: thread?.displayName ?? 'Envoy',
                chatId: chatId,
              ),
            ),
          );
          return;
        }

        Map<String, dynamic>? piOverride;
        final lockedModel = (model ?? '').trim();
        final lockedEndpoint = (endpoint ?? '').trim();
        final lockedProvider = (providerKind ?? '').trim();
        if (lockedModel.isNotEmpty) {
          final modelName = lockedModel.contains(':')
              ? lockedModel.substring(lockedModel.indexOf(':') + 1).trim()
              : lockedModel;
          final piProvider = lockedProvider == 'anthropic-compatible'
              ? 'anthropic'
              : lockedProvider == 'openai-compatible'
                  ? 'openai'
                  : lockedModel.contains(':')
                      ? lockedModel.substring(0, lockedModel.indexOf(':')).trim()
                      : null;
          piOverride = {
            'model': modelName,
            if (piProvider != null && piProvider.isNotEmpty)
              'provider': piProvider,
            if (lockedProvider == 'openai-compatible')
              'mode': 'openai-compatible',
            if (lockedProvider == 'anthropic-compatible')
              'mode': 'anthropic-compatible',
            if (lockedEndpoint.isNotEmpty) 'endpoint': lockedEndpoint,
          };
        }
        final sessionId = await ref.read(chatProvider.notifier).createPiTerminal(
              projectPath: cwd,
              modelOverride: piOverride,
            );
        if (!mounted) return;
        final session = ref
            .read(terminalProvider)
            .sessions
            .where((s) => s.id == sessionId)
            .firstOrNull;
        await Navigator.of(context).push(
          MaterialPageRoute<void>(
            builder: (_) => PiCodingChatScreen(
              sessionId: sessionId,
              sessionName: session?.name ?? 'Pi',
              cwd: session?.cwd,
            ),
          ),
        );
      },
    );
    await _refresh();
  }

  void _openEh(ChatThread thread) {
    final parts = thread.id.split(':eh:');
    final chatId = parts.length > 1 ? parts[1] : null;
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => EnvoyHarnessChatScreen(
          threadId: thread.id,
          displayName: thread.displayName,
          chatId: chatId,
        ),
      ),
    );
  }

  void _openPi(TerminalSession session) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => PiCodingChatScreen(
          sessionId: session.id,
          sessionName: session.name,
          cwd: session.cwd,
        ),
      ),
    );
  }

  void _openExt(CodingExtSession session) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => ExtAgentCodingScreen(
          sessionId: session.id,
          harness: session.harness,
          cwd: session.cwd,
          title: session.title,
        ),
      ),
    );
  }

  Future<void> _removeEh(ChatThread thread, {bool confirm = true}) async {
    final l10n = AppLocalizations.of(context);
    if (confirm) {
      final ok = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text(l10n.chatsEhRemoveTitle),
          content: Text(l10n.chatsEhRemoveBody(thread.displayName)),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: Text(l10n.commonCancel),
            ),
            FilledButton(
              onPressed: () => Navigator.of(ctx).pop(true),
              child: Text(l10n.codingRemoveFromCoding),
            ),
          ],
        ),
      );
      if (ok != true || !mounted) return;
    }
    try {
      await ref.read(chatProvider.notifier).deleteThread(thread.id);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            e.toString().replaceFirst('Exception: ', ''),
          ),
        ),
      );
    }
  }

  Future<void> _removePi(TerminalSession session, {bool confirm = true}) async {
    final l10n = AppLocalizations.of(context);
    if (confirm) {
      final ok = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text(l10n.chatsEhRemoveTitle),
          content: Text(l10n.chatsEhRemoveBody(session.name)),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: Text(l10n.commonCancel),
            ),
            FilledButton(
              onPressed: () => Navigator.of(ctx).pop(true),
              child: Text(l10n.codingRemoveFromCoding),
            ),
          ],
        ),
      );
      if (ok != true || !mounted) return;
    }
    try {
      await ref.read(terminalProvider.notifier).closeSession(session.id);
      await ref.read(chatProvider.notifier).syncTerminals();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            e.toString().replaceFirst('Exception: ', ''),
          ),
        ),
      );
    }
  }

  Future<void> _removeExt(CodingExtSession session, {bool confirm = true}) async {
    final l10n = AppLocalizations.of(context);
    if (confirm) {
      final ok = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text(l10n.chatsEhRemoveTitle),
          content: Text(l10n.chatsEhRemoveBody(session.title)),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: Text(l10n.commonCancel),
            ),
            FilledButton(
              onPressed: () => Navigator.of(ctx).pop(true),
              child: Text(l10n.codingRemoveFromCoding),
            ),
          ],
        ),
      );
      if (ok != true || !mounted) return;
    }
    final client = ref.read(nodeServiceProvider);
    try {
      await client?.clearCodingHarnessRuntime(codingSessionId: session.id);
    } catch (_) {}
    await clearCodingTranscript(kind: 'ext', id: session.id);
    await removeCodingExtSession(session.id);
    if (!mounted) return;
    setState(() {
      _extSessions = _extSessions.where((s) => s.id != session.id).toList();
    });
  }

  Future<void> _removeProject(CodingProject project) async {
    final l10n = AppLocalizations.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.codingRemoveProjectTitle),
        content: Text(l10n.codingRemoveProjectBody(project.label)),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(l10n.commonCancel),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(l10n.codingRemoveFromCoding),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;

    final path = normalizeCodingProjectPath(project.path);
    final client = ref.read(nodeServiceProvider);
    final nodeId = ref.read(nodeProvider).activeNode?.id;

    try {
      final list = await client?.listEnvoyHarnessChats() ?? const [];
      for (final raw in list) {
        final cwd = normalizeCodingProjectPath(raw['cwd']?.toString() ?? '');
        if (cwd != path) continue;
        final chatId = raw['id']?.toString().trim() ?? '';
        if (chatId.isEmpty || nodeId == null) continue;
        await _removeEh(
          ChatThread(
            id: '$nodeId:eh:$chatId',
            nodeId: nodeId,
            type: ChatThreadType.envoyHarness,
            displayName: raw['title']?.toString() ?? chatId,
          ),
          confirm: false,
        );
      }
    } catch (_) {}

    final term = ref.read(terminalProvider);
    for (final s in _piSessions(term)) {
      if (normalizeCodingProjectPath(s.cwd ?? '') == path) {
        await _removePi(s, confirm: false);
      }
    }
    for (final s in List<CodingExtSession>.from(_extSessions)) {
      if (normalizeCodingProjectPath(s.cwd) == path) {
        await _removeExt(s, confirm: false);
      }
    }

    await removeCodingProject(path);
    if (!mounted) return;
    final projects = await loadCodingProjects();
    if (!mounted) return;
    setState(() => _projects = projects);
    await _refresh();
  }

  String _extBadge(String harness) {
    switch (harness) {
      case 'claudecode':
        return 'CC';
      case 'codex':
        return 'CX';
      case 'opencode':
        return 'OC';
      case 'cursor':
        return 'Cu';
      case 'codewhale':
        return 'CW';
      case 'minimax-code':
        return 'MM';
      default:
        return 'EX';
    }
  }

  PopupMenuButton<String> _archiveMenu({
    required AppLocalizations l10n,
    required String kind,
    required String id,
    required Future<void> Function() onRemove,
  }) {
    final archived = _archivedKeys.contains(codingArchiveKey(kind, id));
    return PopupMenuButton<String>(
      onSelected: (value) {
        if (value == 'archive') {
          unawaited(_toggleArchive(kind, id));
        } else if (value == 'remove') {
          unawaited(onRemove());
        }
      },
      itemBuilder: (_) => [
        PopupMenuItem(
          value: 'archive',
          child: Text(archived ? l10n.codingUnarchive : l10n.codingArchive),
        ),
        PopupMenuItem(
          value: 'remove',
          child: Text(l10n.codingRemoveFromCoding),
        ),
      ],
    );
  }

  Widget _sectionHeader(String title) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
      child: Text(
        title,
        style: Theme.of(context).textTheme.titleSmall?.copyWith(
              color: Theme.of(context).colorScheme.primary,
              fontWeight: FontWeight.w600,
            ),
      ),
    );
  }

  Widget _emptyHome(AppLocalizations l10n) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(24),
      children: [
        const SizedBox(height: 32),
        Icon(
          Icons.code_outlined,
          size: 48,
          color: Theme.of(context).colorScheme.outline,
        ),
        const SizedBox(height: 16),
        Text(
          l10n.codingEmptyTitle,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: 8),
        Text(
          l10n.codingHomeEmptyProjects,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
        ),
        const SizedBox(height: 24),
        Card(
          child: ListTile(
            leading: const Icon(Icons.create_new_folder_outlined),
            title: Text(l10n.codingAddProjectCta),
            subtitle: Text(l10n.codingHomeAddProjectHint),
            onTap: () => unawaited(_openAddProject()),
          ),
        ),
        const SizedBox(height: 8),
        Card(
          child: ListTile(
            leading: const Icon(Icons.add_task_outlined),
            title: Text(l10n.codingNewTaskTitle),
            subtitle: Text(l10n.codingHomeNewTaskHint),
            onTap: () => unawaited(_openNewTask()),
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final node = ref.watch(nodeProvider);
    final mayUseCoding = node.mayUseCoding;
    final chat = ref.watch(chatProvider);
    final term = ref.watch(terminalProvider);
    final ehThreads = _ehThreads(chat)
        .where((t) => _passesHistoryFilter('eh', _ehArchiveId(t)))
        .toList();
    final piSessions = _piSessions(term)
        .where((s) => _passesHistoryFilter('pi', s.id))
        .toList();
    final extSessions = _extSessions
        .where((s) => _passesHistoryFilter('ext', s.id))
        .toList();
    final hasTasks = ehThreads.isNotEmpty ||
        piSessions.isNotEmpty ||
        extSessions.isNotEmpty;
    final hasProjects = _projects.isNotEmpty;
    final showEmptyHome = !hasTasks && !hasProjects;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.navCoding),
        actions: [
          if (node.activeNode != null && mayUseCoding) ...[
            IconButton(
              tooltip: l10n.codingAddProjectCta,
              icon: const Icon(Icons.create_new_folder_outlined),
              onPressed: () => unawaited(_openAddProject()),
            ),
            PopupMenuButton<CodingHistoryFilter>(
              tooltip: _historyFilter == CodingHistoryFilter.archived
                  ? l10n.codingHistoryArchived
                  : l10n.codingHistoryAll,
              icon: Icon(
                _historyFilter == CodingHistoryFilter.archived
                    ? Icons.inventory_2_outlined
                    : Icons.filter_list,
              ),
              onSelected: (v) => unawaited(_setHistoryFilter(v)),
              itemBuilder: (_) => [
                CheckedPopupMenuItem(
                  value: CodingHistoryFilter.all,
                  checked: _historyFilter == CodingHistoryFilter.all,
                  child: Text(l10n.codingHistoryAll),
                ),
                CheckedPopupMenuItem(
                  value: CodingHistoryFilter.archived,
                  checked: _historyFilter == CodingHistoryFilter.archived,
                  child: Text(l10n.codingHistoryArchived),
                ),
              ],
            ),
            IconButton(
              tooltip: l10n.codingSchedulesTitle,
              icon: const Icon(Icons.schedule),
              onPressed: () => unawaited(showCodingSchedulesSheet(context)),
            ),
            IconButton(
              tooltip: l10n.codingHeartbeatListTitle,
              icon: const Icon(Icons.favorite_border),
              onPressed: () => unawaited(showCodingHeartbeatsSheet(context)),
            ),
          ],
          if (_refreshing)
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 12),
              child: SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            )
          else
            IconButton(
              tooltip: l10n.commonRefresh,
              icon: const Icon(Icons.refresh),
              onPressed: _refresh,
            ),
          const ConnectionIndicator(),
          const SizedBox(width: 8),
        ],
      ),
      floatingActionButton: node.activeNode != null && mayUseCoding
          ? FloatingActionButton(
              heroTag: 'coding-new',
              tooltip: l10n.codingNewTaskTitle,
              onPressed: () => unawaited(_openNewTask()),
              child: const Icon(Icons.add),
            )
          : null,
      body: node.activeNode == null
          ? const PairRequiredPanel(icon: Icons.code_outlined)
          : !mayUseCoding
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(
                      l10n.codingGated,
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                            color:
                                Theme.of(context).colorScheme.onSurfaceVariant,
                          ),
                    ),
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _refresh,
                  child: showEmptyHome
                      ? _emptyHome(l10n)
                      : ListView(
                          physics: const AlwaysScrollableScrollPhysics(),
                          children: [
                            _sectionHeader(l10n.codingSectionProjects),
                            if (!hasProjects)
                              ListTile(
                                leading: const Icon(
                                  Icons.create_new_folder_outlined,
                                ),
                                title: Text(l10n.codingAddProjectCta),
                                subtitle: Text(l10n.codingHomeAddProjectHint),
                                onTap: () => unawaited(_openAddProject()),
                              )
                            else
                              ..._projects.map((project) {
                                return ListTile(
                                  leading: CircleAvatar(
                                    backgroundColor: Theme.of(context)
                                        .colorScheme
                                        .secondaryContainer,
                                    child: Icon(
                                      Icons.folder_outlined,
                                      color: Theme.of(context)
                                          .colorScheme
                                          .onSecondaryContainer,
                                    ),
                                  ),
                                  title: Text(project.label),
                                  subtitle: Text(
                                    project.path,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  trailing: PopupMenuButton<String>(
                                    onSelected: (value) {
                                      if (value == 'new') {
                                        unawaited(
                                          _openNewTask(
                                            initialCwd: project.path,
                                          ),
                                        );
                                      } else if (value == 'remove') {
                                        unawaited(_removeProject(project));
                                      }
                                    },
                                    itemBuilder: (_) => [
                                      PopupMenuItem(
                                        value: 'new',
                                        child: Text(l10n.codingNewTaskTitle),
                                      ),
                                      PopupMenuItem(
                                        value: 'remove',
                                        child: Text(
                                          l10n.codingRemoveFromCoding,
                                        ),
                                      ),
                                    ],
                                  ),
                                  onTap: () => unawaited(
                                    _openNewTask(initialCwd: project.path),
                                  ),
                                );
                              }),
                            if (hasTasks) ...[
                              _sectionHeader(l10n.codingSectionTasks),
                              ...ehThreads.map((thread) {
                              final archiveId = _ehArchiveId(thread);
                              return Dismissible(
                                key: Key(thread.id),
                                direction: DismissDirection.endToStart,
                                background: Container(
                                  alignment: Alignment.centerRight,
                                  padding: const EdgeInsets.only(right: 20),
                                  color: Colors.red,
                                  child: const Icon(
                                    Icons.delete,
                                    color: Colors.white,
                                  ),
                                ),
                                confirmDismiss: (_) async {
                                  await _removeEh(thread);
                                  return false;
                                },
                                child: ListTile(
                                  leading: CircleAvatar(
                                    backgroundColor: Theme.of(context)
                                        .colorScheme
                                        .primaryContainer,
                                    child: Text(
                                      'EH',
                                      style: TextStyle(
                                        color: Theme.of(context)
                                            .colorScheme
                                            .onPrimaryContainer,
                                        fontWeight: FontWeight.w600,
                                        fontSize: 12,
                                      ),
                                    ),
                                  ),
                                  title: Text(thread.displayName),
                                  subtitle: Text(
                                    thread.lastMessageText ??
                                        l10n.codingStatusIdle,
                                  ),
                                  trailing: _archiveMenu(
                                    l10n: l10n,
                                    kind: 'eh',
                                    id: archiveId,
                                    onRemove: () => _removeEh(thread),
                                  ),
                                  onTap: () => _openEh(thread),
                                  onLongPress: () =>
                                      unawaited(_toggleArchive('eh', archiveId)),
                                ),
                              );
                            }),
                            ...piSessions.map((session) {
                              return Dismissible(
                                key: Key('pi-${session.id}'),
                                direction: DismissDirection.endToStart,
                                background: Container(
                                  alignment: Alignment.centerRight,
                                  padding: const EdgeInsets.only(right: 20),
                                  color: Colors.red,
                                  child: const Icon(
                                    Icons.delete,
                                    color: Colors.white,
                                  ),
                                ),
                                confirmDismiss: (_) async {
                                  await _removePi(session);
                                  return false;
                                },
                                child: ListTile(
                                  leading: CircleAvatar(
                                    backgroundColor: Theme.of(context)
                                        .colorScheme
                                        .primaryContainer,
                                    child: Text(
                                      'π',
                                      style: TextStyle(
                                        color: Theme.of(context)
                                            .colorScheme
                                            .onPrimaryContainer,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ),
                                  title: Text(session.name),
                                  subtitle: Text(
                                    [
                                      if (session.cwd != null &&
                                          session.cwd!.isNotEmpty)
                                        session.cwd!,
                                      l10n.codingPiConsoleHint,
                                    ].join(' · '),
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  trailing: _archiveMenu(
                                    l10n: l10n,
                                    kind: 'pi',
                                    id: session.id,
                                    onRemove: () => _removePi(session),
                                  ),
                                  onTap: () => _openPi(session),
                                  onLongPress: () => unawaited(
                                    _toggleArchive('pi', session.id),
                                  ),
                                ),
                              );
                            }),
                            ...extSessions.map((session) {
                              final choice =
                                  codingHarnessFromWireId(session.harness);
                              final label = choice != null
                                  ? codingHarnessDisplayName(choice)
                                  : session.title;
                              return Dismissible(
                                key: Key('ext-${session.id}'),
                                direction: DismissDirection.endToStart,
                                background: Container(
                                  alignment: Alignment.centerRight,
                                  padding: const EdgeInsets.only(right: 20),
                                  color: Colors.red,
                                  child: const Icon(
                                    Icons.delete,
                                    color: Colors.white,
                                  ),
                                ),
                                confirmDismiss: (_) async {
                                  await _removeExt(session);
                                  return false;
                                },
                                child: ListTile(
                                  leading: CircleAvatar(
                                    backgroundColor: Theme.of(context)
                                        .colorScheme
                                        .tertiaryContainer,
                                    child: Text(
                                      _extBadge(session.harness),
                                      style: TextStyle(
                                        color: Theme.of(context)
                                            .colorScheme
                                            .onTertiaryContainer,
                                        fontWeight: FontWeight.w600,
                                        fontSize: 11,
                                      ),
                                    ),
                                  ),
                                  title: Text(
                                    session.title.trim().isNotEmpty
                                        ? session.title
                                        : label,
                                  ),
                                  subtitle: Text(
                                    [
                                      if (session.cwd.isNotEmpty) session.cwd,
                                      label,
                                    ].join(' · '),
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  trailing: _archiveMenu(
                                    l10n: l10n,
                                    kind: 'ext',
                                    id: session.id,
                                    onRemove: () => _removeExt(session),
                                  ),
                                  onTap: () => _openExt(session),
                                  onLongPress: () => unawaited(
                                    _toggleArchive('ext', session.id),
                                  ),
                                ),
                              );
                            }),
                            ],
                            if (!hasTasks)
                              Padding(
                                padding: const EdgeInsets.fromLTRB(
                                  16,
                                  24,
                                  16,
                                  8,
                                ),
                                child: Text(
                                  l10n.codingHomeNewTaskHint,
                                  textAlign: TextAlign.center,
                                  style: Theme.of(context)
                                      .textTheme
                                      .bodyMedium
                                      ?.copyWith(
                                        color: Theme.of(context)
                                            .colorScheme
                                            .onSurfaceVariant,
                                      ),
                                ),
                              ),
                            const SizedBox(height: 88),
                          ],
                        ),
                ),
    );
  }
}
