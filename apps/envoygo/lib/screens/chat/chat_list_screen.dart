import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../models/chat_thread.dart';
import '../../providers/chat_provider.dart';
import '../../widgets/thread_tile.dart';
import '../terminals/terminal_detail_screen.dart';
import 'chat_detail_screen.dart';

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
                itemCount: threads.length,
                itemBuilder: (context, index) {
                  final thread = threads[index];
                  return ThreadTile(
                    thread: thread,
                    onTap: () => _openThread(context, thread),
                  );
                },
              ),
            ),
          ],
        ),
        // FAB for creating a group chat.
        Positioned(
          right: 16,
          bottom: 16,
          child: FloatingActionButton(
            onPressed: () => _showCreateRoomDialog(context, ref),
            child: const Icon(Icons.group_add),
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
