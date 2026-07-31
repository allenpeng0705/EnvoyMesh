import 'package:flutter/material.dart';
import '../models/chat_thread.dart';
import 'profile_avatar.dart';

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

  static const double _avatarRadius = 20;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return ListTile(
      leading: _threadLeading(thread),
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
      subtitle: () {
        // AI bots: never show last-message preview (model noise like <think>…).
        final preview = thread.type == ChatThreadType.aiBot
            ? null
            : thread.lastMessageText?.trim();
        final bio = thread.description?.trim();
        final text = (preview != null && preview.isNotEmpty)
            ? preview
            : (bio != null && bio.isNotEmpty ? bio : null);
        if (text == null) return null;
        return Text(
          text,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        );
      }(),
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

  Widget _threadLeading(ChatThread thread) {
    switch (thread.type) {
      case ChatThreadType.envoyai:
        return ClipOval(
          child: Image.asset(
            'assets/logo.png',
            width: _avatarRadius * 2,
            height: _avatarRadius * 2,
            fit: BoxFit.cover,
            filterQuality: FilterQuality.medium,
          ),
        );
      case ChatThreadType.direct:
        return ProfileAvatar(
          ownerId: thread.contactOwnerId,
          displayName: thread.displayName,
          radius: _avatarRadius,
          fallbackIcon: Icons.person,
        );
      case ChatThreadType.family:
        return CircleAvatar(
          radius: _avatarRadius,
          backgroundColor: _parseBotColor(thread.avatarColor),
          child: Text(
            _botInitial(thread.displayName),
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w700,
            ),
          ),
        );
      case ChatThreadType.group:
      case ChatThreadType.familyGroup:
        return const CircleAvatar(
          radius: _avatarRadius,
          child: Icon(Icons.group),
        );
      case ChatThreadType.externalAgent:
        return const CircleAvatar(
          radius: _avatarRadius,
          child: Icon(Icons.smart_toy),
        );
      case ChatThreadType.aiBot:
        return CircleAvatar(
          radius: _avatarRadius,
          backgroundColor: _parseBotColor(thread.avatarColor),
          child: Text(
            _botInitial(thread.displayName),
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w700,
            ),
          ),
        );
      case ChatThreadType.pi:
        return const CircleAvatar(
          radius: _avatarRadius,
          child: Icon(Icons.code),
        );
      case ChatThreadType.terminal:
        return const CircleAvatar(
          radius: _avatarRadius,
          child: Icon(Icons.terminal),
        );
    }
  }

  static Color _parseBotColor(String? hex) {
    if (hex == null || hex.isEmpty) return const Color(0xFF6366F1);
    final cleaned = hex.replaceFirst('#', '').trim();
    if (cleaned.length != 6) return const Color(0xFF6366F1);
    try {
      return Color(int.parse('FF$cleaned', radix: 16));
    } catch (_) {
      return const Color(0xFF6366F1);
    }
  }

  static String _botInitial(String name) {
    final trimmed = name.trim();
    if (trimmed.isEmpty) return '?';
    return trimmed[0].toUpperCase();
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
