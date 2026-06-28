import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/chat_thread.dart';
import '../models/peer_connection_info.dart';
import '../providers/contact_reachability_provider.dart';
import '../utils/contact_reachability_label.dart';
import '../widgets/contact_reachability_badge.dart';

/// Thread tile for the unified chat list.
class ThreadTile extends ConsumerWidget {
  final ChatThread thread;
  final VoidCallback? onTap;

  const ThreadTile({
    super.key,
    required this.thread,
    this.onTap,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colorScheme = Theme.of(context).colorScheme;
    final reachability = ref.watch(contactReachabilityProvider);
    final isDirect = thread.type == ChatThreadType.direct;
    final ownerId = thread.contactOwnerId;
    final info = isDirect && ownerId != null
        ? reachability.infoFor(ownerId)
        : null;
    final checking = isDirect &&
        ownerId != null &&
        reachability.isChecking(ownerId);

    return ListTile(
      leading: Stack(
        clipBehavior: Clip.none,
        children: [
          _threadIcon(thread.type),
          if (isDirect && ownerId != null)
            Positioned(
              right: -1,
              bottom: -1,
              child: ContactReachabilityBadge(
                info: info,
                checking: checking,
                compact: true,
              ),
            ),
        ],
      ),
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
      subtitle: _buildSubtitle(context, info, checking),
      trailing: thread.unreadCount > 0
          ? Badge(
              label: Text('${thread.unreadCount}'),
              backgroundColor: colorScheme.primary,
            )
          : null,
      onTap: onTap,
    );
  }

  Widget? _buildSubtitle(
    BuildContext context,
    PeerConnectionInfo? info,
    bool checking,
  ) {
    final preview = thread.lastMessageText;
    final isDirect = thread.type == ChatThreadType.direct;

    if (isDirect && thread.contactOwnerId != null) {
      final status = contactReachabilityLabel(info, checking: checking);
      if (preview != null && preview.isNotEmpty) {
        return Text(
          '$status · $preview',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        );
      }
      return Text(
        status,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      );
    }

    if (preview == null || preview.isEmpty) return null;
    return Text(
      preview,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
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
