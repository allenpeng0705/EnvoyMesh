import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/app_localizations.dart';
import '../../models/chat_thread.dart';
import '../../models/terminal_session.dart';
import '../../providers/chat_provider.dart';
import '../../providers/node_provider.dart';
import '../../providers/terminal_provider.dart';
import '../../services/coding_ext_sessions.dart';
import '../../widgets/connection_indicator.dart';
import '../chat/envoy_harness_chat_screen.dart';
import 'coding_heartbeat_ui.dart';
import 'coding_new_workspace_sheet.dart';
import 'ext_agent_coding_screen.dart';
import 'pi_coding_chat_screen.dart';

/// Coding tab root — resume-first workspace list (Phase 68-C1b.2 / C1b.3).
///
/// EH stream chats + Pi coding sessions from the home node, plus local
/// Tier B Ext Agent sessions. Create via FAB ([showCodingNewWorkspaceSheet]).
class CodingHomeScreen extends ConsumerStatefulWidget {
  const CodingHomeScreen({super.key});

  @override
  ConsumerState<CodingHomeScreen> createState() => _CodingHomeScreenState();
}

class _CodingHomeScreenState extends ConsumerState<CodingHomeScreen> {
  var _refreshing = false;
  List<CodingExtSession> _extSessions = const [];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(_refresh());
    });
  }

  Future<void> _refresh() async {
    if (_refreshing) return;
    setState(() => _refreshing = true);
    try {
      final ext = await loadCodingExtSessions();
      await Future.wait([
        ref.read(chatProvider.notifier).syncEhChats(),
        ref.read(chatProvider.notifier).syncTerminals(),
      ]);
      if (mounted) setState(() => _extSessions = ext);
    } catch (_) {
      // Offline / older home node — keep showing local list.
      try {
        final ext = await loadCodingExtSessions();
        if (mounted) setState(() => _extSessions = ext);
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

  Future<void> _openNewWorkspace() async {
    final ehCount = _ehThreads(ref.read(chatProvider)).length;
    await showCodingNewWorkspaceSheet(
      context,
      ref,
      onConfirm: (harness, cwd) async {
        if (codingHarnessIsTierB(harness)) {
          final wireId = codingHarnessWireId(harness);
          final session = await createCodingExtSession(
            harness: wireId,
            cwd: cwd,
            title: codingHarnessDisplayName(harness),
          );
          if (!mounted) return;
          setState(() {
            _extSessions = [session, ..._extSessions.where((s) => s.id != session.id)];
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
          final threadId = await ref
              .read(chatProvider.notifier)
              .createEhChat(projectPath: cwd);
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

        final sessionId = await ref
            .read(chatProvider.notifier)
            .createPiTerminal(projectPath: cwd);
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

  Future<void> _removeEh(ChatThread thread) async {
    final l10n = AppLocalizations.of(context);
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
            child: Text(l10n.commonRemove),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
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

  Future<void> _removePi(TerminalSession session) async {
    final l10n = AppLocalizations.of(context);
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
            child: Text(l10n.commonRemove),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
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

  Future<void> _removeExt(CodingExtSession session) async {
    final l10n = AppLocalizations.of(context);
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
            child: Text(l10n.commonRemove),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    await removeCodingExtSession(session.id);
    if (!mounted) return;
    setState(() {
      _extSessions = _extSessions.where((s) => s.id != session.id).toList();
    });
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
      default:
        return 'EX';
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final mayUseCoding = ref.watch(nodeProvider).mayUseCoding;
    final chat = ref.watch(chatProvider);
    final term = ref.watch(terminalProvider);
    final ehThreads = _ehThreads(chat);
    final piSessions = _piSessions(term);
    final hasWorkspaces = ehThreads.isNotEmpty ||
        piSessions.isNotEmpty ||
        _extSessions.isNotEmpty;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.navCoding),
        actions: [
          if (mayUseCoding)
            IconButton(
              tooltip: l10n.codingHeartbeatListTitle,
              icon: const Icon(Icons.favorite_border),
              onPressed: () => unawaited(showCodingHeartbeatsSheet(context)),
            ),
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
      floatingActionButton: mayUseCoding
          ? FloatingActionButton(
              heroTag: 'coding-new',
              tooltip: l10n.codingNewWorkspaceTitle,
              onPressed: _openNewWorkspace,
              child: const Icon(Icons.add),
            )
          : null,
      body: !mayUseCoding
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  l10n.codingGated,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                ),
              ),
            )
          : RefreshIndicator(
              onRefresh: _refresh,
              child: !hasWorkspaces
                  ? ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.all(24),
                      children: [
                        const SizedBox(height: 48),
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
                          l10n.codingEmptyHint,
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.bodyMedium
                              ?.copyWith(
                                color: Theme.of(context)
                                    .colorScheme
                                    .onSurfaceVariant,
                              ),
                        ),
                      ],
                    )
                  : ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      children: [
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
                          child: Text(
                            l10n.codingSectionProjects,
                            style: Theme.of(context).textTheme.titleSmall
                                ?.copyWith(
                                  color: Theme.of(context).colorScheme.primary,
                                  fontWeight: FontWeight.w600,
                                ),
                          ),
                        ),
                        ...ehThreads.map((thread) {
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
                              onTap: () => _openEh(thread),
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
                              onTap: () => _openPi(session),
                            ),
                          );
                        }),
                        ..._extSessions.map((session) {
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
                              onTap: () => _openExt(session),
                            ),
                          );
                        }),
                        const SizedBox(height: 88),
                      ],
                    ),
            ),
    );
  }
}
