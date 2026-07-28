import 'package:flutter/material.dart';
import '../models/chat_thread.dart';

/// Thread tile for the unified chat list.
class ThreadTile extends StatelessWidget {
  final ChatThread thread;
  final VoidCallback? onTap;
  final Widget? trailingAction;

  const ThreadTile({
    super.key,
    required this.thread,
    this.onTap,
    this.trailingAction,
  });

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return ListTile(
      leading: _threadIcon(thread.type),
      title: Row(
        children: [
          Expanded(
            child: Text(
              thread.displayName,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          if (thread.lastMessageAt != null)
            Text(
              _formatTime(thread.lastMessageAt!),
              style: Theme.of(context).textTheme.bodySmall,
            ),
        ],
      ),
      subtitle: thread.lastMessageText != null
          ? Text(
              thread.lastMessageText!,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            )
          : null,
      trailing: (() {
        final hasAction = trailingAction != null;
        final hasUnread = thread.unreadCount > 0;
        if (!hasAction && !hasUnread) return null;
        if (hasAction && !hasUnread) return trailingAction;
        if (!hasAction && hasUnread) {
          return Badge(
            label: Text('${thread.unreadCount}'),
            backgroundColor: colorScheme.primary,
          );
        }
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            trailingAction!,
            Badge(
              label: Text('${thread.unreadCount}'),
              backgroundColor: colorScheme.primary,
            ),
          ],
        );
      })(),
      onTap: onTap,
    );
  }

  Widget _threadIcon(ChatThreadType type) {
    switch (type) {
      case ChatThreadType.direct:
        return const CircleAvatar(child: Icon(Icons.person));
      case ChatThreadType.group:
        return const CircleAvatar(child: Icon(Icons.group));
      case ChatThreadType.envoyai:
        return const CircleAvatar(child: Icon(Icons.psychology));
      case ChatThreadType.externalAgent:
        return const CircleAvatar(child: Icon(Icons.smart_toy));
      case ChatThreadType.pi:
        return const CircleAvatar(child: Icon(Icons.code));
      case ChatThreadType.terminal:
        return const CircleAvatar(child: Icon(Icons.terminal));
    }
  }

  String _formatTime(DateTime time) {
    final now = DateTime.now();
    final diff = now.difference(time);
    if (diff.inMinutes < 60) return '${diff.inMinutes}m';
    if (diff.inHours < 24) return '${diff.inHours}h';
    if (diff.inDays < 7) return '${diff.inDays}d';
    return '${time.month}/${time.day}';
  }
}
