import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../l10n/app_localizations.dart';
import '../../models/chat_thread.dart';
import '../../providers/chat_provider.dart';
import '../../providers/contact_provider.dart';
import '../../providers/node_provider.dart';
import '../../utils/localized_labels.dart';
import '../../widgets/ext_agent_switcher.dart';
import '../../widgets/thread_tile.dart';
import '../terminals/terminal_detail_screen.dart';
import 'chat_detail_screen.dart';

/// Unified thread list — direct chats, group chats, AI chats, and terminals.
class ChatListScreen extends ConsumerWidget {
  const ChatListScreen({super.key});

  static String _terminalSessionTitle(String displayName) {
    var name = displayName;
    if (name.startsWith(ThreadTitleSentinels.terminalPrefix)) {
      name = name.substring(ThreadTitleSentinels.terminalPrefix.length);
    }
    if (name.startsWith('π ')) {
      name = name.substring(2);
    }
    return name;
  }

  static String _localizedThreadTitle(
    BuildContext context,
    ChatThread thread,
  ) {
    return localizeThreadTitle(
      AppLocalizations.of(context),
      displayName: thread.displayName,
      type: thread.type,
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final chatState = ref.watch(chatProvider);
    final threads = chatState.threads;

    if (threads.isEmpty) {
      return ListView(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: SearchBar(
              hintText: l10n.chatsSearchHint,
              leading: const Icon(Icons.search),
              onChanged: (_) {},
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(top: 80),
            child: Center(
              child: Column(
                children: [
                  const Icon(Icons.chat_bubble_outline, size: 64, color: Colors.grey),
                  const SizedBox(height: 16),
                  Text(
                    l10n.chatsEmpty,
                    style: const TextStyle(fontSize: 18, color: Colors.grey),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    l10n.chatsEmptyHint,
                    style: const TextStyle(color: Colors.grey),
                  ),
                ],
              ),
            ),
          ),
        ],
      );
    }

    // Group threads by type for sectioned display.
    final isOwner = ref.watch(nodeProvider).isOwnerProfile;
    final ai =
        threads
            .where(
              (t) =>
                  t.type == ChatThreadType.envoyai ||
                  t.type == ChatThreadType.externalAgent ||
                  t.type == ChatThreadType.aiBot,
            )
            .toList()
          ..sort((a, b) {
            int rank(ChatThread t) {
              if (t.type == ChatThreadType.envoyai) return 0;
              if (t.type == ChatThreadType.externalAgent) return 1;
              return 2;
            }

            final byType = rank(a).compareTo(rank(b));
            if (byType != 0) return byType;
            return a.displayName.toLowerCase().compareTo(
              b.displayName.toLowerCase(),
            );
          });
    final family = threads
        .where(
          (t) =>
              t.type == ChatThreadType.family ||
              t.type == ChatThreadType.familyGroup,
        )
        .toList();
    // Mesh contacts / mesh groups / terminals are owner-only (Phase 51E).
    final contacts = isOwner
        ? threads.where((t) => t.type == ChatThreadType.direct).toList()
        : <ChatThread>[];
    final groups = isOwner
        ? threads.where((t) => t.type == ChatThreadType.group).toList()
        : <ChatThread>[];
    final terminals = isOwner
        ? threads.where((t) => t.type == ChatThreadType.terminal).toList()
        : <ChatThread>[];

    final sections = <_ThreadSection>[];
    if (ai.isNotEmpty) sections.add(_ThreadSection(l10n.chatsSectionAi, ai));
    if (family.isNotEmpty) {
      sections.add(_ThreadSection(l10n.chatsSectionFamily, family));
    }
    if (contacts.isNotEmpty) {
      sections.add(_ThreadSection(l10n.chatsSectionContacts, contacts));
    }
    if (groups.isNotEmpty) {
      sections.add(_ThreadSection(l10n.chatsSectionGroups, groups));
    }
    if (terminals.isNotEmpty) {
      sections.add(_ThreadSection(l10n.chatsSectionTerminals, terminals));
    }

    return Stack(
      children: [
        Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(12),
              child: SearchBar(
                hintText: l10n.chatsSearchHint,
                leading: const Icon(Icons.search),
                onChanged: (_) {},
              ),
            ),
            Expanded(
              child: ListView.builder(
                itemCount: sections.fold<int>(
                  0,
                  (sum, s) => sum + 1 + s.threads.length,
                ),
                itemBuilder: (context, index) {
                  var offset = 0;
                  for (final section in sections) {
                    if (index == offset) {
                      return Padding(
                        padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
                        child: Text(
                          section.title,
                          style: Theme.of(context).textTheme.titleSmall
                              ?.copyWith(
                                color: Theme.of(context).colorScheme.primary,
                                fontWeight: FontWeight.w600,
                              ),
                        ),
                      );
                    }
                    offset++;
                    final threadIndex = index - offset;
                    if (threadIndex < section.threads.length) {
                      final thread = section.threads[threadIndex];
                      return Dismissible(
                        key: Key(thread.id),
                        direction: DismissDirection.endToStart,
                        background: Container(
                          alignment: Alignment.centerRight,
                          padding: const EdgeInsets.only(right: 20),
                          color: Colors.red,
                          child: const Icon(Icons.delete, color: Colors.white),
                        ),
                        confirmDismiss: (direction) async {
                          if (thread.type == ChatThreadType.aiBot) {
                            final ok = await _confirmDeleteBot(
                              context,
                              thread.displayName,
                            );
                            if (ok != true || !context.mounted) return false;
                          }
                          await ref
                              .read(chatProvider.notifier)
                              .deleteThread(thread.id);
                          return false;
                        },
                        child: ThreadTile(
                          thread: thread,
                          trailingAction:
                              thread.type == ChatThreadType.externalAgent &&
                                      isOwner
                              ? const ExtAgentSwitcher(iconOnly: true)
                              : thread.type == ChatThreadType.aiBot
                              ? _AiBotRowMenu(
                                  onEdit: () => _showBotEditor(
                                    context,
                                    ref,
                                    botId: thread.botId,
                                  ),
                                  onDelete: () async {
                                    final ok = await _confirmDeleteBot(
                                      context,
                                      thread.displayName,
                                    );
                                    if (ok != true || !context.mounted) {
                                      return;
                                    }
                                    await ref
                                        .read(chatProvider.notifier)
                                        .deleteThread(thread.id);
                                  },
                                )
                              : null,
                          onTap: () => _openThread(context, thread),
                        ),
                      );
                    }
                    offset += section.threads.length;
                  }
                  return const SizedBox.shrink();
                },
              ),
            ),
          ],
        ),
        // Single compose FAB → popup with Create Bot / New Pi / Terminal / Group.
        Positioned(
          right: 16,
          bottom: 16,
          child: FloatingActionButton(
            heroTag: 'compose',
            tooltip: l10n.chatsFabNew,
            onPressed: () => _showNewActions(context, ref),
            child: const Icon(Icons.add),
          ),
        ),
      ],
    );
  }

  void _showNewActions(BuildContext context, WidgetRef ref) {
    final isOwner = ref.read(nodeProvider).isOwnerProfile;
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) {
        final l10n = AppLocalizations.of(sheetContext);
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.smart_toy_outlined),
                title: Text(l10n.chatsCreateBot),
                subtitle: Text(l10n.chatsCreateBotHint),
                onTap: () {
                  Navigator.of(sheetContext).pop();
                  WidgetsBinding.instance.addPostFrameCallback((_) {
                    if (!context.mounted) return;
                    _showBotEditor(context, ref);
                  });
                },
              ),
              if (isOwner) ...[
                ListTile(
                  leading: const SizedBox(
                    width: 24,
                    child: Center(
                      child: Text(
                        'π',
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
                  title: Text(l10n.chatsNewPi),
                  subtitle: Text(l10n.chatsNewPiHint),
                  onTap: () {
                    Navigator.of(sheetContext).pop();
                    _createPi(context, ref);
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.terminal),
                  title: Text(l10n.chatsNewTerminal),
                  subtitle: Text(l10n.chatsNewTerminalHint),
                  onTap: () {
                    Navigator.of(sheetContext).pop();
                    _createTerminal(context, ref);
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.group_add),
                  title: Text(l10n.chatsNewGroup),
                  subtitle: Text(l10n.chatsNewGroupHint),
                  onTap: () {
                    Navigator.of(sheetContext).pop();
                    _showCreateRoomDialog(context, ref);
                  },
                ),
              ],
              ListTile(
                leading: const Icon(Icons.family_restroom),
                title: Text(l10n.chatsNewFamilyGroup),
                subtitle: Text(l10n.chatsNewFamilyGroupHint),
                onTap: () {
                  Navigator.of(sheetContext).pop();
                  WidgetsBinding.instance.addPostFrameCallback((_) {
                    if (!context.mounted) return;
                    _showCreateFamilyRoomDialog(context, ref);
                  });
                },
              ),
              const SizedBox(height: 8),
            ],
          ),
        );
      },
    );
  }

  void _openThread(BuildContext context, ChatThread thread) {
    switch (thread.type) {
      case ChatThreadType.terminal:
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) {
              // Extract sessionId from threadId: "nodeId:term:sessionId"
              final parts = thread.id.split(':term:');
              final sessionId = parts.length > 1 ? parts[1] : '';
              return TerminalDetailScreen(
                sessionId: sessionId,
                sessionName: _terminalSessionTitle(thread.displayName),
              );
            },
          ),
        );
        return;
      case ChatThreadType.envoyai:
      case ChatThreadType.externalAgent:
      case ChatThreadType.aiBot:
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => ChatDetailScreen(
              threadId: thread.id,
              displayName: _localizedThreadTitle(context, thread),
              agentType:
                  thread.agentType ??
                  (thread.type == ChatThreadType.externalAgent
                      ? 'external'
                      : thread.type == ChatThreadType.aiBot
                      ? 'bot:${thread.botId ?? ''}'
                      : 'envoyai'),
            ),
          ),
        );
        return;
      case ChatThreadType.pi:
        // Legacy type — Pi lives under Terminals now.
        return;
      default:
        break;
    }

    final isRoom =
        thread.type == ChatThreadType.group ||
        thread.type == ChatThreadType.familyGroup;
    final contactOwnerId = isRoom
        ? null
        : (thread.contactOwnerId ?? threadPeerSuffix(thread.id, thread.nodeId));
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ChatDetailScreen(
          threadId: thread.id,
          displayName: _localizedThreadTitle(context, thread),
          contactOwnerId: contactOwnerId,
          chatRoomId: isRoom ? thread.chatRoomId : null,
          isFamilyRoom: thread.type == ChatThreadType.familyGroup,
        ),
      ),
    );
  }

  void _createTerminal(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final nameController = TextEditingController(text: 'zsh');
    final cwdController = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.chatsNewTerminal),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: nameController,
              autofocus: true,
              decoration: InputDecoration(
                hintText: l10n.chatsShellHint,
                border: const OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: cwdController,
              decoration: InputDecoration(
                hintText: l10n.chatsCwdHint,
                border: const OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: Text(l10n.commonCancel),
          ),
          FilledButton(
            onPressed: () {
              final name = nameController.text.trim();
              if (name.isNotEmpty) {
                ref
                    .read(chatProvider.notifier)
                    .createTerminal(
                      name: name,
                      cwd: cwdController.text.trim().isEmpty
                          ? null
                          : cwdController.text.trim(),
                    );
                Navigator.of(ctx).pop();
              }
            },
            child: Text(l10n.commonCreate),
          ),
        ],
      ),
    );
  }

  Future<bool?> _confirmDeleteBot(BuildContext context, String name) {
    final l10n = AppLocalizations.of(context);
    return showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.chatsDeleteBotTitle),
        content: Text(l10n.chatsDeleteBotBody(name)),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(l10n.commonCancel),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(l10n.commonDelete),
          ),
        ],
      ),
    );
  }

  /// Create or edit an AI character bot on the home node (same fields as Social).
  void _showBotEditor(BuildContext context, WidgetRef ref, {String? botId}) {
    final editingId = botId?.trim();
    final isEdit = editingId != null && editingId.isNotEmpty;
    final nameController = TextEditingController();
    final promptController = TextEditingController();
    final descController = TextEditingController();
    const presets = <String>[
      '#6366f1',
      '#07c160',
      '#0d9488',
      '#d97706',
      '#ef4444',
      '#7c3aed',
    ];
    var avatarColor = presets.first;
    var saving = false;
    var loadStarted = false;
    String? error;

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) {
        final bottomInset = MediaQuery.viewInsetsOf(ctx).bottom;
        return StatefulBuilder(
          builder: (ctx, setLocal) {
            if (isEdit && !loadStarted) {
              loadStarted = true;
              Future<void>(() async {
                try {
                  final bot = await ref
                      .read(chatProvider.notifier)
                      .getAiBot(editingId);
                  if (!ctx.mounted) return;
                  if (bot == null) {
                    setLocal(() {
                      error = AppLocalizations.of(ctx).chatsBotNotFound;
                    });
                    return;
                  }
                  nameController.text = bot['name']?.toString() ?? '';
                  promptController.text = bot['systemPrompt']?.toString() ?? '';
                  descController.text = bot['description']?.toString() ?? '';
                  final color = bot['avatarColor']?.toString();
                  if (color != null && color.isNotEmpty) {
                    avatarColor = color.startsWith('#') ? color : '#$color';
                  }
                  setLocal(() {});
                } catch (e) {
                  if (!ctx.mounted) return;
                  setLocal(() {
                    error = e.toString().replaceFirst('Bad state: ', '');
                  });
                }
              });
            }

            Future<void> submit() async {
              if (saving) return;
              final name = nameController.text.trim();
              final prompt = promptController.text.trim();
              if (name.isEmpty || prompt.isEmpty) {
                final formL10n = AppLocalizations.of(ctx);
                setLocal(() {
                  error = name.isEmpty
                      ? formL10n.chatsBotNameRequired
                      : formL10n.chatsBotPromptRequired;
                });
                return;
              }
              setLocal(() {
                saving = true;
                error = null;
              });
              try {
                final notifier = ref.read(chatProvider.notifier);
                if (isEdit) {
                  await notifier.updateAiBot(
                    botId: editingId,
                    name: name,
                    systemPrompt: prompt,
                    description: descController.text,
                    avatarColor: avatarColor,
                  );
                  if (!ctx.mounted) return;
                  Navigator.of(ctx).pop();
                } else {
                  final threadId = await notifier.createAiBot(
                    name: name,
                    systemPrompt: prompt,
                    description: descController.text,
                    avatarColor: avatarColor,
                  );
                  if (!ctx.mounted) return;
                  Navigator.of(ctx).pop();
                  if (!context.mounted) return;
                  final newBotId = threadId.contains(':bot:')
                      ? threadId.split(':bot:').last
                      : '';
                  await Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => ChatDetailScreen(
                        threadId: threadId,
                        displayName: name,
                        agentType: newBotId.isEmpty
                            ? 'envoyai'
                            : 'bot:$newBotId',
                      ),
                    ),
                  );
                }
              } catch (e) {
                if (!ctx.mounted) return;
                setLocal(() {
                  saving = false;
                  error = e
                      .toString()
                      .replaceFirst('Bad state: ', '')
                      .replaceFirst('ArgumentError: ', '')
                      .replaceFirst('Exception: ', '');
                });
              }
            }

            final l10n = AppLocalizations.of(ctx);
            return Padding(
              padding: EdgeInsets.only(
                left: 16,
                right: 16,
                bottom: bottomInset + 16,
              ),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      isEdit ? l10n.chatsEditBot : l10n.chatsCreateBot,
                      style: Theme.of(ctx).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      isEdit ? l10n.chatsBotSyncing : l10n.chatsBotSavedHint,
                      style: Theme.of(ctx).textTheme.bodySmall?.copyWith(
                        color: Theme.of(ctx).colorScheme.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        CircleAvatar(
                          backgroundColor: Color(
                            int.parse(
                              'FF${avatarColor.replaceFirst('#', '')}',
                              radix: 16,
                            ),
                          ),
                          child: Text(
                            nameController.text.trim().isEmpty
                                ? '?'
                                : nameController.text.trim()[0].toUpperCase(),
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            nameController.text.trim().isEmpty
                                ? l10n.chatsBotName
                                : nameController.text.trim(),
                            style: Theme.of(ctx).textTheme.titleMedium,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: nameController,
                      textInputAction: TextInputAction.next,
                      decoration: InputDecoration(
                        labelText: l10n.chatsBotName,
                        hintText: l10n.chatsBotNameHint,
                        border: const OutlineInputBorder(),
                      ),
                      onChanged: (_) => setLocal(() {}),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: promptController,
                      minLines: 3,
                      maxLines: 6,
                      decoration: InputDecoration(
                        labelText: l10n.chatsBotPrompt,
                        helperText: l10n.chatsBotPromptHint,
                        border: const OutlineInputBorder(),
                        alignLabelWithHint: true,
                      ),
                      onChanged: (_) => setLocal(() {}),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: descController,
                      decoration: InputDecoration(
                        labelText: l10n.chatsBotDesc,
                        helperText: l10n.chatsBotDescHint,
                        border: const OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      l10n.chatsAvatarColor,
                      style: Theme.of(ctx).textTheme.labelLarge,
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final hex in presets)
                          GestureDetector(
                            onTap: () => setLocal(() => avatarColor = hex),
                            child: Container(
                              width: 32,
                              height: 32,
                              decoration: BoxDecoration(
                                color: Color(
                                  int.parse(
                                    'FF${hex.replaceFirst('#', '')}',
                                    radix: 16,
                                  ),
                                ),
                                shape: BoxShape.circle,
                                border: Border.all(
                                  color: avatarColor == hex
                                      ? Theme.of(ctx).colorScheme.onSurface
                                      : Colors.transparent,
                                  width: 2,
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                    if (error != null) ...[
                      const SizedBox(height: 12),
                      Text(
                        error!,
                        style: TextStyle(
                          color: Theme.of(ctx).colorScheme.error,
                          fontSize: 13,
                        ),
                      ),
                    ],
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: saving
                                ? null
                                : () => Navigator.of(ctx).pop(),
                            child: Text(l10n.commonCancel),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: FilledButton(
                            onPressed: saving ? null : submit,
                            child: Text(
                              saving
                                  ? l10n.commonSaving
                                  : (isEdit
                                      ? l10n.commonSave
                                      : l10n.chatsCreateBot),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    ).whenComplete(() {
      nameController.dispose();
      promptController.dispose();
      descController.dispose();
    });
  }

  /// Start a Pi coding TUI on the home node (project folder required).
  void _createPi(BuildContext context, WidgetRef ref) {
    final pathController = TextEditingController();
    var starting = false;

    // Prefill last project path from piSettings.allowedPaths when available.
    () async {
      final client = ref.read(nodeServiceProvider);
      if (client == null) return;
      try {
        final cfg = await client.getNodeConfig();
        final settings = (cfg['piSettings'] as Map?)?.cast<String, dynamic>();
        final paths = settings?['allowedPaths'];
        if (paths is List && paths.isNotEmpty) {
          final first = paths.first?.toString().trim() ?? '';
          if (first.isNotEmpty && pathController.text.isEmpty) {
            pathController.text = first;
          }
        }
      } catch (_) {}
    }();

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) {
        final l10n = AppLocalizations.of(ctx);
        return StatefulBuilder(
          builder: (ctx, setLocal) {
            return AlertDialog(
              title: Text(l10n.chatsNewPi),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    l10n.chatsPiBody,
                    style: const TextStyle(fontSize: 13),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: pathController,
                    enabled: !starting,
                    autofocus: true,
                    decoration: InputDecoration(
                      labelText: l10n.chatsPiFolder,
                      hintText: l10n.chatsPiFolderHint,
                      border: const OutlineInputBorder(),
                    ),
                    onSubmitted: starting
                        ? null
                        : (_) => _submitNewPi(
                            context,
                            ctx,
                            ref,
                            pathController,
                            starting,
                            (v) => setLocal(() => starting = v),
                          ),
                  ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: starting ? null : () => Navigator.of(ctx).pop(),
                  child: Text(l10n.commonCancel),
                ),
                FilledButton(
                  onPressed: starting
                      ? null
                      : () => _submitNewPi(
                          context,
                          ctx,
                          ref,
                          pathController,
                          starting,
                          (v) => setLocal(() => starting = v),
                        ),
                  child: starting
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Text(l10n.chatsPiTitle),
                ),
              ],
            );
          },
        );
      },
    );
  }

  Future<void> _submitNewPi(
    BuildContext listContext,
    BuildContext dialogContext,
    WidgetRef ref,
    TextEditingController pathController,
    bool starting,
    void Function(bool) setStarting,
  ) async {
    if (starting) return;
    final path = pathController.text.trim();
    if (path.isEmpty) {
      ScaffoldMessenger.of(listContext).showSnackBar(
        SnackBar(
          content: Text(
            AppLocalizations.of(listContext).chatsPiFolderRequired,
          ),
        ),
      );
      return;
    }
    setStarting(true);
    try {
      final sessionId = await ref
          .read(chatProvider.notifier)
          .createPiTerminal(projectPath: path);
      if (dialogContext.mounted) Navigator.of(dialogContext).pop();
      if (!listContext.mounted) return;
      final title = path
          .split(RegExp(r'[/\\]'))
          .where((s) => s.isNotEmpty)
          .last;
      await Navigator.of(listContext).push(
        MaterialPageRoute(
          builder: (_) => TerminalDetailScreen(
            sessionId: sessionId,
            sessionName: title.isNotEmpty ? 'π Pi · $title' : 'π Pi',
          ),
        ),
      );
    } catch (e) {
      setStarting(false);
      if (!listContext.mounted) return;
      ScaffoldMessenger.of(listContext).showSnackBar(
        SnackBar(content: Text(e.toString().replaceFirst('Bad state: ', ''))),
      );
    }
  }

  void _showCreateRoomDialog(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final controller = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.chatsNewGroup),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: InputDecoration(
            hintText: l10n.chatsGroupName,
            border: const OutlineInputBorder(),
          ),
          onSubmitted: (name) {
            if (name.trim().isNotEmpty) {
              ref.read(chatProvider.notifier).createRoom(name.trim());
              Navigator.of(ctx).pop();
            }
          },
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: Text(l10n.commonCancel),
          ),
          FilledButton(
            onPressed: () {
              final name = controller.text.trim();
              if (name.isNotEmpty) {
                ref.read(chatProvider.notifier).createRoom(name);
                Navigator.of(ctx).pop();
              }
            },
            child: Text(l10n.commonCreate),
          ),
        ],
      ),
    );
  }

  void _showCreateFamilyRoomDialog(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final nameController = TextEditingController();
    final myProfileId = ref.read(nodeProvider).effectiveFamilyProfileId;
    final profiles = ref.read(nodeProvider).familyProfiles.where((p) {
      final id = p['id']?.toString() ?? '';
      return id.isNotEmpty && id != myProfileId && p['active'] != false;
    }).toList();
    final selected = <String>{};

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
          title: Text(l10n.chatsNewFamilyGroup),
          content: SizedBox(
            width: 360,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: nameController,
                  autofocus: true,
                  decoration: InputDecoration(
                    hintText: l10n.chatsGroupName,
                    border: const OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                if (profiles.isEmpty)
                  Text(l10n.chatsNoFamilyMembers)
                else
                  Flexible(
                    child: ListView(
                      shrinkWrap: true,
                      children: [
                        for (final p in profiles)
                          CheckboxListTile(
                            dense: true,
                            value: selected.contains(p['id']?.toString()),
                            title: Text(
                              p['name']?.toString() ??
                                  p['id']?.toString() ??
                                  '',
                            ),
                            onChanged: (v) {
                              final id = p['id']?.toString() ?? '';
                              if (id.isEmpty) return;
                              setLocal(() {
                                if (v == true) {
                                  selected.add(id);
                                } else {
                                  selected.remove(id);
                                }
                              });
                            },
                          ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: Text(l10n.commonCancel),
            ),
            FilledButton(
              onPressed: () async {
                final title = nameController.text.trim();
                if (title.isEmpty) return;
                try {
                  await ref
                      .read(chatProvider.notifier)
                      .createFamilyRoom(
                        title: title,
                        memberProfileIds: selected.toList(),
                      );
                  if (ctx.mounted) Navigator.of(ctx).pop();
                } catch (e) {
                  if (!context.mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(
                        e.toString().replaceFirst('Bad state: ', ''),
                      ),
                    ),
                  );
                }
              },
              child: Text(l10n.commonCreate),
            ),
          ],
        ),
      ),
    );
  }
}

/// ⋯ menu on an AI bot row — Edit / Delete (mirrors Social AiBotRowMenu).
class _AiBotRowMenu extends StatelessWidget {
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  const _AiBotRowMenu({required this.onEdit, required this.onDelete});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return PopupMenuButton<String>(
      tooltip: l10n.chatsBotOptions,
      icon: const Icon(Icons.more_horiz),
      onSelected: (value) {
        if (value == 'edit') onEdit();
        if (value == 'delete') onDelete();
      },
      itemBuilder: (context) => [
        PopupMenuItem(value: 'edit', child: Text(l10n.commonEdit)),
        PopupMenuItem(value: 'delete', child: Text(l10n.commonDelete)),
      ],
    );
  }
}

/// Helper for sectioned thread display.
class _ThreadSection {
  final String title;
  final List<ChatThread> threads;
  const _ThreadSection(this.title, this.threads);
}
