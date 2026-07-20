import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/feed_notification.dart';
import '../../providers/contact_provider.dart';
import '../../providers/feed_notify_provider.dart';
import '../browser/browser_screen.dart';

/// Inbox — feed.notify publish alerts + placeholder intro section.
class InboxScreen extends ConsumerWidget {
  const InboxScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final feedState = ref.watch(feedNotifyProvider);
    final contacts = ref.watch(contactProvider).bonds;
    final theme = Theme.of(context);

    return RefreshIndicator(
      onRefresh: () => ref.read(feedNotifyProvider.notifier).refresh(),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            child: Text(
              'Published updates',
              style: theme.textTheme.titleMedium,
            ),
          ),
          if (feedState.isLoading && feedState.items.isEmpty)
            const Padding(
              padding: EdgeInsets.all(24),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (feedState.error != null && feedState.items.isEmpty)
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                feedState.error!,
                style: TextStyle(color: theme.colorScheme.error),
              ),
            )
          else if (feedState.items.isEmpty)
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 8, 16, 24),
              child: Text(
                'No publish notifications yet. When a bonded contact publishes '
                'web content, it will show up here.',
                style: TextStyle(color: Colors.grey),
              ),
            )
          else
            ...feedState.items.map(
              (item) => _FeedNotifyTile(
                item: item,
                onOpen: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => BrowserScreen(initialUrl: item.url),
                    ),
                  );
                },
                onDismiss: () {
                  ref.read(feedNotifyProvider.notifier).dismiss(item.id);
                },
              ),
            ),
          const Divider(height: 32),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Text(
              'Pending intros',
              style: theme.textTheme.titleMedium,
            ),
          ),
          if (contacts.isEmpty)
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 8, 16, 48),
              child: Text(
                'No pending introductions',
                style: TextStyle(color: Colors.grey),
              ),
            )
          else
            ...contacts.map(
              (contact) => ListTile(
                leading: CircleAvatar(
                  child: Text((contact.displayName ?? '?')[0].toUpperCase()),
                ),
                title: Text(contact.displayName ?? contact.ownerId),
                subtitle: const Text('Wants to connect'),
                trailing: TextButton(
                  onPressed: () {
                    // TODO: Accept/reject intro proposal
                  },
                  child: const Text('Accept'),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _FeedNotifyTile extends StatelessWidget {
  final FeedNotification item;
  final VoidCallback onOpen;
  final VoidCallback onDismiss;

  const _FeedNotifyTile({
    required this.item,
    required this.onOpen,
    required this.onDismiss,
  });

  @override
  Widget build(BuildContext context) {
    final subtitle = item.summary?.trim().isNotEmpty == true
        ? item.summary!
        : item.publisherOwnerId;

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      child: ListTile(
        leading: Icon(
          item.kind == 'photo' || item.kind == 'gallery'
              ? Icons.photo_outlined
              : Icons.article_outlined,
        ),
        title: Text(item.title),
        subtitle: Text(
          subtitle,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        ),
        isThreeLine: item.summary?.trim().isNotEmpty == true,
        trailing: Wrap(
          spacing: 4,
          children: [
            TextButton(
              onPressed: onOpen,
              child: const Text('Open'),
            ),
            IconButton(
              tooltip: 'Dismiss',
              onPressed: onDismiss,
              icon: const Icon(Icons.close),
            ),
          ],
        ),
      ),
    );
  }
}
