import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/contact_provider.dart';

/// Inbox — shows pending social intro proposals.
class InboxScreen extends ConsumerWidget {
  const InboxScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final contacts = ref.watch(contactProvider).bonds;

    return ListView(
      children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: Text(
            'Pending Intros',
            style: Theme.of(context).textTheme.titleMedium,
          ),
        ),
        if (contacts.isEmpty)
          const Padding(
            padding: EdgeInsets.only(top: 80),
            child: Center(
              child: Column(
                children: [
                  Icon(Icons.inbox_outlined, size: 64, color: Colors.grey),
                  SizedBox(height: 16),
                  Text('No pending introductions',
                      style: TextStyle(fontSize: 18, color: Colors.grey)),
                ],
              ),
            ),
          )
        else
          ...contacts.map((contact) => ListTile(
                leading: CircleAvatar(
                    child: Text((contact.displayName ?? '?')[0].toUpperCase())),
                title: Text(contact.displayName ?? contact.ownerId),
                subtitle: Text('Wants to connect'),
                trailing: TextButton(
                  onPressed: () {
                    // TODO: Accept/reject intro proposal
                  },
                  child: const Text('Accept'),
                ),
              )),
      ],
    );
  }
}
