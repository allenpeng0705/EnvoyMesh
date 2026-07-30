import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../models/chat_thread.dart';
import '../../providers/chat_provider.dart';
import '../../providers/contact_provider.dart';
import '../../widgets/ext_agent_switcher.dart';
import '../../widgets/thread_tile.dart';
import '../terminals/terminal_detail_screen.dart';
import 'chat_detail_screen.dart';

/// Unified thread list — direct chats, group chats, AI chats, and terminals.
class ChatListScreen extends ConsumerWidget {
  const ChatListScreen({super.key});

  static String _terminalSessionTitle(String displayName) {
    var name = displayName;
    if (name.startsWith('Terminal: ')) {
      name = name.substring('Terminal: '.length);
    }
    if (name.startsWith('π ')) {
      name = name.substring(2);
    }
    return name;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final chatState = ref.watch(chatProvider);
    final threads = chatState.threads;

    if (threads.isEmpty) {
      return ListView(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: SearchBar(
              hintText: 'Search chats...',
              leading: const Icon(Icons.search),
              onChanged: (_) {},
            ),
          ),
          const Padding(
            padding: EdgeInsets.only(top: 80),
            child: Center(
              child: Column(
                children: [
                  Icon(Icons.chat_bubble_outline, size: 64,
                      color: Colors.grey),
                  SizedBox(height: 16),
                  Text(
                    'No conversations yet',
                    style: TextStyle(fontSize: 18, color: Colors.grey),
                  ),
                  SizedBox(height: 8),
                  Text(
                    'Pair with your home node to get started.',
                    style: TextStyle(color: Colors.grey),
                  ),
                ],
              ),
            ),
          ),
        ],
      );
    }

    // Group threads by type for sectioned display.
    final ai = threads
        .where((t) =>
            t.type == ChatThreadType.envoyai ||
            t.type == ChatThreadType.externalAgent ||
            t.type == ChatThreadType.aiBot)
        .toList();
    final contacts = threads
        .where((t) => t.type == ChatThreadType.direct)
        .toList();
    final groups = threads
        .where((t) => t.type == ChatThreadType.group)
        .toList();
    final terminals = threads
        .where((t) => t.type == ChatThreadType.terminal)
        .toList();

    final sections = <_ThreadSection>[];
    if (ai.isNotEmpty) sections.add(_ThreadSection('AI', ai));
    if (contacts.isNotEmpty) sections.add(_ThreadSection('Contacts', contacts));
    if (groups.isNotEmpty) sections.add(_ThreadSection('Groups', groups));
    if (terminals.isNotEmpty) sections.add(_ThreadSection('Terminals', terminals));

    return Stack(
      children: [
        Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(12),
              child: SearchBar(
                hintText: 'Search chats...',
                leading: const Icon(Icons.search),
                onChanged: (_) {},
              ),
            ),
            Expanded(
              child: ListView.builder(
                itemCount: sections.fold<int>(
                    0, (sum, s) => sum + 1 + s.threads.length),
                itemBuilder: (context, index) {
                  // Find which section and position this index belongs to.
                  var offset = 0;
                  for (final section in sections) {
                    if (index == offset) {
                      // Section header.
                      return Padding(
                        padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
                        child: Text(
                          section.title,
                          style: Theme.of(context)
                              .textTheme
                              .titleSmall
                              ?.copyWith(
                                color: Theme.of(context)
                                    .colorScheme
                                    .primary,
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
                          child: const Icon(Icons.delete,
                              color: Colors.white),
                        ),
                        confirmDismiss: (direction) async {
                          ref
                              .read(chatProvider.notifier)
                              .deleteThread(thread.id);
                          return false;
                        },
                        child: ThreadTile(
                          thread: thread,
                          trailingAction:
                              thread.type == ChatThreadType.externalAgent
                                  ? const ExtAgentSwitcher(iconOnly: true)
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
            tooltip: 'New',
            onPressed: () => _showNewActions(context, ref),
            child: const Icon(Icons.add),
          ),
        ),
      ],
    );
  }

  void _showNewActions(BuildContext context, WidgetRef ref) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.smart_toy_outlined),
                title: const Text('Create Bot'),
                subtitle: const Text('AI character on your home node'),
                onTap: () {
                  Navigator.of(sheetContext).pop();
                  _createBot(context, ref);
                },
              ),
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
                title: const Text('New Pi'),
                subtitle: const Text('Start a Pi coding terminal'),
                onTap: () {
                  Navigator.of(sheetContext).pop();
                  _createPi(context, ref);
                },
              ),
              ListTile(
                leading: const Icon(Icons.terminal),
                title: const Text('New Terminal'),
                subtitle: const Text('Open a shell on the home node'),
                onTap: () {
                  Navigator.of(sheetContext).pop();
                  _createTerminal(context, ref);
                },
              ),
              ListTile(
                leading: const Icon(Icons.group_add),
                title: const Text('New Group Chat'),
                subtitle: const Text('Create a group conversation'),
                onTap: () {
                  Navigator.of(sheetContext).pop();
                  _showCreateRoomDialog(context, ref);
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
              displayName: thread.displayName,
              agentType: thread.agentType ??
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

    final isRoom = thread.type == ChatThreadType.group;
    final contactOwnerId = isRoom
        ? null
        : (thread.contactOwnerId ??
            threadPeerSuffix(thread.id, thread.nodeId));
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ChatDetailScreen(
          threadId: thread.id,
          displayName: thread.displayName,
          contactOwnerId: contactOwnerId,
          chatRoomId: isRoom ? thread.chatRoomId : null,
        ),
      ),
    );
  }

  void _createTerminal(BuildContext context, WidgetRef ref) {
    final nameController = TextEditingController(text: 'zsh');
    final cwdController = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('New Terminal'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: nameController,
              autofocus: true,
              decoration: const InputDecoration(
                hintText: 'Shell (e.g. zsh, bash)',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: cwdController,
              decoration: const InputDecoration(
                hintText: 'Working directory (optional)',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              final name = nameController.text.trim();
              if (name.isNotEmpty) {
                ref.read(chatProvider.notifier).createTerminal(
                      name: name,
                      cwd: cwdController.text.trim().isEmpty
                          ? null
                          : cwdController.text.trim(),
                    );
                Navigator.of(ctx).pop();
              }
            },
            child: const Text('Create'),
          ),
        ],
      ),
    );
  }

  /// Create an AI character bot on the home node (same fields as Social).
  void _createBot(BuildContext context, WidgetRef ref) {
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
    String? error;

    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setLocal) {
            final canCreate = nameController.text.trim().isNotEmpty &&
                promptController.text.trim().isNotEmpty &&
                !saving;
            return AlertDialog(
              title: const Text('Create Bot'),
              content: SizedBox(
                width: 360,
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
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
                              (nameController.text.trim().isEmpty
                                      ? '?'
                                      : nameController.text.trim()[0])
                                  .toUpperCase(),
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              nameController.text.trim().isEmpty
                                  ? 'Bot name'
                                  : nameController.text.trim(),
                              style: Theme.of(ctx).textTheme.titleSmall,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      TextField(
                        controller: nameController,
                        autofocus: true,
                        textInputAction: TextInputAction.next,
                        decoration: const InputDecoration(
                          labelText: 'Bot name',
                          hintText: 'e.g. Luna the Librarian',
                          border: OutlineInputBorder(),
                        ),
                        onChanged: (_) => setLocal(() {}),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: promptController,
                        minLines: 3,
                        maxLines: 6,
                        decoration: const InputDecoration(
                          labelText: 'Personality / System prompt',
                          hintText:
                              'Describe the character: personality, speaking style, expertise…',
                          border: OutlineInputBorder(),
                          alignLabelWithHint: true,
                        ),
                        onChanged: (_) => setLocal(() {}),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: descController,
                        decoration: const InputDecoration(
                          labelText: 'Short description (optional)',
                          hintText: 'A wise guide for knowledge seekers',
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        'Avatar color',
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
                    ],
                  ),
                ),
              ),
              actions: [
                TextButton(
                  onPressed: saving ? null : () => Navigator.of(ctx).pop(),
                  child: const Text('Cancel'),
                ),
                FilledButton(
                  onPressed: !canCreate
                      ? null
                      : () async {
                          setLocal(() {
                            saving = true;
                            error = null;
                          });
                          try {
                            final threadId = await ref
                                .read(chatProvider.notifier)
                                .createAiBot(
                                  name: nameController.text,
                                  systemPrompt: promptController.text,
                                  description: descController.text,
                                  avatarColor: avatarColor,
                                );
                            if (!ctx.mounted) return;
                            Navigator.of(ctx).pop();
                            if (!context.mounted) return;
                            final displayName = nameController.text.trim();
                            final botId = threadId.contains(':bot:')
                                ? threadId.split(':bot:').last
                                : '';
                            await Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => ChatDetailScreen(
                                  threadId: threadId,
                                  displayName: displayName,
                                  agentType: botId.isEmpty
                                      ? 'envoyai'
                                      : 'bot:$botId',
                                ),
                              ),
                            );
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
                        },
                  child: Text(saving ? 'Saving…' : 'Create Bot'),
                ),
              ],
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
        return StatefulBuilder(
          builder: (ctx, setLocal) {
            return AlertDialog(
              title: const Text('New Pi'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Choose a project folder on the home computer to open the Pi coding terminal.',
                    style: TextStyle(fontSize: 13),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: pathController,
                    enabled: !starting,
                    autofocus: true,
                    decoration: const InputDecoration(
                      labelText: 'Project folder',
                      hintText: '/Users/you/project',
                      border: OutlineInputBorder(),
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
                  child: const Text('Cancel'),
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
                      : const Text('Start Pi'),
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
        const SnackBar(content: Text('Enter a project folder path.')),
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
      final title = path.split(RegExp(r'[/\\]')).where((s) => s.isNotEmpty).last;
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
    final controller = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('New Group Chat'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(
            hintText: 'Group name',
            border: OutlineInputBorder(),
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
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              final name = controller.text.trim();
              if (name.isNotEmpty) {
                ref.read(chatProvider.notifier).createRoom(name);
                Navigator.of(ctx).pop();
              }
            },
            child: const Text('Create'),
          ),
        ],
      ),
    );
  }
}

/// Helper for sectioned thread display.
class _ThreadSection {
  final String title;
  final List<ChatThread> threads;
  const _ThreadSection(this.title, this.threads);
}
