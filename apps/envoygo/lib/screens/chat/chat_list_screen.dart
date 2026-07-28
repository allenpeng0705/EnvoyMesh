import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../models/chat_thread.dart';
import '../../providers/chat_provider.dart';
import '../../providers/contact_provider.dart';
import '../../widgets/ext_agent_switcher.dart';
import '../../widgets/thread_tile.dart';
import '../terminals/terminal_detail_screen.dart';
import 'chat_detail_screen.dart';
import 'pi_chat_screen.dart';

/// Unified thread list — direct chats, group chats, AI chats, and terminals.
class ChatListScreen extends ConsumerWidget {
  const ChatListScreen({super.key});

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
            t.type == ChatThreadType.pi)
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
        // FABs for creating group chats and terminals.
        Positioned(
          right: 16,
          bottom: 16,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              FloatingActionButton.small(
                heroTag: 'terminal',
                onPressed: () => _createTerminal(context, ref),
                child: const Icon(Icons.terminal),
              ),
              const SizedBox(height: 12),
              FloatingActionButton(
                heroTag: 'group',
                onPressed: () => _showCreateRoomDialog(context, ref),
                child: const Icon(Icons.group_add),
              ),
            ],
          ),
        ),
      ],
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
                sessionName:
                    thread.displayName.replaceFirst('Terminal: ', ''),
              );
            },
          ),
        );
        return;
      case ChatThreadType.pi:
        Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const PiChatScreen()),
        );
        return;
      case ChatThreadType.envoyai:
      case ChatThreadType.externalAgent:
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => ChatDetailScreen(
              threadId: thread.id,
              displayName: thread.displayName,
              agentType: thread.agentType,
            ),
          ),
        );
        return;
      default:
        break;
    }

    final isRoom = thread.type == ChatThreadType.group;
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ChatDetailScreen(
          threadId: thread.id,
          displayName: thread.displayName,
          contactOwnerId: isRoom ? null : thread.contactOwnerId,
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
